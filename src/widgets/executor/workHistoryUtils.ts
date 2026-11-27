import { WorkReport } from '@/entities/types';
import { formatWoCode, isTermiteService } from './techLiteUtils';

export type HistoryCategoryFilter = 'ALL' | 'AR' | 'PCO';
export type HistoryDatePreset = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH';
export type HistoryStatusFilter = 'ALL' | 'COMPLETED' | 'REVIEWED' | 'FLAGGED';

export interface HistoryFilterOptions {
  category: HistoryCategoryFilter;
  status?: HistoryStatusFilter;
  search: string;
  preset: HistoryDatePreset;
  dateFrom?: string;
  dateTo?: string;
  referenceDate?: Date;
}

export interface HistoryStatusCounts {
  all: number;
  completed: number;
  reviewed: number;
  flagged: number;
}

export interface HistoryStatusMeta {
  label: string;
  tone: 'completed' | 'reviewed' | 'flagged';
}

export interface HistoryDateGroup<T extends WorkReport = WorkReport> {
  dateKey: string;
  title: string;
  subtitle: string;
  count: number;
  reports: T[];
}

export interface HistorySummaryStats {
  totalReports: number;
  totalDays: number;
  termiteCount: number;
  pestCount: number;
}

const WEEKDAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_SHORT_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/**
 * Formats a Date into local YYYY-MM-DD calendar key.
 */
export function toHistoryDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parses a YYYY-MM-DD string or ISO timestamp into a local Date.
 */
export function parseHistoryDate(raw?: string | null): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, day] = trimmed.split('-').map(Number);
    const localDate = new Date(y, m - 1, day, 12, 0, 0);
    return Number.isNaN(localDate.getTime()) ? null : localDate;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Resolves the authoritative completion timestamp for a history report.
 */
export function getReportCompletionDate(
  report: Pick<WorkReport, 'checkOutAt' | 'checkInAt' | 'createdAt'> & {
    scheduledDate?: string | null;
  }
): Date {
  return (
    parseHistoryDate(report.checkOutAt) ||
    parseHistoryDate(report.checkInAt) ||
    parseHistoryDate(report.scheduledDate) ||
    parseHistoryDate(report.createdAt) ||
    new Date()
  );
}

/**
 * Formats human-friendly Indonesian date header title and subtitle for a YYYY-MM-DD key.
 * Examples:
 * - Today -> { title: "Hari Ini", subtitle: "Jumat, 20 Nov 2026" }
 * - Yesterday -> { title: "Kemarin", subtitle: "Kamis, 19 Nov 2026" }
 * - Older -> { title: "Selasa, 17 Nov 2026", subtitle: "3 hari lalu" }
 */
export function formatHistoryDateHeader(
  dateKey: string,
  referenceDate: Date = new Date()
): { title: string; subtitle: string } {
  const [y, m, day] = dateKey.split('-').map(Number);
  const target = new Date(y, (m || 1) - 1, day || 1);
  if (Number.isNaN(target.getTime())) {
    return { title: dateKey, subtitle: '' };
  }

  const weekday = WEEKDAY_NAMES_ID[target.getDay()];
  const fullReadable = `${weekday}, ${target.getDate()} ${MONTH_SHORT_ID[target.getMonth()]} ${target.getFullYear()}`;

  const refStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffDays = Math.round((refStart.getTime() - targetStart.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) {
    return { title: 'Hari Ini', subtitle: fullReadable };
  }
  if (diffDays === 1) {
    return { title: 'Kemarin', subtitle: fullReadable };
  }
  if (diffDays > 1 && diffDays < 7) {
    return { title: fullReadable, subtitle: `${diffDays} hari lalu` };
  }
  if (diffDays >= 7 && diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return { title: fullReadable, subtitle: `${weeks} minggu lalu` };
  }
  if (diffDays >= 30) {
    const months = Math.floor(diffDays / 30);
    return { title: fullReadable, subtitle: `${months} bulan lalu` };
  }
  return { title: fullReadable, subtitle: 'Terjadwal' };
}

/**
 * Filters completed work reports by service category, search query, quick date preset,
 * and optional custom date range, returning them sorted newest-first.
 */
export function filterHistoryReports<T extends WorkReport>(
  reports: T[],
  options: HistoryFilterOptions
): T[] {
  const ref = options.referenceDate ?? new Date();
  const refStart = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
  const q = options.search.trim().toLowerCase();

  const fromDate = options.dateFrom ? new Date(`${options.dateFrom}T00:00:00`) : null;
  const toDate = options.dateTo ? new Date(`${options.dateTo}T23:59:59.999`) : null;

  const filtered = reports.filter(rep => {
    if (options.category === 'AR' && !isTermiteService(rep.serviceType)) return false;
    if (options.category === 'PCO' && isTermiteService(rep.serviceType)) return false;
    if (options.status && options.status !== 'ALL' && rep.status !== options.status) return false;

    if (q) {
      const wo = formatWoCode(rep.id).toLowerCase();
      const haystack = [
        rep.projectName,
        rep.clientName || '',
        rep.projectAddress || '',
        rep.customerName || '',
        wo,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    const repDate = getReportCompletionDate(rep);

    // Custom date range takes precedence when set
    if (fromDate && repDate < fromDate) return false;
    if (toDate && repDate > toDate) return false;

    if (!fromDate && !toDate && options.preset !== 'ALL') {
      const repDayStart = new Date(repDate.getFullYear(), repDate.getMonth(), repDate.getDate(), 0, 0, 0, 0);
      const diffDays = Math.floor((refStart.getTime() - repDayStart.getTime()) / (24 * 60 * 60 * 1000));
      if (options.preset === 'TODAY' && diffDays !== 0) return false;
      if (options.preset === 'WEEK' && (diffDays < 0 || diffDays > 6)) return false;
      if (options.preset === 'MONTH' && (diffDays < 0 || diffDays > 29)) return false;
    }

    return true;
  });

  return [...filtered].sort(
    (a, b) => getReportCompletionDate(b).getTime() - getReportCompletionDate(a).getTime()
  );
}

/**
 * Groups completed reports by local calendar date (newest date first),
 * preserving newest-first order inside each date category.
 */
export function groupHistoryReportsByDate<T extends WorkReport>(
  reports: T[],
  referenceDate: Date = new Date()
): HistoryDateGroup<T>[] {
  const sorted = [...reports].sort(
    (a, b) => getReportCompletionDate(b).getTime() - getReportCompletionDate(a).getTime()
  );

  const map = new Map<string, T[]>();
  for (const rep of sorted) {
    const key = toHistoryDateKey(getReportCompletionDate(rep));
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(rep);
    } else {
      map.set(key, [rep]);
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, items]) => {
      const { title, subtitle } = formatHistoryDateHeader(dateKey, referenceDate);
      return {
        dateKey,
        title,
        subtitle,
        count: items.length,
        reports: items,
      };
    });
}

export function buildHistorySummaryStats(
  groups: ReadonlyArray<HistoryDateGroup<WorkReport>>
): HistorySummaryStats {
  let totalReports = 0;
  let termiteCount = 0;
  let pestCount = 0;

  for (const group of groups) {
    totalReports += group.reports.length;
    for (const rep of group.reports) {
      if (isTermiteService(rep.serviceType)) termiteCount += 1;
      else pestCount += 1;
    }
  }

  return {
    totalReports,
    totalDays: groups.length,
    termiteCount,
    pestCount,
  };
}

export function countHistoryByStatus(
  reports: ReadonlyArray<Pick<WorkReport, 'status'>>
): HistoryStatusCounts {
  let completed = 0;
  let reviewed = 0;
  let flagged = 0;

  for (const rep of reports) {
    if (rep.status === 'COMPLETED') completed += 1;
    else if (rep.status === 'REVIEWED') reviewed += 1;
    else if (rep.status === 'FLAGGED') flagged += 1;
  }

  return {
    all: reports.length,
    completed,
    reviewed,
    flagged,
  };
}

export function getHistoryStatusMeta(status?: string | null): HistoryStatusMeta {
  switch (status) {
    case 'REVIEWED':
      return { label: 'Ditinjau', tone: 'reviewed' };
    case 'FLAGGED':
      return { label: 'Ditandai', tone: 'flagged' };
    case 'COMPLETED':
    default:
      return { label: 'Selesai', tone: 'completed' };
  }
}
