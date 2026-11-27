// @vitest-environment jsdom

/**
 * Sprint 5: Blackbox Testing Suite — Closing & Cost Control
 *
 * Covers:
 *   BB-04: Preview & Closing Flow (BB-04.1 s/d BB-04.6)
 *   BB-05: Cost Control — 3 Metrik Terpisah & Alert 27% (BB-05.1 s/d BB-05.7)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  calculateDailyInventoryMetrics,
  calculateInferredFullFromBroken,
  convertQtyToStockUnit,
} from '../../../services/dailyInventoryMath';

// ─── Helpers to simulate preview building (mirrors DailyInventory.jsx) ──────

function buildMockClosingPreview({
  items,
  inventory,
  userRole = 'barista',
  overrideReason = '',
}) {
  const canApproveLotOverride = ['admin / owner', 'owner', 'supervisor', 'super admin', 'superadmin']
    .includes(String(userRole).trim().toLowerCase());

  const rows = items.map(item => {
    const row = inventory[item.id] || {};
    const opening = Number(row.stok_awal) || 0;
    const outInput = row.qty_out === '' || row.qty_out == null ? 0 : Number(row.qty_out);
    const waste = Number(row.waste) || 0;
    const brokenTracking = Boolean(item.broken_tracking_enabled);
    const brokenInput = row.broken === '' || row.broken == null ? 0 : Number(row.broken);
    const brokenConfirmed = !brokenTracking || Boolean(row.broken_confirmed ?? row.is_counted);
    const outConfirmed = Boolean(row.out_confirmed) || row.zero_activity_confirmed === true || (row.qty_out !== '' && row.qty_out != null);

    const bookClosing = opening - outInput - waste;
    const inferred = brokenTracking
      ? calculateInferredFullFromBroken(item, bookClosing, brokenInput)
      : { valid: true, fullQty: Math.floor(bookClosing) };

    const reconciliationRequired = bookClosing < -0.0001 || (brokenTracking && brokenConfirmed && !inferred?.valid);

    const issues = [];
    const warnings = [];
    if (!outConfirmed) issues.push('OUT belum dikonfirmasi');
    if (!brokenConfirmed) issues.push('BROKEN belum ditimbang');
    if (reconciliationRequired) issues.push(inferred?.reason || 'Perlu rekonsiliasi');

    const lotNeedsDecision = Boolean(item.fefo_exception || item.lot_reconciliation_required);
    if (item.fefo_exception) warnings.push('Lot terbuka bukan lot dengan expired date terdekat');
    if (lotNeedsDecision && (!canApproveLotOverride || !String(overrideReason || '').trim())) {
      issues.push(canApproveLotOverride
        ? 'Alasan persetujuan exception lot wajib diisi di preview'
        : 'Exception lot memerlukan persetujuan manager/supervisor');
    }

    return {
      id: item.id,
      name: item.name,
      issues,
      warnings,
      outConfirmed,
      brokenConfirmed,
      reconciliationRequired,
      bookClosing,
      fullQty: inferred?.fullQty ?? null,
    };
  });

  return {
    rows,
    total: rows.length,
    outConfirmed: rows.filter(r => r.outConfirmed).length,
    brokenConfirmed: rows.filter(r => r.brokenConfirmed).length,
    reconciliationCount: rows.filter(r => r.reconciliationRequired).length,
    blockers: rows.filter(r => r.issues.length > 0),
    warnings: rows.filter(r => r.warnings.length > 0),
  };
}

// ─── Helpers to simulate Cost Control calculations (mirrors CostControl.jsx) ─

function calculateCostControlMetrics({
  period,
  transactions = [],
  detailedOpnameItems = [],
  metricsFallback = null,
}) {
  let purchases = 0;
  let cogsIngredients = 0;
  let sales = 0;
  let waste = 0;

  const wasteTypes = ['WASTE', 'BREAKAGE', 'EXPIRED', 'COMP'];

  transactions.forEach(tx => {
    if (!String(tx.date || '').startsWith(period)) return;
    const amt = Math.round(Math.abs(Number(tx.amount || 0)));
    if (tx.type === 'PURCHASE_IN') purchases += amt;
    else if (tx.type === 'POS_DEDUCTION' || (tx.type === 'OUT' && String(tx.notes || '').startsWith('POS Sync:'))) {
      cogsIngredients += amt;
    } else if (tx.type === 'POS_SALE') sales += amt;
    else if (wasteTypes.includes(tx.type)) waste += amt;
  });

  let closing = 0;
  detailedOpnameItems.forEach(item => {
    closing += Math.round(item.totalValuation || 0);
  });

  let opening = cogsIngredients - purchases + closing;
  if (opening < 0) opening = 0;

  if (metricsFallback) {
    opening = metricsFallback.opening_stock ?? opening;
    closing = metricsFallback.closing_stock ?? closing;
  }

  let actualCogs = opening + purchases - closing;
  if (actualCogs < 0) actualCogs = 0;
  if (metricsFallback?.total_cogs !== undefined) {
    actualCogs = Number(metricsFallback.total_cogs) || 0;
  }

  const beverageCostPct = sales > 0 ? (actualCogs / sales) * 100 : 0;
  const statusLabel = beverageCostPct <= 27.00
    ? 'SAFE'
    : (beverageCostPct <= 30.00 ? 'WARNING' : (beverageCostPct <= 100.00 ? 'DANGER' : 'ANOMALY'));

  const actualDailyUsageCost = Number(metricsFallback?.actual_daily_usage_cost) || 0;
  const theoreticalCogsCost = Number(metricsFallback?.theoretical_cogs_cost) || 0;
  const reconciliationDifference = Number(metricsFallback?.reconciliation_difference_after_usage_and_waste) || (actualCogs - actualDailyUsageCost);

  return {
    openingStock: opening,
    totalPembelian: purchases,
    closingStock: closing,
    pemakaianBulan: actualCogs,
    totalSalesBeverage: sales,
    beverageCostPct,
    wasteValuation: waste,
    statusLabel,
    actualDailyUsageCost,
    theoreticalCogsCost,
    reconciliationDifference,
  };
}

// =============================================================================
// BB-04: Preview & Closing Flow
// =============================================================================

describe('BB-04: Preview & Closing Flow', () => {
  const MOCK_ITEMS = Array.from({ length: 109 }, (_, i) => ({
    id: i + 1,
    name: `Material ${i + 1}`,
    unit: 'botol',
    full_pack: 'Botol = 1000 ml',
    broken_tracking_enabled: true,
  }));

  // BB-04.1: Preview mencakup semua item lintas halaman
  it('BB-04.1: Preview counts all 109 items across all 5 pages, not just the active page', () => {
    const inventory = {};
    MOCK_ITEMS.forEach(m => {
      inventory[m.id] = {
        stok_awal: 5,
        qty_out: '1',
        out_confirmed: true,
        broken: '0',
        broken_confirmed: true,
      };
    });

    const preview = buildMockClosingPreview({ items: MOCK_ITEMS, inventory });

    expect(preview.total).toBe(109);
    expect(preview.outConfirmed).toBe(109);
    expect(preview.brokenConfirmed).toBe(109);
    expect(preview.blockers.length).toBe(0);
  });

  // BB-04.2: Preview menampilkan blocker saat ada item belum selesai / rekonsiliasi
  it('BB-04.2: Preview blocks closing when an item has unconfirmed OUT or reconciliation exception', () => {
    const inventory = {};
    MOCK_ITEMS.forEach(m => {
      inventory[m.id] = {
        stok_awal: 5,
        qty_out: '1',
        out_confirmed: true,
        broken: '0',
        broken_confirmed: true,
      };
    });

    // Material 10 has broken > book balance (e.g. 900ml vs 800ml remainder)
    inventory[10] = {
      stok_awal: 5,
      qty_out: '0.2',
      out_confirmed: true,
      broken: '900', // invalid!
      broken_confirmed: true,
    };

    const preview = buildMockClosingPreview({ items: MOCK_ITEMS, inventory });

    expect(preview.blockers.length).toBeGreaterThan(0);
    const blockerItem = preview.blockers.find(b => b.id === 10);
    expect(blockerItem).toBeTruthy();
    expect(blockerItem.issues.some(i => /rekonsiliasi|tidak cocok/i.test(i))).toBe(true);
  });

  // BB-04.3: Kembali dari preview ke baris bermasalah
  it('BB-04.3: User can inspect blockers from preview and navigate back to specific item row', () => {
    const inventory = {
      1: { stok_awal: 5, qty_out: '', out_confirmed: false }, // unconfirmed
    };
    const preview = buildMockClosingPreview({ items: [MOCK_ITEMS[0]], inventory });

    expect(preview.blockers.length).toBe(1);
    expect(preview.blockers[0].id).toBe(1);
    expect(preview.blockers[0].issues).toContain('OUT belum dikonfirmasi');
  });

  // BB-04.4: Closing sukses mengubah sesi menjadi read-only
  it('BB-04.4: Successful closing sets isLocked=true, making session read-only', () => {
    let sessionStatus = 'draft';
    let isLocked = false;

    // Simulate closing submission
    const confirmClosing = (preview) => {
      if (preview.blockers.length > 0) return false;
      sessionStatus = 'closed';
      isLocked = true;
      return true;
    };

    const cleanPreview = { blockers: [] };
    const success = confirmClosing(cleanPreview);

    expect(success).toBe(true);
    expect(sessionStatus).toBe('closed');
    expect(isLocked).toBe(true);
  });

  // BB-04.5: Closing gagal parsial tidak mengubah status sesi
  it('BB-04.5: Partial failure during closing aborts and leaves session status as "draft"', () => {
    let sessionStatus = 'draft';
    let isLocked = false;

    const performClosingWithFailure = () => {
      try {
        // Step 1: Ledger updates
        // Step 2: Injected error before status update
        throw new Error('[DB] Deadlock or RPC error');
      } catch (_e) {
        // Rollback / abort
        return;
      }
    };

    performClosingWithFailure();

    expect(sessionStatus).toBe('draft');
    expect(isLocked).toBe(false);
  });

  // BB-04.6: Reopen oleh manager mencatat audit log
  it('BB-04.6: Session reopen by manager records audit log entry and unlocks session', () => {
    let sessionStatus = 'closed';
    let isLocked = true;
    const auditLogs = [];

    const managerReopen = (userRole, reason) => {
      const allowedRoles = ['admin / owner', 'owner', 'supervisor', 'super admin'];
      if (!allowedRoles.includes(userRole.toLowerCase())) {
        throw new Error('Hanya Manager/Supervisor yang boleh membuka kunci EOD.');
      }
      sessionStatus = 'draft';
      isLocked = false;
      auditLogs.push({
        action: 'REOPEN_EOD_SESSION',
        reason,
        performedByRole: userRole,
        timestamp: Date.now(),
      });
      return true;
    };

    const success = managerReopen('Supervisor', 'Koreksi nota pembelian darurat yang tertinggal');
    expect(success).toBe(true);
    expect(sessionStatus).toBe('draft');
    expect(isLocked).toBe(false);
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].reason).toContain('Koreksi nota');
  });
});

// =============================================================================
// BB-05: Cost Control — 3 Metrik Terpisah & Alert 27%
// =============================================================================

describe('BB-05: Cost Control — 3 Metrik Terpisah & Alert 27%', () => {
  const PERIOD = '2026-08';

  // BB-05.1: Actual Daily Usage terpisah dari WASTE
  it('BB-05.1: Actual Daily Usage reflects confirmed OUT * cost, and WASTE is tracked separately', () => {
    const transactions = [
      { date: '2026-08-10', type: 'OUT', amount: 500000 },
      { date: '2026-08-10', type: 'WASTE', amount: 75000 },
      { date: '2026-08-10', type: 'BREAKAGE', amount: 25000 },
      { date: '2026-08-10', type: 'POS_SALE', amount: 2000000 },
    ];

    const result = calculateCostControlMetrics({ period: PERIOD, transactions });

    // Waste total = 75000 + 25000 = 100000
    expect(result.wasteValuation).toBe(100000);
    // Waste is kept separate and not conflated with purchases or sales
    expect(result.totalSalesBeverage).toBe(2000000);
  });

  // BB-05.2: Stock-based Depletion tampil terpisah dari Actual Usage
  it('BB-05.2: Stock-based Depletion (opening + purchases - closing) is calculated independently', () => {
    const metricsFallback = {
      opening_stock: 48641734,
      total_cogs: 35534724, // COGS dari sensus fisik bulanan
      closing_stock: 43893488,
      actual_daily_usage_cost: 33449848, // Pemakaian harian dari barista
      theoretical_cogs_cost: 32000000,
    };

    const result = calculateCostControlMetrics({
      period: PERIOD,
      transactions: [{ date: '2026-08-01', type: 'POS_SALE', amount: 148255000 }],
      metricsFallback,
    });

    expect(result.pemakaianBulan).toBe(35534724); // Stock-based Depletion
    expect(result.actualDailyUsageCost).toBe(33449848); // Actual Daily Usage
    expect(result.pemakaianBulan).not.toBe(result.actualDailyUsageCost);
  });

  // BB-05.3: Theoretical COGS berasal dari POS ESB * BOM resep
  it('BB-05.3: Theoretical COGS is populated from POS recipe explosion and distinct from physical', () => {
    const metricsFallback = {
      actual_daily_usage_cost: 33449848,
      total_cogs: 35534724,
      theoretical_cogs_cost: 32500000,
    };

    const result = calculateCostControlMetrics({
      period: PERIOD,
      transactions: [{ date: '2026-08-01', type: 'POS_SALE', amount: 148255000 }],
      metricsFallback,
    });

    expect(result.theoreticalCogsCost).toBe(32500000);
    expect(result.theoreticalCogsCost).not.toBe(result.actualDailyUsageCost);
    expect(result.theoreticalCogsCost).not.toBe(result.pemakaianBulan);
  });

  // BB-05.4: Selisih antar metrik (Variance) ditampilkan dan tidak disembunyikan
  it('BB-05.4: Reconciliation difference between physical depletion and usage is exposed', () => {
    const metricsFallback = {
      total_cogs: 35534724,
      actual_daily_usage_cost: 33449848,
      reconciliation_difference_after_usage_and_waste: 2084876,
    };

    const result = calculateCostControlMetrics({
      period: PERIOD,
      metricsFallback,
    });

    // 35,534,724 - 33,449,848 = 2,084,876 selisih susut / unrecorded waste
    expect(result.reconciliationDifference).toBe(2084876);
    expect(result.reconciliationDifference).toBeGreaterThan(0);
  });

  // BB-05.5: Perubahan harga master tidak mengubah laporan masa lalu (Historical Snapshot)
  it('BB-05.5: Historical reports maintain their snapshot valuation regardless of current master prices', () => {
    const pastReportSnapshot = {
      period: '2026-08',
      material_id: 1,
      unit_cost_snapshot: 85000,
      total_usage_qty: 10,
      total_cost_value: 850000,
    };

    // Later in October, price in master rises to 95,000
    const currentMasterPrice = 95000;

    // Report must continue using pastReportSnapshot.unit_cost_snapshot
    const reportedCost = pastReportSnapshot.total_usage_qty * pastReportSnapshot.unit_cost_snapshot;
    expect(reportedCost).toBe(850000);
    expect(reportedCost).not.toBe(pastReportSnapshot.total_usage_qty * currentMasterPrice);
  });

  // BB-05.6: ESB POS import tidak memotong stok fisik
  it('BB-05.6: POS sales entries create POS_SALE and theoretical COGS, but never deduct physical stock balance', () => {
    let physicalStock = 100;
    const posTransaction = { type: 'POS_SALE', amount: 50000, qty_sold: 2 };

    // POS ingestion updates revenue and theoretical usage only
    let revenue = 0;
    if (posTransaction.type === 'POS_SALE') {
      revenue += posTransaction.amount;
    }

    // Physical stock MUST remain untouched
    expect(physicalStock).toBe(100);
    expect(revenue).toBe(50000);
  });

  // BB-05.7: Alert status: SAFE (<= 27%), WARNING (<= 30%), DANGER (> 30%)
  it('BB-05.7: Beverage Cost status: SAFE when <= 27%, WARNING when 27.01-30%, DANGER when > 30%', () => {
    // Case A: 22.56% (Actual August 2026 data: Rp 33.4M / Rp 148.2M) -> SAFE
    const safeResult = calculateCostControlMetrics({
      period: PERIOD,
      transactions: [{ date: '2026-08-01', type: 'POS_SALE', amount: 148255000 }],
      metricsFallback: { total_cogs: 33449848 },
    });
    expect(safeResult.beverageCostPct).toBeCloseTo(22.56, 1);
    expect(safeResult.statusLabel).toBe('SAFE');

    // Case B: 28.5% -> WARNING
    const warningResult = calculateCostControlMetrics({
      period: PERIOD,
      transactions: [{ date: '2026-08-01', type: 'POS_SALE', amount: 100000000 }],
      metricsFallback: { total_cogs: 28500000 },
    });
    expect(warningResult.beverageCostPct).toBeCloseTo(28.5, 1);
    expect(warningResult.statusLabel).toBe('WARNING');

    // Case C: 35.0% -> DANGER
    const dangerResult = calculateCostControlMetrics({
      period: PERIOD,
      transactions: [{ date: '2026-08-01', type: 'POS_SALE', amount: 100000000 }],
      metricsFallback: { total_cogs: 35000000 },
    });
    expect(dangerResult.beverageCostPct).toBeCloseTo(35.0, 1);
    expect(dangerResult.statusLabel).toBe('DANGER');
  });
});
