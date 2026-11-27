import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  aggregateOperationalSummaryFromRows,
  buildDateWindowKeys,
  computeJarivisDashboardMetrics,
  isPriorityReport,
  toLocalDateKey,
  RawOperationalReportRow,
} from '../src/shared/utils/operationalSummary.ts';
import {
  getWorkReportStatusMeta,
  getRiskLevelMeta,
} from '../src/shared/utils/riskMeta.ts';
import { resolveEffectiveTheme } from '../src/shared/hooks/useTheme.ts';

test('BENTO-01 [30-Day Window & Timezone]: buildDateWindowKeys produces 30 consecutive Asia/Jakarta dates', () => {
  const refDate = new Date('2026-10-27T02:15:00.000Z'); // 09:15 WIB on 2026-10-27
  const keys = buildDateWindowKeys(refDate, 30, 'Asia/Jakarta');

  assert.equal(keys.length, 30);
  assert.equal(keys[keys.length - 1], '2026-10-27');
  assert.equal(keys[0], '2026-09-28');

  const unique = new Set(keys);
  assert.equal(unique.size, 30);
  for (let i = 1; i < keys.length; i++) {
    assert.ok(keys[i] > keys[i - 1], `Expected ${keys[i]} > ${keys[i - 1]}`);
  }
});

test('BENTO-02 [KPI & Deduplication]: aggregateOperationalSummaryFromRows computes accurate 30-day metrics and deduplicates priority reports', () => {
  const refDate = new Date('2026-10-27T05:00:00.000Z');
  const rows: RawOperationalReportRow[] = [
    {
      id: 'rep-1',
      status: 'COMPLETED',
      risk_score: 0,
      risk_level: 'NORMAL',
      duration_seconds: 3600,
      check_in_valid: true,
      check_in_distance: 15,
      created_at: '2026-10-26T03:00:00.000Z',
      projects: { id: 'p1', project_name: 'Bank Victoria Fatmawati', client_name: 'Bank Victoria', service_type: 'TERMITE_CONTROL' },
      users: { id: 'u1', name: 'Budi Santoso' },
    },
    {
      id: 'rep-2',
      status: 'REVIEWED',
      risk_score: 20,
      risk_level: 'LOW_RISK',
      duration_seconds: 5400,
      check_in_valid: true,
      check_in_distance: 30,
      created_at: '2026-10-25T04:00:00.000Z',
      projects: { id: 'p2', project_name: 'Gedung PLN Bulungan', client_name: 'PT PLN', service_type: 'GENERAL_PEST_CONTROL' },
      users: { id: 'u2', name: 'Andi Wijaya' },
    },
    {
      id: 'rep-3',
      status: 'WORKING',
      risk_score: 0,
      risk_level: 'NORMAL',
      duration_seconds: null,
      check_in_valid: true,
      check_in_distance: 12,
      created_at: '2026-10-27T01:30:00.000Z',
      projects: { id: 'p3', project_name: 'Gudang Logistik Cikarang', client_name: 'PT Oreka', service_type: 'FUMIGATION' },
      users: { id: 'u1', name: 'Budi Santoso' },
    },
    {
      id: 'rep-4',
      status: 'FLAGGED',
      risk_score: 85,
      risk_level: 'CRITICAL',
      duration_seconds: 600,
      check_in_valid: false,
      check_in_distance: 480,
      created_at: '2026-10-27T02:00:00.000Z',
      projects: { id: 'p4', project_name: 'Hotel Grand Mahakam', client_name: 'PT Mahakam', service_type: 'RODENT_CONTROL' },
      users: { id: 'u3', name: 'Rudi Hermawan' },
    },
    {
      id: 'rep-5',
      status: 'COMPLETED',
      risk_score: 65,
      risk_level: 'HIGH_RISK',
      duration_seconds: 1800,
      check_in_valid: false,
      check_in_distance: 320,
      created_at: '2026-10-24T06:00:00.000Z',
      projects: { id: 'p5', project_name: 'Apartemen Senayan', client_name: 'PT Senayan', service_type: 'MOSQUITO_CONTROL' },
      users: { id: 'u2', name: 'Andi Wijaya' },
    },
    {
      id: 'rep-old',
      status: 'FLAGGED',
      risk_score: 90,
      risk_level: 'CRITICAL',
      duration_seconds: 600,
      check_in_valid: false,
      check_in_distance: 900,
      created_at: '2026-08-01T03:00:00.000Z',
    },
  ];

  const summary = aggregateOperationalSummaryFromRows(rows, refDate, 30, 'Asia/Jakarta');

  assert.equal(summary.totalJobs, 5);
  assert.equal(summary.completedJobs, 3);
  assert.equal(summary.workingJobs, 1);
  assert.equal(summary.flaggedJobs, 1);
  assert.equal(summary.highRiskCount, 2);
  assert.equal(summary.priorityUniqueCount, 2);
  assert.equal(summary.priorityReports.length, 2);
  assert.equal(summary.priorityReports[0].id, 'rep-4');
  assert.equal(summary.priorityReports[1].id, 'rep-5');
  assert.equal(summary.avgDurationMinutes, 48);
  assert.equal(summary.avgRiskScore, 34);
  assert.equal(summary.dailyTrend.length, 30);
  assert.equal(summary.statusBreakdown.length, 6);
});

test('BENTO-03 [Empty Dataset Integrity]: Zero reports produces honest zero counts and no fake trend data', () => {
  const refDate = new Date('2026-10-27T05:00:00.000Z');
  const summary = aggregateOperationalSummaryFromRows([], refDate, 30, 'Asia/Jakarta');

  assert.equal(summary.totalJobs, 0);
  assert.equal(summary.completedJobs, 0);
  assert.equal(summary.workingJobs, 0);
  assert.equal(summary.flaggedJobs, 0);
  assert.equal(summary.highRiskCount, 0);
  assert.equal(summary.priorityUniqueCount, 0);
  assert.equal(summary.avgDurationMinutes, 0);
  assert.equal(summary.avgRiskScore, 0);
  assert.equal(summary.dailyTrend.length, 30);
  assert.ok(summary.dailyTrend.every(d => d.total === 0 && d.completed === 0 && d.flagged === 0));
  assert.equal(summary.priorityReports.length, 0);
});

test('BENTO-04 [Theme System]: Light, Dark, and System preference resolution', () => {
  assert.equal(resolveEffectiveTheme('light', true), 'light');
  assert.equal(resolveEffectiveTheme('light', false), 'light');
  assert.equal(resolveEffectiveTheme('dark', false), 'dark');
  assert.equal(resolveEffectiveTheme('dark', true), 'dark');
  assert.equal(resolveEffectiveTheme('system', true), 'dark');
  assert.equal(resolveEffectiveTheme('system', false), 'light');
});

test('BENTO-05 [Status & Risk Semantics]: All 6 WorkReportStatus and 5 RiskLevel definitions have Indonesian labels and semantic classes', () => {
  const statuses = ['DRAFT', 'READY', 'WORKING', 'COMPLETED', 'FLAGGED', 'REVIEWED'] as const;
  for (const st of statuses) {
    const meta = getWorkReportStatusMeta(st);
    assert.ok(meta.label.length > 0);
    assert.ok(meta.description.length > 0);
    assert.ok(meta.badgeClass.includes('--status-'));
    assert.equal(meta.isVerifiedComplete, st === 'COMPLETED' || st === 'REVIEWED');
  }

  const risks = ['NORMAL', 'LOW_RISK', 'REVIEW', 'HIGH_RISK', 'CRITICAL'] as const;
  for (const rl of risks) {
    const meta = getRiskLevelMeta(rl);
    assert.ok(meta.label.length > 0);
    assert.ok(meta.badgeClass.includes('--status-'));
  }

  assert.equal(isPriorityReport('FLAGGED', 'NORMAL'), true);
  assert.equal(isPriorityReport('COMPLETED', 'HIGH_RISK'), true);
  assert.equal(isPriorityReport('COMPLETED', 'CRITICAL'), true);
  assert.equal(isPriorityReport('COMPLETED', 'NORMAL'), false);
  assert.equal(toLocalDateKey('2026-10-27T02:00:00.000Z', 'Asia/Jakarta'), '2026-10-27');
});

test('BENTO-06 [Anti-Slop & Security Guardrails]: No generic analytics filler or cross-tenant leaks in Bento components', () => {
  const repoRoot = process.cwd();
  const bentoUiSrc = fs.readFileSync(path.join(repoRoot, 'src/shared/ui/analytics-bento.tsx'), 'utf-8');
  const bentoWidgetSrc = fs.readFileSync(path.join(repoRoot, 'src/widgets/admin/OperationsAnalyticsBento.tsx'), 'utf-8');
  const adminRoutesSrc = fs.readFileSync(path.join(repoRoot, 'backend-src/modules/admin/adminRoutes.ts'), 'utf-8');

  const forbiddenTerms = ['seasonality', 'visitor sessions', 'desktop vs mobile', 'treemap', 'radarChart'];
  for (const term of forbiddenTerms) {
    assert.equal(bentoUiSrc.toLowerCase().includes(term.toLowerCase()), false);
    assert.equal(bentoWidgetSrc.toLowerCase().includes(term.toLowerCase()), false);
  }

  assert.equal(bentoUiSrc.includes('supabase'), false);
  assert.ok(adminRoutesSrc.includes('where wr.company_id = $1'));
  assert.ok(adminRoutesSrc.includes('dailyTrend'));
  assert.ok(adminRoutesSrc.includes('statusBreakdown'));
  assert.ok(adminRoutesSrc.includes('priorityReports'));
});

test('BENTO-07 [Jarivis 4-Tab Aggregation Engine]: Computes Operation Center, Live Map, Performance Team, and Business Funnel accurately', () => {
  const refDate = new Date('2026-10-27T05:00:00.000Z');
  const summary = aggregateOperationalSummaryFromRows([], refDate, 30, 'Asia/Jakarta');
  const computed = computeJarivisDashboardMetrics({
    summary,
    reports: [],
    projects: [
      {
        id: 'proj-1',
        projectName: 'Bank Victoria Fatmawati',
        clientName: 'Bank Victoria',
        address: 'Jl. RS Fatmawati',
        latitude: -6.28,
        longitude: 106.79,
        radius: 100,
        workDate: '2026-10-27',
        workType: 'Injeksi Rayap',
        serviceType: 'TERMITE_CONTROL',
        targetFocus: [],
        contractType: 'RECURRING',
        warrantyMonths: 36,
        scheduledStartTime: '09:00',
        createdBy: 'u1',
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ],
    executors: [
      {
        id: 'exec-1',
        name: 'Budi Santoso',
        email: 'budi@gucimas.com',
        nip: null,
        phone: null,
        isActive: true,
        totalJobs: 0,
        completedJobs: 0,
        highRiskJobs: 0,
        avgDurationMinutes: 0,
      },
    ],
    quotations: [
      {
        id: 'quo-1',
        noSurat: '001/GEP/X/2026',
        kategoriProyek: 'Korporat',
        kategori: 'AR',
        tipeKontrak: 'K',
        jenisLayanan: 'anti_rayap_injeksi',
        perihal: 'Penawaran Anti Rayap',
        kepadaNama: 'Bank Victoria',
        kepadaAlamatLines: ['Jakarta'],
        tanggal: new Date('2026-10-20T00:00:00.000Z'),
        items: [],
        biayaTambahan: [],
        diskonPct: 0,
        ppn: true,
        subtotal: 20000000,
        diskonRp: 0,
        ppnRp: 2200000,
        total: 22200000,
        marketingUid: 'm1',
        marketingNama: 'Siti',
        status: 'approved',
        companyId: 'c1',
        createdAt: new Date('2026-10-20T00:00:00.000Z'),
      },
    ],
    selectedDateKey: '2026-10-27',
    selectedPeriod: 'month',
    referenceDate: refDate,
  });

  assert.equal(computed.isToday, true);
  assert.equal(computed.operationCenter.workforceToday.totalStaff, 1);
  assert.equal(computed.operationCenter.idleStaffCount, 1);
  assert.equal(computed.liveMap.customerLocations.length, 1);
  assert.equal(computed.business.activeCustomersCount, 1);
  assert.equal(computed.business.funnel.contactedOrApprovedCount, 1);
  assert.equal(computed.business.funnel.totalEstimatedRevenueIdr, 22200000);
});
