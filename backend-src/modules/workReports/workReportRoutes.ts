import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { query, withTransaction } from '../../db/pool.js';
import { asyncHandler, HttpError } from '../../utils/asyncHandler.js';
import { requireAuth, requireRole, withTenant } from '../../middleware/auth.js';
import { ADMIN_ROLES, FIELD_ROLES } from '../../types.js';
import { logAction } from '../../utils/audit.js';
import { isWithinRadius, isValidCoordinate } from '../../utils/geo.js';
import { savePhoto, deletePhoto } from '../photos/storage.js';
import { evaluateWorkReportRisk } from '../risk/riskEngine.js';
import { getRiskConfig } from '../risk/riskConfigRepository.js';
import { getReportOrThrow, assertOwnerOrAdmin, mapReportFull, mapReportsBatch } from './reportMapper.js';
import { uuidParam } from '../../utils/validate.js';

export const workReportRouter = Router();
workReportRouter.use(requireAuth, withTenant);
workReportRouter.param('id', uuidParam);

const maxSizeMb = 8;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new HttpError(400, 'File yang diunggah harus berupa gambar.') as any);
      return;
    }
    cb(null, true);
  },
});

const evidenceSchema = z.object({
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  accuracy: z.coerce.number().min(0),
  notes: z.string().optional(),
  photoTag: z.enum(['BEFORE', 'AFTER']).optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerFeedback: z.string().optional(),
  customerSignature: z.string().optional(),
  // Replay antrean offline: waktu aksi yang sebenarnya terjadi di perangkat (ISO-8601).
  // Hanya dipakai jika offlineReplay === 'true' dan lolos batas validasi (lihat resolveEventTime).
  capturedAt: z.string().optional(),
  offlineReplay: z.enum(['true', 'false']).optional(),
});

/** Batas usia aksi offline yang masih diterima (jam). Lewat dari ini, waktu server yang dipakai. */
const MAX_OFFLINE_AGE_MS = 24 * 3600_000;

/**
 * Menentukan waktu resmi suatu aksi (check-in / foto / check-out).
 *
 * Aturan 6 (waktu server adalah waktu resmi) tetap menjadi default. Pengecualian HANYA
 * untuk replay antrean offline: tanpa pengecualian ini, aksi yang dilakukan jam 08:00 lalu
 * disinkronkan jam 11:05 akan tercatat check-in & check-out pada menit yang sama →
 * durasi ≈ 0 dan SELURUH pekerjaan offline otomatis ditandai anomali.
 *
 * Pengaman: waktu klien tidak boleh di masa depan (toleransi 2 menit), tidak boleh lebih tua
 * dari MAX_OFFLINE_AGE_MS, dan tidak boleh lebih awal dari aksi sebelumnya (`notBefore`).
 * Aksi yang memakai waktu klien selalu ditandai di metadata foto dan audit log.
 */
export function resolveEventTime(
  raw: { capturedAt?: string; offlineReplay?: string },
  serverNow: Date,
  notBefore?: Date | null
): { at: Date; offline: boolean } {
  if (raw.offlineReplay !== 'true' || !raw.capturedAt) return { at: serverNow, offline: false };
  const t = new Date(raw.capturedAt);
  if (Number.isNaN(t.getTime())) return { at: serverNow, offline: false };
  const ageMs = serverNow.getTime() - t.getTime();
  if (ageMs < -2 * 60_000 || ageMs > MAX_OFFLINE_AGE_MS) return { at: serverNow, offline: false };
  let at = t;
  if (at.getTime() > serverNow.getTime()) at = serverNow;
  if (notBefore && at.getTime() < notBefore.getTime()) at = notBefore;
  return { at, offline: true };
}

function mapTreatmentForRisk(t: any) {
  if (!t) return null;
  return {
    applicationMethod: t.application_method,
    chemicalName: t.chemical_name,
    activeIngredient: t.active_ingredient,
    dosage: t.dosage,
    treatmentAreaSqm: t.treatment_area_sqm,
    drillingPointsCount: t.drilling_points_count,
    fumigantType: t.fumigant_type,
    gasConcentrationPpm: t.gas_concentration_ppm,
    sealingStartedAt: t.sealing_started_at,
    aerationCompletedAt: t.aeration_completed_at,
    safetyNotes: t.safety_notes,
    technicianNotes: t.technician_notes,
  };
}

const REPORT_JOIN_SELECT = `
  wr.*, p.project_name, p.client_name, p.address as project_address, p.latitude as project_latitude,
  p.longitude as project_longitude, p.radius as project_radius, p.scheduled_start_time,
  p.service_type, p.focus_target, p.target_focus, p.building_area_sqm, p.contract_type, p.warranty_months, p.next_service_date,
  u.name as executor_name, u.email as executor_email
`;

workReportRouter.get(
  '/mine',
  requireRole(...FIELD_ROLES),
  asyncHandler(async (req, res) => {
    // Paginasi: default 100 laporan terbaru, maks 200 per halaman (?limit=&offset=).
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const rows = await query(
      `select ${REPORT_JOIN_SELECT}
       from work_reports wr
       join projects p on p.id = wr.project_id
       left join users u on u.id = wr.executor_id
       where wr.executor_id = $1 and wr.company_id = $2
       order by wr.created_at desc
       limit $3 offset $4`,
      [req.user!.id, req.user!.companyId, limit, offset]
    );
    res.json({ workReports: await mapReportsBatch(rows, req.user!.role), limit, offset });
  })
);

workReportRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const report = await getReportOrThrow(req.params.id, req.user!.companyId!);
    assertOwnerOrAdmin(req.user!, report);
    res.json({ workReport: await mapReportFull(report, req.user!.role) });
  })
);

// PRD Section 10–15: Check-in — GPS + timestamp + mandatory camera photo.
workReportRouter.post(
  '/:id/check-in',
  requireRole(...FIELD_ROLES),
  upload.single('photo') as any,
  asyncHandler(async (req, res) => {
    const parsed = evidenceSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.errors[0]?.message ?? 'Data lokasi tidak valid.');
    if (!req.file) throw new HttpError(400, 'Foto check-in wajib diambil melalui kamera.');
    if (!isValidCoordinate(parsed.data.latitude, parsed.data.longitude)) {
      throw new HttpError(400, 'Koordinat GPS tidak valid.');
    }

    const report = await getReportOrThrow(req.params.id, req.user!.companyId!);
    assertOwnerOrAdmin(req.user!, report);
    if (report.status !== 'READY' && report.status !== 'DRAFT') {
      throw new HttpError(409, `Laporan berstatus ${report.status} — check-in hanya dapat dilakukan sekali.`);
    }

    const serverNow = new Date();
    const { at: eventAt, offline } = resolveEventTime(parsed.data, serverNow);

    // Jarak dihitung DETERMINISTIK (Haversine) terhadap koordinat proyek yang tersimpan.
    // Sebelumnya: koordinat proyek ditimpa dengan GPS teknisi sendiri saat check-in, sehingga
    // jarak selalu 0 dan pelanggaran radius tidak pernah terdeteksi.
    // Hanya bila proyek BELUM punya koordinat (0,0 = dibuat tanpa pin peta), check-in pertama
    // menjadi titik jangkar — dan itu dicatat di audit log supaya admin tahu.
    const projectLat = Number(report.project_latitude);
    const projectLng = Number(report.project_longitude);
    const projectHasAnchor = !(projectLat === 0 && projectLng === 0);
    const geo = projectHasAnchor
      ? isWithinRadius(
          { latitude: parsed.data.latitude, longitude: parsed.data.longitude },
          { latitude: projectLat, longitude: projectLng },
          report.project_radius,
          parsed.data.accuracy
        )
      : { isWithin: true, distance: 0 };

    const storagePath = await savePhoto(req.file.buffer, 'jpg');

    let photoId: string;
    try {
      photoId = await withTransaction(async client => {
        // Kunci baris laporan + validasi ulang status di dalam transaksi: mencegah dua
        // check-in bersamaan (mis. replay antrean offline + tap ulang) lolos keduanya.
        const locked = await client.query('select status from work_reports where id = $1 for update', [report.id]);
        const st = locked.rows[0]?.status;
        if (st !== 'READY' && st !== 'DRAFT') {
          throw new HttpError(409, `Laporan berstatus ${st} — check-in hanya dapat dilakukan sekali.`);
        }

        if (!projectHasAnchor) {
          await client.query('update projects set latitude = $1, longitude = $2 where id = $3', [
            parsed.data.latitude, parsed.data.longitude, report.project_id,
          ]);
        }

        await client.query(
          `update work_reports set status = 'WORKING', check_in_at = $1, check_in_latitude = $2, check_in_longitude = $3,
            check_in_accuracy = $4, check_in_distance = $5, check_in_valid = $6, notes = coalesce($7, notes)
           where id = $8`,
          [eventAt.toISOString(), parsed.data.latitude, parsed.data.longitude, parsed.data.accuracy, geo.distance, geo.isWithin, parsed.data.notes ?? null, report.id]
        );
        // Project lock (PRD Section 9)
        await client.query('update projects set locked_at = coalesce(locked_at, now()) where id = $1', [report.project_id]);

        const photo = await client.query(
          `insert into documentation_photos (work_report_id, photo_type, storage_path, latitude, longitude, accuracy, distance_to_project, is_within_radius, captured_at, metadata)
           values ($1,'CHECK_IN',$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
          [report.id, storagePath, parsed.data.latitude, parsed.data.longitude, parsed.data.accuracy, geo.distance, geo.isWithin, eventAt.toISOString(),
            JSON.stringify({ projectName: report.project_name, executorName: req.user!.name, offlineSync: offline, serverReceivedAt: serverNow.toISOString() })]
        );
        return photo.rows[0].id as string;
      });
    } catch (err) {
      await deletePhoto(storagePath); // jangan tinggalkan file yatim bila transaksi gagal
      throw err;
    }

    await logAction(
      req.user!,
      'CHECK_IN',
      'work_report',
      report.id,
      `Check-in ${geo.isWithin ? 'valid' : 'DI LUAR RADIUS'} — jarak ${geo.distance}m, akurasi ±${Math.round(parsed.data.accuracy)}m.` +
        (projectHasAnchor ? '' : ' Proyek belum memiliki koordinat: titik check-in pertama dijadikan jangkar lokasi proyek.') +
        (offline ? ` Aksi offline disinkronkan (waktu perangkat ${eventAt.toISOString()}, diterima server ${serverNow.toISOString()}).` : '')
    );

    const updated = await getReportOrThrow(report.id, req.user!.companyId!);
    res.status(201).json({ workReport: await mapReportFull(updated, req.user!.role), photoId });
  })
);

// PRD Section 16: progress documentation while WORKING. Optionally tagged
// BEFORE/AFTER so the gallery can show the infestation and the treated
// result side by side — a pest control client cares about this more than
// generic "progress" photos.
workReportRouter.post(
  '/:id/photos',
  requireRole(...FIELD_ROLES),
  upload.single('photo') as any,
  asyncHandler(async (req, res) => {
    const parsed = evidenceSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.errors[0]?.message ?? 'Data lokasi tidak valid.');
    if (!req.file) throw new HttpError(400, 'Foto wajib diambil melalui kamera.');
    if (!isValidCoordinate(parsed.data.latitude, parsed.data.longitude)) {
      throw new HttpError(400, 'Koordinat GPS tidak valid.');
    }

    const report = await getReportOrThrow(req.params.id, req.user!.companyId!);
    assertOwnerOrAdmin(req.user!, report);
    if (report.status !== 'WORKING') {
      throw new HttpError(409, 'Dokumentasi progres hanya dapat ditambahkan saat status pekerjaan berlangsung.');
    }

    const serverNow = new Date();
    const { at: eventAt, offline } = resolveEventTime(
      parsed.data, serverNow, report.check_in_at ? new Date(report.check_in_at) : null
    );
    const geo = isWithinRadius(
      { latitude: parsed.data.latitude, longitude: parsed.data.longitude },
      { latitude: Number(report.project_latitude), longitude: Number(report.project_longitude) },
      report.project_radius,
      parsed.data.accuracy
    );
    const storagePath = await savePhoto(req.file.buffer, 'jpg');

    await query(
      `insert into documentation_photos (work_report_id, photo_type, photo_tag, storage_path, latitude, longitude, accuracy, distance_to_project, is_within_radius, captured_at, metadata)
       values ($1,'PROGRESS',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [report.id, parsed.data.photoTag ?? null, storagePath, parsed.data.latitude, parsed.data.longitude, parsed.data.accuracy, geo.distance, geo.isWithin, eventAt.toISOString(),
        JSON.stringify({ projectName: report.project_name, executorName: req.user!.name, caption: parsed.data.notes ?? null, offlineSync: offline, serverReceivedAt: serverNow.toISOString() })]
    );
    await query(`update work_reports set updated_at = now() where id = $1`, [report.id]);

    await logAction(req.user!, 'CAPTURE_PROGRESS_PHOTO', 'work_report', report.id, `Dokumentasi progres${parsed.data.photoTag ? ` (${parsed.data.photoTag})` : ''} ditambahkan pada ${report.project_name}.`);

    const updated = await getReportOrThrow(report.id, req.user!.companyId!);
    res.status(201).json({ workReport: await mapReportFull(updated, req.user!.role) });
  })
);

const applicationMethods = ['SPRAYING', 'BAITING', 'DRILLING', 'TRENCHING', 'FOGGING', 'MISTING', 'DUSTING', 'GEL_INJECTION'] as const;

const treatmentSchema = z.object({
  applicationMethod: z.enum(applicationMethods),
  chemicalName: z.string().min(2, 'Nama bahan/produk wajib diisi.'),
  activeIngredient: z.string().optional(),
  dosage: z.string().min(1, 'Dosis/konsentrasi wajib diisi.'),
  treatmentAreaSqm: z.coerce.number().min(0).optional(),
  drillingPointsCount: z.coerce.number().int().min(0).optional(),
  fumigantType: z.string().optional(),
  gasConcentrationPpm: z.coerce.number().min(0).optional(),
  sealingStartedAt: z.string().optional(),
  aerationCompletedAt: z.string().optional(),
  safetyNotes: z.string().optional(),
  technicianNotes: z.string().optional(),
});

// Treatment form: what was actually applied. Separate from photo evidence
// because this is structured operational data (chemical, dosage, method),
// not a GPS-stamped snapshot — but it feeds directly into the risk engine
// at check-out (PRD-style extension for pest control compliance).
workReportRouter.put(
  '/:id/treatment',
  requireRole(...FIELD_ROLES),
  asyncHandler(async (req, res) => {
    const parsed = treatmentSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.errors[0]?.message ?? 'Data treatment tidak valid.');

    const report = await getReportOrThrow(req.params.id, req.user!.companyId!);
    assertOwnerOrAdmin(req.user!, report);
    if (report.status !== 'WORKING') {
      throw new HttpError(409, 'Data treatment hanya dapat diisi selama pekerjaan berlangsung.');
    }

    const d = parsed.data;
    await query(
      `insert into treatment_records (
        work_report_id, application_method, chemical_name, active_ingredient, dosage, treatment_area_sqm,
        drilling_points_count, fumigant_type, gas_concentration_ppm, sealing_started_at, aeration_completed_at,
        safety_notes, technician_notes
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      on conflict (work_report_id) do update set
        application_method = excluded.application_method,
        chemical_name = excluded.chemical_name,
        active_ingredient = excluded.active_ingredient,
        dosage = excluded.dosage,
        treatment_area_sqm = excluded.treatment_area_sqm,
        drilling_points_count = excluded.drilling_points_count,
        fumigant_type = excluded.fumigant_type,
        gas_concentration_ppm = excluded.gas_concentration_ppm,
        sealing_started_at = excluded.sealing_started_at,
        aeration_completed_at = excluded.aeration_completed_at,
        safety_notes = excluded.safety_notes,
        technician_notes = excluded.technician_notes,
        updated_at = now()`,
      [
        report.id, d.applicationMethod, d.chemicalName.trim(), d.activeIngredient?.trim() || null, d.dosage.trim(), d.treatmentAreaSqm ?? null,
        d.drillingPointsCount ?? null, d.fumigantType?.trim() || null, d.gasConcentrationPpm ?? null, d.sealingStartedAt || null, d.aerationCompletedAt || null,
        d.safetyNotes?.trim() || null, d.technicianNotes?.trim() || null,
      ]
    );

    await logAction(req.user!, 'SUBMIT_TREATMENT', 'work_report', report.id, `Data perlakuan (${d.applicationMethod}) dicatat: ${d.chemicalName}, dosis ${d.dosage}.`);

    const updated = await getReportOrThrow(report.id, req.user!.companyId!);
    res.json({ workReport: await mapReportFull(updated, req.user!.role) });
  })
);

// PRD Section 17–18, 22: check-out — runs the risk engine and may flag the report.
//
// Seluruh langkah (simpan data check-out, foto, evaluasi risiko, status akhir) berjalan dalam
// SATU transaksi dengan row-lock. Sebelumnya terbagi 3 transaksi terpisah: bila langkah
// belakang gagal, laporan terjebak di WORKING dengan check_out_at terisi, dan percobaan
// ulang menambah foto CHECK_OUT ganda.
workReportRouter.post(
  '/:id/check-out',
  requireRole(...FIELD_ROLES),
  upload.single('photo') as any,
  asyncHandler(async (req, res) => {
    const parsed = evidenceSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.errors[0]?.message ?? 'Data lokasi tidak valid.');
    if (!req.file) throw new HttpError(400, 'Foto check-out wajib diambil melalui kamera.');
    if (!isValidCoordinate(parsed.data.latitude, parsed.data.longitude)) {
      throw new HttpError(400, 'Koordinat GPS tidak valid.');
    }

    const report = await getReportOrThrow(req.params.id, req.user!.companyId!);
    assertOwnerOrAdmin(req.user!, report);
    if (report.status !== 'WORKING') {
      throw new HttpError(409, 'Check-out hanya dapat dilakukan setelah check-in dan saat pekerjaan berlangsung.');
    }

    const serverNow = new Date();
    const checkInAt = new Date(report.check_in_at);
    const { at: eventAt, offline } = resolveEventTime(parsed.data, serverNow, checkInAt);
    const geo = isWithinRadius(
      { latitude: parsed.data.latitude, longitude: parsed.data.longitude },
      { latitude: Number(report.project_latitude), longitude: Number(report.project_longitude) },
      report.project_radius,
      parsed.data.accuracy
    );
    const durationSeconds = Math.max(0, Math.round((eventAt.getTime() - checkInAt.getTime()) / 1000));
    const config = await getRiskConfig(req.user!.companyId!);
    const storagePath = await savePhoto(req.file.buffer, 'jpg');

    let evaluation: ReturnType<typeof evaluateWorkReportRisk>;
    let finalStatus: 'FLAGGED' | 'COMPLETED';
    try {
      const outcome = await withTransaction(async client => {
        const locked = await client.query('select status from work_reports where id = $1 for update', [report.id]);
        if (locked.rows[0]?.status !== 'WORKING') {
          throw new HttpError(409, 'Check-out hanya dapat dilakukan setelah check-in dan saat pekerjaan berlangsung.');
        }

        await client.query(
          `update work_reports set check_out_at = $1, check_out_latitude = $2, check_out_longitude = $3, check_out_accuracy = $4,
            check_out_distance = $5, check_out_valid = $6, duration_seconds = $7, notes = coalesce($8, notes),
            customer_name = coalesce($9, customer_name), customer_phone = coalesce($10, customer_phone),
            customer_feedback = coalesce($11, customer_feedback), customer_signature = coalesce($12, customer_signature)
           where id = $13`,
          [eventAt.toISOString(), parsed.data.latitude, parsed.data.longitude, parsed.data.accuracy, geo.distance, geo.isWithin, durationSeconds, parsed.data.notes ?? null, parsed.data.customerName ?? null, parsed.data.customerPhone ?? null, parsed.data.customerFeedback ?? null, parsed.data.customerSignature ?? null, report.id]
        );
        await client.query(
          `insert into documentation_photos (work_report_id, photo_type, storage_path, latitude, longitude, accuracy, distance_to_project, is_within_radius, captured_at, metadata)
           values ($1,'CHECK_OUT',$2,$3,$4,$5,$6,$7,$8,$9)`,
          [report.id, storagePath, parsed.data.latitude, parsed.data.longitude, parsed.data.accuracy, geo.distance, geo.isWithin, eventAt.toISOString(),
            JSON.stringify({ projectName: report.project_name, executorName: req.user!.name, offlineSync: offline, serverReceivedAt: serverNow.toISOString() })]
        );

        // Risk engine dijalankan server-side terhadap laporan yang kini lengkap (PRD 22, 51).
        const photos = await client.query('select photo_type from documentation_photos where work_report_id = $1', [report.id]);
        const treatmentRows = await client.query('select * from treatment_records where work_report_id = $1', [report.id]);

        const ev = evaluateWorkReportRisk(
          {
            scheduledStartTime: report.scheduled_start_time,
            checkInAt: report.check_in_at,
            checkOutAt: eventAt.toISOString(),
            checkInLatitude: report.check_in_latitude,
            checkInLongitude: report.check_in_longitude,
            checkOutLatitude: parsed.data.latitude,
            checkOutLongitude: parsed.data.longitude,
            checkInDistance: report.check_in_distance,
            checkOutDistance: geo.distance,
            projectRadius: report.project_radius,
            photos: photos.rows.map((p: { photo_type: string }) => ({ photoType: p.photo_type as any })),
            serviceType: report.service_type,
            treatmentRecord: mapTreatmentForRisk(treatmentRows.rows[0]),
          },
          config
        );
        const status: 'FLAGGED' | 'COMPLETED' = ev.isFlagged ? 'FLAGGED' : 'COMPLETED';

        await client.query('update work_reports set status = $1, risk_score = $2, risk_level = $3 where id = $4', [
          status, ev.score, ev.level, report.id,
        ]);
        for (const e of ev.events) {
          await client.query(
            `insert into risk_events (work_report_id, event_type, points, severity, title, description, expected_value, actual_value)
             values ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [report.id, e.eventType, e.points, e.severity, e.title, e.description, e.expectedValue ?? null, e.actualValue ?? null]
          );
        }
        return { ev, status };
      });
      evaluation = outcome.ev;
      finalStatus = outcome.status;
    } catch (err) {
      await deletePhoto(storagePath);
      throw err;
    }

    await logAction(
      req.user!,
      'CHECK_OUT',
      'work_report',
      report.id,
      `Check-out selesai. Durasi ${Math.round(durationSeconds / 60)} menit. Status: ${finalStatus} (risk ${evaluation.score}).` +
        (offline ? ` Aksi offline disinkronkan (waktu perangkat ${eventAt.toISOString()}, diterima server ${serverNow.toISOString()}).` : '')
    );
    if (evaluation.isFlagged) {
      await logAction(req.user!, 'FLAG_REPORT', 'work_report', report.id, `Anomali terdeteksi: ${evaluation.events.map(e => e.title).join(', ')}.`);
    }

    const updated = await getReportOrThrow(report.id, req.user!.companyId!);
    res.json({ workReport: await mapReportFull(updated, req.user!.role) });
  })
);

// Admin review of a flagged report (PRD Section 27).
workReportRouter.post(
  '/:id/review',
  requireRole(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const notes = z.string().min(1, 'Catatan tinjauan wajib diisi.').safeParse(req.body?.notes);
    if (!notes.success) throw new HttpError(400, notes.error.errors[0]?.message ?? 'Catatan tidak valid.');

    const report = await getReportOrThrow(req.params.id, req.user!.companyId!);
    // Hanya laporan yang sudah selesai dikerjakan yang boleh ditinjau. Sebelumnya tombol review
    // bisa melompati status READY/WORKING langsung ke REVIEWED, dan menimpa tinjauan sebelumnya.
    if (report.status !== 'COMPLETED' && report.status !== 'FLAGGED') {
      throw new HttpError(409, report.status === 'REVIEWED'
        ? 'Laporan ini sudah ditinjau.'
        : `Laporan berstatus ${report.status} — hanya laporan COMPLETED atau FLAGGED yang dapat ditinjau.`);
    }
    const updatedRows = await query(
      `update work_reports set status = 'REVIEWED', reviewed_by = $1, reviewed_at = now(), review_notes = $2
       where id = $3 and status in ('COMPLETED','FLAGGED') returning id`,
      [req.user!.id, notes.data, report.id]
    );
    if (updatedRows.length === 0) throw new HttpError(409, 'Status laporan berubah saat diproses. Muat ulang lalu coba lagi.');
    await logAction(req.user!, 'REVIEW_REPORT', 'work_report', report.id, `Admin meninjau laporan: "${notes.data}"`);

    const updated = await getReportOrThrow(report.id, req.user!.companyId!);
    res.json({ workReport: await mapReportFull(updated, req.user!.role) });
  })
);
