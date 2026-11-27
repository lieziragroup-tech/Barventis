import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../db/pool.js';
import { asyncHandler, HttpError } from '../../utils/asyncHandler.js';
import { requireAuth, requireRole, withTenant, isAdminRole } from '../../middleware/auth.js';
import { FIELD_ROLES } from '../../types.js';
import { logAction } from '../../utils/audit.js';
import { isValidCoordinate } from '../../utils/geo.js';
import { uuidParam } from '../../utils/validate.js';

export const projectRouter = Router();
projectRouter.use(requireAuth, withTenant);
projectRouter.param('id', uuidParam);

const SERVICE_TYPES = [
  'GENERAL_PEST_CONTROL',
  'TERMITE_CONTROL',
  'FUMIGATION',
] as const;

const createProjectSchema = z.object({
  projectName: z.string().min(3, 'Nama proyek minimal 3 karakter.'),
  clientName: z.string().optional().default(''),
  address: z.string().min(5, 'Alamat wajib diisi.'),
  // Koordinat dari MapPicker/GPS. Sebelumnya field ini dibuang oleh Zod dan proyek selalu tersimpan di (0,0).
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radius: z.number().int().min(20).max(2000).default(100),
  workDate: z.string().min(1, 'Tanggal kerja wajib diisi.'),
  workType: z.string().optional().default(''),
  serviceType: z.enum(SERVICE_TYPES).default('GENERAL_PEST_CONTROL'),
  focusTarget: z.string().optional(),
  targetFocus: z.array(z.string()).default([]),
  buildingAreaSqm: z.number().min(0).optional(),
  contractType: z.enum(['ONE_TIME', 'RECURRING']).default('ONE_TIME'),
  warrantyMonths: z.number().int().min(0).max(120).default(0),
  nextServiceDate: z.string().optional(),
  scheduledStartTime: z.string().regex(/^\d{2}:\d{2}$/).default('08:00'),
  notes: z.string().optional(),
});

function mapProject(row: any) {
  return {
    id: row.id,
    projectName: row.project_name,
    clientName: row.client_name,
    address: row.address,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    radius: row.radius,
    workDate: row.work_date,
    workType: row.work_type,
    serviceType: row.service_type,
    focusTarget: row.focus_target,
    targetFocus: typeof row.target_focus === 'string' ? JSON.parse(row.target_focus) : (row.target_focus || []),
    buildingAreaSqm: row.building_area_sqm !== null ? Number(row.building_area_sqm) : null,
    contractType: row.contract_type,
    warrantyMonths: row.warranty_months,
    nextServiceDate: row.next_service_date,
    scheduledStartTime: row.scheduled_start_time,
    notes: row.notes,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    lockedAt: row.locked_at,
  };
}

// PRD 8: Pelaksana creates their own project. Admin can view all (see admin routes).
projectRouter.post(
  '/',
  requireRole(...FIELD_ROLES),
  asyncHandler(async (req, res) => {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors[0]?.message ?? 'Data proyek tidak valid.');
    }
    const d = parsed.data;

    if (d.contractType === 'RECURRING' && !d.nextServiceDate) {
      throw new HttpError(400, 'Kontrak berkala memerlukan tanggal layanan berikutnya.');
    }

    // Koordinat opsional, tapi harus berpasangan & valid. Tanpa koordinat → (0,0) dan check-in
    // pertama akan menjadi jangkar lokasi (lihat workReportRoutes).
    if ((d.latitude === undefined) !== (d.longitude === undefined)) {
      throw new HttpError(400, 'Latitude dan longitude harus diisi berpasangan.');
    }
    if (d.latitude !== undefined && !isValidCoordinate(d.latitude, d.longitude)) {
      throw new HttpError(400, 'Koordinat proyek tidak valid.');
    }
    const initialLatitude = d.latitude ?? 0;
    const initialLongitude = d.longitude ?? 0;

    // Proyek + laporan READY dibuat atomik: tidak boleh ada proyek tanpa laporan (atau sebaliknya).
    const { project, reportId } = await withTransaction(async client => {
      const rows = await client.query(
        `insert into projects (
          project_name, client_name, address, latitude, longitude, radius, work_date, work_type,
          service_type, focus_target, target_focus, building_area_sqm, contract_type, warranty_months, next_service_date,
          scheduled_start_time, notes, created_by, company_id
        )
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning *`,
        [
          d.projectName.trim(), d.clientName?.trim() || '', d.address.trim(), initialLatitude, initialLongitude, d.radius, d.workDate, d.workType?.trim() || '',
          d.serviceType, d.focusTarget?.trim() || null, JSON.stringify(d.targetFocus), d.buildingAreaSqm ?? null, d.contractType, d.warrantyMonths, d.nextServiceDate || null,
          d.scheduledStartTime, d.notes?.trim() || null, req.user!.id, req.user!.companyId,
        ]
      );
      const row = rows.rows[0];
      // Auto-create the READY work report for this project (PRD Section 8).
      const report = await client.query(
        `insert into work_reports (project_id, executor_id, status, company_id) values ($1,$2,'READY',$3) returning id`,
        [row.id, req.user!.id, req.user!.companyId]
      );
      return { project: row, reportId: report.rows[0].id as string };
    });

    await logAction(req.user!, 'CREATE_PROJECT', 'project', project.id, `Membuat proyek "${project.project_name}" (${project.service_type}, radius ${project.radius}m).`);

    res.status(201).json({ project: mapProject({ ...project, created_by_name: req.user!.name }), workReportId: reportId });
  })
);

projectRouter.get(
  '/mine',
  requireRole(...FIELD_ROLES),
  asyncHandler(async (req, res) => {
    const rows = await query(
      `select p.*, u.name as created_by_name from projects p
       left join users u on u.id = p.created_by
       where p.created_by = $1 and p.company_id = $2
       order by p.created_at desc`,
      [req.user!.id, req.user!.companyId]
    );
    res.json({ projects: rows.map(mapProject) });
  })
);

projectRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const rows = await query(
      `select p.*, u.name as created_by_name from projects p
       left join users u on u.id = p.created_by
       where p.id = $1 and p.company_id = $2`,
      [req.params.id, req.user!.companyId]
    );
    const project = rows[0];
    if (!project) throw new HttpError(404, 'Proyek tidak ditemukan.');
    if (!isAdminRole(req.user!.role) && project.created_by !== req.user!.id) {
      throw new HttpError(403, 'Anda hanya dapat melihat proyek milik sendiri.');
    }
    res.json({ project: mapProject(project) });
  })
);
