import { WorkReport } from '@/entities/types';

/**
 * Generates a deterministic, human-readable Work Order code (e.g. "WO-8492")
 * from a UUID or string identifier without altering backend IDs.
 */
export function formatWoCode(id?: string | null): string {
  const raw = String(id || '').trim();
  if (!raw) return 'WO-0000';
  if (/^WO-\d{4,}$/i.test(raw)) return raw.toUpperCase();

  // Extract digits first if present, otherwise derive stable 4-digit code
  const digits = raw.replace(/\D+/g, '');
  if (digits.length >= 4) {
    return `WO-${digits.slice(-4)}`;
  }

  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) % 10000;
  }
  return `WO-${String(Math.abs(hash)).padStart(4, '0')}`;
}

export type DayBucket = 'yesterday' | 'today' | 'tomorrow' | 'other';

function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Classifies an ISO date or YYYY-MM-DD string relative to referenceDate
 * into Kemarin / Hari Ini / Besok / Lainnya using local calendar boundaries.
 */
export function getDayBucket(dateStr?: string | null, referenceDate: Date = new Date()): DayBucket {
  if (!dateStr) return 'today';

  let parsed: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    const [y, m, d] = dateStr.trim().split('-').map(Number);
    parsed = new Date(y, m - 1, d);
  } else {
    parsed = new Date(dateStr);
  }

  if (Number.isNaN(parsed.getTime())) return 'today';

  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const key = toLocalDateKey(parsed);
  if (key === toLocalDateKey(today)) return 'today';
  if (key === toLocalDateKey(yesterday)) return 'yesterday';
  if (key === toLocalDateKey(tomorrow)) return 'tomorrow';
  return 'other';
}

export function isTermiteService(serviceType?: string | null): boolean {
  return serviceType === 'TERMITE_CONTROL';
}

export function getServiceLabel(serviceType?: string | null): string {
  return isTermiteService(serviceType) ? 'Anti Rayap' : 'Pest Control';
}

/**
 * Strictly locks the Technician Worksheet mode to the assigned Work Order service type.
 * Anti Rayap tasks can only use the AR form; Pest Control tasks can only use the PCO form.
 */
export function resolveLockedWorksheetMode(serviceType?: string | null): 'AR' | 'PCO' {
  return isTermiteService(serviceType) ? 'AR' : 'PCO';
}

export const SAMPLE_COMPLETE_REPORT_ID = 'wr-contoh-lengkap-00';

export function isSampleCompleteReport(reportId?: string | null): boolean {
  return reportId === SAMPLE_COMPLETE_REPORT_ID;
}

export function getInitials(name?: string | null): string {
  const clean = String(name || '').trim();
  if (!clean) return 'TK';
  return clean
    .split(/\s+/)
    .map(part => part[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function formatTimeWib(isoOrTime?: string | null, fallback = '09.00'): string {
  if (!isoOrTime) return `${fallback} WIB`;
  const trimmed = isoOrTime.trim();
  if (/^\d{1,2}[:.]\d{2}/.test(trimmed)) {
    return `${trimmed.slice(0, 5).replace(':', '.')} WIB`;
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return `${fallback} WIB`;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}.${mm} WIB`;
}

export function formatDurationId(
  durationSeconds?: number | null,
  checkInAt?: string | null,
  checkOutAt?: string | null
): string {
  let seconds = typeof durationSeconds === 'number' && durationSeconds > 0 ? durationSeconds : 0;
  if (!seconds && checkInAt && checkOutAt) {
    const start = new Date(checkInAt).getTime();
    const end = new Date(checkOutAt).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
      seconds = Math.floor((end - start) / 1000);
    }
  }
  if (seconds <= 0) return '-';
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0 && mins > 0) return `${hours} Jam ${mins} Menit`;
  if (hours > 0) return `${hours} Jam`;
  return `${mins} Menit`;
}

export function extractSeverityFromFindings(findings: Array<{ notes?: string }>): string | null {
  for (const f of findings) {
    const match = String(f.notes || '').match(/Keparahan:\s*([^|\]]+)/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

export function extractColonyFromFindings(findings: Array<{ notes?: string }>): string | null {
  for (const f of findings) {
    const match = String(f.notes || '').match(/Koloni:\s*([^|\]]+)/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

export function getTechnicianTeamList(
  report: Pick<WorkReport, 'teamMembers' | 'executorName'>
): Array<{ name: string; role: string }> {
  if (report.teamMembers && report.teamMembers.length > 0) {
    return report.teamMembers.map((m, idx) => ({
      name: m.name,
      role: m.role || (idx === 0 ? 'Teknisi Utama' : 'Anggota Tim'),
    }));
  }
  return [{ name: report.executorName || 'Teknisi Lapangan', role: 'Teknisi Pelaksana' }];
}

export function getTechSigStorageKey(reportId: string): string {
  return `fw_tech_sig_${reportId}`;
}

export function getTechSigTimeStorageKey(reportId: string): string {
  return `fw_tech_sig_at_${reportId}`;
}
