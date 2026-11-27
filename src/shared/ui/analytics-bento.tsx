import React, { useState, useId } from 'react';
import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/skeleton';
import {
  JarivisAttentionMetricRow,
  JarivisDashboardTabId,
  JarivisPeriodKey,
  JarivisServiceCategorySlice,
} from '@/shared/utils/operationalSummary';

// ─── TYPES FOR CLEAN, MINIMALIST OPERATIONAL BENTO PRIMITIVES ────────────────

export interface BentoMetricItem {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  badgeText?: string;
  badgeTone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  subText?: string;
  actionLabel?: string;
  active?: boolean;
  onAction?: () => void;
}

export interface BentoTrendPoint {
  date: string; // YYYY-MM-DD
  labelShort: string;
  labelFull: string;
  total: number;
  completed: number;
  flagged: number;
}

export interface BentoStatusRow {
  statusKey: string;
  label: string;
  codeLabel?: string;
  description: string;
  count: number;
  percentage: number;
  barColor: string;
  badgeClass: string;
  dotClass: string;
  isVerifiedGroup?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}

export interface BentoPriorityItem {
  id: string;
  projectName: string;
  clientName: string;
  executorName: string;
  dateFormatted: string;
  isFlagged: boolean;
  statusLabel: string;
  statusBadgeClass: string;
  riskNode: React.ReactNode;
  contextNote?: string;
  onOpenDetail: () => void;
}

// ─── FORMAT HELPERS (id-ID) ──────────────────────────────────────────────────

const numFormatterId = new Intl.NumberFormat('id-ID');

export function formatNumberId(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return numFormatterId.format(Math.round(value));
}

export function formatDecimalId(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return numFormatterId.format(value);
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(value);
}

// ─── JARIVIS SUB-TAB NAVIGATION BAR (`Dasbor Personal`) ──────────────────────

export const JARIVIS_SUB_TABS: { id: JarivisDashboardTabId; label: string; eyebrow: string }[] = [
  { id: 'operationCenter', label: 'Operation Center', eyebrow: 'GUCI EMAS OPERATION CENTER' },
  { id: 'liveMap', label: 'Live Map', eyebrow: 'GUCI EMAS LIVE MAP' },
  { id: 'performanceTeam', label: 'Performance Team', eyebrow: 'GUCI EMAS PERFORMANCE TEAM' },
  { id: 'business', label: 'Bisnis', eyebrow: 'GUCI EMAS BUSINESS' },
];

export const JARIVIS_PERIOD_OPTIONS: { id: JarivisPeriodKey; label: string }[] = [
  { id: 'week', label: 'Minggu Ini' },
  { id: 'month', label: 'Bulan Ini' },
  { id: 'quarter', label: 'Kuartal Ini' },
  { id: 'year', label: 'Tahun Ini' },
  { id: 'custom30', label: 'Kustom' },
];

export const JarivisSubTabBar: React.FC<{
  activeTab: JarivisDashboardTabId;
  onSelectTab: (tab: JarivisDashboardTabId) => void;
}> = ({ activeTab, onSelectTab }) => (
  <div className="space-y-3">
    <h1 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] tracking-tight">
      Dasbor Personal
    </h1>
    <div
      role="tablist"
      aria-label="Kategori Dasbor Personal"
      className="flex items-center gap-1 sm:gap-2 border-b border-[var(--border-subtle)] overflow-x-auto no-scrollbar"
    >
      {JARIVIS_SUB_TABS.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onSelectTab(tab.id)}
            className={cn(
              'px-3.5 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-colors cursor-pointer',
              isActive
                ? 'border-[var(--accent-blue)] text-[var(--text-primary)] bg-[var(--accent-blue-soft)] rounded-t-lg'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-t-lg'
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  </div>
);

export const JarivisPeriodPills: React.FC<{
  selectedPeriod: JarivisPeriodKey;
  onSelectPeriod: (period: JarivisPeriodKey) => void;
}> = ({ selectedPeriod, onSelectPeriod }) => (
  <div
    role="group"
    aria-label="Filter Periode Waktu"
    className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)]"
  >
    {JARIVIS_PERIOD_OPTIONS.map(opt => {
      const active = selectedPeriod === opt.id;
      return (
        <button
          key={opt.id}
          type="button"
          onClick={() => onSelectPeriod(opt.id)}
          aria-pressed={active}
          className={cn(
            'px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
            active
              ? 'bg-[var(--accent-blue)] text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
          )}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

// ─── JARIVIS HERO GREETING BANNER (`Selamat Siang, Gucimas Pratama`) ─────────

export const JarivisGreetingBanner: React.FC<{
  eyebrow: string;
  greetingText: string;
  entityName: string;
  dateDisplayText: string;
  updatedTimeText: string | null;
  showDateStepper?: boolean;
  dateStepperLabel?: string;
  onPrevDate?: () => void;
  onNextDate?: () => void;
  onResetToday?: () => void;
  isToday?: boolean;
  onRefresh: () => void;
  isRefreshing?: boolean;
  rightSlot?: React.ReactNode;
}> = ({
  eyebrow,
  greetingText,
  entityName,
  dateDisplayText,
  updatedTimeText,
  showDateStepper = false,
  dateStepperLabel,
  onPrevDate,
  onNextDate,
  onResetToday,
  isToday = true,
  onRefresh,
  isRefreshing = false,
  rightSlot,
}) => (
  <div className="flex flex-col xl:flex-row xl:items-stretch gap-4">
    <div className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="space-y-1.5 min-w-0">
        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[var(--accent-blue)] block">
          {eyebrow}
        </span>
        <h2 className="text-lg sm:text-2xl font-bold text-[var(--text-primary)] truncate">
          {greetingText}, {entityName}
        </h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)] pt-0.5">
          <span>{dateDisplayText}</span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer disabled:opacity-60"
            title="Perbarui data dasbor"
          >
            <span>
              {isRefreshing
                ? 'Memperbarui data...'
                : updatedTimeText
                ? `Pembaruan Terakhir pukul ${updatedTimeText}`
                : 'Perbarui Data'}
            </span>
          </button>
        </div>
      </div>

      {showDateStepper && (
        <div className="flex items-center gap-1.5 self-start sm:self-center shrink-0">
          <div className="inline-flex items-center rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-1">
            <button
              type="button"
              onClick={onPrevDate}
              aria-label="Hari sebelumnya"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
            >
              &lsaquo;
            </button>
            <button
              type="button"
              onClick={onResetToday}
              className="px-3 py-1 text-xs sm:text-[13px] font-semibold text-[var(--accent-blue)] hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
              title="Klik untuk kembali ke Hari Ini"
            >
              {dateStepperLabel}
              {isToday ? ' (Hari Ini)' : ''}
            </button>
            <button
              type="button"
              onClick={onNextDate}
              disabled={isToday}
              aria-label="Hari berikutnya"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-35 transition-colors cursor-pointer"
            >
              &rsaquo;
            </button>
          </div>
        </div>
      )}
    </div>

    {rightSlot && <div className="xl:w-[320px] shrink-0">{rightSlot}</div>}
  </div>
);

// ─── JARIVIS RADIAL DONUT METRIC CARD ────────────────────────────────────────

export interface JarivisRadialMetricCardProps {
  title: string;
  percentage?: number;
  showPercentageInsideRing?: boolean;
  primaryText: string;
  primaryTone?: 'blue' | 'emerald' | 'amber' | 'rose' | 'teal';
  subText: string;
  trendText?: string;
  trendPositive?: boolean;
  onClick?: () => void;
}

const PRIMARY_TONE_COLOR: Record<NonNullable<JarivisRadialMetricCardProps['primaryTone']>, { text: string; stroke: string }> = {
  blue: { text: 'text-[#3b82f6]', stroke: '#3b82f6' },
  emerald: { text: 'text-[#10b981]', stroke: '#10b981' },
  amber: { text: 'text-[#f59e0b]', stroke: '#f59e0b' },
  rose: { text: 'text-[#f43f5e]', stroke: '#f43f5e' },
  teal: { text: 'text-[#14b8a6]', stroke: '#14b8a6' },
};

export const JarivisRadialMetricCard: React.FC<JarivisRadialMetricCardProps> = ({
  title,
  percentage = 0,
  showPercentageInsideRing = true,
  primaryText,
  primaryTone = 'blue',
  subText,
  trendText,
  trendPositive = true,
  onClick,
}) => {
  const clampedPct = Math.max(0, Math.min(100, Math.round(percentage)));
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clampedPct / 100) * circumference;
  const tone = PRIMARY_TONE_COLOR[primaryTone];

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'w-full text-left bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-4 flex flex-col justify-between gap-3 transition-colors',
        onClick && 'hover:border-[var(--border-focus)] cursor-pointer btn-tactile'
      )}
    >
      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)] block leading-snug">
        {title}
      </span>

      <div className="flex items-center gap-3.5">
        {/* Radial SVG Ring */}
        <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
          <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90 block">
            <circle
              cx="28"
              cy="28"
              r={radius}
              fill="none"
              stroke="var(--text-primary)"
              strokeOpacity="0.16"
              strokeWidth="5.5"
            />
            {clampedPct > 0 && (
              <circle
                cx="28"
                cy="28"
                r={radius}
                fill="none"
                stroke={tone.stroke}
                strokeWidth="5.5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
              />
            )}
          </svg>
          {showPercentageInsideRing && (
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold font-mono tabular-nums text-[var(--text-secondary)]">
              {clampedPct}%
            </span>
          )}
        </div>

        <div className="min-w-0">
          <div className={cn('text-base sm:text-lg font-bold font-mono tabular-nums leading-tight truncate', tone.text)}>
            {primaryText}
          </div>
          <div className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
            {subText}
          </div>
        </div>
      </div>

      {trendText && (
        <div
          className={cn(
            'text-[11px] font-semibold flex items-center gap-1',
            trendPositive ? 'text-[#10b981]' : 'text-[#f87171]'
          )}
        >
          <span>{trendPositive ? '↗' : '↘'}</span>
          <span>{trendText}</span>
        </div>
      )}
    </Wrapper>
  );
};

// ─── JARIVIS OPERATIONAL EFFICIENCY TALL CARD (`EFISIENSI OPERASIONAL`) ──────

export const JarivisEfficiencyCard: React.FC<{
  avgStartTime: string;
  avgEndTime: string;
  avgDuration: string;
}> = ({ avgStartTime, avgEndTime, avgDuration }) => {
  const rows = [
    { id: 'start', label: 'rata-rata waktu mulai', value: avgStartTime },
    { id: 'end', label: 'rata-rata waktu selesai', value: avgEndTime },
    { id: 'total', label: 'rata-rata total tugas', value: avgDuration },
  ];

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-4 sm:p-5 flex flex-col justify-between h-full">
      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)] block mb-2">
        EFISIENSI OPERASIONAL
      </span>

      <div className="divide-y divide-[var(--border-subtle)] flex-1 flex flex-col justify-around">
        {rows.map(row => (
          <div key={row.id} className="py-2.5 flex items-end justify-between gap-3">
            <div>
              <span className="text-xs text-[var(--text-secondary)] block">{row.label}</span>
              <span className="text-lg sm:text-xl font-bold font-mono tabular-nums text-[#3b82f6] mt-0.5 block">
                {row.value}
              </span>
            </div>
            <span className="w-16 h-0.5 rounded-full bg-[var(--border-subtle)] mb-1.5" aria-hidden="true" />
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── JARIVIS DEEP CRIMSON ALERT CARD (`PERLU PERHATIAN!`) ────────────────────

export const JarivisCrimsonAttentionCard: React.FC<{
  rows: JarivisAttentionMetricRow[];
  onSelectRow: (target: JarivisAttentionMetricRow['targetAction']) => void;
  onOpenDetail: () => void;
}> = ({ rows, onSelectRow, onOpenDetail }) => (
  <div
    role="region"
    aria-label="Perlu Perhatian"
    className="bg-[var(--alert-surface-bg)] border border-[var(--alert-surface-border)] rounded-xl p-4 sm:p-5 flex flex-col justify-between h-full text-[var(--alert-surface-text)]"
  >
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--alert-surface-muted)]">
          PERLU PERHATIAN!
        </span>
        <span className="text-xs font-bold text-[var(--alert-surface-muted)]" aria-hidden="true">
          !
        </span>
      </div>

      <div className="space-y-2 pt-1">
        {rows.map(row => (
          <button
            key={row.id}
            type="button"
            onClick={() => onSelectRow(row.targetAction)}
            className="w-full flex items-center justify-between gap-2 py-1 text-xs sm:text-[13px] hover:opacity-85 transition-opacity text-left cursor-pointer"
          >
            <span className="text-[var(--alert-surface-muted)] font-medium truncate">
              {row.label}
            </span>
            <strong className="font-mono tabular-nums font-bold text-white shrink-0">
              {formatNumberId(row.count)}
            </strong>
          </button>
        ))}
      </div>
    </div>

    <div className="pt-4 mt-2">
      <button
        type="button"
        onClick={onOpenDetail}
        className="text-xs sm:text-[13px] font-bold text-white hover:underline inline-flex items-center gap-1 cursor-pointer"
      >
        <span>Lihat Detail</span>
        <span aria-hidden="true">&rsaquo;</span>
      </button>
    </div>
  </div>
);

// ─── JARIVIS IDLE WORKFORCE BANNER (`Peringatan Tenaga Kerja Idle`) ──────────

export const JarivisIdleAlertBanner: React.FC<{
  idleStaffCount: number;
  draftQuotationsCount: number;
  onReviewStaff: () => void;
  onReviewQuotations: () => void;
}> = ({ idleStaffCount, draftQuotationsCount, onReviewStaff, onReviewQuotations }) => {
  const showIdle = idleStaffCount > 0;
  const count = showIdle ? idleStaffCount : draftQuotationsCount;

  if (count <= 0) return null;

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="w-8 h-8 rounded-lg bg-[#f43f5e]/20 border border-[#f43f5e]/40 text-[#fb7185] font-bold text-sm flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          !
        </span>
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
            {showIdle ? 'Peringatan Tenaga Kerja Idle' : 'Penawaran Menunggu Persetujuan'}
          </p>
          <p className="text-xs text-[var(--text-secondary)] truncate">
            {showIdle ? (
              <>
                Ada <span className="text-[#fb7185] font-semibold underline">{count} anggota</span> tanpa tugas selama lebih dari 5 hari.
              </>
            ) : (
              <>
                Ada <span className="text-[#fbbf24] font-semibold underline">{count} dokumen penawaran</span> yang menunggu pemeriksaan/approval.
              </>
            )}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={showIdle ? onReviewStaff : onReviewQuotations}
        className="self-start sm:self-center min-h-[36px] px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-hover)] text-white text-xs font-semibold transition-colors shrink-0 cursor-pointer btn-tactile"
      >
        {showIdle ? 'Tinjau Anggota' : 'Tinjau Penawaran'}
      </button>
    </div>
  );
};

// ─── JARIVIS EXECUTION TREND CHART (`Tren Eksekusi` + Gap & Penyelesaian) ────

export const JarivisExecutionTrendCard: React.FC<{
  points: BentoTrendPoint[];
  highestGap: { count: number; dateLabel: string };
  highestCompletion: { count: number; dateLabel: string };
  selectedPeriod: JarivisPeriodKey;
  onSelectPeriod: (period: JarivisPeriodKey) => void;
}> = ({ points, highestGap, highestCompletion, selectedPeriod, onSelectPeriod }) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const maxY = Math.max(1, ...points.map(p => Math.max(p.total, p.completed, p.flagged)));
  const svgWidth = 860;
  const svgHeight = 200;
  const padLeft = 36;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 28;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const getX = (idx: number) => {
    if (points.length <= 1) return padLeft + plotW / 2;
    return padLeft + (idx / (points.length - 1)) * plotW;
  };
  const getY = (val: number) => padTop + plotH - (Math.max(0, val) / maxY) * plotH;

  const buildPath = (getter: (p: BentoTrendPoint) => number) =>
    points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${getX(idx).toFixed(1)},${getY(getter(p)).toFixed(1)}`)
      .join(' ');

  const yTicks = [0, Number((maxY * 0.25).toFixed(1)), Number((maxY * 0.5).toFixed(1)), Number((maxY * 0.75).toFixed(1)), maxY];
  const xTickIndices =
    points.length >= 6
      ? [0, Math.floor((points.length - 1) * 0.25), Math.floor((points.length - 1) * 0.5), Math.floor((points.length - 1) * 0.75), points.length - 1]
      : points.map((_, i) => i);

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
          Tren Eksekusi
        </h3>
        <JarivisPeriodPills selectedPeriod={selectedPeriod} onSelectPeriod={onSelectPeriod} />
      </div>

      {/* 2 Highlight Boxes: Gap Tertinggi & Penyelesaian Tertinggi */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-3.5 flex items-center justify-between gap-3">
          <div>
            <span className="text-xs text-[var(--text-secondary)] block">Gap Tertinggi</span>
            <strong className="text-lg sm:text-xl font-bold font-mono tabular-nums text-[var(--text-primary)] mt-0.5 block">
              {formatNumberId(highestGap.count)} Tugas
            </strong>
          </div>
          <div className="text-right text-[11px] text-[var(--text-secondary)]">
            <span className="block">Tercatat pada</span>
            <strong className="text-[var(--text-primary)] font-mono">{highestGap.dateLabel}</strong>
          </div>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-3.5 flex items-center justify-between gap-3">
          <div>
            <span className="text-xs text-[var(--text-secondary)] block">Penyelesaian Tertinggi</span>
            <strong className="text-lg sm:text-xl font-bold font-mono tabular-nums text-[var(--text-primary)] mt-0.5 block">
              {formatNumberId(highestCompletion.count)} Tugas
            </strong>
          </div>
          <div className="text-right text-[11px] text-[var(--text-secondary)]">
            <span className="block">Tercatat pada</span>
            <strong className="text-[var(--text-primary)] font-mono">{highestCompletion.dateLabel}</strong>
          </div>
        </div>
      </div>

      {/* Multi-line SVG Chart */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs text-[var(--text-secondary)]">
          <span>
            {activeIndex !== null && points[activeIndex]
              ? `${points[activeIndex].labelFull}: Rencana ${points[activeIndex].total} • Selesai ${points[activeIndex].completed}`
              : 'Arahkan kursor pada grafik untuk melihat detail harian'}
          </span>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f43f5e] inline-block" />
              <span>Rencana Tugas ({formatNumberId(points.reduce((a, p) => a + p.total, 0))})</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#38bdf8] inline-block" />
              <span>Tugas Selesai ({formatNumberId(points.reduce((a, p) => a + p.completed, 0))})</span>
            </span>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-[180px] sm:h-[200px] block select-none"
          onMouseLeave={() => setActiveIndex(null)}
        >
          {yTicks.map((tick, idx) => {
            const y = getY(tick);
            return (
              <g key={idx}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={svgWidth - padRight}
                  y2={y}
                  stroke="var(--chart-grid)"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--text-muted)"
                  fontFamily="var(--font-mono)"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {Array.from(new Set(xTickIndices)).map(idx => {
            const pt = points[idx];
            if (!pt) return null;
            return (
              <text
                key={pt.date}
                x={getX(idx)}
                y={svgHeight - 6}
                textAnchor={idx === 0 ? 'start' : idx === points.length - 1 ? 'end' : 'middle'}
                fontSize="11"
                fill="var(--text-muted)"
                fontFamily="var(--font-mono)"
              >
                {pt.labelShort}
              </text>
            );
          })}

          {points.length > 0 && (
            <>
              <path
                d={buildPath(p => p.total)}
                fill="none"
                stroke="#f43f5e"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={buildPath(p => p.completed)}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {points.map((pt, idx) => {
            const colW = plotW / Math.max(1, points.length);
            return (
              <rect
                key={pt.date}
                x={Math.max(padLeft, getX(idx) - colW / 2)}
                y={padTop}
                width={colW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setActiveIndex(idx)}
                className="cursor-pointer"
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
};

// ─── JARIVIS SERVICE CATEGORY BREAKDOWN (`Daftar Tugas yang Selesai`) ────────

export const JarivisServiceCategoryCard: React.FC<{
  totalCompleted: number;
  slices: JarivisServiceCategorySlice[];
  periodLabel: string;
}> = ({ totalCompleted, slices, periodLabel }) => (
  <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl p-4 sm:p-5 space-y-4">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
          Daftar Tugas yang Selesai per Layanan
        </h3>
        <p className="text-xs text-[var(--text-secondary)]">
          Sebaran laporan kerja dan survey berdasarkan kategori layanan ({periodLabel})
        </p>
      </div>
      <span className="px-3 py-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] self-start sm:self-center">
        {periodLabel}
      </span>
    </div>

    <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-6 flex flex-col items-center justify-center space-y-6">
      <div className="text-center py-4">
        <span className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-[var(--text-primary)] block">
          {formatNumberId(totalCompleted)}
        </span>
        <span className="text-xs text-[var(--text-secondary)] mt-1 block">
          Tugas Selesai
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5 pt-2 border-t border-[var(--border-subtle)] w-full">
        {slices.map(slice => (
          <div key={slice.id} className="inline-flex items-center gap-2 text-xs">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: slice.color }}
              aria-hidden="true"
            />
            <span className="font-semibold text-[var(--text-primary)]">
              {slice.label} ({formatNumberId(slice.count)})
            </span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─── JARIVIS BUSINESS TAB: 8 KPI GRID (`Ringkasan Performa`) ─────────────────

export interface JarivisBusinessKpiItem {
  id: string;
  title: string;
  value: number | string;
  comparisonText: string;
  onClick?: () => void;
}

export const JarivisBusinessKpiGrid: React.FC<{
  items: JarivisBusinessKpiItem[];
  selectedPeriod: JarivisPeriodKey;
  onSelectPeriod: (period: JarivisPeriodKey) => void;
}> = ({ items, selectedPeriod, onSelectPeriod }) => (
  <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl p-4 sm:p-5 space-y-4">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
        Ringkasan Performa
      </h3>
      <JarivisPeriodPills selectedPeriod={selectedPeriod} onSelectPeriod={onSelectPeriod} />
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
      {items.map(item => {
        const CardTag = item.onClick ? 'button' : 'div';
        return (
          <CardTag
            key={item.id}
            type={item.onClick ? 'button' : undefined}
            onClick={item.onClick}
            className={cn(
              'text-left bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-4 flex flex-col justify-between gap-3 transition-colors',
              item.onClick && 'hover:border-[var(--border-focus)] cursor-pointer btn-tactile'
            )}
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)] block leading-snug">
              {item.title}
            </span>
            <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[#3b82f6] block">
              {typeof item.value === 'number' ? formatDecimalId(item.value) : item.value}
            </span>
            <span className="text-xs text-[var(--text-secondary)] font-medium block">
              {item.comparisonText}
            </span>
          </CardTag>
        );
      })}
    </div>
  </div>
);

// ─── JARIVIS BUSINESS TAB: LEADS & QUOTATION FUNNEL (`Ringkasan Leads`) ──────

export const JarivisLeadsFunnelCard: React.FC<{
  newLeadsCount: number;
  contactedOrApprovedCount: number;
  visitsOrDealCount: number;
  totalEstimatedRevenueIdr: number;
  totalLeadsCount: number;
  selectedPeriod: JarivisPeriodKey;
  onSelectPeriod: (period: JarivisPeriodKey) => void;
  onOpenQuotations: () => void;
}> = ({
  newLeadsCount,
  contactedOrApprovedCount,
  visitsOrDealCount,
  totalEstimatedRevenueIdr,
  totalLeadsCount,
  selectedPeriod,
  onSelectPeriod,
  onOpenQuotations,
}) => {
  const bars = [
    {
      id: 'new',
      label: 'Leads Baru (Draft Survey)',
      count: newLeadsCount,
      widthClass: 'w-full',
      bgClass: 'bg-[#7e6288] text-white border-[#a888b5]',
    },
    {
      id: 'approved',
      label: 'Sudah Dihubungi / Disetujui',
      count: contactedOrApprovedCount,
      widthClass: 'w-[90%]',
      bgClass: 'bg-[#8d6b99] text-white border-[#b594c2]',
    },
    {
      id: 'visits',
      label: 'Kunjungan & Kontrak Deal',
      count: visitsOrDealCount,
      widthClass: 'w-[80%]',
      bgClass: 'bg-[#0284c7] text-white border-[#38bdf8]',
    },
  ];

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
          Ringkasan Leads &amp; Penawaran
        </h3>
        <JarivisPeriodPills selectedPeriod={selectedPeriod} onSelectPeriod={onSelectPeriod} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Horizontal Funnel Bars (8 cols) */}
        <div className="lg:col-span-8 space-y-2.5">
          {bars.map(bar => (
            <button
              key={bar.id}
              type="button"
              onClick={onOpenQuotations}
              className={cn(
                'block text-left rounded-xl p-3.5 sm:px-4 border transition-opacity hover:opacity-95 cursor-pointer',
                bar.widthClass,
                bar.bgClass
              )}
            >
              <span className="text-xs font-medium opacity-90 block">{bar.label}</span>
              <strong className="text-lg sm:text-xl font-bold font-mono tabular-nums block mt-0.5">
                {formatNumberId(bar.count)}
              </strong>
            </button>
          ))}
        </div>

        {/* Revenue & Total Leads Summary (4 cols) */}
        <div className="lg:col-span-4 space-y-5 lg:pl-4">
          <div>
            <span className="text-xs sm:text-sm font-medium text-[var(--text-secondary)] block">
              Total Estimasi Pendapatan
            </span>
            <strong className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[var(--text-primary)] block mt-1">
              IDR {formatNumberId(totalEstimatedRevenueIdr)}
            </strong>
          </div>

          <div>
            <span className="text-xs sm:text-sm font-medium text-[var(--text-secondary)] block">
              Total Leads / Penawaran
            </span>
            <strong className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)] block mt-1">
              {formatNumberId(totalLeadsCount)}
            </strong>
          </div>

          <button
            type="button"
            onClick={onOpenQuotations}
            className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-hover)] text-white text-xs font-semibold transition-colors cursor-pointer btn-tactile"
          >
            Buka Modul Penawaran &rsaquo;
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── LEGACY / SHARED BENTO PRIMITIVES (PRESERVED FOR COMPATIBILITY) ──────────

export const BentoGrid: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div
    className={cn(
      'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-5 lg:gap-6 items-stretch',
      className
    )}
  >
    {children}
  </div>
);

export const BentoCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}> = ({ children, className, ariaLabel }) => (
  <section
    aria-label={ariaLabel}
    className={cn(
      'clean-card bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-5 sm:p-6 flex flex-col justify-between min-w-0',
      className
    )}
  >
    {children}
  </section>
);

export interface OperationalKpiCardProps {
  periodLabel: string;
  periodRangeText?: string;
  totalJobs: number;
  companionMetrics: BentoMetricItem[];
  avgDurationMinutes: number;
  avgRiskScore: number;
  className?: string;
}

const TONE_BADGE_CLASSES: Record<NonNullable<BentoMetricItem['badgeTone']>, string> = {
  success: 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)] border-[var(--status-completed-border)]',
  warning: 'bg-[var(--status-draft-bg)] text-[var(--status-draft-text)] border-[var(--status-draft-border)]',
  danger: 'bg-[var(--status-flagged-bg)] text-[var(--status-flagged-text)] border-[var(--status-flagged-border)]',
  info: 'bg-[var(--status-working-bg)] text-[var(--status-working-text)] border-[var(--status-working-border)]',
  neutral: 'bg-[var(--status-ready-bg)] text-[var(--status-ready-text)] border-[var(--status-ready-border)]',
};

export const OperationalKpiCard: React.FC<OperationalKpiCardProps> = ({
  periodLabel,
  periodRangeText,
  totalJobs,
  companionMetrics,
  avgDurationMinutes,
  avgRiskScore,
  className,
}) => (
  <BentoCard ariaLabel="Ringkasan Operasional" className={cn('xl:col-span-5', className)}>
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)] leading-snug">
            Ringkasan Operasional
          </h3>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">
            {periodRangeText ? `Periode ${periodRangeText}` : periodLabel}
          </p>
        </div>
        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-subtle)] shrink-0">
          {periodLabel}
        </span>
      </div>

      <div className="p-4 sm:p-5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-baseline justify-between gap-3">
        <div>
          <span className="text-xs sm:text-sm font-medium text-[var(--text-secondary)] block">
            Total Penugasan Lapangan
          </span>
          <div className="flex items-baseline gap-2.5 mt-1">
            <span className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-[var(--text-primary)] tracking-tight">
              {formatNumberId(totalJobs)}
            </span>
            <span className="text-sm font-medium text-[var(--text-muted)]">laporan</span>
          </div>
        </div>
      </div>

      <div className="divide-y divide-[var(--border-subtle)] border-t border-b border-[var(--border-subtle)]">
        {companionMetrics.map(item => {
          const toneClass = TONE_BADGE_CLASSES[item.badgeTone ?? 'neutral'];
          return (
            <div key={item.id} className="py-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm sm:text-[15px] font-semibold text-[var(--text-primary)]">
                    {item.label}
                  </span>
                  {item.badgeText && (
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border tabular-nums',
                        toneClass
                      )}
                    >
                      {item.badgeText}
                    </span>
                  )}
                </div>
                {item.subText && (
                  <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] mt-0.5">
                    {item.subText}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
                  {typeof item.value === 'number' ? formatNumberId(item.value) : item.value}
                </span>
                {item.onAction && item.actionLabel && (
                  <button
                    type="button"
                    onClick={item.onAction}
                    aria-pressed={item.active}
                    className={cn(
                      'min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer btn-tactile',
                      item.active
                        ? 'bg-[var(--accent-blue)] text-white border-[var(--accent-blue)]'
                        : 'bg-[var(--bg-primary)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)]'
                    )}
                  >
                    {item.actionLabel}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>

    <div className="pt-4 mt-2 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-[var(--text-secondary)]">
      <span>
        Rata-rata durasi kerja:{' '}
        <strong className="font-mono tabular-nums text-[var(--text-primary)]">
          {avgDurationMinutes > 0 ? `${formatNumberId(avgDurationMinutes)} menit` : '—'}
        </strong>
      </span>
      <span>
        Rata-rata skor risiko:{' '}
        <strong className="font-mono tabular-nums text-[var(--text-primary)]">
          {formatNumberId(avgRiskScore)} poin
        </strong>
      </span>
    </div>
  </BentoCard>
);

export interface WorkTrendChartCardProps {
  periodLabel: string;
  periodRangeText?: string;
  points: BentoTrendPoint[];
  className?: string;
}

export const WorkTrendChartCard: React.FC<WorkTrendChartCardProps> = ({
  periodLabel,
  periodRangeText,
  points,
  className,
}) => {
  const chartId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const totalSum = points.reduce((acc, p) => acc + p.total, 0);
  const completedSum = points.reduce((acc, p) => acc + p.completed, 0);
  const flaggedSum = points.reduce((acc, p) => acc + p.flagged, 0);
  const maxY = Math.max(4, ...points.map(p => Math.max(p.total, p.completed, p.flagged)));
  const svgWidth = 640;
  const svgHeight = 200;
  const padLeft = 36;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 28;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const getX = (idx: number) =>
    points.length <= 1 ? padLeft + plotW / 2 : padLeft + (idx / (points.length - 1)) * plotW;
  const getY = (val: number) => padTop + plotH - (Math.max(0, val) / maxY) * plotH;
  const buildPath = (getter: (p: BentoTrendPoint) => number) =>
    points.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${getX(idx).toFixed(1)},${getY(getter(p)).toFixed(1)}`).join(' ');

  return (
    <BentoCard ariaLabel="Tren Pekerjaan Harian" className={cn('xl:col-span-7', className)}>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)] leading-snug">
              Tren Pekerjaan Harian
            </h3>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">
              Jumlah laporan kerja per hari ({periodRangeText || periodLabel})
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span>Total ({formatNumberId(totalSum)})</span>
            <span>Selesai ({formatNumberId(completedSum)})</span>
            <span>Perlu Cek ({formatNumberId(flaggedSum)})</span>
          </div>
        </div>
        <div className="relative w-full overflow-hidden rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-2.5">
          <svg
            id={chartId}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-[190px] block select-none"
            onMouseLeave={() => setActiveIndex(null)}
          >
            {points.length > 0 && (
              <>
                <path d={buildPath(p => p.total)} fill="none" stroke="var(--chart-total)" strokeWidth="2.5" />
                <path d={buildPath(p => p.completed)} fill="none" stroke="var(--chart-completed)" strokeWidth="2" />
                <path d={buildPath(p => p.flagged)} fill="none" stroke="var(--chart-flagged)" strokeWidth="1.75" strokeDasharray="4 3" />
              </>
            )}
            {points.map((pt, idx) => {
              const colW = plotW / Math.max(1, points.length);
              return (
                <rect
                  key={pt.date}
                  x={Math.max(padLeft, getX(idx) - colW / 2)}
                  y={padTop}
                  width={colW}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setActiveIndex(idx)}
                />
              );
            })}
          </svg>
        </div>
      </div>
      <div className="pt-3 text-xs text-[var(--text-secondary)]">
        {activeIndex !== null && points[activeIndex]
          ? `${points[activeIndex].labelFull}: Total ${points[activeIndex].total}`
          : `Menampilkan ${periodLabel}`}
      </div>
    </BentoCard>
  );
};

export interface StatusCompositionCardProps {
  totalJobs: number;
  rows: BentoStatusRow[];
  activeStatusFilter?: string;
  onClearFilter?: () => void;
  className?: string;
}

export const StatusCompositionCard: React.FC<StatusCompositionCardProps> = ({
  totalJobs,
  rows,
  activeStatusFilter,
  onClearFilter,
  className,
}) => {
  const hasActiveFilter = Boolean(activeStatusFilter && activeStatusFilter !== 'ALL');
  return (
    <BentoCard ariaLabel="Komposisi Status Laporan" className={cn('xl:col-span-7', className)}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">Status Laporan Kerja</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Klik salah satu status untuk menyaring laporan kerja.
            </p>
          </div>
          {hasActiveFilter && onClearFilter && (
            <button
              type="button"
              onClick={onClearFilter}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--accent-blue-soft)] text-[var(--accent-blue)] cursor-pointer"
            >
              Reset Filter
            </button>
          )}
        </div>
        <div className="space-y-2">
          {rows.map(row => {
            const widthPct = totalJobs > 0 ? Math.max(row.count > 0 ? 4 : 0, row.percentage) : 0;
            return (
              <button
                key={row.statusKey}
                type="button"
                onClick={row.onSelect}
                className={cn(
                  'w-full p-2.5 rounded-xl border text-left transition-colors flex flex-col gap-1.5 cursor-pointer',
                  row.isSelected
                    ? 'bg-[var(--accent-blue-soft)] border-[var(--accent-blue)]'
                    : 'bg-[var(--bg-primary)] border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)]'
                )}
              >
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="font-semibold text-[var(--text-primary)]">{row.label}</span>
                  <span className="font-mono tabular-nums font-bold text-[var(--text-primary)]">
                    {formatNumberId(row.count)} ({row.percentage}%)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${widthPct}%`, backgroundColor: row.barColor }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </BentoCard>
  );
};

export interface PriorityVerificationCardProps {
  priorityUniqueCount: number;
  flaggedJobsCount: number;
  highRiskJobsCount: number;
  items: BentoPriorityItem[];
  onOpenAllAnomalies: () => void;
  className?: string;
}

export const PriorityVerificationCard: React.FC<PriorityVerificationCardProps> = ({
  priorityUniqueCount,
  items,
  onOpenAllAnomalies,
  className,
}) => (
  <BentoCard ariaLabel="Prioritas Verifikasi dan Risiko" className={cn('xl:col-span-5', className)}>
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-bold text-[var(--text-primary)]">Antrean Verifikasi Prioritas</h3>
        <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-[var(--status-flagged-bg)] text-[var(--status-flagged-text)] border border-[var(--status-flagged-border)]">
          {formatNumberId(priorityUniqueCount)} laporan
        </span>
      </div>
      {items.length === 0 ? (
        <div className="py-8 px-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-center text-xs sm:text-sm text-[var(--text-secondary)]">
          Belum ada laporan dengan risiko tinggi atau catatan GPS pada periode ini.
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-subtle)]">
          {items.map(item => (
            <div key={item.id} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)] truncate">{item.projectName}</p>
                <p className="text-xs text-[var(--text-secondary)] truncate">
                  {item.executorName} • {item.dateFormatted}
                </p>
              </div>
              <button
                type="button"
                onClick={item.onOpenDetail}
                className="px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
              >
                Periksa
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
    <div className="pt-3 mt-2">
      <button
        type="button"
        onClick={onOpenAllAnomalies}
        className="w-full py-2 rounded-xl bg-[var(--accent-blue)] text-white text-xs font-semibold cursor-pointer"
      >
        Lihat Semua Anomali
      </button>
    </div>
  </BentoCard>
);

export const BentoSkeleton: React.FC = () => (
  <div className="space-y-5" aria-busy="true" aria-label="Memuat ringkasan operasional">
    <div className="space-y-2">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-10 w-96 rounded-xl" />
    </div>
    <Skeleton className="h-24 w-full rounded-2xl" />
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-36 w-full rounded-xl" />
    </div>
  </div>
);

export const BentoErrorState: React.FC<{
  message: string;
  onRetry: () => void;
  isRetrying?: boolean;
}> = ({ message, onRetry, isRetrying }) => (
  <div
    role="alert"
    className="clean-card bg-[var(--bg-card)] border border-[var(--status-flagged-border)] rounded-2xl p-6 sm:p-8 text-center max-w-xl mx-auto my-6 space-y-4"
  >
    <div className="space-y-1.5">
      <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
        Data Dasbor Belum Dapat Dimuat
      </h3>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{message}</p>
    </div>
    <div>
      <button
        type="button"
        onClick={onRetry}
        disabled={isRetrying}
        className="min-h-[42px] px-5 py-2.5 rounded-xl bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-hover)] text-white text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer btn-tactile"
      >
        {isRetrying ? 'Memuat ulang...' : 'Coba Lagi'}
      </button>
    </div>
  </div>
);
