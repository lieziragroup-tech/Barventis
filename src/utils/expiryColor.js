// FEFO 3-warna: Merah (<=3 HARI), Kuning (4-7), Hijau (>7). Negatif = EXPIRED.

export const DEFAULT_EXPIRY_THRESHOLDS = {
  criticalDays: 3,
  warningDays: 7,
};

const STORAGE_KEY = 'barventis_expiry_thresholds';

export function getExpiryThresholds() {
  if (typeof window === 'undefined') return DEFAULT_EXPIRY_THRESHOLDS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_EXPIRY_THRESHOLDS;
    const parsed = JSON.parse(raw);
    const critical = Number(parsed.criticalDays);
    const warning = Number(parsed.warningDays);
    return {
      criticalDays: !isNaN(critical) && critical >= 0 ? critical : DEFAULT_EXPIRY_THRESHOLDS.criticalDays,
      warningDays: !isNaN(warning) && warning >= 0 ? warning : DEFAULT_EXPIRY_THRESHOLDS.warningDays,
    };
  } catch {
    return DEFAULT_EXPIRY_THRESHOLDS;
  }
}

export function saveExpiryThresholds(thresholds) {
  if (typeof window === 'undefined') return DEFAULT_EXPIRY_THRESHOLDS;
  try {
    const critical = Math.max(0, parseInt(thresholds?.criticalDays, 10) || 0);
    const warning = Math.max(critical, parseInt(thresholds?.warningDays, 10) || critical);
    const validated = { criticalDays: critical, warningDays: warning };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
    return validated;
  } catch (err) {
    console.warn('Failed to save expiry thresholds:', err);
    return DEFAULT_EXPIRY_THRESHOLDS;
  }
}

export function getExpiryColor(expired_date, customThresholds = null) {
  if (!expired_date) return null;
  const thresholds = customThresholds || getExpiryThresholds();
  const critical = thresholds?.criticalDays ?? DEFAULT_EXPIRY_THRESHOLDS.criticalDays;
  const warning = thresholds?.warningDays ?? DEFAULT_EXPIRY_THRESHOLDS.warningDays;

  const daysLeft = Math.ceil((new Date(expired_date) - new Date()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0)
    return { color: 'red', label: 'EXPIRED', days: daysLeft };
  if (daysLeft <= critical)
    return { color: 'red', label: 'Kritis', days: daysLeft };
  if (daysLeft <= warning)
    return { color: 'yellow', label: 'Perhatian', days: daysLeft };
  return { color: 'green', label: 'Aman', days: daysLeft };
}

