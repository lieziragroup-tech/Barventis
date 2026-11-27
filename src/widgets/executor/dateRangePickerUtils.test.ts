import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCalendarDaySelection,
  buildCalendarMonthGrid,
  computeQuickDateRange,
  formatDateRangeSummary,
  formatMonthYearId,
  getDateRangeCellState,
  isValidDateKey,
  normalizeDateRange,
} from './dateRangePickerUtils';

describe('dateRangePickerUtils', () => {
  const refDate = new Date(2026, 10, 20); // 20 Nov 2026

  it('validates YYYY-MM-DD keys strictly including calendar overflow checks', () => {
    assert.equal(isValidDateKey('2026-11-20'), true);
    assert.equal(isValidDateKey('2024-02-29'), true);
    assert.equal(isValidDateKey('2026-02-29'), false);
    assert.equal(isValidDateKey('2026-13-01'), false);
    assert.equal(isValidDateKey('invalid'), false);
    assert.equal(isValidDateKey(''), false);
  });

  it('normalizes reversed start and end dates automatically', () => {
    assert.deepEqual(normalizeDateRange('2026-11-20', '2026-11-15'), {
      startDate: '2026-11-15',
      endDate: '2026-11-20',
    });
    assert.deepEqual(normalizeDateRange('2026-11-15', '2026-11-20'), {
      startDate: '2026-11-15',
      endDate: '2026-11-20',
    });
  });

  it('handles two-tap selection flow including reverse tap and reset on third tap', () => {
    const step1 = applyCalendarDaySelection({ startDate: '', endDate: '' }, '2026-11-18');
    assert.deepEqual(step1, { startDate: '2026-11-18', endDate: '' });

    // Second tap earlier than start auto-swaps cleanly
    const step2 = applyCalendarDaySelection(step1, '2026-11-14');
    assert.deepEqual(step2, { startDate: '2026-11-14', endDate: '2026-11-18' });

    // Cell states highlight start, between, and end accurately
    assert.deepEqual(getDateRangeCellState('2026-11-14', step2), {
      isStart: true,
      isEnd: false,
      isBetween: false,
    });
    assert.deepEqual(getDateRangeCellState('2026-11-16', step2), {
      isStart: false,
      isEnd: false,
      isBetween: true,
    });
    assert.deepEqual(getDateRangeCellState('2026-11-18', step2), {
      isStart: false,
      isEnd: true,
      isBetween: false,
    });

    // Third tap begins a fresh range
    const step3 = applyCalendarDaySelection(step2, '2026-11-20');
    assert.deepEqual(step3, { startDate: '2026-11-20', endDate: '' });
  });

  it('builds a Monday-first calendar month grid with accurate today flag', () => {
    // November 2026 starts on Sunday (index 6 in Monday-first grid)
    const grid = buildCalendarMonthGrid(2026, 10, refDate);
    assert.equal(grid.length, 42);
    assert.equal(grid[6].dateKey, '2026-11-01');
    assert.equal(grid[6].inCurrentMonth, true);
    assert.equal(grid[5].inCurrentMonth, false);

    const todayCell = grid.find(c => c.isToday);
    assert.ok(todayCell);
    assert.equal(todayCell.dateKey, '2026-11-20');
    assert.equal(formatMonthYearId(2026, 10), 'November 2026');
  });

  it('computes quick presets and formats Indonesian date range summaries cleanly', () => {
    assert.deepEqual(computeQuickDateRange('LAST_7', refDate), {
      startDate: '2026-11-14',
      endDate: '2026-11-20',
    });
    assert.deepEqual(computeQuickDateRange('THIS_MONTH', refDate), {
      startDate: '2026-11-01',
      endDate: '2026-11-20',
    });
    assert.deepEqual(computeQuickDateRange('PREV_MONTH', refDate), {
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });

    assert.equal(
      formatDateRangeSummary({ startDate: '2026-11-14', endDate: '2026-11-20' }),
      '14 Nov – 20 Nov 2026'
    );
    assert.equal(
      formatDateRangeSummary({ startDate: '2025-12-28', endDate: '2026-01-04' }),
      '28 Des 2025 – 4 Jan 2026'
    );
    assert.equal(
      formatDateRangeSummary({ startDate: '2026-11-20', endDate: '2026-11-20' }),
      '20 Nov 2026'
    );
    assert.equal(
      formatDateRangeSummary({ startDate: '2026-11-15', endDate: '' }),
      'Mulai 15 Nov 2026'
    );
    assert.equal(
      formatDateRangeSummary({ startDate: '', endDate: '' }),
      'Pilih rentang tanggal'
    );
  });
});
