import { describe, it, expect } from 'vitest';
import { calculateUsageVariance } from '../varianceCalculator';

describe('varianceCalculator', () => {
  const materials = [
    { id: 'm1', name: 'Coffee Beans', price: 100000, unit: 'kg' },
    { id: 'm2', name: 'Milk', price: 20000, unit: 'l' }
  ];

  it('calculates perfect match correctly', () => {
    const expected = [{ material_id: 'm1', expected_qty: 10 }];
    const actual = [{ date: '2026-09-24', daily_inventory_items: [{ material_id: 'm1', terpakai_qty: 10 }] }];
    
    const result = calculateUsageVariance(expected, actual, materials, new Map());
    expect(result[0].variance_qty).toBe(0); // 10 - 10
    expect(result[0].flag).toBe('NORMAL');
  });

  it('calculates OVER usage (more than expected)', () => {
    const expected = [{ material_id: 'm1', expected_qty: 10 }];
    const actual = [{ date: '2026-09-24', daily_inventory_items: [{ material_id: 'm1', terpakai_qty: 12 }] }];
    
    const result = calculateUsageVariance(expected, actual, materials, new Map());
    expect(result[0].variance_qty).toBe(2); // 12 - 10
    expect(result[0].flag).toBe('OVER_USAGE');
  });

  it('calculates UNDER usage (less than expected)', () => {
    const expected = [{ material_id: 'm1', expected_qty: 10 }];
    const actual = [{ date: '2026-09-24', daily_inventory_items: [{ material_id: 'm1', terpakai_qty: 8 }] }];
    
    const result = calculateUsageVariance(expected, actual, materials, new Map());
    expect(result[0].variance_qty).toBe(-2); // 8 - 10
    expect(result[0].flag).toBe('UNDER_USAGE');
  });

  it('aggregates multiple daily inventories', () => {
    const expected = [{ material_id: 'm1', expected_qty: 10 }];
    const actual = [
      { date: '2026-09-23', daily_inventory_items: [{ material_id: 'm1', terpakai_qty: 5 }] },
      { date: '2026-09-24', daily_inventory_items: [{ material_id: 'm1', terpakai_qty: 7 }] }
    ]; // total actual = 12
    
    const result = calculateUsageVariance(expected, actual, materials, new Map());
    expect(result[0].actual_qty).toBe(12);
    expect(result[0].variance_qty).toBe(2);
    expect(result[0].flag).toBe('OVER_USAGE');
  });
});
