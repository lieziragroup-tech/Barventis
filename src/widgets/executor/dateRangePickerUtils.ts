export interface DateRangeValue {
  startDate: string; // YYYY-MM-DD or ''
  endDate: string;   // YYYY-MM-DD or ''
}

export interface CalendarDayCell {
  dateKey: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

export type QuickDateRangePreset = 'LAST_7' | 'LAST_30' | 'THIS_MONTH' | 'PREV_MONTH';

const MONTH_FULL_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const MONTH_SHORT_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

export const WEEKDAYS_SHORT_ID = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'] as const;

export function isValidDateKey(val?: string | null): boolean {
  if (!val || !/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const [y, m, d] = val.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKey(dateKey: string): Date | null {
  if (!isValidDateKey(dateKey)) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Ensures startDate <= endDate when both dates are valid YYYY-MM-DD strings.
 */
export function normalizeDateRange(startDate: string, endDate: string): DateRangeValue {
  const cleanStart = isValidDateKey(startDate) ? startDate : '';
  const cleanEnd = isValidDateKey(endDate) ? endDate : '';
  if (cleanStart && cleanEnd && cleanStart > cleanEnd) {
    return { startDate: cleanEnd, endDate: cleanStart };
  }
  return { startDate: cleanStart, endDate: cleanEnd };
}

/**
 * Handles intuitive two-tap calendar date range selection:
 * - First tap (or tap after a full range is selected) sets startDate and clears endDate.
 * - Second tap completes the range and auto-swaps if clicked before startDate.
 */
export function applyCalendarDaySelection(
  current: DateRangeValue,
  clickedDateKey: string
): DateRangeValue {
  if (!isValidDateKey(clickedDateKey)) return current;

  if (!current.startDate || (current.startDate && current.endDate)) {
    return { startDate: clickedDateKey, endDate: '' };
  }

  return normalizeDateRange(current.startDate, clickedDateKey);
}

/**
 * Evaluates whether a given calendar dateKey is the start endpoint, end endpoint,
 * or strictly between the selected date range boundaries.
 */
export function getDateRangeCellState(
  dateKey: string,
  range: DateRangeValue
): { isStart: boolean; isEnd: boolean; isBetween: boolean } {
  const normalized = normalizeDateRange(range.startDate, range.endDate);
  const isStart = Boolean(normalized.startDate) && dateKey === normalized.startDate;
  const isEnd = Boolean(normalized.endDate) && dateKey === normalized.endDate;
  const isBetween =
    Boolean(normalized.startDate) &&
    Boolean(normalized.endDate) &&
    dateKey > normalized.startDate &&
    dateKey < normalized.endDate;

  return { isStart, isEnd, isBetween };
}

/**
 * Builds a Monday-first calendar grid (always 5 or 6 full rows) for the given month.
 */
export function buildCalendarMonthGrid(
  year: number,
  monthIndex: number,
  referenceDate: Date = new Date()
): CalendarDayCell[] {
  const todayKey = toDateKey(referenceDate);
  const firstOfMonth = new Date(year, monthIndex, 1);
  // Convert JS Sunday=0..Saturday=6 into Monday=0..Sunday=6
  const startWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const totalCells = startWeekday + daysInMonth > 35 ? 42 : 35;

  const cells: CalendarDayCell[] = [];
  for (let i = 0; i < totalCells; i += 1) {
    const cellDate = new Date(year, monthIndex, 1 - startWeekday + i);
    const dateKey = toDateKey(cellDate);
    cells.push({
      dateKey,
      dayNumber: cellDate.getDate(),
      inCurrentMonth: cellDate.getMonth() === monthIndex && cellDate.getFullYear() === year,
      isToday: dateKey === todayKey,
    });
  }

  return cells;
}

export function computeQuickDateRange(
  preset: QuickDateRangePreset,
  referenceDate: Date = new Date()
): DateRangeValue {
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );

  if (preset === 'LAST_7') {
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    return { startDate: toDateKey(start), endDate: toDateKey(today) };
  }

  if (preset === 'LAST_30') {
    const start = new Date(today);
    start.setDate(today.getDate() - 29);
    return { startDate: toDateKey(start), endDate: toDateKey(today) };
  }

  if (preset === 'THIS_MONTH') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { startDate: toDateKey(start), endDate: toDateKey(today) };
  }

  // PREV_MONTH
  const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  return { startDate: toDateKey(prevStart), endDate: toDateKey(prevEnd) };
}

export function formatMonthYearId(year: number, monthIndex: number): string {
  const safeMonth = ((monthIndex % 12) + 12) % 12;
  return `${MONTH_FULL_ID[safeMonth]} ${year}`;
}

function formatCompactDateKey(dateKey: string, includeYear: boolean): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;
  const base = `${parsed.getDate()} ${MONTH_SHORT_ID[parsed.getMonth()]}`;
  return includeYear ? `${base} ${parsed.getFullYear()}` : base;
}

export function formatDateRangeSummary(range: DateRangeValue): string {
  const { startDate, endDate } = normalizeDateRange(range.startDate, range.endDate);

  if (startDate && endDate) {
    if (startDate === endDate) {
      return formatCompactDateKey(startDate, true);
    }
    const startYear = startDate.slice(0, 4);
    const endYear = endDate.slice(0, 4);
    return `${formatCompactDateKey(startDate, startYear !== endYear)} – ${formatCompactDateKey(endDate, true)}`;
  }

  if (startDate) {
    return `Mulai ${formatCompactDateKey(startDate, true)}`;
  }

  if (endDate) {
    return `Sampai ${formatCompactDateKey(endDate, true)}`;
  }

  return 'Pilih rentang tanggal';
}
