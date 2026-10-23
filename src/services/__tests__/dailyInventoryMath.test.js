import { describe, expect, it } from 'vitest';
import { calculateClosingStockQty, calculateDailyInventoryMetrics, calculateInferredFullFromBroken, convertQtyToStockUnit, getLocalDateISO, getBrokenUnitLabel, isBrokenTrackingEnabled, getStockUnitsPerPack, manualInDeltaFromTotal } from '../dailyInventoryMath';

describe('calculateDailyInventoryMetrics', () => {
  it('uses staff-confirmed OUT as actual usage and keeps waste separate', () => {
    const result = calculateDailyInventoryMetrics({ opening: 10, incoming: 2, out: 3, waste: 1, closing: 8 });
    expect(result.actualUsage).toBe(3);
    expect(result.stockBasedUsage).toBe(3);
    expect(result.expectedClosing).toBe(8);
    expect(result.unexplainedVariance).toBe(0);
    expect(result.usageVariance).toBe(0);
  });

  it('uses net stock movement when transfers/production affect the location balance', () => {
    const result = calculateDailyInventoryMetrics({ opening: 10, incoming: 5, netMovement: 2, out: 3, waste: 1, closing: 8 });
    expect(result.stockBasedUsage).toBe(3);
    expect(result.expectedClosing).toBe(8);
    expect(result.usageVariance).toBe(0);
  });

  it('keeps internal production input separate from final consumption and avoids double counting', () => {
    const result = calculateDailyInventoryMetrics({ opening: 10, incoming: 0, netMovement: 0, out: 2, productionUsage: 3, waste: 0, closing: 5 });
    expect(result.actualUsage).toBe(2);
    expect(result.stockBasedUsage).toBe(2);
    expect(result.expectedClosing).toBe(5);
    expect(result.usageVariance).toBe(0);
  });

  it('reports a physical-count mismatch instead of hiding it', () => {
    const result = calculateDailyInventoryMetrics({ opening: 10, incoming: 0, out: 3, waste: 1, closing: 5 });
    expect(result.actualUsage).toBe(3);
    expect(result.stockBasedUsage).toBe(4);
    expect(result.unexplainedVariance).toBe(-1);
    expect(result.usageVariance).toBe(1);
  });
});

describe('calculateClosingStockQty', () => {
  it('converts full cartons and opened contents to the tracked pack unit', () => {
    expect(calculateClosingStockQty({ name: 'Bottle', unit: 'Carton', full_pack: 'Carton = 24 pcs' }, 2, 12)).toBe(2.5);
  });

  it('converts full packs to a tracked content unit', () => {
    expect(calculateClosingStockQty({ name: 'Coffee', unit: 'gr', full_pack: '1000 gr' }, 2, 250)).toBe(2250);
  });

  it('rejects an unclear broken-unit conversion', () => {
    expect(() => calculateClosingStockQty({ name: 'Syrup', unit: 'unit', full_pack: 'box' }, 1, 20)).toThrow(/Konversi FULL\/BROKEN/);
  });
});

describe('getLocalDateISO', () => {
  it('formats using local calendar fields instead of UTC conversion', () => {
    const date = new Date(2026, 9, 20, 1, 0, 0);
    expect(getLocalDateISO(date)).toBe('2026-10-20');
  });
});

describe('calculateInferredFullFromBroken', () => {
  it('infers FULL from opening balance after OUT and other posted movements, then validates weighed BROKEN', () => {
    // Opening 5 bottles - OUT 0.2 bottle = book closing 4.8 bottles.
    const result = calculateInferredFullFromBroken({ name: 'Sirup', unit: 'botol', full_pack: 'Botol = 1000 ml' }, 4.8, 800);
    expect(result.valid).toBe(true);
    expect(result.fullQty).toBe(4);
    expect(result.physicalEquivalentQty).toBeCloseTo(4.8, 5);
  });

  it('calculates FULL from opening minus OUT when no other movement exists', () => {
    const bookClosing = calculateDailyInventoryMetrics({ opening: 5, incoming: 0, out: 1.2, waste: 0, closing: 0 }).expectedClosing;
    const result = calculateInferredFullFromBroken({ name: 'Sirup', unit: 'botol', full_pack: 'Botol = 1000 ml' }, bookClosing, 800);
    expect(bookClosing).toBeCloseTo(3.8, 6);
    expect(result.valid).toBe(true);
    expect(result.fullQty).toBe(3);
  });

  it('requires reconciliation when BROKEN cannot leave a whole pack remainder', () => {
    const result = calculateInferredFullFromBroken({ name: 'Sirup', unit: 'botol', full_pack: 'Botol = 1000 ml' }, 4.8, 900);
    expect(result.valid).toBe(false);
    expect(result.fullQty).toBe(4); // FULL stays derived from book balance even when BROKEN fails validation.
    expect(result.reason).toMatch(/BROKEN harus kurang|tidak cocok/i);
  });
});


describe('convertQtyToStockUnit', () => {
  it('normalizes ml input to a bottle stock unit while preserving display-unit semantics', () => {
    expect(convertQtyToStockUnit({ name: 'Sirup', unit: 'botol', full_pack: 'Botol = 1000 ml' }, 200, 'ml')).toBeCloseTo(0.2, 6);
  });

  it('converts grams into package stock units when full pack defines the content size', () => {
    expect(convertQtyToStockUnit({ name: 'Coffee', unit: 'pck', full_pack: '1000 grm' }, 250, 'grm')).toBeCloseTo(0.25, 6);
  });

  it('converts a package count into the base stock unit', () => {
    expect(convertQtyToStockUnit({ name: 'Glass', unit: 'pcs', full_pack: 'Carton = 24 pcs' }, 2, 'Carton')).toBe(48);
  });

  it('rejects negative input to protect stock calculations', () => {
    expect(() => convertQtyToStockUnit({ name: 'Sirup', unit: 'botol', full_pack: 'Botol = 1000 ml' }, -1, 'ml')).toThrow(/tidak negatif/i);
  });
});


describe('manualInDeltaFromTotal', () => {
  it('subtracts source-derived receipts from the editable total IN to prevent duplicate entry', () => {
    expect(manualInDeltaFromTotal(7, 5)).toBe(2);
    expect(manualInDeltaFromTotal(5, 5)).toBe(0);
    expect(manualInDeltaFromTotal(2, 0)).toBe(2);
  });

  it('keeps a below-source total negative so draft/closing validation can reject it', () => {
    expect(manualInDeltaFromTotal(4, 5)).toBe(-1);
  });

  it('allows a blank visible IN field while the user edits', () => {
    expect(manualInDeltaFromTotal('', 0)).toBe('');
  });
});

// ─── Sprint 1 Augments (WB-01) ───────────────────────────────────────────────

describe('WB-01: calculateInferredFullFromBroken — extended cases', () => {
  // WB-01.1: normal path, canonical domain smoke (opening=5, OUT=200ml, BROKEN=800ml)
  it('WB-01.1 — normal closing: opening 5 botol, OUT 200ml → FULL=4, total=4800ml', () => {
    // book closing in stock unit (botol): 5 - 0.2 = 4.8
    const result = calculateInferredFullFromBroken(
      { name: 'Sirup', unit: 'botol', full_pack: 'Botol = 1000 ml' },
      4.8, 800
    );
    expect(result.valid).toBe(true);
    expect(result.fullQty).toBe(4);
    expect(result.physicalEquivalentQty).toBeCloseTo(4.8, 5);
  });

  // WB-01.2: BROKEN 900ml tidak cocok → RECONCILIATION_REQUIRED
  it('WB-01.2 — BROKEN > saldo sisa: flagged RECONCILIATION_REQUIRED, fullQty masih diturunkan dari saldo', () => {
    const result = calculateInferredFullFromBroken(
      { name: 'Sirup', unit: 'botol', full_pack: 'Botol = 1000 ml' },
      4.8, 900
    );
    expect(result.valid).toBe(false);
    expect(result.fullQty).toBe(4); // masih diturunkan dari saldo buku
    expect(result.reason).toMatch(/BROKEN harus kurang|tidak cocok/i);
  });

  // WB-01.3: BROKEN agregat > 1 pack (saldo 4600ml, BROKEN 1600ml)
  it('WB-01.3 — BROKEN agregat > 1 pack: ditolak karena harus < 1 kemasan utuh per aturan satu lot aktif', () => {
    const result = calculateInferredFullFromBroken(
      { name: 'Sirup', unit: 'botol', full_pack: 'Botol = 1000 ml' },
      4.6, 1600
    );
    // BROKEN 1600ml >= packSize 1000ml → invalid; reason harus eksplisit
    expect(result.valid).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  // WB-01.4: pack config missing + BROKEN > 0 → tidak bisa konversi BROKEN ke stock unit → invalid
  it('WB-01.4 — pack config kosong + BROKEN > 0: konversi gagal, sistem return valid=false dengan reason', () => {
    // unit='unit' + full_pack=null + broken=50 → getBrokenUnitLabel returns 'unit', convertQtyToStockUnit fails
    // because no pack details can be resolved for a dimensional cross-unit conversion.
    // Dengan BROKEN=0 sistem valid (fallback packSize=1); dengan BROKEN>0 dan unit ambigu → error path.
    const result = calculateInferredFullFromBroken(
      { name: 'Bahan Aneh', unit: 'unit', full_pack: '???invalid???' },
      5, 50
    );
    // Unit konversi tidak bisa diselesaikan → valid false
    expect(result.valid).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  // WB-01.3 lanjutan: no-movement day → opening FULL = FULL akhir
  it('WB-01.3b — no-movement day: FULL akhir sama dengan opening FULL', () => {
    // opening = 5 botol (5000ml), OUT=0, IN=0, WASTE=0 → book closing = 5
    const result = calculateInferredFullFromBroken(
      { name: 'Sirup', unit: 'botol', full_pack: 'Botol = 1000 ml' },
      5, 0
    );
    expect(result.valid).toBe(true);
    expect(result.fullQty).toBe(5);
  });
});

describe('WB-01: isBrokenTrackingEnabled — material mode detection', () => {
  // WB-01.10: material BASE_UNIT / non-broken → tracking disabled
  it('WB-01.10a — explicit broken_tracking_enabled=false: tracking disabled', () => {
    expect(isBrokenTrackingEnabled({ name: 'Sachet', unit: 'pcs', full_pack: null, broken_tracking_enabled: false })).toBe(false);
  });

  it('WB-01.10b — explicit broken_tracking_enabled=true: tracking enabled', () => {
    expect(isBrokenTrackingEnabled({ name: 'Sirup', unit: 'botol', full_pack: 'Botol = 1000 ml', broken_tracking_enabled: true })).toBe(true);
  });

  it('WB-01.10c — material dengan full_pack ml/gram: tracking enabled otomatis', () => {
    expect(isBrokenTrackingEnabled({ name: 'Susu', unit: 'botol', full_pack: 'Botol = 946 ml' })).toBe(true);
  });

  it('WB-01.10d — material tanpa full_pack konten: tracking tidak enabled', () => {
    expect(isBrokenTrackingEnabled({ name: 'Item', unit: 'pcs', full_pack: null })).toBe(false);
  });
});

describe('WB-01: getStockUnitsPerPack — konversi pack ke unit stok', () => {
  it('WB-01.7 — pack = 1000 ml, unit = botol: returns 1 stock unit per pack', () => {
    // 1 botol = 1 botol (tracked in botol)
    const mat = { name: 'Sirup', unit: 'botol', full_pack: 'Botol = 1000 ml' };
    // convertQtyToStockUnit(mat, 1000, 'ml') = 1 botol
    expect(getStockUnitsPerPack(mat)).toBeCloseTo(1, 5);
  });

  it('WB-01.7b — pack = 1000 gr, unit = gr: returns 1000 gr per pack', () => {
    const mat = { name: 'Kopi', unit: 'gr', full_pack: '1000 gr' };
    expect(getStockUnitsPerPack(mat)).toBeCloseTo(1000, 2);
  });
});

describe('WB-01: getBrokenUnitLabel — label satuan timbang BROKEN', () => {
  it('WB-01.8 — material botol 1000ml: label BROKEN adalah ml', () => {
    expect(getBrokenUnitLabel({ name: 'Sirup', unit: 'botol', full_pack: 'Botol = 1000 ml' })).toBe('ml');
  });

  it('WB-01.8b — material tanpa full_pack: fallback ke unit material', () => {
    expect(getBrokenUnitLabel({ name: 'Item', unit: 'pcs', full_pack: null })).toBe('pcs');
  });
});
