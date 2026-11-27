import { supabase } from '@/shared/lib/supabase';
import { useAuthStore } from '@/app/store/authStore';
import { calculateDistanceMeters, isWithinRadius } from '@/shared/utils/geo';
import { syncCompanyProjectsAndReports } from './projects';
import {
  ApplicationMethod,
  ContractType,
  DocumentationPhoto,
  PhotoTag,
  PhotoType,
  RiskEvent,
  RiskLevel,
  ServiceType,
  TreatmentRecord,
  WorkReport,
  WorkReportStatus,
} from '@/entities/types';

export const MAX_PHOTOS_PER_REPORT = 6;
export const MAX_PROGRESS_PHOTOS_PER_REPORT = 4;

export interface EvidencePayload {
  photoBlob: Blob;
  capturedAt?: string;
  offlineReplay?: boolean;
  latitude: number;
  longitude: number;
  accuracy: number;
  notes?: string;
  photoTag?: PhotoTag;
  customerName?: string;
  customerPhone?: string;
  customerFeedback?: string;
  customerSignature?: string;
  technicianSignature?: string;
}

export interface TeamMemberEntry {
  id?: string;
  name: string;
  role?: string;
  isManual?: boolean;
}

export interface TreatmentInput {
  applicationMethod: ApplicationMethod;
  chemicalName: string;
  teamMembers?: TeamMemberEntry[];
  activeIngredient?: string;
  dosage: string;
  treatmentAreaSqm?: number;
  drillingPointsCount?: number;
  fumigantType?: string;
  gasConcentrationPpm?: number;
  sealingStartedAt?: string;
  aerationCompletedAt?: string;
  safetyNotes?: string;
  technicianNotes?: string;
}

/**
 * Kompresi foto dokumentasi di sisi klien (Canvas -> WebP / JPEG q=0.62, maks lebar 960px)
 * Memangkas ukuran foto dari ~1.5-3 MB menjadi ~35-65 KB (hemat ~95% Database Storage & Egress Supabase Free Tier).
 */
async function compressBlobToDataUrl(blob: Blob, maxWidth = 960, quality = 0.62): Promise<string> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return blobToDataUrl(blob);
  }
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
    const targetW = Math.max(1, Math.round(bitmap.width * scale));
    const targetH = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return blobToDataUrl(blob);
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    // Utamakan WebP (lebih kecil 25-35% dari JPEG), fallback ke JPEG jika browser tidak mendukung
    const webpUrl = canvas.toDataURL('image/webp', quality);
    if (webpUrl.startsWith('data:image/webp')) {
      return webpUrl;
    }
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return blobToDataUrl(blob);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function mapDbWorkReportFull(row: any): WorkReport {
  const proj = row.projects || {};
  const exec = row.users || {};
  const trRaw = Array.isArray(row.treatment_records) ? row.treatment_records[0] : row.treatment_records;
  const photosRaw: any[] = Array.isArray(row.documentation_photos) ? row.documentation_photos : [];
  const eventsRaw: any[] = Array.isArray(row.risk_events) ? row.risk_events : [];

  const treatmentRecord: TreatmentRecord | null = trRaw
    ? {
        applicationMethod: trRaw.application_method as ApplicationMethod,
        chemicalName: trRaw.chemical_name,
        activeIngredient: trRaw.active_ingredient ?? null,
        dosage: trRaw.dosage,
        treatmentAreaSqm: trRaw.treatment_area_sqm != null ? Number(trRaw.treatment_area_sqm) : null,
        drillingPointsCount: trRaw.drilling_points_count != null ? Number(trRaw.drilling_points_count) : null,
        fumigantType: trRaw.fumigant_type ?? null,
        gasConcentrationPpm: trRaw.gas_concentration_ppm != null ? Number(trRaw.gas_concentration_ppm) : null,
        sealingStartedAt: trRaw.sealing_started_at ?? null,
        aerationCompletedAt: trRaw.aeration_completed_at ?? null,
        safetyNotes: trRaw.safety_notes ?? null,
        technicianNotes: trRaw.technician_notes ?? null,
      }
    : null;

  const photos: DocumentationPhoto[] = photosRaw
    .filter(p => !p.purged_at)
    .map(p => ({
      id: p.id,
      photoType: p.photo_type as PhotoType,
      photoTag: (p.photo_tag as PhotoTag) ?? null,
      latitude: Number(p.latitude ?? 0),
      longitude: Number(p.longitude ?? 0),
      accuracy: Number(p.accuracy ?? 0),
      distanceToProject: Number(p.distance_to_project ?? 0),
      isWithinRadius: Boolean(p.is_within_radius),
      capturedAt: p.captured_at || p.created_at,
      metadata: p.metadata || {},
      purgedAt: p.purged_at ?? null,
      url: typeof p.storage_path === 'string' && p.storage_path.startsWith('data:')
        ? p.storage_path
        : `/api/photos/${p.id}/file`,
    }));

  const riskEvents: RiskEvent[] = eventsRaw.map(ev => ({
    id: ev.id,
    eventType: ev.event_type,
    points: Number(ev.points ?? 0),
    severity: (ev.severity || 'LOW') as RiskEvent['severity'],
    title: ev.title || '',
    description: ev.description || '',
    expectedValue: ev.expected_value ?? null,
    actualValue: ev.actual_value ?? null,
    createdAt: ev.created_at,
  }));

  return {
    id: row.id,
    projectId: row.project_id,
    projectName: proj.project_name || 'Proyek Lapangan',
    clientName: proj.client_name || row.customer_name || '',
    projectAddress: proj.address || '',
    projectLatitude: Number(proj.latitude ?? 0),
    projectLongitude: Number(proj.longitude ?? 0),
    projectRadius: Number(proj.radius ?? 100),
    workDate: typeof proj.work_date === 'string' ? proj.work_date.slice(0, 10) : null,
    workNotes: proj.notes ?? row.notes ?? null,
    scheduledStartTime: typeof proj.scheduled_start_time === 'string' ? proj.scheduled_start_time.slice(0, 5) : '08:00',
    serviceType: (proj.service_type || 'GENERAL_PEST_CONTROL') as ServiceType,
    focusTarget: proj.focus_target ?? null,
    targetFocus: Array.isArray(proj.target_focus) ? proj.target_focus : [],
    buildingAreaSqm: proj.building_area_sqm != null ? Number(proj.building_area_sqm) : null,
    contractType: (proj.contract_type || 'ONE_TIME') as ContractType,
    warrantyMonths: Number(proj.warranty_months ?? 0),
    nextServiceDate: proj.next_service_date ?? null,
    executorId: row.executor_id || '',
    executorName: exec.name || 'Teknisi Lapangan',
    executorEmail: exec.email || '',
    status: (row.status || 'READY') as WorkReportStatus,
    checkInAt: row.check_in_at ?? null,
    checkInLatitude: row.check_in_latitude != null ? Number(row.check_in_latitude) : null,
    checkInLongitude: row.check_in_longitude != null ? Number(row.check_in_longitude) : null,
    checkInAccuracy: row.check_in_accuracy != null ? Number(row.check_in_accuracy) : null,
    checkInDistance: row.check_in_distance != null ? Number(row.check_in_distance) : null,
    checkInValid: row.check_in_valid ?? null,
    checkOutAt: row.check_out_at ?? null,
    checkOutLatitude: row.check_out_latitude != null ? Number(row.check_out_latitude) : null,
    checkOutLongitude: row.check_out_longitude != null ? Number(row.check_out_longitude) : null,
    checkOutAccuracy: row.check_out_accuracy != null ? Number(row.check_out_accuracy) : null,
    checkOutDistance: row.check_out_distance != null ? Number(row.check_out_distance) : null,
    checkOutValid: row.check_out_valid ?? null,
    durationSeconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
    riskScore: Number(row.risk_score ?? 0),
    riskLevel: (row.risk_level || 'NORMAL') as RiskLevel,
    riskEvents,
    treatmentRecord,
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: row.reviewed_at ?? null,
    reviewNotes: row.review_notes ?? null,
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
    customerFeedback: row.customer_feedback ?? null,
    customerSignature: row.customer_signature ?? null,
    technicianSignature: row.technician_signature ?? null,
    technicianSignedAt: row.technician_signed_at ?? null,
    notes: row.notes ?? proj.notes ?? null,
    teamMembers: Array.isArray(row.team_members) ? row.team_members : [],
    photos,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

const REPORT_SELECT_FULL = `
  *,
  projects(*),
  users!work_reports_executor_id_fkey(id, name, email),
  treatment_records(*),
  documentation_photos(*),
  risk_events(*)
`;

// Query ringan untuk daftar laporan (tanpa menarik payload Base64 storage_path massal -> hemat ~85% Supabase Egress)
const REPORT_SELECT_LIST = `
  id, company_id, project_id, executor_id, status,
  check_in_at, check_in_latitude, check_in_longitude, check_in_accuracy, check_in_distance, check_in_valid,
  check_out_at, check_out_latitude, check_out_longitude, check_out_accuracy, check_out_distance, check_out_valid,
  duration_seconds, risk_score, risk_level, reviewed_by, reviewed_at, review_notes,
  customer_name, customer_phone, customer_feedback, notes, team_members, created_at, updated_at,
  projects(*),
  users!work_reports_executor_id_fkey(id, name, email),
  treatment_records(*),
  documentation_photos(id, photo_type, photo_tag, latitude, longitude, accuracy, distance_to_project, is_within_radius, captured_at, created_at, purged_at, metadata),
  risk_events(*)
`;

/**
 * Mengambil seluruh laporan kerja perusahaan dari database Supabase asli.
 * Mencakup semua laporan yang dibuat oleh Admin/SPK maupun oleh Teknisi Lapangan
 * sehingga seluruh data asli di database muncul utuh di aplikasi 2-Role Skripsi.
 */
export async function fetchMyWorkReports(): Promise<WorkReport[]> {
  await syncCompanyProjectsAndReports();
  const st = useAuthStore.getState();
  const uid = st.user?.uid;
  const companyId = st.user?.companyId;
  if (!uid) return [];

  let q = supabase
    .from('work_reports')
    .select(REPORT_SELECT_LIST)
    .order('created_at', { ascending: false })
    .limit(60);

  if (companyId) {
    q = q.eq('company_id', companyId);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const all = (data || []).map(mapDbWorkReportFull);

  // Urutkan agar tugas milik teknisi yang sedang login diprioritaskan di atas pada tanggal yang sama,
  // tanpa menyembunyikan penugasan yang diinput oleh Admin / SPK.
  return all.sort((a, b) => {
    const aMine = a.executorId === uid ? 1 : 0;
    const bMine = b.executorId === uid ? 1 : 0;
    if (aMine !== bMine && a.status === b.status) return bMine - aMine;
    const dateA = a.workDate || a.createdAt || '';
    const dateB = b.workDate || b.createdAt || '';
    return dateB.localeCompare(dateA);
  });
}

export async function fetchWorkReport(id: string): Promise<WorkReport> {
  const { data, error } = await supabase
    .from('work_reports')
    .select(REPORT_SELECT_FULL)
    .eq('id', id)
    .single();

  if (error || !data) throw new Error(error?.message || 'Laporan kerja tidak ditemukan.');
  return mapDbWorkReportFull(data);
}

/**
 * Memastikan proyek memiliki baris `work_reports` di Supabase sebelum memulai Check-in GPS.
 */
export async function ensureWorkReportForProject(projectId: string): Promise<WorkReport> {
  const { data: existing } = await supabase
    .from('work_reports')
    .select(REPORT_SELECT_FULL)
    .eq('project_id', projectId)
    .maybeSingle();

  if (existing) {
    return mapDbWorkReportFull(existing);
  }

  const st = useAuthStore.getState();
  const { data: proj } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (!proj) {
    throw new Error('Data proyek tidak ditemukan di database.');
  }

  const { data: created, error } = await supabase
    .from('work_reports')
    .insert({
      company_id: proj.company_id || st.user?.companyId,
      project_id: proj.id,
      executor_id: st.user?.uid || proj.created_by,
      status: 'READY',
      customer_name: proj.client_name || proj.project_name,
      notes: proj.notes ?? null,
    })
    .select(REPORT_SELECT_FULL)
    .single();

  if (error || !created) {
    throw new Error(error?.message || 'Gagal menyiapkan laporan kerja untuk proyek ini.');
  }

  return mapDbWorkReportFull(created);
}

export async function checkIn(reportId: string, evidence: EvidencePayload): Promise<WorkReport> {
  const current = await fetchWorkReport(reportId);
  const st = useAuthStore.getState();
  const activeExecutorId = st.user?.role === 'TEKNISI_LAPANGAN' ? st.user.uid : (current.executorId || st.user?.uid);

  // Periksa apakah proyek sudah memiliki titik jangkar koordinat valid
  const hasProjectAnchor = Boolean(
    current.projectLatitude &&
    current.projectLongitude &&
    !(current.projectLatitude === 0 && current.projectLongitude === 0)
  );

  let dist = 0;
  let valid = true;

  if (hasProjectAnchor) {
    dist = Math.round(
      calculateDistanceMeters(evidence.latitude, evidence.longitude, current.projectLatitude, current.projectLongitude)
    );
    valid = isWithinRadius(
      evidence.latitude,
      evidence.longitude,
      current.projectLatitude,
      current.projectLongitude,
      current.projectRadius,
      evidence.accuracy
    );
  } else {
    // Proyek belum memiliki koordinat (mis. dibuat dari SPK tanpa pin peta):
    // Titik check-in teknisi pertama otomatis ditetapkan sebagai TITIK JANGKAR RESMI proyek!
    dist = 0;
    valid = true;
    if (current.projectId) {
      await supabase
        .from('projects')
        .update({
          latitude: evidence.latitude,
          longitude: evidence.longitude,
          updated_at: new Date().toISOString(),
        })
        .eq('id', current.projectId);
    }
  }

  const nowIso = evidence.capturedAt || new Date().toISOString();
  const dataUrl = await compressBlobToDataUrl(evidence.photoBlob);

  const { error: upErr } = await supabase
    .from('work_reports')
    .update({
      executor_id: activeExecutorId,
      status: 'WORKING',
      check_in_at: current.checkInAt || nowIso,
      check_in_latitude: evidence.latitude,
      check_in_longitude: evidence.longitude,
      check_in_accuracy: evidence.accuracy,
      check_in_distance: dist,
      check_in_valid: valid,
      notes: evidence.notes || current.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId);

  if (upErr) throw new Error(upErr.message);

  // Cegah duplikasi foto CHECK_IN (CIN) beruntun pada laporan kerja yang sama
  const existingCheckInPhotos = current.photos.filter(p => p.photoType === 'CHECK_IN');
  if (existingCheckInPhotos.length > 0) {
    const primaryCinId = existingCheckInPhotos[0].id;
    await supabase
      .from('documentation_photos')
      .update({
        storage_path: dataUrl,
        latitude: evidence.latitude,
        longitude: evidence.longitude,
        accuracy: evidence.accuracy,
        distance_to_project: dist,
        is_within_radius: valid,
        captured_at: nowIso,
        metadata: { projectName: current.projectName, executorName: st.user?.name || current.executorName },
      })
      .eq('id', primaryCinId);

    if (existingCheckInPhotos.length > 1) {
      const duplicateIds = existingCheckInPhotos.slice(1).map(p => p.id);
      await supabase.from('documentation_photos').delete().in('id', duplicateIds);
    }
  } else {
    const { error: photoErr } = await supabase.from('documentation_photos').insert({
      work_report_id: reportId,
      photo_type: 'CHECK_IN',
      photo_tag: evidence.photoTag ?? null,
      storage_path: dataUrl,
      latitude: evidence.latitude,
      longitude: evidence.longitude,
      accuracy: evidence.accuracy,
      distance_to_project: dist,
      is_within_radius: valid,
      captured_at: nowIso,
      metadata: { projectName: current.projectName, executorName: st.user?.name || current.executorName },
    });
    if (photoErr) throw new Error(photoErr.message);
  }

  return fetchWorkReport(reportId);
}

export async function addProgressPhoto(reportId: string, evidence: EvidencePayload): Promise<WorkReport> {
  const current = await fetchWorkReport(reportId);
  const hasAnchor = Boolean(
    current.projectLatitude &&
    current.projectLongitude &&
    !(current.projectLatitude === 0 && current.projectLongitude === 0)
  );
  const targetLat = hasAnchor ? current.projectLatitude : (current.checkInLatitude ?? evidence.latitude);
  const targetLng = hasAnchor ? current.projectLongitude : (current.checkInLongitude ?? evidence.longitude);

  const dist = Math.round(
    calculateDistanceMeters(evidence.latitude, evidence.longitude, targetLat, targetLng)
  );
  const valid = isWithinRadius(
    evidence.latitude,
    evidence.longitude,
    targetLat,
    targetLng,
    current.projectRadius,
    evidence.accuracy
  );
  const nowIso = evidence.capturedAt || new Date().toISOString();
  const dataUrl = await compressBlobToDataUrl(evidence.photoBlob);

  const { error } = await supabase.from('documentation_photos').insert({
    work_report_id: reportId,
    photo_type: 'PROGRESS',
    photo_tag: evidence.photoTag ?? 'BEFORE',
    storage_path: dataUrl,
    latitude: evidence.latitude,
    longitude: evidence.longitude,
    accuracy: evidence.accuracy,
    distance_to_project: dist,
    is_within_radius: valid,
    captured_at: nowIso,
    metadata: { projectName: current.projectName, executorName: current.executorName, caption: evidence.notes ?? null },
  });

  if (error) throw new Error(error.message);
  return fetchWorkReport(reportId);
}

export async function checkOut(reportId: string, evidence: EvidencePayload): Promise<WorkReport> {
  const current = await fetchWorkReport(reportId);
  const hasAnchor = Boolean(
    current.projectLatitude &&
    current.projectLongitude &&
    !(current.projectLatitude === 0 && current.projectLongitude === 0)
  );
  const targetLat = hasAnchor ? current.projectLatitude : (current.checkInLatitude ?? evidence.latitude);
  const targetLng = hasAnchor ? current.projectLongitude : (current.checkInLongitude ?? evidence.longitude);

  const dist = Math.round(
    calculateDistanceMeters(evidence.latitude, evidence.longitude, targetLat, targetLng)
  );
  const valid = isWithinRadius(
    evidence.latitude,
    evidence.longitude,
    targetLat,
    targetLng,
    current.projectRadius,
    evidence.accuracy
  );
  const nowIso = evidence.capturedAt || new Date().toISOString();
  const checkInMs = current.checkInAt ? new Date(current.checkInAt).getTime() : Date.now() - 3600_000;
  const durationSeconds = Math.max(60, Math.round((new Date(nowIso).getTime() - checkInMs) / 1000));
  const dataUrl = await compressBlobToDataUrl(evidence.photoBlob);

  let riskScore = 0;
  if (!current.checkInValid) riskScore += 30;
  if (!valid) riskScore += 30;
  if (!current.treatmentRecord) riskScore += 20;
  const riskLevel: RiskLevel =
    riskScore >= 60 ? 'HIGH_RISK' : riskScore >= 40 ? 'REVIEW' : riskScore >= 20 ? 'LOW_RISK' : 'NORMAL';
  const nextStatus: WorkReportStatus = riskScore >= 40 ? 'FLAGGED' : 'COMPLETED';

  await supabase.from('documentation_photos').insert({
    work_report_id: reportId,
    photo_type: 'CHECK_OUT',
    photo_tag: evidence.photoTag ?? 'AFTER',
    storage_path: dataUrl,
    latitude: evidence.latitude,
    longitude: evidence.longitude,
    accuracy: evidence.accuracy,
    distance_to_project: dist,
    is_within_radius: valid,
    captured_at: nowIso,
    metadata: { projectName: current.projectName, executorName: current.executorName },
  });

  const updatePayload: Record<string, any> = {
    status: nextStatus,
    check_out_at: nowIso,
    check_out_latitude: evidence.latitude,
    check_out_longitude: evidence.longitude,
    check_out_accuracy: evidence.accuracy,
    check_out_distance: dist,
    check_out_valid: valid,
    duration_seconds: durationSeconds,
    risk_score: riskScore,
    risk_level: riskLevel,
    customer_name: evidence.customerName ?? current.customerName,
    customer_phone: evidence.customerPhone ?? current.customerPhone,
    customer_feedback: evidence.customerFeedback ?? current.customerFeedback,
    customer_signature: evidence.customerSignature ?? current.customerSignature,
    notes: evidence.notes ?? current.notes,
    updated_at: new Date().toISOString(),
  };

  if (evidence.technicianSignature || current.technicianSignature) {
    updatePayload.technician_signature = evidence.technicianSignature ?? current.technicianSignature;
    updatePayload.technician_signed_at = evidence.technicianSignature
      ? new Date().toISOString()
      : current.technicianSignedAt;
  }

  let { error: upErr } = await supabase
    .from('work_reports')
    .update(updatePayload)
    .eq('id', reportId);

  // Fallback aman apabila kolom migrasi 07 (technician_signature) belum dijalankan pada instance lama
  if (upErr && String(upErr.message || '').includes('technician_sign')) {
    delete updatePayload.technician_signature;
    delete updatePayload.technician_signed_at;
    const retry = await supabase.from('work_reports').update(updatePayload).eq('id', reportId);
    upErr = retry.error;
  }

  if (upErr) throw new Error(upErr.message);
  return fetchWorkReport(reportId);
}

export async function submitTreatment(reportId: string, input: TreatmentInput): Promise<WorkReport> {
  const payload = {
    work_report_id: reportId,
    application_method: input.applicationMethod,
    chemical_name: input.chemicalName,
    active_ingredient: input.activeIngredient ?? null,
    dosage: input.dosage,
    treatment_area_sqm: input.treatmentAreaSqm ?? null,
    drilling_points_count: input.drillingPointsCount ?? null,
    fumigant_type: input.fumigantType ?? null,
    gas_concentration_ppm: input.gasConcentrationPpm ?? null,
    sealing_started_at: input.sealingStartedAt ?? null,
    aeration_completed_at: input.aerationCompletedAt ?? null,
    safety_notes: input.safetyNotes ?? null,
    technician_notes: input.technicianNotes ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('treatment_records')
    .upsert(payload, { onConflict: 'work_report_id' });

  if (error) throw new Error(error.message);

  if (input.teamMembers) {
    await supabase
      .from('work_reports')
      .update({ team_members: input.teamMembers, updated_at: new Date().toISOString() })
      .eq('id', reportId);
  }

  return fetchWorkReport(reportId);
}

export async function updateWorkReportTeam(reportId: string, teamMembers: TeamMemberEntry[]): Promise<WorkReport> {
  const { error } = await supabase
    .from('work_reports')
    .update({ team_members: teamMembers, updated_at: new Date().toISOString() })
    .eq('id', reportId);
  if (error) throw new Error(error.message);
  return fetchWorkReport(reportId);
}

export type { TreatmentRecord };

export async function reportFieldIssueToDb(reportId: string, issueType: string, note: string): Promise<void> {
  if (!reportId) return;
  const cleanNote = note.trim() || 'Membutuhkan tindak lanjut koordinasi Admin/Supervisor.';
  await supabase.from('risk_events').insert({
    work_report_id: reportId,
    event_type: 'FIELD_ISSUE_ESCALATION',
    points: 40,
    severity: 'HIGH',
    title: `Kendala Lapangan: ${issueType}`,
    description: cleanNote,
    expected_value: 'Operasional Normal',
    actual_value: issueType,
  });
  await supabase
    .from('work_reports')
    .update({
      status: 'FLAGGED',
      risk_score: 40,
      risk_level: 'REVIEW',
      notes: `[KENDALA LAPANGAN: ${issueType}] ${cleanNote}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId);
}
