import { describe, expect, it } from 'vitest';
import { calculateClosingStockQty, calculateDailyInventoryMetrics, getLocalDateISO } from '../dailyInventoryMath';

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
