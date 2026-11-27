import { RiskLevel, WorkReportStatus } from '@/entities/types';

export interface RiskLevelMeta {
  label: string;
  badgeClass: string;
  dotClass: string;
  description: string;
}

const META: Record<RiskLevel, RiskLevelMeta> = {
  NORMAL: {
    label: 'Normal',
    badgeClass: 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)] border-[var(--status-completed-border)]',
    dotClass: 'bg-emerald-500',
    description: 'Presensi, durasi, dan bukti foto sesuai standar operasional.',
  },
  LOW_RISK: {
    label: 'Risiko Rendah',
    badgeClass: 'bg-[var(--status-draft-bg)] text-[var(--status-draft-text)] border-[var(--status-draft-border)]',
    dotClass: 'bg-yellow-500',
    description: 'Terdapat deviasi ringan yang tidak menghambat kelengkapan pekerjaan.',
  },
  REVIEW: {
    label: 'Perlu Ditinjau',
    badgeClass: 'bg-[var(--status-draft-bg)] text-[var(--status-draft-text)] border-[var(--status-draft-border)]',
    dotClass: 'bg-amber-500',
    description: 'Memerlukan peninjauan admin untuk memastikan kesesuaian prosedur.',
  },
  HIGH_RISK: {
    label: 'Risiko Tinggi',
    badgeClass: 'bg-[var(--status-flagged-bg)] text-[var(--status-flagged-text)] border-[var(--status-flagged-border)]',
    dotClass: 'bg-red-600',
    description: 'Indikasi penyimpangan signifikan pada lokasi GPS, durasi, atau treatment.',
  },
  CRITICAL: {
    label: 'Kritis',
    badgeClass: 'bg-[var(--status-flagged-bg)] text-[var(--status-flagged-text)] border-[var(--status-flagged-border)] font-bold',
    dotClass: 'bg-red-700',
    description: 'Pelanggaran batas keselamatan atau anomali berat yang wajib diverifikasi segera.',
  },
};

export function getRiskLevelMeta(level: RiskLevel): RiskLevelMeta {
  return META[level] ?? META.NORMAL;
}

export interface WorkReportStatusMeta {
  status: WorkReportStatus;
  label: string;
  shortLabel: string;
  description: string;
  badgeClass: string;
  barColor: string;
  dotClass: string;
  isVerifiedComplete: boolean;
}

export const WORK_REPORT_STATUS_META: Record<WorkReportStatus, WorkReportStatusMeta> = {
  DRAFT: {
    status: 'DRAFT',
    label: 'Draft',
    shortLabel: 'Draft',
    description: 'Rencana penugasan baru yang belum siap dieksekusi di lapangan.',
    badgeClass: 'bg-[var(--status-draft-bg)] text-[var(--status-draft-text)] border-[var(--status-draft-border)]',
    barColor: 'var(--chart-draft)',
    dotClass: 'bg-amber-500',
    isVerifiedComplete: false,
  },
  READY: {
    status: 'READY',
    label: 'Siap Dikerjakan',
    shortLabel: 'Siap Check-in',
    description: 'Penugasan siap dimulai oleh teknisi saat tiba di lokasi proyek.',
    badgeClass: 'bg-[var(--status-ready-bg)] text-[var(--status-ready-text)] border-[var(--status-ready-border)]',
    barColor: 'var(--chart-ready)',
    dotClass: 'bg-slate-500',
    isVerifiedComplete: false,
  },
  WORKING: {
    status: 'WORKING',
    label: 'Sedang Berlangsung',
    shortLabel: 'Berlangsung',
    description: 'Teknisi sudah melakukan check-in GPS dan sedang mengerjakan treatment.',
    badgeClass: 'bg-[var(--status-working-bg)] text-[var(--status-working-text)] border-[var(--status-working-border)]',
    barColor: 'var(--chart-working)',
    dotClass: 'bg-blue-500',
    isVerifiedComplete: false,
  },
  COMPLETED: {
    status: 'COMPLETED',
    label: 'Selesai',
    shortLabel: 'Selesai',
    description: 'Pekerjaan selesai check-out tanpa anomali yang menahan status.',
    badgeClass: 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)] border-[var(--status-completed-border)]',
    barColor: 'var(--chart-completed)',
    dotClass: 'bg-emerald-500',
    isVerifiedComplete: true,
  },
  FLAGGED: {
    status: 'FLAGGED',
    label: 'Perlu Pemeriksaan',
    shortLabel: 'Ditandai',
    description: 'Ditandai oleh sistem karena deviasi lokasi GPS, durasi, atau bukti foto.',
    badgeClass: 'bg-[var(--status-flagged-bg)] text-[var(--status-flagged-text)] border-[var(--status-flagged-border)]',
    barColor: 'var(--chart-flagged)',
    dotClass: 'bg-red-500',
    isVerifiedComplete: false,
  },
  REVIEWED: {
    status: 'REVIEWED',
    label: 'Sudah Ditinjau',
    shortLabel: 'Sudah Ditinjau',
    description: 'Telah diperiksa dan disahkan oleh admin operasional.',
    badgeClass: 'bg-[var(--status-reviewed-bg)] text-[var(--status-reviewed-text)] border-[var(--status-reviewed-border)]',
    barColor: 'var(--chart-reviewed)',
    dotClass: 'bg-teal-500',
    isVerifiedComplete: true,
  },
};

export function getWorkReportStatusMeta(status: WorkReportStatus): WorkReportStatusMeta {
  return WORK_REPORT_STATUS_META[status] ?? WORK_REPORT_STATUS_META.READY;
}

export const RISK_LEVEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Semua Level' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'LOW_RISK', label: 'Risiko Rendah' },
  { value: 'REVIEW', label: 'Perlu Ditinjau' },
  { value: 'HIGH_RISK', label: 'Risiko Tinggi' },
  { value: 'CRITICAL', label: 'Kritis' },
];

export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Semua Status' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'READY', label: 'Siap Check-in' },
  { value: 'WORKING', label: 'Berlangsung' },
  { value: 'COMPLETED', label: 'Selesai' },
  { value: 'FLAGGED', label: 'Perlu Pemeriksaan' },
  { value: 'REVIEWED', label: 'Sudah Ditinjau' },
];
