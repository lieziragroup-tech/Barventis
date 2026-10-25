import { describe, it, expect } from 'vitest';
import {
  sanitizeMenuName,
  calculateSimilarity,
  findBestMatch,
  isLikelyAddonOrFree
} from '../fuzzyMatch';

describe('Smart Recipe Matching Utility (fuzzyMatch.js)', () => {
  it('sanitizes menu names by stripping temperature, size, and category noise', () => {
    expect(sanitizeMenuName('Flavored Latte (Ice) (MINUMAN)')).toBe('flavored latte');
    expect(sanitizeMenuName('Bir Bintang 330 (MINUMAN)')).toBe('bir bintang');
    expect(sanitizeMenuName('Draft Beer BaliHai 220ml')).toBe('draft beer balihai');
    expect(sanitizeMenuName('Tea by Pot (MINUMAN)')).toBe('tea');
  });

  it('calculates high similarity score (>= 80%) for common variations', () => {
    // Temperature difference
    expect(calculateSimilarity('Flavored Latte (Ice)', 'Flavored Latte')).toBeGreaterThanOrEqual(0.85);
    // Size and noise
    expect(calculateSimilarity('Bir Bintang 330', 'Bir Bintang 330ml')).toBeGreaterThanOrEqual(0.85);
    expect(calculateSimilarity('Draft Beer BaliHai 220ml', 'Bali Hai Draft Beer')).toBeGreaterThanOrEqual(0.75);
    // Typo in smoothies
    expect(calculateSimilarity('Mango Yogur Smoothies', 'Mango Yogurt Smoothies')).toBeGreaterThanOrEqual(0.90);
  });

  it('correctly finds the best match with high confidence from a catalog', () => {
    const catalog = [
      { id: 1, name: 'Flavored Latte' },
      { id: 2, name: 'Espresso' },
      { id: 3, name: 'Bir Bintang 330ml' },
      { id: 4, name: 'Bali Hai Draft Beer' },
      { id: 5, name: 'Mango Yogurt Smoothies' },
    ];

    const match1 = findBestMatch('Flavored Latte (Ice) (MINUMAN)', catalog);
    expect(match1.confidence).toBe('high');
    expect(match1.match?.name).toBe('Flavored Latte');

    const match2 = findBestMatch('Mango Yogur Smoothies (MINUMAN)', catalog);
    expect(match2.confidence).toBe('high');
    expect(match2.match?.name).toBe('Mango Yogurt Smoothies');

    const match3 = findBestMatch('Bir Bintang 330 (MINUMAN)', catalog);
    expect(match3.confidence).toBe('high');
    expect(match3.match?.name).toBe('Bir Bintang 330ml');
  });

  it('accurately identifies add-ons, free perks, and non-BOM items', () => {
    expect(isLikelyAddonOrFree('Es Batu (add) (MINUMAN)')).toBe(true);
    expect(isLikelyAddonOrFree('Flavor Syrup (add) (MINUMAN)')).toBe(true);
    expect(isLikelyAddonOrFree('Gratis Teh (manis/tawar) (MINUMAN)')).toBe(true);
    expect(isLikelyAddonOrFree('Kelapa Muda Batok (MINUMAN)')).toBe(true);
    expect(isLikelyAddonOrFree('Cappuccino')).toBe(false);
  });
});
