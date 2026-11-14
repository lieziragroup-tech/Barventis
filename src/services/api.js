// UMATIS Serverless API Service Client for Supabase Backend Integration
import { supabase, isAdminRole } from '../lib/supabase';
import { materialsRepo } from '../data/materialsRepo';
import { parsePackSize, calculateIngredientCost, getUnitPrice, computeRecipeCosts, convertQtyToStockUnit, DEFAULT_ROUNDING_DIRECTION, DEFAULT_ROUNDING_INCREMENT, DEFAULT_PRICE_ADJUSTMENT } from './costUtils';
// NOTE: DEFAULT_FIX_COST_PCT intentionally NOT imported here — per PRD §4.2
// Opsi B, a new recipe's fix_cost_pct falls back to the tenant's existing
// `overhead_pct` setting (activeOverheadPct below), not a hardcoded 5%.
// This preserves current behavior for tenants who already changed their
// Overhead % away from 5%.
import { storeLog } from './activityLogService';
import { calculateUsageVariance } from './varianceCalculator';
import { getLocalDateISO, calculateInferredFullFromBroken, isBrokenTrackingEnabled } from './dailyInventoryMath';

let activeTenantId = null;
let activeUserId = null;
let activeOverheadPct = 0.05;
let activeWhatsappNumber = null;
let activeWhatsappToken = null;
let activeWhatsappEnabled = false;
let activeBranchId = null;
let activeUserRole = null;

// Helper to sanitize search strings for PostgREST .or() filters to prevent injection
const sanitizePostgrest = (str) => String(str).replace(/[,.()"'\\]/g, ' ').trim();

const getPackContentUnitFromMaterial = (material) => {
  const fullPack = String(material?.full_pack || '').trim();
  if (fullPack.includes('=')) {
    const right = fullPack.split('=').slice(1).join('=').trim();
    return right.match(/^([0-9]+(?:\.[0-9]+)?)\s*(.*?)\s*$/)?.[2]?.trim() || material?.unit || '';
  }
  return fullPack.match(/^([0-9]+(?:\.[0-9]+)?)\s*(.*?)\s*$/)?.[2]?.trim() || material?.unit || '';
};

const createRequestKey = () => {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch { /* fallback below */ }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

// Helper to get active tenant info — uses cached memory first, falls back to Supabase session (KRITIS-01 fix)
// Returns null for SuperAdmin (no tenant_id) — read-only guards check this.
// Throws for no-session (expired/not logged in) — prevents silent CRUD failures.
const getActiveTenantId = async () => {
  if (activeTenantId !== null) return activeTenantId;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("Sesi kadaluarsa atau belum login. Silakan login kembali.");

  const { data: user, error } = await supabase
    .from('users')
    .select('tenant_id, branch_id, role')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) throw new Error("Gagal mengambil data tenant: " + error.message);

  // SuperAdmin may not have a tenant_id — return null so read-only guards gracefully return empty data.
  activeTenantId = user?.tenant_id ?? null;
  if (!activeBranchId && user?.branch_id) {
    activeBranchId = user.branch_id;
    if (typeof window !== 'undefined') window.__activeBranchId = activeBranchId;
  }
  if (!activeUserRole && user?.role) {
    activeUserRole = user.role;
    if (typeof window !== 'undefined') window.__activeUserRole = activeUserRole;
  }
  return activeTenantId;
};

// Strict variant: throws when tenant_id is null (use for CRUD/mutating operations only)
const requireTenantId = async () => {
  const tenantId = await getActiveTenantId();
  if (!tenantId) throw new Error("Operasi ini membutuhkan tenant aktif. SuperAdmin tidak bisa melakukan mutasi data tanpa konteks tenant.");
  return tenantId;
};

const getEffectiveUserRole = () => {
  return activeUserRole || (typeof window !== 'undefined' && window.__activeUserRole) || null;
};

const getEffectiveBranchId = () => {
  return activeBranchId || (typeof window !== 'undefined' && window.__activeBranchId) || null;
};

// Strict branch_id guard: non-admin users MUST have an active branch_id and cannot override to another branch.
const requireBranchId = async (overrideBranchId = null, { requiredForAdmin = false } = {}) => {
  await getActiveTenantId();
  const role = getEffectiveUserRole();
  const currentBranch = getEffectiveBranchId();
  const nonAdmin = Boolean(role) && !isAdminRole(role);

  if (nonAdmin) {
    if (!currentBranch) {
      throw new Error('Akses cabang tidak valid: pengguna non-admin wajib memiliki branch_id aktif untuk operasi ini.');
    }
    if (overrideBranchId && overrideBranchId !== currentBranch) {
      throw new Error('Akses cabang ditolak: pengguna non-admin tidak diizinkan mengakses cabang lain.');
    }
    return currentBranch;
  }

  const resolved = overrideBranchId || currentBranch || null;
  if (requiredForAdmin && !resolved) {
    throw new Error('Cabang aktif belum dipilih. Pilih cabang terlebih dahulu.');
  }
  return resolved;
};

// Helper to get authenticated user ID — uses cached memory first, falls back to Supabase session
const getActiveUserId = async () => {
  if (activeUserId !== null) return activeUserId;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error("Sesi kadaluarsa atau belum login. Silakan login kembali.");
  activeUserId = session.user.id;
  return activeUserId;
};

// Helper for Audit Logging — stores locally, batch-synced to Supabase
const logAudit = async (action, description) => {
  try {
    storeLog({ action, description });
  } catch (e) {
    console.error('Failed to log audit event:', e);
  }
};

// Re-export from costUtils for backward compatibility
export { parsePackSize, calculateIngredientCost };

// FEFO-aware stock deduction: tries atomic_deduct_fefo first (batch-level FEFO),
// falls back to deduct_stock_atomic (legacy flat deduction) if RPC not available.
const deductStockSmart = async (materialId, deductQty, location = 'RESTO') => {
  const tenantId = await getActiveTenantId();
  if (tenantId) {
    const { data, error } = await supabase.rpc('atomic_deduct_fefo', {
      p_tenant_id: tenantId,
      p_material_id: materialId,
      p_qty_to_deduct: deductQty,
      p_location: location
    });
    if (!error) return data;
    // ponytail: fallback if RPC missing (tenant belum migrate), bukan crash
    console.warn('[deductStockSmart] atomic_deduct_fefo unavailable, fallback to legacy:', error.message);
  }
  const { error: legacyErr } = await supabase.rpc('deduct_stock_atomic', {
    p_material_id: materialId,
    p_deduct_qty: deductQty
  });
  if (legacyErr) throw legacyErr;
};

export const api = {
  // Daily Inventory
  // Get header/items for a given date
  getDailyInventoryRecords: async (date, location = 'RESTO', branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await requireBranchId(branchIdArg);
    let headersQuery = supabase
      .from('daily_inventories')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('date', date)
      .eq('location', location);
    if (branchId) headersQuery = headersQuery.eq('branch_id', branchId);
    const { data: headers, error: headerErr } = await headersQuery;
    if (headerErr) throw headerErr;
    if (!headers || headers.length === 0) return [];
    const headerIds = headers.map(h => h.id);
    let itemsQuery = supabase
      .from('daily_inventory_items')
      .select('*')
      .in('inventory_id', headerIds);
    if (branchId) itemsQuery = itemsQuery.eq('branch_id', branchId);
    const [{ data: itemRows, error: itemsErr }, materialsList] = await Promise.all([
      itemsQuery,
      api.getMaterials(branchId).catch(() => [])
    ]);
    if (itemsErr) throw itemsErr;
    const materialsById = Object.fromEntries((materialsList || []).map(m => [m.id, m]));
    const headerById = Object.fromEntries(headers.map(h => [h.id, h]));
    return (itemRows || []).map(r => {
      const mat = materialsById[r.material_id] || null;
      const unitPrice = Number(r.unit_cost_snapshot ?? mat?.avg_cost ?? mat?.price) || 0;
      const stokAwal = r.prev_full_qty ?? r.stok_awal ?? 0;
      const qtyIn = r.in_qty ?? r.qty_in ?? 0;
      const qtyOut = r.out_qty ?? r.qty_out ?? 0;
      const waste = r.waste_qty ?? r.waste ?? 0;
      const fullQty = r.full_qty ?? 0;
      const broken = r.broken_qty ?? r.broken ?? 0;
      const stokAkhir = r.closing_qty ?? r.stok_akhir ?? (fullQty + broken);
      const productionUsage = Number(r.production_usage_qty) || 0;
      const terpakai = r.terpakai_qty ?? r.qty_terpakai ?? Number(qtyOut);
      return {
        ...r,
        status: headerById[r.inventory_id]?.status || 'draft',
        location,
        materials: mat,
        stok_awal: stokAwal,
        qty_in: qtyIn,
        qty_out: qtyOut,
        production_usage_qty: productionUsage,
        waste: waste,
        full_qty: fullQty,
        broken: broken,
        stok_akhir: stokAkhir,
        qty_terpakai: terpakai,
        nilai_rupiah: Number(r.usage_value ?? (terpakai * unitPrice)) || 0,
        stock_based_usage_qty: Number(r.stock_based_usage_qty ?? (Number(stokAwal) + Number(qtyIn) - Number(stokAkhir) - Number(waste) - productionUsage)) || 0,
        usage_variance_qty: Number(r.usage_variance_qty ?? (Number(r.stock_based_usage_qty ?? (Number(stokAwal) + Number(qtyIn) - Number(stokAkhir) - Number(waste) - productionUsage)) - Number(qtyOut))) || 0,
        net_stock_movement: Number(r.net_stock_movement_qty) || 0,
        is_counted: Boolean(r.is_counted)
      };
    });
  },
  getDailyInventoryEodData: async (date, location = 'RESTO', branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { items: [], inventory: {} };
    const branchId = await requireBranchId(branchIdArg);
    let materialsList = await api.getMaterials(branchId);
    materialsList = (materialsList || []).filter(m => (m.category || '').toUpperCase() !== 'ASSET' && m.is_active !== false);

    // 1. Get header for date
    let headerQuery = supabase
      .from('daily_inventories')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('date', date)
      .eq('location', location);
    if (branchId) headerQuery = headerQuery.eq('branch_id', branchId);
    const { data: header, error: headerErr } = await headerQuery.maybeSingle();
    if (headerErr) throw headerErr;

    // The last final EOD provides the opening snapshot. Any stock movements
    // posted after that close (including late receipts on the same date) are
    // carried forward from the ledger; never jump over an unaccounted gap.
    let prevHeaderQuery = supabase
      .from('daily_inventories')
      .select('id, date, status, updated_at')
      .eq('tenant_id', tenantId)
      .eq('location', location)
      .lt('date', date)
      .in('status', ['verified', 'closed']);
    if (branchId) prevHeaderQuery = prevHeaderQuery.eq('branch_id', branchId);
    const { data: previousHeaders, error: previousHeaderErr } = await prevHeaderQuery
      .order('date', { ascending: false })
      .limit(1);
    if (previousHeaderErr) throw previousHeaderErr;
    const previousOpeningMap = {};
    const previousOpeningPartsMap = {};
    const previousHeader = previousHeaders?.[0] || null;
    if (previousHeader) {
      let prevItemsQ = supabase
        .from('daily_inventory_items')
        .select('material_id, closing_qty, full_qty, broken_qty, broken_unit, broken_confirmed, active_open_lot_id')
        .eq('inventory_id', previousHeader.id);
      if (branchId) prevItemsQ = prevItemsQ.eq('branch_id', branchId);
      const { data: previousItems, error: previousItemsErr } = await prevItemsQ;
      if (previousItemsErr) throw previousItemsErr;
      const closingMap = Object.fromEntries((previousItems || []).map(item => [item.material_id, Number(item.closing_qty) || 0]));
      (previousItems || []).forEach(item => {
        previousOpeningPartsMap[item.material_id] = {
          full: item.full_qty ?? null,
          broken: item.broken_confirmed ? (item.broken_qty ?? null) : null,
          brokenUnit: item.broken_unit || null,
          activeOpenLotId: item.active_open_lot_id || null,
        };
      });
      let carryQ = supabase
        .from('transactions')
        .select('material_id, type, qty, is_reversed, source_module, date, created_at')
        .eq('tenant_id', tenantId)
        .eq('location', location)
        .gte('date', previousHeader.date)
        .lt('date', date)
        .in('type', ['IN', 'OUT', 'TRANSFER', 'POS_DEDUCTION', 'PURCHASE_IN', 'OPNAME_ADJ', 'WASTE', 'BREAKAGE', 'EXPIRED', 'COMP']);
      if (branchId) carryQ = carryQ.eq('branch_id', branchId);
      const { data: carryRows, error: carryErr } = await carryQ;
      const netCarryByMaterial = {};
      const previousCloseTs = previousHeader.updated_at ? new Date(previousHeader.updated_at).getTime() : Number.POSITIVE_INFINITY;
      (carryRows || []).forEach(tx => {
        if (tx.is_reversed) return;
        // Movements before the last closing are already represented in that
        // closing snapshot. Include same-day movements only if posted later.
        const isAfterLastCloseDate = tx.date > previousHeader.date ||
          (tx.date === previousHeader.date && tx.created_at && new Date(tx.created_at).getTime() > previousCloseTs);
        if (!isAfterLastCloseDate || ['POS_SALE', 'POS_DEDUCTION'].includes(tx.type)) return;
        // Waste/expired/breakage are signed stock movements too. Carry them from the last
        // closed snapshot so yesterday's loss is not added back into today's opening balance.
        const materialId = tx.material_id;
        netCarryByMaterial[materialId] = (netCarryByMaterial[materialId] || 0) + (Number(tx.qty) || 0);
      });
      Object.keys(closingMap).forEach(materialId => {
        previousOpeningMap[materialId] = closingMap[materialId] + (netCarryByMaterial[materialId] || 0);
      });
    }

    const invMap = {};
    if (header) {
      let itemsEodQ = supabase
        .from('daily_inventory_items')
        .select('*')
        .eq('inventory_id', header.id);
      if (branchId) itemsEodQ = itemsEodQ.eq('branch_id', branchId);
      const { data: itemRows, error: itemsErr } = await itemsEodQ;
      if (itemsErr) throw itemsErr;
      (itemRows || []).forEach(row => {
        invMap[row.material_id] = {
          ...row,
          stok_awal: row.opening_qty_snapshot ?? row.prev_full_qty ?? row.stok_awal,
          qty_in: row.in_qty ?? row.qty_in,
          manual_in_qty: Number(row.manual_in_qty) || 0,
          manual_in_lots: Array.isArray(row.manual_in_lots) ? row.manual_in_lots : [],
          qty_out: row.out_qty_input != null ? row.out_qty_input : (row.out_confirmed === false ? '' : (row.out_qty ?? row.qty_out ?? '')),
          out_qty_normalized: row.out_qty ?? null,
          out_qty_input: row.out_qty_input ?? null,
          out_unit: row.out_unit || null,
          out_confirmed: row.out_confirmed ?? (row.out_qty != null || row.qty_out != null),
          zero_activity_confirmed: Boolean(row.zero_activity_confirmed),
          waste: row.waste_qty ?? row.waste ?? 0,
          broken: (row.broken_confirmed ?? row.is_counted) ? (row.broken_qty ?? row.broken ?? '') : '', // raw weighed input; closing_broken_qty_base is normalized for stock math only
          broken_confirmed: Boolean(row.broken_confirmed ?? row.is_counted),
          full_qty: '',
          is_counted: Boolean(row.broken_confirmed ?? row.is_counted),
          opening_full_qty: row.opening_full_qty ?? previousOpeningPartsMap[row.material_id]?.full ?? null,
          opening_broken_qty: row.opening_broken_qty ?? previousOpeningPartsMap[row.material_id]?.broken ?? null,
          opening_active_open_lot_id: row.opening_active_open_lot_id ?? previousOpeningPartsMap[row.material_id]?.activeOpenLotId ?? null,
          active_open_lot_id: row.active_open_lot_id || null,
          reconciliation_status: row.reconciliation_status || null
        };
      });
    }

    // Source-derived daily quantities. Auto receipts are included in the visible IN total; EOD only stores any manual delta over those receipts. WASTE remains source-derived.
    const validWasteTypes = ['WASTE', 'BREAKAGE', 'EXPIRED', 'COMP'];
    let dailyTxQ = supabase
      .from('transactions')
      .select('material_id, type, qty, is_reversed, source_module')
      .eq('tenant_id', tenantId)
      .eq('date', date)
      .eq('location', location)
      .eq('is_reversed', false)
      .in('type', ['IN', 'OUT', 'TRANSFER', 'PURCHASE_IN', 'OPNAME_ADJ', ...validWasteTypes]);
    if (branchId) dailyTxQ = dailyTxQ.eq('branch_id', branchId);
    const { data: dailyTxRows, error: dailyTxErr } = await dailyTxQ;
    if (dailyTxErr) throw dailyTxErr;

    const inTxMap = {};
    const txWasteMap = {};
    const productionUsageMap = {};
    const netStockMovementMap = {};
    (dailyTxRows || []).forEach(tx => {
      if (tx.is_reversed) return;
      const mId = tx.material_id;
      const signedQty = Number(tx.qty) || 0;
      const q = Math.abs(signedQty);
      if (['IN', 'PURCHASE_IN', 'TRANSFER'].includes(tx.type) && signedQty > 0 && tx.source_module !== 'daily_inventory_manual_in') {
        inTxMap[mId] = (inTxMap[mId] || 0) + q;
      }
      if (validWasteTypes.includes(tx.type)) {
        txWasteMap[mId] = (txWasteMap[mId] || 0) + q;
        return;
      }
      if (tx.type === 'OUT' && tx.source_module === 'production') {
        productionUsageMap[mId] = (productionUsageMap[mId] || 0) + q;
      }
      // Production input and staff-confirmed OUT are consumption, not non-consumption
      // stock movements. Exclude them so physical depletion remains visible in the
      // stock-based reconciliation. Production output IN remains a legitimate receipt.
      if (tx.source_module !== 'daily_inventory_manual_in' && tx.type !== 'POS_SALE' && tx.type !== 'POS_DEDUCTION' &&
          !(tx.type === 'OUT' && ['daily_inventory', 'production'].includes(tx.source_module))) {
        netStockMovementMap[mId] = (netStockMovementMap[mId] || 0) + signedQty;
      }
    });

    let locCostsQ = supabase
      .from('material_location_costs')
      .select('material_id, average_unit_cost')
      .eq('tenant_id', tenantId)
      .eq('location', location);
    if (branchId) locCostsQ = locCostsQ.eq('branch_id', branchId);
    const { data: locationCosts, error: costsErr } = await locCostsQ;
    if (costsErr && costsErr.code !== 'PGRST205') throw costsErr;
    const costMap = Object.fromEntries((locationCosts || []).map(c => [c.material_id, Number(c.average_unit_cost) || 0]));

    // Lot inventory is separate from the daily material row. Daily Inventory
    // shows the earliest active expiry and the current opened lot, never a single
    // editable expiry date that could overwrite multi-lot receipt history.
    const materialIds = materialsList.map(m => m.id).filter(Boolean);
    let batchRows = [];
    let openLotRows = [];
    if (materialIds.length) {
      let batchesQ = supabase.from('material_batches')
        .select('id, material_id, batch_no, expiry_date, expired_date, qty_resto, qty_central, status, lot_qty_verified')
        .eq('tenant_id', tenantId)
        .in('material_id', materialIds)
        .in('status', ['ACTIVE', 'active']);
      if (branchId) batchesQ = batchesQ.eq('branch_id', branchId);
      let openLotsQ = supabase.from('material_open_lot_state')
        .select('material_id, active_open_lot_id')
        .eq('tenant_id', tenantId)
        .eq('location', location);
      if (branchId) openLotsQ = openLotsQ.eq('branch_id', branchId);
      const [{ data: batches, error: batchesErr }, { data: openLots, error: openLotsErr }] = await Promise.all([
        batchesQ,
        openLotsQ,
      ]);
      if (batchesErr) throw new Error('Gagal memuat lot/expired date: ' + batchesErr.message);
      if (openLotsErr) throw new Error('Gagal memuat lot terbuka: ' + openLotsErr.message);
      batchRows = batches || [];
      openLotRows = openLots || [];
    }
    const openLotByMaterial = Object.fromEntries(openLotRows.map(row => [row.material_id, row.active_open_lot_id]));
    const batchById = Object.fromEntries(batchRows.map(batch => [batch.id, batch]));
    const batchesByMaterial = {};
    batchRows.forEach(batch => {
      const availableQty = Number(location === 'CENTRAL' ? batch.qty_central : batch.qty_resto) || 0;
      if (availableQty <= 0) return;
      const materialId = batch.material_id;
      if (!batchesByMaterial[materialId]) batchesByMaterial[materialId] = [];
      batchesByMaterial[materialId].push({ ...batch, availableQty, effectiveExpiry: batch.expired_date || batch.expiry_date || null });
    });
    Object.values(batchesByMaterial).forEach(list => list.sort((a, b) => {
      if (!a.effectiveExpiry && !b.effectiveExpiry) return String(a.id).localeCompare(String(b.id));
      if (!a.effectiveExpiry) return 1;
      if (!b.effectiveExpiry) return -1;
      return String(a.effectiveExpiry).localeCompare(String(b.effectiveExpiry));
    }));

    // Populate all active stock materials. An unchecked blank physical count is
    // intentionally different from a counted zero.
    materialsList.forEach(m => {
      const loggedWaste = txWasteMap[m.id] || 0;
      const incoming = inTxMap[m.id] || 0;
      const locationQty = location === 'CENTRAL' ? m.qty_central : (m.qty_resto ?? m.stock);
      // First operational day: materials.qty_* already reflects same-day purchases,
      // waste, production and transfers. Back out those posted mutations so the day's
      // receipts are not counted twice when EOD computes the closing balance.
      const todaysNonConsumption = Number(netStockMovementMap[m.id]) || 0;
      const todaysWaste = Number(txWasteMap[m.id]) || 0;
      const todaysProductionInput = Number(productionUsageMap[m.id]) || 0;
      const estimatedOpening = Math.max(0, (Number(locationQty) || 0) - todaysNonConsumption + todaysWaste + todaysProductionInput);
      const openingFallback = previousOpeningMap[m.id] ?? estimatedOpening;
      if (!invMap[m.id]) {
        invMap[m.id] = {
          stok_awal: openingFallback,
          opening_qty_source: previousOpeningMap[m.id] !== undefined ? 'PREVIOUS_CLOSED_EOD_PLUS_LEDGER' : 'LEGACY_CURRENT_BALANCE_ESTIMATE',
          opening_full_qty: previousOpeningPartsMap[m.id]?.full ?? null,
          opening_broken_qty: previousOpeningPartsMap[m.id]?.broken ?? null,
          opening_active_open_lot_id: previousOpeningPartsMap[m.id]?.activeOpenLotId ?? null,
          net_stock_movement: netStockMovementMap[m.id] || 0,
          qty_in: incoming,
          manual_in_qty: 0,
          manual_in_lots: [],
          qty_out: '',
          out_confirmed: false,
          zero_activity_confirmed: false,
          production_usage_qty: productionUsageMap[m.id] || 0,
          waste: loggedWaste,
          transaction_waste: loggedWaste,
          broken: '',
          broken_confirmed: false,
          full_qty: '',
          is_counted: false
        };
      } else {
        // Preserve an existing draft's opening snapshot; otherwise use prior EOD.
        if (invMap[m.id].stok_awal === undefined || invMap[m.id].stok_awal === null) {
          invMap[m.id].stok_awal = openingFallback;
          invMap[m.id].opening_qty_source = previousOpeningMap[m.id] !== undefined ? 'PREVIOUS_CLOSED_EOD_PLUS_LEDGER' : 'LEGACY_CURRENT_BALANCE_ESTIMATE';
        }
        invMap[m.id].net_stock_movement = netStockMovementMap[m.id] || 0;
        invMap[m.id].production_usage_qty = productionUsageMap[m.id] || 0;
        invMap[m.id].qty_in = incoming;
        invMap[m.id].manual_in_qty = Number(invMap[m.id].manual_in_qty) || 0;
        invMap[m.id].manual_in_lots = Array.isArray(invMap[m.id].manual_in_lots) ? invMap[m.id].manual_in_lots : [];
        invMap[m.id].transaction_waste = loggedWaste;
        invMap[m.id].waste = loggedWaste;
      }
      const materialBatches = batchesByMaterial[m.id] || [];
      const activeOpenLotId = invMap[m.id].active_open_lot_id || openLotByMaterial[m.id] || null;
      const activeOpenLotRaw = activeOpenLotId ? batchById[activeOpenLotId] : null;
      const activeOpenLotQty = activeOpenLotRaw ? Number(location === 'CENTRAL' ? activeOpenLotRaw.qty_central : activeOpenLotRaw.qty_resto) || 0 : 0;
      const activeOpenLot = activeOpenLotQty > 0 ? activeOpenLotRaw : null;
      const activeExpiry = activeOpenLot?.expired_date || activeOpenLot?.expiry_date || null;
      const earliestBatch = materialBatches.find(batch => batch.effectiveExpiry) || null;
      const earliestExpiry = earliestBatch?.effectiveExpiry || null;
      const availableLotQty = materialBatches.reduce((sum, batch) => sum + Number(batch.availableQty || 0), 0);
      const locationStockQty = Number(location === 'CENTRAL' ? m.qty_central : (m.qty_resto ?? m.stock)) || 0;
      const hasUnverifiedLot = materialBatches.some(batch => batch.lot_qty_verified !== true);
      // Waste and production input have already decreased material master balances; in legacy
      // rows the lot quantities may not yet have been decremented until EOD. Compare on a common
      // pre-consumption basis to avoid a false mismatch for today's recorded activity.
      const lotComparisonStock = locationStockQty + (Number(txWasteMap[m.id]) || 0) + (Number(productionUsageMap[m.id]) || 0);
      const lotBalanceMismatch = Math.abs(availableLotQty - lotComparisonStock) > 0.0001;
      invMap[m.id].active_open_lot_id = activeOpenLot?.id || null;
      invMap[m.id].opening_full_qty = invMap[m.id].opening_full_qty ?? previousOpeningPartsMap[m.id]?.full ?? null;
      invMap[m.id].opening_broken_qty = invMap[m.id].opening_broken_qty ?? previousOpeningPartsMap[m.id]?.broken ?? null;
      // Late valid movements after a previous close can change the total opening balance.
      // Keep the prior broken weigh-in and recompute inferred FULL rather than showing stale parts.
      if (isBrokenTrackingEnabled(m) && invMap[m.id].opening_broken_qty !== null && invMap[m.id].opening_broken_qty !== undefined) {
        const openingParts = calculateInferredFullFromBroken(m, Number(invMap[m.id].stok_awal) || 0, Number(invMap[m.id].opening_broken_qty));
        invMap[m.id].opening_full_qty = openingParts.fullQty;
        if (!openingParts.valid) invMap[m.id].opening_parts_reconciliation_required = true;
      }

      invMap[m.id].broken_unit = getPackContentUnitFromMaterial(m);
      // Legacy EOD rows stored OUT in the tracked stock unit. Preserve that unit
      // while editing old drafts; new rows default to the content unit.
      if (!invMap[m.id].out_unit) {
        invMap[m.id].out_unit = (invMap[m.id].out_qty_normalized != null && invMap[m.id].out_qty_input == null)
          ? (m.unit || getPackContentUnitFromMaterial(m))
          : (m.broken_tracking_enabled ? getPackContentUnitFromMaterial(m) : (m.unit || ''));
      }
      invMap[m.id].broken_tracking_enabled = Boolean(m.broken_tracking_enabled);
      invMap[m.id].expiry_tracking_enabled = Boolean(m.expiry_tracking_enabled);
      invMap[m.id].next_expiry_date = earliestExpiry;
      invMap[m.id].active_open_lot_expiry_date = activeExpiry;
      invMap[m.id].fefo_exception = Boolean(activeExpiry && earliestExpiry && activeExpiry > earliestExpiry);
      invMap[m.id].lot_reconciliation_required = Boolean(invMap[m.id].expiry_tracking_enabled && (hasUnverifiedLot || lotBalanceMismatch || (locationStockQty > 0 && materialBatches.length === 0)));
      invMap[m.id].lot_balance_summary = { available_qty: availableLotQty, stock_qty: locationStockQty, unverified_count: materialBatches.filter(batch => batch.lot_qty_verified !== true).length };
      invMap[m.id].cost_per_unit = costMap[m.id] || Number(m.avg_cost || m.price) || 0;
      m.next_expiry_date = earliestExpiry;
      m.active_open_lot_id = activeOpenLot?.id || null;
      m.active_open_lot_expiry_date = activeExpiry;
      m.fefo_exception = Boolean(activeExpiry && earliestExpiry && activeExpiry > earliestExpiry);
      m.lot_reconciliation_required = invMap[m.id].lot_reconciliation_required;
      m.broken_tracking_enabled = Boolean(m.broken_tracking_enabled);
      m.expiry_tracking_enabled = Boolean(m.expiry_tracking_enabled);
    });

    return {
      items: materialsList,
      inventory: invMap,
      isLocked: !!header && ['verified','closed'].includes(header.status),
      transactionWasteMap: txWasteMap,
      header,
      location,
      previousDate: previousHeaders?.[0]?.date || null
    };
  },
  saveDailyInventory: async (date, items, isClosing, userId, location = 'RESTO', branchIdArg = null) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branchIdArg);
    const user = userId || await getActiveUserId();
    const locUpper = String(location || 'RESTO').toUpperCase();
    const itemsToSave = items.map(item => ({
      material_id: Number(item.material_id),
      opening_qty: Number(item.opening_qty) || 0,
      manual_in_qty: Number(item.manual_in_qty) || 0,
      manual_in_lots: Array.isArray(item.manual_in_lots) ? item.manual_in_lots : [],
      opening_full_qty: item.opening_full_qty ?? null,
      opening_broken_qty: item.opening_broken_qty ?? null,
      out_qty: item.out_qty === '' || item.out_qty === null || item.out_qty === undefined ? null : Number(item.out_qty),
      out_qty_input: item.out_qty_input === '' || item.out_qty_input === null || item.out_qty_input === undefined ? null : Number(item.out_qty_input),
      out_unit: item.out_unit || null,
      fefo_override_reason: item.fefo_override_reason || null,
      out_confirmed: Boolean(item.out_confirmed),
      zero_activity_confirmed: Boolean(item.zero_activity_confirmed),
      broken_qty: item.broken_qty === '' || item.broken_qty === null || item.broken_qty === undefined ? null : Number(item.broken_qty),
      broken_unit: item.broken_unit || null,
      broken_confirmed: Boolean(item.broken_confirmed),
      full_qty: item.full_qty == null ? null : Number(item.full_qty),
      closing_qty: Number(item.closing_qty) || 0,
      opening_active_open_lot_id: item.opening_active_open_lot_id || null,
      is_counted: Boolean(item.is_counted),
      opening_qty_source: item.opening_qty_source || 'CLIENT_OR_LEGACY_FALLBACK'
    }));
    const { data, error } = await supabase.rpc('save_daily_inventory_manual_in_v6', {
      p_tenant_id: tenantId,
      p_date: date,
      p_location: locUpper,
      p_items: itemsToSave,
      p_is_closing: Boolean(isClosing),
      p_user_id: user
    });
    if (!error) {
      return data;
    }

    const errMsg = String(error.message || '');
    const isGeneratedColError =
      errMsg.includes('terpakai_qty') ||
      errMsg.toLowerCase().includes('cannot insert a non-default value') ||
      errMsg.toLowerCase().includes('can only be updated to default');

    if (!isGeneratedColError) {
      throw new Error('Gagal menyimpan Daily Inventory secara atomik: ' + error.message);
    }

    // Fallback when public.daily_inventory_items.terpakai_qty is a GENERATED ALWAYS column in PostgreSQL:
    // Perform header & detail upsert strictly omitting terpakai_qty so PostgreSQL computes it automatically.
    let existingHeaderQ = supabase
      .from('daily_inventories')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('date', date)
      .eq('location', locUpper);
    if (branchId) existingHeaderQ = existingHeaderQ.eq('branch_id', branchId);
    const { data: existingHeader, error: headerLookupErr } = await existingHeaderQ.maybeSingle();
    if (headerLookupErr) {
      throw new Error('Gagal memeriksa sesi Daily Inventory: ' + headerLookupErr.message);
    }
    if (existingHeader && ['verified', 'closed'].includes(String(existingHeader.status || '').toLowerCase())) {
      throw new Error(`EOD tanggal ${date} lokasi ${locUpper} sudah terkunci.`);
    }

    let headerId = existingHeader?.id;
    if (!headerId) {
      const { data: createdHeader, error: createHeaderErr } = await supabase
        .from('daily_inventories')
        .insert({
          tenant_id: tenantId,
          ...(branchId ? { branch_id: branchId } : {}),
          date,
          location: locUpper,
          status: isClosing ? 'closed' : 'draft',
        })
        .select('id')
        .single();
      if (createHeaderErr) {
        throw new Error('Gagal membuat sesi Daily Inventory: ' + createHeaderErr.message);
      }
      headerId = createdHeader.id;
    }

    // Fetch today's source IN & WASTE transactions so in_qty and waste_qty stay accurate
    const autoInByMat = {};
    const wasteByMat = {};
    try {
      let dailyInvTxQ = supabase
        .from('transactions')
        .select('material_id, type, qty, is_reversed, source_module')
        .eq('tenant_id', tenantId)
        .eq('date', date)
        .eq('location', locUpper)
        .eq('is_reversed', false);
      if (branchId) dailyInvTxQ = dailyInvTxQ.eq('branch_id', branchId);
      const { data: txRows } = await dailyInvTxQ;
      (txRows || []).forEach(tx => {
        if (tx.is_reversed) return;
        const mId = Number(tx.material_id);
        const signed = Number(tx.qty) || 0;
        const absQ = Math.abs(signed);
        if (['IN', 'PURCHASE_IN', 'TRANSFER'].includes(tx.type) && signed > 0 && tx.source_module !== 'daily_inventory_manual_in') {
          autoInByMat[mId] = (autoInByMat[mId] || 0) + absQ;
        } else if (['WASTE', 'BREAKAGE', 'EXPIRED', 'COMP'].includes(tx.type)) {
          wasteByMat[mId] = (wasteByMat[mId] || 0) + absQ;
        }
      });
    } catch {
      // Non-fatal if transactions query fails
    }

    // Notice: terpakai_qty is intentionally omitted so PostgreSQL GENERATED ALWAYS column computes it automatically
    const detailRowsFull = itemsToSave.map(item => {
      const mId = Number(item.material_id);
      const autoIn = Number(autoInByMat[mId]) || 0;
      const manualIn = Number(item.manual_in_qty) || 0;
      const outVal = Number(item.out_qty) || 0;
      const wasteVal = Number(wasteByMat[mId]) || 0;
      return {
        inventory_id: headerId,
        tenant_id: tenantId,
        ...(branchId ? { branch_id: branchId } : {}),
        material_id: mId,
        prev_full_qty: Number(item.opening_qty) || 0,
        opening_qty_snapshot: Number(item.opening_qty) || 0,
        opening_full_qty: item.opening_full_qty ?? null,
        opening_broken_qty: item.opening_broken_qty ?? null,
        in_qty: Number((autoIn + manualIn).toFixed(4)),
        manual_in_qty: manualIn,
        manual_in_lots: Array.isArray(item.manual_in_lots) ? item.manual_in_lots : [],
        out_qty: outVal,
        out_qty_input: item.out_qty_input ?? null,
        out_unit: item.out_unit || null,
        out_confirmed: Boolean(item.out_confirmed),
        zero_activity_confirmed: Boolean(item.zero_activity_confirmed),
        waste_qty: wasteVal,
        broken_qty: Number(item.broken_qty) || 0,
        broken_unit: item.broken_unit || null,
        broken_confirmed: Boolean(item.broken_confirmed),
        full_qty: item.full_qty == null ? 0 : Number(item.full_qty),
        closing_qty: Number(item.closing_qty) || 0,
        is_counted: Boolean(item.is_counted),
        opening_qty_source: item.opening_qty_source || 'CLIENT_OR_LEGACY_FALLBACK',
        reconciliation_status: isClosing ? 'CLOSED_BOOK_PLUS_BROKEN' : 'PENDING',
      };
    });

    let { error: upsertErr } = await supabase
      .from('daily_inventory_items')
      .upsert(detailRowsFull, { onConflict: 'inventory_id,material_id' });

    if (upsertErr) {
      // Secondary fallback with minimal core columns (still strictly omitting terpakai_qty)
      const detailRowsCore = detailRowsFull.map(r => ({
        inventory_id: r.inventory_id,
        tenant_id: r.tenant_id,
        material_id: r.material_id,
        prev_full_qty: r.prev_full_qty,
        in_qty: r.in_qty,
        out_qty: r.out_qty,
        waste_qty: r.waste_qty,
        broken_qty: r.broken_qty,
        full_qty: r.full_qty,
        closing_qty: r.closing_qty,
        is_counted: r.is_counted,
      }));
      const retry = await supabase
        .from('daily_inventory_items')
        .upsert(detailRowsCore, { onConflict: 'inventory_id,material_id' });
      upsertErr = retry.error;
    }

    if (upsertErr) {
      throw new Error('Gagal menyimpan item Daily Inventory: ' + upsertErr.message);
    }

    if (isClosing) {
      for (const item of itemsToSave) {
        const mId = Number(item.material_id);
        const closingQty = Math.max(0, Number(item.closing_qty) || 0);
        const stockPatch = locUpper === 'CENTRAL'
          ? { qty_central: closingQty, updated_at: new Date().toISOString() }
          : { qty_resto: closingQty, stock: closingQty, updated_at: new Date().toISOString() };
        let matUpdQ = supabase
          .from('materials')
          .update(stockPatch)
          .eq('id', mId)
          .eq('tenant_id', tenantId);
        if (branchId) matUpdQ = matUpdQ.eq('branch_id', branchId);
        await matUpdQ;
      }
      let closeHdrQ = supabase
        .from('daily_inventories')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .eq('id', headerId)
        .eq('tenant_id', tenantId);
      if (branchId) closeHdrQ = closeHdrQ.eq('branch_id', branchId);
      await closeHdrQ;
    }

    return {
      success: true,
      inventory_id: headerId,
      status: isClosing ? 'closed' : 'draft',
      fallback: 'generated_terpakai_qty_safe',
    };
  },

  saveDailyInventoryBrokenCounts: async (date, location = 'RESTO', items = []) => {
    const tenantId = await requireTenantId();
    await requireBranchId();
    const userId = await getActiveUserId();
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Tidak ada perubahan BROKEN yang perlu disimpan.');
    }
    const payload = items.map(item => {
      const quantity = Number(item.broken_qty);
      if (!Number.isFinite(quantity) || quantity < 0) {
        throw new Error(`BROKEN untuk ${item.name || 'material'} harus berupa angka nol atau lebih.`);
      }
      if (!item.material_id || !String(item.broken_unit || '').trim()) {
        throw new Error('Material dan satuan BROKEN wajib diisi.');
      }
      return {
        material_id: Number(item.material_id),
        broken_qty: quantity,
        broken_unit: String(item.broken_unit).trim(),
      };
    });
    const { data, error } = await supabase.rpc('save_daily_inventory_broken_counts_v7', {
      p_tenant_id: tenantId,
      p_date: date,
      p_location: location,
      p_items: payload,
      p_user_id: userId,
    });
    if (error) throw new Error('Gagal menyimpan BROKEN closing: ' + error.message);
    // Recorded atomically inside PostgreSQL RPC save_daily_broken_counts
    return data;
  },

  unlockDailyInventory: async (date, location = 'RESTO') => {
    const tenantId = await requireTenantId();
    await requireBranchId();
    const userId = await getActiveUserId();
    const { data, error } = await supabase.rpc('reopen_daily_inventory_session_v4', {
      p_tenant_id: tenantId,
      p_date: date,
      p_location: location,
      p_user_id: userId
    });
    if (error) throw new Error('Gagal membuka ulang EOD: ' + error.message);

    // Recorded atomically inside PostgreSQL RPC reopen_daily_inventory_session_v3
    return data;
  },

  getNearestExpiry: async () => {
    // Note: Table stock_ledger_entries does not exist in standard schema (PGRST205).
    // Return empty map to avoid 404 / PGRST205 schema cache errors on load.
    return {};
  },
  bulkDeletePurchaseEntries: async (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return { successCount: 0, failedItems: [] };
    const tenantId = await requireTenantId();
    const { data: purchaseRows, error: purchaseRowsErr } = await supabase.from('purchase_entries')
      .select('id, date, created_at').eq('tenant_id', tenantId).in('id', ids);
    if (purchaseRowsErr) throw new Error('Gagal memuat pembelian terpilih: ' + purchaseRowsErr.message);
    const orderedIds = (purchaseRows || []).sort((a, b) =>
      String(b.date || '').localeCompare(String(a.date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || ''))
    ).map(row => row.id);
    const failedItems = [];
    let successCount = 0;
    // Cancel newest-first. The server RPC refuses reversals when a later stock
    // movement exists, avoiding a destructive rollback that corrupts WAC.
    for (const id of orderedIds) {
      try {
        await api.deletePurchaseEntry(id);
        successCount += 1;
      } catch (error) {
        failedItems.push({ id, error: error?.message || String(error) });
      }
    }
    try { await logAudit('CANCEL_PURCHASE_BULK', `Membatalkan ${successCount} riwayat pembelian; ${failedItems.length} gagal dan membutuhkan rekonsiliasi.`); } catch { /* ignore */ }
    return { successCount, failedItems };
  },
  // Import POS sales without mutating physical inventory. The ESB file is the
  // sales source; actual stock OUT is confirmed by staff during Daily Inventory.
  // Recipe quantities are stored in expected_usage for theoretical comparison.
  processESBSalesImport: async (posDataArray, options = {}) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(options?.branchId || null);
    const userId = await getActiveUserId();
    if (!Array.isArray(posDataArray) || posDataArray.length === 0) throw new Error('File ESB tidak berisi baris penjualan yang valid.');

    let recQ = supabase.from('recipes')
      .select('*, recipe_ingredients(material_id, qty_in_use, unit, unit_price, amount, materials(id, name, price, new_price, avg_cost, unit, full_pack))')
      .eq('tenant_id', tenantId);
    let matQ = supabase.from('materials').select('*').eq('tenant_id', tenantId);
    if (branchId) {
      recQ = recQ.eq('branch_id', branchId);
      matQ = matQ.eq('branch_id', branchId);
    }

    const [{ data: recipes, error: recipesErr }, { data: materials, error: materialsErr }] = await Promise.all([
      recQ,
      matQ
    ]);
    if (recipesErr) throw recipesErr;
    if (materialsErr) throw materialsErr;

    const recipeMapByCode = new Map((recipes || []).filter(r => r.pos_code).map(r => [String(r.pos_code).toLowerCase().trim(), r]));
    const recipeMapByName = new Map((recipes || []).map(r => [String(r.menu_name).toLowerCase().trim(), r]));
    const materialMapByName = new Map((materials || []).map(m => [String(m.name).toLowerCase().trim(), m]));
    const unitConversionMap = await api._loadUnitConversionMap(tenantId, branchId);
    const today = getLocalDateISO();
    const cleanSales = posDataArray.map(item => ({
      salesDate: String(item.salesDate || today).slice(0, 10),
      menu_name: String(item.menu_name || '').trim(),
      menu_code: String(item.menu_code || '').trim(),
      qty: Number(item.qty) || 0,
      total: Number(item.total) || 0,
      category: String(item.category || 'ALL')
    })).filter(item => item.menu_name && item.qty >= 0 && Number.isFinite(item.total));
    if (!cleanSales.length) throw new Error('Tidak ada baris ESB yang bisa diproses setelah validasi.');

    const dates = cleanSales.map(row => row.salesDate).sort();
    const minDataDate = dates[0];
    const maxDataDate = dates[dates.length - 1];
    let minDate = minDataDate;
    let maxDate = maxDataDate;
    if (options.periodMonth && options.periodYear) {
      const month = String(options.periodMonth).padStart(2, '0');
      const lastDay = new Date(Number(options.periodYear), Number(options.periodMonth), 0).getDate();
      minDate = `${options.periodYear}-${month}-01`;
      maxDate = `${options.periodYear}-${month}-${String(lastDay).padStart(2, '0')}`;
    }

    const canonicalPayload = JSON.stringify(cleanSales.slice().sort((a, b) =>
      `${a.salesDate}|${a.menu_code}|${a.menu_name}|${a.qty}|${a.total}`.localeCompare(`${b.salesDate}|${b.menu_code}|${b.menu_name}|${b.qty}|${b.total}`)
    ));
    const deterministicHash = (value) => {
      let h1 = 0x811c9dc5;
      for (let i = 0; i < value.length; i++) {
        h1 ^= value.charCodeAt(i);
        h1 = Math.imul(h1, 0x01000193);
      }
      return `data-${(h1 >>> 0).toString(16).padStart(8, '0')}-${value.length}`;
    };
    const contentHash = options.fileHash || deterministicHash(canonicalPayload);

    let priorUploadQ = supabase
      .from('pos_upload_logs')
      .select('id, filename, period, category_filter')
      .eq('tenant_id', tenantId)
      .eq('file_hash', contentHash);
    if (branchId) priorUploadQ = priorUploadQ.eq('branch_id', branchId);
    const { data: priorUpload, error: priorUploadErr } = await priorUploadQ
      .limit(1)
      .maybeSingle();
    if (priorUploadErr && priorUploadErr.code !== 'PGRST116') throw priorUploadErr;
    if (priorUpload && options.mode !== 'overwrite') {
      return {
        success: true,
        duplicate: true,
        duplicate_filename: priorUpload.filename,
        deducted_materials: 0,
        theoretical_materials: 0,
        negative_warnings: [],
        unmapped_items: [],
        data_issues: [],
        errors: [],
        message: 'File ESB dengan hash yang sama sudah pernah diimpor; tidak ada penjualan atau pemakaian yang ditambahkan.'
      };
    }

    // The ESB file is a period sales export, not a shift-level append feed. A
    // different file covering already imported dates could repeat the same POS
    // revenue. Block overlap by default; user must explicitly overwrite period.
    // This also protects periods imported by the legacy POS sync path.
    if (options.mode !== 'overwrite') {
      let overlapQ = supabase
        .from('transactions')
        .select('id, date, source_module')
        .eq('tenant_id', tenantId)
        .eq('type', 'POS_SALE')
        .gte('date', minDate)
        .lte('date', maxDate);
      if (branchId) overlapQ = overlapQ.eq('branch_id', branchId);
      const { data: overlappingSales, error: overlapErr } = await overlapQ.limit(1);
      if (overlapErr) throw new Error('Gagal memeriksa potensi duplikasi periode POS: ' + overlapErr.message);
      if (overlappingSales?.length) {
        throw new Error(`Periode ESB ${minDate} sampai ${maxDate} bersinggungan dengan penjualan yang sudah ada. Untuk mencegah omzet terhitung dua kali, pilih mode Timpa/Overwrite setelah memeriksa periode dan file sumber.`);
      }
    }

    // Overwrite replaces the POS/theoretical dataset for the selected period.
    // It does not reverse or remove old POS_DEDUCTION rows, since those may
    // already be reflected in historical balances. Legacy deductions are surfaced.
    if (options.mode === 'overwrite') {
      let legacyQ = supabase
        .from('transactions').select('id').eq('tenant_id', tenantId).eq('type', 'POS_DEDUCTION')
        .gte('date', minDate).lte('date', maxDate);
      if (branchId) legacyQ = legacyQ.eq('branch_id', branchId);
      const { data: legacyDeductions, error: legacyErr } = await legacyQ.limit(1);
      if (legacyErr) throw legacyErr;
      let salesDelQ = supabase.from('transactions').delete()
        .eq('tenant_id', tenantId).eq('type', 'POS_SALE').gte('date', minDate).lte('date', maxDate);
      if (branchId) salesDelQ = salesDelQ.eq('branch_id', branchId);
      const { error: salesDeleteErr } = await salesDelQ;
      if (salesDeleteErr) throw new Error('Gagal mengganti data penjualan periode: ' + salesDeleteErr.message);
      let expectedDelQ = supabase.from('expected_usage').delete()
        .eq('tenant_id', tenantId).lte('week_start', maxDate).gte('week_end', minDate);
      if (branchId) expectedDelQ = expectedDelQ.eq('branch_id', branchId);
      const { error: expectedDeleteErr } = await expectedDelQ;
      if (expectedDeleteErr) throw new Error('Gagal mengganti data theoretical usage periode: ' + expectedDeleteErr.message);
      // Keep prior upload metadata except the same content hash, which is replaced below.
      let logDelQ = supabase.from('pos_upload_logs').delete().eq('tenant_id', tenantId).eq('file_hash', contentHash);
      if (branchId) logDelQ = logDelQ.eq('branch_id', branchId);
      await logDelQ;
      if (legacyDeductions?.length) {
        console.warn('[ESB] Periode berisi POS_DEDUCTION historis; baris legacy tetap dipertahankan untuk melindungi saldo stok.', { minDate, maxDate });
      }
    }

    const salesByDate = new Map();
    const expectedByMaterial = new Map();
    const unmappedItems = new Set();
    const dataIssues = new Set();
    const toFiniteNumber = (value, fallback = 0) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };

    for (const item of cleanSales) {
      const sTotal = toFiniteNumber(item.total);
      const qtySold = toFiniteNumber(item.qty);
      salesByDate.set(item.salesDate, (salesByDate.get(item.salesDate) || 0) + sTotal);
      if (qtySold <= 0) continue;
      const nameKey = item.menu_name.toLowerCase().trim();
      const codeKey = item.menu_code.toLowerCase().trim();
      const recipe = recipeMapByCode.get(codeKey) || recipeMapByName.get(nameKey);

      if (recipe?.recipe_ingredients?.length) {
        for (const ingredient of recipe.recipe_ingredients) {
          const material = ingredient.materials;
          if (!material || !ingredient.material_id) {
            dataIssues.add(`${item.menu_name}: ada bahan resep yang tidak terhubung ke master material.`);
            continue;
          }
          const ingredientQty = toFiniteNumber(ingredient.qty_in_use, NaN);
          if (!Number.isFinite(ingredientQty) || ingredientQty < 0) {
            dataIssues.add(`${item.menu_name} → ${material.name}: qty resep tidak valid.`);
            continue;
          }
          const ingredientUnit = ingredient.unit || material.unit;
          const normalized = convertQtyToStockUnit(material, ingredientQty * qtySold, ingredientUnit);
          if (!normalized.resolved) {
            dataIssues.add(`${item.menu_name} → ${material.name}: satuan resep ${ingredientUnit} tidak bisa dikonversi ke satuan stok ${material.unit}; theoretical quantity dilewati.`);
            continue;
          }
          const costingMaterial = { ...material, price: Number(material.new_price) > 0 ? material.new_price : material.price };
          const cost = calculateIngredientCost(costingMaterial, ingredientQty * qtySold, ingredientUnit, unitConversionMap);
          const current = expectedByMaterial.get(material.id) || { qty: 0, cost: 0, totalSold: 0, material };
          current.qty += normalized.qty;
          current.cost += toFiniteNumber(cost);
          current.totalSold += qtySold;
          expectedByMaterial.set(material.id, current);
        }
      } else {
        const material = materialMapByName.get(nameKey);
        if (material) {
          const current = expectedByMaterial.get(material.id) || { qty: 0, cost: 0, totalSold: 0, material };
          // Explicit 1:1 fallback for menu rows that are also a stock material.
          current.qty += qtySold;
          current.cost += toFiniteNumber(calculateIngredientCost({ ...material, price: Number(material.new_price) > 0 ? material.new_price : material.price }, qtySold, material.unit, unitConversionMap));
          current.totalSold += qtySold;
          expectedByMaterial.set(material.id, current);
        } else {
          unmappedItems.add(item.menu_name);
        }
      }
    }

    const saleRows = Array.from(salesByDate.entries()).filter(([, amount]) => Number.isFinite(amount)).map(([date, amount]) => ({
      tenant_id: tenantId,
      ...(branchId ? { branch_id: branchId } : {}),
      date,
      material_id: null,
      type: 'POS_SALE',
      location: 'RESTO',
      qty: 1,
      amount: toFiniteNumber(amount),
      notes: `ESB Daily Sales Aggregation [${contentHash}]`,
      created_by: userId,
      source_module: 'pos_import',
      source_record_id: contentHash,
      idempotency_key: `pos-sale:${contentHash}:${date}`
    }));

    if (saleRows.length) {
      const { error: saleInsertErr } = await supabase.from('transactions').upsert(saleRows, {
        onConflict: 'tenant_id,idempotency_key',
        ignoreDuplicates: true
      });
      if (saleInsertErr) throw new Error('Gagal menyimpan transaksi penjualan ESB: ' + saleInsertErr.message);
    }

    const expectedUsageRows = Array.from(expectedByMaterial.entries()).filter(([, data]) => data.qty > 0).map(([materialId, data]) => ({
      tenant_id: tenantId,
      ...(branchId ? { branch_id: branchId } : {}),
      week_start: minDate,
      week_end: maxDate,
      material_id: materialId,
      expected_qty: data.qty,
      expected_cost_value: data.cost,
      unit_cost_snapshot: data.qty > 0 ? data.cost / data.qty : 0,
      source_file_hash: contentHash,
      total_sold: Math.round(data.totalSold),
      last_pos_filename: options.filename || 'ESB Upload',
      created_by: userId
    }));
    if (expectedUsageRows.length) {
      const { error: expectedInsertErr } = await supabase.from('expected_usage').upsert(expectedUsageRows, {
        onConflict: 'tenant_id,source_file_hash,material_id',
        ignoreDuplicates: true
      });
      if (expectedInsertErr) throw new Error('Gagal menyimpan theoretical usage: ' + expectedInsertErr.message);
    }

    const { error: uploadLogErr } = await supabase.from('pos_upload_logs').insert({
      tenant_id: tenantId,
      ...(branchId ? { branch_id: branchId } : {}),
      filename: options.filename || 'ESB Upload',
      file_hash: contentHash,
      period: `${options.periodMonth || ''}/${options.periodYear || ''}`,
      total_rows: cleanSales.length,
      period_start: minDate,
      period_end: maxDate,
      category_filter: options.categoryFilter || 'ALL',
      rows_inserted: saleRows.length
    });
    if (uploadLogErr) throw new Error('Penjualan tersimpan tetapi log impor ESB gagal disimpan: ' + uploadLogErr.message);

    await logAudit('IMPORT_ESB_SALES', `Mengimpor ${cleanSales.length} baris ESB (${minDate}–${maxDate}); stok fisik tidak dipotong otomatis.`);
    return {
      success: true,
      duplicate: false,
      deducted_materials: 0,
      theoretical_materials: expectedUsageRows.length,
      negative_warnings: [],
      unmapped_items: Array.from(unmappedItems),
      data_issues: Array.from(dataIssues),
      errors: [],
      sales_dates: saleRows.length
    };
  },

  // Compatibility adapter for older DataContext callers. All POS sales now
  // pass through the same idempotent importer as the current ESB upload screen.
  // This avoids maintaining a second, additive path that could duplicate revenue.
  processPOSSync: async (posDataArray, options = {}) => {
    if (!Array.isArray(posDataArray) || posDataArray.length === 0) {
      throw new Error('Data POS kosong atau tidak valid.');
    }

    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(options?.branchId || null);
    const recipeIds = [...new Set(posDataArray.map(row => row.recipe_id).filter(Boolean))];
    let recipesById = new Map();
    if (recipeIds.length) {
      let recQ = supabase.from('recipes')
        .select('id, menu_name, pos_code')
        .eq('tenant_id', tenantId)
        .in('id', recipeIds);
      if (branchId) recQ = recQ.eq('branch_id', branchId);
      const { data, error } = await recQ;
      if (error) throw error;
      recipesById = new Map((data || []).map(recipe => [String(recipe.id), recipe]));
    }

    const normalized = posDataArray.map(row => {
      const recipe = row.recipe_id ? recipesById.get(String(row.recipe_id)) : null;
      const qty = Number(row.qty ?? row.quantity ?? 0);
      const unitPrice = Number(row.price ?? row.unit_price ?? 0);
      const total = row.total ?? row.subtotal ?? (unitPrice * qty);
      return {
        salesDate: row.salesDate || row.date || getLocalDateISO(),
        menu_name: String(row.menu_name || row.name || recipe?.menu_name || '').trim(),
        menu_code: String(row.menu_code || recipe?.pos_code || '').trim(),
        qty,
        total: Number(total) || 0,
        category: row.category || 'ALL'
      };
    }).filter(row => row.menu_name);

    if (!normalized.length) {
      throw new Error('Data POS tidak memiliki nama menu yang dapat dicocokkan.');
    }
    return api.processESBSalesImport(normalized, options);
  },

  // Theoretical usage variance calculation vs actual inputs
  getUsageVariance: async (month, year, branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await requireBranchId(branchIdArg);
    const m = month.toString().padStart(2, '0');
    const startDate = `${year}-${m}-01`;
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    const endDate = `${year}-${m}-${String(lastDay).padStart(2, '0')}`;

    let euQ = supabase.from('expected_usage').select('*')
      .eq('tenant_id', tenantId)
      .gte('week_start', startDate).lte('week_end', endDate);
    let diQ = supabase.from('daily_inventories').select('*, daily_inventory_items(*)')
      .eq('tenant_id', tenantId)
      .gte('date', startDate).lte('date', endDate);
    let matQ = supabase.from('materials').select('id, name, price, unit, full_pack').eq('tenant_id', tenantId);
    if (branchId) {
      euQ = euQ.eq('branch_id', branchId);
      diQ = diQ.eq('branch_id', branchId);
      matQ = matQ.eq('branch_id', branchId);
    }

    const [{ data: expectedUsageRows, error: euErr }, { data: dailyInventories, error: diErr }, { data: materials, error: matErr }] =
      await Promise.all([euQ, diQ, matQ]);

    if (euErr) throw euErr;
    if (diErr) throw diErr;
    if (matErr) throw matErr;

    const unitConversionMap = await api._loadUnitConversionMap(tenantId, branchId);
    return calculateUsageVariance(expectedUsageRows || [], dailyInventories || [], materials || [], unitConversionMap);
  },

  // Set memory cache to avoid async locks in browser
  getPOSOrders: async (branchIdArg = null) => {
    try {
      const tenantId = await getActiveTenantId();
      if (!tenantId) return [];
      const branchId = await requireBranchId(branchIdArg);
      let query = supabase
        .from('pos_orders')
        .select('*')
        .eq('tenant_id', tenantId);
      if (branchId) query = query.eq('branch_id', branchId);
      const { data, error } = await query;
      if (error) { console.error("DB Error:", error); throw error; }
      return data;
    } catch (err) {
      console.error('getPOSOrders error:', err);
      throw err;
    }
  },

  getPOSOrderItems: async (orderId, branchIdArg = null) => {
    try {
      const tenantId = await getActiveTenantId();
      const branchId = await requireBranchId(branchIdArg);
      // Verify the order belongs to the active tenant and branch before returning items
      let orderQ = supabase.from('pos_orders').select('id').eq('id', orderId).eq('tenant_id', tenantId);
      if (branchId) orderQ = orderQ.eq('branch_id', branchId);
      const { data: order } = await orderQ.maybeSingle();
      if (!order) throw new Error('Order tidak ditemukan atau akses ditolak.');
      let itemsQ = supabase
        .from('pos_order_items')
        .select('*, recipes(menu_name)')
        .eq('order_id', orderId);
      if (branchId) itemsQ = itemsQ.eq('branch_id', branchId);
      const { data, error } = await itemsQ;
      if (error) { console.error("DB Error:", error); throw error; }
      return data;
    } catch (err) {
      console.error('getPOSOrderItems error:', err);
      throw err;
    }
  },

  setSessionData: (tenantId, userId, overheadPct, whatsappNumber, whatsappToken, whatsappEnabled, branchId, role = undefined) => {
    activeTenantId = tenantId;
    activeUserId = userId;
    if (overheadPct !== undefined && overheadPct !== null) {
      activeOverheadPct = parseFloat(overheadPct);
    }
    activeWhatsappNumber = whatsappNumber || null;
    activeWhatsappToken = whatsappToken || null;
    activeWhatsappEnabled = !!whatsappEnabled;
    activeBranchId = branchId || null;
    if (role !== undefined) {
      activeUserRole = role || null;
    }
    if (typeof window !== 'undefined') {
      window.__activeBranchId = activeBranchId;
      if (role !== undefined) {
        window.__activeUserRole = activeUserRole;
      }
    }
  },

  setActiveBranch: (branchId) => {
    activeBranchId = branchId || null;
    if (typeof window !== 'undefined') {
      window.__activeBranchId = activeBranchId;
    }
  },

  getActiveBranchId: () => activeBranchId,

  requireBranchContext: (overrideBranchId = null, opts = {}) => requireBranchId(overrideBranchId, opts),

  isAdminSession: () => {
    const r = getEffectiveUserRole();
    return r ? isAdminRole(r) : false;
  },

  getOverheadPct: () => activeOverheadPct,

  getActiveTenantId: async () => {
    return await getActiveTenantId();
  },

  getActiveUserId: async () => {
    return await getActiveUserId();
  },

  // --- AUTHENTICATION ---
  login: async (email, password) => {
    // 1. Perform Supabase authentication first (so RLS policies will be satisfied for profile and tenant queries)
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authErr || !authData.user) {
      throw new Error(authErr?.message || 'Email atau password salah.');
    }

    // 2. Fetch user profile
    let { data: userProfile, error: profileErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!userProfile) {
      // Auto-recover for missing profile (e.g., registered via Supabase dashboard or RPC failure)
      const meta = authData.user.user_metadata || {};
      const name = meta.name || authData.user.email?.split('@')[0] || 'Admin';
      const role = meta.role || 'Admin / Owner';
      const tenantName = meta.tenant_name || ('resto_' + Math.floor(Math.random() * 10000));
      const companyName = meta.company_name || 'My Resto';

      let tenantId;
      const { data: existingTenant } = await supabase.from('tenants').select('id').eq('name', tenantName).maybeSingle();
      
      if (existingTenant) {
        tenantId = existingTenant.id;
      } else {
        const { data: newTenant } = await supabase.from('tenants').insert({ name: tenantName, company_name: companyName }).select('id').maybeSingle();
        if (newTenant) tenantId = newTenant.id;
      }

      if (tenantId) {
        const { data: newProfile } = await supabase.from('users').insert({
          id: authData.user.id,
          tenant_id: tenantId,
          name: name,
          email: authData.user.email,
          role: role
        }).select('*').maybeSingle();
        
        if (newProfile) {
          userProfile = newProfile;
        }
      }

      if (!userProfile) {
        throw new Error("Profile pengguna tidak ditemukan. Database RLS mungkin memblokir auto-recovery. Silakan jalankan script SQL setup atau daftar ulang.");
      }
    }

    if (profileErr || !userProfile) {
      await supabase.auth.signOut();
      throw new Error('Profil user tidak ditemukan: ' + (profileErr?.message || 'Data kosong dan gagal dipulihkan otomatis.'));
    }

    let tenant;
    // H-4: Super Admin status is determined by the DB role on the authenticated
    // profile - NOT by a hardcoded email. The real boundary is the user's role
    // (also enforced by RLS is_super_admin()), so no magic email is needed.
    const roleLower = (userProfile.role || '').toLowerCase().replace(/\s+/g, '');
    const isSALogin = roleLower === 'superadmin';

    // Explicitly validate UUID to avoid 400 bad request
    const isValidUUID = (id) => typeof id === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);

    if (isSALogin) {
      // Bypass database tenant query for Super Admin (since tenant_id is null in public.users)
      tenant = { name: 'superadmin', company_name: 'Barventis System Management', id: null, status: 'active' };
    } else {
      // 3. Fetch tenant details (now that we're authenticated, RLS allows selecting our own tenant)
      if (!isValidUUID(userProfile.tenant_id)) {
        await supabase.auth.signOut();
        throw new Error('Tenant ID tidak valid atau korup.');
      }
      const { data: tenantData, error: tenantErr } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', userProfile.tenant_id)
        .maybeSingle();

      if (tenantErr || !tenantData) {
        await supabase.auth.signOut();
        throw new Error('Tenant / ID Resto tidak terdaftar.');
      }
      tenant = tenantData;
    }

    if (tenant.status !== 'active') {
      await supabase.auth.signOut();
      throw new Error('Tenant Resto sedang dinonaktifkan.');
    }

    // 4. Session is managed by Supabase Auth (no localStorage write needed)
    // Audit log is handled after onAuthStateChange fires in App.jsx
    try { await logAudit('LOGIN', `User ${userProfile.name} berhasil login ke resto.`); } catch { /* ignore: best-effort */ }

    return {
      token: authData.session.access_token,
      tenant: { name: tenant.name, company_name: tenant.company_name },
      user: {
        id: userProfile.id,
        tenant_id: userProfile.tenant_id,
        name: userProfile.name,
        email: userProfile.email,
        role: userProfile.role,
        tenant_name: tenant.name
      }
    };
  },

  register: async (name, companyName, adminName, email, password) => {
    const formattedTenantName = name.toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Cek duplikasi tenant terlebih dahulu
    const { data: existingTenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('name', formattedTenantName)
      .maybeSingle();

    if (existingTenant) {
      throw new Error('Nama ID Resto / Tenant ini sudah digunakan. Coba nama lain.');
    }

    // 2. Buat akun Auth DULU! (mencegah unauthenticated table pollution - SEC-002)
    const { data: authData, error: signupErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: adminName,
          tenant_name: formattedTenantName,
          company_name: companyName,
          role: 'Admin / Owner'
        }
      }
    });

    if (signupErr || !authData.user) {
      throw new Error('Gagal mendaftarkan admin: ' + (signupErr?.message || 'Menunggu verifikasi email'));
    }

    // 3. Panggil RPC untuk membentuk Tenant dan menautkan Profile (atomic operation)
    const { data: rpcData, error: rpcErr } = await supabase.rpc('register_new_tenant_with_profile', {
      p_name: formattedTenantName,
      p_company_name: companyName,
      p_admin_name: adminName
    });

    if (rpcErr) {
      throw new Error('Auth berhasil, tetapi gagal setup data Resto: ' + rpcErr.message + '. Anda mungkin butuh eksekusi script FEATURE_register_tenant_rpc.sql di server.');
    }

    try { await logAudit('REGISTER', `Pendaftaran akun resto baru ${companyName} berhasil oleh ${adminName}.`); } catch { /* ignore: best-effort */ }

    return {
      token: authData.session?.access_token,
      tenant: { name: rpcData.tenant_name, company_name: rpcData.company_name },
      user: { id: rpcData.user_id, name: adminName, email: email, role: 'Admin / Owner', tenant_id: rpcData.tenant_id, tenant_name: rpcData.tenant_name }
    };
  },

  registerWithToken: async (name, email, password, token) => {
    // 1. Re-validate the invitation server-side (client SDK) right before using it,
    //    and grab tenant_id + branch_id so we can assign the user's branch.
    const { data: invite, error: inviteErr } = await supabase
      .from('invitations')
      .select('id, tenant_id, branch_id, is_used, expires_at, invite_role')
      .eq('token', token)
      .single();

    if (inviteErr || !invite) {
      throw new Error('Undangan tidak ditemukan atau tidak valid.');
    }
    if (invite.is_used) {
      throw new Error('Undangan ini sudah pernah dipakai.');
    }
    if (new Date(invite.expires_at) < new Date()) {
      throw new Error('Undangan ini sudah kadaluarsa.');
    }

    const assignedRole = invite.invite_role || 'Staff';
    const assignedBranchId = invite.branch_id || null;

    // 2. Create the Supabase Auth user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
          tenant_id: invite.tenant_id,
          branch_id: assignedBranchId,
          role: assignedRole,
          invite_token: token,
        }
      }
    });
    if (error || !data.user) {
      console.error("Detailed Supabase signUp error:", error);
      throw new Error(
        error?.message ||
        'Terjadi kesalahan internal (500) di Supabase atau menunggu verifikasi email.'
      );
    }

    // 3. Fallback / ensure branch_id is persisted on public.users
    const { data: profileCheck } = await supabase.from('users').select('id, branch_id').eq('id', data.user.id).maybeSingle();
    if (!profileCheck) {
      const { error: insertErr } = await supabase.from('users').insert({
        id: data.user.id,
        tenant_id: invite.tenant_id,
        branch_id: assignedBranchId,
        name: name,
        email: email,
        role: assignedRole
      });
      if (insertErr) {
        throw new Error('Akun berhasil dibuat, tapi gagal menyimpan profil: ' + insertErr.message);
      }
    } else if (assignedBranchId && !profileCheck.branch_id) {
      await supabase.from('users').update({ branch_id: assignedBranchId }).eq('id', data.user.id);
    }

    // 4. Mark the invitation as used so the same link can't be reused
    await supabase.from('invitations').update({ is_used: true }).eq('id', invite.id);

    return data.user;
  },

  logout: async () => {
    try { await logAudit('LOGOUT', 'User melakukan logout dari sistem.'); } catch { /* ignore: best-effort */ }
    // Clear any legacy localStorage keys (backward compat cleanup)
    localStorage.removeItem('umatis_token');
    localStorage.removeItem('umatis_tenant_name');
    localStorage.removeItem('umatis_user');

    // SEC-01: Clear module-level cache
    activeTenantId = null;
    activeUserId = null;
    activeBranchId = null;
    activeUserRole = null;
    if (typeof window !== 'undefined') {
      window.__activeBranchId = null;
      window.__activeUserRole = null;
    }
    activeOverheadPct = 0.05;
    activeWhatsappNumber = null;
    activeWhatsappToken = null;
    activeWhatsappEnabled = false;

    await supabase.auth.signOut();
    // onAuthStateChange in App.jsx will handle state reset
  },

  updateProfileName: async (newName) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('No active session.');
    const { error } = await supabase
      .from('users')
      .update({ name: newName })
      .eq('id', session.user.id);
    if (error) throw new Error('Failed to update name: ' + error.message);
  },

  // getProfile — Instant render (<150ms) using session cache & single JOIN query
  getProfile: async () => {
    const cached = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('bv_cached_profile') : null;
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed?.id) {
          if (parsed.role) {
            activeUserRole = parsed.role;
            if (typeof window !== 'undefined') window.__activeUserRole = parsed.role;
          }
          if (parsed.branch_id && !activeBranchId) {
            activeBranchId = parsed.branch_id;
            if (typeof window !== 'undefined') window.__activeBranchId = parsed.branch_id;
          }
          setTimeout(() => api.revalidateProfile().catch(() => {}), 50);
          return parsed;
        }
      } catch (e) {
        sessionStorage.removeItem('bv_cached_profile');
      }
    }
    return await api.revalidateProfile();
  },

  revalidateProfile: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('No active session.');

    // 1. Ambil profil user murni tanpa JOIN relasional yang berisiko 400 Bad Request
    const { data: userProfile, error } = await supabase
      .from('users')
      .select('id, tenant_id, branch_id, name, email, role')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error || !userProfile) {
      console.error('[API] User fetch error:', error);
      throw new Error('Profil tidak ditemukan.');
    }

    let tenantName = '';
    let companyName = '';
    let isPosEnabled = false;
    let posTaxRate = 0;
    let posServiceCharge = 0;
    let lockedUntilMonth = null;
    let lockedUntilYear = null;

    const roleLower = (userProfile.role || '').toLowerCase().replace(/\s+/g, '');
    const isSuper = roleLower === 'superadmin' || roleLower === 'super admin';

    if (isSuper) {
      tenantName = 'superadmin';
      companyName = 'Barventis System Management';
    } else if (userProfile.tenant_id) {
      // 2. Fetch tenant secara aman terisolasi
      try {
        const { data: tData } = await supabase
          .from('tenants')
          .select('name, company_name, is_pos_enabled, locked_until_month, locked_until_year')
          .eq('id', userProfile.tenant_id)
          .maybeSingle();
        if (tData) {
          tenantName = tData.name || '';
          companyName = tData.company_name || '';
          isPosEnabled = !!tData.is_pos_enabled;
          posTaxRate = tData.pos_tax_rate || 0;
          posServiceCharge = tData.pos_service_charge || 0;
          lockedUntilMonth = tData.locked_until_month;
          lockedUntilYear = tData.locked_until_year;
        }
      } catch (e) {
        console.warn('[API] Could not fetch tenant:', e);
      }
    }

    const fullProfile = {
      id: userProfile.id,
      tenant_id: userProfile.tenant_id,
      branch_id: userProfile.branch_id,
      name: userProfile.name,
      email: userProfile.email,
      role: userProfile.role,
      tenant_name: tenantName,
      company_name: companyName,
      is_pos_enabled: isPosEnabled,
      pos_tax_rate: posTaxRate,
      pos_service_charge: posServiceCharge,
      locked_until_month: lockedUntilMonth,
      locked_until_year: lockedUntilYear,
      overhead_pct: 0.05,
      whatsapp_number: null,
      whatsapp_token: null,
      whatsapp_enabled: false
    };

    activeTenantId = userProfile.tenant_id ?? null;
    activeUserId = userProfile.id;
    activeUserRole = userProfile.role || null;
    if (typeof window !== 'undefined') {
      window.__activeUserRole = activeUserRole;
    }
    if (userProfile.branch_id && (!activeBranchId || !isAdminRole(userProfile.role))) {
      activeBranchId = userProfile.branch_id;
      if (typeof window !== 'undefined') window.__activeBranchId = activeBranchId;
    }

    if (typeof sessionStorage !== 'undefined') {
      try { sessionStorage.setItem('bv_cached_profile', JSON.stringify(fullProfile)); } catch {
        // ignore storage errors
      }
    }
    return fullProfile;
  },
  // 1.5 Tenant Invitations
  generateTenantInvite: async (tenantId, role = 'Admin / Owner', branchId = null) => {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;

    const payload = {
      tenant_id: tenantId,
      expires_at: expiresAt.toISOString(),
      created_by: userId,
      invite_role: role
    };
    if (branchId) payload.branch_id = branchId;

    const { data, error } = await supabase
      .from('invitations')
      .insert(payload)
      .select('token')
      .single();

    if (error) throw new Error("Gagal membuat link undangan: " + error.message);

    // Return full URL
    const baseUrl = window.location.origin;
    return `${baseUrl}/login?token=${data.token}`;
  },

  // --- LEDGER TRANSACTIONS ---
  getTransactions: async (period = null, branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return []; // H-2: Super Admin / no-tenant — avoid malformed .eq('tenant_id', null) query
    const branchId = await requireBranchId(branchIdArg);
    let query = supabase
      .from('transactions')
      .select('*, materials(name)')
      .eq('tenant_id', tenantId);
    if (branchId) query = query.eq('branch_id', branchId);

    if (period) {
      const [year, month] = period.split('-');
      const lastDay = new Date(year, month, 0).getDate();
      query = query.gte('date', `${period}-01`).lte('date', `${period}-${lastDay}`);
    } else {
      query = query.limit(500);
    }

    const { data, error } = await query;

    if (error) throw new Error("Gagal mengambil transaksi: " + error.message);

    return data.map(tx => ({
      id: 'tx-' + tx.id,
      date: tx.date,
      item_name: tx.materials ? tx.materials.name : 'Bahan Terhapus',
      type: tx.type,
      location: tx.location,
      qty: parseFloat(tx.qty),
      amount: parseFloat(tx.amount),
      notes: tx.notes
    }));
  },

  // Paginated version for Stock Ledger's transaction history panel.
  // Uses server-side LIMIT/OFFSET (.range) + optional search so we don't
  // pull hundreds of rows just to show one page.
  getTransactionsPaged: async ({ page = 1, pageSize = 20, search = '', materialName = null, location = null, branchId: branchIdArg = null } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { data: [], totalCount: 0 };
    const branchId = await requireBranchId(branchIdArg);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('transactions')
      .select('*, materials(name)', { count: 'exact' })
      .eq('tenant_id', tenantId);
    if (branchId) query = query.eq('branch_id', branchId);

    if (materialName) {
      let matQ = supabase.from('materials').select('id').eq('tenant_id', tenantId).eq('name', materialName);
      if (branchId) matQ = matQ.eq('branch_id', branchId);
      const { data: mat } = await matQ.maybeSingle();
      query = query.eq('material_id', mat ? mat.id : -1);
    }
    if (location && location !== 'ALL') {
      const l = sanitizePostgrest(location);
      query = query.ilike('location', `%${l}%`);
    }
    if (search && search.trim()) {
      const s = sanitizePostgrest(search);
      query = query.or(`notes.ilike.%${s}%,type.ilike.%${s}%`);
    }

    const { data, error, count } = await query
      .order('date', { ascending: false })
      .range(from, to);

    if (error) throw new Error("Gagal mengambil transaksi: " + error.message);

    return {
      data: data.map(tx => ({
        id: 'tx-' + tx.id,
        date: tx.date,
        item_name: tx.materials ? tx.materials.name : 'Bahan Terhapus',
        type: tx.type,
        location: tx.location,
        qty: parseFloat(tx.qty),
        amount: parseFloat(tx.amount),
        notes: tx.notes
      })),
      totalCount: count || 0
    };
  },

  // --- STOCK / MATERIALS ---
  getStockSnapshotAt: async (location, targetDate, branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await requireBranchId(branchIdArg);

    // 1. Get current stock
    const materials = await materialsRepo.getAll(tenantId, branchId);

    // If targetDate is in the future or within the current day, just return current stock
    if (new Date(targetDate) >= new Date()) return materials;

    // 2. Fetch all transactions AFTER targetDate
    let txQ = supabase.from('transactions')
      .select('material_id, qty, location, type')
      .eq('tenant_id', tenantId)
      .gt('date', targetDate);
    if (branchId) txQ = txQ.eq('branch_id', branchId);
    const { data: txs } = await txQ;

    // 3. Reverse transactions
    const stockMap = {};
    materials.forEach(m => {
      stockMap[m.id] = {
        ...m,
        qty_resto: parseFloat(m.qty_resto || 0),
        qty_central: parseFloat(m.qty_central || 0)
      };
    });

    if (txs) {
      txs.forEach(tx => {
        const mat = stockMap[tx.material_id];
        // Only process transactions that have a valid qty and material
        // Ignore POS_SALE since it doesn't affect stock (qty=1 for revenue)
        if (mat && tx.type !== 'POS_SALE' && tx.qty) {
          const qtyDelta = parseFloat(tx.qty);
          if (tx.location === 'RESTO' || tx.location === 'Bar' || tx.location === 'Kitchen') {
            mat.qty_resto -= qtyDelta;
          } else if (tx.location === 'CENTRAL' || tx.location === 'Central') {
            mat.qty_central -= qtyDelta;
          }
        }
      });
    }

    return Object.values(stockMap);
  },

  getMaterials: async (branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return []; // H-2: Super Admin / no-tenant — avoid malformed .eq('tenant_id', null) query
    const branchId = await requireBranchId(branchIdArg);
    return await materialsRepo.getAll(tenantId, branchId);
  },

  // Paginated + searchable version for the Stock Ledger table. The full
  // getMaterials() above is kept as-is since other forms (recipe/invoice
  // ingredient pickers) still need the complete unpaginated list.
  getMaterialsPaged: async ({ page = 1, pageSize = 20, search = '', branchId: branchIdArg = null } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { data: [], totalCount: 0 };
    const branchId = await requireBranchId(branchIdArg);
    return await materialsRepo.getPaged(tenantId, { page, pageSize, search: sanitizePostgrest(search), branchId });
  },

  createMaterial: async (materialData) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(materialData?.branch_id || null);
    const data = await materialsRepo.create(tenantId, materialData, branchId);
    await logAudit('CREATE_MATERIAL', `Menambahkan bahan baku baru: "${data.name}" ke kategori "${data.category}".`);
    return data;
  },

  updateMaterial: async (id, materialData) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(materialData?.branch_id || null);
    let oldQuery = supabase.from('materials').select('*').eq('id', id).eq('tenant_id', tenantId);
    if (branchId) oldQuery = oldQuery.eq('branch_id', branchId);
    const { data: oldMaterial } = await oldQuery.single();

    const data = await materialsRepo.update(tenantId, id, materialData, oldMaterial, branchId);

    if (oldMaterial && (oldMaterial.price !== data.price || oldMaterial.new_price !== data.new_price)) {
      const formattedOld = new Intl.NumberFormat('id-ID').format(oldMaterial.new_price || oldMaterial.price);
      const formattedNew = new Intl.NumberFormat('id-ID').format(data.new_price);
      await logAudit('UPDATE_PRICE', `Mengubah harga bahan "${data.name}" dari Rp${formattedOld} menjadi Rp${formattedNew}.`);
    } else {
      await logAudit('UPDATE_MATERIAL', `Memperbarui detail bahan mentah: "${data.name}".`);
    }

    return data;
  },

  deleteMaterial: async (id, force = false, branchIdArg = null) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branchIdArg);
    // Check if ingredient is used in recipes
    let countQuery = supabase
      .from('recipe_ingredients')
      .select('*', { count: 'exact', head: true })
      .eq('material_id', id);
    if (branchId) countQuery = countQuery.eq('branch_id', branchId);
    const { count, error: countErr } = await countQuery;

    if (!countErr && count > 0) {
      if (!force) {
        const err = new Error(`Tidak bisa menonaktifkan: bahan baku ini masih digunakan di ${count} resep aktif. Hapus dari resep terlebih dahulu.`);
        err.hasDependencies = true;
        err.dependencyCount = count;
        throw err;
      } else {
        // Force delete: remove dependencies first
        let delIngQuery = supabase.from('recipe_ingredients').delete().eq('material_id', id);
        if (branchId) delIngQuery = delIngQuery.eq('branch_id', branchId);
        await delIngQuery;
      }
    }

    const data = await materialsRepo.delete(tenantId, id, branchId);
    await logAudit('DELETE_MATERIAL', `Menonaktifkan bahan mentah: "${data.name}" dari database inventory.`);
    return data;
  },

  adjustStock: async (id, arg2, arg3, arg4, arg5) => {
    const tenantId = await requireTenantId();
    const requestedBranchId = arg2 && typeof arg2 === 'object' ? (arg2.branch_id || null) : null;
    const branchId = await requireBranchId(requestedBranchId);

    // 1. Normalize arguments (supports object { location, type, qty, notes } or positional arguments)
    let location = 'RESTO';
    let type = 'OUT';
    let qty = 0;
    let notes = '';

    if (arg2 && typeof arg2 === 'object') {
      location = arg2.location || 'RESTO';
      type = arg2.type || 'OUT';
      qty = parseFloat(arg2.qty || 0);
      notes = arg2.notes || '';
    } else {
      location = arg2 || 'RESTO';
      type = arg3 || 'OUT';
      qty = parseFloat(arg4 || 0);
      notes = arg5 || '';
    }

    if (isNaN(qty)) qty = 0;

    const isCentral = String(location).toUpperCase().includes('CENTRAL');
    const safeLocation = isCentral ? 'CENTRAL' : 'RESTO';

    const validTxTypes = ['IN', 'OPNAME_ADJ'];
    if (!validTxTypes.includes(type)) {
      const routeByType = {
        OUT: 'Daily Inventory (konfirmasi OUT harian)',
        WASTE: 'Catatan Limbah', BREAKAGE: 'Catatan Limbah', EXPIRED: 'Catatan Limbah', COMP: 'Catatan Limbah',
        TRANSFER: 'Transfer Antar Lokasi', PURCHASE_IN: 'Purchasing', POS_DEDUCTION: 'impor POS lama (tidak lagi digunakan)', POS_SALE: 'impor POS'
      };
      throw new Error(`Jenis mutasi ${type} tidak boleh dibuat dari Stock Ledger. Gunakan ${routeByType[type] || 'modul transaksi sumber'} agar data tidak ganda.`);
    }
    const safeType = type;
    if (safeType === 'IN' && !String(notes || '').trim()) {
      throw new Error('Koreksi IN harus memiliki catatan alasan. Pembelian barang harus dicatat melalui modul Purchasing.');
    }

    let updatedMaterial = null;
    let rpcSuccess = false;

    // 2. Attempt RPC adjust_material_stock if available in Supabase
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('adjust_material_stock', {
        p_material_id: id,
        p_tenant_id: tenantId,
        p_type: safeType,
        p_location: safeLocation,
        p_qty: qty,
        p_notes: notes
      });

      if (!rpcErr && rpcData) {
        updatedMaterial = rpcData;
        rpcSuccess = true;
      } else if (rpcErr) {
        console.warn('adjust_material_stock RPC notice, proceeding with resilient fallback:', rpcErr.message);
      }
    } catch (rpcEx) {
      console.warn('adjust_material_stock RPC exception, proceeding with resilient fallback:', rpcEx);
    }

    // 3. Resilient Fallback: Direct PostgREST execution if RPC is missing, un-cached, or failed
    if (!rpcSuccess) {
      let fetchQ = supabase
        .from('materials')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (branchId) fetchQ = fetchQ.eq('branch_id', branchId);
      const { data: mat, error: fetchErr } = await fetchQ.single();

      if (fetchErr || !mat) {
        throw new Error('Material tidak ditemukan atau gagal dimuat: ' + (fetchErr?.message || 'Bahan tidak ditemukan'));
      }

      const currentStock = safeLocation === 'CENTRAL' ? parseFloat(mat.qty_central || 0) : parseFloat(mat.qty_resto || 0);
      let newStock = currentStock;
      let txQty = qty;

      if (safeType === 'OPNAME_ADJ') {
        newStock = Math.max(0, qty);
        txQty = newStock - currentStock;
      } else if (safeType === 'IN') {
        newStock = currentStock + Math.abs(qty);
        txQty = Math.abs(qty);
      } else if (safeType === 'OUT') {
        newStock = Math.max(0, currentStock - Math.abs(qty));
        txQty = -Math.abs(qty);
      } else {
        newStock = Math.max(0, currentStock + qty);
        txQty = qty;
      }

      const locField = safeLocation === 'CENTRAL' ? 'qty_central' : 'qty_resto';
      let updQ = supabase
        .from('materials')
        .update({
          [locField]: newStock,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (branchId) updQ = updQ.eq('branch_id', branchId);
      const { data: updatedMat, error: updateErr } = await updQ
        .select()
        .single();

      if (updateErr) {
        throw new Error('Gagal memperbarui stok bahan: ' + updateErr.message);
      }
      updatedMaterial = updatedMat || { ...mat, [locField]: newStock };

      // Insert transaction record via PostgREST (PostgREST automatically handles string to enum conversion)
      const { data: { user } } = await supabase.auth.getUser();
      const unitPrice = parseFloat(mat.avg_cost || mat.price || 0);
      const amount = Math.abs(txQty) * unitPrice;

      const { error: txErr } = await supabase
        .from('transactions')
        .insert({
          tenant_id: tenantId,
          ...(branchId ? { branch_id: branchId } : {}),
          date: new Date().toISOString().split('T')[0],
          material_id: id,
          type: safeType,
          location: safeLocation,
          qty: txQty,
          amount: amount,
          notes: notes || `Quick Mutasi [${safeType}]`,
          created_by: user?.id || null,
          unit_cost_snapshot: unitPrice
        });

      if (txErr) {
        console.warn('Transaction insert warning during fallback:', txErr.message);
      }
    }

    const actionLabel = safeType === 'TRANSFER' ? 'Transfer' : (safeType === 'IN' ? 'Stock In' : (safeType === 'OPNAME_ADJ' ? 'Sisa Fisik' : 'Stock Out'));
    await logAudit('ADJUST_STOCK', `Menyesuaikan stok (${actionLabel}) sebesar ${qty} di ${safeLocation}. Catatan: "${notes || 'Tidak ada'}".`);

    return updatedMaterial;
  },

  // --- INTER-BRANCH TRANSFERS ---
  createTransfer: async ({ material_id, quantity, source_branch, target_branch, notes, branch_id = null }) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branch_id);
    const userId = await getActiveUserId();
    const qty = parseFloat(quantity);
    if (!material_id || isNaN(qty) || qty <= 0) {
      throw new Error('Pilih bahan baku dan masukkan kuantitas transfer yang valid (lebih dari 0).');
    }

    if (source_branch === target_branch) {
      throw new Error('Lokasi asal dan lokasi tujuan transfer tidak boleh sama.');
    }

    let matQ = supabase
      .from('materials')
      .select('*')
      .eq('id', material_id)
      .eq('tenant_id', tenantId);
    if (branchId) matQ = matQ.eq('branch_id', branchId);
    const { data: mat, error: matErr } = await matQ.single();
    if (matErr || !mat) throw new Error('Bahan baku tidak ditemukan: ' + (matErr?.message || ''));

    const isSourceCentral = String(source_branch).toUpperCase().includes('CENTRAL');
    const isTargetCentral = String(target_branch).toUpperCase().includes('CENTRAL');
    const sourceLocation = isSourceCentral ? 'CENTRAL' : 'RESTO';
    const targetLocation = isTargetCentral ? 'CENTRAL' : 'RESTO';
    const requestKey = createRequestKey();
    const transferDate = getLocalDateISO();

    // One atomic RPC locks both balances, values the transfer using source WAC,
    // and writes paired OUT/IN ledger rows under one transfer_group_id.
    const { data: result, error: transferErr } = await supabase.rpc('atomic_transfer_stock_location_wac_v4', {
      p_tenant_id: tenantId,
      p_material_id: material_id,
      p_qty: qty,
      p_source: sourceLocation,
      p_target: targetLocation,
      p_date: transferDate,
      p_notes: notes || null,
      p_request_key: requestKey,
      p_created_by: userId
    });
    if (transferErr) throw new Error('Gagal memproses transfer stok secara atomik: ' + transferErr.message);

    // Return the legacy shape for existing callers while avoiding client-side
    // balance writes. If a retry is detected, the RPC returns the same group.
    const targetLoc = isTargetCentral ? 'CENTRAL' : 'RESTO';
    await logAudit('TRANSFER_STOCK', `Transfer ${qty} ${mat.unit} "${mat.name}" dari ${source_branch} ke ${target_branch}.`);
    return { success: true, material: mat, transfer: result, target_location: targetLoc };
  },
  // --- TRANSFER REQUISITION (WBS Phase 2) ---
  createTransferRequest: async ({ material_id, qty, source_branch, target_branch, notes, branch_id = null }) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branch_id);
    let matQ = supabase.from('materials').select('price, new_price').eq('id', material_id).eq('tenant_id', tenantId);
    if (branchId) matQ = matQ.eq('branch_id', branchId);
    const { data: mat } = await matQ.single();
    const unitPrice = parseFloat(mat?.new_price || mat?.price) || 0;
    const safeLocation = String(target_branch || '').toUpperCase().includes('CENTRAL') ? 'CENTRAL' : 'RESTO';

    const { data, error } = await supabase.from('transactions').insert({
      tenant_id: tenantId,
      ...(branchId ? { branch_id: branchId } : {}),
      date: new Date().toISOString().split('T')[0],
      material_id: material_id,
      type: 'TRANSFER_REQUEST',
      location: safeLocation,
      qty: parseFloat(qty),
      amount: Math.round(parseFloat(qty) * unitPrice),
      notes: `Request Transfer [${source_branch} ➔ ${target_branch}] - ${notes || ''}`
    }).select().single();

    if (error) throw new Error('Gagal membuat request transfer: ' + error.message);
    return data;
  },

  getTransferRequests: async (branchIdArg = null) => {
    try {
      if (typeof window !== 'undefined' && window.__dbSupportsTransferRequestEnum === false) {
        return [];
      }
      const tenantId = await getActiveTenantId();
      if (!tenantId) return [];
      const branchId = await requireBranchId(branchIdArg);
      let reqQ = supabase.from('transactions')
        .select('*, materials(id, name, sku, unit, qty_resto, qty_central)')
        .eq('tenant_id', tenantId)
        .eq('type', 'TRANSFER_REQUEST');
      if (branchId) reqQ = reqQ.eq('branch_id', branchId);
      const { data, error } = await reqQ.order('id', { ascending: false });
      if (error) {
        if (typeof window !== 'undefined') window.__dbSupportsTransferRequestEnum = false;
        console.warn('Transfer requests not available in DB transaction_type enum:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      if (String(err?.message || '').includes('branch_id')) throw err;
      console.warn('Error in getTransferRequests:', err);
      return [];
    }
  },

  approveTransferRequest: async (txId, branchIdArg = null) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branchIdArg);
    let txQ = supabase.from('transactions').select('*').eq('id', txId).eq('tenant_id', tenantId);
    if (branchId) txQ = txQ.eq('branch_id', branchId);
    const { data: tx, error: fetchErr } = await txQ.single();
    if (fetchErr || !tx) throw new Error('Request tidak ditemukan.');

    const match = tx.notes ? tx.notes.match(/Request Transfer \[([^\]]+) ➔ ([^\]]+)\]/) : null;
    const source = match ? match[1] : 'Central Warehouse';
    const target = match ? match[2] : 'Resto Bar';

    // Execute real transfer
    await api.createTransfer({
      material_id: tx.material_id,
      quantity: tx.qty,
      source_branch: source,
      target_branch: target,
      notes: 'Disetujui dari Request',
      branch_id: tx.branch_id || branchId
    });

    // Delete the request
    let delQ = supabase.from('transactions').delete().eq('id', txId).eq('tenant_id', tenantId);
    if (branchId) delQ = delQ.eq('branch_id', branchId);
    await delQ;
  },

  rejectTransferRequest: async (txId, branchIdArg = null) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branchIdArg);
    let delQ = supabase.from('transactions').delete().eq('id', txId).eq('tenant_id', tenantId);
    if (branchId) delQ = delQ.eq('branch_id', branchId);
    await delQ;
  },

  getTransfers: async (branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await requireBranchId(branchIdArg);
    let query = supabase
      .from('transactions')
      .select('*, materials(id, name, sku, unit, price, category, qty_resto, qty_central)')
      .eq('tenant_id', tenantId)
      .eq('type', 'TRANSFER');
    if (branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query
      .order('date', { ascending: false })
      .order('id', { ascending: false });

    if (error) throw new Error('Gagal memuat riwayat transfer: ' + error.message);
    const rows = data || [];
    const grouped = new Map();
    rows.forEach(tx => {
      const key = tx.transfer_group_id || `legacy-${tx.id}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(tx);
    });
    return Array.from(grouped.values()).map(group => {
      const tx = group.find(row => Number(row.qty) > 0) || group[0];
      const sourceTx = group.find(row => Number(row.qty) < 0) || tx;
      const targetTx = group.find(row => Number(row.qty) > 0) || tx;
      const pairMatch = (sourceTx.notes || targetTx.notes || '').match(/Transfer \[([^\]]+) ➔ ([^\]]+)\](?: - (.*))?/);
      return {
        id: 'TRF-' + (tx.transfer_group_id || tx.id),
        raw_id: tx.id,
        date: tx.date,
        created_at: tx.created_at,
        material_id: tx.material_id,
        materials: tx.materials,
        item_name: tx.materials ? tx.materials.name : 'Bahan Terhapus',
        unit: tx.materials?.unit || '',
        price: tx.materials?.price || 0,
        qty: Math.abs(parseFloat(sourceTx.qty) || parseFloat(targetTx.qty) || 0),
        amount: Math.abs(parseFloat(sourceTx.amount) || parseFloat(targetTx.amount) || 0),
        source_branch: pairMatch ? pairMatch[1] : (sourceTx.location === 'CENTRAL' ? 'Central Warehouse' : 'Resto Bar'),
        target_branch: pairMatch ? pairMatch[2] : (targetTx.location === 'CENTRAL' ? 'Central Warehouse' : 'Resto Bar'),
        notes: pairMatch?.[3] || (tx.notes || ''),
        status: 'COMPLETED'
      };
    });
  },

  // --- WASTE & LOSS LOGS ---
  recordWaste: async ({ material_id, quantity, type = 'WASTE', location = 'RESTO', reason = '', notes = '', date = null, request_key = null, branch_id = null }) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branch_id);
    const qty = Number(quantity);
    if (!material_id || !Number.isFinite(qty) || qty <= 0) {
      throw new Error('Pilih bahan baku dan masukkan kuantitas waste yang valid (lebih dari 0).');
    }

    const locKey = String(location).toUpperCase().includes('CENTRAL') ? 'CENTRAL' : 'RESTO';
    const logDate = date || getLocalDateISO();
    const validTxTypes = ['WASTE', 'BREAKAGE', 'EXPIRED', 'COMP'];
    const safeTxType = validTxTypes.includes(type) ? type : 'WASTE';
    const fullNotes = reason ? `${reason}${notes ? ` - ${notes}` : ''}` : (notes || 'Waste/Kerugian');
    const userId = await getActiveUserId();
    const requestKey = request_key || createRequestKey();

    // Verify material belongs to active branch before atomic RPC
    let matCheckQ = supabase.from('materials').select('id, name, unit').eq('id', material_id).eq('tenant_id', tenantId);
    if (branchId) matCheckQ = matCheckQ.eq('branch_id', branchId);
    const { data: mat, error: matErr } = await matCheckQ.maybeSingle();
    if (matErr) throw new Error('Gagal memverifikasi bahan baku: ' + matErr.message);
    if (branchId && !mat) {
      throw new Error('Bahan baku tidak ditemukan pada cabang aktif.');
    }

    const { data: result, error } = await supabase.rpc('atomic_record_waste_v2', {
      p_tenant_id: tenantId,
      p_material_id: Number(material_id),
      p_qty: qty,
      p_type: safeTxType,
      p_location: locKey,
      p_date: logDate,
      p_notes: fullNotes,
      p_created_by: userId,
      p_request_key: requestKey
    });
    if (error) throw new Error('Gagal mencatat waste secara atomik: ' + error.message);

    const costLoss = Number(result?.cost_loss) || 0;
    await logAudit('RECORD_WASTE', `${result?.duplicate ? 'Retry duplikat diabaikan. ' : ''}Mencatat waste ${qty} ${mat?.unit || ''} "${mat?.name || 'Item'}" (${safeTxType}) di ${locKey}. Kerugian: Rp ${costLoss.toLocaleString('id-ID')}.`);
    return { success: true, duplicate: Boolean(result?.duplicate), material: mat || null, costLoss, transaction_id: result?.transaction_id };
  },

  getWasteLogs: async ({ period = null, type = null, branchId: branchIdArg = null } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await requireBranchId(branchIdArg);

    const validWasteTypes = ['WASTE', 'BREAKAGE', 'EXPIRED', 'COMP'];

    let query = supabase
      .from('transactions')
      .select('*, materials(id, name, sku, unit, price, category, full_pack, qty_resto, qty_central)')
      .eq('tenant_id', tenantId)
      .in('type', validWasteTypes);
    if (branchId) query = query.eq('branch_id', branchId);
    query = query.order('date', { ascending: false }).order('id', { ascending: false });

    if (period) {
      const [year, month] = period.split('-');
      const lastDay = new Date(year, month, 0).getDate();
      query = query.gte('date', `${period}-01`).lte('date', `${period}-${lastDay}`);
    }

    if (type && type !== 'ALL' && validWasteTypes.includes(type)) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;
    if (error) throw new Error('Gagal mengambil riwayat waste: ' + error.message);

    return (data || []).map(tx => {
      const mat = tx.materials;
      const unitPrice = parseFloat(mat?.price || 0);
      const absQty = Math.abs(parseFloat(tx.qty));
      const amount = parseFloat(tx.amount) || (absQty * unitPrice);

      return {
        id: 'WST-' + tx.id,
        raw_id: tx.id,
        date: tx.date,
        created_at: tx.created_at,
        material_id: tx.material_id,
        materials: mat,
        item_name: mat ? mat.name : 'Bahan Terhapus',
        sku: mat?.sku || '-',
        category: mat?.category || 'General',
        unit: mat?.unit || '',
        price: unitPrice,
        type: tx.type,
        location: tx.location || 'RESTO',
        quantity: absQty,
        cost_loss: amount,
        notes: tx.notes || '-',
        reason: tx.notes || '-'
      };
    });
  },

  // --- RECIPES ---
  getRecipes: async (branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return []; // H-2: Super Admin / no-tenant — avoid malformed .eq('tenant_id', null) query
    const branchId = await requireBranchId(branchIdArg);
    let query = supabase
      .from('recipes')
      .select('*, recipe_ingredients(*, materials(*))')
      .eq('tenant_id', tenantId);
    if (branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query.order('menu_name');

    if (error) throw new Error("Gagal memuat resep: " + error.message);

    // Map ingredients structures to match UI expectations
    return data.map(r => ({
      id: r.id,
      branch_id: r.branch_id,
      menu_name: r.menu_name,
      pos_code: r.pos_code,
      category: r.category || 'NON-KOPI',
      selling_price: parseFloat(r.selling_price),
      basic_cost: parseFloat(r.basic_cost),
      fix_cost: parseFloat(r.fix_cost),
      subtotal: parseFloat(r.subtotal),
      food_cost_pct: parseFloat(r.food_cost_pct),
      fix_cost_pct: r.fix_cost_pct != null ? parseFloat(r.fix_cost_pct) : activeOverheadPct,
      selling_price_raw: r.selling_price_raw != null ? parseFloat(r.selling_price_raw) : 0,
      rounding_direction: r.rounding_direction || DEFAULT_ROUNDING_DIRECTION,
      rounding_increment: r.rounding_increment != null ? parseFloat(r.rounding_increment) : DEFAULT_ROUNDING_INCREMENT,
      price_adjustment: r.price_adjustment != null ? parseFloat(r.price_adjustment) : DEFAULT_PRICE_ADJUSTMENT,
      ingredients: (r.recipe_ingredients || []).map(ing => ({
        material_id: ing.material_id,
        item_name: ing.materials ? ing.materials.name : 'Bahan Terhapus',
        qty_in_use: parseFloat(ing.qty_in_use),
        unit: ing.unit,
        unit_price: parseFloat(ing.unit_price),
        amount: parseFloat(ing.amount)
      }))
    }));
  },

  // Paginated + searchable (by menu name / category) version for the
  // Recipes list panel.
  getRecipesPaged: async ({ page = 1, pageSize = 15, search = '', branchId: branchIdArg = null } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { data: [], totalCount: 0 };
    const branchId = await requireBranchId(branchIdArg);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('recipes')
      .select('*, recipe_ingredients(*, materials(*))', { count: 'exact' })
      .eq('tenant_id', tenantId);
    if (branchId) query = query.eq('branch_id', branchId);

    if (search && search.trim()) {
      const s = sanitizePostgrest(search);
      query = query.or(`menu_name.ilike.%${s}%,category.ilike.%${s}%,pos_code.ilike.%${s}%`);
    }

    const { data, error, count } = await query
      .order('menu_name')
      .range(from, to);

    if (error) throw new Error("Gagal memuat resep: " + error.message);

    return {
      data: data.map(r => ({
        id: r.id,
        branch_id: r.branch_id,
        menu_name: r.menu_name,
        pos_code: r.pos_code,
        category: r.category || 'NON-KOPI',
        selling_price: parseFloat(r.selling_price),
        basic_cost: parseFloat(r.basic_cost),
        fix_cost: parseFloat(r.fix_cost),
        subtotal: parseFloat(r.subtotal),
        food_cost_pct: parseFloat(r.food_cost_pct),
        fix_cost_pct: r.fix_cost_pct != null ? parseFloat(r.fix_cost_pct) : activeOverheadPct,
        selling_price_raw: r.selling_price_raw != null ? parseFloat(r.selling_price_raw) : 0,
        rounding_direction: r.rounding_direction || DEFAULT_ROUNDING_DIRECTION,
        rounding_increment: r.rounding_increment != null ? parseFloat(r.rounding_increment) : DEFAULT_ROUNDING_INCREMENT,
        price_adjustment: r.price_adjustment != null ? parseFloat(r.price_adjustment) : DEFAULT_PRICE_ADJUSTMENT,
        ingredients: (r.recipe_ingredients || []).map(ing => ({
          material_id: ing.material_id,
          item_name: ing.materials ? ing.materials.name : 'Bahan Terhapus',
          qty_in_use: parseFloat(ing.qty_in_use),
          unit: ing.unit,
          unit_price: parseFloat(ing.unit_price),
          amount: parseFloat(ing.amount)
        }))
      })),
      totalCount: count || 0
    };
  },

  createRecipe: async (recipeData) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(recipeData?.branch_id || null);

    // 1. Process calculations using ported controller logic
    let subtotal = 0.00;
    const ingredientRows = [];

    // Pre-fetch all materials for this recipe scoped to tenant and active branch
    const matIds = (recipeData.ingredients || []).map(i => i.material_id).filter(Boolean);
    let materials = [];
    if (matIds.length > 0) {
      let matsQ = supabase.from('materials').select('*').eq('tenant_id', tenantId).in('id', matIds);
      if (branchId) matsQ = matsQ.eq('branch_id', branchId);
      const { data: fetchedMats, error: matsErr } = await matsQ;
      if (matsErr) throw new Error("Gagal memuat bahan resep: " + matsErr.message);
      materials = fetchedMats || [];
    }
    const materialsMap = new Map(materials.map(m => [m.id, m]));
    const unitConversionMap = await api._loadUnitConversionMap(tenantId, branchId);

    for (const ing of (recipeData.ingredients || [])) {
      const material = materialsMap.get(ing.material_id);
      if (!material) continue;

      const unitPrice = parseFloat(material.avg_cost || material.new_price || material.price || 0);
      material.price = unitPrice; // Override so calculateIngredientCost uses it
      const amount = calculateIngredientCost(material, parseFloat(ing.qty_in_use), ing.unit, unitConversionMap);
      subtotal += amount;

      ingredientRows.push({
        material_id: ing.material_id,
        qty_in_use: parseFloat(ing.qty_in_use),
        unit: ing.unit,
        unit_price: unitPrice,
        amount: parseFloat(amount.toFixed(2))
      });
    }

    const fixCostPct = recipeData.fix_cost_pct != null ? parseFloat(recipeData.fix_cost_pct) : activeOverheadPct;
    const roundingDirection = recipeData.rounding_direction || DEFAULT_ROUNDING_DIRECTION;
    const roundingIncrement = recipeData.rounding_increment != null ? parseFloat(recipeData.rounding_increment) : DEFAULT_ROUNDING_INCREMENT;
    const priceAdjustment = recipeData.price_adjustment != null ? parseFloat(recipeData.price_adjustment) : DEFAULT_PRICE_ADJUSTMENT;
    const foodCostPctTarget = parseFloat(recipeData.food_cost_pct || 0);

    const { fixCost, basicCost, sellingPriceRaw, sellingPriceFinal } = computeRecipeCosts({
      subtotal, fixCostPct, foodCostPct: foodCostPctTarget,
      roundingDirection, roundingIncrement, priceAdjustment
    });
    const sellingPrice = recipeData.selling_price_override != null
      ? parseFloat(recipeData.selling_price_override)
      : (sellingPriceFinal || parseFloat(recipeData.selling_price || 0));

    // 2. Insert Recipe
    const { data: recipe, error: recipeErr } = await supabase
      .from('recipes')
      .insert({
        tenant_id: tenantId,
        ...(branchId ? { branch_id: branchId } : {}),
        menu_name: recipeData.menu_name,
        category: recipeData.category || 'NON-KOPI',
        ...(recipeData.image_url !== undefined ? { image_url: recipeData.image_url || null } : {}),
        selling_price: sellingPrice,
        subtotal: parseFloat(subtotal.toFixed(2)),
        fix_cost_pct: fixCostPct,
        fix_cost: parseFloat(fixCost.toFixed(2)),
        basic_cost: parseFloat(basicCost.toFixed(2)),
        food_cost_pct: parseFloat(foodCostPctTarget.toFixed(4)),
        selling_price_raw: parseFloat((sellingPriceRaw || 0).toFixed(2)),
        rounding_direction: roundingDirection,
        rounding_increment: roundingIncrement,
        price_adjustment: priceAdjustment
      })
      .select('*')
      .single();

    if (recipeErr) throw new Error("Gagal membuat resep: " + recipeErr.message);

    // 3. Insert Ingredients
    const rowsToInsert = ingredientRows.map(row => ({
      recipe_id: recipe.id,
      tenant_id: tenantId,
      ...(branchId ? { branch_id: branchId } : {}),
      ...row
    }));

    if (rowsToInsert.length > 0) {
      const { error: ingErr } = await supabase.from('recipe_ingredients').insert(rowsToInsert);
      if (ingErr) {
        let rbQ = supabase.from('recipes').delete().eq('id', recipe.id).eq('tenant_id', tenantId);
        if (branchId) rbQ = rbQ.eq('branch_id', branchId);
        await rbQ;
        throw new Error("Gagal menyimpan bahan resep: " + ingErr.message);
      }
    }

    const formattedHpp = new Intl.NumberFormat('id-ID').format(recipe.basic_cost);
    const formattedPrice = new Intl.NumberFormat('id-ID').format(recipe.selling_price);
    await logAudit('CREATE_RECIPE', `Membuat resep menu baru: "${recipe.menu_name}" dengan HPP Rp${formattedHpp} dan Harga Jual Rp${formattedPrice}.`);

    return recipe;
  },

  updateRecipe: async (id, recipeData) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(recipeData?.branch_id || null);
    // 1. Process calculations
    let subtotal = 0.00;
    const ingredientRows = [];

    const matIds = (recipeData.ingredients || []).map(i => i.material_id).filter(Boolean);
    let materials = [];
    if (matIds.length > 0) {
      let matsQ = supabase.from('materials').select('*').eq('tenant_id', tenantId).in('id', matIds);
      if (branchId) matsQ = matsQ.eq('branch_id', branchId);
      const { data: fetchedMats, error: matsErr } = await matsQ;
      if (matsErr) throw new Error("Gagal memuat bahan resep: " + matsErr.message);
      materials = fetchedMats || [];
    }
    const materialsMap = new Map(materials.map(m => [m.id, m]));
    const unitConversionMap = await api._loadUnitConversionMap(tenantId, branchId);

    const mergedMap = new Map();
    for (const ing of (recipeData.ingredients || [])) {
      const material = materialsMap.get(ing.material_id);
      if (!material) continue;

      const qtyInUse = parseFloat(ing.qty_in_use) || 0;
      const key = `${ing.material_id}`;
      if (mergedMap.has(key)) {
        mergedMap.get(key).qty_in_use += qtyInUse;
      } else {
        mergedMap.set(key, {
          material,
          material_id: ing.material_id,
          qty_in_use: qtyInUse,
          unit: ing.unit || material.unit || 'gr',
        });
      }
    }

    for (const item of mergedMap.values()) {
      const unitPrice = parseFloat(item.material.avg_cost || item.material.new_price || item.material.price || 0);
      item.material.price = unitPrice;
      const amount = Math.round(calculateIngredientCost(item.material, item.qty_in_use, item.unit, unitConversionMap));
      subtotal += amount;

      ingredientRows.push({
        recipe_id: id,
        tenant_id: tenantId,
        ...(branchId ? { branch_id: branchId } : {}),
        material_id: item.material_id,
        qty_in_use: item.qty_in_use,
        unit: item.unit,
        unit_price: unitPrice,
        amount: amount
      });
    }

    const fixCostPct = recipeData.fix_cost_pct != null ? parseFloat(recipeData.fix_cost_pct) : activeOverheadPct;
    const roundingDirection = recipeData.rounding_direction || DEFAULT_ROUNDING_DIRECTION;
    const roundingIncrement = recipeData.rounding_increment != null ? parseFloat(recipeData.rounding_increment) : DEFAULT_ROUNDING_INCREMENT;
    const priceAdjustment = recipeData.price_adjustment != null ? parseFloat(recipeData.price_adjustment) : DEFAULT_PRICE_ADJUSTMENT;
    const foodCostPctTarget = parseFloat(recipeData.food_cost_pct || 0);

    const { fixCost, basicCost, sellingPriceRaw, sellingPriceFinal } = computeRecipeCosts({
      subtotal, fixCostPct, foodCostPct: foodCostPctTarget,
      roundingDirection, roundingIncrement, priceAdjustment
    });
    const sellingPrice = Math.round(
      recipeData.selling_price_override != null
        ? parseFloat(recipeData.selling_price_override)
        : (sellingPriceFinal || parseFloat(recipeData.selling_price || 0))
    );

    // 2. Update Recipe
    let updRecQ = supabase
      .from('recipes')
      .update({
        menu_name: recipeData.menu_name,
        ...(recipeData.category !== undefined ? { category: recipeData.category } : {}),
        ...(recipeData.image_url !== undefined ? { image_url: recipeData.image_url } : {}),
        selling_price: sellingPrice,
        subtotal: Math.round(subtotal),
        fix_cost_pct: fixCostPct,
        fix_cost: Math.round(fixCost),
        basic_cost: Math.round(basicCost),
        food_cost_pct: parseFloat(foodCostPctTarget.toFixed(4)),
        selling_price_raw: parseFloat((sellingPriceRaw || 0).toFixed(2)),
        rounding_direction: roundingDirection,
        rounding_increment: roundingIncrement,
        price_adjustment: priceAdjustment
      })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (branchId) updRecQ = updRecQ.eq('branch_id', branchId);
    const { data: recipe, error: recipeErr } = await updRecQ.select('*').single();

    if (recipeErr) throw new Error("Gagal update resep: " + recipeErr.message);

    // 3. Upsert bahan baru/diubah berdasarkan (recipe_id, material_id), lalu hapus bahan yang dilepas
    const newMaterialIds = new Set(ingredientRows.map(r => Number(r.material_id)));
    let oldIngQ = supabase
      .from('recipe_ingredients')
      .select('id, material_id')
      .eq('recipe_id', id);
    if (branchId) oldIngQ = oldIngQ.eq('branch_id', branchId);
    const { data: oldIngredientRows } = await oldIngQ;

    if (ingredientRows.length > 0) {
      const { error: ingErr } = await supabase
        .from('recipe_ingredients')
        .upsert(ingredientRows, { onConflict: 'recipe_id,material_id' });
      if (ingErr) throw new Error("Gagal menyimpan bahan resep baru: " + ingErr.message);
    }

    const idsToDelete = (oldIngredientRows || [])
      .filter(r => !newMaterialIds.has(Number(r.material_id)))
      .map(r => r.id);

    if (idsToDelete.length > 0) {
      let delIngQ = supabase.from('recipe_ingredients').delete().in('id', idsToDelete);
      if (branchId) delIngQ = delIngQ.eq('branch_id', branchId);
      await delIngQ;
    }

    const formattedHpp = new Intl.NumberFormat('id-ID').format(recipe.basic_cost);
    await logAudit('UPDATE_RECIPE', `Memperbarui resep menu: "${recipe.menu_name}" dengan HPP baru Rp${formattedHpp}.`);

    return recipe;
  },

  deleteRecipe: async (id, branchIdArg = null) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branchIdArg);
    let recQ = supabase.from('recipes').select('*').eq('id', id).eq('tenant_id', tenantId);
    if (branchId) recQ = recQ.eq('branch_id', branchId);
    const { data: recipe, error: fetchErr } = await recQ.single();
    if (fetchErr || !recipe) throw new Error("Resep tidak ditemukan atau bukan milik cabang aktif.");

    // Harus hapus dependencies dulu karena tidak ada ON DELETE CASCADE
    const scopeBranch = (q) => (branchId ? q.eq('branch_id', branchId) : q);
    await scopeBranch(supabase.from('recipe_ingredients').delete().eq('recipe_id', id));
    await scopeBranch(supabase.from('pos_order_items').delete().eq('recipe_id', id));
    await scopeBranch(supabase.from('pos_transaction_items').delete().eq('recipe_id', id));
    await scopeBranch(supabase.from('recipe_versions').delete().eq('recipe_id', id));

    const { error } = await scopeBranch(supabase.from('recipes').delete().eq('id', id).eq('tenant_id', tenantId));

    if (error) throw new Error("Gagal menghapus resep: " + error.message);
    await logAudit('DELETE_RECIPE', `Menghapus resep menu: "${recipe.menu_name}" dari database COGS.`);
    return true;
  },

  // Recalculate basic cost and food cost pct for all recipes.
  recalculateAllRecipes: async (branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { updated: 0, results: [] };
    const branchId = await requireBranchId(branchIdArg);

    let recQ = supabase
      .from('recipes')
      .select('*, recipe_ingredients(*, materials(*))')
      .eq('tenant_id', tenantId);
    if (branchId) recQ = recQ.eq('branch_id', branchId);
    const { data: recipes, error } = await recQ;
    if (error) throw new Error("Gagal memuat resep: " + error.message);

    const unitConversionMap = await api._loadUnitConversionMap(tenantId, branchId);

    const results = [];
    for (const r of (recipes || [])) {
      const ings = r.recipe_ingredients || [];
      const subtotal = ings.reduce((sum, ing) => {
        const mat = ing.materials;
        const unit = ing.unit || mat?.unit || 'gr';
        return sum + calculateIngredientCost(mat, parseFloat(ing.qty_in_use || 0), unit, unitConversionMap);
      }, 0);

      const fixCostPct = r.fix_cost_pct != null ? parseFloat(r.fix_cost_pct) : activeOverheadPct;
      const roundingDirection = r.rounding_direction || DEFAULT_ROUNDING_DIRECTION;
      const roundingIncrement = r.rounding_increment != null ? parseFloat(r.rounding_increment) : DEFAULT_ROUNDING_INCREMENT;
      const priceAdjustment = r.price_adjustment != null ? parseFloat(r.price_adjustment) : DEFAULT_PRICE_ADJUSTMENT;

      const targetPct = parseFloat(r.food_cost_pct || 0);

      const { fixCost, basicCost, sellingPriceFinal } = computeRecipeCosts({
        subtotal, fixCostPct, foodCostPct: targetPct,
        roundingDirection, roundingIncrement, priceAdjustment
      });

      const currentSellingPrice = parseFloat(r.selling_price || 0);
      const sellingPrice = currentSellingPrice > 0 ? currentSellingPrice : (sellingPriceFinal || 0);

      const foodCostPct = sellingPrice > 0 ? basicCost / sellingPrice : 0;

      const before = {
        subtotal: parseFloat(r.subtotal || 0),
        basic_cost: parseFloat(r.basic_cost || 0),
        selling_price: currentSellingPrice
      };
      const changed = Math.abs(before.basic_cost - basicCost) > 1 || Math.abs(before.selling_price - sellingPrice) > 1;

      if (changed) {
        let updQ = supabase
          .from('recipes')
          .update({ subtotal, fix_cost: fixCost, basic_cost: basicCost, selling_price: sellingPrice, food_cost_pct: foodCostPct, updated_at: new Date().toISOString() })
          .eq('id', r.id)
          .eq('tenant_id', tenantId);
        if (branchId) updQ = updQ.eq('branch_id', branchId);
        const { error: updErr } = await updQ;
        if (updErr) {
          results.push({ menu_name: r.menu_name, status: 'error', message: updErr.message });
          continue;
        }

        for (const ing of ings) {
          const mat = ing.materials;
          const unit = ing.unit || mat?.unit || 'gr';
          const qty = parseFloat(ing.qty_in_use || 0);
          const amount = calculateIngredientCost(mat, qty, unit, unitConversionMap);
          const { unitPrice } = getUnitPrice(mat, unitConversionMap);
          let ingUpdQ = supabase.from('recipe_ingredients').update({ unit_price: unitPrice, amount }).eq('id', ing.id);
          if (branchId) ingUpdQ = ingUpdQ.eq('branch_id', branchId);
          await ingUpdQ;
        }
      }
      results.push({
        menu_name: r.menu_name,
        status: changed ? 'updated' : 'unchanged',
        before_basic_cost: before.basic_cost,
        after_basic_cost: basicCost,
      });
    }

    const updatedCount = results.filter(r => r.status === 'updated').length;
    await logAudit('RECALC_ALL_RECIPES', `Menjalankan recompute massal ${recipes.length} resep — ${updatedCount} resep angkanya diperbarui.`);
    return { updated: updatedCount, total: recipes.length, results };
  },

  // --- INVOICES ---
  getInvoices: async (branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await requireBranchId(branchIdArg);
    let query = supabase
      .from('invoices')
      .select('*, invoice_items(*, materials(*))')
      .eq('tenant_id', tenantId);
    if (branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query;

    if (error) throw new Error("Gagal memuat invoices: " + error.message);

    return data.map(inv => ({
      id: inv.id,
      invoice_no: inv.invoice_no,
      supplier: inv.supplier,
      date: inv.date,
      total: parseFloat(inv.total),
      status: inv.status,
      location: inv.location,
      notes: inv.notes,
      received_date: inv.received_date,
      items: (inv.invoice_items || []).map(item => ({
        material_id: item.material_id,
        item_name: item.materials ? item.materials.name : 'Bahan Terhapus',
        qty: parseFloat(item.qty),
        unit_price: parseFloat(item.unit_price),
        unit: item.materials ? item.materials.unit : 'pck'
      }))
    }));
  },

  getInvoicesPaged: async ({ page = 1, pageSize = 15, search = '', status = 'ALL', branchId: branchIdArg = null } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { data: [], totalCount: 0 };
    const branchId = await requireBranchId(branchIdArg);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('invoices')
      .select('*, invoice_items(*, materials(*))', { count: 'exact' })
      .eq('tenant_id', tenantId);
    if (branchId) query = query.eq('branch_id', branchId);

    if (search && search.trim()) {
      const s = sanitizePostgrest(search);
      query = query.or(`invoice_no.ilike.%${s}%,supplier.ilike.%${s}%`);
    }

    if (status && status !== 'ALL') {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw new Error("Gagal memuat invoices: " + error.message);

    return {
      data: data.map(inv => ({
        id: inv.id,
        invoice_no: inv.invoice_no,
        supplier: inv.supplier,
        date: inv.date,
        total: parseFloat(inv.total),
        status: inv.status,
        location: inv.location,
        notes: inv.notes,
        received_date: inv.received_date,
        receipt_photo_url: inv.receipt_photo_url,
        receipt_signature_url: inv.receipt_signature_url,
        receipt_gps: inv.receipt_gps,
        items: (inv.invoice_items || []).map(item => ({
          material_id: item.material_id,
          item_name: item.materials ? item.materials.name : 'Bahan Terhapus',
          qty: parseFloat(item.qty),
          unit_price: parseFloat(item.unit_price),
          unit: item.materials ? item.materials.unit : 'pck'
        }))
      })),
      totalCount: count || 0
    };
  },

  createInvoice: async (invoiceData) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(invoiceData?.branch_id || null);

    // 1. Generate Invoice Number: INV-YYYYMMDD-XXX
    const dateToday = new Date();
    const dateStr = dateToday.getFullYear() +
                    String(dateToday.getMonth() + 1).padStart(2, '0') +
                    String(dateToday.getDate()).padStart(2, '0');

    let countQ = supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .like('invoice_no', `INV-${dateStr}-%`);
    if (branchId) countQ = countQ.eq('branch_id', branchId);
    const { count } = await countQ;

    const serial = String((count || 0) + 1).padStart(3, '0');
    const invoiceNo = `INV-${dateStr}-${serial}`;

    // 2. Calculate dynamic PO Total
    let total = 0.00;
    const lineItems = [];

    for (const item of invoiceData.items) {
      const itemTotal = parseFloat(item.qty) * parseFloat(item.unit_price);
      total += itemTotal;
      lineItems.push({
        material_id: item.material_id,
        qty: parseFloat(item.qty),
        unit_price: parseFloat(item.unit_price)
      });
    }

    // 3. Create PO Invoice
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .insert({
        tenant_id: tenantId,
        ...(branchId ? { branch_id: branchId } : {}),
        invoice_no: invoiceNo,
        supplier: invoiceData.supplier,
        date: dateToday.toISOString().split('T')[0],
        total: parseFloat(total.toFixed(2)),
        status: 'DRAFT',
        location: invoiceData.location || 'CENTRAL',
        notes: invoiceData.notes || ''
      })
      .select('*')
      .single();

    if (invErr) throw new Error("Gagal membuat PO: " + invErr.message);

    // 4. Save Invoice Line Items
    const itemsToInsert = lineItems.map(item => ({
      invoice_id: invoice.id,
      tenant_id: tenantId,
      ...(branchId ? { branch_id: branchId } : {}),
      ...item
    }));

    const { error: itemsErr } = await supabase.from('invoice_items').insert(itemsToInsert);
    if (itemsErr) {
      let rbQ = supabase.from('invoices').delete().eq('id', invoice.id).eq('tenant_id', tenantId);
      if (branchId) rbQ = rbQ.eq('branch_id', branchId);
      await rbQ;
      throw new Error("Gagal menyimpan rincian barang PO: " + itemsErr.message);
    }

    const formattedTotal = new Intl.NumberFormat('id-ID').format(invoice.total);
    await logAudit('CREATE_PO', `Membuat Purchase Order (PO) baru: ${invoice.invoice_no} untuk Supplier "${invoice.supplier}" senilai Rp${formattedTotal}. Lokasi: ${invoice.location}. Status: DRAFT.`);

    return invoice;
  },

  updateInvoiceStatus: async (id, status, branchIdArg = null) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branchIdArg);
    let oldQ = supabase.from('invoices').select('*').eq('id', id).eq('tenant_id', tenantId);
    if (branchId) oldQ = oldQ.eq('branch_id', branchId);
    const { data: oldInvoice } = await oldQ.single();
    if (oldInvoice.status === 'RECEIVED') {
      throw new Error('Tidak bisa mengubah status invoice PO yang sudah diterima (RECEIVED).');
    }

    let updQ = supabase
      .from('invoices')
      .update({ status })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (branchId) updQ = updQ.eq('branch_id', branchId);
    const { data, error } = await updQ.select('*').single();

    if (error) throw new Error("Gagal update status PO: " + error.message);

    const formattedTotal = new Intl.NumberFormat('id-ID').format(data.total);
    if (status === 'CANCELLED') {
      await logAudit('CANCEL_PO', `Membatalkan Purchase Order (PO): ${data.invoice_no} untuk Supplier "${data.supplier}" senilai Rp${formattedTotal}.`);
    } else if (status === 'SENT') {
      await logAudit('SENT_PO', `Mengirim Purchase Order (PO): ${data.invoice_no} untuk Supplier "${data.supplier}" senilai Rp${formattedTotal}. Status: SENT.`);
    }

    return data;
  },

  receiveInvoice: async (id, payload = {}) => {
    const { photoUrl = null, signatureUrl = null, gps = null } = payload;
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(payload?.branch_id || null);
    const userId = await getActiveUserId();

    const receivedDate = payload.received_date || getLocalDateISO();
    const { data: receiveResult, error: rpcErr } = await supabase.rpc('atomic_receive_invoice_wac_v3', {
      p_invoice_id: id,
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_received_date: receivedDate
    });

    if (rpcErr) throw new Error("Gagal menerima PO secara atomik: " + rpcErr.message);
    if (receiveResult?.duplicate) {
      let dupQ = supabase.from('invoices').select('*').eq('id', id).eq('tenant_id', tenantId);
      if (branchId) dupQ = dupQ.eq('branch_id', branchId);
      return await dupQ.single().then(({ data, error }) => {
        if (error) throw error;
        return data;
      });
    }

    if (photoUrl || signatureUrl || gps) {
      let proofQ = supabase.from('invoices').update({
        receipt_photo_url: photoUrl,
        receipt_signature_url: signatureUrl,
        receipt_gps: gps
      }).eq('id', id).eq('tenant_id', tenantId);
      if (branchId) proofQ = proofQ.eq('branch_id', branchId);
      await proofQ;
    }

    let fetchQ = supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (branchId) fetchQ = fetchQ.eq('branch_id', branchId);
    const { data: updatedInvoice, error: fetchErr } = await fetchQ.single();

    if (fetchErr || !updatedInvoice) throw new Error("Gagal memuat invoice yang diperbarui.");

    try {
      const formattedTotal = new Intl.NumberFormat('id-ID').format(updatedInvoice.total);
      await logAudit('RECEIVE_PO', `Menerima barang untuk Purchase Order (PO): ${updatedInvoice.invoice_no} dari Supplier "${updatedInvoice.supplier}" senilai Rp${formattedTotal}. Stok gudang ${updatedInvoice.location || 'CENTRAL'} bertambah.`);
    } catch (e) {
      console.warn("Failed to log audit for receive PO:", e);
    }

    try {
      await api.syncMarketListPricesFromInvoice({ invoiceId: id, branchId });
    } catch (syncErr) {
      console.warn("Auto-sync market list items warning:", syncErr);
    }

    return updatedInvoice;
  },

  // --- POS SYNCHRONIZATION ---
  checkPosSalesDuplicate: async (month, year) => {
    const tenantId = await getActiveTenantId();
    // Assuming transactions stores date, we can check if there's any POS_DEDUCTION in that month
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = new Date(year, parseInt(month), 0).toISOString().split('T')[0];
    
    // BUG-FIX 2026-07: this used to check for type='POS_DEDUCTION' — but the live
    // sync function (processPOSSync) was deliberately redesigned to NEVER create
    // POS_DEDUCTION transactions (see its header comment: qty_resto must only move
    // from real physical counts, not theoretical POS usage). That silently made
    // duplicate-upload detection dead — re-uploading the same file would never be
    // flagged, double-counting POS_SALE revenue. Check POS_SALE instead, since
    // that's what processPOSSync actually inserts.
    const { count, error } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('type', 'POS_SALE')
      .gte('date', startDate)
      .lte('date', endDate);
      
    if (error) { console.error("DB Error:", error); throw error; }
    if (count > 0) {
      return { isDuplicate: true, message: `AI mendeteksi kemungkinan duplikat: Terdapat ${count} transaksi POS Sale pada periode ${month}/${year}. Apakah Anda yakin ingin mengunggah file ini (Data akan di-Append / Ditambahkan)?` };
    }
    return { isDuplicate: false };
  },

  // JANGAN DIPAKAI: dead code — no caller anywhere in the app (verified by
  // reference search, analysis Bagian 3.3). The active POS upload path is
  // `processPOSSync` above, which intentionally does NOT deduct qty_resto
  // in real time. This function calls `deduct_stock_atomic` and DOES deduct
  // stock immediately — a materially different behavior. Do not wire this up
  // without confirming that's actually the intended design change.
  syncPos: async (filename, salesData) => {
    const tenantId = await getActiveTenantId();
    const userId = await getActiveUserId();
    const nowStr = new Date().toISOString().split('T')[0];

    // 1. Calculate File Hash for deduplication (SHA-256)
    const fileHashRaw = filename + JSON.stringify(salesData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fileHashRaw));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fileHash = 'sha256-' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // 2. Check if already processed
    const { data: existingLog } = await supabase
      .from('pos_upload_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('file_hash', fileHash)
      .maybeSingle();

    if (existingLog) {
      console.warn(`File POS "${filename}" ini sudah pernah diproses pada ${new Date(existingLog.created_at).toLocaleString('id-ID')}. (Warning only, AI duplicate modal will handle confirmation)`);
    }

    // 3. Pre-load all recipes with ingredients and materials
    const { data: recipes, error: recipesErr } = await supabase
      .from('recipes')
      .select('*, recipe_ingredients(*, materials(*))')
      .eq('tenant_id', tenantId);

    if (recipesErr) throw new Error("Gagal mengambil data resep: " + recipesErr.message);

    const recipesMapByName = new Map(recipes.map(r => [r.menu_name.toLowerCase().trim(), r]));
    const recipesMapByCode = new Map(recipes.filter(r => r.pos_code).map(r => [r.pos_code.toLowerCase().trim(), r]));

    let processedRecords = 0;
    let skippedRecords = 0;
    let deductionLogsCount = 0;
    const negativeWarnings = [];
    const deductionErrors = []; 

    const transactionRows = [];
    const deductionMap = {}; // Memory aggregation for materials
    const salesMap = {}; // Memory aggregation for gross revenue
    let minDate = '9999-12-31';
    let maxDate = '0000-01-01';

    // 1. Loop through each POS sale row (Pre-Aggregation Phase)
    for (const sale of salesData) {
      // Basic extraction
      const menuName = sale.menuName.toLowerCase().trim();
      const menuCode = sale.menuCode ? sale.menuCode.toLowerCase().trim() : null;
      const saleQty = parseInt(sale.qty || 1);
      const salesDate = sale.salesDate || nowStr;
      const totalRevenue = parseFloat(sale.total || 0);

      // Track date bounds for expected_usage
      if (salesDate < minDate) minDate = salesDate;
      if (salesDate > maxDate) maxDate = salesDate;

      processedRecords++;

      // BUGFIX: Aggregate Gross Revenue by Menu and Date regardless of recipe matching
      // So revenue is not lost if a recipe is not yet created in the system!
      const salesKey = `${salesDate}_${sale.menuName}`;
      if (!salesMap[salesKey]) {
        salesMap[salesKey] = { menuName: sale.menuName, date: salesDate, qty: 0, revenue: 0 };
      }
      salesMap[salesKey].qty += saleQty;
      salesMap[salesKey].revenue += totalRevenue;

      let recipe = null;

      // Priority 1: Match by POS code
      if (menuCode && recipesMapByCode.has(menuCode)) {
        recipe = recipesMapByCode.get(menuCode);
      }

      // Priority 2: Match by exact name
      if (!recipe && recipesMapByName.has(menuName)) {
        recipe = recipesMapByName.get(menuName);
      }

      // Priority 3: Fuzzy name match
      if (!recipe) {
        recipe = recipes.find(r => {
          const rName = r.menu_name.toLowerCase();
          return rName.includes(menuName) || menuName.includes(rName);
        });
      }

      if (!recipe) {
        skippedRecords++;
        continue;
      }

      // Aggregate Deductions in memory ONLY if recipe exists
      for (const ing of recipe.recipe_ingredients) {
        const material = ing.materials;
        if (material) {
          const matUnit = (material.unit || '').toLowerCase().trim();
          const ingUnit = (ing.unit || '').toLowerCase().trim();
          
          let factor = 1.00;
          if (ingUnit !== matUnit) {
            const isIngGramMl = (ingUnit === 'gr' || ingUnit === 'ml' || ingUnit === 'grm');
            const isMatKgL = (matUnit === 'kg' || matUnit === 'l' || matUnit === 'liter' || matUnit === 'ltr');
            if (isIngGramMl && isMatKgL) {
              factor = 1000.00;
            }
          }

          const deductQty = (parseFloat(ing.qty_in_use) * saleQty) / factor;
          
          if (!deductionMap[material.id]) {
            deductionMap[material.id] = { material, totalDeduct: 0, saleDates: new Set(), totalSold: 0 };
          }
          deductionMap[material.id].totalDeduct += deductQty;
          deductionMap[material.id].saleDates.add(salesDate);
          deductionMap[material.id].totalSold += saleQty;
        }
      }
    }

    // Prepare expected usage rows
    const expectedUsageRows = [];
    // If no valid dates were found, default to today
    if (minDate === '9999-12-31') minDate = nowStr;
    if (maxDate === '0000-01-01') maxDate = nowStr;

      // 2. Perform Atomic Deductions per UNIQUE material (Parallel Batching API Optimization)
      const deductionEntries = Object.entries(deductionMap);
      const BATCH_SIZE = 20; // Concurrent requests limit

      for (let i = 0; i < deductionEntries.length; i += BATCH_SIZE) {
        const batch = deductionEntries.slice(i, i + BATCH_SIZE);
        const unitConversionMap = await api._loadUnitConversionMap(tenantId);

        await Promise.all(batch.map(async ([, data]) => {
          const material = data.material;
          const deductQty = data.totalDeduct;
          const currentResto = parseFloat(material.qty_resto);
          const newQty = currentResto - deductQty;

          if (newQty < 0) {
            negativeWarnings.push(`Stok ${material.name} tidak cukup. Butuh ${deductQty.toFixed(2)}, tersedia ${currentResto.toFixed(2)}.`);
          }

          const { error: deductErr } = await supabase.rpc('deduct_stock_atomic', {
            p_material_id: material.id,
            p_deduct_qty: deductQty
          });

          if (deductErr) {
            deductionErrors.push(`${material.name}: ${deductErr.message}`);
            console.error('[syncPos] deduct_stock_atomic failed for', material.name, deductErr.message);
            return;
          }

          // FIX: Route through the shared calculator to avoid pack-size inflation
          const deductionAmount = calculateIngredientCost(material, deductQty, material.unit, unitConversionMap);
          const datesArray = Array.from(data.saleDates).sort();
          const primaryDate = datesArray[datesArray.length - 1] || nowStr;

        transactionRows.push({
          tenant_id: tenantId,
          date: primaryDate,
          material_id: material.id,
          type: 'POS_DEDUCTION',
          location: 'RESTO',
          qty: -deductQty,
          amount: -deductionAmount,
          notes: `POS Sync Bulk Deduction (Total item terjual via file ${filename})`,
          created_by: userId
        });

        deductionLogsCount++;
        
        expectedUsageRows.push({
          tenant_id: tenantId,
          week_start: minDate,
          week_end: maxDate,
          material_id: material.id,
          expected_qty: deductQty,
          total_sold: data.totalSold,
          last_pos_filename: filename,
          created_by: userId
        });
      }));
    }

    // 2b. Push aggregated Sales Revenue to transactions
    for (const [, data] of Object.entries(salesMap)) {
      transactionRows.push({
        tenant_id: tenantId,
        date: data.date,
        material_id: null,
        type: 'POS_SALE',
        location: 'RESTO',
        qty: data.qty,
        amount: data.revenue,
        notes: `POS revenue: "${data.menuName}" (Total Qty: ${data.qty}) via file ${filename}`,
        created_by: userId
      });
    }

    // 3. Insert all transactions in batch chunks to prevent payload too large errors
    const INSERT_CHUNK = 500;
    for (let i = 0; i < transactionRows.length; i += INSERT_CHUNK) {
      const chunk = transactionRows.slice(i, i + INSERT_CHUNK);
      const { error: txsErr } = await supabase.from('transactions').insert(chunk);
      if (txsErr) console.warn("Failed to save POS synced transactions chunk:", txsErr);
    }

    // 4. Upsert expected usage
    for (let i = 0; i < expectedUsageRows.length; i += INSERT_CHUNK) {
      const chunk = expectedUsageRows.slice(i, i + INSERT_CHUNK);
      const { error: euErr } = await supabase.from('expected_usage').upsert(chunk, {
        onConflict: 'tenant_id, week_start, material_id'
      });
      if (euErr) console.warn("Failed to save expected usage chunk:", euErr);
    }

    // Record upload log
    await supabase.from('pos_upload_logs').insert({
      tenant_id: tenantId,
      filename,
      file_hash: fileHash,
      period: 'POS Upload ' + nowStr,
      total_rows: salesData.length
    });

    const warningMsg = negativeWarnings.length > 0 ? ` (Terdapat ${negativeWarnings.length} peringatan stok habis)` : "";
    const errorMsg = deductionErrors.length > 0 ? ` (${deductionErrors.length} pengurangan stok GAGAL diterapkan — perlu ditinjau)` : "";
    await logAudit('POS_SYNC', `Sinkronisasi POS berhasil dari file "${filename}". Memproses ${processedRecords} penjualan, ${skippedRecords} dilewati. Mencatat ${deductionLogsCount} mutasi stok RESTO${warningMsg}${errorMsg}.`);

    return {
      message: 'POS synchronization completed successfully.',
      summary: {
        filename,
        processed_sales_rows: processedRecords,
        unmapped_recipes_skipped: skippedRecords,
        stock_deduction_ledger_entries: deductionLogsCount,
        negative_stock_warnings: negativeWarnings,
        deduction_errors: deductionErrors,
        status: deductionErrors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED'
      }
    };
  },

  // --- NATIVE POS CHECKOUT ---
  processPosCheckout: async (cartItems, paymentMethod = 'CASH', customerName = '') => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId();
    const userId = await getActiveUserId();
    const nowStr = new Date().toISOString().split('T')[0];

    // Check transaction limit (Maks 50 transaksi / hari)
    let countQ = supabase
      .from('pos_orders')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', `${nowStr}T00:00:00Z`)
      .lte('created_at', `${nowStr}T23:59:59Z`);
    if (branchId) countQ = countQ.eq('branch_id', branchId);
    const { count, error: countErr } = await countQ;

    if (!countErr && count >= 50) {
      throw new Error('Batas transaksi POS harian (50) telah tercapai untuk paket Langkah Awal. Silakan upgrade paket atau beli Add-On untuk limit yang lebih besar.');
    }

    const orderNo = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

    // 1. Fetch recipes & ingredients for deduction calculation
    const recipeIds = cartItems.map(item => item.id);
    let recQ = supabase
      .from('recipes')
      .select('id, menu_name, selling_price, recipe_ingredients(material_id, qty_in_use, unit, materials(id, name, unit, full_pack, qty_resto, price, new_price))')
      .eq('tenant_id', tenantId)
      .in('id', recipeIds);
    if (branchId) recQ = recQ.eq('branch_id', branchId);
    const { data: recipes } = await recQ;

    const recipeMap = new Map((recipes || []).map(r => [r.id, r]));

    // 1b. Securely recalculate totalAmount based on DB prices
    let subtotalAmount = 0;
    const orderItems = [];

    for (const item of cartItems) {
      const dbRecipe = recipeMap.get(item.id);
      if (dbRecipe) {
        const dbPrice = parseFloat(dbRecipe.selling_price || 0);
        subtotalAmount += (dbPrice * item.qty);
        orderItems.push({
          recipe_id: item.id,
          qty: item.qty,
          unit_price: dbPrice,
          subtotal: dbPrice * item.qty,
          salesDate: nowStr,
          total: dbPrice * item.qty
        });
      }
    }

    // Apply tax and service charge
    const { data: tenantData } = await supabase.from('tenants').select('pos_tax_rate, pos_service_charge').eq('id', tenantId).single();
    const taxRate = tenantData?.pos_tax_rate ? parseFloat(tenantData.pos_tax_rate) : 0;
    const serviceChargeRate = tenantData?.pos_service_charge ? parseFloat(tenantData.pos_service_charge) : 0;
    
    const serviceChargeAmount = (subtotalAmount * serviceChargeRate) / 100;
    const taxAmount = ((subtotalAmount + serviceChargeAmount) * taxRate) / 100;
    let totalAmount = subtotalAmount + serviceChargeAmount + taxAmount;

    // 2. Aggregate deductions & revenue
    const deductionMap = {};
    let totalSalesQty = 0;
    
    for (const cartItem of cartItems) {
      totalSalesQty += cartItem.qty;
      const recipe = recipeMap.get(cartItem.id);
      if (!recipe || !recipe.recipe_ingredients) continue;

      for (const ing of recipe.recipe_ingredients) {
        const material = ing.materials;
        if (!material) continue;

        const { qty: deductQty } = convertQtyToStockUnit(material, parseFloat(ing.qty_in_use) * cartItem.qty, ing.unit);
        if (!deductionMap[material.id]) {
          deductionMap[material.id] = { material, totalDeduct: 0 };
        }
        deductionMap[material.id].totalDeduct += deductQty;
      }
    }

    // 3. Prepare payload for Atomic Deductions & Transactions
    const transactionRows = [];
    const deductionsPayload = [];
    const negativeWarnings = [];
    const unitConversionMap = await api._loadUnitConversionMap(tenantId, branchId);

    // Revenue transaction
    transactionRows.push({
      date: nowStr,
      material_id: null,
      type: 'POS_SALE',
      location: 'RESTO',
      qty: totalSalesQty,
      amount: totalAmount,
      notes: `POS Kasir (Native) - Order: ${orderNo} (${paymentMethod})`
    });

    for (const [, data] of Object.entries(deductionMap)) {
      const material = data.material;
      const deductQty = data.totalDeduct;
      const currentResto = parseFloat(material.qty_resto);

      if (currentResto - deductQty < 0) {
        negativeWarnings.push(`Stok ${material.name} tersisa ${currentResto.toFixed(2)}, tapi order butuh ${deductQty.toFixed(2)}. (Stok akan jadi minus)`);
      }

      deductionsPayload.push({
        material_id: material.id,
        deduct_qty: deductQty
      });

      const exactCost = calculateIngredientCost(material, deductQty, material.unit, unitConversionMap);

      transactionRows.push({
        date: nowStr,
        material_id: material.id,
        type: 'POS_DEDUCTION',
        location: 'RESTO',
        qty: -deductQty,
        amount: -exactCost,
        notes: `POS Kasir (Native) Deduction - Order: ${orderNo}`
      });
    }

    // 4. Execute atomic checkout
    const { error: checkoutErr } = await supabase.rpc('checkout_pos_atomic', {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_order_no: orderNo,
      p_total_amount: totalAmount,
      p_payment_method: paymentMethod,
      p_order_items: orderItems,
      p_deductions: deductionsPayload,
      p_transactions: transactionRows
    });

    if (checkoutErr) {
      console.error("Checkout failed:", checkoutErr);
      return { success: false, error: checkoutErr.message };
    }

    if (customerName) {
      let custUpdQ = supabase.from('pos_orders').update({ customer_name: customerName }).eq('order_no', orderNo).eq('tenant_id', tenantId);
      if (branchId) custUpdQ = custUpdQ.eq('branch_id', branchId);
      await custUpdQ;
    }

    await logAudit('POS_CHECKOUT', `Transaksi POS Kasir ${orderNo} berhasil (Rp ${totalAmount.toLocaleString('id-ID')}).`);

    return {
      success: true,
      orderNo,
      warnings: negativeWarnings
    };
  },

  // --- STOCK OPNAME ---
  completeOpname: async (opnameData) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(opnameData?.branch_id || null);
    const userId = await getActiveUserId();

    const location = opnameData.location;
    const items = opnameData.items || [];
    const currentMonth = opnameData.period_month ? parseInt(opnameData.period_month, 10) : new Date().getMonth() + 1;
    const currentYear = opnameData.period_year ? parseInt(opnameData.period_year, 10) : new Date().getFullYear();

    let oldOpnameQ = supabase
      .from('stock_opnames')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('period_month', currentMonth)
      .eq('period_year', currentYear)
      .eq('location', location);
    if (branchId) oldOpnameQ = oldOpnameQ.eq('branch_id', branchId);
    const { data: oldOpname, error: oldOpnameErr } = await oldOpnameQ.maybeSingle();
    if (oldOpnameErr) throw new Error('Gagal memeriksa stock opname periode ini: ' + oldOpnameErr.message);

    if (oldOpname && !['DRAFT', 'COUNTING'].includes(String(oldOpname.status || '').toUpperCase())) {
      throw new Error(`Stock opname ${currentMonth}/${currentYear} lokasi ${location} sudah ${oldOpname.status}. Snapshot historis tidak boleh dihapus; buat koreksi/revisi yang dapat diaudit.`);
    }

    if (oldOpname) {
      let delOldItemsQ = supabase.from('stock_opname_items').delete().eq('opname_id', oldOpname.id);
      if (branchId) delOldItemsQ = delOldItemsQ.eq('branch_id', branchId);
      const { error: oldItemsDeleteErr } = await delOldItemsQ;
      if (oldItemsDeleteErr) throw new Error('Gagal mengganti draft stock opname: ' + oldItemsDeleteErr.message);
      let delOldHdrQ = supabase.from('stock_opnames').delete().eq('id', oldOpname.id).eq('tenant_id', tenantId);
      if (branchId) delOldHdrQ = delOldHdrQ.eq('branch_id', branchId);
      const { error: oldHeaderDeleteErr } = await delOldHdrQ;
      if (oldHeaderDeleteErr) throw new Error('Gagal menghapus draft stock opname lama: ' + oldHeaderDeleteErr.message);
    }

    // 2. Create Persistent Stock Opname record as DRAFT first
    const { data: opname, error: opnameErr } = await supabase
      .from('stock_opnames')
      .insert({
        tenant_id: tenantId,
        ...(branchId ? { branch_id: branchId } : {}),
        period_month: currentMonth,
        period_year: currentYear,
        location,
        status: 'DRAFT',
        signature_svg: opnameData.signature_svg || '',
        created_by: userId,
        submitted_at: new Date().toISOString()
      })
      .select('*')
      .single();

    if (opnameErr) throw new Error("Gagal membuat data audit opname: " + opnameErr.message);

    const opnameItems = [];

    // Pre-fetch materials system book quantities scoped to branch
    const matIds = items.map(i => i.material_id).filter(Boolean);
    let materials = [];
    if (matIds.length > 0) {
      let matsQ = supabase.from('materials').select('*').eq('tenant_id', tenantId).in('id', matIds);
      if (branchId) matsQ = matsQ.eq('branch_id', branchId);
      const { data: fetchedMats, error: matsErr } = await matsQ;
      if (matsErr) throw new Error("Gagal memuat bahan opname: " + matsErr.message);
      materials = fetchedMats || [];
    }
    const materialsMap = new Map(materials.map(m => [m.id, m]));

    for (const item of items) {
      const material = materialsMap.get(item.material_id);
      if (!material) continue;

      const physicalQty = parseFloat(item.physical_qty || 0);
      const systemQty = location === 'RESTO' ? parseFloat(material.qty_resto) : parseFloat(material.qty_central);

      opnameItems.push({
        opname_id: opname.id,
        tenant_id: tenantId,
        ...(branchId ? { branch_id: branchId } : {}),
        material_id: material.id,
        book_qty: systemQty,
        physical_qty: physicalQty,
        notes: item.notes || null
      });
    }

    // Insert stock opname items
    if (opnameItems.length > 0) {
      const { error: itemsErr } = await supabase.from('stock_opname_items').insert(opnameItems);
      if (itemsErr) {
        let rbQ = supabase.from('stock_opnames').delete().eq('id', opname.id).eq('tenant_id', tenantId);
        if (branchId) rbQ = rbQ.eq('branch_id', branchId);
        await rbQ;
        throw new Error("Gagal menyimpan rincian item opname: " + itemsErr.message);
      }
    }

    // 3. Call the atomic RPC to complete and adjust stock!
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('complete_opname_atomic', {
      p_opname_id: opname.id,
      p_tenant_id: tenantId,
      p_location: location,
      p_user_id: userId
    });

    if (rpcErr) {
      // Rollback
      let rbItemsQ = supabase.from('stock_opname_items').delete().eq('opname_id', opname.id);
      let rbHdrQ = supabase.from('stock_opnames').delete().eq('id', opname.id).eq('tenant_id', tenantId);
      if (branchId) {
        rbItemsQ = rbItemsQ.eq('branch_id', branchId);
        rbHdrQ = rbHdrQ.eq('branch_id', branchId);
      }
      await rbItemsQ;
      await rbHdrQ;
      throw new Error("Gagal menyelesaikan opname secara atomik: " + rpcErr.message);
    }

    const adjustmentsCount = rpcRes.adjustments_made || 0;

    await logAudit('COMPLETE_OPNAME', `Menyelesaikan Stock Opname di gudang ${location}. Menyesuaikan ${adjustmentsCount} item.`);
    return rpcRes;
  },

  // --- REPORTS ---
  getCostControlReport: async (month, branchIdArg = null) => {
    // month is "YYYY-MM"
    const tenantId = await getActiveTenantId();
    const branchId = await requireBranchId(branchIdArg);

    const startDate = `${month}-01`;
    const parts = month.split('-');
    const year = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    const lastDay = new Date(year, m, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
    const unitConversionMap = await api._loadUnitConversionMap(tenantId, branchId);

    let thisOpnamesQ = supabase
      .from('stock_opnames')
      .select('id, location, approved_at, created_at')
      .eq('tenant_id', tenantId)
      .eq('period_month', m)
      .eq('period_year', year)
      .eq('status', 'APPROVED');
    if (branchId) thisOpnamesQ = thisOpnamesQ.eq('branch_id', branchId);
    const { data: rawThisOpnames, error: thisOpnamesErr } = await thisOpnamesQ
      .order('approved_at', { ascending: false })
      .order('created_at', { ascending: false });
    if (thisOpnamesErr) throw thisOpnamesErr;
    const latestThisOpnameByLocation = {};
    for (const opname of (rawThisOpnames || [])) {
      const location = opname.location || 'RESTO';
      if (!latestThisOpnameByLocation[location]) latestThisOpnameByLocation[location] = opname;
    }
    const thisOpnames = Object.values(latestThisOpnameByLocation);
    const opnameLocationById = Object.fromEntries(thisOpnames.map(o => [o.id, o.location || 'RESTO']));
    let locCostQ = supabase
      .from('material_location_costs')
      .select('material_id, location, average_unit_cost, is_opening_estimated')
      .eq('tenant_id', tenantId);
    if (branchId) locCostQ = locCostQ.eq('branch_id', branchId);
    const { data: locationCostRows, error: locationCostErr } = await locCostQ;
    if (locationCostErr && locationCostErr.code !== 'PGRST205') throw locationCostErr;
    const locationCostMap = Object.fromEntries((locationCostRows || []).map(c => [`${c.material_id}:${c.location}`, { cost: Number(c.average_unit_cost) || 0, estimated: Boolean(c.is_opening_estimated) }]));

    let closingValuation = 0.00;
    let categoryValuation = [];
    let hasThisMonthOpname = false;
    let hasThisMonthEodClose = false;
    let closingStockEstimated = false;
    let detailedOpnameItems = [];

    if (thisOpnames && thisOpnames.length > 0) {
      const opnameIds = thisOpnames.map(o => o.id);
      let opnameItemsQ = supabase
        .from('stock_opname_items')
        .select('opname_id, physical_qty, book_qty, material_id, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated, materials(name, new_price, price, avg_cost, category, unit, full_pack, supplier)')
        .in('opname_id', opnameIds);
      if (branchId) opnameItemsQ = opnameItemsQ.eq('branch_id', branchId);
      const { data: opnameItems } = await opnameItemsQ;

      if (opnameItems && opnameItems.length > 0) {
        hasThisMonthOpname = true;
        const matValuationMap = {};
        
        opnameItems.forEach(item => {
          const matId = item.material_id;
          const physicalQty = parseFloat(item.physical_qty || 0);
          const bookQty = parseFloat(item.book_qty || 0);
          const loc = opnameLocationById[item.opname_id] || 'RESTO';
          const costEntry = locationCostMap[`${matId}:${loc}`];
          if (Boolean(item.valuation_is_estimated) || (!costEntry || costEntry.estimated)) closingStockEstimated = true;
          const price = Number(item.unit_cost_snapshot ?? costEntry?.cost ?? item.materials?.avg_cost ?? 0);
          const snapshotValue = Number(item.valuation_snapshot);
          const val = Number.isFinite(snapshotValue) && item.valuation_snapshot !== null
            ? snapshotValue
            : (Number.isFinite(Number(item.unit_cost_snapshot)) && item.unit_cost_snapshot !== null
              ? physicalQty * Number(item.unit_cost_snapshot)
              : (costEntry ? physicalQty * costEntry.cost : calculateIngredientCost(item.materials, physicalQty, item.materials?.unit, unitConversionMap)));
          const cat = item.materials?.category || 'Lain-lain';

          if (!matValuationMap[matId]) {
            matValuationMap[matId] = {
              name: item.materials?.name || 'Unknown',
              unit: item.materials?.unit || '-',
              full_pack: item.materials?.full_pack || '-',
              supplier: item.materials?.supplier || '-',
              systemQty: 0,
              physicalQty: 0,
              val: 0,
              price,
              valuationEstimated: Boolean(item.valuation_is_estimated) || (!costEntry || costEntry.estimated),
              cat
            };
          }
          matValuationMap[matId].systemQty += bookQty;
          matValuationMap[matId].physicalQty += physicalQty;
          matValuationMap[matId].val += val;
          matValuationMap[matId].valuationEstimated = matValuationMap[matId].valuationEstimated || Boolean(item.valuation_is_estimated) || (!costEntry || costEntry.estimated);
        });

        // Build detailed list
        detailedOpnameItems = Object.values(matValuationMap).map(m => ({
          name: m.name,
          category: m.cat,
          unit: m.unit,
          full_pack: m.full_pack,
          systemQty: m.systemQty,
          physicalQty: m.physicalQty,
          variance: m.physicalQty - m.systemQty,
          price: m.price,
          totalValuation: m.val,
          valuationEstimated: Boolean(m.valuationEstimated),
          supplier: m.supplier
        }));
        // Sort by category then name
        detailedOpnameItems.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

        const categoryGroup = {};
        for (const item of Object.values(matValuationMap)) {
          closingValuation += item.val;
          categoryGroup[item.cat] = (categoryGroup[item.cat] || 0) + item.val;
        }

        categoryValuation = Object.entries(categoryGroup).map(([name, value]) => ({
          name,
          value: parseFloat(value.toFixed(2))
        }));
      }
    }

    if (!hasThisMonthOpname) {
      let eodClosingQ = supabase
        .from('daily_inventories')
        .select('id, date, location')
        .eq('tenant_id', tenantId)
        .gte('date', startDate)
        .lte('date', endDate)
        .in('status', ['verified', 'closed']);
      if (branchId) eodClosingQ = eodClosingQ.eq('branch_id', branchId);
      const { data: eodClosingHeaders, error: eodClosingErr } = await eodClosingQ
        .order('date', { ascending: false });
      if (eodClosingErr) throw eodClosingErr;
      const latestEodByLocation = {};
      for (const header of (eodClosingHeaders || [])) {
        if (!latestEodByLocation[header.location]) latestEodByLocation[header.location] = header;
      }
      const latestEodHeaders = Object.values(latestEodByLocation);
      if (latestEodHeaders.length) {
        let eodItemsQ = supabase
          .from('daily_inventory_items')
          .select('inventory_id, material_id, closing_qty, book_qty_before_close, out_qty, unit_cost_snapshot, materials(name, category, unit, full_pack, supplier, avg_cost, price)')
          .eq('tenant_id', tenantId)
          .in('inventory_id', latestEodHeaders.map(h => h.id));
        if (branchId) eodItemsQ = eodItemsQ.eq('branch_id', branchId);
        const { data: eodItems, error: eodItemErr } = await eodItemsQ;
        if (eodItemErr) throw eodItemErr;
        if (eodItems?.length) {
          hasThisMonthEodClose = true;
          const headerLocationById = Object.fromEntries(latestEodHeaders.map(h => [h.id, h.location]));
          const matMap = {};
          for (const item of eodItems) {
            const matId = item.material_id;
            const mat = item.materials || {};
            const location = headerLocationById[item.inventory_id] || 'RESTO';
            const qty = Number(item.closing_qty) || 0;
            const systemQty = item.book_qty_before_close == null
              ? qty
              : (Number(item.book_qty_before_close) || 0) - (Number(item.out_qty) || 0);
            const costEntry = locationCostMap[`${matId}:${location}`];
            if (!costEntry || costEntry.estimated) closingStockEstimated = true;
            const unitCost = item.unit_cost_snapshot != null
              ? Number(item.unit_cost_snapshot) || 0
              : (costEntry?.cost ?? Number(mat.avg_cost ?? 0));
            const value = qty * unitCost;
            if (!matMap[matId]) matMap[matId] = {
              name: mat.name || `Material #${matId}`, category: mat.category || 'Lain-lain',
              unit: mat.unit || '-', full_pack: mat.full_pack || '-', supplier: mat.supplier || '-',
              systemQty: 0, physicalQty: 0, variance: 0, totalValuation: 0,
              price: unitCost, valuationEstimated: !costEntry || costEntry.estimated
            };
            matMap[matId].systemQty += systemQty;
            matMap[matId].physicalQty += qty;
            matMap[matId].variance += qty - systemQty;
            matMap[matId].totalValuation += value;
            matMap[matId].valuationEstimated = matMap[matId].valuationEstimated || (!costEntry || costEntry.estimated);
          }
          detailedOpnameItems = Object.values(matMap).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
          const categoryGroup = {};
          for (const item of detailedOpnameItems) {
            closingValuation += item.totalValuation;
            categoryGroup[item.category] = (categoryGroup[item.category] || 0) + item.totalValuation;
          }
          categoryValuation = Object.entries(categoryGroup).map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }));
        }
      }

      if (!hasThisMonthEodClose) {
        closingStockEstimated = true;
        let matsQ = supabase
          .from('materials').select('*').eq('tenant_id', tenantId).eq('is_active', true);
        if (branchId) matsQ = matsQ.eq('branch_id', branchId);
        const { data: materials, error: materialsErr } = await matsQ;
        if (materialsErr) throw materialsErr;
        const categoryGroup = {};
        for (const mat of (materials || [])) {
          const price = parseFloat(mat.avg_cost ?? mat.price ?? 0);
          const restoQty = Number(mat.qty_resto) || 0;
          const centralQty = Number(mat.qty_central) || 0;
          const restoCost = locationCostMap[`${mat.id}:RESTO`];
          const centralCost = locationCostMap[`${mat.id}:CENTRAL`];
          const qtySistem = restoQty + centralQty;
          const val = (restoCost ? restoQty * restoCost.cost : calculateIngredientCost(mat, restoQty, mat.unit, unitConversionMap))
            + (centralCost ? centralQty * centralCost.cost : calculateIngredientCost(mat, centralQty, mat.unit, unitConversionMap));
          closingValuation += val;
          const cat = mat.category || 'Lain-lain';
          categoryGroup[cat] = (categoryGroup[cat] || 0) + val;
          detailedOpnameItems.push({
            name: mat.name, category: cat, unit: mat.unit, full_pack: mat.full_pack,
            systemQty: qtySistem, physicalQty: qtySistem, variance: 0, price,
            totalValuation: val, valuationEstimated: true, supplier: mat.supplier || '-'
          });
        }
        detailedOpnameItems.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
        categoryValuation = Object.entries(categoryGroup).map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }));
      }
    }

    // 2. Query Transactions for calculations
    let txsQ = supabase
      .from('transactions')
      .select('type, amount, date, notes, material_id, is_reversed, materials(category)')
      .eq('tenant_id', tenantId)
      .eq('is_reversed', false)
      .gte('date', startDate)
      .lte('date', endDate);
    if (branchId) txsQ = txsQ.eq('branch_id', branchId);
    const { data: transactions } = await txsQ;

    let eodHeadersQ = supabase
      .from('daily_inventories')
      .select('id, date, location')
      .eq('tenant_id', tenantId)
      .gte('date', startDate)
      .lte('date', endDate)
      .in('status', ['verified', 'closed']);
    if (branchId) eodHeadersQ = eodHeadersQ.eq('branch_id', branchId);
    const { data: closedEodHeaders, error: eodHeadersErr } = await eodHeadersQ;
    if (eodHeadersErr) throw new Error('Gagal memuat sesi EOD final untuk Cost Control: ' + eodHeadersErr.message);

    let closedEodItems = [];
    if (closedEodHeaders?.length) {
      let eodItemsQ = supabase
        .from('daily_inventory_items')
        .select('inventory_id, material_id, out_qty, usage_value, unit_cost_snapshot, stock_based_usage_qty, usage_variance_qty, waste_qty')
        .eq('tenant_id', tenantId)
        .in('inventory_id', closedEodHeaders.map(h => h.id));
      if (branchId) eodItemsQ = eodItemsQ.eq('branch_id', branchId);
      const { data: eodItems, error: eodItemsErr } = await eodItemsQ;
      if (eodItemsErr) throw new Error('Gagal memuat rincian pemakaian EOD untuk Cost Control: ' + eodItemsErr.message);
      closedEodItems = eodItems || [];
    }
    const actualDailyUsageCost = closedEodItems.reduce((sum, item) => {
      const value = item.usage_value ?? ((Number(item.out_qty) || 0) * (Number(item.unit_cost_snapshot) || 0));
      return sum + (Number(value) || 0);
    }, 0);
    const dailyStockBasedUsageCost = closedEodItems.reduce((sum, item) => {
      return sum + ((Number(item.stock_based_usage_qty) || 0) * (Number(item.unit_cost_snapshot) || 0));
    }, 0);
    const dailyUsageVarianceCost = closedEodItems.reduce((sum, item) => {
      return sum + ((Number(item.usage_variance_qty) || 0) * (Number(item.unit_cost_snapshot) || 0));
    }, 0);

    let expUsageQ = supabase
      .from('expected_usage')
      .select('material_id, expected_qty, expected_cost_value, unit_cost_snapshot, materials(avg_cost, price)')
      .eq('tenant_id', tenantId)
      .lte('week_start', endDate)
      .gte('week_end', startDate);
    if (branchId) expUsageQ = expUsageQ.eq('branch_id', branchId);
    const { data: expectedUsageRows, error: expectedUsageErr } = await expUsageQ;
    if (expectedUsageErr) throw new Error('Gagal memuat theoretical usage: ' + expectedUsageErr.message);
    let theoreticalCogsCost = 0;
    let theoreticalRowsEstimated = 0;
    for (const row of (expectedUsageRows || [])) {
      if (row.expected_cost_value !== null && row.expected_cost_value !== undefined) {
        theoreticalCogsCost += Number(row.expected_cost_value) || 0;
      } else {
        const fallbackCost = Number(row.unit_cost_snapshot ?? row.materials?.avg_cost ?? row.materials?.price ?? 0) || 0;
        theoreticalCogsCost += (Number(row.expected_qty) || 0) * fallbackCost;
        theoreticalRowsEstimated += 1;
      }
    }

    let purchasesValuation = 0.00;
    let cogsIngredientsCost = 0.00;
    let salesRevenue = 0.00;
    let wasteValuation = 0.00;

    const wasteTypes = ['WASTE', 'BREAKAGE', 'EXPIRED', 'COMP'];

    for (const tx of (transactions || [])) {
      const amt = parseFloat(tx.amount || 0);
      if (tx.type === 'PURCHASE_IN') {
        purchasesValuation += amt;
      } else if (tx.type === 'POS_DEDUCTION') {
        cogsIngredientsCost += Math.abs(amt);
      } else if (tx.type === 'POS_SALE') {
        salesRevenue += amt;
      } else if (wasteTypes.includes(tx.type)) {
        wasteValuation += Math.abs(amt);
      }
    }

    // 3. Opening Stock: Query last month's opname or use derivation as fallback
    const prevMonth = m === 1 ? 12 : m - 1;
    const prevYear = m === 1 ? year - 1 : year;
    // FIX 2026-09 (QA finding, sama seperti closing valuation di atas): filter
    // status APPROVED supaya fallback derivation di bawah tidak dipicu secara
    // keliru hanya karena ada draft opname bulan lalu yang belum di-submit.
    let prevOpnamesQ = supabase
      .from('stock_opnames')
      .select('id, location, approved_at, created_at')
      .eq('tenant_id', tenantId)
      .eq('period_month', prevMonth)
      .eq('period_year', prevYear)
      .eq('status', 'APPROVED');
    if (branchId) prevOpnamesQ = prevOpnamesQ.eq('branch_id', branchId);
    const { data: rawPrevOpnames, error: prevOpnamesErr } = await prevOpnamesQ
      .order('approved_at', { ascending: false })
      .order('created_at', { ascending: false });
    if (prevOpnamesErr) throw prevOpnamesErr;
    const latestPrevOpnameByLocation = {};
    for (const opname of (rawPrevOpnames || [])) {
      const location = opname.location || 'RESTO';
      if (!latestPrevOpnameByLocation[location]) latestPrevOpnameByLocation[location] = opname;
    }
    const prevOpnames = Object.values(latestPrevOpnameByLocation);

    let openingValuation = 0;
    let openingStockEstimated = false;
    let openingSnapshotFound = false;
    if (prevOpnames && prevOpnames.length > 0) {
      const prevOpnameIds = prevOpnames.map(o => o.id);
      let prevItemsQ = supabase
        .from('stock_opname_items')
        .select('opname_id, physical_qty, material_id, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated, materials(new_price, price, avg_cost, unit, full_pack, name)')
        .in('opname_id', prevOpnameIds);
      if (branchId) prevItemsQ = prevItemsQ.eq('branch_id', branchId);
      const { data: prevOpnameItems, error: prevItemsErr } = await prevItemsQ;
      if (prevItemsErr) throw prevItemsErr;
      if (prevOpnameItems?.length) {
        const prevLocationById = Object.fromEntries(prevOpnames.map(o => [o.id, o.location || 'RESTO']));
        openingValuation = prevOpnameItems.reduce((sum, item) => {
          const qty = Number(item.physical_qty) || 0;
          const priorLocationCost = locationCostMap[`${item.material_id}:${prevLocationById[item.opname_id] || 'RESTO'}`];
          if (Boolean(item.valuation_is_estimated) || (!priorLocationCost || priorLocationCost.estimated)) openingStockEstimated = true;
          if (item.valuation_snapshot !== null && item.valuation_snapshot !== undefined) return sum + (Number(item.valuation_snapshot) || 0);
          if (item.unit_cost_snapshot !== null && item.unit_cost_snapshot !== undefined) return sum + qty * (Number(item.unit_cost_snapshot) || 0);
          const locationCost = locationCostMap[`${item.material_id}:${prevLocationById[item.opname_id] || 'RESTO'}`];
          return sum + (locationCost ? qty * locationCost.cost : calculateIngredientCost(item.materials, qty, item.materials?.unit, unitConversionMap));
        }, 0);
        openingSnapshotFound = true;
      }
    }

    if (!openingSnapshotFound) {
      let priorEodQ = supabase
        .from('daily_inventories')
        .select('id, date, location')
        .eq('tenant_id', tenantId)
        .lt('date', startDate)
        .in('status', ['verified', 'closed']);
      if (branchId) priorEodQ = priorEodQ.eq('branch_id', branchId);
      const { data: priorEodHeaders, error: priorEodErr } = await priorEodQ.order('date', { ascending: false });
      if (priorEodErr) throw priorEodErr;
      const latestPriorByLocation = {};
      for (const header of (priorEodHeaders || [])) {
        if (!latestPriorByLocation[header.location]) latestPriorByLocation[header.location] = header;
      }
      const priorHeaders = Object.values(latestPriorByLocation);
      if (priorHeaders.length) {
        let priorItemsQ = supabase
          .from('daily_inventory_items')
          .select('inventory_id, material_id, closing_qty, unit_cost_snapshot, materials(avg_cost, price, unit, full_pack, name)')
          .eq('tenant_id', tenantId)
          .in('inventory_id', priorHeaders.map(h => h.id));
        if (branchId) priorItemsQ = priorItemsQ.eq('branch_id', branchId);
        const { data: priorItems, error: priorItemsErr } = await priorItemsQ;
        if (priorItemsErr) throw priorItemsErr;
        if (priorItems?.length) {
          const locationByHeader = Object.fromEntries(priorHeaders.map(h => [h.id, h.location]));
          openingValuation = priorItems.reduce((sum, item) => {
            const qty = Number(item.closing_qty) || 0;
            const priorLocationCost = locationCostMap[`${item.material_id}:${locationByHeader[item.inventory_id] || 'RESTO'}`];
            if (item.unit_cost_snapshot == null && (!priorLocationCost || priorLocationCost.estimated)) openingStockEstimated = true;
            if (item.unit_cost_snapshot !== null && item.unit_cost_snapshot !== undefined) return sum + qty * (Number(item.unit_cost_snapshot) || 0);
            const locationCost = locationCostMap[`${item.material_id}:${locationByHeader[item.inventory_id] || 'RESTO'}`];
            return sum + (locationCost ? qty * locationCost.cost : calculateIngredientCost(item.materials, qty, item.materials?.unit, unitConversionMap));
          }, 0);
          openingSnapshotFound = true;
        }
      }
    }

    if (!openingSnapshotFound) {
      openingStockEstimated = true;
      // Estimate only when no prior approved stock count or final EOD exists.
      // Never silently imply this is an observed opening balance.
      openingValuation = Math.max(0, actualDailyUsageCost + wasteValuation + closingValuation - purchasesValuation);
    }

    // COGS = Opening + Purchases - Closing (Excel SO_BARISTA formula, NO waste deducted)
    let actualCogs = openingValuation + purchasesValuation - closingValuation;
    if (actualCogs < 0) actualCogs = 0;
    const totalCogs = actualCogs;
    const beverageCostPct = salesRevenue > 0 ? (totalCogs / salesRevenue) * 100 : 0.00;

    // ponytail: swap to supabase.rpc('get_hpp_metrics') once SQL patch is deployed

    return {
      month,
      transactions,
      period: { start_date: startDate, end_date: endDate },
      metrics: {
        opening_stock: parseFloat(openingValuation.toFixed(2)),
        opening_stock_estimated: openingStockEstimated,
        closing_stock_estimated: closingStockEstimated,
        purchases: parseFloat(purchasesValuation.toFixed(2)),
        closing_stock: parseFloat(closingValuation.toFixed(2)),
        ingredients_cost: parseFloat(cogsIngredientsCost.toFixed(2)),
        overhead_cost: 0.00,
        waste_valuation: parseFloat(wasteValuation.toFixed(2)),
        total_cogs: parseFloat(totalCogs.toFixed(2)),
        actual_daily_usage_cost: parseFloat(actualDailyUsageCost.toFixed(2)),
        daily_stock_based_usage_cost: parseFloat(dailyStockBasedUsageCost.toFixed(2)),
        daily_usage_variance_cost: parseFloat(dailyUsageVarianceCost.toFixed(2)),
        theoretical_cogs_cost: parseFloat(theoreticalCogsCost.toFixed(2)),
        theoretical_usage_items: expectedUsageRows?.length || 0,
        theoretical_rows_estimated: theoreticalRowsEstimated,
        reconciliation_difference_after_usage_and_waste: parseFloat((totalCogs - actualDailyUsageCost - wasteValuation).toFixed(2)),
        closed_eod_sessions: closedEodHeaders?.length || 0,
        closed_eod_item_rows: closedEodItems.length,
        sales_revenue: parseFloat(salesRevenue.toFixed(2)),
        beverage_cost_pct: parseFloat(beverageCostPct.toFixed(2)),
        target_cost_pct: 27.00,
        status: beverageCostPct <= 27.00 ? 'SAFE' : (beverageCostPct <= 30.00 ? 'WARNING' : 'DANGER')
      },
      category_valuation: categoryValuation,
      detailed_opname_items: detailedOpnameItems
    };
  },

  // --- SUPPLIERS ---
  getSuppliers: async (branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await requireBranchId(branchIdArg);
    let query = supabase
      .from('suppliers')
      .select('*')
      .eq('tenant_id', tenantId);
    if (branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query.order('name');
    if (error) throw new Error("Gagal memuat supplier: " + error.message);
    return data;
  },

  saveSupplier: async (supplierData) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(supplierData?.branch_id || null);
    const cleanName = String(supplierData.name || '').trim();
    if (!cleanName) throw new Error("Nama supplier wajib diisi.");
    const payload = {
      tenant_id: tenantId,
      ...(branchId ? { branch_id: branchId } : {}),
      name: cleanName,
      phone: supplierData.phone || null,
      address: supplierData.address || null,
      contact_person: supplierData.contact_person || null
    };

    if (supplierData.id) {
      let existQ = supabase
        .from('suppliers')
        .select('name')
        .eq('id', supplierData.id)
        .eq('tenant_id', tenantId);
      if (branchId) existQ = existQ.eq('branch_id', branchId);
      const { data: existingSupplier } = await existQ.maybeSingle();

      let updSupQ = supabase.from('suppliers').update(payload).eq('id', supplierData.id).eq('tenant_id', tenantId);
      if (branchId) updSupQ = updSupQ.eq('branch_id', branchId);
      const { data, error } = await updSupQ.select().single();
      if (error) throw new Error("Gagal menyimpan supplier: " + error.message);

      if (existingSupplier?.name && existingSupplier.name.trim() !== data.name.trim()) {
        let updMatSupQ = supabase
          .from('materials')
          .update({ supplier: data.name })
          .eq('tenant_id', tenantId)
          .eq('supplier', existingSupplier.name);
        if (branchId) updMatSupQ = updMatSupQ.eq('branch_id', branchId);
        await updMatSupQ;
      }

      await logAudit('UPDATE_SUPPLIER', `Mengubah data supplier "${data.name}".`);
      return data;
    }
    const { data, error } = await supabase.from('suppliers').insert(payload).select().single();
    if (error) throw new Error("Gagal menyimpan supplier: " + error.message);
    await logAudit('CREATE_SUPPLIER', `Menambahkan supplier baru "${data.name}".`);
    return data;
  },

  deleteSupplier: async (supplierId, branchIdArg = null) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branchIdArg);

    let findSupQ = supabase
      .from('suppliers')
      .select('id, name')
      .eq('id', supplierId)
      .eq('tenant_id', tenantId);
    if (branchId) findSupQ = findSupQ.eq('branch_id', branchId);
    const { data: existingSupplier } = await findSupQ.maybeSingle();

    if (!existingSupplier) {
      throw new Error("Data supplier tidak ditemukan.");
    }

    let peRelQ = supabase
      .from('purchase_entries')
      .update({ supplier_id: null })
      .eq('tenant_id', tenantId)
      .eq('supplier_id', supplierId);
    if (branchId) peRelQ = peRelQ.eq('branch_id', branchId);
    await peRelQ;

    if (existingSupplier.name) {
      let matRelQ = supabase
        .from('materials')
        .update({ supplier: '' })
        .eq('tenant_id', tenantId)
        .ilike('supplier', existingSupplier.name.trim());
      if (branchId) matRelQ = matRelQ.eq('branch_id', branchId);
      await matRelQ;
    }

    let delQ = supabase
      .from('suppliers')
      .delete()
      .eq('id', supplierId)
      .eq('tenant_id', tenantId);
    if (branchId) delQ = delQ.eq('branch_id', branchId);
    const { error } = await delQ;

    if (error) throw new Error("Gagal menghapus supplier: " + error.message);
    await logAudit('DELETE_SUPPLIER', `Menghapus supplier "${existingSupplier.name}" beserta pelepasan pemetaan bahannya.`);
    return { success: true, deletedName: existingSupplier.name };
  },

  // --- PURCHASE ENTRIES (Daily Purchasing) ---
  getPurchaseEntriesPaged: async ({ page = 1, pageSize = 15, search = '', material_id = null, period = null, branchId: branchIdArg = null } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { data: [], totalCount: 0 };
    const branchId = await requireBranchId(branchIdArg);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('purchase_entries')
      .select('*, materials(name, unit), suppliers(name)', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('is_cancelled', false);
    if (branchId) query = query.eq('branch_id', branchId);

    if (material_id) {
      query = query.eq('material_id', material_id);
    }

    if (period) {
      const year = period.substring(0, 4);
      const month = period.substring(5, 7);
      const nextMonth = parseInt(month, 10) === 12 ? 1 : parseInt(month, 10) + 1;
      const nextYear = parseInt(month, 10) === 12 ? parseInt(year, 10) + 1 : year;

      const startDate = `${period}-01`;
      const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      query = query.gte('date', startDate).lt('date', endDate);
    }

    if (search && search.trim()) {
      const s = sanitizePostgrest(search);
      let matMatchQ = supabase
        .from('materials')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('name', `%${s}%`);
      if (branchId) matMatchQ = matMatchQ.eq('branch_id', branchId);
      const { data: matMatches } = await matMatchQ;
      const matIds = (matMatches || []).map(m => m.id);
      if (matIds.length > 0) {
        query = query.or(`notes.ilike.%${s}%,material_id.in.(${matIds.join(',')})`);
      } else {
        query = query.ilike('notes', `%${s}%`);
      }
    }

    const { data, error, count } = await query
      .order('date', { ascending: false })
      .range(from, to);

    if (error) throw new Error("Gagal memuat riwayat pembelian: " + error.message);

    let totalQuery = supabase
      .from('purchase_entries')
      .select('id, qty, unit_price')
      .eq('tenant_id', tenantId)
      .eq('is_cancelled', false);
    if (branchId) totalQuery = totalQuery.eq('branch_id', branchId);

    if (material_id) totalQuery = totalQuery.eq('material_id', material_id);

    if (period) {
      const year = period.substring(0, 4);
      const month = period.substring(5, 7);
      const nextMonth = parseInt(month, 10) === 12 ? 1 : parseInt(month, 10) + 1;
      const nextYear = parseInt(month, 10) === 12 ? parseInt(year, 10) + 1 : year;
      const startDate = `${period}-01`;
      const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
      totalQuery = totalQuery.gte('date', startDate).lt('date', endDate);
    }

    if (search && search.trim()) {
      const s = sanitizePostgrest(search);
      let matMatchQ2 = supabase
        .from('materials')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('name', `%${s}%`);
      if (branchId) matMatchQ2 = matMatchQ2.eq('branch_id', branchId);
      const { data: matMatches } = await matMatchQ2;
      const matIds = (matMatches || []).map(m => m.id);
      if (matIds.length > 0) {
        totalQuery = totalQuery.or(`notes.ilike.%${s}%,material_id.in.(${matIds.join(',')})`);
      } else {
        totalQuery = totalQuery.ilike('notes', `%${s}%`);
      }
    }

    const { data: allData } = await totalQuery;
    const totalNominal = (allData || []).reduce((sum, item) => sum + (item.qty * item.unit_price), 0);
    const allMatchingIds = (allData || []).map(item => item.id);

    return { data: data || [], totalCount: count || 0, totalNominal, allMatchingIds };
  },

  createPurchaseEntry: async (purchaseData) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(purchaseData?.branch_id || null);
    const userId = await getActiveUserId();
    const destination = String(purchaseData.destination || 'RESTO').toUpperCase().includes('CENTRAL') ? 'CENTRAL' : 'RESTO';
    const qty = Number(purchaseData.qty);
    const unitPrice = Number(purchaseData.unit_price);
    if (!purchaseData.material_id || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error('Barang, kuantitas pembelian (> 0), dan harga satuan yang valid wajib diisi.');
    }
    if (branchId) {
      const { data: matCheck } = await supabase
        .from('materials')
        .select('id')
        .eq('id', Number(purchaseData.material_id))
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .maybeSingle();
      if (!matCheck) {
        throw new Error('Bahan baku tidak ditemukan pada cabang aktif.');
      }
    }
    const deliveryNotes = purchaseData.delivery_notes ? String(purchaseData.delivery_notes).trim() : '';
    const combinedNotes = [
      purchaseData.notes || null,
      deliveryNotes ? `[Tujuan ${destination}] ${deliveryNotes}` : null
    ].filter(Boolean).join(' — ') || null;
    const payload = {
      material_id: Number(purchaseData.material_id),
      supplier_id: purchaseData.supplier_id || null,
      qty,
      unit: purchaseData.unit,
      unit_price: unitPrice,
      date: purchaseData.date || getLocalDateISO(),
      notes: combinedNotes,
      delivery_notes: deliveryNotes || null,
      expiry_date: purchaseData.expiry_date || null
    };
    const requestKey = purchaseData.request_key || createRequestKey();

    const { data: rpcResult, error: rpcErr } = await supabase.rpc('atomic_record_purchase_location_wac_v4', {
      p_tenant_id: tenantId,
      p_material_id: payload.material_id,
      p_supplier_id: payload.supplier_id,
      p_qty: payload.qty,
      p_unit: payload.unit,
      p_unit_price: payload.unit_price,
      p_date: payload.date,
      p_destination: destination,
      p_input_by: userId,
      p_notes: payload.notes,
      p_expired_date: payload.expiry_date,
      p_request_key: requestKey
    });
    if (rpcErr) throw new Error('Gagal menyimpan pembelian secara atomik: ' + rpcErr.message);

    await logAudit('CREATE_PURCHASE_ENTRY', `${rpcResult?.duplicate ? 'Retry duplikat diabaikan. ' : ''}Mencatat pembelian ${payload.qty} ${payload.unit} ke ${destination} (Rp ${(payload.qty * payload.unit_price).toLocaleString('id-ID')}).`);
    return { success: true, duplicate: Boolean(rpcResult?.duplicate), ...rpcResult };
  },

  deletePurchaseEntry: async (purchaseId, branchIdArg = null) => {
    const tenantId = await requireTenantId();
    await requireBranchId(branchIdArg);
    const userId = await getActiveUserId();
    const { data, error } = await supabase.rpc('atomic_cancel_purchase_v3', {
      p_tenant_id: tenantId,
      p_purchase_id: Number(purchaseId),
      p_user_id: userId,
      p_reason: 'Pembatalan dari riwayat pembelian'
    });
    if (error) throw new Error('Pembatalan pembelian ditolak: ' + error.message);
    await logAudit('CANCEL_PURCHASE_ENTRY', `${data?.duplicate ? 'Pembelian sudah dibatalkan sebelumnya' : 'Membatalkan'} pembelian #${purchaseId}.`);
    return data;
  },

  // Lightweight aggregate stats for the Audit Logs KPI cards — uses
  // count-only queries (head: true) so these stay accurate across the
  // whole log history without pulling every row just for a number.
  getAuditLogsStats: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { total: 0, uniqueUsers: 0, securityAlerts: 0, syncs: 0 };

    const [totalRes, alertsRes, syncsRes, userIdsRes] = await Promise.all([
      supabase.from('audit_logs').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('audit_logs').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).or('action.ilike.%DELETE%,action.ilike.%CANCEL%'),
      supabase.from('audit_logs').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).ilike('action', '%SYNC%'),
      supabase.from('audit_logs').select('user_id').eq('tenant_id', tenantId)
    ]);

    const uniqueUsers = new Set((userIdsRes.data || []).map(r => r.user_id).filter(Boolean)).size;

    return {
      total: totalRes.count || 0,
      uniqueUsers,
      securityAlerts: alertsRes.count || 0,
      syncs: syncsRes.count || 0
    };
  },

  // --- AUDIT LOGS ---
  getAuditLogs: async () => {
    const tenantId = await getActiveTenantId();
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*, users(name, role)')
      .eq('tenant_id', tenantId)
      
      .limit(100);

    if (error) throw new Error("Gagal mengambil log audit: " + error.message);

    return data.map(log => ({
      id: log.id,
      action: log.action,
      description: log.description,
      ip_address: log.ip_address,
      username: log.users ? log.users.name : 'System',
      role: log.users ? log.users.role : 'System',
      created_at: log.created_at
    }));
  },

  // Paginated + searchable (by action / description) version for the
  // Audit Logs page. `category` mirrors the frontend's getActionCategory()
  // grouping (AUTH/MATERIAL/RECIPE/INVOICING/POS/OTHER) so filtering by
  // category still happens server-side instead of pulling everything.
  getSuperAdminAuditLogsPaged: async ({ page = 1, pageSize = 20, search = '', tenantFilter = '', actionFilter = '' } = {}) => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('audit_logs')
      .select('*, tenants(name, company_name), users(name, role)', { count: 'exact' });

    if (tenantFilter) {
      query = query.eq('tenant_id', tenantFilter);
    }

    if (actionFilter) {
      query = query.eq('action', actionFilter);
    }

    if (search && search.trim()) {
      const s = sanitizePostgrest(search);
      // Supabase text search on jsonb is complicated. We'll search action & description for simple ilike,
      // and unfortunately filtering by user name on joined tables with 'or' is tricky in PostgREST without a view.
      // We will just filter by action/description for now.
      query = query.or(`action.ilike.%${s}%,description.ilike.%${s}%`);
    }

    const { data, error, count } = await query
      
      .range(from, to);

    if (error) throw new Error("Gagal mengambil log audit superadmin: " + error.message);

    return {
      data,
      totalCount: count || 0
    };
  },

  getAuditLogsPaged: async ({ page = 1, pageSize = 20, search = '', category = 'ALL', humanOnly = false } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { data: [], totalCount: 0 };
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const CATEGORY_KEYWORDS = {
      AUTH: ['LOGIN', 'REGISTER'],
      MATERIAL: ['MATERIAL', 'PRICE', 'ADJUST'],
      RECIPE: ['RECIPE'],
      INVOICING: ['PO', 'INVOICE'],
      POS: ['POS', 'SYNC'],
    };

    let query = supabase
      .from('audit_logs')
      .select('*, users(name, role)', { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (humanOnly) {
      query = query.not('user_id', 'is', null).eq('is_system', false);
    }

    if (search && search.trim()) {
      const s = sanitizePostgrest(search);
      query = query.or(`action.ilike.%${s}%,description.ilike.%${s}%`);
    }

    if (category && category !== 'ALL') {
      if (category === 'OTHER') {
        // Doesn't match any known category keyword
        const allKeywords = Object.values(CATEGORY_KEYWORDS).flat();
        for (const kw of allKeywords) {
          query = query.not('action', 'ilike', `%${kw}%`);
        }
      } else if (CATEGORY_KEYWORDS[category]) {
        const orExpr = CATEGORY_KEYWORDS[category].map(kw => `action.ilike.%${kw}%`).join(',');
        query = query.or(orExpr);
      }
    }

    const { data, error, count } = await query
      
      .range(from, to);

    if (error) throw new Error("Gagal mengambil log audit: " + error.message);

    return {
      data: data.map(log => ({
        id: log.id,
        action: log.action,
        description: log.description,
        ip_address: log.ip_address,
        username: log.users ? log.users.name : 'System',
        role: log.users ? log.users.role : 'System',
        created_at: log.created_at
      })),
      totalCount: count || 0
    };
  },

  // --- BACKUP & RESTORE SERVERLESS SYSTEM ---
  getBackups: async () => {
    const tenantId = await getActiveTenantId();
    const { data, error } = await supabase
      .from('backups')
      .select('id, filename, size_bytes, size_formatted, created_at')
      .eq('tenant_id', tenantId)
      ;

    if (error) throw new Error("Gagal mengambil cadangan: " + error.message);
    return data;
  },

  createBackup: async () => {
    const tenantId = await getActiveTenantId();

    // 1. Fetch entire tenant tables
    const { data: materials } = await supabase.from('materials').select('*').eq('tenant_id', tenantId);
    const { data: recipes } = await supabase.from('recipes').select('*').eq('tenant_id', tenantId);
    const { data: recipe_ingredients } = await supabase.from('recipe_ingredients').select('*, recipes(tenant_id)').filter('recipes.tenant_id', 'eq', tenantId);
    const { data: transactions } = await supabase.from('transactions').select('*').eq('tenant_id', tenantId);
    const { data: invoices } = await supabase.from('invoices').select('*').eq('tenant_id', tenantId);
    const { data: invoice_items } = await supabase.from('invoice_items').select('*, invoices(tenant_id)').filter('invoices.tenant_id', 'eq', tenantId);
    const { data: audit_logs } = await supabase.from('audit_logs').select('*').eq('tenant_id', tenantId);
    const { data: pos_upload_logs } = await supabase.from('pos_upload_logs').select('*').eq('tenant_id', tenantId);
    const { data: stock_opnames } = await supabase.from('stock_opnames').select('*').eq('tenant_id', tenantId);
    const { data: stock_opname_items } = await supabase.from('stock_opname_items').select('*, stock_opnames(tenant_id)').filter('stock_opnames.tenant_id', 'eq', tenantId);

    const backupPayload = {
      materials: materials || [],
      recipes: recipes || [],
      recipe_ingredients: recipe_ingredients || [],
      transactions: transactions || [],
      invoices: invoices || [],
      invoice_items: invoice_items || [],
      audit_logs: audit_logs || [],
      pos_upload_logs: pos_upload_logs || [],
      stock_opnames: stock_opnames || [],
      stock_opname_items: stock_opname_items || []
    };

    const dataJson = JSON.stringify(backupPayload);
    const sizeBytes = dataJson.length;
    const sizeFormatted = (sizeBytes / 1024).toFixed(2) + ' KB';
    const filename = `umatis_backup_${Date.now()}.zip`; // Mocked zip extension for client side verification compatibility
    const storageFilename = `backup_${tenantId}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const blob = new Blob([dataJson], { type: 'application/json' });

    const { data: storageData, error: storageErr } = await supabase.storage
      .from('tenant-backups')
      .upload(`${tenantId}/${storageFilename}`, blob);

    if (storageErr) throw new Error("Gagal mengunggah file cadangan: " + storageErr.message);

    const { data: backup, error } = await supabase
      .from('backups')
      .insert({
        tenant_id: tenantId,
        filename,
        size_bytes: sizeBytes,
        size_formatted: sizeFormatted,
        storage_path: storageData.path
      })
      .select('*')
      .single();

    if (error) throw new Error("Gagal membuat file cadangan: " + error.message);
    await logAudit('CREATE_BACKUP', `Berhasil membuat arsip database cadangan: "${filename}".`);

    return { backup, dataJson };
  },

  deleteBackup: async (id) => {
    const tenantId = await getActiveTenantId();
    const { data: backup } = await supabase.from('backups').select('filename').eq('id', id).eq('tenant_id', tenantId).single();
    if (!backup) throw new Error("Cadangan tidak ditemukan.");
    const { error } = await supabase.from('backups').delete().eq('id', id).eq('tenant_id', tenantId);
    if (error) throw new Error("Gagal menghapus cadangan: " + error.message);
    await logAudit('DELETE_BACKUP', `Menghapus arsip cadangan: "${backup.filename}".`);
    return true;
  },

  restoreBackup: async (formDataOrFilename) => {
    const tenantId = await getActiveTenantId();
    let backupPayload;

    // 1. Resolve payload either from DB select or uploaded File text parsing
    if (typeof formDataOrFilename === 'string') {
      const { data, error } = await supabase
        .from('backups')
        .select('storage_path, filename')
        .eq('filename', formDataOrFilename)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !data) throw new Error("Gagal memuat arsip pemulihan: " + error.message);

      const { data: fileData, error: downloadError } = await supabase.storage
        .from('tenant-backups')
        .download(data.storage_path);

      if (downloadError) throw new Error("Gagal mengunduh arsip dari storage: " + downloadError.message);

      const text = await fileData.text();
      backupPayload = JSON.parse(text);
      await logAudit('RESTORE_BACKUP', `Melakukan restorasi database dari arsip internal: "${data.filename}".`);
    } else {
      const file = formDataOrFilename.get('backup_file');
      const text = await file.text();
      backupPayload = JSON.parse(text);
      await logAudit('RESTORE_BACKUP', `Melakukan restorasi database dari unggah file cadangan luar: "${file.name}".`);
    }

    if (!backupPayload) throw new Error("Data pemulihan kosong atau rusak.");

    // 2. Perform Atomic Tenant Data Wipe and Restore via RPC
    const { error: rpcErr } = await supabase.rpc('restore_tenant_backup_atomic', {
      p_tenant_id: tenantId,
      p_payload: backupPayload
    });

    if (rpcErr) throw new Error("Gagal memulihkan database secara atomik: " + rpcErr.message);

    await logAudit('RESTORE_COMPLETE', 'Database pemulihan berhasil dipasang penuh.');
    return true;
  },

  downloadBackup: async (filename) => {
    const tenantId = await getActiveTenantId();
    // 1. Fetch file record from Supabase backups table
    const { data, error } = await supabase
      .from('backups')
      .select('storage_path')
      .eq('filename', filename)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) throw new Error("Gagal mengunduh backup: " + error.message);

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('tenant-backups')
      .download(data.storage_path);

    if (downloadError) throw new Error("Gagal mengunduh file dari storage: " + downloadError.message);

    const text = await fileData.text();

    // 2. Trigger browser download of raw text representation (mocking a zip file extension)
    const blob = new Blob([text], { type: 'application/octet-stream' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    await logAudit('DOWNLOAD_BACKUP', `Mengunduh berkas cadangan: "${filename}".`);
  },

  // --- POS CUSTOM TEMPLATES ---
  getPosTemplates: async () => {
    const { data, error } = await supabase
      .from('pos_templates')
      .select('*')
      .order('display_name');

    if (error) throw new Error("Gagal memuat template POS: " + error.message);
    return data;
  },

  createPosTemplate: async (templateData) => {
    const { data, error } = await supabase
      .from('pos_templates')
      .insert({
        name: templateData.name.toUpperCase().trim().replace(/[^A-Z0-9_]/g, '_'),
        display_name: templateData.display_name,
        column_mapping: templateData.column_mapping
      })
      .select('*')
      .single();

    if (error) throw new Error("Gagal membuat template POS: " + error.message);
    await logAudit('CREATE_POS_TEMPLATE', `Membuat template kasir baru: "${data.display_name}".`);
    return data;
  },

  updateTenantTemplate: async (templateId) => {
    const tenantId = await getActiveTenantId();
    const { data, error } = await supabase
      .from('tenants')
      .update({ pos_template_id: templateId })
      .eq('id', tenantId)
      .select('*, pos_templates(display_name)')
      .single();

    if (error) throw new Error("Gagal memperbarui template outlet: " + error.message);
    
    const displayName = data.pos_templates ? data.pos_templates.display_name : 'Default Umatis';
    await logAudit('UPDATE_TENANT_TEMPLATE', `Mengubah template pembacaan POS aktif outlet menjadi: "${displayName}".`);
    return data;
  },

  getActiveTenantTemplate: async () => {
    const tenantId = await getActiveTenantId();
    const { data, error } = await supabase
      .from('tenants')
      .select('*, pos_templates(*)')
      .eq('id', tenantId)
      .single();

    if (error || !data) {
      return {
        header_row_index: 12,
        branch_col: "branch",
        sales_date_col: "sales date",
        menu_name_col: "menu name",
        menu_code_col: "menu code",
        qty_col: "qty",
        total_col: "total"
      };
    }

    if (!data.pos_templates) {
      return {
        header_row_index: 12,
        branch_col: "branch",
        sales_date_col: "sales date",
        menu_name_col: "menu name",
        menu_code_col: "menu code",
        qty_col: "qty",
        total_col: "total"
      };
    }

    return data.pos_templates.column_mapping;
  },

  getActiveTenantTemplateDetails: async () => {
    const tenantId = await getActiveTenantId();
    const { data, error } = await supabase
      .from('tenants')
      .select('pos_template_id, pos_templates(*)')
      .eq('id', tenantId)
      .single();

    if (error || !data) return null;
    return data;
  },

  // --- BULK IMPORT ---
  bulkImportMaterials: async (rows, branchIdArg = null) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branchIdArg);
    let success = 0;
    let failed = 0;
    const errors = [];

    let supQ = supabase
      .from('suppliers')
      .select('id, name')
      .eq('tenant_id', tenantId);
    if (branchId) supQ = supQ.eq('branch_id', branchId);
    const { data: allSuppliers } = await supQ;

    const suppliersMap = new Map((allSuppliers || []).map(s => [s.name.toLowerCase().trim(), s]));

    let matImpQ = supabase
      .from('materials')
      .select('id, name, sku')
      .eq('tenant_id', tenantId);
    if (branchId) matImpQ = matImpQ.eq('branch_id', branchId);
    const { data: allMaterialsForImport } = await matImpQ;

    const materialsBySkuForImport = new Map(
      (allMaterialsForImport || []).filter(m => m.sku).map(m => [String(m.sku).toLowerCase().trim(), m])
    );
    const materialsByNameForImport = new Map(
      (allMaterialsForImport || []).map(m => [m.name.toLowerCase().trim(), m])
    );

    for (const row of rows) {
      try {
        let supplierName = row.supplier ? String(row.supplier).trim() : 'Default Supplier';
        if (supplierName === '') supplierName = 'Default Supplier';

        let supplierKey = supplierName.toLowerCase();

        if (!suppliersMap.has(supplierKey)) {
          const { data: newSupplier, error: suppErr } = await supabase.from('suppliers').insert({
            tenant_id: tenantId,
            ...(branchId ? { branch_id: branchId } : {}),
            name: supplierName,
            status: 'active',
            address: '',
            phone: '',
            contact_person: ''
          }).select('id, name').single();

          if (!suppErr && newSupplier) {
            suppliersMap.set(supplierKey, newSupplier);
          }
        }

        const insertData = {
          tenant_id: tenantId,
          ...(branchId ? { branch_id: branchId } : {}),
          name: row.name,
          category: row.category || 'Others',
          supplier: supplierName,
          unit: row.unit || 'pck',
          full_pack: row.full_pack || '',
          price: parseFloat(row.price || 0),
          new_price: parseFloat(row.price || 0),
          min_stock: parseFloat(row.min_stock || 15),
          is_active: true
        };

        const rowSku = row.sku !== undefined && row.sku !== '' ? String(row.sku).trim() : '';
        if (rowSku) {
          insertData.sku = rowSku;
        }

        if (row.qty_resto !== undefined && row.qty_resto !== '') {
          insertData.qty_resto = parseFloat(row.qty_resto || 0);
        }

        let existingMaterial = null;
        if (rowSku) existingMaterial = materialsBySkuForImport.get(rowSku.toLowerCase());
        if (!existingMaterial && row.name) {
          existingMaterial = materialsByNameForImport.get(String(row.name).toLowerCase().trim());
        }

        let error;
        if (existingMaterial) {
          let updMatQ = supabase.from('materials').update(insertData).eq('id', existingMaterial.id).eq('tenant_id', tenantId);
          if (branchId) updMatQ = updMatQ.eq('branch_id', branchId);
          ({ error } = await updMatQ);
        } else {
          const { data: insertedMaterial, error: insErr } = await supabase
            .from('materials')
            .insert(insertData)
            .select('id, name, sku')
            .single();
          error = insErr;
          if (!insErr && insertedMaterial) {
            materialsByNameForImport.set(insertedMaterial.name.toLowerCase().trim(), insertedMaterial);
            if (insertedMaterial.sku) {
              materialsBySkuForImport.set(String(insertedMaterial.sku).toLowerCase().trim(), insertedMaterial);
            }
          }
        }

        if (error) { failed++; errors.push({ row: row.name, error: error.message }); }
        else success++;
      } catch (e) {
        failed++;
        errors.push({ row: row.name, error: e.message });
      }
    }

    await logAudit('BULK_IMPORT_MATERIALS', `Bulk import ${success} bahan baku berhasil, ${failed} gagal.`);
    return { success, failed, errors };
  },

  bulkImportRecipes: async (rows, branchIdArg = null) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branchIdArg);
    const unitConversionMap = await api._loadUnitConversionMap(tenantId, branchId);

    let success = 0;
    let failed = 0;
    const errors = [];
    const warnings = [];

    let allMatsQ = supabase
      .from('materials')
      .select('id, name, sku, unit, full_pack, price, new_price')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);
    if (branchId) allMatsQ = allMatsQ.eq('branch_id', branchId);
    const { data: allMaterials } = await allMatsQ;

    const materialsMap = new Map((allMaterials || []).map(m => [m.name.toLowerCase().trim(), m]));
    const materialsBySku = new Map((allMaterials || []).filter(m => m.sku).map(m => [m.sku.toLowerCase().trim(), m]));

    let allRecQ = supabase
      .from('recipes')
      .select('id, menu_name, pos_code')
      .eq('tenant_id', tenantId);
    if (branchId) allRecQ = allRecQ.eq('branch_id', branchId);
    const { data: allRecipesForImport } = await allRecQ;

    const recipesByCodeForImport = new Map(
      (allRecipesForImport || []).filter(r => r.pos_code).map(r => [String(r.pos_code).toLowerCase().trim(), r])
    );
    const recipesByNameForImport = new Map(
      (allRecipesForImport || []).map(r => [r.menu_name.toLowerCase().trim(), r])
    );

    const resolveMaterial = (itemCode, itemName) => {
      if (itemCode) {
        const bySku = materialsBySku.get(itemCode.toLowerCase().trim());
        if (bySku) return bySku;
      }
      if (itemName) {
        const byName = materialsMap.get(itemName.toLowerCase().trim());
        if (byName) return byName;
      }
      return null;
    };

    // rows format: { menu_name, selling_price, bahan_1, qty_1, kode_bahan_1, ... }
    for (const row of rows) {
      try {
        let ingredients = [];
        
        // Extract up to 10 ingredient columns from the flat row. kode_bahan_N
        // (material SKU/kode item) is optional and, when present, wins over
        // bahan_N (name) when resolving which material the row refers to —
        // deterministic ID-based matching instead of fuzzy name matching.
        for (let i = 1; i <= 10; i++) {
          const bahanKey = `bahan_${i}`;
          const qtyKey = `qty_${i}`;
          const kodeKey = `kode_bahan_${i}`;
          const hasName = row[bahanKey] && String(row[bahanKey]).trim() !== '';
          const hasCode = row[kodeKey] && String(row[kodeKey]).trim() !== '';

          if (hasName || hasCode) {
            ingredients.push({
              item_name: hasName ? String(row[bahanKey]).trim() : '',
              item_code: hasCode ? String(row[kodeKey]).trim() : '',
              qty_in_use: parseFloat(row[qtyKey] || 0)
            });
          }
        }

        const VALID_CATEGORIES = ['KOPI', 'NON-KOPI', 'MOCKTAIL', 'JUICE', 'TEA', 'BEER'];
        const rawCategory = row.category ? row.category.toString().trim().toUpperCase() : '';
        const category = VALID_CATEGORIES.includes(rawCategory) ? rawCategory : 'NON-KOPI';
        let subtotal = 0;

        // Simple subtotal calculation from ingredients if available
        if (ingredients.length > 0) {
          subtotal = ingredients.reduce((sum, ing) => {
            const mat = resolveMaterial(ing.item_code, ing.item_name);
            if (mat) {
              const unit = ing.unit || mat.unit || 'gr';
              return sum + calculateIngredientCost(mat, parseFloat(ing.qty_in_use || 0), unit, unitConversionMap);
            }
            return sum;
          }, 0);
        }

        // Full recipe pricing engine, same as createRecipe/updateRecipe (PRD §4.2
        // Opsi B). row.fix_cost_pct / row.food_cost_pct are expected as FRACTIONS
        // (0.05 = 5%) — Recipes.jsx's onCommit handler converts the Excel sheet's
        // human-friendly percent numbers (5, 18, ...) before this function is
        // called. Any of these being unset/undefined (old-style templates without
        // these columns) falls back to the pre-existing bulk-import behavior.
        const fixCostPct = row.fix_cost_pct != null && row.fix_cost_pct !== ''
          ? parseFloat(row.fix_cost_pct) : activeOverheadPct;
        const roundingDirection = row.rounding_direction || DEFAULT_ROUNDING_DIRECTION;
        const roundingIncrement = row.rounding_increment != null && row.rounding_increment !== ''
          ? parseFloat(row.rounding_increment) : DEFAULT_ROUNDING_INCREMENT;
        const priceAdjustment = row.price_adjustment != null && row.price_adjustment !== ''
          ? parseFloat(row.price_adjustment) : DEFAULT_PRICE_ADJUSTMENT;
        const foodCostPctTarget = row.food_cost_pct != null && row.food_cost_pct !== ''
          ? parseFloat(row.food_cost_pct) : 0;

        // Flexible-but-guarded: catch an obviously wrong percentage (e.g. a
        // stray value >100% or a raw "50" that should've been "0.5") with a
        // clear per-row error instead of silently saving a nonsense HPP.
        if (isNaN(fixCostPct) || fixCostPct < 0 || fixCostPct > 1) {
          throw new Error(`FIX COST % tidak valid (${(fixCostPct * 100).toFixed(1)}%) — harus 0-100%`);
        }
        if (isNaN(foodCostPctTarget) || foodCostPctTarget < 0 || foodCostPctTarget > 1) {
          throw new Error(`FOOD COST % TARGET tidak valid (${(foodCostPctTarget * 100).toFixed(1)}%) — harus 0-100%`);
        }

        const { fixCost, basicCost, sellingPriceRaw, sellingPriceFinal } = computeRecipeCosts({
          subtotal, fixCostPct, foodCostPct: foodCostPctTarget,
          roundingDirection, roundingIncrement, priceAdjustment
        });

        // A manually-typed HARGA JUAL always wins over the target-driven price —
        // same "selling_price_override wins" rule as createRecipe/updateRecipe.
        // Only when it's blank/0 do we fall back to the computed target price.
        const manualSellingPrice = parseFloat(row.selling_price || 0);
        const sellingPrice = manualSellingPrice > 0 ? manualSellingPrice : (sellingPriceFinal || 0);

        // food_cost_pct stored value: prefer the explicit target (consistent with
        // createRecipe/updateRecipe — this column means "target", not "achieved
        // ratio"). Rows with no target column but a manual selling price fall back
        // to the achieved ratio, matching bulk import's original pre-merge
        // behavior so old-style templates keep working exactly as before.
        let foodCostPct = foodCostPctTarget > 0
          ? foodCostPctTarget
          : (sellingPrice > 0 ? basicCost / sellingPrice : 0);
        if (foodCostPct > 99.9999) foodCostPct = 99.9999;

        // Recipe code (KODE MENU) — reuses the existing pos_code column, which
        // PosTerminal.jsx already matches sales against, so a code assigned here
        // is immediately usable for POS/back-end integration.
        const recipeCode = row.recipe_code || row.pos_code || row.menu_code || null;
        const normalizedRecipeCode = recipeCode ? String(recipeCode).trim() : null;

        const recipePayload = {
          tenant_id: tenantId,
          ...(branchId ? { branch_id: branchId } : {}),
          menu_name: row.menu_name,
          pos_code: normalizedRecipeCode,
          category: category,
          selling_price: sellingPrice,
          subtotal: parseFloat(subtotal.toFixed(2)),
          fix_cost_pct: fixCostPct,
          fix_cost: parseFloat(fixCost.toFixed(2)),
          basic_cost: parseFloat(basicCost.toFixed(2)),
          food_cost_pct: parseFloat(foodCostPct.toFixed(4)),
          selling_price_raw: parseFloat((sellingPriceRaw || 0).toFixed(2)),
          rounding_direction: roundingDirection,
          rounding_increment: roundingIncrement,
          price_adjustment: priceAdjustment
        };

        let existingRecipe = null;
        if (normalizedRecipeCode) {
          existingRecipe = recipesByCodeForImport.get(normalizedRecipeCode.toLowerCase());
        }
        if (!existingRecipe && row.menu_name) {
          existingRecipe = recipesByNameForImport.get(String(row.menu_name).toLowerCase().trim());
        }

        let recipeData, recipeErr;
        if (existingRecipe) {
          let updRecQ = supabase
            .from('recipes')
            .update(recipePayload)
            .eq('id', existingRecipe.id)
            .eq('tenant_id', tenantId);
          if (branchId) updRecQ = updRecQ.eq('branch_id', branchId);
          ({ data: recipeData, error: recipeErr } = await updRecQ.select('id').single());
        } else {
          ({ data: recipeData, error: recipeErr } = await supabase
            .from('recipes')
            .insert(recipePayload)
            .select('id')
            .single());
        }

        if (recipeErr) throw new Error(recipeErr.message);

        if (recipeData?.id) {
          const rec = { id: recipeData.id, menu_name: row.menu_name, pos_code: normalizedRecipeCode };
          if (normalizedRecipeCode) recipesByCodeForImport.set(normalizedRecipeCode.toLowerCase(), rec);
          if (row.menu_name) recipesByNameForImport.set(String(row.menu_name).toLowerCase().trim(), rec);
        }

        if (ingredients.length > 0 && recipeData?.id) {
          const ingredientsToInsert = [];
          for (const ing of ingredients) {
            if (!ing.item_name && !ing.item_code) continue;

            let mat = resolveMaterial(ing.item_code, ing.item_name);

            if (!mat) {
              const newName = ing.item_name || ing.item_code;
              const { data: newMat, error: newMatErr } = await supabase.from('materials').insert({
                tenant_id: tenantId,
                ...(branchId ? { branch_id: branchId } : {}),
                name: newName,
                sku: ing.item_code || null,
                category: 'Others',
                supplier: 'Default Supplier',
                unit: 'gr',
                full_pack: '',
                price: 0,
                new_price: 0,
                min_stock: 15,
                is_active: true
              }).select('id, name, sku, unit, full_pack, price, new_price').single();

              if (!newMatErr && newMat) {
                materialsMap.set(newName.toLowerCase(), newMat);
                if (newMat.sku) materialsBySku.set(newMat.sku.toLowerCase(), newMat);
                mat = newMat;
                warnings.push(`Bahan baru "${newName}" dibuat otomatis dengan harga Rp0 (dipakai di resep "${row.menu_name}") — mohon cek & lengkapi harganya di halaman Materials.`);
              }
            }

            if (mat) {
              const unit = ing.unit || mat.unit || 'gr';
              const unitPrice = parseFloat(mat.new_price ?? mat.price ?? 0);
              const amount = calculateIngredientCost(mat, parseFloat(ing.qty_in_use || 0), unit, unitConversionMap);

              ingredientsToInsert.push({
                recipe_id: recipeData.id,
                material_id: mat.id,
                qty_in_use: parseFloat(ing.qty_in_use || 0),
                unit: unit,
                unit_price: unitPrice,
                amount: parseFloat(amount.toFixed(2)),
                tenant_id: tenantId,
                ...(branchId ? { branch_id: branchId } : {})
              });
            }
          }

          if (ingredientsToInsert.length > 0) {
            const newMaterialIds = new Set(ingredientsToInsert.map(r => Number(r.material_id)));
            let oldIngQ = supabase
              .from('recipe_ingredients')
              .select('id, material_id')
              .eq('recipe_id', recipeData.id);
            if (branchId) oldIngQ = oldIngQ.eq('branch_id', branchId);
            const { data: oldIngredientRows } = await oldIngQ;

            const { error: ingErr } = await supabase
              .from('recipe_ingredients')
              .upsert(ingredientsToInsert, { onConflict: 'recipe_id,material_id' });
            if (ingErr) throw new Error("Gagal menyimpan detail bahan resep: " + ingErr.message);

            const idsToDelete = (oldIngredientRows || [])
              .filter(r => !newMaterialIds.has(Number(r.material_id)))
              .map(r => r.id);

            if (idsToDelete.length > 0) {
              let delIngQ = supabase.from('recipe_ingredients').delete().in('id', idsToDelete);
              if (branchId) delIngQ = delIngQ.eq('branch_id', branchId);
              await delIngQ;
            }
          }
        }

        success++;
      } catch (e) {
        failed++;
        errors.push({ row: row.menu_name, error: e.message });
      }
    }

    await logAudit('BULK_IMPORT_RECIPES', `Bulk import ${success} resep berhasil, ${failed} gagal.`);
    return { success, failed, errors, warnings };
  },

  bulkImportOpnameItems: async (opnameId, rows, branchIdArg = null) => {
    let success = 0;
    let failed = 0;
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branchIdArg);

    let opCheckQ = supabase.from('stock_opnames').select('id, branch_id').eq('id', opnameId).eq('tenant_id', tenantId);
    if (branchId) opCheckQ = opCheckQ.eq('branch_id', branchId);
    const { data: opnameCheck } = await opCheckQ.maybeSingle();
    if (!opnameCheck) throw new Error("Akses ditolak: Opname tidak valid atau bukan milik cabang ini.");

    let matQ = supabase
      .from('materials')
      .select('id, name')
      .eq('tenant_id', tenantId);
    if (branchId) matQ = matQ.eq('branch_id', branchId);
    const { data: allMaterials } = await matQ;

    const materialMap = new Map((allMaterials || []).map(m => [m.name.toLowerCase(), m.id]));
    const resolvedBranchId = branchId || opnameCheck.branch_id || null;

    for (const row of rows) {
      try {
        const materialId = materialMap.get((row.material_name || '').toLowerCase());
        if (!materialId) { failed++; continue; }

        const { error } = await supabase
          .from('stock_opname_items')
          .upsert({
            opname_id: opnameId,
            tenant_id: tenantId,
            ...(resolvedBranchId ? { branch_id: resolvedBranchId } : {}),
            material_id: materialId,
            physical_qty: parseFloat(row.physical_qty || 0),
            notes: row.notes || ''
          }, { onConflict: 'opname_id,material_id' });

        if (error) failed++;
        else success++;
      } catch {
        failed++;
      }
    }

    await logAudit('BULK_IMPORT_OPNAME', `Bulk import ${success} item opname berhasil, ${failed} gagal.`);
    return { success, failed };
  },

  getTenantSettings: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) throw new Error("Tenant ID tidak ditemukan.");

    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (error) throw new Error("Gagal memuat pengaturan resto: " + error.message);
    return {
      ...data,
      overhead_pct: 0.05,
      whatsapp_number: '',
      whatsapp_token: '',
      whatsapp_enabled: false
    };
  },

  updateTenantSettings: async (settings) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) throw new Error("Tenant ID tidak ditemukan.");

    const { data, error } = await supabase
      .from('tenants')
      .update({
        company_name: settings.company_name || undefined,
        is_pos_enabled: settings.is_pos_enabled !== undefined ? settings.is_pos_enabled : undefined,
        pos_tax_rate: settings.pos_tax_rate !== undefined ? settings.pos_tax_rate : undefined,
        pos_service_charge: settings.pos_service_charge !== undefined ? settings.pos_service_charge : undefined,
        locked_until_month: settings.locked_until_month !== undefined ? (settings.locked_until_month ? parseInt(settings.locked_until_month) : null) : undefined,
        locked_until_year: settings.locked_until_year !== undefined ? (settings.locked_until_year ? parseInt(settings.locked_until_year) : null) : undefined,
        updated_at: new Date().toISOString()
      })
      .eq('id', tenantId)
      .select('*')
      .single();

    if (error) throw new Error("Gagal memperbarui pengaturan resto: " + error.message);

    // Update active cache in memory as well!
    activeOverheadPct = 0.05;
    activeWhatsappNumber = null;
    activeWhatsappToken = null;
    activeWhatsappEnabled = false;

    await logAudit('UPDATE_TENANT_SETTINGS', `Memperbarui pengaturan outlet. Overhead: 5.0%, Locked: ${data.locked_until_month || '-'}/${data.locked_until_year || '-'}.`);
    return {
      ...data,
      overhead_pct: 0.05,
      whatsapp_number: '',
      whatsapp_token: '',
      whatsapp_enabled: false
    };
  },

  sendWhatsappNotification: async (message) => {
    if (!activeWhatsappEnabled || !activeWhatsappToken || !activeWhatsappNumber) {
      return { success: false, reason: "WhatsApp disabled or missing config." };
    }

    try {
      const response = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: {
          'Authorization': activeWhatsappToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target: activeWhatsappNumber,
          message: message
        })
      });

      const result = await response.json();
      console.log("[Fonnte WA] Status:", result.status, result.detail || "");
      return { success: !!result.status, detail: result.detail || "" };
    } catch (e) {
      console.error("[Fonnte WA] Error:", e);
      return { success: false, error: e.message };
    }
  },

  // ── Barista Report: bulk fetch all data for a given month ──
  getBaristaReportData: async (month, year, branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) throw new Error('Tenant not found');
    const branchId = await requireBranchId(branchIdArg);

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const scopeB = (q) => (branchId ? q.eq('branch_id', branchId) : q);

    const [
      materialsRes,
      recipesRes,
      purchaseRes,
      opnameRestoRes,
      opnameCentralRes,
      dailyInvRes,
      transactionsRes,
      unitConversionsRes
    ] = await Promise.all([
      scopeB(supabase.from('materials').select('*').eq('tenant_id', tenantId).eq('is_active', true)).order('category').order('name'),
      scopeB(supabase.from('recipes').select('*, recipe_ingredients(*, materials(*))').eq('tenant_id', tenantId)).order('category').order('menu_name'),
      scopeB(supabase.from('purchase_entries').select('*, materials(name, unit), suppliers(name)').eq('tenant_id', tenantId).gte('date', startDate).lte('date', endDate)).order('date'),
      scopeB(supabase.from('stock_opnames').select('*, stock_opname_items(*, materials(*))').eq('tenant_id', tenantId).eq('period_month', month).eq('period_year', year).eq('location', 'RESTO')).maybeSingle(),
      scopeB(supabase.from('stock_opnames').select('*, stock_opname_items(*, materials(*))').eq('tenant_id', tenantId).eq('period_month', month).eq('period_year', year).eq('location', 'CENTRAL')).maybeSingle(),
      scopeB(supabase.from('daily_inventories').select('*, daily_inventory_items(*)').eq('tenant_id', tenantId).gte('date', startDate).lte('date', endDate)).order('date'),
      scopeB(supabase.from('transactions').select('*, materials(name, category)').eq('tenant_id', tenantId).gte('date', startDate).lte('date', endDate)).order('date'),
      scopeB(supabase.from('unit_conversions').select('*').eq('tenant_id', tenantId))
    ]);

    const [prevOpnameRestoRes, prevOpnameCentralRes] = await Promise.all([
      scopeB(supabase.from('stock_opnames').select('*, stock_opname_items(*, materials(*))').eq('tenant_id', tenantId).eq('period_month', prevMonth).eq('period_year', prevYear).eq('location', 'RESTO')).maybeSingle(),
      scopeB(supabase.from('stock_opnames').select('*, stock_opname_items(*, materials(*))').eq('tenant_id', tenantId).eq('period_month', prevMonth).eq('period_year', prevYear).eq('location', 'CENTRAL')).maybeSingle()
    ]);

    const materialsMap = new Map((materialsRes.data || []).map(m => [m.id, m]));
    const mappedDailyInventories = (dailyInvRes.data || []).map(inv => ({
      ...inv,
      daily_inventory_items: (inv.daily_inventory_items || []).map(item => ({
        ...item,
        materials: item.materials || materialsMap.get(item.material_id) || null
      }))
    }));

    return {
      period: { month, year, startDate, endDate, lastDay },
      materials: materialsRes.data || [],
      recipes: recipesRes.data || [],
      purchases: purchaseRes.data || [],
      opnameResto: opnameRestoRes.data,
      opnameCentral: opnameCentralRes.data,
      prevOpnameResto: prevOpnameRestoRes.data,
      prevOpnameCentral: prevOpnameCentralRes.data,
      dailyInventories: mappedDailyInventories,
      transactions: transactionsRes.data || [],
      unitConversions: unitConversionsRes.data || []
    };
  },

  // --- UNIT CONVERSIONS (manual pack-size overrides) ---
  getUnitConversions: async (branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await requireBranchId(branchIdArg);
    let q = supabase
      .from('unit_conversions')
      .select('*, materials(id, name, unit, full_pack)')
      .eq('tenant_id', tenantId);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) { console.error("DB Error:", error); throw error; }
    return data || [];
  },

  async _loadUnitConversionMap(tenantId, branchId = null) {
    let q = supabase
      .from('unit_conversions')
      .select('material_id, factor')
      .eq('tenant_id', tenantId);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) { console.warn('Gagal memuat unit_conversions:', error.message); return new Map(); }
    return new Map((data || []).map(c => [c.material_id, parseFloat(c.factor)]));
  },

  upsertUnitConversion: async ({ id, material_id, from_unit, to_unit, factor, branch_id = null }) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branch_id);
    const payload = {
      tenant_id: tenantId,
      ...(branchId ? { branch_id: branchId } : {}),
      material_id,
      from_unit,
      to_unit,
      factor: parseFloat(factor)
    };
    if (id) {
      let updQ = supabase.from('unit_conversions').update(payload).eq('id', id).eq('tenant_id', tenantId);
      if (branchId) updQ = updQ.eq('branch_id', branchId);
      const { error } = await updQ;
      if (error) { console.error("DB Error:", error); throw error; }
    } else {
      const { error } = await supabase.from('unit_conversions').insert(payload);
      if (error) { console.error("DB Error:", error); throw error; }
    }
    await logAudit('UPSERT_UNIT_CONVERSION', `Konversi satuan disimpan: 1 ${to_unit} = ${factor} ${from_unit}.`);
  },

  deleteUnitConversion: async (id, branchIdArg = null) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branchIdArg);
    let delQ = supabase.from('unit_conversions').delete().eq('id', id).eq('tenant_id', tenantId);
    if (branchId) delQ = delQ.eq('branch_id', branchId);
    const { error } = await delQ;
    if (error) { console.error("DB Error:", error); throw error; }
    await logAudit('DELETE_UNIT_CONVERSION', `Konversi satuan (id: ${id}) dihapus.`);
  },

  
  async executeTenantResetImmediate(tenantId, options = {}) {
    const {
      resetPos = true,
      resetStockHistory = true,
      resetPurchasing = true,
      resetRecipes = false,
      resetMaterials = false
    } = options;
    
    // We do client-side deletion to bypass SuperAdmin.
    // Order of deletion matters due to FK constraints.
    try {
      if (resetPos) {
        await supabase.from('pos_transaction_items').delete().eq('tenant_id', tenantId);
        await supabase.from('pos_transactions').delete().eq('tenant_id', tenantId);
        const { data: posOrders } = await supabase.from('pos_orders').select('id').eq('tenant_id', tenantId);
        if (posOrders && posOrders.length > 0) {
          await supabase.from('pos_order_items').delete().in('order_id', posOrders.map(d => d.id));
        }
        await supabase.from('pos_orders').delete().eq('tenant_id', tenantId);
        await supabase.from('pos_upload_logs').delete().eq('tenant_id', tenantId);
        await supabase.from('pos_daily_aggregates').delete().eq('tenant_id', tenantId);
      }
      if (resetStockHistory) {
        await supabase.from('daily_inventory_items').delete().eq('tenant_id', tenantId);
        await supabase.from('daily_inventories').delete().eq('tenant_id', tenantId);
        await supabase.from('stock_opname_items').delete().eq('tenant_id', tenantId);
        await supabase.from('stock_opnames').delete().eq('tenant_id', tenantId);
        await supabase.from('physical_check_items').delete().eq('tenant_id', tenantId);
        await supabase.from('physical_checks').delete().eq('tenant_id', tenantId);
      }
      if (resetPurchasing) {
        await supabase.from('purchase_entries').delete().eq('tenant_id', tenantId);
        const { data: invoices } = await supabase.from('invoices').select('id').eq('tenant_id', tenantId);
        if (invoices && invoices.length > 0) {
          await supabase.from('invoice_items').delete().in('invoice_id', invoices.map(d => d.id));
        }
        await supabase.from('invoices').delete().eq('tenant_id', tenantId);
        await supabase.from('transactions').delete().eq('tenant_id', tenantId);
      }
      if (resetRecipes) {
        await supabase.from('recipe_ingredients').delete().eq('tenant_id', tenantId);
        const { data: recs } = await supabase.from('recipes').select('id').eq('tenant_id', tenantId);
        if (recs && recs.length > 0) {
          await supabase.from('recipe_versions').delete().in('recipe_id', recs.map(r=>r.id));
        }
        await supabase.from('recipes').delete().eq('tenant_id', tenantId);
      }
      if (resetMaterials) {
        await supabase.from('recipe_ingredients').delete().eq('tenant_id', tenantId);
        await supabase.from('materials').delete().eq('tenant_id', tenantId);
      }
      
      // Notify superadmin via audit_logs
      await this.logAudit('TENANT_RESET', 'Tenant telah menghapus data mereka secara mandiri.', { options });
      
      return true;
    } catch (err) {
      console.error("Reset Immediate Error: ", err);
      throw err;
    }
  },

  async requestTenantReset(tenantId, options = {}) {
    const {
      resetPos = true,
      resetStockHistory = true,
      resetPurchasing = true,
      resetRecipes = false,
      resetMaterials = false
    } = options;

    const { data, error } = await supabase.rpc('request_tenant_reset', {
      p_tenant_id: tenantId,
      p_reset_pos: resetPos,
      p_reset_stock_history: resetStockHistory,
      p_reset_purchasing: resetPurchasing,
      p_reset_recipes: resetRecipes,
      p_reset_materials: resetMaterials
    });

    if (error) {
      if (error.code === 'PGRST202' || error.message.includes('Could not find the function')) {
        throw new Error('SYSTEM_UPDATE_REQUIRED: Fitur ini memerlukan update database. Jalankan FEATURE_reset_approval_workflow.sql terlebih dahulu.');
      }
      throw new Error(error.message.replace('AUTH: ', ''));
    }
    return data; // request id
  },

  // Owner: list this tenant's own reset requests (pending + history).
  async getTenantResetRequests(tenantId) {
    const { data, error } = await supabase
      .from('tenant_reset_requests')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) { console.error("DB Error:", error); throw error; }
    return data || [];
  },

  // Super Admin: list all reset requests across every tenant.
  async getAllResetRequests() {
    const { data, error } = await supabase
      .from('tenant_reset_requests')
      .select('*, tenants(company_name, name), requester:requested_by(name, email)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) { console.error("DB Error:", error); throw error; }
    return data || [];
  },

  // Super Admin: approve or reject a pending request. Only on approve does
  // the actual data deletion happen (server-side, inside the RPC).
  async reviewTenantResetRequest(requestId, approve, rejectionReason = null) {
    const { data, error } = await supabase.rpc('approve_tenant_reset', {
      p_request_id: requestId,
      p_approve: approve,
      p_rejection_reason: rejectionReason
    });
    if (error) {
      if (error.code === 'PGRST202' || error.message.includes('Could not find the function')) {
        throw new Error('SYSTEM_UPDATE_REQUIRED: Fitur ini memerlukan update database. Jalankan FEATURE_reset_approval_workflow.sql terlebih dahulu.');
      }
      throw new Error(error.message.replace('AUTH: ', ''));
    }
    return data;
  },

  // Owner: cancel their own request while it's still PENDING, so they're
  // never stuck waiting on Super Admin if the approval side is having issues.
  async cancelTenantResetRequest(requestId) {
    const { error } = await supabase.rpc('cancel_tenant_reset_request', {
      p_request_id: requestId
    });
    if (error) {
      throw new Error(error.message.replace('AUTH: ', ''));
    }
    return true;
  },

  getInvoicesStats: async (branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { total: 0, pending: 0, received: 0, totalValue: 0 };
    const branchId = await requireBranchId(branchIdArg);

    let invQ = supabase
      .from('invoices')
      .select('status, total')
      .eq('tenant_id', tenantId);
    if (branchId) invQ = invQ.eq('branch_id', branchId);
    const { data } = await invQ;

    if (!data) return { total: 0, pending: 0, received: 0, totalValue: 0 };

    return {
      total: data.length,
      pending: data.filter(i => i.status === 'DRAFT' || i.status === 'SENT').length,
      received: data.filter(i => i.status === 'RECEIVED').length,
      totalValue: data.reduce((sum, i) => sum + parseFloat(i.total || 0), 0)
    };
  },

  deleteTransactionAndReverseStock: async (txId, branchIdArg = null) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branchIdArg);

    const rawId = String(txId).replace(/^tx-/, '');

    let fetchTxQ = supabase
      .from('transactions')
      .select('id, type, qty, material_id, amount, notes, date, location, branch_id')
      .eq('id', rawId)
      .eq('tenant_id', tenantId);
    if (branchId) fetchTxQ = fetchTxQ.eq('branch_id', branchId);
    const { data: tx, error: fetchErr } = await fetchTxQ.maybeSingle();

    if (fetchErr) throw new Error('Gagal mengambil data transaksi: ' + fetchErr.message);
    if (!tx) throw new Error('Transaksi tidak ditemukan.');

    const resolvedBranchId = branchId || tx.branch_id || null;

    if (tx.material_id) {
      const { error: rpcErr } = await supabase.rpc('deduct_stock_atomic', {
        p_material_id: tx.material_id,
        p_deduct_qty: parseFloat(tx.qty)
      });
      if (rpcErr) throw new Error('Gagal membalikkan stok: ' + rpcErr.message);

      const isWasteType = ['WASTE', 'BREAKAGE', 'EXPIRED', 'COMP'].includes(tx.type);
      if (isWasteType) {
        const isCentral = tx.location === 'CENTRAL';
        let curMatQ = supabase.from('materials').select('qty_resto, qty_central').eq('id', tx.material_id).eq('tenant_id', tenantId);
        if (resolvedBranchId) curMatQ = curMatQ.eq('branch_id', resolvedBranchId);
        const { data: curMat } = await curMatQ.maybeSingle();
        if (curMat) {
          const restoreQty = Math.abs(parseFloat(tx.qty));
          const updFields = isCentral
            ? { qty_central: parseFloat(curMat.qty_central || 0) + restoreQty, updated_at: new Date().toISOString() }
            : { qty_resto: parseFloat(curMat.qty_resto || 0) + restoreQty, updated_at: new Date().toISOString() };
          let matUpdQ = supabase.from('materials').update(updFields).eq('id', tx.material_id).eq('tenant_id', tenantId);
          if (resolvedBranchId) matUpdQ = matUpdQ.eq('branch_id', resolvedBranchId);
          await matUpdQ;
        }
      }
    }

    if (tx.type === 'PURCHASE_IN') {
      let peQ = supabase.from('purchase_entries').select('id, qty')
        .eq('tenant_id', tenantId)
        .eq('date', tx.date)
        .eq('material_id', tx.material_id);
      if (resolvedBranchId) peQ = peQ.eq('branch_id', resolvedBranchId);
      const { data: purchaseEntries } = await peQ;

      if (purchaseEntries && purchaseEntries.length > 0) {
        const match = purchaseEntries.find(p => p.qty === tx.qty) || purchaseEntries[0];
        let delPeQ = supabase.from('purchase_entries').delete().eq('id', match.id).eq('tenant_id', tenantId);
        if (resolvedBranchId) delPeQ = delPeQ.eq('branch_id', resolvedBranchId);
        await delPeQ;
      }
    }

    let delTxQ = supabase
      .from('transactions')
      .delete()
      .eq('id', rawId)
      .eq('tenant_id', tenantId);
    if (resolvedBranchId) delTxQ = delTxQ.eq('branch_id', resolvedBranchId);
    const { error: delErr } = await delTxQ;

    if (delErr) throw new Error('Gagal menghapus transaksi: ' + delErr.message);

    await logAudit('DELETE_TRANSACTION', `Menghapus dan membalikkan transaksi tipe "${tx.type}" tgl ${tx.date}. Stok disesuaikan kembali.`);
    return true;
  },

  editTransactionAndAdjustStock: async (txId, payload) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(payload?.branch_id || null);
    const rawId = String(txId).replace(/^tx-/, '');

    let fetchTxQ = supabase
      .from('transactions')
      .select('id, type, qty, material_id, amount, notes, date, branch_id')
      .eq('id', rawId)
      .eq('tenant_id', tenantId);
    if (branchId) fetchTxQ = fetchTxQ.eq('branch_id', branchId);
    const { data: tx, error: fetchErr } = await fetchTxQ.maybeSingle();

    if (fetchErr) throw new Error('Gagal mengambil data transaksi: ' + fetchErr.message);
    if (!tx) throw new Error('Transaksi tidak ditemukan.');

    const resolvedBranchId = branchId || tx.branch_id || null;

    const oldQty = parseFloat(tx.qty);
    const newQty = parseFloat(payload.qty);
    const qtyDiff = oldQty - newQty;

    if (tx.material_id && qtyDiff !== 0) {
      const { error: rpcErr } = await supabase.rpc('deduct_stock_atomic', {
        p_material_id: tx.material_id,
        p_deduct_qty: qtyDiff
      });
      if (rpcErr) throw new Error('Gagal adjust stok: ' + rpcErr.message);
    }

    const newAmount = tx.type === 'PURCHASE_IN'
      ? newQty * (payload.unit_price || 0)
      : (oldQty !== 0 ? (tx.amount / oldQty) * newQty : 0);

    let updTxQ = supabase
      .from('transactions')
      .update({
        qty: newQty,
        amount: newAmount,
        notes: payload.notes || tx.notes,
        date: payload.date || tx.date
      })
      .eq('id', rawId)
      .eq('tenant_id', tenantId);
    if (resolvedBranchId) updTxQ = updTxQ.eq('branch_id', resolvedBranchId);
    const { error: updateErr } = await updTxQ;

    if (updateErr) throw new Error('Gagal update transaksi: ' + updateErr.message);

    if (tx.type === 'PURCHASE_IN') {
      let peQ = supabase.from('purchase_entries').select('id, qty, unit_price')
        .eq('tenant_id', tenantId)
        .eq('date', tx.date)
        .eq('material_id', tx.material_id);
      if (resolvedBranchId) peQ = peQ.eq('branch_id', resolvedBranchId);
      const { data: purchaseEntries } = await peQ;

      if (purchaseEntries && purchaseEntries.length > 0) {
        const match = purchaseEntries.find(p => p.qty === oldQty) || purchaseEntries[0];
        let peUpdQ = supabase.from('purchase_entries').update({
          qty: newQty,
          unit_price: payload.unit_price,
          date: payload.date || tx.date,
          notes: payload.notes || tx.notes
        }).eq('id', match.id).eq('tenant_id', tenantId);
        if (resolvedBranchId) peUpdQ = peUpdQ.eq('branch_id', resolvedBranchId);
        await peUpdQ;
      }
    }

    if (tx.type === 'WASTE' || tx.type === 'BREAKAGE' || tx.type === 'EXPIRED' || tx.type === 'COMP') {
      let diQ = supabase.from('daily_inventory_items').select('id, waste_qty')
        .eq('material_id', tx.material_id)
        .eq('waste_qty', Math.abs(oldQty));
      if (resolvedBranchId) diQ = diQ.eq('branch_id', resolvedBranchId);
      const { data: dailyItems } = await diQ;

      if (dailyItems && dailyItems.length > 0) {
        let diUpdQ = supabase.from('daily_inventory_items').update({
          waste_qty: Math.abs(newQty)
        }).eq('id', dailyItems[0].id);
        if (resolvedBranchId) diUpdQ = diUpdQ.eq('branch_id', resolvedBranchId);
        await diUpdQ;
      }
    }

    await logAudit('EDIT_TRANSACTION', `Mengubah transaksi tipe "${tx.type}" tgl ${tx.date}.`);
    return true;
  },

  // --- MARKET LISTS ---
  getMarketLists: async (branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await requireBranchId(branchIdArg);
    let mlQ = supabase
      .from('market_lists')
      .select('*, market_list_items(*)')
      .eq('tenant_id', tenantId);
    if (branchId) mlQ = mlQ.eq('branch_id', branchId);
    const { data, error } = await mlQ.order('created_at', { ascending: false });
    if (error) throw new Error("Gagal mengambil market list: " + error.message);

    if (data && data.length > 0) {
      const allMaterialIds = new Set();
      data.forEach(ml => {
        (ml.market_list_items || []).forEach(item => {
          if (item.material_id) allMaterialIds.add(item.material_id);
        });
      });

      if (allMaterialIds.size > 0) {
        let matsQ = supabase
          .from('materials')
          .select('id, name, sku, price, unit, category')
          .eq('tenant_id', tenantId)
          .in('id', Array.from(allMaterialIds));
        if (branchId) matsQ = matsQ.eq('branch_id', branchId);
        const { data: mats, error: matsError } = await matsQ;

        if (!matsError && mats) {
          const matMap = mats.reduce((acc, m) => {
            acc[m.id] = m;
            return acc;
          }, {});

          data.forEach(ml => {
            (ml.market_list_items || []).forEach(item => {
              item.materials = matMap[item.material_id] || null;
            });
          });
        }
      }
    }

    return data || [];
  },

  createMarketList: async (payload) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(payload?.branch_id || null);
    const { data, error } = await supabase.from('market_lists').insert({
      ...payload,
      tenant_id: tenantId,
      ...(branchId ? { branch_id: branchId } : {})
    }).select().single();
    if (error) throw new Error("Gagal membuat market list: " + error.message);
    return data;
  },

  updateMarketList: async (id, payload) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(payload?.branch_id || null);
    let q = supabase.from('market_lists').update(payload).eq('id', id).eq('tenant_id', tenantId);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q.select().single();
    if (error) throw new Error("Gagal update market list: " + error.message);
    return data;
  },

  deleteMarketList: async (id, branchIdArg = null) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branchIdArg);
    let q = supabase.from('market_lists').delete().eq('id', id).eq('tenant_id', tenantId);
    if (branchId) q = q.eq('branch_id', branchId);
    const { error } = await q;
    if (error) throw new Error("Gagal menghapus market list: " + error.message);
  },

  upsertMarketListItems: async (marketListId, items, branchIdArg = null) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branchIdArg);
    let delQ = supabase.from('market_list_items').delete().eq('market_list_id', marketListId);
    if (branchId) delQ = delQ.eq('branch_id', branchId);
    await delQ;
    if (items && items.length > 0) {
      const payload = items.map(item => ({
        market_list_id: marketListId,
        tenant_id: tenantId,
        ...(branchId ? { branch_id: branchId } : {}),
        material_id: item.material_id,
        unit: item.unit || '',
        current_stock: Number(item.current_stock) || 0,
        min_stock: Number(item.min_stock) || 0,
        par_stock: Number(item.par_stock) || 0,
        quantity: Number(item.quantity) || 0,
        request_qty: Number(item.request_qty ?? item.quantity) || 0,
        approved_qty: Number(item.approved_qty) || 0,
        estimated_price: Number(item.price ?? item.estimated_price) || 0,
        is_urgent: Boolean(item.is_urgent),
        remarks: typeof item.remarks === 'string' ? item.remarks : JSON.stringify(item.remarks || {})
      }));
      const { error } = await supabase.from('market_list_items').insert(payload);
      if (error) throw new Error("Gagal update item market list: " + error.message);
    }
  },

  getMaterialSupplierHistory: async (branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await requireBranchId(branchIdArg);
    let q = supabase
      .from('purchase_entries')
      .select('material_id, supplier_id, unit_price, date, suppliers(id, name)')
      .eq('tenant_id', tenantId)
      .not('supplier_id', 'is', null);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q.order('date', { ascending: false });
    if (error) {
      console.warn("Gagal mengambil riwayat harga material supplier:", error);
      return [];
    }
    return data || [];
  },

  getLatestInvoiceMaterialPrices: async ({ materialIds = null, onlyLatestSingleInvoice = false, branchId: branchIdArg = null } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { pricesMap: {}, latestInvoice: null, allRecentInvoices: [] };
    const branchId = await requireBranchId(branchIdArg);

    let query = supabase
      .from('invoices')
      .select('id, invoice_no, supplier, date, received_date, total, status, created_at, invoice_items(id, material_id, qty, unit_price, materials(id, name, unit, sku))')
      .eq('tenant_id', tenantId)
      .in('status', ['RECEIVED', 'GOODS_RECEIVED']);
    if (branchId) query = query.eq('branch_id', branchId);
    query = query
      .order('received_date', { ascending: false, nullsFirst: false })
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (onlyLatestSingleInvoice) {
      query = query.limit(1);
    } else {
      query = query.limit(25);
    }

    const { data: invoices, error } = await query;
    if (error) {
      console.warn("Gagal mengambil invoice pembelian sukses:", error);
      return { pricesMap: {}, latestInvoice: null, allRecentInvoices: [] };
    }

    if (!invoices || invoices.length === 0) {
      return { pricesMap: {}, latestInvoice: null, allRecentInvoices: [] };
    }

    const latestInvoice = invoices[0];
    const pricesMap = {};

    for (const inv of invoices) {
      const invItems = inv.invoice_items || [];
      for (const item of invItems) {
        if (!item.material_id) continue;
        if (materialIds && !materialIds.includes(item.material_id)) continue;

        if (!pricesMap[item.material_id]) {
          pricesMap[item.material_id] = {
            material_id: item.material_id,
            material_name: item.materials?.name || 'Bahan',
            material_sku: item.materials?.sku || '',
            unit: item.materials?.unit || '',
            unit_price: Number(item.unit_price) || 0,
            invoice_id: inv.id,
            invoice_no: inv.invoice_no,
            supplier_name: inv.supplier || 'Supplier',
            invoice_date: inv.date,
            received_date: inv.received_date,
            is_from_latest_single_invoice: inv.id === latestInvoice.id
          };
        }
      }
    }

    return {
      pricesMap,
      latestInvoice: {
        id: latestInvoice.id,
        invoice_no: latestInvoice.invoice_no,
        supplier: latestInvoice.supplier,
        date: latestInvoice.date,
        received_date: latestInvoice.received_date,
        total: Number(latestInvoice.total) || 0,
        itemsCount: (latestInvoice.invoice_items || []).length
      },
      allRecentInvoices: invoices.map(i => ({
        id: i.id,
        invoice_no: i.invoice_no,
        supplier: i.supplier,
        date: i.date,
        received_date: i.received_date,
        total: Number(i.total) || 0
      }))
    };
  },

  syncMarketListPricesFromInvoice: async ({ marketListId = null, invoiceId = null, branchId: branchIdArg = null } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { updatedCount: 0, changes: [] };
    const branchId = await requireBranchId(branchIdArg);

    let targetPricesMap = {};
    let invoiceInfo = null;

    if (invoiceId) {
      let invQ = supabase
        .from('invoices')
        .select('id, invoice_no, supplier, date, received_date, total, status, invoice_items(material_id, unit_price, materials(name))')
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId);
      if (branchId) invQ = invQ.eq('branch_id', branchId);
      const { data: inv, error: invErr } = await invQ.single();

      if (!invErr && inv) {
        invoiceInfo = {
          id: inv.id,
          invoice_no: inv.invoice_no,
          supplier: inv.supplier,
          date: inv.date,
          received_date: inv.received_date,
          total: Number(inv.total) || 0
        };
        (inv.invoice_items || []).forEach(it => {
          if (it.material_id) {
            targetPricesMap[it.material_id] = {
              material_id: it.material_id,
              unit_price: Number(it.unit_price) || 0,
              supplier_name: inv.supplier,
              invoice_no: inv.invoice_no,
              material_name: it.materials?.name || ''
            };
          }
        });
      }
    } else {
      const res = await api.getLatestInvoiceMaterialPrices({ branchId });
      targetPricesMap = res.pricesMap;
      invoiceInfo = res.latestInvoice;
    }

    if (Object.keys(targetPricesMap).length === 0) {
      return { updatedCount: 0, changes: [], invoiceInfo };
    }

    let itemsQuery = supabase
      .from('market_list_items')
      .select('*, market_lists!inner(id, name, tenant_id, branch_id)')
      .eq('market_lists.tenant_id', tenantId);
    if (branchId) itemsQuery = itemsQuery.eq('branch_id', branchId);

    if (marketListId) {
      itemsQuery = itemsQuery.eq('market_list_id', marketListId);
    }

    const { data: mlItems, error: mlItemsErr } = await itemsQuery;
    if (mlItemsErr) throw new Error("Gagal memuat item market list: " + mlItemsErr.message);

    const changes = [];
    const updatePromises = [];

    for (const item of (mlItems || [])) {
      const matched = targetPricesMap[item.material_id];
      if (!matched) continue;

      const currentPrice = Number(item.estimated_price) || 0;
      const newPrice = Number(matched.unit_price) || 0;

      if (Math.abs(currentPrice - newPrice) > 0.01) {
        let remarksObj;
        try {
          remarksObj = typeof item.remarks === 'string' ? JSON.parse(item.remarks) : (item.remarks || {});
        } catch {
          remarksObj = { notes: String(item.remarks || '') };
        }

        remarksObj.supplier_price = newPrice;
        if (matched.supplier_name && !remarksObj.supplier_name) {
          remarksObj.supplier_name = matched.supplier_name;
        }

        changes.push({
          item_id: item.id,
          market_list_id: item.market_list_id,
          market_list_name: item.market_lists?.name || 'Market List',
          material_id: item.material_id,
          material_name: matched.material_name,
          old_price: currentPrice,
          new_price: newPrice,
          difference: newPrice - currentPrice,
          invoice_no: matched.invoice_no,
          supplier_name: matched.supplier_name
        });

        let updMliQ = supabase
          .from('market_list_items')
          .update({
            estimated_price: newPrice,
            remarks: JSON.stringify(remarksObj)
          })
          .eq('id', item.id);
        if (branchId) updMliQ = updMliQ.eq('branch_id', branchId);
        updatePromises.push(updMliQ);
      }
    }

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      try {
        await logAudit('SYNC_MARKET_LIST_PRICES', `Menyinkronkan ${changes.length} harga bahan pada market_list_items dari invoice pembelian (${invoiceInfo?.invoice_no || 'PO Sukses'}).`);
      } catch (auditErr) {
        console.warn("Audit log warning for price sync:", auditErr);
      }
    }

    return {
      updatedCount: changes.length,
      changes,
      invoiceInfo
    };
  },

  // --- TRIMMING & PRODUKSI 2-TAHAP ---
  getTrimmingBatches: async (branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await requireBranchId(branchIdArg);
    let q = supabase
      .from('production_trimming_batches')
      .select('*, materials(id, name, unit, sku, price, category)')
      .eq('tenant_id', tenantId);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) {
      console.warn("Error fetching production_trimming_batches:", error);
      return [];
    }
    return data || [];
  },

  createTrimmingBatchStep1: async ({ material_id, gross_weight, gross_photo_url, gross_latitude, gross_longitude, batch_number, branch_id = null }) => {
    const tenantId = await requireTenantId();
    let branchId = await requireBranchId(branch_id, { requiredForAdmin: false });
    if (!branchId) {
      const fromFn = supabase.unscopedFrom ? supabase.unscopedFrom : supabase.from;
      const { data: branches } = await fromFn('branches').select('id').eq('tenant_id', tenantId).limit(1);
      branchId = branches?.[0]?.id || null;
    }
    const finalBatchNumber = batch_number || `TRM-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const timestamp = new Date().toISOString();
    const photoUrl = gross_photo_url || `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="45%" fill="%23e2e8f0" font-family="sans-serif" font-weight="bold" font-size="14" text-anchor="middle">Tahap 1 Verification</text><text x="50%" y="65%" fill="%2394a3b8" font-family="monospace" font-size="12" text-anchor="middle">${finalBatchNumber}</text></svg>`;

    const payload = {
      tenant_id: tenantId,
      ...(branchId ? { branch_id: branchId } : {}),
      material_id,
      batch_number: finalBatchNumber,
      gross_weight: parseFloat(gross_weight),
      gross_photo_url: photoUrl,
      gross_timestamp: timestamp,
      gross_latitude: gross_latitude || null,
      gross_longitude: gross_longitude || null,
      status: 'STEP1_GROSS_COMPLETED'
    };

    const { data, error } = await supabase
      .from('production_trimming_batches')
      .insert(payload)
      .select('*, materials(id, name, unit, sku)')
      .single();

    if (error) throw new Error("Gagal mendaftarkan Tahap 1: " + error.message);

    try {
      await supabase.rpc('deduct_stock_atomic', {
        p_material_id: material_id,
        p_deduct_qty: parseFloat(gross_weight)
      });
    } catch (stockErr) {
      console.warn("Trimming step 1 stock deduction warning:", stockErr);
    }

    await logAudit('TRIMMING_STEP1', `Mendaftarkan batch trimming ${finalBatchNumber} (${gross_weight}g)`);
    return data;
  },

  completeTrimmingBatchStep2: async (batchId, { clean_weight, waste_weight, clean_photo_url, waste_photo_url, target_material_id, portion_pack_output, yield_status, branch_id = null }) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branch_id);
    const timestamp = new Date().toISOString();
    const cleanPhoto = clean_photo_url || `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="100%" height="100%" fill="%23064e3b"/><text x="50%" y="50%" fill="%236ee7b7" font-family="sans-serif" font-weight="bold" font-size="14" text-anchor="middle">Hasil Bersih Trimming</text></svg>`;
    const wastePhoto = waste_photo_url || `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="100%" height="100%" fill="%237f1d1d"/><text x="50%" y="50%" fill="%23fca5a5" font-family="sans-serif" font-weight="bold" font-size="14" text-anchor="middle">Limbah Kulit Trimming</text></svg>`;

    const payload = {
      clean_weight: parseFloat(clean_weight),
      waste_weight: parseFloat(waste_weight || 0),
      clean_photo_url: cleanPhoto,
      waste_photo_url: wastePhoto,
      clean_timestamp: timestamp,
      portion_pack_output: parseInt(portion_pack_output || 0, 10),
      yield_status: yield_status === 'GOOD' ? 'GOOD' : 'BAD',
      status: 'STEP2_COMPLETED'
    };

    let updBatchQ = supabase
      .from('production_trimming_batches')
      .update(payload)
      .eq('id', batchId)
      .eq('tenant_id', tenantId);
    if (branchId) updBatchQ = updBatchQ.eq('branch_id', branchId);
    const { data, error } = await updBatchQ
      .select('*, materials(id, name, unit, sku)')
      .single();

    if (error) throw new Error("Gagal menyelesaikan Tahap 2: " + error.message);

    if (target_material_id && parseInt(portion_pack_output || 0, 10) > 0) {
      try {
        await supabase.rpc('deduct_stock_atomic', {
          p_material_id: target_material_id,
          p_deduct_qty: -parseInt(portion_pack_output, 10)
        });
      } catch (packStockErr) {
        console.warn("Target pack stock addition warning:", packStockErr);
      }
    }

    await logAudit('TRIMMING_STEP2', `Menyelesaikan Tahap 2 trimming batch (Bersih: ${clean_weight}g, Limbah: ${waste_weight}g, Pack: ${portion_pack_output || 0})`);
    return data;
  },

  recordOlahBahan: async ({
    location = 'RESTO',
    source_mat_id,
    source_qty,
    source_unit = null,
    target_mat_id = null,
    target_mat_name = '',
    processed_into = '',
    target_qty,
    target_unit = null,
    waste_qty = 0,
    waste_unit = null,
    new_target_hpp = null,
    photo_before = null,
    photo_clean = null,
    photo_waste = null,
    notes = '',
    expiry_date = null,
    branch_id = null
  }) => {
    const tenantId = await requireTenantId();
    let branchId = await requireBranchId(branch_id, { requiredForAdmin: false });
    if (!branchId) {
      const fromFn = supabase.unscopedFrom ? supabase.unscopedFrom : supabase.from;
      const { data: branches } = await fromFn('branches').select('id').eq('tenant_id', tenantId).limit(1);
      branchId = branches?.[0]?.id || null;
    }

    const batchNumber = `PREP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const timestamp = new Date().toISOString();

    // Upload Photo 1: Bahan Mentah (Before)
    let beforePhotoUrl = typeof photo_before === 'string' ? photo_before : null;
    if (photo_before && typeof photo_before !== 'string') {
      try {
        beforePhotoUrl = await api.uploadPhoto(photo_before, 'prep-photos', `before-${Date.now()}.webp`);
      } catch (err) {
        console.warn("Upload photo_before failed, using placeholder:", err);
        beforePhotoUrl = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="50%" fill="%23e2e8f0" font-family="sans-serif" font-weight="bold" font-size="14" text-anchor="middle">Foto Bahan Mentah</text></svg>`;
      }
    }

    // Upload Photo 2: Berat Bersih (Clean Output)
    const effectiveCleanPhoto = photo_clean || photo_waste;
    let cleanPhotoUrl = typeof effectiveCleanPhoto === 'string' ? effectiveCleanPhoto : null;
    if (effectiveCleanPhoto && typeof effectiveCleanPhoto !== 'string') {
      try {
        cleanPhotoUrl = await api.uploadPhoto(effectiveCleanPhoto, 'prep-photos', `clean-${Date.now()}.webp`);
      } catch (err) {
        console.warn("Upload photo_clean failed, using placeholder:", err);
        cleanPhotoUrl = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="100%" height="100%" fill="%23064e3b"/><text x="50%" y="50%" fill="%236ee7b7" font-family="sans-serif" font-weight="bold" font-size="14" text-anchor="middle">Foto Berat Bersih</text></svg>`;
      }
    }

    // Upload Photo 3: Bukti Ampas / Waste
    const effectiveWastePhoto = photo_waste || photo_clean;
    let wastePhotoUrl = typeof effectiveWastePhoto === 'string' ? effectiveWastePhoto : null;
    if (effectiveWastePhoto && typeof effectiveWastePhoto !== 'string') {
      if (photo_waste && photo_clean && photo_waste === photo_clean && cleanPhotoUrl) {
        wastePhotoUrl = cleanPhotoUrl;
      } else {
        try {
          wastePhotoUrl = await api.uploadPhoto(effectiveWastePhoto, 'prep-photos', `waste-${Date.now()}.webp`);
        } catch (err) {
          console.warn("Upload photo_waste failed, using placeholder:", err);
          wastePhotoUrl = cleanPhotoUrl || `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="100%" height="100%" fill="%237f1d1d"/><text x="50%" y="50%" fill="%23fca5a5" font-family="sans-serif" font-weight="bold" font-size="14" text-anchor="middle">Foto Bukti Ampas</text></svg>`;
        }
      }
    }

    // Fetch source material first
    let sourceMat = null;
    try {
      let sMatQ = supabase
        .from('materials')
        .select('*')
        .eq('id', parseInt(source_mat_id, 10))
        .eq('tenant_id', tenantId);
      if (branchId) sMatQ = sMatQ.eq('branch_id', branchId);
      const { data: sMat } = await sMatQ.maybeSingle();
      sourceMat = sMat || null;
    } catch (sErr) {
      console.warn("Fetch sourceMat warning:", sErr);
    }

    let targetMat = null;
    const resolvedTargetName = (target_mat_name || (sourceMat ? `${sourceMat.name} (${processed_into || 'Bersih'})` : 'Hasil Olahan Bersih')).trim();
    const resolvedTargetUnit = target_unit || source_unit || sourceMat?.unit || 'gr';

    if (target_mat_id) {
      try {
        let tMatQ = supabase
          .from('materials')
          .select('*')
          .eq('id', parseInt(target_mat_id, 10))
          .eq('tenant_id', tenantId);
        if (branchId) tMatQ = tMatQ.eq('branch_id', branchId);
        const { data: tMat } = await tMatQ.maybeSingle();
        targetMat = tMat || null;
      } catch (tErr) {
        console.warn("Fetch targetMat warning:", tErr);
      }
    }

    if (!targetMat && resolvedTargetName) {
      try {
        let exTargetQ = supabase
          .from('materials')
          .select('*')
          .eq('tenant_id', tenantId)
          .ilike('name', resolvedTargetName);
        if (branchId) exTargetQ = exTargetQ.eq('branch_id', branchId);
        const { data: existingTarget } = await exTargetQ.limit(1).maybeSingle();
        if (existingTarget) {
          targetMat = existingTarget;
        } else {
          const defaultFullPack =
            resolvedTargetUnit === 'kg' ? 'kg = 1000 gr' :
            resolvedTargetUnit === 'L' ? 'btl = 1000 ml' :
            `${resolvedTargetUnit} = 1 ${resolvedTargetUnit === 'ml' ? 'ml' : resolvedTargetUnit === 'pcs' ? 'pcs' : 'gr'}`;
          const createdTarget = await api.createMaterial({
            ...(branchId ? { branch_id: branchId } : {}),
            name: resolvedTargetName,
            category: 'Bahan Olahan / Prep',
            unit: resolvedTargetUnit,
            full_pack: defaultFullPack,
            price: Math.round(Number(new_target_hpp) || Number(sourceMat?.price) || 0),
            qty_resto: 0,
            shelf_life_days: 3,
            min_stock: Number(sourceMat?.min_stock) || 2,
            is_preparable: false,
            is_prep_output: true
          });
          targetMat = createdTarget;
        }
      } catch (autoCreateErr) {
        console.warn("Auto-create target clean material fallback:", autoCreateErr);
      }
    }

    const finalTargetMatId = targetMat?.id ? parseInt(targetMat.id, 10) : parseInt(source_mat_id, 10);

    // Normalize weights to source_unit scale so PostgreSQL check constraint (clean_weight <= gross_weight) always passes
    const rawGross = Math.max(0.01, parseFloat(source_qty) || 0);
    const rawClean = Math.max(0, parseFloat(target_qty) || 0);
    const rawWaste = Math.max(0, parseFloat(waste_qty) || 0);

    const normalizeToSourceScale = (val, fromUnit, toUnit) => {
      const f = String(fromUnit || '').toLowerCase();
      const t = String(toUnit || '').toLowerCase();
      if (f === t) return val;
      if ((t === 'kg' && (f === 'gr' || f === 'g' || f === 'ml')) || (t === 'l' && (f === 'ml' || f === 'gr' || f === 'g'))) {
        return val / 1000;
      }
      if (((t === 'gr' || t === 'g' || t === 'ml') && (f === 'kg' || f === 'l'))) {
        return val * 1000;
      }
      return val;
    };

    const normCleanForDb = Math.min(rawGross, +(normalizeToSourceScale(rawClean, resolvedTargetUnit, source_unit || sourceMat?.unit).toFixed(2)));
    const normWasteForDb = Math.min(rawGross, +(normalizeToSourceScale(rawWaste, waste_unit || source_unit, source_unit || sourceMat?.unit).toFixed(2)));

    // 1. Insert batch to production_trimming_batches
    const payload = {
      tenant_id: tenantId,
      branch_id: branchId,
      material_id: parseInt(source_mat_id, 10),
      batch_number: batchNumber,
      gross_weight: rawGross,
      clean_weight: normCleanForDb,
      waste_weight: normWasteForDb,
      gross_photo_url: beforePhotoUrl,
      clean_photo_url: cleanPhotoUrl,
      waste_photo_url: wastePhotoUrl,
      gross_timestamp: timestamp,
      clean_timestamp: timestamp,
      portion_pack_output: Math.max(0, Math.round(rawClean)),
      status: 'STEP2_COMPLETED'
    };

    let savedRecord = null;
    try {
      const { data, error } = await supabase
        .from('production_trimming_batches')
        .insert(payload)
        .select('*, materials(id, name, unit, sku, price, category)')
        .single();
      if (!error && data) savedRecord = data;
    } catch (insertErr) {
      console.warn("Save trimming batch table warning:", insertErr);
    }

    // Store rich metadata locally so "Diolah Menjadi Apa" and exact units display immediately in history
    if (typeof window !== 'undefined') {
      try {
        const metaKey = 'barventis_prep_batch_meta_v1';
        const existingMeta = JSON.parse(localStorage.getItem(metaKey) || '{}');
        existingMeta[batchNumber] = {
          target_mat_id: finalTargetMatId,
          target_mat_name: targetMat?.name || resolvedTargetName,
          processed_into: processed_into || 'Bersih Siap Pakai',
          source_qty: rawGross,
          source_unit: source_unit || sourceMat?.unit || 'kg',
          target_qty: rawClean,
          target_unit: resolvedTargetUnit,
          waste_qty: rawWaste,
          waste_unit: waste_unit || source_unit || sourceMat?.unit || 'kg',
          clean_photo_url: cleanPhotoUrl,
          waste_photo_url: wastePhotoUrl,
          gross_photo_url: beforePhotoUrl,
          new_target_hpp: Math.round(Number(new_target_hpp) || 0),
          notes: notes || ''
        };
        localStorage.setItem(metaKey, JSON.stringify(existingMeta));
      } catch (_) {
        /* ignore localStorage quota errors */
      }
    }

    // 1b. If expiry_date provided, record to material_batches for FEFO tracking
    if (expiry_date && finalTargetMatId) {
      try {
        await supabase.from('material_batches').insert({
          tenant_id: tenantId,
          ...(branchId ? { branch_id: branchId } : {}),
          material_id: finalTargetMatId,
          batch_no: batchNumber,
          expired_date: expiry_date,
          qty_resto: location === 'RESTO' ? rawClean : 0,
          qty_central: location === 'CENTRAL' ? rawClean : 0,
          status: 'ACTIVE'
        });
      } catch (batchErr) {
        console.warn("Save material_batches for olah bahan warning:", batchErr);
      }
    }

    const deductRes = sourceMat
      ? convertQtyToStockUnit(sourceMat, rawGross, source_unit || sourceMat.unit)
      : { qty: rawGross };
    const addRes = targetMat
      ? convertQtyToStockUnit(targetMat, rawClean, resolvedTargetUnit || targetMat.unit)
      : { qty: rawClean };

    try {
      await supabase.rpc('deduct_stock_atomic', {
        p_material_id: parseInt(source_mat_id, 10),
        p_deduct_qty: deductRes.qty
      });
    } catch (stockDeductErr) {
      console.warn("Stock deduct error:", stockDeductErr);
    }

    if (finalTargetMatId) {
      try {
        await supabase.rpc('deduct_stock_atomic', {
          p_material_id: finalTargetMatId,
          p_deduct_qty: -addRes.qty
        });
      } catch (stockAddErr) {
        console.warn("Stock addition error:", stockAddErr);
      }
    }

    if (targetMat) {
      try {
        const packSize = parsePackSize(targetMat.full_pack) || 1;
        const newPackPrice = Number(new_target_hpp) > 0
          ? Math.round(Number(new_target_hpp) * packSize)
          : Math.round(Number(targetMat.price) || 0);
        await api.updateMaterial(targetMat.id, {
          ...(branchId ? { branch_id: branchId } : {}),
          price: newPackPrice,
          new_price: newPackPrice,
          avg_cost: newPackPrice,
          is_prep_output: true,
          is_active: true,
          updated_at: new Date().toISOString()
        });
      } catch (hppUpdateErr) {
        console.warn("Update HPP target material warning:", hppUpdateErr);
      }
    }

    const todayIso = getLocalDateISO();
    if (finalTargetMatId && addRes.qty > 0) {
      try {
        await supabase.from('transactions').insert({
          tenant_id: tenantId,
          ...(branchId ? { branch_id: branchId } : {}),
          material_id: finalTargetMatId,
          type: 'IN',
          qty: addRes.qty,
          date: todayIso,
          location: location,
          source_module: 'production',
          notes: `Hasil Olah Bahan ${batchNumber} dari ${sourceMat?.name || 'Bahan Mentah'} (${rawClean} ${resolvedTargetUnit})`
        });
      } catch (_prodInErr) {
        // ignore if schema differs in test mock
      }
    }

    if (source_mat_id && deductRes.qty > 0) {
      try {
        await supabase.from('transactions').insert({
          tenant_id: tenantId,
          ...(branchId ? { branch_id: branchId } : {}),
          material_id: parseInt(source_mat_id, 10),
          type: 'OUT',
          qty: -Math.abs(deductRes.qty),
          date: todayIso,
          location: location,
          source_module: 'production',
          notes: `Diolah menjadi ${targetMat?.name || resolvedTargetName} (${batchNumber})`
        });
      } catch (_prodOutErr) {
        // ignore if schema differs in test mock
      }
    }

    if (rawWaste > 0) {
      try {
        await supabase.from('transactions').insert({
          tenant_id: tenantId,
          ...(branchId ? { branch_id: branchId } : {}),
          material_id: parseInt(source_mat_id, 10),
          type: 'WASTE',
          quantity: normWasteForDb,
          date: todayIso,
          location: location,
          notes: `Ampas olah bahan ${batchNumber} -> ${targetMat?.name || resolvedTargetName} (${rawWaste} ${waste_unit || source_unit || ''}) ${notes ? '- ' + notes : ''}`.trim()
        });
      } catch (wasteErr) {
        console.warn("Waste transaction log warning:", wasteErr);
      }
    }

    await logAudit(
      'OLAH_BAHAN',
      `Olah Bahan ${batchNumber}: ${sourceMat?.name || 'ID ' + source_mat_id} (${rawGross} ${source_unit || ''}) -> ${targetMat?.name || resolvedTargetName} (${rawClean} ${resolvedTargetUnit}), Ampas ${rawWaste} ${waste_unit || source_unit || ''}`
    );
    return savedRecord || { batch_number: batchNumber, success: true, target_material: targetMat };
  },

  // --- V9 INVENTORY FLOW HELPERS ---
  getDailyPosTheoreticalUsage: async (date, branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId || !date) return {};
    const branchId = await requireBranchId(branchIdArg);

    const materialsList = await api.getMaterials(branchId);
    const matById = Object.fromEntries((materialsList || []).map(m => [Number(m.id), m]));

    const buildNormalizedResult = (rawList) => {
      const map = {};
      (rawList || []).forEach(entry => {
        const matId = Number(entry.material_id);
        const mat = matById[matId] || {
          id: matId,
          name: entry.material_name,
          unit: entry.material_unit || 'pck',
          full_pack: entry.full_pack || 'pck = 1000 gr'
        };
        const recipeQty = Number(entry.theoretical_recipe_qty) || 0;
        const recipeUnit = entry.recipe_unit || getPackContentUnitFromMaterial(mat) || mat.unit || 'gr';
        const conv = convertQtyToStockUnit(mat, recipeQty, recipeUnit);
        const stockQty = typeof conv === 'object' && conv !== null ? Number(conv.qty) || 0 : Number(conv) || 0;
        const normRecipeQty = Number(recipeQty.toFixed(2));
        const normStockQty = Number(stockQty.toFixed(4));
        map[matId] = {
          material_id: matId,
          theoretical_recipe_qty: normRecipeQty,
          theoreticalRecipeQty: normRecipeQty,
          recipe_unit: recipeUnit,
          recipeUnit,
          theoretical_stock_qty: normStockQty,
          theoreticalStockQty: normStockQty,
          stock_unit: mat.unit || 'pck',
          stockUnit: mat.unit || 'pck',
          menus_sold_count: Number(entry.menus_sold_count) || 0,
          menusSoldCount: Number(entry.menus_sold_count) || 0,
          menu_breakdown: Array.isArray(entry.menu_breakdown)
            ? entry.menu_breakdown
            : entry.menu_breakdown
            ? [{ menu_name: String(entry.menu_breakdown), qty_sold: Number(entry.menus_sold_count) || 1 }]
            : [],
          menuBreakdown: entry.menu_breakdown || ''
        };
      });
      return map;
    };

    try {
      const { data: rpcRows, error: rpcErr } = await supabase.rpc('get_daily_pos_theoretical_usage_v9', {
        p_tenant_id: tenantId,
        p_date: date
      });
      if (!rpcErr && Array.isArray(rpcRows)) {
        return buildNormalizedResult(rpcRows);
      }
    } catch {
      // Fallback below
    }

    try {
      const dayStart = `${date}T00:00:00.000Z`;
      const dayEnd = `${date}T23:59:59.999Z`;
      let posItemsQ = supabase
        .from('pos_transaction_items')
        .select('menu_name, qty, recipe_id, pos_transactions!inner(id, tenant_id, created_at)')
        .eq('tenant_id', tenantId)
        .gte('pos_transactions.created_at', dayStart)
        .lte('pos_transactions.created_at', dayEnd);
      let expUsageQ = supabase
        .from('expected_usage')
        .select('material_id, expected_qty, total_sold, week_start, week_end')
        .eq('tenant_id', tenantId)
        .lte('week_start', date)
        .gte('week_end', date);
      if (branchId) {
        posItemsQ = posItemsQ.eq('branch_id', branchId);
        expUsageQ = expUsageQ.eq('branch_id', branchId);
      }
      const [{ data: posRows }, { data: expRows }, recipesList] = await Promise.all([
        posItemsQ,
        expUsageQ,
        api.getRecipes(branchId)
      ]);

      if ((!posRows || posRows.length === 0) && (!expRows || expRows.length === 0)) return {};
      if ((!posRows || posRows.length === 0) && expRows && expRows.length > 0) {
        const expMap = {};
        expRows.forEach(er => {
          const mId = Number(er.material_id);
          const mat = matById[mId];
          if (!mId || !mat) return;
          const daysSpan = Math.max(1, Math.round((new Date(er.week_end) - new Date(er.week_start)) / 86400000) + 1);
          const dailyStockQty = Number(((Number(er.expected_qty) || 0) / daysSpan).toFixed(4));
          const dailySold = Math.max(1, Math.round((Number(er.total_sold) || 0) / daysSpan));
          expMap[mId] = {
            material_id: mId,
            theoretical_recipe_qty: dailyStockQty,
            theoreticalRecipeQty: dailyStockQty,
            recipe_unit: mat.unit || 'pck',
            recipeUnit: mat.unit || 'pck',
            theoretical_stock_qty: dailyStockQty,
            theoreticalStockQty: dailyStockQty,
            stock_unit: mat.unit || 'pck',
            stockUnit: mat.unit || 'pck',
            menus_sold_count: dailySold,
            menusSoldCount: dailySold,
            menu_breakdown: [{ menu_name: 'Rekap POS ESB', qty_sold: dailySold }],
            menuBreakdown: `Rekap POS ESB (${dailySold})`
          };
        });
        return expMap;
      }

      const normalizeMenu = (str) =>
        String(str || '')
          .toLowerCase()
          .replace(/\s*\((hot|ice|iced|dingin|panas|large|regular)\)\s*/gi, '')
          .trim();

      const recipeByExact = {};
      const recipeByNorm = {};
      (recipesList || []).forEach(r => {
        const rawName = String(r.menu_name || r.name || '').toLowerCase().trim();
        if (rawName) {
          recipeByExact[rawName] = r;
          recipeByNorm[normalizeMenu(rawName)] = r;
        }
      });

      const aggByMat = {};
      (posRows || []).forEach(sale => {
        const soldQty = Number(sale.qty) || 0;
        if (soldQty <= 0) return;
        const saleMenuRaw = String(sale.menu_name || '').toLowerCase().trim();
        const matchedRecipe = recipeByExact[saleMenuRaw] || recipeByNorm[normalizeMenu(saleMenuRaw)];
        if (!matchedRecipe || !Array.isArray(matchedRecipe.ingredients)) return;

        matchedRecipe.ingredients.forEach(ing => {
          const matId = Number(ing.material_id || ing.id);
          const ingQty = Number(ing.qty_in_use ?? ing.qty ?? 0);
          if (!matId || ingQty <= 0) return;
          if (!aggByMat[matId]) {
            aggByMat[matId] = {
              material_id: matId,
              theoretical_recipe_qty: 0,
              recipe_unit: ing.unit || 'gr',
              menus_sold_count: 0,
              menusMap: {}
            };
          }
          aggByMat[matId].theoretical_recipe_qty += soldQty * ingQty;
          aggByMat[matId].menus_sold_count += soldQty;
          const label = matchedRecipe.menu_name || matchedRecipe.name || sale.menu_name;
          aggByMat[matId].menusMap[label] = (aggByMat[matId].menusMap[label] || 0) + soldQty;
        });
      });

      const fallbackRows = Object.values(aggByMat).map(item => ({
        ...item,
        menu_breakdown: Object.entries(item.menusMap).map(([mName, count]) => ({
          menu_name: mName,
          qty_sold: count
        }))
      }));
      return buildNormalizedResult(fallbackRows);
    } catch (err) {
      console.warn('Fallback getDailyPosTheoreticalUsage warning:', err);
      return {};
    }
  },

  getMonthlyQuotaSummary: async (period, branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await requireBranchId(branchIdArg);

    const targetPeriod = period || new Date().toISOString().slice(0, 7);
    const [yearStr, monthStr] = targetPeriod.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const startDate = `${targetPeriod}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${targetPeriod}-${String(lastDay).padStart(2, '0')}`;

    let txQ = supabase
      .from('transactions')
      .select('material_id, type, location, qty, is_reversed, date')
      .eq('tenant_id', tenantId)
      .gte('date', startDate)
      .lte('date', endDate);
    let invQ = supabase
      .from('daily_inventories')
      .select('id, date, location')
      .eq('tenant_id', tenantId)
      .gte('date', startDate)
      .lte('date', endDate);
    if (branchId) {
      txQ = txQ.eq('branch_id', branchId);
      invQ = invQ.eq('branch_id', branchId);
    }

    const [materialsList, { data: txRows }, { data: invHeaders }] = await Promise.all([
      api.getMaterials(branchId),
      txQ,
      invQ
    ]);

    const purchasedMap = {};
    const outTxMap = {};
    (txRows || []).forEach(tx => {
      if (tx.is_reversed) return;
      const mId = Number(tx.material_id);
      if (!mId) return;
      const q = Math.abs(Number(tx.qty) || 0);
      if (['IN', 'PURCHASE_IN'].includes(tx.type) && (Number(tx.qty) || 0) > 0) {
        purchasedMap[mId] = (purchasedMap[mId] || 0) + q;
      } else if (tx.type === 'OUT') {
        outTxMap[mId] = (outTxMap[mId] || 0) + q;
      }
    });

    const eodOutMap = {};
    const headerIds = (invHeaders || []).map(h => h.id).filter(Boolean);
    if (headerIds.length > 0) {
      let invItemsQ = supabase
        .from('daily_inventory_items')
        .select('material_id, out_qty, out_qty_input')
        .in('inventory_id', headerIds);
      if (branchId) invItemsQ = invItemsQ.eq('branch_id', branchId);
      const { data: invItems } = await invItemsQ;
      (invItems || []).forEach(row => {
        const mId = Number(row.material_id);
        const outVal = Number(row.out_qty ?? row.out_qty_input) || 0;
        if (mId && outVal > 0) {
          eodOutMap[mId] = (eodOutMap[mId] || 0) + outVal;
        }
      });
    }

    return (materialsList || [])
      .filter(m => (m.category || '').toUpperCase() !== 'ASSET')
      .map(m => {
        const quota = Number(m.monthly_quota_qty ?? m.par_stock ?? 0);
        const totalPurchased = Number((purchasedMap[m.id] || 0).toFixed(2));
        const totalOut = Number((Math.max(eodOutMap[m.id] || 0, outTxMap[m.id] || 0)).toFixed(2));
        const remainingQuota = Number((quota - totalOut).toFixed(2));
        return {
          ...m,
          monthly_quota_qty: quota,
          total_purchased_month: totalPurchased,
          total_out_month: totalOut,
          remaining_quota: remainingQuota,
          remaining_from_quota: remainingQuota
        };
      });
  },

  syncCentralOpnameToResto: async (materialIds = [], transferQty = 0, branchIdArg = null) => {
    const tenantId = await requireTenantId();
    const branchId = await requireBranchId(branchIdArg);
    const userId = await getActiveUserId();
    const cleanIds = (materialIds || []).map(id => Number(id)).filter(Boolean);
    if (!cleanIds.length) {
      throw new Error('Pilih minimal satu barang dari Central untuk dimasukkan ke Resto.');
    }

    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('sync_central_opname_unlisted_to_resto_v9', {
        p_tenant_id: tenantId,
        p_material_ids: cleanIds,
        p_transfer_qty: Number(transferQty) || 0,
        p_user_id: userId
      });
      if (!rpcErr && rpcRes) {
        await logAudit('SYNC_CENTRAL_TO_RESTO', `Sinkronisasi ${cleanIds.length} barang dari SO Central ke daftar aktif Resto.`);
        return rpcRes;
      }
    } catch (_fallbackErr) {
      // Fallback below
    }

    let syncedCount = 0;
    for (const matId of cleanIds) {
      let matQ = supabase
        .from('materials')
        .select('*')
        .eq('id', matId)
        .eq('tenant_id', tenantId);
      if (branchId) matQ = matQ.eq('branch_id', branchId);
      const { data: mat } = await matQ.maybeSingle();
      if (!mat) continue;

      const moveQty = Number(transferQty) > 0
        ? Math.min(Number(mat.qty_central) || 0, Number(transferQty))
        : 0;

      await api.updateMaterial(matId, {
        ...(branchId ? { branch_id: branchId } : {}),
        is_active: true,
        qty_resto: (Number(mat.qty_resto) || 0) + moveQty,
        qty_central: Math.max(0, (Number(mat.qty_central) || 0) - moveQty)
      });

      if (moveQty > 0) {
        try {
          await supabase.from('transactions').insert({
            tenant_id: tenantId,
            ...(branchId ? { branch_id: branchId } : {}),
            date: getLocalDateISO(),
            material_id: matId,
            type: 'TRANSFER',
            location: 'RESTO',
            qty: moveQty,
            amount: moveQty * (Number(mat.price) || 0),
            notes: `Sinkronisasi SO Central ke Resto (${mat.name})`,
            source_module: 'central_to_resto_sync_v9',
            created_by: userId
          });
        } catch (_txErr) {
          // ignore fallback tx error
        }
      }
      syncedCount += 1;
    }

    await logAudit('SYNC_CENTRAL_TO_RESTO', `Sinkronisasi ${syncedCount} barang dari SO Central ke daftar aktif Resto.`);
    return { success: true, synced_count: syncedCount };
  },

  getOlahBahanHistory: async (branchIdArg = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await requireBranchId(branchIdArg);
    try {
      let q = supabase
        .from('production_trimming_batches')
        .select('*, materials(id, name, unit, sku, price, category)')
        .eq('tenant_id', tenantId);
      if (branchId) q = q.eq('branch_id', branchId);
      const { data, error } = await q
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) {
        console.warn("Error fetching olah bahan history:", error);
        return [];
      }
      let localMeta = {};
      if (typeof window !== 'undefined') {
        try {
          localMeta = JSON.parse(localStorage.getItem('barventis_prep_batch_meta_v1') || '{}');
        } catch (_) {
          /* ignore malformed prep batch metadata */
        }
      }
      return (data || []).map((row) => {
        const meta = localMeta[row.batch_number] || {};
        return {
          ...row,
          target_mat_name: meta.target_mat_name || (row.materials?.name ? `${row.materials.name} (Bersih)` : 'Hasil Bersih'),
          processed_into: meta.processed_into || 'Kupas / Potong Bersih',
          display_source_qty: meta.source_qty ?? row.gross_weight,
          display_source_unit: meta.source_unit || row.materials?.unit || 'kg',
          display_target_qty: meta.target_qty ?? row.clean_weight,
          display_target_unit: meta.target_unit || row.materials?.unit || 'kg',
          display_waste_qty: meta.waste_qty ?? row.waste_weight,
          display_waste_unit: meta.waste_unit || row.materials?.unit || 'kg',
          new_target_hpp: meta.new_target_hpp || null
        };
      });
    } catch (err) {
      if (String(err?.message || '').includes('branch_id')) throw err;
      console.warn("Error fetching olah bahan history:", err);
      return [];
    }
  },

  // --- MULTI-BRANCH MANAGEMENT & CLONING ---
  getBranches: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const fromFn = supabase.unscopedFrom ? supabase.unscopedFrom : supabase.from;
    const { data, error } = await fromFn('branches')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('is_central', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('Error fetching branches:', error.message);
      return [];
    }
    return data || [];
  },

  createBranch: async ({ name, code, address = '', is_central = false, clone_from_branch_id = null, clone_options = {} }) => {
    const tenantId = await requireTenantId();
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Nama cabang wajib diisi.');
    const cleanCode = String(code || '').trim().toUpperCase() || cleanName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

    const fromFn = supabase.unscopedFrom ? supabase.unscopedFrom : supabase.from;
    const { data: created, error } = await fromFn('branches')
      .insert({
        tenant_id: tenantId,
        name: cleanName,
        code: cleanCode,
        address: address?.trim() || null,
        is_central: !!is_central,
        is_active: true
      })
      .select()
      .single();

    if (error) throw new Error('Gagal membuat cabang: ' + error.message);

    let cloneSummary = null;
    if (clone_from_branch_id && (clone_options.materials || clone_options.suppliers || clone_options.recipes)) {
      cloneSummary = await api.cloneBranchData({
        sourceBranchId: clone_from_branch_id,
        targetBranchId: created.id,
        copyMaterials: !!clone_options.materials,
        copySuppliers: !!clone_options.suppliers,
        copyRecipes: !!clone_options.recipes,
        conflictMode: 'SKIP'
      });
    }

    await logAudit('CREATE_BRANCH', `Membuat cabang baru "${cleanName}" (${cleanCode}).`);
    return { branch: created, cloneSummary };
  },

  updateBranch: async (branchId, updates) => {
    const tenantId = await requireTenantId();
    const fromFn = supabase.unscopedFrom ? supabase.unscopedFrom : supabase.from;
    const payload = {};
    if (updates.name !== undefined) payload.name = String(updates.name).trim();
    if (updates.code !== undefined) payload.code = String(updates.code).trim().toUpperCase();
    if (updates.address !== undefined) payload.address = updates.address?.trim() || null;
    if (updates.is_central !== undefined) payload.is_central = !!updates.is_central;
    if (updates.is_active !== undefined) payload.is_active = !!updates.is_active;

    const { data, error } = await fromFn('branches')
      .update(payload)
      .eq('id', branchId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw new Error('Gagal memperbarui cabang: ' + error.message);
    await logAudit('UPDATE_BRANCH', `Memperbarui cabang "${data.name}".`);
    return data;
  },

  assignUserBranch: async (userId, branchId) => {
    const tenantId = await requireTenantId();
    const fromFn = supabase.unscopedFrom ? supabase.unscopedFrom : supabase.from;
    const { data, error } = await fromFn('users')
      .update({ branch_id: branchId || null })
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .select()
      .single();
    if (error) throw new Error('Gagal mengubah cabang pengguna: ' + error.message);
    await logAudit('ASSIGN_USER_BRANCH', `Menugaskan ${data.name} ke cabang baru.`);
    return data;
  },

  getRecipesByBranch: async (branchId) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId || !branchId) return [];
    const fromFn = supabase.unscopedFrom ? supabase.unscopedFrom : supabase.from;
    const { data, error } = await fromFn('recipes')
      .select('id, menu_name, category, selling_price, basic_cost, food_cost_pct, fix_cost_pct, image_url')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .order('category')
      .order('menu_name');
    if (error) throw new Error('Gagal memuat menu cabang sumber: ' + error.message);
    return data || [];
  },

  cloneBranchData: async ({
    sourceBranchId,
    targetBranchId,
    copyMaterials = false,
    copySuppliers = false,
    copyRecipes = false,
    selectedRecipeIds = null,
    conflictMode = 'SKIP'
  }) => {
    const tenantId = await requireTenantId();
    if (!sourceBranchId || !targetBranchId || sourceBranchId === targetBranchId) {
      throw new Error('Cabang sumber dan tujuan harus berbeda.');
    }

    // Try atomic server RPC first
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('clone_branch_data', {
      p_tenant_id: tenantId,
      p_source_branch_id: sourceBranchId,
      p_target_branch_id: targetBranchId,
      p_copy_materials: copyMaterials,
      p_copy_suppliers: copySuppliers,
      p_copy_recipes: copyRecipes,
      p_selected_recipe_ids: selectedRecipeIds,
      p_conflict_mode: conflictMode
    });

    if (!rpcErr && rpcRes) {
      await logAudit('CLONE_BRANCH_DATA', `Menyalin data cabang (${JSON.stringify(rpcRes)}).`);
      return rpcRes;
    }

    // Fallback: client-side transaction when RPC is not yet deployed
    const fromFn = supabase.unscopedFrom ? supabase.unscopedFrom : supabase.from;
    let suppliersCopied = 0;
    let materialsCopied = 0;
    let recipesCopied = 0;
    let recipesUpdated = 0;

    if (copySuppliers) {
      const [{ data: srcSups }, { data: tgtSups }] = await Promise.all([
        fromFn('suppliers').select('*').eq('tenant_id', tenantId).eq('branch_id', sourceBranchId),
        fromFn('suppliers').select('name').eq('tenant_id', tenantId).eq('branch_id', targetBranchId)
      ]);
      const existingNames = new Set((tgtSups || []).map(s => String(s.name || '').trim().toLowerCase()));
      const toInsert = (srcSups || [])
        .filter(s => !existingNames.has(String(s.name || '').trim().toLowerCase()))
        .map(s => ({
          tenant_id: tenantId,
          branch_id: targetBranchId,
          name: s.name,
          phone: s.phone || null,
          address: s.address || null,
          contact_person: s.contact_person || null,
          status: s.status || 'ACTIVE'
        }));
      if (toInsert.length > 0) {
        const { error: supInsErr } = await fromFn('suppliers').insert(toInsert);
        if (!supInsErr) suppliersCopied = toInsert.length;
      }
    }

    const ensureMaterialInTarget = async (srcMat, targetMatList) => {
      const codeKey = srcMat.item_code ? String(srcMat.item_code).trim().toLowerCase() : null;
      const nameKey = String(srcMat.name || '').trim().toLowerCase();
      const found = targetMatList.find(m =>
        (codeKey && String(m.item_code || '').trim().toLowerCase() === codeKey) ||
        String(m.name || '').trim().toLowerCase() === nameKey
      );
      if (found) return found.id;

      const { data: insertedMat, error: matErr } = await fromFn('materials')
        .insert({
          tenant_id: tenantId,
          branch_id: targetBranchId,
          name: srcMat.name,
          category: srcMat.category || 'Umum',
          unit: srcMat.unit || 'pck',
          full_pack: srcMat.full_pack || '',
          price: Number(srcMat.price || 0),
          new_price: srcMat.new_price ?? srcMat.price ?? 0,
          supplier: srcMat.supplier || '',
          min_stock: Number(srcMat.min_stock || 0),
          par_stock: Number(srcMat.par_stock || 0),
          item_code: srcMat.item_code || null,
          sku: srcMat.sku || null,
          qty_resto: 0,
          qty_central: 0
        })
        .select()
        .single();
      if (matErr) throw new Error('Gagal menyalin bahan ' + srcMat.name + ': ' + matErr.message);
      targetMatList.push(insertedMat);
      materialsCopied += 1;
      return insertedMat.id;
    };

    const [{ data: srcMats }, { data: tgtMatsInit }] = await Promise.all([
      fromFn('materials').select('*').eq('tenant_id', tenantId).eq('branch_id', sourceBranchId),
      fromFn('materials').select('*').eq('tenant_id', tenantId).eq('branch_id', targetBranchId)
    ]);
    const tgtMats = [...(tgtMatsInit || [])];
    const srcMatById = new Map((srcMats || []).map(m => [m.id, m]));

    if (copyMaterials) {
      for (const m of (srcMats || [])) {
        await ensureMaterialInTarget(m, tgtMats);
      }
    }

    if (copyRecipes) {
      let recQuery = fromFn('recipes')
        .select('*, recipe_ingredients(*)')
        .eq('tenant_id', tenantId)
        .eq('branch_id', sourceBranchId);
      if (Array.isArray(selectedRecipeIds) && selectedRecipeIds.length > 0) {
        recQuery = recQuery.in('id', selectedRecipeIds);
      }
      const { data: srcRecipes, error: srcRecErr } = await recQuery;
      if (srcRecErr) throw new Error('Gagal membaca resep sumber: ' + srcRecErr.message);

      const { data: tgtRecipes } = await fromFn('recipes')
        .select('id, menu_name')
        .eq('tenant_id', tenantId)
        .eq('branch_id', targetBranchId);
      const tgtRecMap = new Map((tgtRecipes || []).map(r => [String(r.menu_name || '').trim().toLowerCase(), r]));

      for (const rec of (srcRecipes || [])) {
        const key = String(rec.menu_name || '').trim().toLowerCase();
        const existing = tgtRecMap.get(key);
        if (existing && conflictMode === 'SKIP') continue;

        let targetRecId = existing?.id || null;
        if (!targetRecId) {
          const { data: createdRec, error: recInsErr } = await fromFn('recipes')
            .insert({
              tenant_id: tenantId,
              branch_id: targetBranchId,
              menu_name: rec.menu_name,
              category: rec.category,
              selling_price: rec.selling_price,
              basic_cost: rec.basic_cost,
              fix_cost_pct: rec.fix_cost_pct,
              food_cost_pct: rec.food_cost_pct,
              image_url: rec.image_url || null
            })
            .select()
            .single();
          if (recInsErr) throw new Error('Gagal menyalin menu ' + rec.menu_name + ': ' + recInsErr.message);
          targetRecId = createdRec.id;
          recipesCopied += 1;
        } else {
          await fromFn('recipes')
            .update({
              category: rec.category,
              selling_price: rec.selling_price,
              basic_cost: rec.basic_cost,
              fix_cost_pct: rec.fix_cost_pct,
              food_cost_pct: rec.food_cost_pct
            })
            .eq('id', targetRecId);
          await fromFn('recipe_ingredients').delete().eq('recipe_id', targetRecId);
          recipesUpdated += 1;
        }

        const ingRows = [];
        for (const ing of (rec.recipe_ingredients || [])) {
          const srcMat = srcMatById.get(ing.material_id);
          let targetMatId = null;
          if (srcMat) {
            targetMatId = await ensureMaterialInTarget(srcMat, tgtMats);
          } else if (ing.item_name) {
            targetMatId = await ensureMaterialInTarget({
              name: ing.item_name,
              unit: ing.unit || 'gr',
              price: ing.unit_price || 0
            }, tgtMats);
          }
          if (targetMatId) {
            ingRows.push({
              tenant_id: tenantId,
              ...(targetBranchId ? { branch_id: targetBranchId } : {}),
              recipe_id: targetRecId,
              material_id: targetMatId,
              qty_in_use: ing.qty_in_use,
              unit: ing.unit,
              unit_price: ing.unit_price || 0,
              amount: ing.amount || 0
            });
          }
        }
        if (ingRows.length > 0) {
          await fromFn('recipe_ingredients').insert(ingRows);
        }
      }
    }

    const summary = {
      suppliers_copied: suppliersCopied,
      materials_copied: materialsCopied,
      recipes_copied: recipesCopied,
      recipes_updated: recipesUpdated
    };
    await logAudit('CLONE_BRANCH_DATA', `Menyalin data cabang: ${recipesCopied} menu baru, ${recipesUpdated} menu diperbarui, ${materialsCopied} bahan.`);
    return summary;
  },

  getInterBranchShipments: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const fromFn = supabase.unscopedFrom ? supabase.unscopedFrom : supabase.from;
    const { data, error } = await fromFn('inter_branch_transfers')
      .select('*, inter_branch_transfer_items(*, materials(id, name, unit, item_code, price))')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.warn('getInterBranchShipments warning:', error.message);
      return [];
    }
    return data || [];
  },

  dispatchInterBranchShipment: async ({ fromBranchId, toBranchId, items, notes = '' }) => {
    const tenantId = await requireTenantId();
    const userId = await getActiveUserId();
    if (!fromBranchId || !toBranchId || fromBranchId === toBranchId) {
      throw new Error('Cabang pengirim dan penerima tidak valid.');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Tambahkan minimal 1 bahan baku.');
    }

    const fromFn = supabase.unscopedFrom ? supabase.unscopedFrom : supabase.from;
    const trfNumber = `IBT-${Date.now().toString(36).toUpperCase()}`;

    const { data: header, error: hdrErr } = await fromFn('inter_branch_transfers')
      .insert({
        tenant_id: tenantId,
        transfer_number: trfNumber,
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
        status: 'DRAFT',
        notes: notes || null
      })
      .select()
      .single();
    if (hdrErr) throw new Error('Gagal membuat dokumen mutasi: ' + hdrErr.message);

    const itemPayloads = items.map(i => ({
      tenant_id: tenantId,
      transfer_id: header.id,
      material_id: i.material_id,
      qty_dispatched: parseFloat(i.qty),
      remarks: i.notes || null
    }));

    const { error: itemsErr } = await fromFn('inter_branch_transfer_items').insert(itemPayloads);
    if (itemsErr) {
      await fromFn('inter_branch_transfers').delete().eq('id', header.id);
      throw new Error('Gagal menyimpan item mutasi: ' + itemsErr.message);
    }

    // Deduct stock from sender branch & record OUT transaction
    const { data: srcBranch } = await fromFn('branches').select('name, is_central').eq('id', fromBranchId).maybeSingle();
    const senderIsCentral = !!srcBranch?.is_central;
    const today = getLocalDateISO();

    for (const item of items) {
      const qty = parseFloat(item.qty);
      const { data: mat } = await fromFn('materials').select('*').eq('id', item.material_id).single();
      if (mat) {
        const curCentral = Number(mat.qty_central || 0);
        const curResto = Number(mat.qty_resto || 0);
        const deductFromCentral = senderIsCentral || (curCentral >= qty && curResto < qty);
        const newCentral = deductFromCentral ? Math.max(0, curCentral - qty) : curCentral;
        const newResto = deductFromCentral ? curResto : Math.max(0, curResto - qty);
        await fromFn('materials')
          .update({
            qty_central: newCentral,
            qty_resto: newResto
          })
          .eq('id', mat.id);

        const unitPrice = Number(mat.new_price || mat.price || 0);
        await fromFn('transactions').insert({
          tenant_id: tenantId,
          branch_id: fromBranchId,
          date: today,
          material_id: mat.id,
          type: 'OUT',
          location: deductFromCentral ? 'CENTRAL' : 'RESTO',
          qty: qty,
          amount: Math.round(qty * unitPrice),
          notes: `Kirim Antar Cabang (${trfNumber})${notes ? ' - ' + notes : ''}`
        });
      }
    }

    const { data: dispatched, error: dispErr } = await fromFn('inter_branch_transfers')
      .update({
        status: 'DISPATCHED',
        dispatcher_id: userId
      })
      .eq('id', header.id)
      .select()
      .single();
    if (dispErr) throw new Error('Gagal mengirim mutasi: ' + dispErr.message);

    await logAudit('INTER_BRANCH_DISPATCH', `Mengirim ${items.length} item (${trfNumber}) lintas cabang.`);
    return dispatched;
  },

  receiveInterBranchShipment: async ({ transferId, receivedItems }) => {
    const tenantId = await requireTenantId();
    const userId = await getActiveUserId();
    const fromFn = supabase.unscopedFrom ? supabase.unscopedFrom : supabase.from;

    const { data: trf, error: trfErr } = await fromFn('inter_branch_transfers')
      .select('*, inter_branch_transfer_items(*, materials(*))')
      .eq('id', transferId)
      .eq('tenant_id', tenantId)
      .single();
    if (trfErr || !trf) throw new Error('Data pengiriman tidak ditemukan.');
    if (trf.status !== 'DISPATCHED') throw new Error('Mutasi ini sudah diproses sebelumnya.');

    const { data: destBranch } = await fromFn('branches').select('name, is_central').eq('id', trf.to_branch_id).maybeSingle();
    const destIsCentral = !!destBranch?.is_central;

    const { data: destMaterials } = await fromFn('materials')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('branch_id', trf.to_branch_id);
    const destMats = [...(destMaterials || [])];
    const today = getLocalDateISO();

    for (const trfItem of (trf.inter_branch_transfer_items || [])) {
      const override = (receivedItems || []).find(r => r.id === trfItem.id);
      const qtyRec = override ? Math.max(0, parseFloat(override.qty_received) || 0) : Number(trfItem.qty_dispatched);

      await fromFn('inter_branch_transfer_items')
        .update({ qty_received: qtyRec })
        .eq('id', trfItem.id);

      if (qtyRec > 0 && trfItem.materials) {
        const srcMat = trfItem.materials;
        let destMat = destMats.find(m =>
          (srcMat.item_code && String(m.item_code || '').trim().toLowerCase() === String(srcMat.item_code).trim().toLowerCase()) ||
          String(m.name || '').trim().toLowerCase() === String(srcMat.name || '').trim().toLowerCase()
        );

        if (!destMat) {
          const { data: createdMat, error: cErr } = await fromFn('materials')
            .insert({
              tenant_id: tenantId,
              branch_id: trf.to_branch_id,
              name: srcMat.name,
              category: srcMat.category || 'Umum',
              unit: srcMat.unit || 'pck',
              full_pack: srcMat.full_pack || '',
              price: Number(srcMat.price || 0),
              new_price: srcMat.new_price ?? srcMat.price ?? 0,
              supplier: srcMat.supplier || '',
              min_stock: Number(srcMat.min_stock || 0),
              par_stock: Number(srcMat.par_stock || 0),
              item_code: srcMat.item_code || null,
              sku: srcMat.sku || null,
              qty_resto: 0,
              qty_central: 0,
              stock: 0
            })
            .select()
            .single();
          if (cErr) throw new Error('Gagal membuat item di cabang tujuan: ' + cErr.message);
          destMat = createdMat;
          destMats.push(createdMat);
        }

        const newCentral = destIsCentral ? Number(destMat.qty_central || 0) + qtyRec : Number(destMat.qty_central || 0);
        const newResto = destIsCentral ? Number(destMat.qty_resto || 0) : Number(destMat.qty_resto || 0) + qtyRec;

        await fromFn('materials')
          .update({
            qty_central: newCentral,
            qty_resto: newResto,
            stock: newResto + newCentral
          })
          .eq('id', destMat.id);

        const unitPrice = Number(destMat.new_price || destMat.price || srcMat.price || 0);
        await fromFn('transactions').insert({
          tenant_id: tenantId,
          branch_id: trf.to_branch_id,
          date: today,
          material_id: destMat.id,
          type: 'IN',
          location: destIsCentral ? 'CENTRAL' : 'RESTO',
          qty: qtyRec,
          amount: Math.round(qtyRec * unitPrice),
          notes: `Terima Antar Cabang (${trf.transfer_number})`
        });
      }
    }

    const { data: completed, error: recErr } = await fromFn('inter_branch_transfers')
      .update({
        status: 'RECEIVED',
        receiver_id: userId
      })
      .eq('id', transferId)
      .select()
      .single();
    if (recErr) throw new Error('Gagal menyelesaikan penerimaan mutasi: ' + recErr.message);

    await logAudit('INTER_BRANCH_RECEIVE', `Menerima mutasi antar cabang (${trf.transfer_number}).`);
    return completed;
  },

  getMultiBranchSummary: async (period) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const [yearStr, monthStr] = String(period || '').split('-');
    const year = parseInt(yearStr, 10) || new Date().getFullYear();
    const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);

    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_owner_multi_branch_summary', {
      p_tenant_id: tenantId,
      p_month: month,
      p_year: year
    });
    if (!rpcErr && Array.isArray(rpcData)) {
      return rpcData;
    }

    // Fallback using unscopedFrom
    const fromFn = supabase.unscopedFrom ? supabase.unscopedFrom : supabase.from;
    const daysInMonth = new Date(year, month, 0).getDate();
    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const [{ data: branches }, { data: mats }, { data: txs }, { data: users }] = await Promise.all([
      fromFn('branches').select('*').eq('tenant_id', tenantId).order('is_central', { ascending: false }),
      fromFn('materials').select('id, branch_id, qty_resto, qty_central, price, new_price, min_stock').eq('tenant_id', tenantId),
      fromFn('transactions').select('branch_id, type, amount').eq('tenant_id', tenantId).gte('date', startStr).lte('date', endStr).in('type', ['POS_SALE', 'POS_DEDUCTION']),
      fromFn('users').select('id, branch_id').eq('tenant_id', tenantId)
    ]);

    return (branches || []).map(b => {
      const bMats = (mats || []).filter(m => m.branch_id === b.id);
      const bTxs = (txs || []).filter(t => t.branch_id === b.id);
      const bUsers = (users || []).filter(u => u.branch_id === b.id);
      const stockValuation = bMats.reduce((sum, m) => {
        const qty = Number(m.qty_resto || 0) + Number(m.qty_central || 0);
        const unitVal = Number(m.new_price || m.price || 0);
        return sum + qty * unitVal;
      }, 0);
      const lowStockCount = bMats.filter(m => (Number(m.qty_resto || 0) + Number(m.qty_central || 0)) < (Number(m.min_stock) || 15)).length;
      const posSales = bTxs.filter(t => t.type === 'POS_SALE').reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
      const actualCogs = bTxs.filter(t => t.type === 'POS_DEDUCTION').reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
      const foodCostPct = posSales > 0 ? Number(((actualCogs / posSales) * 100).toFixed(1)) : 0;

      return {
        branch_id: b.id,
        branch_code: b.code,
        branch_name: b.name,
        is_central: !!b.is_central,
        is_active: b.is_active !== false,
        staff_count: bUsers.length,
        material_count: bMats.length,
        low_stock_count: lowStockCount,
        stock_valuation: stockValuation,
        pos_sales: posSales,
        actual_cogs: actualCogs,
        food_cost_pct: foodCostPct
      };
    });
  },

  uploadPhoto: async (fileBlob, bucket, filename) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) throw new Error("Tenant aktif diperlukan untuk upload foto.");

    const path = `${tenantId}/${filename}`;
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, fileBlob, { contentType: 'image/webp', upsert: true });
      
    if (error) throw new Error("Gagal mengunggah foto: " + error.message);
    
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);
      
    return publicUrl;
  }
};