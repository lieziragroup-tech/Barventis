import { resetAccountPasswordToDefault } from './auth';
import { supabase, createIsolatedSupabaseClient } from '@/shared/lib/supabase';
import { useAuthStore } from '@/app/store/authStore';
import { mapDbProject, syncCompanyProjectsAndReports } from './projects';
import { fetchWorkReport } from './workReports';
import { ApiError } from './client';
import {
  aggregateOperationalSummaryFromRows,
  DEFAULT_SUMMARY_WINDOW_DAYS,
  RawOperationalReportRow,
} from '@/shared/utils/operationalSummary';
import {
  ApplicationMethod,
  AuditLogEntry,
  ExecutorStats,
  KPIStats,
  Project,
  ReportFilters,
  RiskConfig,
  RiskLevel,
  ServiceType,
  UserRole,
  WorkReport,
  WorkReportListItem,
  WorkReportStatus,
} from '@/entities/types';

export const DEFAULT_RISK_CONFIG_CLIENT: RiskConfig = {
  lateCheckinThresholdMinutes: 15,
  lateCheckinPoints: 10,
  outsideRadiusPoints: 30,
  shortDurationCriticalMinutes: 30,
  shortDurationCriticalPoints: 20,
  shortDurationWarningMinutes: 60,
  shortDurationWarningPoints: 10,
  minTotalPhotos: 3,
  minTotalPhotosPoints: 10,
  requireProgressPhoto: true,
  noProgressPhotoPoints: 15,
  locationDriftThresholdMeters: 300,
  locationDriftPoints: 15,
  missingTreatmentRecordPoints: 20,
  fumigationMissingAerationPoints: 40,
  reviewThreshold: 40,
  highRiskThreshold: 60,
  criticalThreshold: 80,
  lowRiskThreshold: 20,
};

function getTargetCompanyId(): string | null {
  const st = useAuthStore.getState();
  if (st.user?.role === 'MASTER_SUPER_ADMIN' || st.user?.role === 'SUPERADMIN') {
    return st.activeCompanyId || st.user.companyId || null;
  }
  return st.user?.companyId || null;
}

function toHumanReadableApiError(err: { message?: string; code?: string; status?: number } | null, fallbackMessage: string): ApiError {
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('jwt') || msg.includes('token') || msg.includes('expired') || err?.status === 401) {
    return new ApiError(401, 'Sesi masuk Anda telah berakhir. Silakan masuk kembali untuk melanjutkan.');
  }
  if (msg.includes('permission') || msg.includes('policy') || msg.includes('rls') || err?.status === 403) {
    return new ApiError(403, 'Akses ditolak untuk perusahaan atau peran saat ini. Pastikan perusahaan aktif sudah benar.');
  }
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch')) {
    return new ApiError(0, 'Koneksi ke server terputus. Periksa jaringan internet Anda lalu coba lagi.');
  }
  return new ApiError(err?.status || 500, fallbackMessage);
}

export async function fetchAdminReports(filters: Partial<ReportFilters>): Promise<{
  // Sync real DB projects/SPK before listing
  reports: WorkReportListItem[];
  count: number;
  totalCount: number;
  page: number;
  totalPages: number;
}> {
  await syncCompanyProjectsAndReports();
  const companyId = getTargetCompanyId();
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, filters.limit ?? 20);

  let q = supabase
    .from('work_reports')
    .select(
      `
      id,
      status,
      check_in_at,
      check_out_at,
      duration_seconds,
      risk_score,
      risk_level,
      check_in_valid,
      check_out_valid,
      check_in_distance,
      check_out_distance,
      created_at,
      executor_id,
      project_id,
      projects(id, project_name, client_name, address, service_type, focus_target, target_focus),
      users!work_reports_executor_id_fkey(id, name),
      treatment_records(application_method, chemical_name, dosage)
    `
    )
    .order('created_at', { ascending: false });

  if (companyId) q = q.eq('company_id', companyId);
  if (filters.executorId && filters.executorId !== 'ALL') q = q.eq('executor_id', filters.executorId);
  if (filters.projectId && filters.projectId !== 'ALL') q = q.eq('project_id', filters.projectId);
  if (filters.riskLevel && filters.riskLevel !== 'ALL') q = q.eq('risk_level', filters.riskLevel);
  if (filters.status && filters.status !== 'ALL') q = q.eq('status', filters.status);
  if (filters.startDate) q = q.gte('created_at', `${filters.startDate}T00:00:00Z`);
  if (filters.endDate) q = q.lte('created_at', `${filters.endDate}T23:59:59Z`);

  const { data, error } = await q;
  if (error) {
    throw toHumanReadableApiError(
      error,
      'Daftar laporan lapangan belum dapat dimuat. Periksa koneksi Anda lalu coba lagi.'
    );
  }

  let items: WorkReportListItem[] = (data || []).map((row: any) => {
    const p = row.projects || {};
    const u = row.users || {};
    const tr = Array.isArray(row.treatment_records) ? row.treatment_records[0] : row.treatment_records;
    return {
      id: row.id,
      status: (row.status || 'READY') as WorkReportStatus,
      checkInAt: row.check_in_at ?? null,
      checkOutAt: row.check_out_at ?? null,
      durationSeconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
      riskScore: Number(row.risk_score ?? 0),
      riskLevel: (row.risk_level || 'NORMAL') as RiskLevel,
      checkInValid: row.check_in_valid ?? null,
      checkOutValid: row.check_out_valid ?? null,
      checkInDistance: row.check_in_distance != null ? Number(row.check_in_distance) : null,
      checkOutDistance: row.check_out_distance != null ? Number(row.check_out_distance) : null,
      createdAt: row.created_at,
      project: {
        id: p.id || row.project_id || '',
        name: p.project_name || 'Proyek Lapangan',
        clientName: p.client_name || '',
        address: p.address || '',
        serviceType: (p.service_type || 'GENERAL_PEST_CONTROL') as ServiceType,
        focusTarget: p.focus_target ?? null,
        targetFocus: Array.isArray(p.target_focus) ? p.target_focus : [],
      },
      executor: {
        id: u.id || row.executor_id || '',
        name: u.name || 'Teknisi Lapangan',
      },
      treatmentSummary: tr
        ? {
            applicationMethod: tr.application_method as ApplicationMethod,
            chemicalName: tr.chemical_name,
            dosage: tr.dosage,
          }
        : null,
    };
  });

  if (filters.serviceType && filters.serviceType !== 'ALL') {
    items = items.filter(i => i.project.serviceType === filters.serviceType);
  }
  if (filters.search && filters.search.trim()) {
    const kw = filters.search.trim().toLowerCase();
    items = items.filter(
      i =>
        i.project.name.toLowerCase().includes(kw) ||
        i.project.clientName.toLowerCase().includes(kw) ||
        i.executor.name.toLowerCase().includes(kw) ||
        i.project.address.toLowerCase().includes(kw)
    );
  }

  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const paged = items.slice((page - 1) * limit, page * limit);

  return {
    reports: paged,
    count: paged.length,
    totalCount,
    page,
    totalPages,
  };
}

export async function fetchAdminReportDetail(id: string): Promise<WorkReport> {
  return fetchWorkReport(id);
}

/**
 * Mengambil ringkasan operasional 30 hari terakhir beserta agregasi tren harian,
 * distribusi status laporan, dan daftar prioritas verifikasi yang terisolasi per perusahaan (company_id).
 */
export async function fetchAdminSummary(windowDays = DEFAULT_SUMMARY_WINDOW_DAYS): Promise<KPIStats> {
  const companyId = getTargetCompanyId();
  const now = new Date();
  // Ambil margin 31 hari UTC untuk memastikan batas waktu lokal Asia/Jakarta (UTC+7) 30 hari terakhir tercakup utuh
  const cutoffDate = new Date(now.getTime() - (windowDays + 1) * 24 * 60 * 60 * 1000);

  let q = supabase
    .from('work_reports')
    .select(
      `
      id,
      status,
      risk_score,
      risk_level,
      duration_seconds,
      check_in_valid,
      check_in_distance,
      created_at,
      project_id,
      projects(id, project_name, client_name, service_type),
      users!work_reports_executor_id_fkey(id, name)
    `
    )
    .gte('created_at', cutoffDate.toISOString())
    .order('created_at', { ascending: false });

  if (companyId) {
    q = q.eq('company_id', companyId);
  }

  const { data, error } = await q;
  if (error) {
    throw toHumanReadableApiError(
      error,
      'Ringkasan operasional belum dapat dimuat. Periksa koneksi internet Anda lalu coba lagi.'
    );
  }

  return aggregateOperationalSummaryFromRows((data || []) as RawOperationalReportRow[], now, windowDays);
}

export async function fetchExecutors(): Promise<ExecutorStats[]> {
  const companyId = getTargetCompanyId();
  let uq = supabase
    .from('users')
    .select('id, name, email, nip, phone, is_active, role')
    .order('name', { ascending: true });
  if (companyId) uq = uq.eq('company_id', companyId);

  const [{ data: usersData }, { data: reportsData }] = await Promise.all([
    uq,
    companyId
      ? supabase.from('work_reports').select('executor_id, status, risk_level, duration_seconds').eq('company_id', companyId)
      : supabase.from('work_reports').select('executor_id, status, risk_level, duration_seconds'),
  ]);

  const techs = (usersData || []).filter(
    (u: any) =>
      (u.role === 'TEKNISI_LAPANGAN' || u.role === 'ADMIN') &&
      String(u.email || '').toLowerCase() !== 'lieziragroup@gmail.com'
  );
  const reps = reportsData || [];

  return techs.map((u: any) => {
    const myReps = reps.filter((r: any) => r.executor_id === u.id);
    const durs = myReps.map((r: any) => Number(r.duration_seconds ?? 0)).filter((d: number) => d > 0);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      nip: u.nip ?? null,
      phone: u.phone ?? null,
      isActive: Boolean(u.is_active),
      totalJobs: myReps.length,
      completedJobs: myReps.filter((r: any) => r.status === 'COMPLETED' || r.status === 'REVIEWED').length,
      highRiskJobs: myReps.filter((r: any) => r.risk_level === 'HIGH_RISK' || r.risk_level === 'CRITICAL').length,
      avgDurationMinutes: durs.length > 0 ? Math.round(durs.reduce((a: number, b: number) => a + b, 0) / durs.length / 60) : 0,
    };
  });
}

export interface ProjectFilters {
  search?: string;
  serviceType?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export async function fetchAdminProjects(filters?: ProjectFilters): Promise<{
  projects: Project[];
  totalCount: number;
  page: number;
  totalPages: number;
}> {
  await syncCompanyProjectsAndReports();
  const companyId = getTargetCompanyId();
  const page = Math.max(1, filters?.page ?? 1);
  const limit = Math.max(1, filters?.limit ?? 8);

  let q = supabase.from('projects').select('*').order('created_at', { ascending: false });
  if (companyId) q = q.eq('company_id', companyId);
  if (filters?.serviceType && filters.serviceType !== 'ALL') {
    q = q.eq('service_type', filters.serviceType);
  }

  const { data, error } = await q;
  if (error || !data) {
    return { projects: [], totalCount: 0, page: 1, totalPages: 1 };
  }

  let mapped = data.map(mapDbProject);
  if (filters?.search && filters.search.trim()) {
    const kw = filters.search.trim().toLowerCase();
    mapped = mapped.filter(
      p =>
        p.projectName.toLowerCase().includes(kw) ||
        p.clientName.toLowerCase().includes(kw) ||
        p.address.toLowerCase().includes(kw)
    );
  }

  const totalCount = mapped.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const paged = mapped.slice((page - 1) * limit, page * limit);

  return {
    projects: paged,
    totalCount,
    page,
    totalPages,
  };
}

export async function fetchAuditLogs(): Promise<AuditLogEntry[]> {
  const companyId = getTargetCompanyId();
  let q = supabase
    .from('audit_logs')
    .select('id, user_name, user_role, action, entity_type, entity_id, details, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (companyId) q = q.eq('company_id', companyId);

  const { data, error } = await q;
  if (error || !data) return [];

  return data.map((r: any) => ({
    id: r.id,
    userName: r.user_name || 'System',
    userRole: (r.user_role || 'ADMIN') as UserRole,
    action: r.action || '',
    entityType: r.entity_type || 'system',
    entityId: r.entity_id ?? null,
    details: r.details || '',
    createdAt: r.created_at,
  }));
}

export async function fetchRiskConfig(): Promise<RiskConfig> {
  const companyId = getTargetCompanyId();
  if (companyId) {
    const { data } = await supabase
      .from('company_settings')
      .select('settings')
      .eq('company_id', companyId)
      .maybeSingle();
    const override = (data?.settings as any)?.riskConfig;
    if (override && typeof override === 'object') {
      return { ...DEFAULT_RISK_CONFIG_CLIENT, ...override };
    }
  }
  return { ...DEFAULT_RISK_CONFIG_CLIENT };
}

export async function updateRiskConfig(partial: Partial<RiskConfig>): Promise<RiskConfig> {
  const current = await fetchRiskConfig();
  return { ...current, ...partial };
}

export async function resetRiskConfig(): Promise<RiskConfig> {
  return { ...DEFAULT_RISK_CONFIG_CLIENT };
}

export async function reviewReport(id: string, notes: string): Promise<WorkReport> {
  const { error } = await supabase.rpc('process_status_approval', {
    p_report_id: id,
    p_status: 'REVIEWED',
    p_notes: notes,
  });
  if (error) throw new Error(error.message);
  return fetchWorkReport(id);
}

export async function downloadReportsCsv(filters: Partial<ReportFilters>): Promise<void> {
  const { reports } = await fetchAdminReports({ ...filters, page: 1, limit: 1000 });
  const header = ['ID', 'Proyek', 'Klien', 'Teknisi', 'Layanan', 'Status', 'Skor Risiko', 'Level Risiko', 'Tanggal'];
  const rows = reports.map(r => [
    r.id,
    `"${(r.project.name || '').replace(/"/g, '""')}"`,
    `"${(r.project.clientName || '').replace(/"/g, '""')}"`,
    `"${(r.executor.name || '').replace(/"/g, '""')}"`,
    r.project.serviceType,
    r.status,
    String(r.riskScore),
    r.riskLevel,
    r.createdAt,
  ]);
  const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `guci-emas-reports-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  nip: string | null;
  phone: string | null;
  role: 'ADMIN' | 'MARKETING' | 'INVENTORY' | 'TEKNISI_LAPANGAN';
  is_active: boolean;
  created_at: string;
}

export async function fetchUsers(): Promise<AdminUser[]> {
  const companyId = getTargetCompanyId();
  let q = supabase
    .from('users')
    .select('id, name, email, nip, phone, role, is_active, created_at')
    .neq('role', 'MASTER_SUPER_ADMIN')
    .neq('role', 'SUPERADMIN')
    .order('created_at', { ascending: false });
  if (companyId) q = q.eq('company_id', companyId);

  const { data, error } = await q;
  if (error || !data) return [];
  return (data as AdminUser[]).filter(
    u =>
      (u.role as string) !== 'MASTER_SUPER_ADMIN' &&
      (u.role as string) !== 'SUPERADMIN' &&
      u.email.toLowerCase() !== 'lieziragroup@gmail.com'
  );
}

export interface NewUserInput {
  email: string;
  password: string;
  name: string;
  role: AdminUser['role'];
  phone?: string;
  nip?: string;
}

export async function createUser(input: NewUserInput): Promise<AdminUser> {
  const companyId = getTargetCompanyId();
  if (!companyId) throw new Error('Perusahaan belum dipilih.');

  const isolated = createIsolatedSupabaseClient();
  const { data: signUpData, error: signUpErr } = await isolated.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      data: {
        name: input.name.trim(),
        role: input.role,
        phone: input.phone || '',
      },
    },
  });

  if (signUpErr) throw new Error(signUpErr.message);
  const uid = signUpData.user?.id || crypto.randomUUID();

  const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_upsert_company_user', {
    p_uid: uid,
    p_email: input.email.trim().toLowerCase(),
    p_name: input.name.trim(),
    p_role: input.role,
    p_phone: input.phone || null,
    p_nip: input.nip || null,
  });

  if (rpcErr) {
    const { data: existing } = await supabase
      .from('users')
      .select('id, name, email, nip, phone, role, is_active, created_at')
      .eq('email', input.email.trim().toLowerCase())
      .maybeSingle();
    if (existing) return existing as AdminUser;
    throw new Error(rpcErr.message);
  }

  return rpcData as AdminUser;
}

export async function suspendUser(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_user_active', { p_user_id: id, p_active: false });
  if (error) throw new Error(error.message);
}

export async function activateUser(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_user_active', { p_user_id: id, p_active: true });
  if (error) throw new Error(error.message);
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_company_user', { p_user_id: id });
  if (error) throw new Error(error.message);
}

export interface PhotoPurgePreview {
  cutoffDate: string;
  eligibleCount: number;
  oldestPhotoDate: string | null;
}

export interface PhotoPurgeResult {
  cutoffDate: string;
  purgedCount: number;
  failedCount: number;
}

export async function fetchPhotoPurgePreview(olderThanMonths = 2): Promise<PhotoPurgePreview> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - olderThanMonths);
  const cutoffIso = cutoff.toISOString();

  const { data, error } = await supabase
    .from('documentation_photos')
    .select('captured_at')
    .is('purged_at', null)
    .lt('captured_at', cutoffIso)
    .order('captured_at', { ascending: true });

  if (error) {
    throw toHumanReadableApiError(error, 'Perkiraan retensi foto belum dapat dimuat.');
  }

  return {
    cutoffDate: cutoffIso.slice(0, 10),
    eligibleCount: data?.length ?? 0,
    oldestPhotoDate: data && data.length > 0 ? data[0].captured_at : null,
  };
}

export async function purgeOldPhotos(olderThanMonths = 2): Promise<PhotoPurgeResult> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - olderThanMonths);
  const cutoffIso = cutoff.toISOString();

  const { data, error } = await supabase
    .from('documentation_photos')
    .update({ purged_at: new Date().toISOString() })
    .is('purged_at', null)
    .lt('captured_at', cutoffIso)
    .select('id');

  if (error) {
    throw toHumanReadableApiError(error, 'Gagal menghapus file foto lama. Coba lagi beberapa saat.');
  }

  return {
    cutoffDate: cutoffIso.slice(0, 10),
    purgedCount: data?.length ?? 0,
    failedCount: 0,
  };
}

export async function resetUserPassword(id: string, email: string): Promise<string> {
  return resetAccountPasswordToDefault(email, id);
}
