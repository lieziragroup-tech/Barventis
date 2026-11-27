import {
  DailyJobTrendPoint,
  ExecutorStats,
  KPIStats,
  OperationalDashboardSummary,
  PriorityVerificationReportItem,
  Project,
  Quotation,
  RiskLevel,
  ServiceType,
  WorkReportListItem,
  WorkReportStatus,
  WorkStatusBreakdownItem,
} from '@/entities/types';

export const OPERATIONAL_TIMEZONE = 'Asia/Jakarta';
export const DEFAULT_SUMMARY_WINDOW_DAYS = 30;

export const CANONICAL_REPORT_STATUSES: WorkReportStatus[] = [
  'COMPLETED',
  'REVIEWED',
  'WORKING',
  'READY',
  'DRAFT',
  'FLAGGED',
];

export interface RawOperationalReportRow {
  id: string;
  status?: string | null;
  risk_score?: number | string | null;
  risk_level?: string | null;
  duration_seconds?: number | string | null;
  check_in_valid?: boolean | null;
  check_in_distance?: number | string | null;
  created_at: string;
  project_id?: string | null;
  projects?: {
    id?: string;
    project_name?: string;
    client_name?: string;
    service_type?: string;
  } | null;
  users?: {
    id?: string;
    name?: string;
  } | null;
}

/**
 * Konversi Date atau ISO timestamp menjadi string YYYY-MM-DD pada zona waktu operasional (Asia/Jakarta).
 */
export function toLocalDateKey(input: Date | string, timeZone = OPERATIONAL_TIMEZONE): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Geser tanggal YYYY-MM-DD sebanyak `deltaDays` hari.
 */
export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

/**
 * Sapaan otomatis sesuai jam WIB (Asia/Jakarta).
 */
export function getIndonesianTimeGreeting(referenceDate: Date = new Date()): string {
  try {
    const hourStr = new Intl.DateTimeFormat('en-US', {
      timeZone: OPERATIONAL_TIMEZONE,
      hour: 'numeric',
      hour12: false,
    }).format(referenceDate);
    const hour = Number(hourStr);
    if (hour >= 4 && hour < 11) return 'Selamat Pagi';
    if (hour >= 11 && hour < 15) return 'Selamat Siang';
    if (hour >= 15 && hour < 18) return 'Selamat Sore';
    return 'Selamat Malam';
  } catch {
    return 'Selamat Siang';
  }
}

/**
 * Menghasilkan daftar tanggal berurutan (YYYY-MM-DD) sepanjang `windowDays` terakhir hingga `referenceDate`
 * dalam zona waktu operasional.
 */
export function buildDateWindowKeys(
  referenceDate: Date = new Date(),
  windowDays: number = DEFAULT_SUMMARY_WINDOW_DAYS,
  timeZone: string = OPERATIONAL_TIMEZONE
): string[] {
  const days = Math.max(1, Math.min(366, Math.floor(windowDays)));
  const endKey = toLocalDateKey(referenceDate, timeZone);
  const [y, m, d] = endKey.split('-').map(Number);
  const keys: string[] = [];

  for (let offset = days - 1; offset >= 0; offset--) {
    const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) - offset, 12, 0, 0));
    const key = dt.toISOString().slice(0, 10);
    keys.push(key);
  }
  return keys;
}

function getPriorityUrgencyRank(status: WorkReportStatus, riskLevel: RiskLevel): number {
  let rank = 0;
  if (riskLevel === 'CRITICAL') rank += 40;
  else if (riskLevel === 'HIGH_RISK') rank += 30;
  else if (riskLevel === 'REVIEW') rank += 15;
  if (status === 'FLAGGED') rank += 25;
  return rank;
}

/**
 * Apakah sebuah laporan masuk dalam antrean Prioritas Verifikasi:
 * status `FLAGGED` ATAU level risiko `HIGH_RISK` / `CRITICAL`.
 * Satu laporan yang memenuhi keduanya tetap dihitung satu kali (deduplicated).
 */
export function isPriorityReport(status: WorkReportStatus, riskLevel: RiskLevel): boolean {
  return status === 'FLAGGED' || riskLevel === 'HIGH_RISK' || riskLevel === 'CRITICAL';
}

/**
 * Mengagregasi baris laporan 30 hari terakhir menjadi struktur OperationalDashboardSummary yang konsisten.
 */
export function aggregateOperationalSummaryFromRows(
  rows: RawOperationalReportRow[],
  referenceDate: Date = new Date(),
  windowDays: number = DEFAULT_SUMMARY_WINDOW_DAYS,
  timeZone: string = OPERATIONAL_TIMEZONE,
  maxPriorityItems = 5
): OperationalDashboardSummary {
  const dateKeys = buildDateWindowKeys(referenceDate, windowDays, timeZone);
  const periodStart = dateKeys[0] ?? toLocalDateKey(referenceDate, timeZone);
  const periodEnd = dateKeys[dateKeys.length - 1] ?? periodStart;
  const dateSet = new Set(dateKeys);

  // Filter hanya baris yang masuk dalam jendela tanggal operasional (30 hari terakhir)
  const validRows = rows.filter(row => {
    if (!row || !row.created_at) return false;
    const key = toLocalDateKey(row.created_at, timeZone);
    return key >= periodStart && key <= periodEnd;
  });

  const totalJobs = validRows.length;
  let completedJobs = 0;
  let workingJobs = 0;
  let flaggedJobs = 0;
  let highRiskCount = 0;
  let durationSumSeconds = 0;
  let durationCount = 0;
  let riskScoreSum = 0;

  const trendMap = new Map<string, DailyJobTrendPoint>();
  for (const key of dateKeys) {
    trendMap.set(key, { date: key, total: 0, completed: 0, flagged: 0 });
  }

  const statusCounts: Record<WorkReportStatus, number> = {
    DRAFT: 0,
    READY: 0,
    WORKING: 0,
    COMPLETED: 0,
    FLAGGED: 0,
    REVIEWED: 0,
  };

  const uniquePriorityMap = new Map<string, PriorityVerificationReportItem>();

  for (const row of validRows) {
    const rawStatus = (row.status || 'READY') as WorkReportStatus;
    const status: WorkReportStatus = CANONICAL_REPORT_STATUSES.includes(rawStatus) ? rawStatus : 'READY';
    const riskLevel = ((row.risk_level || 'NORMAL') as RiskLevel);
    const riskScore = Number(row.risk_score ?? 0);
    const durationSec = row.duration_seconds != null ? Number(row.duration_seconds) : null;

    statusCounts[status] = (statusCounts[status] ?? 0) + 1;

    if (status === 'COMPLETED' || status === 'REVIEWED') {
      completedJobs++;
    }
    if (status === 'WORKING') {
      workingJobs++;
    }
    if (status === 'FLAGGED') {
      flaggedJobs++;
    }
    if (riskLevel === 'HIGH_RISK' || riskLevel === 'CRITICAL') {
      highRiskCount++;
    }

    if (durationSec != null && durationSec > 0) {
      durationSumSeconds += durationSec;
      durationCount++;
    }
    riskScoreSum += Number.isFinite(riskScore) ? riskScore : 0;

    const dayKey = toLocalDateKey(row.created_at, timeZone);
    if (dateSet.has(dayKey)) {
      const pt = trendMap.get(dayKey)!;
      pt.total += 1;
      if (status === 'COMPLETED' || status === 'REVIEWED') {
        pt.completed += 1;
      }
      if (status === 'FLAGGED') {
        pt.flagged += 1;
      }
    }

    if (row.id && isPriorityReport(status, riskLevel) && !uniquePriorityMap.has(row.id)) {
      const p = row.projects || {};
      const u = row.users || {};
      uniquePriorityMap.set(row.id, {
        id: row.id,
        projectId: p.id || row.project_id || '',
        projectName: p.project_name || 'Proyek Lapangan',
        clientName: p.client_name || '',
        serviceType: (p.service_type || 'GENERAL_PEST_CONTROL') as ServiceType,
        executorName: u.name || 'Teknisi Lapangan',
        status,
        riskScore: Number.isFinite(riskScore) ? riskScore : 0,
        riskLevel,
        checkInValid: row.check_in_valid ?? null,
        checkInDistance: row.check_in_distance != null ? Number(row.check_in_distance) : null,
        durationSeconds: durationSec,
        createdAt: row.created_at,
      });
    }
  }

  const avgDurationMinutes = durationCount > 0 ? Math.round(durationSumSeconds / durationCount / 60) : 0;
  const avgRiskScore = totalJobs > 0 ? Math.round(riskScoreSum / totalJobs) : 0;

  const dailyTrend = dateKeys.map(k => trendMap.get(k)!);
  const statusBreakdown: WorkStatusBreakdownItem[] = CANONICAL_REPORT_STATUSES.map(status => ({
    status,
    count: statusCounts[status] ?? 0,
  }));

  const allPriority = Array.from(uniquePriorityMap.values()).sort((a, b) => {
    const rankDiff = getPriorityUrgencyRank(b.status, b.riskLevel) - getPriorityUrgencyRank(a.status, a.riskLevel);
    if (rankDiff !== 0) return rankDiff;
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return {
    totalJobs,
    completedJobs,
    workingJobs,
    flaggedJobs,
    highRiskCount,
    avgDurationMinutes,
    avgRiskScore,
    windowDays,
    periodStart,
    periodEnd,
    generatedAt: referenceDate.toISOString(),
    priorityUniqueCount: allPriority.length,
    dailyTrend,
    statusBreakdown,
    priorityReports: allPriority.slice(0, maxPriorityItems),
  };
}

// ─── JARIVIS 4-TAB DASHBOARD AGGREGATION ENGINE ──────────────────────────────

export type JarivisDashboardTabId = 'operationCenter' | 'liveMap' | 'performanceTeam' | 'business';
export type JarivisPeriodKey = 'week' | 'month' | 'quarter' | 'year' | 'custom30';

export interface JarivisServiceCategorySlice {
  id: string;
  label: string;
  color: string;
  count: number;
}

export interface JarivisAttentionMetricRow {
  id: string;
  label: string;
  count: number;
  targetAction: 'anomalies' | 'reports' | 'quotation' | 'executors';
}

export interface JarivisMapCustomerItem {
  id: string;
  projectName: string;
  clientName: string;
  address: string;
  bucket: 'pending' | 'delayed' | 'completed';
  statusLabel: string;
  latitude: number;
  longitude: number;
}

export interface JarivisComputedDashboardData {
  selectedDateKey: string;
  isToday: boolean;
  operationCenter: {
    assignedTasks: { completed: number; total: number; pct: number; deltaPct: number };
    workforceToday: { clockedIn: number; totalStaff: number; pct: number; deltaPct: number };
    customerVisits: { visited: number; totalPlanned: number; pct: number; deltaPct: number };
    flaggedRate: { flagged: number; total: number; pct: number; deltaPct: number };
    efficiency: {
      avgStartTime: string;
      avgEndTime: string;
      avgDuration: string;
    };
    attentionRows: JarivisAttentionMetricRow[];
    idleStaffCount: number;
  };
  liveMap: {
    overviewTasks: { pending: number; delayed: number; completed: number };
    overviewLocations: { pending: number; delayed: number; completed: number };
    activeMembersCount: number;
    idleMembersCount: number;
    activeVisitsCount: number;
    unfinishedMembersCount: number;
    completedMembersCount: number;
    customerLocations: JarivisMapCustomerItem[];
  };
  performanceTeam: {
    periodLabel: string;
    comparisonSuffix: string;
    attendanceRatePct: number;
    completionRatePct: number;
    pendingRatePct: number;
    flaggedRatePct: number;
    avgAssignedPerMember: number;
    avgCompletedPerMember: number;
    highestGap: { count: number; dateKey: string };
    highestCompletion: { count: number; dateKey: string };
    totalCompletedInPeriod: number;
    serviceSlices: JarivisServiceCategorySlice[];
  };
  business: {
    activeCustomersCount: number;
    expiringContractsCount: number;
    totalCustomerTasksAssigned: number;
    totalCustomerTasksCompleted: number;
    newCustomersOrQuotationsCount: number;
    inactiveCustomersCount: number;
    avgTasksAssignedPerCustomer: number;
    avgTasksCompletedPerCustomer: number;
    funnel: {
      newLeadsCount: number;
      contactedOrApprovedCount: number;
      visitsOrDealCount: number;
      totalEstimatedRevenueIdr: number;
      totalLeadsCount: number;
    };
  };
}

function getPeriodDayWindow(period: JarivisPeriodKey): { days: number; label: string; comparisonSuffix: string } {
  switch (period) {
    case 'week':
      return { days: 7, label: 'Minggu Ini', comparisonSuffix: 'dari minggu lalu' };
    case 'month':
      return { days: 30, label: 'Bulan Ini', comparisonSuffix: 'dari bulan lalu' };
    case 'quarter':
      return { days: 90, label: 'Kuartal Ini', comparisonSuffix: 'dari kuartal lalu' };
    case 'year':
      return { days: 365, label: 'Tahun Ini', comparisonSuffix: 'dari tahun lalu' };
    case 'custom30':
    default:
      return { days: 30, label: '30 Hari Terakhir', comparisonSuffix: 'dari bulan lalu' };
  }
}

function formatMinutesLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0s';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}j ${m}m` : `${h}j`;
}

function computeAverageClockTime(timestamps: (string | null | undefined)[]): string {
  const validMinutes: number[] = [];
  for (const ts of timestamps) {
    if (!ts) continue;
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) continue;
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: OPERATIONAL_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
        .format(d)
        .split(':')
        .map(Number);
      if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
        validMinutes.push(parts[0] * 60 + parts[1]);
      }
    } catch {
      // ignore invalid format
    }
  }
  if (validMinutes.length === 0) return '0s';
  const avg = Math.round(validMinutes.reduce((a, b) => a + b, 0) / validMinutes.length);
  const hh = String(Math.floor(avg / 60)).padStart(2, '0');
  const mm = String(avg % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function computeJarivisDashboardMetrics(params: {
  summary: KPIStats | null;
  reports: WorkReportListItem[];
  projects: Project[];
  executors: ExecutorStats[];
  quotations: Quotation[];
  selectedDateKey: string;
  selectedPeriod: JarivisPeriodKey;
  referenceDate?: Date;
}): JarivisComputedDashboardData {
  const {
    summary,
    reports,
    projects,
    executors,
    quotations,
    selectedDateKey,
    selectedPeriod,
    referenceDate = new Date(),
  } = params;

  const todayKey = toLocalDateKey(referenceDate);
  const isToday = selectedDateKey === todayKey;
  const yesterdayKey = shiftDateKey(selectedDateKey, -1);

  const activeExecutors = executors.filter(e => e.isActive !== false);
  const totalStaff = Math.max(activeExecutors.length, executors.length);

  // Daily trend lookup from summary
  const trendList = summary?.dailyTrend ?? [];
  const selectedDayTrend = trendList.find(d => d.date === selectedDateKey);
  const yesterdayTrend = trendList.find(d => d.date === yesterdayKey);

  // Filter reports matching selectedDateKey
  const dayReports = reports.filter(r => toLocalDateKey(r.createdAt) === selectedDateKey);
  const yesterdayReports = reports.filter(r => toLocalDateKey(r.createdAt) === yesterdayKey);

  const dayTotal = Math.max(dayReports.length, selectedDayTrend?.total ?? 0);
  const dayCompleted = Math.max(
    dayReports.filter(r => r.status === 'COMPLETED' || r.status === 'REVIEWED').length,
    selectedDayTrend?.completed ?? 0
  );
  const dayFlagged = Math.max(
    dayReports.filter(r => r.status === 'FLAGGED').length,
    selectedDayTrend?.flagged ?? 0
  );
  const dayWorking = dayReports.filter(r => r.status === 'WORKING').length;

  const prevTotal = Math.max(yesterdayReports.length, yesterdayTrend?.total ?? 0);
  const prevCompleted = Math.max(
    yesterdayReports.filter(r => r.status === 'COMPLETED' || r.status === 'REVIEWED').length,
    yesterdayTrend?.completed ?? 0
  );
  const prevFlagged = Math.max(
    yesterdayReports.filter(r => r.status === 'FLAGGED').length,
    yesterdayTrend?.flagged ?? 0
  );

  const assignedPct = dayTotal > 0 ? Math.round((dayCompleted / dayTotal) * 100) : 0;
  const prevAssignedPct = prevTotal > 0 ? Math.round((prevCompleted / prevTotal) * 100) : 0;

  const clockedInSet = new Set(
    dayReports.filter(r => r.checkInAt || r.status !== 'DRAFT').map(r => r.executor?.id).filter(Boolean)
  );
  const prevClockedInSet = new Set(
    yesterdayReports.filter(r => r.checkInAt || r.status !== 'DRAFT').map(r => r.executor?.id).filter(Boolean)
  );
  const clockedInCount = clockedInSet.size;
  const workforcePct = totalStaff > 0 ? Math.round((clockedInCount / totalStaff) * 100) : 0;
  const prevWorkforcePct = totalStaff > 0 ? Math.round((prevClockedInSet.size / totalStaff) * 100) : 0;

  const visitedProjectIds = new Set(dayReports.map(r => r.project?.id).filter(Boolean));
  const plannedProjectsCount = Math.max(projects.length, dayTotal);
  const visitPct = plannedProjectsCount > 0 ? Math.round((visitedProjectIds.size / plannedProjectsCount) * 100) : 0;

  const flaggedPct = dayTotal > 0 ? Math.round((dayFlagged / dayTotal) * 100) : 0;
  const prevFlaggedPct = prevTotal > 0 ? Math.round((prevFlagged / prevTotal) * 100) : 0;

  // Efficiency metrics
  const avgStartTime = computeAverageClockTime(dayReports.map(r => r.checkInAt || r.createdAt));
  const avgEndTime = computeAverageClockTime(dayReports.map(r => r.checkOutAt));
  const avgDuration = formatMinutesLabel(summary?.avgDurationMinutes ?? 0);

  // Attention rows ("PERLU PERHATIAN!")
  const outsideGpsCount = reports.filter(r => r.checkInValid === false).length;
  const draftQuotationsCount = quotations.filter(q => q.status === 'draft' || q.status === 'pending').length;
  const absentTodayCount = Math.max(0, totalStaff - clockedInCount);
  const pendingReportsTotal =
    (summary?.statusBreakdown ?? [])
      .filter(s => s.status === 'DRAFT' || s.status === 'READY')
      .reduce((acc, s) => acc + s.count, 0) ||
    reports.filter(r => r.status === 'DRAFT' || r.status === 'READY').length;

  const attentionRows: JarivisAttentionMetricRow[] = [
    { id: 'absent', label: 'Belum Check-In Hari Ini', count: absentTodayCount, targetAction: 'executors' },
    { id: 'gps', label: 'GPS Di Luar Radius', count: outsideGpsCount, targetAction: 'anomalies' },
    { id: 'highrisk', label: 'Risiko Tinggi / Kritis', count: summary?.highRiskCount ?? 0, targetAction: 'anomalies' },
    { id: 'pending', label: 'Tugas Belum Dikerjakan', count: pendingReportsTotal, targetAction: 'reports' },
    {
      id: 'flagged',
      label: 'Tugas Perlu Pemeriksaan (Flagged)',
      count: summary?.flaggedJobs ?? 0,
      targetAction: 'anomalies',
    },
  ];

  // Idle staff (>5 days without completed/active tasks)
  const fiveDaysAgoKey = shiftDateKey(todayKey, -5);
  const recentActiveExecutorIds = new Set(
    reports
      .filter(r => toLocalDateKey(r.createdAt) >= fiveDaysAgoKey)
      .map(r => r.executor?.id)
      .filter(Boolean)
  );
  const idleStaffCount = activeExecutors.filter(
    e => !recentActiveExecutorIds.has(e.id) && (e.totalJobs ?? 0) === 0
  ).length;

  // Live Map Categorization
  const projectReportStatusMap = new Map<string, WorkReportStatus>();
  for (const r of reports) {
    if (r.project?.id && !projectReportStatusMap.has(r.project.id)) {
      projectReportStatusMap.set(r.project.id, r.status);
    }
  }

  const customerLocations: JarivisMapCustomerItem[] = projects.map(p => {
    const st = projectReportStatusMap.get(p.id);
    let bucket: 'pending' | 'delayed' | 'completed' = 'pending';
    let statusLabel = 'Belum Dikerjakan';
    if (st === 'COMPLETED' || st === 'REVIEWED') {
      bucket = 'completed';
      statusLabel = 'Selesai';
    } else if (st === 'FLAGGED' || st === 'DRAFT') {
      bucket = 'delayed';
      statusLabel = st === 'FLAGGED' ? 'Perlu Cek' : 'Ditunda';
    } else if (st === 'WORKING') {
      bucket = 'pending';
      statusLabel = 'Sedang Dikerjakan';
    }
    return {
      id: p.id,
      projectName: p.projectName,
      clientName: p.clientName,
      address: p.address,
      bucket,
      statusLabel,
      latitude: p.latitude,
      longitude: p.longitude,
    };
  });

  const locPending = customerLocations.filter(c => c.bucket === 'pending').length;
  const locDelayed = customerLocations.filter(c => c.bucket === 'delayed').length;
  const locCompleted = customerLocations.filter(c => c.bucket === 'completed').length;

  // Performance Team Period Metrics
  const periodMeta = getPeriodDayWindow(selectedPeriod);
  const periodStartKey = shiftDateKey(todayKey, -(periodMeta.days - 1));
  const periodTrend = trendList.filter(d => d.date >= periodStartKey && d.date <= todayKey);

  const periodTotalJobs =
    selectedPeriod === 'month' || selectedPeriod === 'custom30'
      ? summary?.totalJobs ?? 0
      : periodTrend.reduce((acc, d) => acc + d.total, 0);
  const periodCompletedJobs =
    selectedPeriod === 'month' || selectedPeriod === 'custom30'
      ? summary?.completedJobs ?? 0
      : periodTrend.reduce((acc, d) => acc + d.completed, 0);
  const periodFlaggedJobs =
    selectedPeriod === 'month' || selectedPeriod === 'custom30'
      ? summary?.flaggedJobs ?? 0
      : periodTrend.reduce((acc, d) => acc + d.flagged, 0);

  const activeStaffWithJobs = activeExecutors.filter(e => (e.totalJobs ?? 0) > 0).length;
  const attendanceRatePct = totalStaff > 0 ? Math.round((activeStaffWithJobs / totalStaff) * 100) : 0;
  const completionRatePct =
    periodTotalJobs > 0 ? Math.round((periodCompletedJobs / periodTotalJobs) * 100) : 0;
  const pendingRatePct =
    periodTotalJobs > 0 ? Math.round((pendingReportsTotal / periodTotalJobs) * 100) : 0;
  const flaggedRatePct =
    periodTotalJobs > 0 ? Math.round((periodFlaggedJobs / periodTotalJobs) * 100) : 0;

  const avgAssignedPerMember =
    totalStaff > 0 ? Math.round((periodTotalJobs / totalStaff) * 10) / 10 : 0;
  const avgCompletedPerMember =
    totalStaff > 0 ? Math.round((periodCompletedJobs / totalStaff) * 10) / 10 : 0;

  let highestGap = { count: 0, dateKey: periodStartKey || todayKey };
  let highestCompletion = { count: 0, dateKey: periodStartKey || todayKey };
  for (const pt of trendList) {
    const gap = Math.max(0, pt.total - pt.completed);
    if (gap > highestGap.count) {
      highestGap = { count: gap, dateKey: pt.date };
    }
    if (pt.completed > highestCompletion.count) {
      highestCompletion = { count: pt.completed, dateKey: pt.date };
    }
  }

  // Service category mix (from app.jarivis.com Beranda)
  const completedReportsList = reports.filter(
    r => r.status === 'COMPLETED' || r.status === 'REVIEWED'
  );
  const countByService = (types: ServiceType[]) =>
    completedReportsList.filter(r => types.includes(r.project?.serviceType)).length;

  const surveyTermiteCount = quotations.filter(q => q.kategori === 'AR').length;
  const surveyPestCount = quotations.filter(q => q.kategori === 'PCO').length;

  const serviceSlices: JarivisServiceCategorySlice[] = [
    {
      id: 'termite',
      label: 'Work Report Termite',
      color: '#3b82f6',
      count: countByService(['TERMITE_CONTROL']),
    },
    {
      id: 'fumigation',
      label: 'Fumigasi',
      color: '#10b981',
      count: countByService(['FUMIGATION']),
    },
    {
      id: 'rodent',
      label: 'Rodent Control',
      color: '#f43f5e',
      count: countByService(['RODENT_CONTROL']),
    },
    {
      id: 'pest',
      label: 'Work Report Pest Control',
      color: '#a855f7',
      count: countByService([
        'GENERAL_PEST_CONTROL',
        'MOSQUITO_CONTROL',
        'BIRD_CONTROL',
        'BED_BUG_CONTROL',
        'DISINFECTION',
      ]),
    },
    {
      id: 'survey_ar',
      label: 'Survey Termite Control',
      color: '#64748b',
      count: surveyTermiteCount,
    },
    {
      id: 'survey_pco',
      label: 'Survey Pest Control',
      color: '#38bdf8',
      count: surveyPestCount,
    },
  ];

  // Business Tab Metrics (8 KPI Cards + Leads/Quotation Funnel)
  const uniqueClientNames = new Set<string>();
  for (const p of projects) {
    if (p.clientName) uniqueClientNames.add(p.clientName.trim().toLowerCase());
  }
  for (const q of quotations) {
    if (q.kepadaNama) uniqueClientNames.add(q.kepadaNama.trim().toLowerCase());
  }
  const activeCustomersCount = Math.max(uniqueClientNames.size, projects.length);

  const visitedClientNames = new Set<string>();
  for (const r of reports) {
    if (r.project?.clientName) visitedClientNames.add(r.project.clientName.trim().toLowerCase());
  }
  const inactiveCustomersCount = Math.max(0, activeCustomersCount - visitedClientNames.size);

  const expiringContractsCount = projects.filter(p => {
    if (!p.nextServiceDate) return false;
    const key = toLocalDateKey(p.nextServiceDate);
    return key >= todayKey && key <= shiftDateKey(todayKey, 30);
  }).length;

  const newLeadsCount = draftQuotationsCount;
  const contactedOrApprovedCount = quotations.filter(
    q => q.status === 'approved' || q.status === 'sent_to_client'
  ).length;
  const visitsOrDealCount =
    quotations.filter(q => q.status === 'deal').length + visitedProjectIds.size;

  const totalEstimatedRevenueIdr = quotations
    .filter(q => q.status !== 'rejected' && q.status !== 'cancelled')
    .reduce((sum, q) => sum + (Number(q.total) || 0), 0);

  const avgTasksAssignedPerCustomer =
    activeCustomersCount > 0
      ? Math.round((periodTotalJobs / activeCustomersCount) * 10) / 10
      : 0;
  const avgTasksCompletedPerCustomer =
    activeCustomersCount > 0
      ? Math.round((periodCompletedJobs / activeCustomersCount) * 10) / 10
      : 0;

  return {
    selectedDateKey,
    isToday,
    operationCenter: {
      assignedTasks: {
        completed: dayCompleted,
        total: dayTotal,
        pct: assignedPct,
        deltaPct: assignedPct - prevAssignedPct,
      },
      workforceToday: {
        clockedIn: clockedInCount,
        totalStaff,
        pct: workforcePct,
        deltaPct: workforcePct - prevWorkforcePct,
      },
      customerVisits: {
        visited: visitedProjectIds.size,
        totalPlanned: plannedProjectsCount,
        pct: visitPct,
        deltaPct: 0,
      },
      flaggedRate: {
        flagged: dayFlagged,
        total: dayTotal,
        pct: flaggedPct,
        deltaPct: flaggedPct - prevFlaggedPct,
      },
      efficiency: {
        avgStartTime,
        avgEndTime,
        avgDuration,
      },
      attentionRows,
      idleStaffCount,
    },
    liveMap: {
      overviewTasks: {
        pending: pendingReportsTotal,
        delayed: summary?.flaggedJobs ?? 0,
        completed: summary?.completedJobs ?? 0,
      },
      overviewLocations: {
        pending: locPending,
        delayed: locDelayed,
        completed: locCompleted,
      },
      activeMembersCount: clockedInCount,
      idleMembersCount: Math.max(0, totalStaff - clockedInCount),
      activeVisitsCount: dayWorking || (summary?.workingJobs ?? 0),
      unfinishedMembersCount: pendingReportsTotal,
      completedMembersCount: dayCompleted || (summary?.completedJobs ?? 0),
      customerLocations,
    },
    performanceTeam: {
      periodLabel: periodMeta.label,
      comparisonSuffix: periodMeta.comparisonSuffix,
      attendanceRatePct,
      completionRatePct,
      pendingRatePct,
      flaggedRatePct,
      avgAssignedPerMember,
      avgCompletedPerMember,
      highestGap,
      highestCompletion,
      totalCompletedInPeriod: periodCompletedJobs,
      serviceSlices,
    },
    business: {
      activeCustomersCount,
      expiringContractsCount,
      totalCustomerTasksAssigned: periodTotalJobs,
      totalCustomerTasksCompleted: periodCompletedJobs,
      newCustomersOrQuotationsCount: quotations.length,
      inactiveCustomersCount,
      avgTasksAssignedPerCustomer,
      avgTasksCompletedPerCustomer,
      funnel: {
        newLeadsCount,
        contactedOrApprovedCount,
        visitsOrDealCount,
        totalEstimatedRevenueIdr,
        totalLeadsCount: quotations.length,
      },
    },
  };
}
