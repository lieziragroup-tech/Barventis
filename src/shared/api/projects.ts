import { supabase } from '@/shared/lib/supabase';
import { useAuthStore } from '@/app/store/authStore';
import { ContractType, Project, ServiceType } from '@/entities/types';

export interface CreateProjectInput {
  projectName: string;
  clientName?: string;
  address: string;
  latitude: number;
  longitude: number;
  radius?: number;
  workDate: string;
  workType?: string;
  serviceType: ServiceType;
  targetFocus?: string[];
  focusTarget?: string;
  buildingAreaSqm?: number;
  contractType: ContractType;
  warrantyMonths: number;
  nextServiceDate?: string;
  scheduledStartTime?: string;
  notes?: string;
  executorId?: string;
  quotationId?: string | null;
  contractValue?: number;
}

export function resolveActiveCompanyId(): string | null {
  const st = useAuthStore.getState();
  if (st.user?.role === 'MASTER_SUPER_ADMIN' || st.user?.role === 'SUPERADMIN') {
    return st.activeCompanyId || st.user.companyId || null;
  }
  return st.user?.companyId || null;
}

function normalizeDbServiceType(raw?: string | null): ServiceType {
  const upper = String(raw || '').toUpperCase().trim();
  const valid: ServiceType[] = [
    'GENERAL_PEST_CONTROL',
    'TERMITE_CONTROL',
    'FUMIGATION',
    'RODENT_CONTROL',
    'MOSQUITO_CONTROL',
    'BIRD_CONTROL',
    'BED_BUG_CONTROL',
    'DISINFECTION',
  ];
  if (valid.includes(upper as ServiceType)) return upper as ServiceType;
  if (upper.includes('RAYAP') || upper.includes('TERMITE') || upper.includes('AR')) return 'TERMITE_CONTROL';
  if (upper.includes('RODENT') || upper.includes('TIKUS')) return 'RODENT_CONTROL';
  if (upper.includes('FOGGING') || upper.includes('NYAMUK') || upper.includes('MOSQUITO')) return 'MOSQUITO_CONTROL';
  if (upper.includes('FUMIG')) return 'FUMIGATION';
  return 'GENERAL_PEST_CONTROL';
}

export function mapDbProject(row: any): Project {
  return {
    id: row.id,
    projectName: row.project_name || '',
    clientName: row.client_name || '',
    address: row.address || '',
    latitude: Number(row.latitude ?? 0),
    longitude: Number(row.longitude ?? 0),
    radius: Number(row.radius ?? 100),
    workDate: typeof row.work_date === 'string' ? row.work_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    workType: row.work_type || '',
    serviceType: normalizeDbServiceType(row.service_type),
    focusTarget: row.focus_target ?? null,
    targetFocus: Array.isArray(row.target_focus) ? row.target_focus : [],
    buildingAreaSqm: row.building_area_sqm != null ? Number(row.building_area_sqm) : null,
    contractType: (row.contract_type || 'ONE_TIME') as ContractType,
    warrantyMonths: Number(row.warranty_months ?? 0),
    nextServiceDate: row.next_service_date ?? null,
    scheduledStartTime: typeof row.scheduled_start_time === 'string' ? row.scheduled_start_time.slice(0, 5) : '08:00',
    notes: row.notes ?? null,
    contractValue: row.contract_value != null ? Number(row.contract_value) : 0,
    quotationId: row.quotation_id ?? null,
    createdBy: row.created_by || '',
    createdByName: row.users?.name ?? undefined,
    createdAt: row.created_at || new Date().toISOString(),
    lockedAt: row.locked_at ?? null,
  };
}

/**
 * Sinkronisasi data asli antar tabel di database Supabase bersama (Guci-App-main <-> Guci-App-2Role Skripsi):
 * 1. Memastikan setiap baris `public.spk` yang belum memiliki entri `public.projects` otomatis terjembatani ke `public.projects`.
 * 2. Memastikan setiap baris `public.projects` memiliki pasangan baris di `public.work_reports` sehingga langsung muncul di Daftar Tugas Teknisi & Verifikasi Admin.
 */
let lastSyncTimestamp = 0;
export async function syncCompanyProjectsAndReports(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastSyncTimestamp < 300000) return;
  lastSyncTimestamp = now;

  const st = useAuthStore.getState();
  const companyId = resolveActiveCompanyId();
  if (!companyId || !st.user) return;

  try {
    const [{ data: existingProjects }, { data: existingReports }, { data: spkRows }] = await Promise.all([
      supabase.from('projects').select('id, project_name, client_name, work_date, quotation_id, notes, created_by').eq('company_id', companyId),
      supabase.from('work_reports').select('id, project_id, executor_id').eq('company_id', companyId),
      supabase.from('spk').select('*').eq('company_id', companyId),
    ]);

    const projList = existingProjects || [];
    const repList = existingReports || [];
    const spkList = spkRows || [];

    // 1. Jembatani baris SPK dari sistem 6-Role yang belum masuk ke public.projects
    for (const spk of spkList) {
      const spkNo = String(spk.spk_number || '').trim();
      const custName = String(spk.customer_name || '').trim();
      const execDate = typeof spk.execution_date === 'string'
        ? spk.execution_date.slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      const alreadyInProjects = projList.some((p: any) => {
        if (spk.quotation_id && p.quotation_id === spk.quotation_id && String(p.work_date || '').slice(0, 10) === execDate) {
          return true;
        }
        if (spkNo && String(p.notes || '').includes(spkNo)) {
          return true;
        }
        return (
          custName &&
          String(p.client_name || '').toLowerCase() === custName.toLowerCase() &&
          String(p.work_date || '').slice(0, 10) === execDate
        );
      });

      if (!alreadyInProjects && custName) {
        const payload = (spk.payload && typeof spk.payload === 'object') ? spk.payload : {};
        const lat = Number(payload.latitude ?? payload.lat ?? 0);
        const lng = Number(payload.longitude ?? payload.lng ?? 0);
        const workDesc = String(spk.Work_Description || spk.work_description || `Layanan ${custName}`).trim();

        const { data: insertedProj } = await supabase
          .from('projects')
          .insert({
            company_id: companyId,
            project_name: workDesc || custName,
            client_name: custName,
            address: String(spk.location || custName),
            latitude: Number.isFinite(lat) ? lat : 0,
            longitude: Number.isFinite(lng) ? lng : 0,
            radius: 100,
            work_date: execDate,
            work_type: workDesc || 'Layanan Operasional',
            service_type: normalizeDbServiceType(spk.service_type),
            contract_type: 'ONE_TIME',
            warranty_months: 0,
            scheduled_start_time: '08:30',
            notes: spkNo ? `[SPK: ${spkNo}] ${workDesc}` : workDesc,
            quotation_id: spk.quotation_id ?? null,
            created_by: spk.assigned_to || st.user.uid,
          })
          .select('id, project_name, client_name, work_date, quotation_id, notes, created_by')
          .single();

        if (insertedProj) {
          projList.push(insertedProj);
        }
      }
    }

    // 2. Pastikan setiap baris di public.projects memiliki pasangan baris di public.work_reports
    const reportedProjectIds = new Set(repList.map((r: any) => r.project_id));
    const missingReportProjects = projList.filter((p: any) => p.id && !reportedProjectIds.has(p.id));

    for (const p of missingReportProjects) {
      await supabase
        .from('work_reports')
        .insert({
          company_id: companyId,
          project_id: p.id,
          executor_id: p.created_by || st.user.uid,
          status: 'READY',
          customer_name: p.client_name || p.project_name || 'Pelanggan Operasional',
          notes: p.notes ?? null,
        });
    }
  } catch (err) {
    console.warn('[syncCompanyProjectsAndReports] sinkronisasi otomatis dilewati:', err);
  }
}

export async function createProject(input: CreateProjectInput): Promise<{ project: Project; workReportId: string }> {
  const st = useAuthStore.getState();
  const companyId = resolveActiveCompanyId();
  if (!companyId || !st.user) {
    throw new Error('Sesi perusahaan tidak ditemukan. Silakan muat ulang halaman.');
  }

  const assignedExecutorId = input.executorId || st.user.uid;

  const { data: projRow, error: projErr } = await supabase
    .from('projects')
    .insert({
      company_id: companyId,
      project_name: input.projectName,
      client_name: input.clientName || input.projectName,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      radius: input.radius ?? 100,
      work_date: input.workDate,
      work_type: input.workType || input.projectName,
      service_type: input.serviceType,
      focus_target: input.focusTarget ?? (input.targetFocus?.join(', ') || null),
      target_focus: input.targetFocus ?? [],
      building_area_sqm: input.buildingAreaSqm ?? null,
      contract_type: input.contractType,
      warranty_months: input.warrantyMonths ?? 0,
      next_service_date: input.nextServiceDate || null,
      scheduled_start_time: input.scheduledStartTime || '08:00',
      notes: input.notes ?? null,
      quotation_id: input.quotationId ?? null,
      contract_value: input.contractValue ?? 0,
      created_by: st.user.uid,
    })
    .select('*')
    .single();

  if (projErr || !projRow) {
    throw new Error(projErr?.message || 'Gagal membuat proyek lapangan.');
  }

  const { data: wrRow, error: wrErr } = await supabase
    .from('work_reports')
    .insert({
      company_id: companyId,
      project_id: projRow.id,
      executor_id: assignedExecutorId,
      status: 'READY',
      customer_name: input.clientName || input.projectName,
      notes: input.notes ?? null,
    })
    .select('id')
    .single();

  if (wrErr) {
    console.warn('[createProject] gagal membuat work_report otomatis:', wrErr.message);
  }

  return {
    project: mapDbProject(projRow),
    workReportId: wrRow?.id || projRow.id,
  };
}

export async function fetchMyProjects(): Promise<Project[]> {
  await syncCompanyProjectsAndReports();
  const companyId = resolveActiveCompanyId();
  let q = supabase
    .from('projects')
    .select('*')
    .order('work_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(120);
  if (companyId) q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map(mapDbProject);
}

export async function fetchProject(id: string): Promise<Project> {
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).single();
  if (error || !data) throw new Error(error?.message || 'Proyek tidak ditemukan.');
  return mapDbProject(data);
}
