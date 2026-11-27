import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import { MOTION_EASE } from '@/shared/lib/motion';
import {
  applyCalendarDaySelection,
  buildCalendarMonthGrid,
  computeQuickDateRange,
  DateRangeValue,
  formatDateRangeSummary,
  formatMonthYearId,
  getDateRangeCellState,
  normalizeDateRange,
  parseDateKey,
  QuickDateRangePreset,
  WEEKDAYS_SHORT_ID,
} from './dateRangePickerUtils';

interface HistoryDateRangePickerProps {
  startDate: string;
  endDate: string;
  /** Optional set of YYYY-MM-DD keys that have completed reports, rendered as subtle calendar dots */
  reportDateKeys?: ReadonlySet<string>;
  onChange: (next: DateRangeValue) => void;
  onClose: () => void;
}

export const HistoryDateRangePicker: React.FC<HistoryDateRangePickerProps> = ({
  startDate,
  endDate,
  reportDateKeys,
  onChange,
  onClose,
}) => {
  const initialRef = useMemo(() => {
    const parsed = parseDateKey(startDate) || parseDateKey(endDate);
    return parsed || new Date();
  }, [startDate, endDate]);

  const [viewYear, setViewYear] = useState(initialRef.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialRef.getMonth());
  const [draft, setDraft] = useState<DateRangeValue>(() =>
    normalizeDateRange(startDate, endDate)
  );

  // Keep draft synced when parent resets externally
  useEffect(() => {
    setDraft(normalizeDateRange(startDate, endDate));
  }, [startDate, endDate]);

  const calendarCells = useMemo(
    () => buildCalendarMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(y => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(y => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const handleDayClick = (dateKey: string) => {
    const next = applyCalendarDaySelection(draft, dateKey);
    setDraft(next);
    // Live-apply once a valid start or complete range is selected so users see results immediately
    onChange(next);
  };

  const handleInputChange = (field: 'startDate' | 'endDate', val: string) => {
    const rawStart = field === 'startDate' ? val : draft.startDate;
    const rawEnd = field === 'endDate' ? val : draft.endDate;
    const next = normalizeDateRange(rawStart, rawEnd);
    setDraft(next);
    onChange(next);

    const parsed = parseDateKey(val);
    if (parsed) {
      setViewYear(parsed.getFullYear());
      setViewMonth(parsed.getMonth());
    }
  };

  const handleQuickPreset = (preset: QuickDateRangePreset) => {
    const next = computeQuickDateRange(preset);
    setDraft(next);
    onChange(next);
    const anchor = parseDateKey(next.endDate) || parseDateKey(next.startDate);
    if (anchor) {
      setViewYear(anchor.getFullYear());
      setViewMonth(anchor.getMonth());
    }
  };

  const handleClear = () => {
    const cleared = { startDate: '', endDate: '' };
    setDraft(cleared);
    onChange(cleared);
  };

  const summaryText = formatDateRangeSummary(draft);
  const hasRange = Boolean(draft.startDate || draft.endDate);

  return (
    <section
      data-testid="history-date-range-picker"
      aria-label="Pemilih Rentang Tanggal Riwayat"
      className="p-3.5 rounded-2xl bg-[var(--tl-card)] shadow-[var(--tl-shadow-card)] space-y-3 border border-[var(--tl-border)]"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--tl-border)]">
        <div className="flex items-center gap-1.5 min-w-0">
          <Calendar size={14} className="text-[var(--tl-secondary)] shrink-0" />
          <strong className="text-[13px] font-bold text-[var(--tl-text)] truncate">
            Rentang Tanggal
          </strong>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup pemilih tanggal"
          className="w-7 h-7 rounded-lg bg-[var(--tl-low)] hover:bg-[var(--tl-container)] border border-[var(--tl-border)] text-[var(--tl-text-variant)] flex items-center justify-center cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>

      {/* Start & End Date Direct Inputs */}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10.5px] font-semibold text-[var(--tl-text-variant)] mb-1">
            Tanggal Mulai
          </span>
          <input
            type="date"
            data-testid="date-range-start-input"
            value={draft.startDate}
            onChange={e => handleInputChange('startDate', e.target.value)}
            className="w-full h-9 px-2 rounded-xl bg-[var(--tl-low)] border border-[var(--tl-border)] text-[11.5px] font-mono text-[var(--tl-text)] focus:outline-none focus:ring-2 focus:ring-[var(--tl-primary)]"
          />
        </label>
        <label className="block">
          <span className="block text-[10.5px] font-semibold text-[var(--tl-text-variant)] mb-1">
            Tanggal Akhir
          </span>
          <input
            type="date"
            data-testid="date-range-end-input"
            value={draft.endDate}
            onChange={e => handleInputChange('endDate', e.target.value)}
            className="w-full h-9 px-2 rounded-xl bg-[var(--tl-low)] border border-[var(--tl-border)] text-[11.5px] font-mono text-[var(--tl-text)] focus:outline-none focus:ring-2 focus:ring-[var(--tl-primary)]"
          />
        </label>
      </div>

      {/* Quick Shortcuts inside Picker */}
      <div className="grid grid-cols-4 rounded-xl bg-[var(--tl-low)] border border-[var(--tl-border)] divide-x divide-[var(--tl-border)] overflow-hidden">
        {(
          [
            { id: 'LAST_7', label: '7 Hari' },
            { id: 'LAST_30', label: '30 Hari' },
            { id: 'THIS_MONTH', label: 'Bulan Ini' },
            { id: 'PREV_MONTH', label: 'Bulan Lalu' },
          ] as const
        ).map(preset => (
          <button
            key={preset.id}
            type="button"
            data-testid={`date-range-shortcut-${preset.id.toLowerCase()}`}
            onClick={() => handleQuickPreset(preset.id)}
            className="min-h-[30px] px-1.5 hover:bg-[var(--tl-container)] text-[11px] font-semibold text-[var(--tl-text)] transition-colors cursor-pointer truncate"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Interactive Monthly Calendar */}
      <div
        data-testid="date-range-calendar"
        className="rounded-xl bg-[var(--tl-low)]/65 border border-[var(--tl-border)] p-2.5 space-y-2"
      >
        <div className="flex items-center justify-between gap-2 px-0.5">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Bulan sebelumnya"
            className="w-7 h-7 rounded-lg bg-[var(--tl-card)] hover:bg-[var(--tl-container)] text-[var(--tl-text)] flex items-center justify-center cursor-pointer"
          >
            <ChevronLeft size={14} />
          </button>
          <span
            data-testid="date-range-month-label"
            className="text-[12px] font-bold text-[var(--tl-text)]"
          >
            {formatMonthYearId(viewYear, viewMonth)}
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Bulan berikutnya"
            className="w-7 h-7 rounded-lg bg-[var(--tl-card)] hover:bg-[var(--tl-container)] text-[var(--tl-text)] flex items-center justify-center cursor-pointer"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Weekday Row */}
        <div className="grid grid-cols-7 text-center">
          {WEEKDAYS_SHORT_ID.map(day => (
            <span
              key={day}
              className="text-[10px] font-semibold text-[var(--tl-text-variant)] py-0.5"
            >
              {day}
            </span>
          ))}
        </div>

        {/* Day Cells */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${viewYear}-${viewMonth}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: MOTION_EASE.enter }}
            className="grid grid-cols-7 gap-y-1"
          >
            {calendarCells.map(cell => {
              const { isStart, isEnd, isBetween } = getDateRangeCellState(cell.dateKey, draft);
              const hasReport = Boolean(reportDateKeys?.has(cell.dateKey));
              const isEndpoint = isStart || isEnd;

              return (
                <button
                  key={cell.dateKey}
                  type="button"
                  data-testid={`calendar-day-${cell.dateKey}`}
                  data-in-range={isEndpoint || isBetween ? 'true' : 'false'}
                  aria-pressed={isEndpoint}
                  onClick={() => handleDayClick(cell.dateKey)}
                  className={`relative h-8 flex flex-col items-center justify-center text-[11px] transition-colors cursor-pointer ${
                    isEndpoint
                      ? 'rounded-lg bg-[var(--tl-primary)] text-[var(--tl-on-primary)] font-bold shadow-xs'
                      : isBetween
                      ? 'bg-[var(--tl-secondary-container)]/75 text-[var(--tl-primary)] font-semibold'
                      : cell.inCurrentMonth
                      ? 'rounded-lg text-[var(--tl-text)] hover:bg-[var(--tl-card)] font-medium'
                      : 'rounded-lg text-[var(--tl-outline)] opacity-45 hover:opacity-75'
                  } ${
                    cell.isToday && !isEndpoint
                      ? 'ring-1 ring-[var(--tl-secondary)]'
                      : ''
                  }`}
                >
                  <span className="leading-none tabular-nums">{cell.dayNumber}</span>
                  {hasReport && (
                    <span
                      aria-hidden="true"
                      className={`absolute bottom-1 w-1 h-1 rounded-full ${
                        isEndpoint ? 'bg-[var(--tl-on-primary)]' : 'bg-[var(--tl-secondary)]'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer Summary & Actions */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span
          data-testid="date-range-summary-text"
          className="text-[11px] font-semibold text-[var(--tl-text-variant)] truncate"
        >
          {summaryText}
        </span>

        <div className="flex items-center gap-1.5 shrink-0">
          {hasRange && (
            <button
              type="button"
              data-testid="date-range-reset-btn"
              onClick={handleClear}
              className="min-h-[32px] px-2.5 rounded-lg bg-[var(--tl-low)] hover:bg-[var(--tl-container)] text-[var(--tl-error)] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw size={11} />
              <span>Reset</span>
            </button>
          )}
          <button
            type="button"
            data-testid="date-range-apply-btn"
            onClick={onClose}
            className="min-h-[32px] px-3 rounded-lg bg-[var(--tl-primary)] hover:bg-[var(--tl-primary-container)] text-[var(--tl-on-primary)] text-[11px] font-semibold cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>
    </section>
  );
};
