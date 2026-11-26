/**
 * Strict Role-Boundary & Data Isolation Utilities for Barventis v5.1.
 * Ensures sensitive financial figures, cross-location POs, and cross-branch
 * records are never exposed to unauthorized operational roles.
 */

export const DASHBOARD_ROLES = {
  OWNER: 'OWNER',
  PURCHASING: 'PURCHASING',
  CENTRAL: 'CENTRAL',
  HEAD_BAR: 'HEAD_BAR',
  REKAN_BAR: 'REKAN_BAR',
};

/**
 * Resolves a user's canonical dashboard boundary role from activeUser.
 */
export function resolveDashboardRole(activeUser) {
  const raw = String(activeUser?.role || '').trim().toLowerCase();
  const sub = String(activeUser?.sub_role || '').trim().toLowerCase();

  if (['owner', 'admin / owner', 'admin  owner', 'super admin', 'superadmin'].includes(raw)) {
    return DASHBOARD_ROLES.OWNER;
  }
  if (raw === 'purchasing') {
    return DASHBOARD_ROLES.PURCHASING;
  }
  if (raw === 'central') {
    return DASHBOARD_ROLES.CENTRAL;
  }
  if (raw === 'head bar' || raw === 'supervisor' || sub === 'head bar') {
    return DASHBOARD_ROLES.HEAD_BAR;
  }
  return DASHBOARD_ROLES.REKAN_BAR;
}

/**
 * Only Executive (Owner) and Procurement (Purchasing) roles are permitted
 * to view company financial valuations, purchase totals, or COGS metrics.
 */
export function canViewFinancialMetrics(dashboardRole) {
  return dashboardRole === DASHBOARD_ROLES.OWNER || dashboardRole === DASHBOARD_ROLES.PURCHASING;
}

/**
 * Returns the strict PO location filter to enforce at both API and UI layers.
 * - CENTRAL: strictly 'CENTRAL' (never sees RESTO/outlet POs)
 * - HEAD_BAR / REKAN_BAR: strictly 'RESTO' (own branch outlet POs only)
 * - OWNER / PURCHASING: null (full visibility across locations)
 */
export function getPoLocationScopeForRole(dashboardRole) {
  if (dashboardRole === DASHBOARD_ROLES.CENTRAL) return 'CENTRAL';
  if (dashboardRole === DASHBOARD_ROLES.HEAD_BAR || dashboardRole === DASHBOARD_ROLES.REKAN_BAR) return 'RESTO';
  return null;
}

/**
 * Filters Purchase Orders strictly according to the active role's data boundary.
 */
export function filterInvoicesForRole(invoices = [], dashboardRole, activeBranchId = null) {
  const list = Array.isArray(invoices) ? invoices : [];

  if (dashboardRole === DASHBOARD_ROLES.OWNER || dashboardRole === DASHBOARD_ROLES.PURCHASING) {
    return list;
  }

  if (dashboardRole === DASHBOARD_ROLES.CENTRAL) {
    return list.filter((inv) => String(inv?.location || '').trim().toUpperCase() === 'CENTRAL');
  }

  if (dashboardRole === DASHBOARD_ROLES.HEAD_BAR) {
    return list.filter((inv) => {
      const loc = String(inv?.location || '').trim().toUpperCase();
      const wf = String(inv?.workflow_status || inv?.status || '').trim().toUpperCase();
      const branchMatch = !activeBranchId || !inv?.branch_id || String(inv.branch_id) === String(activeBranchId);
      return branchMatch && (loc === 'RESTO' || wf === 'PENDING_HEADBAR');
    });
  }

  // REKAN_BAR: strictly own branch RESTO POs, with financial total stripped
  return list
    .filter((inv) => {
      const loc = String(inv?.location || '').trim().toUpperCase();
      const branchMatch = !activeBranchId || !inv?.branch_id || String(inv.branch_id) === String(activeBranchId);
      return branchMatch && loc === 'RESTO';
    })
    .map(({ total, ...safeInv }) => safeInv);
}

/**
 * Checks whether a stock transfer or shipment involves Central Warehouse.
 */
export function isCentralTransfer(record) {
  if (!record) return false;
  const fromLoc = String(record.from_location || record.source || record.from_branch_name || '').toLowerCase();
  const toLoc = String(record.to_location || record.target || record.to_branch_name || '').toLowerCase();
  return fromLoc.includes('central') || toLoc.includes('central') || Boolean(record.from_is_central);
}

/**
 * Checks whether an inventory transaction belongs strictly to Central Warehouse.
 */
export function isCentralTransaction(tx) {
  if (!tx) return false;
  const loc = String(tx.location || '').trim().toUpperCase();
  return loc === 'CENTRAL';
}

/**
 * Formats operational quantities cleanly without trailing .0 noise (e.g. 3.0 -> "3", 12.5 -> "12,5").
 */
export function formatCleanQty(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  if (Math.abs(num - Math.round(num)) < 0.001) {
    return Math.round(num).toLocaleString('id-ID');
  }
  return num.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

/**
 * Returns semantic pill badge styles (pre-attentive visual psychology cue) for workflow statuses.
 */
export function getWorkflowStatusVisual(status) {
  const wf = String(status || 'REQUESTED').trim().toUpperCase();
  if (['RECEIVED', 'COMPLETED', 'APPROVED', 'SELESAI'].includes(wf)) {
    return {
      label: wf === 'RECEIVED' ? 'Selesai / Diterima' : wf === 'COMPLETED' ? 'Selesai' : wf === 'APPROVED' ? 'Disetujui' : wf,
      bg: 'rgba(16, 185, 129, 0.12)',
      color: '#047857',
      dot: '#10b981',
    };
  }
  if (['CANCELLED', 'CANCELED', 'REJECTED', 'DIBATALKAN', 'DITOLAK'].includes(wf)) {
    return {
      label: wf === 'REJECTED' ? 'Ditolak' : 'Dibatalkan',
      bg: 'rgba(239, 68, 68, 0.10)',
      color: '#b91c1c',
      dot: '#ef4444',
    };
  }
  if (['IN_ORDER', 'SENT', 'DISPATCHED', 'VALIDATION_SUPPLIER'].includes(wf)) {
    return {
      label: wf === 'IN_ORDER' ? 'Dalam Pesanan' : wf === 'VALIDATION_SUPPLIER' ? 'Validasi Supplier' : wf === 'DISPATCHED' ? 'Dalam Pengiriman' : 'Dipesan',
      bg: 'rgba(14, 165, 233, 0.12)',
      color: '#0369a1',
      dot: '#0ea5e9',
    };
  }
  return {
    label: wf === 'ON_REVIEW' ? 'Sedang Ditinjau' : wf === 'PENDING_HEADBAR' ? 'Menunggu ACC' : 'Menunggu Proses',
    bg: 'rgba(245, 158, 11, 0.12)',
    color: '#b45309',
    dot: '#f59e0b',
  };
}
