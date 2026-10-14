// FEFO 3-warna: Merah (<=3 HARI), Kuning (4-7), Hijau (>7). Negatif = EXPIRED.

export function getExpiryColor(expired_date) {
  if (!expired_date) return null;
  const daysLeft = Math.ceil((new Date(expired_date) - new Date()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0)
    return { color: 'red', label: 'EXPIRED', days: daysLeft };
  if (daysLeft <= 3)
    return { color: 'red', label: 'Kritis', days: daysLeft };
  if (daysLeft <= 7)
    return { color: 'yellow', label: 'Perhatian', days: daysLeft };
  return { color: 'green', label: 'Aman', days: daysLeft };
}
