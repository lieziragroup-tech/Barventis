import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorkReport } from '@/entities/types';
import {
  buildHistorySummaryStats,
  countHistoryByStatus,
  filterHistoryReports,
  formatHistoryDateHeader,
  getHistoryStatusMeta,
  groupHistoryReportsByDate,
} from './workHistoryUtils';

function makeCompletedReport(overrides: Partial<WorkReport> & { id: string }): WorkReport {
  return {
    id: overrides.id,
    projectId: overrides.projectId || 'proj-1',
    projectName: overrides.projectName || 'Proyek Lapangan',
    projectAddress: overrides.projectAddress || 'Jl. Sudirman No. 1',
    clientName: overrides.clientName || 'PT Klien Utama',
    serviceType: overrides.serviceType || 'GENERAL_PEST_CONTROL',
    scheduledStartTime: '09:00',
    targetFocus: [],
    contractType: 'ONE_TIME',
    warrantyMonths: 0,
    executorId: 'exec-1',
    executorName: 'Budi Santoso',
    executorEmail: 'teknisi@gucimas.id',
    status: 'COMPLETED',
    projectLatitude: -6.2415,
    projectLongitude: 106.798,
    projectRadius: 100,
    riskScore: 0,
    riskLevel: 'NORMAL',
    riskEvents: [],
    treatmentRecord: null,
    photos: [],
    createdAt: overrides.createdAt || '2026-11-20T02:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-11-20T02:00:00.000Z',
    checkOutAt: overrides.checkOutAt,
    customerName: overrides.customerName,
    ...overrides,
  };
}

describe('workHistoryUtils', () => {
  const refDate = new Date(2026, 10, 20, 14, 0, 0); // 20 Nov 2026

  it('formats Hari Ini, Kemarin, and older Indonesian calendar headers accurately', () => {
    const today = formatHistoryDateHeader('2026-11-20', refDate);
    assert.equal(today.title, 'Hari Ini');
    assert.match(today.subtitle, /20 Nov 2026/);

    const yesterday = formatHistoryDateHeader('2026-11-19', refDate);
    assert.equal(yesterday.title, 'Kemarin');
    assert.match(yesterday.subtitle, /19 Nov 2026/);

    const threeDaysAgo = formatHistoryDateHeader('2026-11-17', refDate);
    assert.match(threeDaysAgo.title, /17 Nov 2026/);
    assert.equal(threeDaysAgo.subtitle, '3 hari lalu');
  });

  it('groups completed reports by date descending and orders items newest-first inside each date', () => {
    const reports = [
      makeCompletedReport({
        id: 'wr-old',
        projectName: 'Gudang Lama',
        checkOutAt: '2026-11-17T09:00:00',
      }),
      makeCompletedReport({
        id: 'wr-today-morning',
        projectName: 'Kantor Pagi',
        checkOutAt: '2026-11-20T09:30:00',
      }),
      makeCompletedReport({
        id: 'wr-yesterday',
        projectName: 'Resto Kemarin',
        serviceType: 'TERMITE_CONTROL',
        checkOutAt: '2026-11-19T15:00:00',
      }),
      makeCompletedReport({
        id: 'wr-today-afternoon',
        projectName: 'Kantor Siang',
        serviceType: 'TERMITE_CONTROL',
        checkOutAt: '2026-11-20T13:15:00',
      }),
    ];

    const groups = groupHistoryReportsByDate(reports, refDate);
    assert.equal(groups.length, 3);
    assert.equal(groups[0].dateKey, '2026-11-20');
    assert.equal(groups[0].title, 'Hari Ini');
    assert.equal(groups[0].count, 2);
    assert.equal(groups[0].reports[0].id, 'wr-today-afternoon');
    assert.equal(groups[0].reports[1].id, 'wr-today-morning');

    assert.equal(groups[1].dateKey, '2026-11-19');
    assert.equal(groups[1].title, 'Kemarin');
    assert.equal(groups[2].dateKey, '2026-11-17');

    const stats = buildHistorySummaryStats(groups);
    assert.deepEqual(stats, {
      totalReports: 4,
      totalDays: 3,
      termiteCount: 2,
      pestCount: 2,
    });
  });

  it('filters by quick date presets (TODAY, WEEK, MONTH), category, and search query', () => {
    const reports = [
      makeCompletedReport({
        id: 'wr-1001',
        projectName: 'Menara Sudirman',
        serviceType: 'TERMITE_CONTROL',
        checkOutAt: '2026-11-20T10:00:00',
      }),
      makeCompletedReport({
        id: 'wr-1002',
        projectName: 'Resto Kemang',
        serviceType: 'GENERAL_PEST_CONTROL',
        checkOutAt: '2026-11-18T11:00:00',
      }),
      makeCompletedReport({
        id: 'wr-1003',
        projectName: 'Gudang Bekasi',
        serviceType: 'TERMITE_CONTROL',
        checkOutAt: '2026-11-05T14:00:00',
      }),
      makeCompletedReport({
        id: 'wr-1004',
        projectName: 'Pabrik Lama',
        serviceType: 'GENERAL_PEST_CONTROL',
        checkOutAt: '2026-09-10T14:00:00',
      }),
    ];

    const todayOnly = filterHistoryReports(reports, {
      category: 'ALL',
      search: '',
      preset: 'TODAY',
      referenceDate: refDate,
    });
    assert.deepEqual(todayOnly.map(r => r.id), ['wr-1001']);

    const weekOnly = filterHistoryReports(reports, {
      category: 'ALL',
      search: '',
      preset: 'WEEK',
      referenceDate: refDate,
    });
    assert.deepEqual(weekOnly.map(r => r.id), ['wr-1001', 'wr-1002']);

    const monthTermite = filterHistoryReports(reports, {
      category: 'AR',
      search: '',
      preset: 'MONTH',
      referenceDate: refDate,
    });
    assert.deepEqual(monthTermite.map(r => r.id), ['wr-1001', 'wr-1003']);

    const bySearch = filterHistoryReports(reports, {
      category: 'ALL',
      search: 'kemang',
      preset: 'ALL',
      referenceDate: refDate,
    });
    assert.deepEqual(bySearch.map(r => r.id), ['wr-1002']);

    const customRange = filterHistoryReports(reports, {
      category: 'ALL',
      search: '',
      preset: 'TODAY',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-19',
      referenceDate: refDate,
    });
    assert.deepEqual(customRange.map(r => r.id), ['wr-1002', 'wr-1003']);
  });

  it('filters reports by project status (COMPLETED, REVIEWED, FLAGGED) and computes status counts/meta', () => {
    const reports = [
      makeCompletedReport({
        id: 'wr-s1',
        status: 'COMPLETED',
        serviceType: 'TERMITE_CONTROL',
        checkOutAt: '2026-11-20T10:00:00',
      }),
      makeCompletedReport({
        id: 'wr-s2',
        status: 'FLAGGED',
        serviceType: 'GENERAL_PEST_CONTROL',
        checkOutAt: '2026-11-20T09:00:00',
      }),
      makeCompletedReport({
        id: 'wr-s3',
        status: 'REVIEWED',
        serviceType: 'TERMITE_CONTROL',
        checkOutAt: '2026-11-19T14:00:00',
      }),
      makeCompletedReport({
        id: 'wr-s4',
        status: 'COMPLETED',
        serviceType: 'GENERAL_PEST_CONTROL',
        checkOutAt: '2026-11-18T11:00:00',
      }),
    ];

    assert.deepEqual(countHistoryByStatus(reports), {
      all: 4,
      completed: 2,
      reviewed: 1,
      flagged: 1,
    });

    const onlyFlagged = filterHistoryReports(reports, {
      category: 'ALL',
      status: 'FLAGGED',
      search: '',
      preset: 'ALL',
      referenceDate: refDate,
    });
    assert.deepEqual(onlyFlagged.map(r => r.id), ['wr-s2']);

    const onlyReviewed = filterHistoryReports(reports, {
      category: 'ALL',
      status: 'REVIEWED',
      search: '',
      preset: 'ALL',
      referenceDate: refDate,
    });
    assert.deepEqual(onlyReviewed.map(r => r.id), ['wr-s3']);

    const completedTermite = filterHistoryReports(reports, {
      category: 'AR',
      status: 'COMPLETED',
      search: '',
      preset: 'ALL',
      referenceDate: refDate,
    });
    assert.deepEqual(completedTermite.map(r => r.id), ['wr-s1']);

    assert.deepEqual(getHistoryStatusMeta('COMPLETED'), { label: 'Selesai', tone: 'completed' });
    assert.deepEqual(getHistoryStatusMeta('REVIEWED'), { label: 'Ditinjau', tone: 'reviewed' });
    assert.deepEqual(getHistoryStatusMeta('FLAGGED'), { label: 'Ditandai', tone: 'flagged' });
  });
});
