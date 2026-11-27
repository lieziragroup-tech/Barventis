import { describe, test, expect } from 'vitest';
import { getExpiryColor } from '../expiryColor.js';

// Helper: date string N days from now
const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};

describe('getExpiryColor', () => {
  test('returns null for null/undefined input', () => {
    expect(getExpiryColor(null)).toBeNull();
    expect(getExpiryColor(undefined)).toBeNull();
    expect(getExpiryColor('')).toBeNull();
  });

  test('EXPIRED (negatif hari) -> red, label EXPIRED', () => {
    const result = getExpiryColor(daysFromNow(-2));
    expect(result.color).toBe('red');
    expect(result.label).toBe('EXPIRED');
    expect(result.days).toBeLessThan(0);
  });

  test('H-0 (hari ini) -> red, Kritis', () => {
    const result = getExpiryColor(daysFromNow(0));
    expect(result.color).toBe('red');
  });

  test('H-1 -> red, Kritis', () => {
    const result = getExpiryColor(daysFromNow(1));
    expect(result.color).toBe('red');
    expect(result.label).toBe('Kritis');
  });

  test('H-3 -> red, Kritis', () => {
    const result = getExpiryColor(daysFromNow(3));
    expect(result.color).toBe('red');
    expect(result.label).toBe('Kritis');
    expect(result.days).toBe(3);
  });

  test('H-5 -> yellow, Perhatian', () => {
    const result = getExpiryColor(daysFromNow(5));
    expect(result.color).toBe('yellow');
    expect(result.label).toBe('Perhatian');
    expect(result.days).toBe(5);
  });

  test('H-7 -> yellow, Perhatian', () => {
    const result = getExpiryColor(daysFromNow(7));
    expect(result.color).toBe('yellow');
    expect(result.label).toBe('Perhatian');
    expect(result.days).toBe(7);
  });

  test('H-14 -> green, Aman', () => {
    const result = getExpiryColor(daysFromNow(14));
    expect(result.color).toBe('green');
    expect(result.label).toBe('Aman');
    expect(result.days).toBe(14);
  });

  test('H-30 -> green, Aman', () => {
    const result = getExpiryColor(daysFromNow(30));
    expect(result.color).toBe('green');
    expect(result.label).toBe('Aman');
    expect(result.days).toBe(30);
  });


  test('supports custom thresholds', () => {
    // Custom: critical is <= 5 days, warning is <= 10 days
    const custom = { criticalDays: 5, warningDays: 10 };
    
    // Day 4 with default would be yellow (3 is crit), but with custom 5 it should be red (Kritis)
    const res4 = getExpiryColor(daysFromNow(4), custom);
    expect(res4.color).toBe('red');
    expect(res4.label).toBe('Kritis');

    // Day 8 with default would be green (7 is warn), but with custom 10 it should be yellow (Perhatian)
    const res8 = getExpiryColor(daysFromNow(8), custom);
    expect(res8.color).toBe('yellow');
    expect(res8.label).toBe('Perhatian');

    // Day 12 should be green (Aman)
    const res12 = getExpiryColor(daysFromNow(12), custom);
    expect(res12.color).toBe('green');
    expect(res12.label).toBe('Aman');
  });
});

