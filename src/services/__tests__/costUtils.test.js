import { describe, it, expect } from 'vitest';
import { parsePackSize, isPackUnitConsistent, getUnitPrice, calculateIngredientCost, getPackUnitInfo, convertQtyToStockUnit, resolvePackInfo } from '../costUtils';

describe('parsePackSize', () => {
  it('parses grams', () => {
    expect(parsePackSize('1000 gr')).toBe(1000);
    expect(parsePackSize('250.5 gram')).toBe(250.5);
  });

  it('parses ml', () => {
    expect(parsePackSize('500 ml')).toBe(500);
  });

  it('parses liters to ml', () => {
    expect(parsePackSize('1.5 L')).toBe(1500);
    expect(parsePackSize('19 liter')).toBe(19000);
  });

  it('parses pcs', () => {
    expect(parsePackSize('24 pcs')).toBe(24);
  });

  it('parses kg to grams', () => {
    expect(parsePackSize('2.5 kg')).toBe(2500);
  });

  it('parses non-standard packaging suffixes (carton/drigen/etc)', () => {
    expect(parsePackSize('1 Carton')).toBe(1);
    expect(parsePackSize('1 drigen')).toBe(1);
  });

  it('parses the new structured "X = Y unit" format', () => {
    // Recommended format for ambiguous packaging (Carton, Krat, Galon, ...)
    // where the plain suffix alone doesn't tell you how many base units are inside.
    expect(parsePackSize('Carton = 24 pcs')).toBe(24);
    expect(parsePackSize('Jerigen = 5000 ml')).toBe(5000);
  });

  it('returns 0 for empty/null/unknown', () => {
    expect(parsePackSize('')).toBe(0);
    expect(parsePackSize(null)).toBe(0);
    expect(parsePackSize('unknown')).toBe(0);
  });
});

describe('isPackUnitConsistent', () => {
  it('flags a weight/volume unit whose full_pack has no weight/volume keyword', () => {
    expect(isPackUnitConsistent('kg', '1 pcs')).toBe(false);
  });

  it('accepts a weight/volume unit whose full_pack matches', () => {
    expect(isPackUnitConsistent('kg', '1000 gr')).toBe(true);
  });

  it('does not second-guess count-style units (pcs/pck/etc)', () => {
    expect(isPackUnitConsistent('pcs', '1 pcs')).toBe(true);
  });

  it('always accepts the structured "X = Y unit" format', () => {
    expect(isPackUnitConsistent('Carton', 'Carton = 24 pcs')).toBe(true);
  });

  // Phase 1 fix: cases that previously slipped through (always returned true)
  it('rejects gr unit with pcs full_pack (was previously always returning true — bug)', () => {
    expect(isPackUnitConsistent('gr', '1 pcs')).toBe(false);
  });

  it('rejects ml unit with count-only full_pack', () => {
    expect(isPackUnitConsistent('ml', '1 btl')).toBe(false);
  });

  it('accepts gr unit with gr full_pack', () => {
    expect(isPackUnitConsistent('gr', '1000 gr')).toBe(true);
  });

  it('accepts gr unit with ml full_pack (gr/ml cross-dimension is valid in F&B)', () => {
    expect(isPackUnitConsistent('gr', '1000 ml')).toBe(true);
  });

  it('accepts pck unit with gr full_pack (container with weight content)', () => {
    expect(isPackUnitConsistent('pck', '1000 gr')).toBe(true);
  });

  it('accepts btl unit with ml full_pack', () => {
    expect(isPackUnitConsistent('btl', '750 ml')).toBe(true);
  });

  it('rejects empty full_pack regardless of unit', () => {
    expect(isPackUnitConsistent('gr', '')).toBe(false);
    expect(isPackUnitConsistent('pck', '')).toBe(false);
  });
});

describe('getUnitPrice', () => {
  it('resolves via full_pack when dimensionally consistent', () => {
    const material = { price: 50000, unit: 'kg', full_pack: '1000 gr' };
    const result = getUnitPrice(material);
    expect(result.resolved).toBe(true);
    expect(result.unitPrice).toBe(50); // 50000 / 1000
  });

  it('an explicit unit_conversions override wins over full_pack, even if full_pack is unparseable', () => {
    const material = { id: 42, price: 300000, unit: 'Carton', full_pack: 'random-format-xyz' };
    const unitConversionMap = new Map([[42, 24]]); // 1 Carton = 24 pcs
    const result = getUnitPrice(material, unitConversionMap);
    expect(result.resolved).toBe(true);
    expect(result.source).toBe('unit_conversions');
    expect(result.unitPrice).toBe(12500); // 300000 / 24
  });

  it('surfaces a human-readable reason when unresolved (dimension mismatch)', () => {
    const material = { name: 'Susu UHT', price: 20000, unit: 'kg', full_pack: '1 pcs' };
    const result = getUnitPrice(material);
    expect(result.resolved).toBe(false);
    expect(result.reason).toContain('Susu UHT');
  });

  it('surfaces a human-readable reason when unresolved (missing full_pack)', () => {
    const material = { name: 'Bahan Baru', price: 10000, unit: 'kg' };
    const result = getUnitPrice(material);
    expect(result.resolved).toBe(false);
    expect(result.reason).toContain('tidak bisa dibaca');
  });
});

describe('calculateIngredientCost', () => {
  it('same unit, pack size of 1: qty * price', () => {
    const material = { price: 10000, unit: 'pcs', full_pack: '1 pcs' };
    expect(calculateIngredientCost(material, 5, 'pcs')).toBe(50000);
  });

  it('different unit: converts via pack size', () => {
    const material = { price: 50000, unit: 'kg', full_pack: '1000 gr' };
    expect(calculateIngredientCost(material, 500, 'gr')).toBe(25000);
  });

  it('returns 0 (unresolved) when full_pack is missing entirely, rather than silently using qty * price', () => {
    // This is the behavior the 2026-07 audit deliberately changed: a missing/unparseable
    // full_pack must NOT silently fall back to treating price as a per-base-unit price.
    const material = { price: 10000, unit: 'kg' };
    expect(calculateIngredientCost(material, 3, 'gr')).toBe(0);
  });

  it('returns 0 (unresolved) when unit and full_pack are dimensionally inconsistent', () => {
    const material = { price: 20000, unit: 'kg', full_pack: '1 pcs' };
    expect(calculateIngredientCost(material, 2, 'kg')).toBe(0);
  });

  it('reads material.price as the per-pack price (callers resolve new_price ?? price before calling)', () => {
    // getUnitPrice/calculateIngredientCost only ever look at `material.price` — the
    // materials table keeps `price` and `new_price` in sync on every write (see
    // createMaterial/updateMaterial), and callers elsewhere in the app explicitly do
    // `new_price ?? price` before passing the object in. This isn't costUtils' concern.
    const material = { price: 20000, unit: 'pcs', full_pack: '1 pcs' };
    expect(calculateIngredientCost(material, 2, 'pcs')).toBe(40000);
  });

  it('parses the new structured "X = Y unit" full_pack format end-to-end', () => {
    const material = { price: 240000, unit: 'Carton', full_pack: 'Carton = 24 pcs' };
    expect(calculateIngredientCost(material, 1, 'pcs')).toBe(10000); // 240000 / 24
  });

  // MANUAL UNIT CONVERSION (2026-08): a recipe can now pick EITHER side of a
  // structured "Carton = 24 pcs" conversion as its ingredient unit, and both
  // must price the same physical quantity identically.
  it('costs the same whether a recipe uses the pack unit or the content unit', () => {
    const material = { price: 240000, unit: 'Carton', full_pack: 'Carton = 24 pcs' };
    const costForOneCarton = calculateIngredientCost(material, 1, 'Carton');
    const costFor24Pcs = calculateIngredientCost(material, 24, 'pcs');
    expect(costForOneCarton).toBe(240000); // the whole pack's price
    expect(costForOneCarton).toBe(costFor24Pcs);
  });

  it('a partial pack-unit qty scales proportionally', () => {
    const material = { price: 240000, unit: 'Carton', full_pack: 'Carton = 24 pcs' };
    expect(calculateIngredientCost(material, 0.5, 'carton')).toBe(120000); // half a carton
  });

  it('legacy (non-structured) materials are unaffected by the pack/content distinction', () => {
    // No structured "=" in full_pack -> packUnitLabel and contentUnit both
    // resolve to the same (material.unit) value, so the new pack-vs-content
    // scaling branch never fires and behavior is byte-for-byte what it was
    // before this fix.
    const material = { price: 50000, unit: 'kg', full_pack: '1000 gr' };
    expect(calculateIngredientCost(material, 500, 'gr')).toBe(25000);
  });

  // Phase 2 fix: THE CRITICAL BUG — unit='gr' + full_pack='1000 ml' must NOT multiply 1000x
  it('BUG-FIX Phase 2: unit=gr + full_pack=1000ml does NOT multiply qty by 1000 (Strawberry syrup case)', () => {
    // Before fix: 10 * 1000 * (111000/1000) = 1_110_000. After fix: 10 * (111000/1000) = 1110
    const material = { price: 111000, unit: 'gr', full_pack: '1000 ml' };
    expect(calculateIngredientCost(material, 10, 'gr')).toBe(1110);
  });

  it('BUG-FIX Phase 2: Fresh Milk unit=gr + full_pack=1000ml, 160gr must NOT explode (Avocado Coffee case)', () => {
    // Before fix: 160 * 1000 * (19000/1000) = 3_040_000. After fix: 160 * (19000/1000) = 3040
    const material = { price: 19000, unit: 'gr', full_pack: '1000 ml' };
    expect(calculateIngredientCost(material, 160, 'gr')).toBe(3040);
  });

  it('BUG-FIX Phase 2: Soda Water unit=gr + full_pack=1000ml, 90gr correct', () => {
    // Before fix: 90 * 1000 * (7000/1000) = 630_000. After fix: 90 * (7000/1000) = 630
    const material = { price: 7000, unit: 'gr', full_pack: '1000 ml' };
    expect(calculateIngredientCost(material, 90, 'gr')).toBe(630);
  });

  it('BUG-FIX Phase 2: Espresso unit=gr + full_pack=2000gr stays normal (same-dimension, no explosion)', () => {
    // Both gr — should work correctly without the fix too, but verify no regression
    const material = { price: 220000, unit: 'gr', full_pack: '2000 gr' };
    expect(calculateIngredientCost(material, 20, 'gr')).toBe(2200);
  });

  it('BUG-FIX Phase 2: pck unit + ml full_pack (bottle) is NOT treated as gr-vs-ml mismatch', () => {
    // pck is a container unit — still allowed to scale; this is different from gr-vs-ml
    const material = { price: 111000, unit: 'pck', full_pack: 'pck = 750 ml' };
    // 1 pck = 750 ml, cost of 10 ml = 111000/750 * 10 = 1480
    expect(calculateIngredientCost(material, 10, 'ml')).toBe(1480);
  });
});

describe('getPackUnitInfo', () => {
  it('splits a structured full_pack into pack label and content unit', () => {
    expect(getPackUnitInfo('Carton = 24 pcs', 'Carton')).toEqual({ packUnitLabel: 'carton', contentUnit: 'pcs' });
    expect(getPackUnitInfo('Jerigen = 5000 ml', 'Jerigen')).toEqual({ packUnitLabel: 'jerigen', contentUnit: 'ml' });
  });

  it('falls back to the material unit for both sides on legacy free-text full_pack', () => {
    expect(getPackUnitInfo('1000 gr', 'gr')).toEqual({ packUnitLabel: 'gr', contentUnit: 'gr' });
  });

  // Phase 2 fix: gr unit + ml full_pack → both sides must resolve to the content unit (ml), not gr
  it('BUG-FIX Phase 2: unit=gr full_pack=1000ml → both packUnitLabel and contentUnit are ml (no pack scaling)', () => {
    const result = getPackUnitInfo('1000 ml', 'gr');
    expect(result.packUnitLabel).toBe('ml');
    expect(result.contentUnit).toBe('ml');
  });

  it('BUG-FIX Phase 2: unit=ml full_pack=1000ml → both sides ml (same dimension)', () => {
    const result = getPackUnitInfo('1000 ml', 'ml');
    expect(result.packUnitLabel).toBe('ml');
    expect(result.contentUnit).toBe('ml');
  });

  it('BUG-FIX Phase 2: unit=gr full_pack=2000gr → both sides gr', () => {
    const result = getPackUnitInfo('2000 gr', 'gr');
    expect(result.packUnitLabel).toBe('gr');
    expect(result.contentUnit).toBe('gr');
  });
});

describe('resolvePackInfo', () => {
  it('returns size and contentUnit for a valid material', () => {
    const result = resolvePackInfo('1000 gr', 'pck');
    expect(result.size).toBe(1000);
    expect(result.unit).toBe('gr');
    expect(result.consistent).toBe(true);
  });

  it('returns size=0 when inconsistent (gr unit with pcs full_pack)', () => {
    const result = resolvePackInfo('1 pcs', 'gr');
    expect(result.size).toBe(0);
    expect(result.consistent).toBe(false);
  });

  it('returns size=0 when full_pack is empty', () => {
    const result = resolvePackInfo('', 'pck');
    expect(result.size).toBe(0);
    expect(result.consistent).toBe(false);
  });

  it('handles structured format', () => {
    const result = resolvePackInfo('Carton = 24 pcs', 'Carton');
    expect(result.size).toBe(24);
    expect(result.unit).toBe('pcs');
    expect(result.consistent).toBe(true);
  });
});

describe('convertQtyToStockUnit', () => {
  it('converts a content-unit usage qty down to the pack-tracked stock unit', () => {
    const material = { unit: 'Carton', full_pack: 'Carton = 24 pcs' };
    expect(convertQtyToStockUnit(material, 24, 'pcs')).toEqual({ qty: 1, resolved: true });
  });

  it('keeps the legacy gr/ml -> kg/l divide-by-1000 behavior', () => {
    const material = { unit: 'kg', full_pack: '1000 gr' };
    expect(convertQtyToStockUnit(material, 500, 'gr')).toEqual({ qty: 0.5, resolved: true });
  });

  it('is a no-op when the usage unit already matches the stock unit', () => {
    const material = { unit: 'pcs', full_pack: '1 pcs' };
    expect(convertQtyToStockUnit(material, 3, 'pcs')).toEqual({ qty: 3, resolved: true });
  });
});

describe('parsePackSize', () => {
  it('parses grams', () => {
    expect(parsePackSize('1000 gr')).toBe(1000);
    expect(parsePackSize('250.5 gram')).toBe(250.5);
  });

  it('parses ml', () => {
    expect(parsePackSize('500 ml')).toBe(500);
  });

  it('parses liters to ml', () => {
    expect(parsePackSize('1.5 L')).toBe(1500);
    expect(parsePackSize('19 liter')).toBe(19000);
  });

  it('parses pcs', () => {
    expect(parsePackSize('24 pcs')).toBe(24);
  });

  it('parses kg to grams', () => {
    expect(parsePackSize('2.5 kg')).toBe(2500);
  });

  it('parses non-standard packaging suffixes (carton/drigen/etc)', () => {
    expect(parsePackSize('1 Carton')).toBe(1);
    expect(parsePackSize('1 drigen')).toBe(1);
  });

  it('parses the new structured "X = Y unit" format', () => {
    // Recommended format for ambiguous packaging (Carton, Krat, Galon, ...)
    // where the plain suffix alone doesn't tell you how many base units are inside.
    expect(parsePackSize('Carton = 24 pcs')).toBe(24);
    expect(parsePackSize('Jerigen = 5000 ml')).toBe(5000);
  });

  it('returns 0 for empty/null/unknown', () => {
    expect(parsePackSize('')).toBe(0);
    expect(parsePackSize(null)).toBe(0);
    expect(parsePackSize('unknown')).toBe(0);
  });
});

describe('isPackUnitConsistent', () => {
  it('flags a weight/volume unit whose full_pack has no weight/volume keyword', () => {
    expect(isPackUnitConsistent('kg', '1 pcs')).toBe(false);
  });

  it('accepts a weight/volume unit whose full_pack matches', () => {
    expect(isPackUnitConsistent('kg', '1000 gr')).toBe(true);
  });

  it('does not second-guess count-style units (pcs/pck/etc)', () => {
    expect(isPackUnitConsistent('pcs', '1 pcs')).toBe(true);
  });

  it('always accepts the structured "X = Y unit" format', () => {
    expect(isPackUnitConsistent('Carton', 'Carton = 24 pcs')).toBe(true);
  });
});

describe('getUnitPrice', () => {
  it('resolves via full_pack when dimensionally consistent', () => {
    const material = { price: 50000, unit: 'kg', full_pack: '1000 gr' };
    const result = getUnitPrice(material);
    expect(result.resolved).toBe(true);
    expect(result.unitPrice).toBe(50); // 50000 / 1000
  });

  it('an explicit unit_conversions override wins over full_pack, even if full_pack is unparseable', () => {
    const material = { id: 42, price: 300000, unit: 'Carton', full_pack: 'random-format-xyz' };
    const unitConversionMap = new Map([[42, 24]]); // 1 Carton = 24 pcs
    const result = getUnitPrice(material, unitConversionMap);
    expect(result.resolved).toBe(true);
    expect(result.source).toBe('unit_conversions');
    expect(result.unitPrice).toBe(12500); // 300000 / 24
  });

  it('surfaces a human-readable reason when unresolved (dimension mismatch)', () => {
    const material = { name: 'Susu UHT', price: 20000, unit: 'kg', full_pack: '1 pcs' };
    const result = getUnitPrice(material);
    expect(result.resolved).toBe(false);
    expect(result.reason).toContain('Susu UHT');
  });

  it('surfaces a human-readable reason when unresolved (missing full_pack)', () => {
    const material = { name: 'Bahan Baru', price: 10000, unit: 'kg' };
    const result = getUnitPrice(material);
    expect(result.resolved).toBe(false);
    expect(result.reason).toContain('tidak bisa dibaca');
  });
});

describe('calculateIngredientCost', () => {
  it('same unit, pack size of 1: qty * price', () => {
    const material = { price: 10000, unit: 'pcs', full_pack: '1 pcs' };
    expect(calculateIngredientCost(material, 5, 'pcs')).toBe(50000);
  });

  it('different unit: converts via pack size', () => {
    const material = { price: 50000, unit: 'kg', full_pack: '1000 gr' };
    expect(calculateIngredientCost(material, 500, 'gr')).toBe(25000);
  });

  it('returns 0 (unresolved) when full_pack is missing entirely, rather than silently using qty * price', () => {
    // This is the behavior the 2026-07 audit deliberately changed: a missing/unparseable
    // full_pack must NOT silently fall back to treating price as a per-base-unit price.
    const material = { price: 10000, unit: 'kg' };
    expect(calculateIngredientCost(material, 3, 'gr')).toBe(0);
  });

  it('returns 0 (unresolved) when unit and full_pack are dimensionally inconsistent', () => {
    const material = { price: 20000, unit: 'kg', full_pack: '1 pcs' };
    expect(calculateIngredientCost(material, 2, 'kg')).toBe(0);
  });

  it('reads material.price as the per-pack price (callers resolve new_price ?? price before calling)', () => {
    // getUnitPrice/calculateIngredientCost only ever look at `material.price` — the
    // materials table keeps `price` and `new_price` in sync on every write (see
    // createMaterial/updateMaterial), and callers elsewhere in the app explicitly do
    // `new_price ?? price` before passing the object in. This isn't costUtils' concern.
    const material = { price: 20000, unit: 'pcs', full_pack: '1 pcs' };
    expect(calculateIngredientCost(material, 2, 'pcs')).toBe(40000);
  });

  it('parses the new structured "X = Y unit" full_pack format end-to-end', () => {
    const material = { price: 240000, unit: 'Carton', full_pack: 'Carton = 24 pcs' };
    expect(calculateIngredientCost(material, 1, 'pcs')).toBe(10000); // 240000 / 24
  });

  // MANUAL UNIT CONVERSION (2026-08): a recipe can now pick EITHER side of a
  // structured "Carton = 24 pcs" conversion as its ingredient unit, and both
  // must price the same physical quantity identically.
  it('costs the same whether a recipe uses the pack unit or the content unit', () => {
    const material = { price: 240000, unit: 'Carton', full_pack: 'Carton = 24 pcs' };
    const costForOneCarton = calculateIngredientCost(material, 1, 'Carton');
    const costFor24Pcs = calculateIngredientCost(material, 24, 'pcs');
    expect(costForOneCarton).toBe(240000); // the whole pack's price
    expect(costForOneCarton).toBe(costFor24Pcs);
  });

  it('a partial pack-unit qty scales proportionally', () => {
    const material = { price: 240000, unit: 'Carton', full_pack: 'Carton = 24 pcs' };
    expect(calculateIngredientCost(material, 0.5, 'carton')).toBe(120000); // half a carton
  });

  it('legacy (non-structured) materials are unaffected by the pack/content distinction', () => {
    // No structured "=" in full_pack -> packUnitLabel and contentUnit both
    // resolve to the same (material.unit) value, so the new pack-vs-content
    // scaling branch never fires and behavior is byte-for-byte what it was
    // before this fix.
    const material = { price: 50000, unit: 'kg', full_pack: '1000 gr' };
    expect(calculateIngredientCost(material, 500, 'gr')).toBe(25000);
  });
});

describe('getPackUnitInfo', () => {
  it('splits a structured full_pack into pack label and content unit', () => {
    expect(getPackUnitInfo('Carton = 24 pcs', 'Carton')).toEqual({ packUnitLabel: 'carton', contentUnit: 'pcs' });
    expect(getPackUnitInfo('Jerigen = 5000 ml', 'Jerigen')).toEqual({ packUnitLabel: 'jerigen', contentUnit: 'ml' });
  });

  it('falls back to the material unit for both sides on legacy free-text full_pack', () => {
    expect(getPackUnitInfo('1000 gr', 'gr')).toEqual({ packUnitLabel: 'gr', contentUnit: 'gr' });
  });
});

describe('convertQtyToStockUnit', () => {
  it('converts a content-unit usage qty down to the pack-tracked stock unit', () => {
    const material = { unit: 'Carton', full_pack: 'Carton = 24 pcs' };
    expect(convertQtyToStockUnit(material, 24, 'pcs')).toEqual({ qty: 1, resolved: true });
  });

  it('keeps the legacy gr/ml -> kg/l divide-by-1000 behavior', () => {
    const material = { unit: 'kg', full_pack: '1000 gr' };
    expect(convertQtyToStockUnit(material, 500, 'gr')).toEqual({ qty: 0.5, resolved: true });
  });

  it('is a no-op when the usage unit already matches the stock unit', () => {
    const material = { unit: 'pcs', full_pack: '1 pcs' };
    expect(convertQtyToStockUnit(material, 3, 'pcs')).toEqual({ qty: 3, resolved: true });
  });

  it('correctly calculates cost when unit is pcs and content is ml/gr (e.g. Air Mineral 1000 ml / pcs)', () => {
    const material = { unit: 'pcs', full_pack: '1000 ml', price: 2300 };
    // 1 pcs should scale up by 1000 ml * 2.3/ml = 2300
    expect(calculateIngredientCost(material, 1, 'pcs')).toBe(2300);
    // 100 ml should cost 100 * 2.3 = 230
    expect(calculateIngredientCost(material, 100, 'ml')).toBe(230);
  });
});
