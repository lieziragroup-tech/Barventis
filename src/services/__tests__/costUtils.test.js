import { describe, it, expect } from 'vitest';
import { parsePackSize, calculateIngredientCost } from '../costUtils';

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

  it('returns 0 for empty/null/unknown', () => {
    expect(parsePackSize('')).toBe(0);
    expect(parsePackSize(null)).toBe(0);
    expect(parsePackSize('unknown')).toBe(0);
  });
});

describe('calculateIngredientCost', () => {
  it('same unit: qty * price', () => {
    const material = { price: 10000, unit: 'pcs' };
    expect(calculateIngredientCost(material, 5, 'pcs')).toBe(50000);
  });

  it('different unit: converts via pack size', () => {
    const material = { price: 50000, unit: 'kg', full_pack: '1000 gr' };
    expect(calculateIngredientCost(material, 500, 'gr')).toBe(25000);
  });

  it('falls back to price when no pack size', () => {
    const material = { price: 10000, unit: 'kg' };
    expect(calculateIngredientCost(material, 3, 'gr')).toBe(30000);
  });

  it('uses new_price when available', () => {
    const material = { new_price: 20000, price: 10000, unit: 'pcs' };
    expect(calculateIngredientCost(material, 2, 'pcs')).toBe(40000);
  });
});
