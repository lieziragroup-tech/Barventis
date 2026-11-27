import React, { useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import {
  AlertTriangle,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Eye,
  History,
  MapPin,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { WorkReport } from '@/entities/types';
import {
  COLLAPSE_PANEL_VARIANTS,
  MOTION_EASE,
  MOTION_SPRING,
  createTabContentVariants,
  getSegmentDirection,
  getStaggerDelay,
} from '@/shared/lib/motion';
import {
  formatDurationId,
  formatTimeWib,
  formatWoCode,
  getServiceLabel,
  isSampleCompleteReport,
  isTermiteService,
} from './techLiteUtils';
import {
  buildHistorySummaryStats,
  countHistoryByStatus,
  filterHistoryReports,
  getHistoryStatusMeta,
  getReportCompletionDate,
  groupHistoryReportsByDate,
  HistoryCategoryFilter,
  HistoryDatePreset,
  HistoryStatusFilter,
  toHistoryDateKey,
} from './workHistoryUtils';
import { HistoryDateRangePicker } from './HistoryDateRangePicker';
import { formatDateRangeSummary } from './dateRangePickerUtils';
import { isValidCoordinate, loadWorkPointLocation } from './workPointLocationUtils';

interface WorkHistoryPanelProps {
  completedJobs: WorkReport[];
  downloadingPdfId: string | null;
  onOpenDetail: (report: WorkReport) => void;
  onRequestDownloadPdf: (report: WorkReport) => void;
}

export const WorkHistoryPanel: React.FC<WorkHistoryPanelProps> = ({
  completedJobs,
  downloadingPdfId,
  onOpenDetail,
  onRequestDownloadPdf,
}) => {
  const PERIOD_ORDER = ['ALL', 'TODAY', 'WEEK', 'MONTH'] as const;
  const CATEGORY_ORDER = ['ALL', 'AR', 'PCO'] as const;
  const STATUS_ORDER = ['ALL', 'COMPLETED', 'REVIEWED', 'FLAGGED'] as const;

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<HistoryCategoryFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>('ALL');
  const [datePreset, setDatePreset] = useState<HistoryDatePreset>('ALL');
  const [filterSlideDir, setFilterSlideDir] = useState<-1 | 0 | 1>(0);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});

  const statusCounts = useMemo(() => countHistoryByStatus(completedJobs), [completedJobs]);

  const availableReportDateKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const rep of completedJobs) {
      keys.add(toHistoryDateKey(getReportCompletionDate(rep)));
    }
    return keys;
  }, [completedJobs]);

  const filteredReports = useMemo(
    () =>
      filterHistoryReports(completedJobs, {
        category,
        status: statusFilter,
        search,
        preset: datePreset,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    [completedJobs, category, statusFilter, search, datePreset, dateFrom, dateTo]
  );

  const dateGroups = useMemo(
    () => groupHistoryReportsByDate(filteredReports),
    [filteredReports]
  );

  const summary = useMemo(() => buildHistorySummaryStats(dateGroups), [dateGroups]);

  const hasActiveFilter =
    Boolean(search.trim()) ||
    category !== 'ALL' ||
    statusFilter !== 'ALL' ||
    datePreset !== 'ALL' ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  const handleResetFilters = () => {
    setFilterSlideDir(0);
    setSearch('');
    setCategory('ALL');
    setStatusFilter('ALL');
    setDatePreset('ALL');
    setDateFrom('');
    setDateTo('');
    setShowDateFilter(false);
  };

  const toggleDateCollapse = (dateKey: string) => {
    setCollapsedDates(prev => ({ ...prev, [dateKey]: !prev[dateKey] }));
  };

  return (
    <main
      data-testid="work-history-panel"
      className="flex-1 px-4 pt-3.5 pb-24 space-y-3.5"
    >
      {/* Header + Quiet Summary */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-[18px] font-bold tracking-tight text-[var(--tl-text)]">
            Riwayat Pekerjaan
          </h1>
          <p className="text-[12px] text-[var(--tl-text-variant)] mt-0.5">
            {summary.totalReports} laporan selesai · {summary.totalDays} tanggal tercatat
          </p>
        </div>
        <span className="text-[11.5px] font-semibold text-[var(--tl-secondary)] pt-1 shrink-0">
          Arsip Resmi
        </span>
      </div>

      {/* Unified Structured Filter Grid Card */}
      <section
        aria-label="Filter Riwayat Pekerjaan"
        className="rounded-2xl bg-[var(--tl-card)] border border-[var(--tl-border)] shadow-[var(--tl-shadow-card)] divide-y divide-[var(--tl-border)] overflow-hidden"
      >
        {/* Row 1: Search + Custom Date Range Toggle */}
        <div data-tour="history-search-date" className="p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 flex items-center">
              <Search size={15} className="absolute left-3 text-[var(--tl-outline)]" />
              <input
                type="text"
                data-testid="history-search-input"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari WO, proyek, klien..."
                className="w-full h-9 pl-9 pr-8 rounded-xl bg-[var(--tl-low)] border border-[var(--tl-border)] text-[12.5px] text-[var(--tl-text)] focus:outline-none focus:ring-2 focus:ring-[var(--tl-primary)]"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Hapus pencarian riwayat"
                  onClick={() => setSearch('')}
                  className="absolute right-2 p-1 text-[var(--tl-outline)] hover:text-[var(--tl-text)] cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              type="button"
              data-testid="history-date-range-toggle"
              onClick={() => setShowDateFilter(v => !v)}
              aria-label="Filter Rentang Tanggal"
              className={`h-9 px-3 rounded-xl text-[12px] font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer border transition-colors ${
                showDateFilter || dateFrom || dateTo
                  ? 'bg-[var(--tl-primary)] border-[var(--tl-primary)] text-[var(--tl-on-primary)]'
                  : 'bg-[var(--tl-low)] border-[var(--tl-border)] text-[var(--tl-text)] hover:bg-[var(--tl-container)]'
              }`}
            >
              <Calendar size={14} />
              <span>Tanggal</span>
            </button>
          </div>

          {/* Active Custom Range Readout */}
          <AnimatePresence initial={false}>
            {(dateFrom || dateTo) && !showDateFilter && (
              <motion.div
                key="active-date-range-bar"
                variants={COLLAPSE_PANEL_VARIANTS}
                initial="initial"
                animate="animate"
                exit="exit"
                className="overflow-hidden"
              >
                <div
                  data-testid="active-date-range-bar"
                  className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[var(--tl-low)] border border-[var(--tl-border)] text-[11.5px] font-semibold text-[var(--tl-primary)]"
                >
                  <button
                    type="button"
                    onClick={() => setShowDateFilter(true)}
                    className="inline-flex items-center gap-1.5 min-w-0 cursor-pointer hover:underline text-left"
                  >
                    <Calendar size={12} className="shrink-0" />
                    <span className="truncate">
                      {formatDateRangeSummary({ startDate: dateFrom, endDate: dateTo })}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Hapus filter tanggal"
                    onClick={() => {
                      setDateFrom('');
                      setDateTo('');
                    }}
                    className="p-0.5 cursor-pointer hover:opacity-75 shrink-0"
                  >
                    <X size={13} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Row 2: Quick Period, Service Category & Project Status Filter Grid */}
        <div data-tour="history-filters" className="divide-y divide-[var(--tl-border)]">
          {/* Quick Date Period Bar */}
          <div className="p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--tl-text-variant)]">
                Periode
              </span>
              {hasActiveFilter && (
                <button
                  type="button"
                  data-testid="history-reset-filters-btn"
                  onClick={handleResetFilters}
                  className="text-[11px] font-semibold text-[var(--tl-secondary)] inline-flex items-center gap-1 cursor-pointer shrink-0 hover:underline"
                >
                  <RotateCcw size={11} />
                  <span>Reset Filter</span>
                </button>
              )}
            </div>
            <LayoutGroup id="history-period-group">
              <div
                role="tablist"
                aria-label="Filter Periode Riwayat"
                className="grid grid-cols-4 gap-0.5 p-0.5 rounded-xl bg-[var(--tl-low)] border border-[var(--tl-border)]"
              >
                {(
                  [
                    { id: 'ALL', label: 'Semua' },
                    { id: 'TODAY', label: 'Hari Ini' },
                    { id: 'WEEK', label: '7 Hari' },
                    { id: 'MONTH', label: '30 Hari' },
                  ] as const
                ).map(item => {
                  const active = !dateFrom && !dateTo && datePreset === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      data-testid={`history-preset-${item.id.toLowerCase()}`}
                      onClick={() => {
                        setFilterSlideDir(getSegmentDirection(PERIOD_ORDER, datePreset, item.id));
                        setDateFrom('');
                        setDateTo('');
                        setDatePreset(item.id);
                      }}
                      className={`relative min-h-[32px] rounded-[9px] text-[11.5px] font-semibold transition-colors duration-150 cursor-pointer select-none ${
                        active
                          ? 'text-[var(--tl-primary)] font-bold'
                          : 'text-[var(--tl-text-variant)] hover:text-[var(--tl-text)]'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="history-period-indicator"
                          transition={MOTION_SPRING.indicator}
                          aria-hidden="true"
                          className="absolute inset-0 rounded-[9px] bg-[var(--tl-card)] shadow-xs"
                        />
                      )}
                      <span className="relative z-10">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </LayoutGroup>
          </div>

          {/* Service Type Filter Grid */}
          <div className="p-2.5 space-y-1.5">
            <span className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--tl-text-variant)]">
              Kategori Layanan
            </span>
            <LayoutGroup id="history-category-group">
              <div className="grid grid-cols-3 gap-0.5 p-0.5 rounded-xl bg-[var(--tl-low)] border border-[var(--tl-border)]">
                {(
                  [
                    { id: 'ALL', label: `Semua (${completedJobs.length})` },
                    { id: 'AR', label: 'Anti Rayap' },
                    { id: 'PCO', label: 'Pest Control' },
                  ] as const
                ).map(cat => {
                  const active = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      data-testid={`history-cat-${cat.id.toLowerCase()}`}
                      onClick={() => {
                        setFilterSlideDir(getSegmentDirection(CATEGORY_ORDER, category, cat.id));
                        setCategory(cat.id);
                      }}
                      className={`relative min-h-[32px] px-1.5 rounded-[9px] text-[11.5px] font-semibold transition-colors duration-150 cursor-pointer truncate select-none ${
                        active
                          ? 'text-[var(--tl-on-primary)] font-bold'
                          : 'text-[var(--tl-text-variant)] hover:text-[var(--tl-text)]'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="history-category-indicator"
                          transition={MOTION_SPRING.indicator}
                          aria-hidden="true"
                          className="absolute inset-0 rounded-[9px] bg-[var(--tl-primary)] shadow-xs"
                        />
                      )}
                      <span className="relative z-10">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </LayoutGroup>
          </div>

          {/* Project Status Filter Grid (Semua | Selesai | Ditinjau | Ditandai) */}
          <div className="p-2.5 space-y-1.5">
            <span className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--tl-text-variant)]">
              Status Proyek
            </span>
            <LayoutGroup id="history-status-group">
              <div
                role="group"
                aria-label="Filter Status Laporan"
                data-testid="history-status-filter-bar"
                className="grid grid-cols-4 gap-0.5 p-0.5 rounded-xl bg-[var(--tl-low)] border border-[var(--tl-border)]"
              >
                {(
                  [
                    { id: 'ALL', label: 'Semua', count: statusCounts.all },
                    { id: 'COMPLETED', label: 'Selesai', count: statusCounts.completed },
                    { id: 'REVIEWED', label: 'Ditinjau', count: statusCounts.reviewed },
                    { id: 'FLAGGED', label: 'Ditandai', count: statusCounts.flagged },
                  ] as const
                ).map(st => {
                  const active = statusFilter === st.id;
                  const indicatorBg =
                    st.id === 'FLAGGED'
                      ? 'bg-amber-600'
                      : st.id === 'REVIEWED'
                      ? 'bg-sky-700'
                      : 'bg-[var(--tl-primary)]';
                  const activeText =
                    st.id === 'FLAGGED' || st.id === 'REVIEWED'
                      ? 'text-white'
                      : 'text-[var(--tl-on-primary)]';
                  return (
                    <button
                      key={st.id}
                      type="button"
                      aria-pressed={active}
                      data-testid={`history-status-${st.id.toLowerCase()}`}
                      onClick={() => {
                        setFilterSlideDir(getSegmentDirection(STATUS_ORDER, statusFilter, st.id));
                        setStatusFilter(st.id);
                      }}
                      className={`relative min-h-[34px] px-1 rounded-[9px] text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors duration-150 cursor-pointer select-none ${
                        active
                          ? activeText
                          : 'text-[var(--tl-text-variant)] hover:text-[var(--tl-text)]'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="history-status-indicator"
                          transition={MOTION_SPRING.indicator}
                          aria-hidden="true"
                          className={`absolute inset-0 rounded-[9px] shadow-xs ${indicatorBg}`}
                        />
                      )}
                      <span className="relative z-10 truncate">{st.label}</span>
                      <span
                        className={`relative z-10 font-mono text-[10px] tabular-nums ${
                          active ? 'opacity-90' : 'text-[var(--tl-outline)]'
                        }`}
                      >
                        {st.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </LayoutGroup>
          </div>
        </div>
      </section>

      {/* Interactive Date Range Picker Component */}
      <AnimatePresence initial={false}>
        {showDateFilter && (
          <motion.div
            key="history-date-picker-collapse"
            variants={COLLAPSE_PANEL_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            className="overflow-hidden"
          >
            <HistoryDateRangePicker
              startDate={dateFrom}
              endDate={dateTo}
              reportDateKeys={availableReportDateKeys}
              onChange={({ startDate, endDate }) => {
                setDateFrom(startDate);
                setDateTo(endDate);
                if (startDate || endDate) {
                  setDatePreset('ALL');
                }
              }}
              onClose={() => setShowDateFilter(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Date-Categorized History Sections */}
      <div data-tour="history-groups" className="overflow-x-clip">
        {(() => {
          const filterMotion = createTabContentVariants(filterSlideDir);
          return (
            <motion.div
              key={`${datePreset}-${category}-${statusFilter}-${dateFrom}-${dateTo}`}
              initial={filterMotion.initial}
              animate={filterMotion.animate}
            >
        {dateGroups.length > 0 ? (
          <div className="space-y-4">
            {dateGroups.map(group => {
              const isCollapsed = Boolean(collapsedDates[group.dateKey]);
              return (
                <section
                  key={group.dateKey}
                  data-testid="history-date-group"
                  data-date-key={group.dateKey}
                  aria-label={`Riwayat tanggal ${group.title}`}
                  className="space-y-2"
                >
                  {/* Date Category Header */}
                  <button
                    type="button"
                    data-testid="history-date-header"
                    onClick={() => toggleDateCollapse(group.dateKey)}
                    aria-expanded={!isCollapsed}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--tl-low)] hover:bg-[var(--tl-container)]/70 border border-[var(--tl-border)] flex items-center justify-between gap-2 text-left cursor-pointer group transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-[var(--tl-secondary)] shrink-0" />
                      <div className="min-w-0">
                        <h2 className="text-[13px] font-bold text-[var(--tl-text)] leading-tight truncate">
                          {group.title}
                        </h2>
                        {group.subtitle && (
                          <span className="block text-[11px] text-[var(--tl-text-variant)]">
                            {group.subtitle}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 text-[11.5px] font-semibold text-[var(--tl-text-variant)]">
                      <span className="font-mono tabular-nums text-[var(--tl-secondary)]">
                        {group.count} Laporan
                      </span>
                      <ChevronDown
                        size={14}
                        className={`transition-transform duration-200 ${isCollapsed ? 'rotate-0' : 'rotate-180'}`}
                      />
                    </div>
                  </button>

                  {/* Reports inside this date category */}
                  <AnimatePresence initial={false}>
                    {!isCollapsed && (
                      <motion.div
                        key={`group-body-${group.dateKey}`}
                        variants={COLLAPSE_PANEL_VARIANTS}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="overflow-hidden"
                      >
                        <div className="space-y-2.5 pl-2.5 border-l-2 border-[var(--tl-border-strong)] pt-0.5">
                          {group.reports.map((rep, idx) => {
                            const durationText = formatDurationId(
                              rep.durationSeconds,
                              rep.checkInAt,
                              rep.checkOutAt
                            );
                            const isSample = isSampleCompleteReport(rep.id);
                            const isTermite = isTermiteService(rep.serviceType);
                            const completedTime = formatTimeWib(rep.checkOutAt || rep.createdAt);
                            const hasGpsTag =
                              Boolean(loadWorkPointLocation(rep.id)) ||
                              isValidCoordinate(rep.checkInLatitude, rep.checkInLongitude);
                            const statusMeta = getHistoryStatusMeta(rep.status);

                            return (
                              <motion.article
                                key={rep.id}
                                data-testid="history-report-card"
                                data-report-status={rep.status}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                  duration: 0.18,
                                  delay: getStaggerDelay(idx),
                                  ease: MOTION_EASE.enter,
                                }}
                                className="rounded-2xl bg-[var(--tl-card)] border border-[var(--tl-border)] shadow-[var(--tl-shadow-card)] overflow-hidden transition-shadow hover:shadow-md"
                              >
                            {/* Card Top Bar */}
                            <div className="px-3.5 py-2 bg-[var(--tl-low)]/75 border-b border-[var(--tl-border)] flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5 text-[11px] min-w-0">
                                <span className="font-mono font-bold text-[var(--tl-text)]">
                                  {formatWoCode(rep.id)}
                                </span>
                                <span className="text-[var(--tl-outline)]">·</span>
                                <span
                                  className={`font-bold ${
                                    isTermite
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-[var(--tl-secondary)]'
                                  }`}
                                >
                                  {getServiceLabel(rep.serviceType)}
                                </span>
                                {isSample && (
                                  <>
                                    <span className="text-[var(--tl-outline)]">·</span>
                                    <span className="font-semibold text-[var(--tl-primary)]">
                                      Contoh Lengkap
                                    </span>
                                  </>
                                )}
                              </div>
                              <span className="text-[11px] font-mono font-semibold text-[var(--tl-text-variant)] tabular-nums shrink-0">
                                {completedTime}
                              </span>
                            </div>

                            <div className="p-3.5 space-y-2.5">
                              <div>
                                <strong className="block text-[14px] font-bold text-[var(--tl-text)] leading-snug truncate">
                                  {rep.projectName}
                                </strong>
                                <p className="text-[11.5px] text-[var(--tl-text-variant)] mt-0.5 truncate">
                                  {[rep.clientName, rep.projectAddress].filter(Boolean).join(' · ') ||
                                    'Lokasi lapangan'}
                                </p>
                              </div>

                              {/* Structured 2x2 Divided Metadata Grid (Zero Truncation on Mobile) */}
                              <div className="rounded-xl border border-[var(--tl-border)] bg-[var(--tl-low)] divide-y divide-[var(--tl-border)] text-[11.5px] text-[var(--tl-text-variant)] overflow-hidden">
                                <div className="grid grid-cols-2 divide-x divide-[var(--tl-border)]">
                                  <div className="px-2.5 py-1.5 flex items-center gap-1.5 font-semibold min-w-0">
                                    <Camera size={12} className="text-[var(--tl-secondary)] shrink-0" />
                                    <span className="truncate">{rep.photos.length} Foto</span>
                                  </div>
                                  <div className="px-2.5 py-1.5 flex items-center gap-1.5 font-semibold min-w-0">
                                    <Clock size={12} className="text-[var(--tl-secondary)] shrink-0" />
                                    <span className="truncate">{durationText}</span>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 divide-x divide-[var(--tl-border)]">
                                  <div className="px-2.5 py-1.5 flex items-center gap-1.5 font-semibold min-w-0">
                                    <MapPin
                                      size={12}
                                      className={
                                        hasGpsTag
                                          ? 'text-[var(--tl-secondary)] shrink-0'
                                          : 'text-[var(--tl-outline)] shrink-0'
                                      }
                                    />
                                    <span className={hasGpsTag ? 'text-[var(--tl-text)] truncate' : 'truncate'}>
                                      {hasGpsTag ? 'GPS Tersimpan' : 'Tanpa GPS'}
                                    </span>
                                  </div>
                                  <div
                                    data-testid="history-card-status"
                                    className={`px-2.5 py-1.5 flex items-center gap-1.5 font-bold min-w-0 ${
                                      statusMeta.tone === 'flagged'
                                        ? 'text-amber-700 dark:text-amber-400'
                                        : statusMeta.tone === 'reviewed'
                                        ? 'text-sky-700 dark:text-sky-400'
                                        : 'text-[var(--tl-secondary)]'
                                    }`}
                                  >
                                    {statusMeta.tone === 'flagged' ? (
                                      <AlertTriangle size={12} className="shrink-0" />
                                    ) : statusMeta.tone === 'reviewed' ? (
                                      <Eye size={12} className="shrink-0" />
                                    ) : (
                                      <CheckCircle2 size={12} className="shrink-0" />
                                    )}
                                    <span className="truncate">{statusMeta.label}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => onOpenDetail(rep)}
                                  className="min-h-[38px] px-3 rounded-xl bg-[var(--tl-low)] hover:bg-[var(--tl-container)] border border-[var(--tl-border)] text-[var(--tl-text)] text-[12px] font-semibold flex items-center justify-center gap-1 cursor-pointer active:scale-[0.98] transition-transform"
                                >
                                  <span>Lihat Detail</span>
                                  <ChevronRight size={14} />
                                </button>
                                <button
                                  type="button"
                                  data-testid="history-download-pdf-btn"
                                  disabled={downloadingPdfId === rep.id}
                                  onClick={() => onRequestDownloadPdf(rep)}
                                  className="min-h-[38px] px-3 rounded-xl bg-[var(--tl-primary)] hover:bg-[var(--tl-primary-container)] text-[var(--tl-on-primary)] text-[12px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] transition-transform disabled:opacity-60"
                                >
                                  <Download size={13.5} />
                                  <span>
                                    {downloadingPdfId === rep.id ? 'Menyiapkan...' : 'Unduh PDF'}
                                  </span>
                                </button>
                              </div>
                            </div>
                              </motion.article>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="p-7 rounded-2xl bg-[var(--tl-card)] border border-[var(--tl-border)] shadow-[var(--tl-shadow-card)] text-center space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-[var(--tl-low)] border border-[var(--tl-border)] text-[var(--tl-secondary)] flex items-center justify-center mx-auto">
              <History size={18} />
            </div>
            <div>
              <strong className="block text-[13px] font-bold text-[var(--tl-text)]">
                Belum ada riwayat pada filter ini
              </strong>
              <p className="text-[11.5px] text-[var(--tl-text-variant)] mt-0.5">
                Laporan yang sudah selesai akan otomatis terkelompok rapi berdasarkan tanggal pengerjaan.
              </p>
            </div>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="min-h-[36px] px-3.5 rounded-xl bg-[var(--tl-low)] hover:bg-[var(--tl-container)] border border-[var(--tl-border)] text-[var(--tl-primary)] text-xs font-semibold cursor-pointer"
              >
                Tampilkan Semua Riwayat
              </button>
            )}
          </div>
        )}
            </motion.div>
          );
        })()}
      </div>
    </main>
  );
};
