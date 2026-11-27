/**
 * Single Source of Truth for Role Boundaries, Financial Visibility,
 * and Unified Status Registries (PO & Transfer) in Barventis v5.4.
 */

export const DASHBOARD_ROLES = {
  OWNER: 'OWNER',
  PURCHASING: 'PURCHASING',
  CENTRAL: 'CENTRAL',
  HEAD_BAR: 'HEAD_BAR',
  REKAN_BAR: 'REKAN_BAR', // Canonical UI display label: "Barista"
};

/**
 * Resolves a user's canonical dashboard boundary role from activeUser.
 * Backward-compatible with legacy role strings ('Barista', 'Bar', 'Barista', 'Admin  Owner').
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
 * Canonical SaaS display label for each role.
 */
export function getCanonicalRoleLabel(dashboardRole) {
  switch (dashboardRole) {
    case DASHBOARD_ROLES.OWNER:
      return 'Owner';
    case DASHBOARD_ROLES.PURCHASING:
      return 'Purchasing';
    case DASHBOARD_ROLES.CENTRAL:
      return 'Central';
    case DASHBOARD_ROLES.HEAD_BAR:
      return 'Head Bar';
    default:
      return 'Barista';
  }
}

/**
 * Operational financial transparency (Rp in operational modules like PO/Waste/Berita Acara):
 * - OWNER, PURCHASING, and HEAD_BAR ("tangan kanan owner") are permitted.
 * - CENTRAL (warehouse logistics) and BARISTA (floor shift) remain restricted.
 */
export function canViewFinancialMetrics(dashboardRole) {
  return (
    dashboardRole === DASHBOARD_ROLES.OWNER ||
    dashboardRole === DASHBOARD_ROLES.PURCHASING ||
    dashboardRole === DASHBOARD_ROLES.HEAD_BAR
  );
}

/**
 * Executive company-wide financial metrics (Omzet, Food Cost %, Company Stock Valuation, Multi-Branch):
 * Strictly OWNER only.
 */
export function canViewCompanyFinancials(dashboardRole) {
  return dashboardRole === DASHBOARD_ROLES.OWNER;
}

/**
 * Strict PO location scope enforced across API and UI layers.
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

  // Barista: strictly own branch RESTO POs, with financial total stripped
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
  return String(tx.location || '').trim().toUpperCase() === 'CENTRAL';
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
 * Canonical 7-stage PO Workflow Status Visual Registry (WCAG AA contrast >= 4.5:1):
 * Requested -> On Review -> Validation Supplier -> In Order -> Completed | Rejected | Canceled
 */
export function getWorkflowStatusVisual(status) {
  const wf = String(status || 'REQUESTED').trim().toUpperCase();

  if (['COMPLETED', 'RECEIVED', 'GOODS_RECEIVED', 'SELESAI'].includes(wf)) {
    return { label: 'Completed', bg: 'rgba(16, 185, 129, 0.14)', color: '#047857', dot: '#10b981' };
  }
  if (wf === 'REJECTED' || wf === 'DITOLAK') {
    return { label: 'Rejected', bg: 'rgba(239, 68, 68, 0.12)', color: '#b91c1c', dot: '#ef4444' };
  }
  if (['CANCELED', 'CANCELLED', 'DIBATALKAN'].includes(wf)) {
    return { label: 'Canceled', bg: 'rgba(225, 29, 72, 0.12)', color: '#be123c', dot: '#e11d48' };
  }
  if (wf === 'VALIDATION_SUPPLIER') {
    return { label: 'Validation Supplier', bg: 'rgba(99, 102, 241, 0.14)', color: '#4338ca', dot: '#6366f1' };
  }
  if (['IN_ORDER', 'SENT', 'APPROVED', 'DISPATCHED'].includes(wf)) {
    return { label: 'In Order', bg: 'rgba(59, 130, 246, 0.14)', color: '#1d4ed8', dot: '#3b82f6' };
  }
  if (['ON_REVIEW', 'PENDING_APPROVAL', 'PENDING_HEADBAR'].includes(wf)) {
    return { label: 'On Review', bg: 'rgba(245, 158, 11, 0.14)', color: '#b45309', dot: '#f59e0b' };
  }
  return { label: 'Requested', bg: 'rgba(100, 116, 139, 0.12)', color: '#475569', dot: '#64748b' };
}

/**
 * Canonical Transfer / Mutasi Gudang Status Visual Registry (English, aligned with PO stages):
 * Requested -> Approved -> In Transit -> Completed | Rejected | Canceled
 */
export function getTransferStatusVisual(status) {
  const st = String(status || 'REQUESTED').trim().toUpperCase();

  if (['COMPLETED', 'RECEIVED', 'SELESAI'].includes(st)) {
    return { label: 'Completed', bg: 'rgba(16, 185, 129, 0.14)', color: '#047857', dot: '#10b981' };
  }
  if (['IN_TRANSIT', 'DISPATCHED', 'SHIPPED', 'SENT'].includes(st)) {
    return { label: 'In Transit', bg: 'rgba(59, 130, 246, 0.14)', color: '#1d4ed8', dot: '#3b82f6' };
  }
  if (st === 'APPROVED' || st === 'DISETUJUI') {
    return { label: 'Approved', bg: 'rgba(99, 102, 241, 0.14)', color: '#4338ca', dot: '#6366f1' };
  }
  if (st === 'REJECTED' || st === 'DITOLAK') {
    return { label: 'Rejected', bg: 'rgba(239, 68, 68, 0.12)', color: '#b91c1c', dot: '#ef4444' };
  }
  if (['CANCELED', 'CANCELLED', 'DIBATALKAN'].includes(st)) {
    return { label: 'Canceled', bg: 'rgba(225, 29, 72, 0.12)', color: '#be123c', dot: '#e11d48' };
  }
  return { label: 'Requested', bg: 'rgba(245, 158, 11, 0.14)', color: '#b45309', dot: '#f59e0b' };
}

/**
 * Returns branch-scoped localStorage key to prevent cross-branch state bleeding.
 */
export function getBranchScopedStorageKey(baseKey, branchId = null) {
  let bId = branchId;
  if (!bId && typeof localStorage !== 'undefined') {
    try {
      bId = localStorage.getItem('bv_active_branch_id') || 'default';
    } catch {
      bId = 'default';
    }
  }
  return `${baseKey}_${bId || 'default'}`;
}
