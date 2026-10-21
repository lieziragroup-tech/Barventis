import { describe, expect, it } from 'vitest';
import { calculateClosingStockQty, calculateDailyInventoryMetrics, calculateInferredFullFromBroken, convertQtyToStockUnit, getLocalDateISO, manualInDeltaFromTotal } from '../dailyInventoryMath';

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
