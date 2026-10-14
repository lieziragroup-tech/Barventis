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
});
