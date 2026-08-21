import { describe, it, expect } from 'vitest';
import { parsePackSize, isPackUnitConsistent, getUnitPrice, calculateIngredientCost } from '../costUtils';

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
});
