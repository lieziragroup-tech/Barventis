import React, { useMemo } from 'react';
import {
  ExecutorStats,
  KPIStats,
  Project,
  Quotation,
  UserLocation,
  WorkReportListItem,
  WorkReportStatus,
} from '@/entities/types';
import {
  BentoErrorState,
  BentoSkeleton,
  formatNumberId,
} from '@/shared/ui/analytics-bento';
import {
  getIndonesianTimeGreeting,
  toLocalDateKey,
} from '@/shared/utils/operationalSummary';
import { getWorkReportStatusMeta } from '@/shared/utils/riskMeta';
import { getServiceTypeMeta } from '@/shared/utils/serviceMeta';

export interface ExecutiveQuotationSummary {
  totalQuotations: number;
  draftCount: number;
  approvedCount: number;
  dealCount: number;
  onOpenQuotations: () => void;
}

export interface OperationsAnalyticsBentoProps {
  summary: KPIStats | null;
  quotationSummary?: ExecutiveQuotationSummary | null;
  reports?: WorkReportListItem[];
  projects?: Project[];
  executors?: ExecutorStats[];
  quotations?: Quotation[];
  userLocations?: UserLocation[];
  companyDisplayName?: string;
  isLoading: boolean;
  isRefreshing?: boolean;
  error: string | null;
  staleRefreshError?: string | null;
  activeStatusFilter: string;
  previousStatusFilter?: string | null;
  onRetry: () => void;
  onRefresh: () => void;
  onSelectStatusFilter: (status: string) => void;
  onUndoStatusFilter?: () => void;
  onOpenAnomaliesTab: () => void;
  onOpenReportsTab?: () => void;
  onOpenExecutorsTab?: () => void;
  onOpenProjectsTab?: () => void;
  onOpenQuotationsTab?: () => void;
  onOpenCustomersTab?: () => void;
  onOpenReportDetail: (reportId: string) => void;
}

const fullDateFmt = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const shortDateFmt = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export const OperationsAnalyticsBento: React.FC<OperationsAnalyticsBentoProps> = ({
  summary,
  reports = [],
  companyDisplayName = 'PT Guci Emas Pratama',
  isLoading,
  isRefreshing = false,
  error,
  staleRefreshError,
  onRetry,
  onRefresh,
  onSelectStatusFilter,
  onOpenAnomaliesTab,
  onOpenReportsTab,
  onOpenReportDetail,
}) => {
  const greetingText = useMemo(() => getIndonesianTimeGreeting(new Date()), []);
  const todayFormatted = useMemo(() => {
    const key = toLocalDateKey(new Date());
    const [y, m, d] = key.split('-').map(Number);
    if (!y || !m || !d) return fullDateFmt.format(new Date());
    return fullDateFmt.format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
  }, []);

  if (isLoading && !summary) {
    return <BentoSkeleton />;
  }

  if (error && !summary) {
    return <BentoErrorState message={error} onRetry={onRetry} isRetrying={isRefreshing} />;
  }

  if (!summary) {
    return null;
  }

  const readyCount = reports.filter(r => r.status === 'READY' || r.status === 'DRAFT').length;
  const workingCount = summary.workingJobs || reports.filter(r => r.status === 'WORKING').length;
  const completedCount =
    summary.completedJobs ||
    reports.filter(r => r.status === 'COMPLETED' || r.status === 'REVIEWED').length;
  const flaggedCount =
    summary.flaggedJobs ||
    reports.filter(r => r.status === 'FLAGGED' || r.riskScore >= 40).length;

  const recentReports = reports.slice(0, 7);
  const priorityReports = reports
    .filter(r => r.status === 'FLAGGED' || r.riskScore >= 40 || r.status === 'WORKING')
    .slice(0, 4);

  const kpiItems = [
    {
      code: 'READY',
      label: 'Siap Dikerjakan',
      count: readyCount,
      sub: 'Menunggu check-in teknisi',
      actionCue: 'Filter ›',
      accentText: 'text-[#356c91] dark:text-sky-300',
      onClick: () => {
        onSelectStatusFilter('READY');
        onOpenReportsTab?.();
      },
    },
    {
      code: 'WORKING',
      label: 'Sedang Berlangsung',
      count: workingCount,
      sub: 'Aktif dikerjakan di lokasi',
      actionCue: 'Pantau ›',
      accentText: 'text-[#b47818] dark:text-amber-300',
      onClick: () => {
        onSelectStatusFilter('WORKING');
        onOpenReportsTab?.();
      },
    },
    {
      code: 'COMPLETED',
      label: 'Selesai',
      count: completedCount,
      sub: 'Laporan selesai tercatat',
      actionCue: 'Rekap ›',
      accentText: 'text-[#1f7a4c] dark:text-emerald-300',
      onClick: () => {
        onSelectStatusFilter('COMPLETED');
        onOpenReportsTab?.();
      },
    },
    {
      code: 'FLAGGED',
      label: 'Perlu Ditinjau',
      count: flaggedCount,
      sub: 'Butuh verifikasi Admin',
      actionCue: 'Tinjau ›',
      accentText: 'text-[#b54141] dark:text-rose-300',
      onClick: () => onOpenAnomaliesTab(),
    },
  ];

  return (
    <div className="space-y-6">
      {staleRefreshError && (
        <div
          role="status"
          className="p-3.5 rounded-xl border border-[var(--status-draft-border)] bg-[var(--status-draft-bg)] text-[var(--status-draft-text)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
        >
          <span>
            <strong>Data terbaru belum berhasil dimuat:</strong> {staleRefreshError}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold hover:bg-[var(--bg-tertiary)] transition-colors shrink-0 cursor-pointer"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Minimalist Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <p className="text-xs font-medium text-[var(--text-secondary)]">
            {greetingText} · {todayFormatted}
          </p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-[-0.025em] text-[var(--text-primary)] mt-0.5">
            {companyDisplayName}
          </h1>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => onOpenReportsTab?.()}
            className="min-h-[40px] px-4 py-2 rounded-[10px] bg-[#1A5C38] hover:bg-[#13462A] text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Lihat Semua Laporan
          </button>
        </div>
      </div>

      {/* 4 Focused KPI Summary Cards with Fieldwork Glassmorphism & Hover Micro-Interactions */}
      <div data-app-tour="dashboard-kpi" className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {kpiItems.map(item => (
          <button
            key={item.code}
            type="button"
            onClick={item.onClick}
            className={`kpi-card ${item.code.toLowerCase()} group text-left cursor-pointer`}
          >
            <div>
              <span>{item.label}</span>
              <span
                className={`text-[11px] font-semibold opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-150 whitespace-nowrap shrink-0 ${item.accentText}`}
              >
                {item.actionCue}
              </span>
            </div>
            <strong className="font-mono tabular-nums tracking-tight">
              {formatNumberId(item.count)}
            </strong>
            <small className="group-hover:text-[var(--text-secondary)] transition-colors duration-150">
              {item.sub}
            </small>
          </button>
        ))}
      </div>

      {/* Main Content Split: Recent Work Reports Table + Priority Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left 8 Columns: Tabel Laporan Kerja Terbaru */}
        <section
          data-app-tour="dashboard-recent-reports"
          className="xl:col-span-8 clean-card bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
                Laporan Kerja Terbaru
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Daftar kunjungan teknisi terbaru beserta status verifikasi.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenReportsTab?.()}
              className="text-xs font-semibold text-[#1A5C38] hover:underline shrink-0 cursor-pointer"
            >
              Buka Semua
            </button>
          </div>

          {recentReports.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)]">
              Belum ada laporan kerja lapangan yang tercatat.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    <th className="py-3 px-4">Proyek &amp; Pelanggan</th>
                    <th className="py-3 px-4">Teknisi</th>
                    <th className="py-3 px-4">Tanggal</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
                  {recentReports.map(rep => {
                    const statusMeta = getWorkReportStatusMeta(rep.status as WorkReportStatus);
                    const serviceMeta = getServiceTypeMeta(rep.project.serviceType);
                    const dateStr = rep.createdAt
                      ? shortDateFmt.format(new Date(rep.createdAt))
                      : '-';
                    const timeStr = rep.checkInAt
                      ? new Date(rep.checkInAt).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : null;

                    return (
                      <tr
                        key={rep.id}
                        onClick={() => onOpenReportDetail(rep.id)}
                        className="hover:bg-[var(--bg-tertiary)]/60 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-[var(--text-primary)] truncate max-w-[230px]">
                            {rep.project.name}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)] truncate max-w-[230px]">
                            {rep.project.clientName || serviceMeta.label}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-[var(--text-primary)] whitespace-nowrap">
                          {rep.executor.name}
                        </td>
                        <td className="py-3.5 px-4 text-[var(--text-secondary)] whitespace-nowrap tabular-nums">
                          <span>{dateStr}</span>
                          {timeStr && (
                            <span className="text-[var(--text-muted)]"> · {timeStr}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              onOpenReportDetail(rep.id);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-semibold text-xs transition-colors cursor-pointer"
                          >
                            Detail
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right 4 Columns: Panel Perlu Tindakan & Aktivitas */}
        <section
          data-app-tour="dashboard-priority"
          className="xl:col-span-4 clean-card bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
                Perlu Tindakan
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Laporan prioritas atau sedang dikerjakan.
              </p>
            </div>
            {flaggedCount > 0 && (
              <button
                type="button"
                onClick={onOpenAnomaliesTab}
                className="text-xs font-semibold text-[#943838] hover:underline cursor-pointer"
              >
                {flaggedCount} Perlu Cek
              </button>
            )}
          </div>

          {priorityReports.length === 0 ? (
            <div className="py-6 text-center text-xs text-[var(--text-muted)]">
              Seluruh laporan kerja berjalan normal tanpa antrean verifikasi mendesak.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {priorityReports.map(rep => {
                const isFlagged = rep.status === 'FLAGGED' || rep.riskScore >= 40;
                return (
                  <button
                    key={rep.id}
                    type="button"
                    onClick={() => onOpenReportDetail(rep.id)}
                    className="w-full py-3 first:pt-0 last:pb-0 text-left flex items-start justify-between gap-3 hover:opacity-85 transition-opacity cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                        {rep.project.name}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 truncate">
                        {rep.executor.name} · {isFlagged ? 'Perlu Ditinjau' : 'Sedang Berlangsung'}
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-semibold shrink-0 ${
                        isFlagged ? 'text-[#943838]' : 'text-[#1A5C38]'
                      }`}
                    >
                      Tinjau ›
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
