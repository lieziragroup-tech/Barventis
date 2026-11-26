/**
 * Pure domain utilities for Barventis Urgent Recap Notification Modal.
 * Separates Urgent Action (PO H-2/overdue, Pending ACC Head Bar, Pending Transfer)
 * from Urgent Materials (Out-of-stock & Critical Low Stock).
 * Designed with Low McCabe Cyclomatic Complexity for direct Basis-Path unit testing.
 */

export const PO_URGENT_THRESHOLD_DAYS = 2; // H-2 pengingat PO mendekati jadwal kirim

export function classifyPoUrgency(deliveryDateStr, referenceDate = new Date(), thresholdDays = PO_URGENT_THRESHOLD_DAYS) {
  if (!deliveryDateStr) {
    return { isUrgent: false, daysLeft: null, severity: 'NORMAL', badge: '' };
  }
  const target = new Date(`${String(deliveryDateStr).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) {
    return { isUrgent: false, daysLeft: null, severity: 'NORMAL', badge: '' };
  }
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const daysLeft = Math.round((target.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return { isUrgent: true, daysLeft, severity: 'OVERDUE', badge: `Lewat ${Math.abs(daysLeft)} hari` };
  }
  if (daysLeft === 0) {
    return { isUrgent: true, daysLeft: 0, severity: 'TODAY', badge: 'Kirim Hari Ini' };
  }
  if (daysLeft <= thresholdDays) {
    return { isUrgent: true, daysLeft, severity: 'SOON', badge: `H-${daysLeft} Kirim` };
  }
  return { isUrgent: false, daysLeft, severity: 'NORMAL', badge: `H-${daysLeft}` };
}

export function buildUrgentRecap({
  poReminders = [],
  pendingHeadbarPos = [],
  pendingTransfers = [],
  stockItems = [],
  role = '',
  isHeadBarUser = false,
  basePath = '/dashboard',
  referenceDate = new Date()
}) {
  const urgentActions = [];
  const urgentMaterials = [];
  const roleLower = String(role || '').toLowerCase();
  const canSeePoReminders = ['purchasing', 'owner', 'admin / owner', 'central', 'bar', 'head bar', 'rekan bar'].includes(roleLower);

  // 1. Urgent Action: PO mendekati jadwal kirim (H-2, H-1, Hari Ini, atau Lewat)
  if (canSeePoReminders) {
    (poReminders || []).forEach((rem) => {
      const status = classifyPoUrgency(rem.delivery_date || rem.date, referenceDate, PO_URGENT_THRESHOLD_DAYS);
      if (!status.isUrgent) return;
      urgentActions.push({
        id: `po-rem-${rem.id || rem.delivery_date}-${rem.supplier || ''}`,
        category: 'PO_DUE',
        severity: status.severity,
        badge: status.badge,
        title: rem.item_summary || rem.material_name || 'Jadwal PO Supplier',
        subtitle: `${rem.supplier || 'Supplier'} · Kirim ${rem.delivery_date || ''}`,
        actionLabel: 'Buka PO',
        route: `${basePath}/procurement?tab=invoicing`
      });
    });
  }

  // 2. Urgent Action: PO Central menunggu ACC Head Bar
  if (isHeadBarUser || roleLower.includes('owner')) {
    (pendingHeadbarPos || []).forEach((po) => {
      urgentActions.push({
        id: `po-acc-${po.id}`,
        category: 'PO_ACC',
        severity: 'TODAY',
        badge: 'Perlu ACC',
        title: `ACC Order Central ${po.invoice_no || ''}`.trim(),
        subtitle: `${po.supplier || 'Supplier'} · Menunggu verifikasi Head Bar`,
        actionLabel: 'Cek PO',
        route: `${basePath}/procurement?tab=invoicing`
      });
    });
  }

  // 3. Urgent Action: Mutasi Gudang menunggu konfirmasi terima
  (pendingTransfers || []).forEach((tr) => {
    urgentActions.push({
      id: `tr-${tr.id}`,
      category: 'TRANSFER',
      severity: 'SOON',
      badge: 'Dalam Kirim',
      title: `Mutasi ${tr.transfer_number || 'Gudang'}`,
      subtitle: 'Barang sedang dikirim, segera konfirmasi terima saat tiba',
      actionLabel: 'Buka Mutasi',
      route: `${basePath}/transfer`
    });
  });

  // 4. Urgent Materials: Stok habis (<= 0) atau di bawah stok minimum
  (stockItems || []).forEach((item) => {
    const totalQty = (Number(item.qty_resto) || 0) + (Number(item.qty_central) || 0);
    const minStock = Number(item.min_stock) > 0 ? Number(item.min_stock) : 5;
    if (totalQty > minStock) return;
    const isEmpty = totalQty <= 0;
    urgentMaterials.push({
      id: `mat-${item.id}`,
      severity: isEmpty ? 'OVERDUE' : 'SOON',
      badge: isEmpty ? 'Habis' : 'Menipis',
      title: item.name || 'Bahan Baku',
      subtitle: `Sisa ${totalQty} ${item.unit || 'unit'} (batas min ${minStock})`,
      actionLabel: 'Buat PO',
      route: `${basePath}/procurement?tab=invoicing`
    });
  });

  // Urutkan: yang paling kritis di atas
  const rank = { OVERDUE: 0, TODAY: 1, SOON: 2, NORMAL: 3 };
  urgentActions.sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));
  urgentMaterials.sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));

  return {
    urgentActions,
    urgentMaterials,
    totalCount: urgentActions.length + urgentMaterials.length
  };
}
