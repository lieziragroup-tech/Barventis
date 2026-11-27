import { query } from '../../db/pool.js';
import { HttpError } from '../../utils/asyncHandler.js';
import { ADMIN_ROLES } from '../../types.js';

/** Mengambil laporan HANYA bila milik `companyId` — laporan perusahaan lain diperlakukan sebagai tidak ada (404). */
export async function getReportOrThrow(id: string, companyId: string) {
  const rows = await query(
    `select wr.*, p.project_name, p.client_name, p.address as project_address, p.latitude as project_latitude,
      p.longitude as project_longitude, p.radius as project_radius, p.scheduled_start_time,
      p.service_type, p.focus_target, p.target_focus, p.building_area_sqm, p.contract_type, p.warranty_months, p.next_service_date,
      u.name as executor_name, u.email as executor_email
     from work_reports wr
     join projects p on p.id = wr.project_id
     left join users u on u.id = wr.executor_id
     where wr.id = $1 and wr.company_id = $2`,
    [id, companyId]
  );
  const report = rows[0];
  if (!report) throw new HttpError(404, 'Laporan pekerjaan tidak ditemukan.');
  return report;
}

export function assertOwnerOrAdmin(user: { role: string; id: string }, report: any) {
  if (!(ADMIN_ROLES as string[]).includes(user.role) && report.executor_id !== user.id) {
    throw new HttpError(403, 'Anda hanya dapat mengakses laporan pekerjaan milik sendiri.');
  }
}

function mapTreatmentRecord(t: any) {
  if (!t) return null;
  return {
    applicationMethod: t.application_method,
    chemicalName: t.chemical_name,
    activeIngredient: t.active_ingredient,
    dosage: t.dosage,
    treatmentAreaSqm: t.treatment_area_sqm !== null ? Number(t.treatment_area_sqm) : null,
    drillingPointsCount: t.drilling_points_count,
    fumigantType: t.fumigant_type,
    gasConcentrationPpm: t.gas_concentration_ppm !== null ? Number(t.gas_concentration_ppm) : null,
    sealingStartedAt: t.sealing_started_at,
    aerationCompletedAt: t.aeration_completed_at,
    safetyNotes: t.safety_notes,
    technicianNotes: t.technician_notes,
  };
}

function buildReportDto(report: any, photos: any[], events: any[], treatmentRow: any, role?: string) {
  return {
    id: report.id,
    projectId: report.project_id,
    projectName: report.project_name,
    clientName: report.client_name,
    projectAddress: report.project_address,
    projectLatitude: Number(report.project_latitude),
    projectLongitude: Number(report.project_longitude),
    projectRadius: report.project_radius,
    scheduledStartTime: report.scheduled_start_time,
    serviceType: report.service_type,
    focusTarget: report.focus_target,
    targetFocus: typeof report.target_focus === 'string' ? JSON.parse(report.target_focus) : (report.target_focus || []),
    buildingAreaSqm: report.building_area_sqm !== null ? Number(report.building_area_sqm) : null,
    contractType: report.contract_type,
    warrantyMonths: report.warranty_months,
    nextServiceDate: report.next_service_date,
    executorId: report.executor_id,
    executorName: report.executor_name,
    executorEmail: report.executor_email,
    status: report.status,
    checkInAt: report.check_in_at,
    checkInLatitude: report.check_in_latitude !== null ? Number(report.check_in_latitude) : null,
    checkInLongitude: report.check_in_longitude !== null ? Number(report.check_in_longitude) : null,
    checkInAccuracy: report.check_in_accuracy,
    checkInDistance: report.check_in_distance,
    checkInValid: report.check_in_valid,
    checkOutAt: report.check_out_at,
    checkOutLatitude: report.check_out_latitude !== null ? Number(report.check_out_latitude) : null,
    checkOutLongitude: report.check_out_longitude !== null ? Number(report.check_out_longitude) : null,
    checkOutAccuracy: report.check_out_accuracy,
    checkOutDistance: report.check_out_distance,
    checkOutValid: report.check_out_valid,
    durationSeconds: report.duration_seconds,
    riskScore: report.risk_score,
    riskLevel: report.risk_level,
    reviewedBy: report.reviewed_by,
    reviewedAt: report.reviewed_at,
    reviewNotes: report.review_notes,
    
    // Customer Review Fields
    customerName: report.customer_name,
    customerPhone: report.customer_phone,
    customerFeedback: role && (ADMIN_ROLES as string[]).includes(role) ? report.customer_feedback : undefined, // hanya admin yang melihat masukan customer
    customerSignature: report.customer_signature,

    notes: report.notes,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    treatmentRecord: mapTreatmentRecord(treatmentRow),
    photos: photos.map(p => ({
      id: p.id,
      photoType: p.photo_type,
      photoTag: p.photo_tag,
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
      accuracy: p.accuracy,
      distanceToProject: p.distance_to_project,
      isWithinRadius: p.is_within_radius,
      capturedAt: p.captured_at,
      metadata: p.metadata,
      purgedAt: p.purged_at,
      url: `/api/photos/${p.id}/file`,
    })),
    riskEvents: events.map(e => ({
      id: e.id,
      eventType: e.event_type,
      points: e.points,
      severity: e.severity,
      title: e.title,
      description: e.description,
      expectedValue: e.expected_value,
      actualValue: e.actual_value,
      createdAt: e.created_at,
    })),
  };
}

const groupBy = <T extends { [k: string]: any }>(rows: T[], key: string) => {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = r[key] as string; (m.get(k) ?? m.set(k, []).get(k)!).push(r); }
  return m;
};

/** Memetakan banyak laporan dengan 3 query (bukan 3 query PER laporan). */
export async function mapReportsBatch(reports: any[], role?: string) {
  if (reports.length === 0) return [];
  const ids = reports.map(r => r.id);
  const [photos, events, treatments] = await Promise.all([
    query('select * from documentation_photos where work_report_id = any($1::uuid[]) order by captured_at asc', [ids]),
    query('select * from risk_events where work_report_id = any($1::uuid[]) order by created_at asc', [ids]),
    query('select * from treatment_records where work_report_id = any($1::uuid[])', [ids]),
  ]);
  const ph = groupBy(photos, 'work_report_id'), ev = groupBy(events, 'work_report_id'), tr = groupBy(treatments, 'work_report_id');
  return reports.map(r => buildReportDto(r, ph.get(r.id) ?? [], ev.get(r.id) ?? [], tr.get(r.id)?.[0], role));
}

export async function mapReportFull(report: any, role?: string) {
  return (await mapReportsBatch([report], role))[0];
}
