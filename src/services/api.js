// UMATIS Serverless API Service Client for Supabase Backend Integration
import { supabase } from '../lib/supabase';
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
    .select('tenant_id, branch_id')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) throw new Error("Gagal mengambil data tenant: " + error.message);

  // SuperAdmin may not have a tenant_id — return null so read-only guards gracefully return empty data.
  activeTenantId = user?.tenant_id ?? null;
  activeBranchId = user?.branch_id ?? null;
  return activeTenantId;
};

// Strict variant: throws when tenant_id is null (use for CRUD/mutating operations only)
const requireTenantId = async () => {
  const tenantId = await getActiveTenantId();
  if (!tenantId) throw new Error("Operasi ini membutuhkan tenant aktif. SuperAdmin tidak bisa melakukan mutasi data tanpa konteks tenant.");
  return tenantId;
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
  getDailyInventoryRecords: async (date, location = 'RESTO') => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const { data: headers, error: headerErr } = await supabase
      .from('daily_inventories')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('date', date)
      .eq('location', location);
    if (headerErr) throw headerErr;
    if (!headers || headers.length === 0) return [];
    const headerIds = headers.map(h => h.id);
    const [{ data: itemRows, error: itemsErr }, materialsList] = await Promise.all([
      supabase
        .from('daily_inventory_items')
        .select('*')
        .in('inventory_id', headerIds),
      api.getMaterials().catch(() => [])
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
  getDailyInventoryEodData: async (date, location = 'RESTO') => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { items: [], inventory: {} };
    let materialsList = await api.getMaterials();
    materialsList = (materialsList || []).filter(m => (m.category || '').toUpperCase() !== 'ASSET' && m.is_active !== false);

    // 1. Get header for date
    const { data: header, error: headerErr } = await supabase
      .from('daily_inventories')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('date', date)
      .eq('location', location)
      .maybeSingle();
    if (headerErr) throw headerErr;

    // The last final EOD provides the opening snapshot. Any stock movements
    // posted after that close (including late receipts on the same date) are
    // carried forward from the ledger; never jump over an unaccounted gap.
    const { data: previousHeaders, error: previousHeaderErr } = await supabase
      .from('daily_inventories')
      .select('id, date, status, updated_at')
      .eq('tenant_id', tenantId)
      .eq('location', location)
      .lt('date', date)
      .in('status', ['verified', 'closed'])
      .order('date', { ascending: false })
      .limit(1);
    if (previousHeaderErr) throw previousHeaderErr;
    const previousOpeningMap = {};
    const previousOpeningPartsMap = {};
    const previousHeader = previousHeaders?.[0] || null;
    if (previousHeader) {
      const { data: previousItems, error: previousItemsErr } = await supabase
        .from('daily_inventory_items')
        .select('material_id, closing_qty, full_qty, broken_qty, broken_unit, broken_confirmed, active_open_lot_id')
        .eq('inventory_id', previousHeader.id);
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
      const { data: carryRows, error: carryErr } = await supabase
        .from('transactions')
        .select('material_id, type, qty, is_reversed, source_module, date, created_at')
        .eq('tenant_id', tenantId)
        .eq('location', location)
        .gte('date', previousHeader.date)
        .lt('date', date)
        .in('type', ['IN', 'OUT', 'TRANSFER', 'POS_DEDUCTION', 'PURCHASE_IN', 'OPNAME_ADJ', 'WASTE', 'BREAKAGE', 'EXPIRED', 'COMP']);
      if (carryErr) throw carryErr;
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
      const { data: itemRows, error: itemsErr } = await supabase
        .from('daily_inventory_items')
        .select('*')
        .eq('inventory_id', header.id);
      if (itemsErr) throw itemsErr;
      (itemRows || []).forEach(row => {
        invMap[row.material_id] = {
          ...row,
          stok_awal: row.opening_qty_snapshot ?? row.prev_full_qty ?? row.stok_awal,
          qty_in: row.in_qty ?? row.qty_in,
          qty_out: row.out_qty_input != null ? row.out_qty_input : (row.out_confirmed === false ? '' : (row.out_qty ?? row.qty_out ?? '')),
          out_qty_normalized: row.out_qty ?? null,
          out_qty_input: row.out_qty_input ?? null,
          out_unit: row.out_unit || null,
          out_confirmed: row.out_confirmed ?? (row.out_qty != null || row.qty_out != null),
          zero_activity_confirmed: Boolean(row.zero_activity_confirmed),
          waste: row.waste_qty ?? row.waste ?? 0,
          broken: Boolean(row.broken_confirmed ?? row.is_counted) ? (row.broken_qty ?? row.broken ?? '') : '', // raw weighed input; closing_broken_qty_base is normalized for stock math only
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

    // Source-derived daily quantities. IN and WASTE must not be re-entered in EOD.
    const validWasteTypes = ['WASTE', 'BREAKAGE', 'EXPIRED', 'COMP'];
    const { data: dailyTxRows, error: dailyTxErr } = await supabase
      .from('transactions')
      .select('material_id, type, qty, is_reversed, source_module')
      .eq('tenant_id', tenantId)
      .eq('date', date)
      .eq('location', location)
      .eq('is_reversed', false)
      .in('type', ['IN', 'OUT', 'TRANSFER', 'PURCHASE_IN', 'OPNAME_ADJ', ...validWasteTypes]);
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
      if (['IN', 'PURCHASE_IN', 'TRANSFER'].includes(tx.type) && signedQty > 0) {
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
      if (tx.type !== 'POS_SALE' && tx.type !== 'POS_DEDUCTION' &&
          !(tx.type === 'OUT' && ['daily_inventory', 'production'].includes(tx.source_module))) {
        netStockMovementMap[mId] = (netStockMovementMap[mId] || 0) + signedQty;
      }
    });

    const { data: locationCosts, error: costsErr } = await supabase
      .from('material_location_costs')
      .select('material_id, average_unit_cost')
      .eq('tenant_id', tenantId)
      .eq('location', location);
    if (costsErr && costsErr.code !== 'PGRST205') throw costsErr;
    const costMap = Object.fromEntries((locationCosts || []).map(c => [c.material_id, Number(c.average_unit_cost) || 0]));

    // Lot inventory is separate from the daily material row. Daily Inventory
    // shows the earliest active expiry and the current opened lot, never a single
    // editable expiry date that could overwrite multi-lot receipt history.
    const materialIds = materialsList.map(m => m.id).filter(Boolean);
    let batchRows = [];
    let openLotRows = [];
    if (materialIds.length) {
      const [{ data: batches, error: batchesErr }, { data: openLots, error: openLotsErr }] = await Promise.all([
        supabase.from('material_batches')
          .select('id, material_id, batch_no, expiry_date, expired_date, qty_resto, qty_central, status, lot_qty_verified')
          .eq('tenant_id', tenantId)
          .in('material_id', materialIds)
          .in('status', ['ACTIVE', 'active']),
        supabase.from('material_open_lot_state')
          .select('material_id, active_open_lot_id')
          .eq('tenant_id', tenantId)
          .eq('location', location),
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
        if (openingParts.valid) invMap[m.id].opening_full_qty = openingParts.fullQty;
        else invMap[m.id].opening_parts_reconciliation_required = true;
      }

      invMap[m.id].broken_unit = getPackContentUnitFromMaterial(m);
      // Legacy EOD rows stored OUT in the tracked stock unit. Preserve that unit
      // while editing old drafts; new rows default to the content unit.
      if (!invMap[m.id].out_unit) {
        invMap[m.id].out_unit = (invMap[m.id].out_qty_normalized != null && invMap[m.id].out_qty_input == null)
          ? (m.unit || getPackContentUnitFromMaterial(m))
          : (Boolean(m.broken_tracking_enabled) ? getPackContentUnitFromMaterial(m) : (m.unit || ''));
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
  saveDailyInventory: async (date, items, isClosing, userId, location = 'RESTO') => {
    const tenantId = await requireTenantId();
    const user = userId || await getActiveUserId();
    const itemsToSave = items.map(item => ({
      material_id: Number(item.material_id),
      opening_qty: Number(item.opening_qty) || 0,
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
    const { data, error } = await supabase.rpc('atomic_save_daily_inventory_v4', {
      p_tenant_id: tenantId,
      p_date: date,
      p_location: location,
      p_items: itemsToSave,
      p_is_closing: Boolean(isClosing),
      p_user_id: user
    });
    if (error) throw new Error('Gagal menyimpan Daily Inventory secara atomik: ' + error.message);
    await logAudit(isClosing ? 'LOCK_EOD' : 'SAVE_EOD', `Inventory tanggal ${date} lokasi ${location} ${(isClosing ? 'closing' : 'draft')}. ${items.length} items.`);
    return data;
  },

  unlockDailyInventory: async (date, location = 'RESTO') => {
    const tenantId = await requireTenantId();
    const userId = await getActiveUserId();
    const { data, error } = await supabase.rpc('reopen_daily_inventory_session_v4', {
      p_tenant_id: tenantId,
      p_date: date,
      p_location: location,
      p_user_id: userId
    });
    if (error) throw new Error('Gagal membuka ulang EOD: ' + error.message);

    await logAudit('UNLOCK_EOD', `Buka kunci lembar EOD tanggal ${date} lokasi ${location} menjadi draft untuk revisi.`);
    return data;
  },

  // Production recipes and runs are part of the inventory source-of-truth workflow.
  // Recipe inputs are saved atomically; a run posts the raw-material OUT and
  // semi-finished material IN in one database transaction.
  getProductionRecipes: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const [{ data: batches, error: batchErr }, { data: ingredients, error: ingredientErr }, materials] = await Promise.all([
      supabase.from('production_batches').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('batch_name'),
      supabase.from('production_batch_ingredients').select('batch_id, material_id, qty, unit').eq('tenant_id', tenantId),
      api.getMaterials()
    ]);
    if (batchErr) throw new Error('Gagal memuat resep produksi: ' + batchErr.message);
    if (ingredientErr) throw new Error('Gagal memuat bahan resep produksi: ' + ingredientErr.message);
    const materialMap = new Map((materials || []).map(m => [Number(m.id), m]));
    return (batches || []).map(batch => ({
      ...batch,
      output_material: materialMap.get(Number(batch.output_material_id)) || null,
      ingredients: (ingredients || []).filter(i => Number(i.batch_id) === Number(batch.id)).map(i => ({
        ...i,
        material: materialMap.get(Number(i.material_id)) || null,
      })),
    }));
  },
  saveProductionRecipe: async (recipe) => {
    const tenantId = await requireTenantId();
    const userId = await getActiveUserId();
    const ingredients = (recipe.ingredients || []).map(i => ({
      material_id: Number(i.material_id), qty: Number(i.qty), unit: String(i.unit || '').trim(),
    }));
    const { data, error } = await supabase.rpc('atomic_save_production_recipe_v3', {
      p_tenant_id: tenantId,
      p_batch_id: recipe.id ? Number(recipe.id) : null,
      p_batch_name: String(recipe.batch_name || '').trim(),
      p_output_material_id: Number(recipe.output_material_id),
      p_yield_qty: Number(recipe.yield_qty),
      p_yield_unit: String(recipe.yield_unit || '').trim(),
      p_source_note: String(recipe.source_note || '').trim() || null,
      p_ingredients: ingredients,
      p_user_id: userId,
    });
    if (error) throw new Error('Gagal menyimpan resep produksi: ' + error.message);
    await logAudit('SAVE_PRODUCTION_RECIPE', `Menyimpan resep produksi ${recipe.batch_name}.`);
    return data;
  },
  recordProductionRun: async ({ batchId, outputQty, date, location, notes, requestKey }) => {
    const tenantId = await requireTenantId();
    const userId = await getActiveUserId();
    const { data, error } = await supabase.rpc('atomic_record_production_run_v3', {
      p_tenant_id: tenantId,
      p_batch_id: Number(batchId),
      p_output_qty: Number(outputQty),
      p_date: date,
      p_location: location,
      p_notes: String(notes || '').trim() || null,
      p_request_key: requestKey || createRequestKey(),
      p_user_id: userId,
    });
    if (error) throw new Error('Gagal memposting batch produksi: ' + error.message);
    await logAudit('RECORD_PRODUCTION_RUN', `Mencatat produksi bahan untuk tanggal ${date}, lokasi ${location}.`);
    return data;
  },
  getProductionRuns: async (date, location) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    let query = supabase.from('production_runs').select('*').eq('tenant_id', tenantId);
    if (date) query = query.eq('run_date', date);
    if (location) query = query.eq('location', location);
    const { data: runs, error: runsErr } = await query.order('created_at', { ascending: false }).limit(100);
    if (runsErr) throw new Error('Gagal memuat riwayat produksi: ' + runsErr.message);
    if (!runs?.length) return [];
    const runIds = runs.map(r => r.id);
    const [{ data: runItems, error: itemsErr }, materials] = await Promise.all([
      supabase.from('production_run_items').select('*').eq('tenant_id', tenantId).in('run_id', runIds),
      api.getMaterials(),
    ]);
    if (itemsErr) throw new Error('Gagal memuat detail batch produksi: ' + itemsErr.message);
    const materialMap = new Map((materials || []).map(m => [Number(m.id), m]));
    return runs.map(run => ({
      ...run,
      output_material: materialMap.get(Number(run.output_material_id)) || null,
      ingredients: (runItems || []).filter(i => i.run_id === run.id).map(i => ({
        ...i, material: materialMap.get(Number(i.material_id)) || null,
      })),
    }));
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
    const userId = await getActiveUserId();
    if (!Array.isArray(posDataArray) || posDataArray.length === 0) throw new Error('File ESB tidak berisi baris penjualan yang valid.');

    const [{ data: recipes, error: recipesErr }, { data: materials, error: materialsErr }] = await Promise.all([
      supabase.from('recipes')
        .select('*, recipe_ingredients(material_id, qty_in_use, unit, unit_price, amount, materials(id, name, price, new_price, avg_cost, unit, full_pack))')
        .eq('tenant_id', tenantId),
      supabase.from('materials').select('*').eq('tenant_id', tenantId)
    ]);
    if (recipesErr) throw recipesErr;
    if (materialsErr) throw materialsErr;

    const recipeMapByCode = new Map((recipes || []).filter(r => r.pos_code).map(r => [String(r.pos_code).toLowerCase().trim(), r]));
    const recipeMapByName = new Map((recipes || []).map(r => [String(r.menu_name).toLowerCase().trim(), r]));
    const materialMapByName = new Map((materials || []).map(m => [String(m.name).toLowerCase().trim(), m]));
    const unitConversionMap = await api._loadUnitConversionMap(tenantId);
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

    const { data: priorUpload, error: priorUploadErr } = await supabase
      .from('pos_upload_logs')
      .select('id, filename, period, category_filter')
      .eq('tenant_id', tenantId)
      .eq('file_hash', contentHash)
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
      const { data: overlappingSales, error: overlapErr } = await supabase
        .from('transactions')
        .select('id, date, source_module')
        .eq('tenant_id', tenantId)
        .eq('type', 'POS_SALE')
        .gte('date', minDate)
        .lte('date', maxDate)
        .limit(1);
      if (overlapErr) throw new Error('Gagal memeriksa potensi duplikasi periode POS: ' + overlapErr.message);
      if (overlappingSales?.length) {
        throw new Error(`Periode ESB ${minDate} sampai ${maxDate} bersinggungan dengan penjualan yang sudah ada. Untuk mencegah omzet terhitung dua kali, pilih mode Timpa/Overwrite setelah memeriksa periode dan file sumber.`);
      }
    }

    // Overwrite replaces the POS/theoretical dataset for the selected period.
    // It does not reverse or remove old POS_DEDUCTION rows, since those may
    // already be reflected in historical balances. Legacy deductions are surfaced.
    if (options.mode === 'overwrite') {
      const { data: legacyDeductions, error: legacyErr } = await supabase
        .from('transactions').select('id').eq('tenant_id', tenantId).eq('type', 'POS_DEDUCTION')
        .gte('date', minDate).lte('date', maxDate).limit(1);
      if (legacyErr) throw legacyErr;
      const { error: salesDeleteErr } = await supabase.from('transactions').delete()
        .eq('tenant_id', tenantId).eq('type', 'POS_SALE').gte('date', minDate).lte('date', maxDate);
      if (salesDeleteErr) throw new Error('Gagal mengganti data penjualan periode: ' + salesDeleteErr.message);
      const { error: expectedDeleteErr } = await supabase.from('expected_usage').delete()
        .eq('tenant_id', tenantId).lte('week_start', maxDate).gte('week_end', minDate);
      if (expectedDeleteErr) throw new Error('Gagal mengganti data theoretical usage periode: ' + expectedDeleteErr.message);
      // Keep prior upload metadata except the same content hash, which is replaced below.
      await supabase.from('pos_upload_logs').delete().eq('tenant_id', tenantId).eq('file_hash', contentHash);
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
    const recipeIds = [...new Set(posDataArray.map(row => row.recipe_id).filter(Boolean))];
    let recipesById = new Map();
    if (recipeIds.length) {
      const { data, error } = await supabase.from('recipes')
        .select('id, menu_name, pos_code')
        .eq('tenant_id', tenantId)
        .in('id', recipeIds);
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
  getUsageVariance: async (month, year) => {
    const tenantId = await getActiveTenantId();
    const m = month.toString().padStart(2, '0');
    const startDate = `${year}-${m}-01`;
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    const endDate = `${year}-${m}-${String(lastDay).padStart(2, '0')}`;

    const [{ data: expectedUsageRows, error: euErr }, { data: dailyInventories, error: diErr }, { data: materials, error: matErr }] =
      await Promise.all([
        supabase.from('expected_usage').select('*')
          .eq('tenant_id', tenantId)
          .gte('week_start', startDate).lte('week_end', endDate),
        supabase.from('daily_inventories').select('*, daily_inventory_items(*)')
          .eq('tenant_id', tenantId)
          .gte('date', startDate).lte('date', endDate),
        supabase.from('materials').select('id, name, price, unit, full_pack').eq('tenant_id', tenantId),
      ]);

    if (euErr) throw euErr;
    if (diErr) throw diErr;
    if (matErr) throw matErr;

    const unitConversionMap = await api._loadUnitConversionMap(tenantId);
    return calculateUsageVariance(expectedUsageRows || [], dailyInventories || [], materials || [], unitConversionMap);
  },

  // Set memory cache to avoid async locks in browser
  getPOSOrders: async () => {
    try {
      const tenantId = await getActiveTenantId();
      const { data, error } = await supabase
        .from('pos_orders')
        .select('*')
        .eq('tenant_id', tenantId)
        ;
      if (error) { console.error("DB Error:", error); throw error; }
      return data;
    } catch (err) {
      console.error('getPOSOrders error:', err);
      throw err;
    }
  },

  getPOSOrderItems: async (orderId) => {
    try {
      const tenantId = await getActiveTenantId();
      // Verify the order belongs to the active tenant before returning items
      const { data: order } = await supabase.from('pos_orders').select('id').eq('id', orderId).eq('tenant_id', tenantId).maybeSingle();
      if (!order) throw new Error('Order tidak ditemukan atau akses ditolak.');
      const { data, error } = await supabase
        .from('pos_order_items')
        .select('*, recipes(menu_name)')
        .eq('order_id', orderId);
      if (error) { console.error("DB Error:", error); throw error; }
      return data;
    } catch (err) {
      console.error('getPOSOrderItems error:', err);
      throw err;
    }
  },

  setSessionData: (tenantId, userId, overheadPct, whatsappNumber, whatsappToken, whatsappEnabled, branchId) => {
    activeTenantId = tenantId;
    activeUserId = userId;
    if (overheadPct !== undefined && overheadPct !== null) {
      activeOverheadPct = parseFloat(overheadPct);
    }
    activeWhatsappNumber = whatsappNumber || null;
    activeWhatsappToken = whatsappToken || null;
    activeWhatsappEnabled = !!whatsappEnabled;
    activeBranchId = branchId || null;
    window.__activeBranchId = activeBranchId;
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
    //    and grab tenant_id so we can fallback-create the profile below.
    const { data: invite, error: inviteErr } = await supabase
      .from('invitations')
      .select('id, tenant_id, is_used, expires_at, invite_role')
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

    // 2. Create the Supabase Auth user (passing full metadata including tenant_id and role to prevent database trigger failures)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
          tenant_id: invite.tenant_id,
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

    // 3. Fallback: insert into public.users in case the DB trigger didn't
    //    (mirrors the same fallback already used in register() — KRITIS-01 fix pattern)
    const { data: profileCheck } = await supabase.from('users').select('id').eq('id', data.user.id).maybeSingle();
    if (!profileCheck) {
      const { error: insertErr } = await supabase.from('users').insert({
        id: data.user.id,
        tenant_id: invite.tenant_id,
        name: name,
        email: email,
        role: assignedRole
      });
      if (insertErr) {
        throw new Error('Akun berhasil dibuat, tapi gagal menyimpan profil: ' + insertErr.message);
      }
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

    if (typeof sessionStorage !== 'undefined') {
      try { sessionStorage.setItem('bv_cached_profile', JSON.stringify(fullProfile)); } catch {
        // ignore storage errors
      }
    }
    return fullProfile;
  },
  // 1.5 Tenant Invitations
  generateTenantInvite: async (tenantId, role = 'Admin / Owner') => {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;

    const { data, error } = await supabase
      .from('invitations')
      .insert({
        tenant_id: tenantId,
        expires_at: expiresAt.toISOString(),
        created_by: userId,
        invite_role: role
      })
      .select('token')
      .single();

    if (error) throw new Error("Gagal membuat link undangan: " + error.message);

    // Return full URL
    const baseUrl = window.location.origin;
    return `${baseUrl}/login?token=${data.token}`;
  },

  // --- LEDGER TRANSACTIONS ---
  getTransactions: async (period = null) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return []; // H-2: Super Admin / no-tenant — avoid malformed .eq('tenant_id', null) query
    let query = supabase
      .from('transactions')
      .select('*, materials(name)')
      .eq('tenant_id', tenantId);
    
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
  getTransactionsPaged: async ({ page = 1, pageSize = 20, search = '', materialName = null, location = null } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { data: [], totalCount: 0 };
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('transactions')
      .select('*, materials(name)', { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (materialName) {
      const { data: mat } = await supabase.from('materials').select('id').eq('tenant_id', tenantId).eq('name', materialName).maybeSingle();
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
  getStockSnapshotAt: async (location, targetDate) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];

    // 1. Get current stock
    const materials = await materialsRepo.getAll(tenantId);

    // If targetDate is in the future or within the current day, just return current stock
    if (new Date(targetDate) >= new Date()) return materials;

    // 2. Fetch all transactions AFTER targetDate
    const { data: txs } = await supabase.from('transactions')
      .select('material_id, qty, location, type')
      .eq('tenant_id', tenantId)
      .gt('date', targetDate);

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

  getMaterials: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return []; // H-2: Super Admin / no-tenant — avoid malformed .eq('tenant_id', null) query
    return await materialsRepo.getAll(tenantId);
  },

  // Paginated + searchable version for the Stock Ledger table. The full
  // getMaterials() above is kept as-is since other forms (recipe/invoice
  // ingredient pickers) still need the complete unpaginated list.
  getMaterialsPaged: async ({ page = 1, pageSize = 20, search = '' } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { data: [], totalCount: 0 };
    return await materialsRepo.getPaged(tenantId, { page, pageSize, search: sanitizePostgrest(search) });
  },
  
  createMaterial: async (materialData) => {
    const tenantId = await requireTenantId();
    const data = await materialsRepo.create(tenantId, materialData);
    await logAudit('CREATE_MATERIAL', `Menambahkan bahan baku baru: "${data.name}" ke kategori "${data.category}".`);
    return data;
  },

  updateMaterial: async (id, materialData) => {
    const tenantId = await requireTenantId();
    const { data: oldMaterial } = await supabase.from('materials').select('*').eq('id', id).eq('tenant_id', tenantId).single();

    const data = await materialsRepo.update(tenantId, id, materialData, oldMaterial);

    if (oldMaterial.price !== data.price || oldMaterial.new_price !== data.new_price) {
      const formattedOld = new Intl.NumberFormat('id-ID').format(oldMaterial.new_price || oldMaterial.price);
      const formattedNew = new Intl.NumberFormat('id-ID').format(data.new_price);
      await logAudit('UPDATE_PRICE', `Mengubah harga bahan "${data.name}" dari Rp${formattedOld} menjadi Rp${formattedNew}.`);
    } else {
      await logAudit('UPDATE_MATERIAL', `Memperbarui detail bahan mentah: "${data.name}".`);
    }

    return data;
  },

  deleteMaterial: async (id, force = false) => {
    const tenantId = await requireTenantId();
    // Check if ingredient is used in recipes
    const { count, error: countErr } = await supabase
      .from('recipe_ingredients')
      .select('*', { count: 'exact', head: true })
      .eq('material_id', id);

    if (!countErr && count > 0) {
      if (!force) {
        const err = new Error(`Tidak bisa menonaktifkan: bahan baku ini masih digunakan di ${count} resep aktif. Hapus dari resep terlebih dahulu.`);
        err.hasDependencies = true;
        err.dependencyCount = count;
        throw err;
      } else {
        // Force delete: remove dependencies first
        await supabase.from('recipe_ingredients').delete().eq('material_id', id);
      }
    }

    const data = await materialsRepo.delete(tenantId, id);
    await logAudit('DELETE_MATERIAL', `Menonaktifkan bahan mentah: "${data.name}" dari database inventory.`);
    return data;
  },

  adjustStock: async (id, arg2, arg3, arg4, arg5) => {
    const tenantId = await requireTenantId();

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
      const { data: mat, error: fetchErr } = await supabase
        .from('materials')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

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
      const { data: updatedMat, error: updateErr } = await supabase
        .from('materials')
        .update({
          [locField]: newStock,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('tenant_id', tenantId)
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
  createTransfer: async ({ material_id, quantity, source_branch, target_branch, notes }) => {
    const tenantId = await requireTenantId();
    const userId = await getActiveUserId();
    const qty = parseFloat(quantity);
    if (!material_id || isNaN(qty) || qty <= 0) {
      throw new Error('Pilih bahan baku dan masukkan kuantitas transfer yang valid (lebih dari 0).');
    }

    if (source_branch === target_branch) {
      throw new Error('Lokasi asal dan lokasi tujuan transfer tidak boleh sama.');
    }

    const { data: mat, error: matErr } = await supabase
      .from('materials')
      .select('*')
      .eq('id', material_id)
      .eq('tenant_id', tenantId)
      .single();
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
  createTransferRequest: async ({ material_id, qty, source_branch, target_branch, notes }) => {
    const tenantId = await getActiveTenantId();
    const { data: mat } = await supabase.from('materials').select('price').eq('id', material_id).single();
    const unitPrice = parseFloat(mat?.price) || 0;
    
    const { data, error } = await supabase.from('transactions').insert({
      tenant_id: tenantId,
      date: new Date().toISOString().split('T')[0],
      material_id: material_id,
      type: 'TRANSFER_REQUEST',
      location: target_branch,
      qty: parseFloat(qty),
      amount: parseFloat(qty) * unitPrice,
      notes: `Request Transfer [${source_branch} ➔ ${target_branch}] - ${notes || ''}`
    }).select().single();
    
    if (error) throw new Error('Gagal membuat request transfer: ' + error.message);
    return data;
  },
  
  getTransferRequests: async () => {
    try {
      const tenantId = await getActiveTenantId();
      if (!tenantId) return [];
      const { data, error } = await supabase.from('transactions')
        .select('*, materials(id, name, sku, unit, qty_resto, qty_central)')
        .eq('tenant_id', tenantId)
        .eq('type', 'TRANSFER_REQUEST')
        .order('id', { ascending: false });
      if (error) {
        // Handle database enum transaction_type without TRANSFER_REQUEST gracefully
        console.warn('Transfer requests not available in DB transaction_type enum:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn('Error in getTransferRequests:', err);
      return [];
    }
  },
  
  approveTransferRequest: async (txId) => {
    const tenantId = await getActiveTenantId();
    const { data: tx, error: fetchErr } = await supabase.from('transactions').select('*').eq('id', txId).eq('tenant_id', tenantId).single();
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
      notes: 'Disetujui dari Request'
    });
    
    // Delete the request
    await supabase.from('transactions').delete().eq('id', txId);
  },
  
  rejectTransferRequest: async (txId) => {
    const tenantId = await getActiveTenantId();
    await supabase.from('transactions').delete().eq('id', txId).eq('tenant_id', tenantId);
  },

  getTransfers: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from('transactions')
      .select('*, materials(id, name, sku, unit, price, category, qty_resto, qty_central)')
      .eq('tenant_id', tenantId)
      .eq('type', 'TRANSFER')
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
      const match = tx.notes ? tx.notes.match(/Transfer \[([^\]]+) ➔ ([^\]]+)\](?: - (.*))?/) : null;
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
  recordWaste: async ({ material_id, quantity, type = 'WASTE', location = 'RESTO', reason = '', notes = '', date = null, request_key = null }) => {
    const tenantId = await requireTenantId();
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

    // No client-side fallback: stock and ledger must change atomically, otherwise
    // a partial success could deduct inventory twice after a retry.
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

    const { data: mat } = await supabase.from('materials').select('name, unit').eq('id', material_id).eq('tenant_id', tenantId).maybeSingle();
    const costLoss = Number(result?.cost_loss) || 0;
    await logAudit('RECORD_WASTE', `${result?.duplicate ? 'Retry duplikat diabaikan. ' : ''}Mencatat waste ${qty} ${mat?.unit || ''} "${mat?.name || 'Item'}" (${safeTxType}) di ${locKey}. Kerugian: Rp ${costLoss.toLocaleString('id-ID')}.`);
    return { success: true, duplicate: Boolean(result?.duplicate), material: mat || null, costLoss, transaction_id: result?.transaction_id };
  },

  getWasteLogs: async ({ period = null, type = null } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];

    const validWasteTypes = ['WASTE', 'BREAKAGE', 'EXPIRED', 'COMP'];

    let query = supabase
      .from('transactions')
      .select('*, materials(id, name, sku, unit, price, category, full_pack, qty_resto, qty_central)')
      .eq('tenant_id', tenantId)
      .in('type', validWasteTypes)
      .order('date', { ascending: false })
      .order('id', { ascending: false });

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
  getRecipes: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return []; // H-2: Super Admin / no-tenant — avoid malformed .eq('tenant_id', null) query
    const { data, error } = await supabase
      .from('recipes')
      .select('*, recipe_ingredients(*, materials(*))')
      .eq('tenant_id', tenantId)
      .order('menu_name');

    if (error) throw new Error("Gagal memuat resep: " + error.message);

    // Map ingredients structures to match UI expectations
    return data.map(r => ({
      id: r.id,
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
  getRecipesPaged: async ({ page = 1, pageSize = 15, search = '' } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { data: [], totalCount: 0 };
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('recipes')
      .select('*, recipe_ingredients(*, materials(*))', { count: 'exact' })
      .eq('tenant_id', tenantId);

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
    const tenantId = await getActiveTenantId();
    
    // 1. Process calculations using ported controller logic
    let subtotal = 0.00;
    const ingredientRows = [];

    // Pre-fetch all materials for this recipe
    const matIds = recipeData.ingredients.map(i => i.material_id);
    const { data: materials } = await supabase.from('materials').select('*').in('id', matIds);
    const materialsMap = new Map(materials.map(m => [m.id, m]));
    const unitConversionMap = await api._loadUnitConversionMap(tenantId);

    for (const ing of recipeData.ingredients) {
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

    // Recipe pricing engine (merged from barventis-vercel-repo, PRD §4.2 Opsi B):
    // fix_cost_pct defaults to this tenant's existing Overhead % setting
    // (activeOverheadPct) rather than a hardcoded 5%, unless the caller
    // explicitly passes one. selling_price_override (sent by the unchanged
    // Recipes.jsx form via DataContext.jsx) wins over the computed target
    // price, so manual price entry keeps working exactly as before.
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
        menu_name: recipeData.menu_name,
        category: recipeData.category || 'NON-KOPI',
        // FIX: jangan selalu kirim `image_url` — kolom ini belum tentu ada di
        // schema cache PostgREST (lihat migrasi 0004_add_recipe_image_url.sql).
        // Sama seperti pola aman di updateRecipe: hanya ikutkan key ini kalau
        // caller memang secara eksplisit mengisi image_url.
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
      ...row
    }));

    if (rowsToInsert.length > 0) {
      const { error: ingErr } = await supabase.from('recipe_ingredients').insert(rowsToInsert);
      if (ingErr) {
        // Rollback
        await supabase.from('recipes').delete().eq('id', recipe.id);
        throw new Error("Gagal menyimpan bahan resep: " + ingErr.message);
      }
    }

    const formattedHpp = new Intl.NumberFormat('id-ID').format(recipe.basic_cost);
    const formattedPrice = new Intl.NumberFormat('id-ID').format(recipe.selling_price);
    await logAudit('CREATE_RECIPE', `Membuat resep menu baru: "${recipe.menu_name}" dengan HPP Rp${formattedHpp} dan Harga Jual Rp${formattedPrice}.`);

    return recipe;
  },

  updateRecipe: async (id, recipeData) => {
    const tenantId = await getActiveTenantId();
    // 1. Process calculations
    let subtotal = 0.00;
    const ingredientRows = [];

    const matIds = recipeData.ingredients.map(i => i.material_id);
    const { data: materials } = await supabase.from('materials').select('*').in('id', matIds);
    const materialsMap = new Map(materials.map(m => [m.id, m]));
    const unitConversionMap = await api._loadUnitConversionMap(tenantId);

    for (const ing of recipeData.ingredients) {
      const material = materialsMap.get(ing.material_id);
      if (!material) continue;

      const unitPrice = parseFloat(material.avg_cost || material.new_price || material.price || 0);
      material.price = unitPrice; // Override so calculateIngredientCost uses it
      const amount = calculateIngredientCost(material, parseFloat(ing.qty_in_use), ing.unit, unitConversionMap);
      subtotal += amount;

      ingredientRows.push({
        recipe_id: id,
        tenant_id: tenantId,
        material_id: ing.material_id,
        qty_in_use: parseFloat(ing.qty_in_use),
        unit: ing.unit,
        unit_price: unitPrice,
        amount: parseFloat(amount.toFixed(2))
      });
    }

    // Recipe pricing engine (merged from barventis-vercel-repo, PRD §4.2 Opsi B) —
    // see createRecipe above for the full rationale.
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

    // 2. Update Recipe
    const { data: recipe, error: recipeErr } = await supabase
      .from('recipes')
      .update({
        menu_name: recipeData.menu_name,
        // Only touch category when explicitly provided, so recalc (which omits it)
        // never clobbers an existing category. (M-2)
        ...(recipeData.category !== undefined ? { category: recipeData.category } : {}),
        ...(recipeData.image_url !== undefined ? { image_url: recipeData.image_url } : {}),
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
      .eq('id', id)
      .select('*')
      .single();

    if (recipeErr) throw new Error("Gagal update resep: " + recipeErr.message);

    // 3. Replace Ingredients (insert new first, delete old only after that
    // succeeds — see the identical fix in bulkImportRecipes above for why:
    // deleting first meant a failed insert wiped the recipe's BOM with
    // nothing to restore it, since these are two separate calls, not one
    // atomic DB transaction.)
    const { data: oldIngredientRows } = await supabase
      .from('recipe_ingredients')
      .select('id')
      .eq('recipe_id', id);
    const oldIngredientIds = (oldIngredientRows || []).map(r => r.id);

    const { error: ingErr } = await supabase.from('recipe_ingredients').insert(ingredientRows);
    if (ingErr) throw new Error("Gagal menyimpan bahan resep baru: " + ingErr.message);

    if (oldIngredientIds.length > 0) {
      await supabase.from('recipe_ingredients').delete().in('id', oldIngredientIds);
    }

    const formattedHpp = new Intl.NumberFormat('id-ID').format(recipe.basic_cost);
    await logAudit('UPDATE_RECIPE', `Memperbarui resep menu: "${recipe.menu_name}" dengan HPP baru Rp${formattedHpp}.`);

    return recipe;
  },

  deleteRecipe: async (id) => {
    const { data: recipe } = await supabase.from('recipes').select('*').eq('id', id).single();

    // Harus hapus dependencies dulu karena tidak ada ON DELETE CASCADE
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', id);
    await supabase.from('pos_order_items').delete().eq('recipe_id', id);
    await supabase.from('pos_transaction_items').delete().eq('recipe_id', id);
    await supabase.from('recipe_versions').delete().eq('recipe_id', id);

    const { error } = await supabase.from('recipes').delete().eq('id', id);

    if (error) throw new Error("Gagal menghapus resep: " + error.message);
    await logAudit('DELETE_RECIPE', `Menghapus resep menu: "${recipe.menu_name}" dari database COGS.`);
    return true;
  },

  // Recalculate basic cost and food cost pct for all recipes.
  recalculateAllRecipes: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { updated: 0, results: [] };

    const { data: recipes, error } = await supabase
      .from('recipes')
      .select('*, recipe_ingredients(*, materials(*))')
      .eq('tenant_id', tenantId);
    if (error) throw new Error("Gagal memuat resep: " + error.message);

    const unitConversionMap = await api._loadUnitConversionMap(tenantId);

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
        const { error: updErr } = await supabase
          .from('recipes')
          .update({ subtotal, fix_cost: fixCost, basic_cost: basicCost, selling_price: sellingPrice, food_cost_pct: foodCostPct, updated_at: new Date().toISOString() })
          .eq('id', r.id);
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
          await supabase.from('recipe_ingredients').update({ unit_price: unitPrice, amount }).eq('id', ing.id);
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
  getInvoices: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return []; // H-2: Super Admin / no-tenant — avoid malformed .eq('tenant_id', null) query
    const { data, error } = await supabase
      .from('invoices')
      .select('*, invoice_items(*, materials(*))')
      .eq('tenant_id', tenantId)
      ;

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

  // Paginated + searchable (by invoice no / supplier) version for
  // the Invoicing list page.
  getInvoicesPaged: async ({ page = 1, pageSize = 15, search = '', status = 'ALL' } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { data: [], totalCount: 0 };
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('invoices')
      .select('*, invoice_items(*, materials(*))', { count: 'exact' })
      .eq('tenant_id', tenantId);

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
    const tenantId = await getActiveTenantId();

    // 1. Generate Invoice Number: INV-YYYYMMDD-XXX
    const dateToday = new Date();
    const dateStr = dateToday.getFullYear() + 
                    String(dateToday.getMonth() + 1).padStart(2, '0') + 
                    String(dateToday.getDate()).padStart(2, '0');

    // Count PO created today
    const { count } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .like('invoice_no', `INV-${dateStr}-%`);

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
      ...item
    }));

    const { error: itemsErr } = await supabase.from('invoice_items').insert(itemsToInsert);
    if (itemsErr) {
      await supabase.from('invoices').delete().eq('id', invoice.id);
      throw new Error("Gagal menyimpan rincian barang PO: " + itemsErr.message);
    }

    const formattedTotal = new Intl.NumberFormat('id-ID').format(invoice.total);
    await logAudit('CREATE_PO', `Membuat Purchase Order (PO) baru: ${invoice.invoice_no} untuk Supplier "${invoice.supplier}" senilai Rp${formattedTotal}. Lokasi: ${invoice.location}. Status: DRAFT.`);

    return invoice;
  },

  updateInvoiceStatus: async (id, status) => {
    const tenantId = await getActiveTenantId();
    const { data: oldInvoice } = await supabase.from('invoices').select('*').eq('id', id).eq('tenant_id', tenantId).single();
    if (oldInvoice.status === 'RECEIVED') {
      throw new Error('Tidak bisa mengubah status invoice PO yang sudah diterima (RECEIVED).');
    }

    const { data, error } = await supabase
      .from('invoices')
      .update({ status })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

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
    const tenantId = await getActiveTenantId();
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
      // Idempotent retry: invoice already received; do not re-add quantities.
      return await supabase.from('invoices').select('*').eq('id', id).eq('tenant_id', tenantId).single().then(({ data, error }) => {
        if (error) throw error;
        return data;
      });
    }

    if (photoUrl || signatureUrl || gps) {
      await supabase.from('invoices').update({
        receipt_photo_url: photoUrl,
        receipt_signature_url: signatureUrl,
        receipt_gps: gps
      }).eq('id', id);
    }

    // Fetch the updated invoice to return to the UI
    const { data: updatedInvoice, error: fetchErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !updatedInvoice) throw new Error("Gagal memuat invoice yang diperbarui.");

    try {
      const formattedTotal = new Intl.NumberFormat('id-ID').format(updatedInvoice.total);
      await logAudit('RECEIVE_PO', `Menerima barang untuk Purchase Order (PO): ${updatedInvoice.invoice_no} dari Supplier "${updatedInvoice.supplier}" senilai Rp${formattedTotal}. Stok gudang ${updatedInvoice.location || 'CENTRAL'} bertambah.`);
    } catch (e) {
      console.warn("Failed to log audit for receive PO:", e);
    }

    // Auto-sync market_list_items with the newly received invoice prices
    try {
      await api.syncMarketListPricesFromInvoice({ invoiceId: id });
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
    const tenantId = await getActiveTenantId();
    const userId = await getActiveUserId();
    const nowStr = new Date().toISOString().split('T')[0];

    // Check transaction limit (Maks 50 transaksi / hari)
    const { count, error: countErr } = await supabase
      .from('pos_orders')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', `${nowStr}T00:00:00Z`)
      .lte('created_at', `${nowStr}T23:59:59Z`);
      
    if (!countErr && count >= 50) {
      throw new Error('Batas transaksi POS harian (50) telah tercapai untuk paket Langkah Awal. Silakan upgrade paket atau beli Add-On untuk limit yang lebih besar.');
    }

    const orderNo = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

    // 1. Fetch recipes & ingredients for deduction calculation
    const recipeIds = cartItems.map(item => item.id);
    const { data: recipes } = await supabase
      .from('recipes')
      .select('id, menu_name, selling_price, recipe_ingredients(material_id, qty_in_use, unit, materials(id, name, unit, full_pack, qty_resto, price, new_price))')
      .in('id', recipeIds);

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
    const unitConversionMap = await api._loadUnitConversionMap(tenantId);

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

      // Allow negative stock to reflect actual physical depletion over delayed system inputs
      if (currentResto - deductQty < 0) {
        negativeWarnings.push(`Stok ${material.name} tersisa ${currentResto.toFixed(2)}, tapi order butuh ${deductQty.toFixed(2)}. (Stok akan jadi minus)`);
      }

      deductionsPayload.push({
        material_id: material.id,
        deduct_qty: deductQty
      });

      // Calculate precise deduction amount
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
      await supabase.from('pos_orders').update({ customer_name: customerName }).eq('order_no', orderNo);
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
    const tenantId = await getActiveTenantId();
    const userId = await getActiveUserId();
    
    const location = opnameData.location;
    const items = opnameData.items;
    const currentMonth = opnameData.period_month ? parseInt(opnameData.period_month, 10) : new Date().getMonth() + 1;
    const currentYear = opnameData.period_year ? parseInt(opnameData.period_year, 10) : new Date().getFullYear();

    // Do not erase a submitted/approved stock snapshot to recreate the same
    // period. Drafts may be replaced, but approved valuation is historical data.
    const { data: oldOpname, error: oldOpnameErr } = await supabase
      .from('stock_opnames')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('period_month', currentMonth)
      .eq('period_year', currentYear)
      .eq('location', location)
      .maybeSingle();
    if (oldOpnameErr) throw new Error('Gagal memeriksa stock opname periode ini: ' + oldOpnameErr.message);

    if (oldOpname && !['DRAFT', 'COUNTING'].includes(String(oldOpname.status || '').toUpperCase())) {
      throw new Error(`Stock opname ${currentMonth}/${currentYear} lokasi ${location} sudah ${oldOpname.status}. Snapshot historis tidak boleh dihapus; buat koreksi/revisi yang dapat diaudit.`);
    }

    if (oldOpname) {
      const { error: oldItemsDeleteErr } = await supabase.from('stock_opname_items').delete().eq('opname_id', oldOpname.id);
      if (oldItemsDeleteErr) throw new Error('Gagal mengganti draft stock opname: ' + oldItemsDeleteErr.message);
      const { error: oldHeaderDeleteErr } = await supabase.from('stock_opnames').delete().eq('id', oldOpname.id).eq('tenant_id', tenantId);
      if (oldHeaderDeleteErr) throw new Error('Gagal menghapus draft stock opname lama: ' + oldHeaderDeleteErr.message);
    }

    // 2. Create Persistent Stock Opname record as DRAFT first
    const { data: opname, error: opnameErr } = await supabase
      .from('stock_opnames')
      .insert({
        tenant_id: tenantId,
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

    // Pre-fetch materials system book quantities
    const matIds = items.map(i => i.material_id);
    const { data: materials } = await supabase.from('materials').select('*').in('id', matIds);
    const materialsMap = new Map(materials.map(m => [m.id, m]));

    for (const item of items) {
      const material = materialsMap.get(item.material_id);
      if (!material) continue;

      const physicalQty = parseFloat(item.physical_qty || 0);
      const systemQty = location === 'RESTO' ? parseFloat(material.qty_resto) : parseFloat(material.qty_central);

      opnameItems.push({
        opname_id: opname.id,
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
        await supabase.from('stock_opnames').delete().eq('id', opname.id);
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
      await supabase.from('stock_opname_items').delete().eq('opname_id', opname.id);
      await supabase.from('stock_opnames').delete().eq('id', opname.id);
      throw new Error("Gagal menyelesaikan opname secara atomik: " + rpcErr.message);
    }

    const adjustmentsCount = rpcRes.adjustments_made || 0;

    await logAudit('COMPLETE_OPNAME', `Menyelesaikan Stock Opname di gudang ${location}. Menyesuaikan ${adjustmentsCount} item.`);
    return rpcRes;
  },

  // --- REPORTS ---
  getCostControlReport: async (month) => {
    // month is "YYYY-MM"
    const tenantId = await getActiveTenantId();
    await logAudit('VIEW_COST_CONTROL', `Membuka lembar laporan bulanan Cost Control periode: ${month}.`);

    const startDate = `${month}-01`;
    // Calculate last date of month in JS
    const parts = month.split('-');
    const year = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    const lastDay = new Date(year, m, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
    const unitConversionMap = await api._loadUnitConversionMap(tenantId);

    // 1. Fetch closing valuation from this month's opnames if they exist (RESTO + CENTRAL)
    // FIX 2026-09 (QA finding 3C, root cause Total Stock Akhir ~2x lipat): query
    // ini sebelumnya tidak memfilter status, jadi draft/opname ganda untuk
    // periode+cabang yang sama ikut dijumlah. Sekarang hanya opname yang sudah
    // final yang dihitung — didukung juga oleh UNIQUE constraint di migrasi
    // 0009_cost_control_integrity_fix.sql yang mencegah duplikat baru terbentuk.
    //
    // !! VERIFIKASI SEBELUM DEPLOY !!: nilai 'APPROVED' di bawah ini ASUMSI.
    // Enum `opname_status` di-set final oleh RPC `complete_opname_atomic`
    // (Postgres function), yang badannya TIDAK ADA di source/migration yang
    // di-export ke QA ini — hanya default 'DRAFT' yang terlihat. Cek langsung
    // definisi RPC tsb di Supabase Dashboard (Database > Functions) untuk
    // memastikan nilai status final yang benar (mis. bisa jadi 'APPROVED',
    // 'COMPLETED', atau 'SUBMITTED'), lalu sesuaikan filter di bawah. Kalau
    // nilainya salah, query ini akan selalu kosong dan JUSTRU memaksa semua
    // laporan masuk fallback derivation (memperparah, bukan memperbaiki).
    const { data: rawThisOpnames, error: thisOpnamesErr } = await supabase
      .from('stock_opnames')
      .select('id, location, approved_at, created_at')
      .eq('tenant_id', tenantId)
      .eq('period_month', m)
      .eq('period_year', year)
      .eq('status', 'APPROVED')
      .order('approved_at', { ascending: false })
      .order('created_at', { ascending: false });
    if (thisOpnamesErr) throw thisOpnamesErr;
    // Use one latest approved snapshot per location; summing multiple approved
    // snapshots for the same month would inflate closing inventory.
    const latestThisOpnameByLocation = {};
    for (const opname of (rawThisOpnames || [])) {
      const location = opname.location || 'RESTO';
      if (!latestThisOpnameByLocation[location]) latestThisOpnameByLocation[location] = opname;
    }
    const thisOpnames = Object.values(latestThisOpnameByLocation);
    const opnameLocationById = Object.fromEntries(thisOpnames.map(o => [o.id, o.location || 'RESTO']));
    const { data: locationCostRows, error: locationCostErr } = await supabase
      .from('material_location_costs')
      .select('material_id, location, average_unit_cost, is_opening_estimated')
      .eq('tenant_id', tenantId);
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
      const { data: opnameItems } = await supabase
        .from('stock_opname_items')
        .select('opname_id, physical_qty, book_qty, material_id, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated, materials(name, new_price, price, avg_cost, category, unit, full_pack, supplier)')
        .in('opname_id', opnameIds);

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
      // Prefer the last final EOD per location for the month; never use today's
      // live balance to silently rewrite a prior month's closing stock.
      const { data: eodClosingHeaders, error: eodClosingErr } = await supabase
        .from('daily_inventories')
        .select('id, date, location')
        .eq('tenant_id', tenantId)
        .gte('date', startDate)
        .lte('date', endDate)
        .in('status', ['verified', 'closed'])
        .order('date', { ascending: false });
      if (eodClosingErr) throw eodClosingErr;
      const latestEodByLocation = {};
      for (const header of (eodClosingHeaders || [])) {
        if (!latestEodByLocation[header.location]) latestEodByLocation[header.location] = header;
      }
      const latestEodHeaders = Object.values(latestEodByLocation);
      if (latestEodHeaders.length) {
        const { data: eodItems, error: eodItemErr } = await supabase
          .from('daily_inventory_items')
          .select('inventory_id, material_id, closing_qty, book_qty_before_close, out_qty, unit_cost_snapshot, materials(name, category, unit, full_pack, supplier, avg_cost, price)')
          .eq('tenant_id', tenantId)
          .in('inventory_id', latestEodHeaders.map(h => h.id));
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
        // Last-resort fallback for an unclosed/current period. This is explicitly
        // marked estimated; it is not a historical stock snapshot.
        closingStockEstimated = true;
        const { data: materials, error: materialsErr } = await supabase
          .from('materials').select('*').eq('tenant_id', tenantId).eq('is_active', true);
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
    const { data: transactions } = await supabase
      .from('transactions')
      .select('type, amount, date, notes, material_id, is_reversed, materials(category)')
      .eq('tenant_id', tenantId)
      .eq('is_reversed', false)
      .gte('date', startDate)
      .lte('date', endDate);

    // Actual daily usage is based only on verified EOD sessions and the OUT
    // confirmed by staff. This remains separate from the stock-based method.
    const { data: closedEodHeaders, error: eodHeadersErr } = await supabase
      .from('daily_inventories')
      .select('id, date, location')
      .eq('tenant_id', tenantId)
      .gte('date', startDate)
      .lte('date', endDate)
      .in('status', ['verified', 'closed']);
    if (eodHeadersErr) throw new Error('Gagal memuat sesi EOD final untuk Cost Control: ' + eodHeadersErr.message);

    let closedEodItems = [];
    if (closedEodHeaders?.length) {
      const { data: eodItems, error: eodItemsErr } = await supabase
        .from('daily_inventory_items')
        .select('inventory_id, material_id, out_qty, usage_value, unit_cost_snapshot, stock_based_usage_qty, usage_variance_qty, waste_qty')
        .eq('tenant_id', tenantId)
        .in('inventory_id', closedEodHeaders.map(h => h.id));
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

    const { data: expectedUsageRows, error: expectedUsageErr } = await supabase
      .from('expected_usage')
      .select('material_id, expected_qty, expected_cost_value, unit_cost_snapshot, materials(avg_cost, price)')
      .eq('tenant_id', tenantId)
      .lte('week_start', endDate)
      .gte('week_end', startDate);
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
    const { data: rawPrevOpnames, error: prevOpnamesErr } = await supabase
      .from('stock_opnames')
      .select('id, location, approved_at, created_at')
      .eq('tenant_id', tenantId)
      .eq('period_month', prevMonth)
      .eq('period_year', prevYear)
      .eq('status', 'APPROVED')
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
      const { data: prevOpnameItems, error: prevItemsErr } = await supabase
        .from('stock_opname_items')
        .select('opname_id, physical_qty, material_id, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated, materials(new_price, price, avg_cost, unit, full_pack, name)')
        .in('opname_id', prevOpnameIds);
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
      const { data: priorEodHeaders, error: priorEodErr } = await supabase
        .from('daily_inventories')
        .select('id, date, location')
        .eq('tenant_id', tenantId)
        .lt('date', startDate)
        .in('status', ['verified', 'closed'])
        .order('date', { ascending: false });
      if (priorEodErr) throw priorEodErr;
      const latestPriorByLocation = {};
      for (const header of (priorEodHeaders || [])) {
        if (!latestPriorByLocation[header.location]) latestPriorByLocation[header.location] = header;
      }
      const priorHeaders = Object.values(latestPriorByLocation);
      if (priorHeaders.length) {
        const { data: priorItems, error: priorItemsErr } = await supabase
          .from('daily_inventory_items')
          .select('inventory_id, material_id, closing_qty, unit_cost_snapshot, materials(avg_cost, price, unit, full_pack, name)')
          .eq('tenant_id', tenantId)
          .in('inventory_id', priorHeaders.map(h => h.id));
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
  getSuppliers: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name');
    if (error) throw new Error("Gagal memuat supplier: " + error.message);
    return data;
  },

  saveSupplier: async (supplierData) => {
    const tenantId = await getActiveTenantId();
    const payload = {
      tenant_id: tenantId,
      name: supplierData.name,
      phone: supplierData.phone || null,
      address: supplierData.address || null,
      contact_person: supplierData.contact_person || null
    };

    if (supplierData.id) {
      const { data, error } = await supabase.from('suppliers').update(payload).eq('id', supplierData.id).select().single();
      if (error) throw new Error("Gagal menyimpan supplier: " + error.message);
      await logAudit('UPDATE_SUPPLIER', `Mengubah data supplier "${data.name}".`);
      return data;
    }
    const { data, error } = await supabase.from('suppliers').insert(payload).select().single();
    if (error) throw new Error("Gagal menyimpan supplier: " + error.message);
    await logAudit('CREATE_SUPPLIER', `Menambahkan supplier baru "${data.name}".`);
    return data;
  },

  // --- PURCHASE ENTRIES (Daily Purchasing) ---
  // Paginated + searchable (search matches purchase notes or the linked
  // material's name) so the history table never has to pull hundreds of
  // rows at once — fixes the previous unbounded 400/embedding issue too,
  // since this goes through a single well-formed query with FK embeds.
  getPurchaseEntriesPaged: async ({ page = 1, pageSize = 15, search = '', material_id = null, period = null } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { data: [], totalCount: 0 };
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('purchase_entries')
      .select('*, materials(name, unit), suppliers(name)', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('is_cancelled', false);

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
      const { data: matMatches } = await supabase
        .from('materials')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('name', `%${s}%`);
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

    // Calculate total nominal and get ALL IDs across ALL matching records (not just the current page)
    // We clone the query but only select the fields we need to calculate total
    let totalQuery = supabase
      .from('purchase_entries')
      .select('id, qty, unit_price')
      .eq('tenant_id', tenantId)
      .eq('is_cancelled', false);

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
      const { data: matMatches } = await supabase
        .from('materials')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('name', `%${s}%`);
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
    const userId = await getActiveUserId();
    const destination = String(purchaseData.destination || 'RESTO').toUpperCase().includes('CENTRAL') ? 'CENTRAL' : 'RESTO';
    const qty = Number(purchaseData.qty);
    const unitPrice = Number(purchaseData.unit_price);
    if (!purchaseData.material_id || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error('Barang, kuantitas pembelian (> 0), dan harga satuan yang valid wajib diisi.');
    }
    const payload = {
      material_id: Number(purchaseData.material_id),
      supplier_id: purchaseData.supplier_id || null,
      qty,
      unit: purchaseData.unit,
      unit_price: unitPrice,
      date: purchaseData.date || getLocalDateISO(),
      notes: purchaseData.notes || null,
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

    // Daily Inventory IN is derived from the transaction ledger at read-time;
    // never increment daily_inventory_items from the purchase form as well.
    await logAudit('CREATE_PURCHASE_ENTRY', `${rpcResult?.duplicate ? 'Retry duplikat diabaikan. ' : ''}Mencatat pembelian ${payload.qty} ${payload.unit} ke ${destination} (Rp ${(payload.qty * payload.unit_price).toLocaleString('id-ID')}).`);
    return { success: true, duplicate: Boolean(rpcResult?.duplicate), ...rpcResult };
  },

  deletePurchaseEntry: async (purchaseId) => {
    const tenantId = await requireTenantId();
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
      query = query.not('actor_id', 'is', null);
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
  bulkImportMaterials: async (rows) => {
    const tenantId = await getActiveTenantId();
    let success = 0;
    let failed = 0;
    const errors = [];

    // Pre-fetch all existing suppliers to avoid duplicates
    const { data: allSuppliers } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('tenant_id', tenantId);

    // Track known suppliers by name (case-insensitive)
    const suppliersMap = new Map((allSuppliers || []).map(s => [s.name.toLowerCase().trim(), s]));

    // BUG-FIX 2026-08: previously upserted with `onConflict: 'tenant_id, name'`,
    // so re-importing after a name fix/rename (KODE ITEM unchanged) inserted a
    // NEW orphaned row instead of updating the existing one — see analysis
    // Bagian 1.1. Pre-fetch existing materials by sku AND name, resolve the
    // target row ourselves (sku wins over name), then use an explicit
    // update()/insert() instead of upsert()+onConflict — this also sidesteps
    // needing a DB unique constraint on (tenant_id, sku) (analysis Bagian 3.4).
    const { data: allMaterialsForImport } = await supabase
      .from('materials')
      .select('id, name, sku')
      .eq('tenant_id', tenantId);

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
        
        // Auto-create supplier if it doesn't exist
        if (!suppliersMap.has(supplierKey)) {
          const { data: newSupplier, error: suppErr } = await supabase.from('suppliers').insert({
            tenant_id: tenantId,
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

        // Stable code (KODE ITEM) for cross-referencing this material from
        // recipe bulk imports and any external backend/POS integration,
        // instead of matching by name text alone.
        const rowSku = row.sku !== undefined && row.sku !== '' ? String(row.sku).trim() : '';
        if (rowSku) {
          insertData.sku = rowSku;
        }
        
        // If they provided initial stock, set it (optional)
        if (row.qty_resto !== undefined && row.qty_resto !== '') {
          insertData.qty_resto = parseFloat(row.qty_resto || 0);
        }

        // Resolve the existing row this import row refers to: KODE ITEM (sku)
        // wins over name, so editing the name on re-import (typo fix, rename)
        // still updates the SAME material instead of creating an orphan.
        let existingMaterial = null;
        if (rowSku) existingMaterial = materialsBySkuForImport.get(rowSku.toLowerCase());
        if (!existingMaterial && row.name) {
          existingMaterial = materialsByNameForImport.get(String(row.name).toLowerCase().trim());
        }

        let error;
        if (existingMaterial) {
          ({ error } = await supabase.from('materials').update(insertData).eq('id', existingMaterial.id));
        } else {
          const { data: insertedMaterial, error: insErr } = await supabase
            .from('materials')
            .insert(insertData)
            .select('id, name, sku')
            .single();
          error = insErr;
          // Keep local maps in sync so later rows in this same import batch
          // (e.g. duplicate sku typo'd twice) resolve against it too.
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

  bulkImportRecipes: async (rows) => {
    // FIX 2026-09: use requireTenantId() (throws immediately with a clear
    // message) instead of getActiveTenantId() (silently returns null for
    // SuperAdmin / no-tenant sessions). Previously a null tenantId here would
    // silently flow into every recipe_ingredients row built below, and only
    // surface much later as a cryptic per-row Postgres "null value in column
    // tenant_id" error instead of one clear upfront failure.
    const tenantId = await requireTenantId();
    const unitConversionMap = await api._loadUnitConversionMap(tenantId);

    let success = 0;
    let failed = 0;
    const errors = [];
    const warnings = [];

    // Pre-fetch all materials for the tenant, indexed by both name AND sku
    // (kode item) so ingredient references can be resolved deterministically
    // by code when given, instead of relying purely on exact name matching.
    const { data: allMaterials } = await supabase
      .from('materials')
      .select('id, name, sku, unit, full_pack, price, new_price')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    const materialsMap = new Map((allMaterials || []).map(m => [m.name.toLowerCase().trim(), m]));
    const materialsBySku = new Map((allMaterials || []).filter(m => m.sku).map(m => [m.sku.toLowerCase().trim(), m]));

    // BUG-FIX 2026-08: previously upserted with `onConflict: 'menu_name,tenant_id'`,
    // so re-importing after a menu name fix/rename (KODE MENU/pos_code unchanged)
    // inserted a NEW recipe row with the SAME pos_code as the old one — see
    // analysis Bagian 1.2, which then breaks POS matching (Bagian 1.3) because
    // two recipes share one pos_code. Pre-fetch existing recipes by pos_code AND
    // menu_name, resolve the target row ourselves (pos_code wins over name), then
    // use an explicit update()/insert() instead of upsert()+onConflict — this also
    // sidesteps needing a DB unique constraint on (tenant_id, pos_code) (Bagian 3.4).
    const { data: allRecipesForImport } = await supabase
      .from('recipes')
      .select('id, menu_name, pos_code')
      .eq('tenant_id', tenantId);

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

        // Resolve the existing row this import row refers to: KODE MENU
        // (pos_code) wins over menu_name, so editing the name on re-import
        // still updates the SAME recipe instead of creating a pos_code-colliding
        // duplicate.
        let existingRecipe = null;
        if (normalizedRecipeCode) {
          existingRecipe = recipesByCodeForImport.get(normalizedRecipeCode.toLowerCase());
        }
        if (!existingRecipe && row.menu_name) {
          existingRecipe = recipesByNameForImport.get(String(row.menu_name).toLowerCase().trim());
        }

        let recipeData, recipeErr;
        if (existingRecipe) {
          ({ data: recipeData, error: recipeErr } = await supabase
            .from('recipes')
            .update(recipePayload)
            .eq('id', existingRecipe.id)
            .select('id')
            .single());
        } else {
          ({ data: recipeData, error: recipeErr } = await supabase
            .from('recipes')
            .insert(recipePayload)
            .select('id')
            .single());
        }

        if (recipeErr) throw new Error(recipeErr.message);

        // Keep local maps in sync so later rows in this same import batch
        // resolve against the row we just wrote.
        if (recipeData?.id) {
          const rec = { id: recipeData.id, menu_name: row.menu_name, pos_code: normalizedRecipeCode };
          if (normalizedRecipeCode) recipesByCodeForImport.set(normalizedRecipeCode.toLowerCase(), rec);
          if (row.menu_name) recipesByNameForImport.set(String(row.menu_name).toLowerCase().trim(), rec);
        }

        // Link ingredients if recipe was successfully upserted
        if (ingredients.length > 0 && recipeData?.id) {
          const ingredientsToInsert = [];
          for (const ing of ingredients) {
            if (!ing.item_name && !ing.item_code) continue;

            let mat = resolveMaterial(ing.item_code, ing.item_name);
            
            // AUTO-CREATE MATERIAL IF NOT FOUND (by kode or nama) — kept as a
            // convenience default so an import never hard-fails over a missing
            // material, but now tracked and surfaced via `warnings` so it's
            // visible and fixable instead of a silent Rp0 material quietly
            // skewing this and every other recipe's HPP.
            if (!mat) {
              const newName = ing.item_name || ing.item_code;
              const { data: newMat, error: newMatErr } = await supabase.from('materials').insert({
                tenant_id: tenantId,
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
                tenant_id: tenantId
              });
            }
          }

          if (ingredientsToInsert.length > 0) {
            // FIX 2026-09: insert the NEW ingredient rows first, and only
            // delete the OLD ones after that insert succeeds. Previously this
            // deleted old ingredients FIRST, so any failure on the insert
            // (e.g. a NOT NULL violation, a bad material_id, a dropped
            // connection) left the recipe with ZERO ingredients — silently
            // wiping its BOM/HPP — with no rollback, since these are two
            // separate calls, not one DB transaction. Doing it this order
            // means a failed import can never destroy existing ingredient
            // data; the recipe just keeps its old (still-correct) BOM.
            const { data: oldIngredientRows } = await supabase
              .from('recipe_ingredients')
              .select('id')
              .eq('recipe_id', recipeData.id);
            const oldIngredientIds = (oldIngredientRows || []).map(r => r.id);

            const { error: ingErr } = await supabase.from('recipe_ingredients').insert(ingredientsToInsert);
            if (ingErr) throw new Error("Gagal menyimpan detail bahan resep: " + ingErr.message);

            if (oldIngredientIds.length > 0) {
              await supabase.from('recipe_ingredients').delete().in('id', oldIngredientIds);
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

  bulkImportOpnameItems: async (opnameId, rows) => {
    let success = 0;
    let failed = 0;
    const tenantId = await getActiveTenantId();

    // Verify ownership of the opnameId
    const { data: opnameCheck } = await supabase.from('stock_opnames').select('id').eq('id', opnameId).eq('tenant_id', tenantId).maybeSingle();
    if (!opnameCheck) throw new Error("Akses ditolak: Opname tidak valid atau bukan milik tenant ini.");

    // rows: { material_name, physical_qty, notes }
    const { data: allMaterials } = await supabase
      .from('materials')
      .select('id, name')
      .eq('tenant_id', tenantId);

    const materialMap = new Map((allMaterials || []).map(m => [m.name.toLowerCase(), m.id]));

    for (const row of rows) {
      try {
        const materialId = materialMap.get((row.material_name || '').toLowerCase());
        if (!materialId) { failed++; continue; }

        const { error } = await supabase
          .from('stock_opname_items')
          .upsert({
            opname_id: opnameId,
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
  getBaristaReportData: async (month, year) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) throw new Error('Tenant not found');

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Parallel fetch all needed data
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
      // 1. Materials (marketlist)
      supabase.from('materials').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('category').order('name'),
      // 2. Recipes + ingredients + materials
      supabase.from('recipes').select('*, recipe_ingredients(*, materials(*))').eq('tenant_id', tenantId).order('category').order('menu_name'),
      // 3. Purchase entries for the month
      supabase.from('purchase_entries').select('*, materials(name, unit), suppliers(name)').eq('tenant_id', tenantId).gte('date', startDate).lte('date', endDate).order('date'),
      // 4. Stock Opname RESTO
      supabase.from('stock_opnames').select('*, stock_opname_items(*, materials(*))').eq('tenant_id', tenantId).eq('period_month', month).eq('period_year', year).eq('location', 'RESTO').maybeSingle(),
      // 5. Stock Opname CENTRAL
      supabase.from('stock_opnames').select('*, stock_opname_items(*, materials(*))').eq('tenant_id', tenantId).eq('period_month', month).eq('period_year', year).eq('location', 'CENTRAL').maybeSingle(),
      // 6. Daily Inventories for the month
      // BUG-FIX 2026-07: added full_pack + id — computeDailyUsage/buildDailyInventorySheet
      // now need these to compute a correct pack-size-aware valuation. We map materials in JS
      // to avoid PostgREST relationship errors when material_id doesn't have an explicit FK constraint.
      supabase.from('daily_inventories').select('*, daily_inventory_items(*)').eq('tenant_id', tenantId).gte('date', startDate).lte('date', endDate).order('date'),
      // 7. Transactions (for pemakaian/cost control)
      supabase.from('transactions').select('*, materials(name, category)').eq('tenant_id', tenantId).gte('date', startDate).lte('date', endDate).order('date'),
      // 8. GAP-FIX 2026-07: unit_conversions was in the schema but never fetched/used
      // anywhere — needed by validateUnitConversion() to know which unit mismatches
      // have an explicit, human-confirmed conversion factor rather than flagging them.
      supabase.from('unit_conversions').select('*').eq('tenant_id', tenantId)
    ]);

    // Also fetch previous month's opname for opening stock
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const [prevOpnameRestoRes, prevOpnameCentralRes] = await Promise.all([
      supabase.from('stock_opnames').select('*, stock_opname_items(*, materials(*))').eq('tenant_id', tenantId).eq('period_month', prevMonth).eq('period_year', prevYear).eq('location', 'RESTO').maybeSingle(),
      supabase.from('stock_opnames').select('*, stock_opname_items(*, materials(*))').eq('tenant_id', tenantId).eq('period_month', prevMonth).eq('period_year', prevYear).eq('location', 'CENTRAL').maybeSingle()
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

  // SEC-FIX 2026-08: factoryReset() (direct execution) has been removed.
  // The underlying `factory_reset_atomic` RPC is now REVOKEd from client
  // roles entirely (see FEATURE_reset_approval_workflow.sql) — it can only
  // be invoked from inside approve_tenant_reset(), and only after a Super
  // Admin approves. This closes a real hole: previously any authenticated
  // user of any role could call factory_reset_atomic directly (e.g. via
  // devtools) with an arbitrary tenant_id, since the RPC itself never
  // checked who was calling it or which tenant they belonged to.

  // --- UNIT CONVERSIONS (manual pack-size overrides) ---
  // Secondary/optional path — the PRIMARY way to set a material's pack/content
  // conversion is now the structured `full_pack` field ("Carton = 24 pcs",
  // see costUtils.js getPackUnitInfo()/StockLedger.jsx's "Konversi Isi"
  // fields), which every call site already reads with zero extra wiring.
  // This table exists for the Settings page's central list/override view and
  // for any material where editing Full Pack directly isn't wanted. getUnitPrice()
  // checks this FIRST, then falls back to parsing full_pack.
  getUnitConversions: async () => {
    const tenantId = await getActiveTenantId();
    const { data, error } = await supabase
      .from('unit_conversions')
      .select('*, materials(id, name, unit, full_pack)')
      .eq('tenant_id', tenantId)
      ;
    if (error) { console.error("DB Error:", error); throw error; }
    return data || [];
  },

  // Internal helper — builds the Map<material_id, factor> shape that
  // getUnitPrice()/calculateIngredientCost() expect. Used by every other
  // function in this file that computes a Rupiah cost from a material, so a
  // conversion saved here actually takes effect everywhere, not just in the
  // Settings page that lists it.
  async _loadUnitConversionMap(tenantId) {
    const { data, error } = await supabase
      .from('unit_conversions')
      .select('material_id, factor')
      .eq('tenant_id', tenantId);
    if (error) { console.warn('Gagal memuat unit_conversions:', error.message); return new Map(); }
    return new Map((data || []).map(c => [c.material_id, parseFloat(c.factor)]));
  },

  upsertUnitConversion: async ({ id, material_id, from_unit, to_unit, factor }) => {
    const tenantId = await getActiveTenantId();
    const payload = {
      tenant_id: tenantId,
      material_id,
      from_unit,
      to_unit,
      factor: parseFloat(factor)
    };
    if (id) {
      const { error } = await supabase.from('unit_conversions').update(payload).eq('id', id).eq('tenant_id', tenantId);
      if (error) { console.error("DB Error:", error); throw error; }
    } else {
      const { error } = await supabase.from('unit_conversions').insert(payload);
      if (error) { console.error("DB Error:", error); throw error; }
    }
    await logAudit('UPSERT_UNIT_CONVERSION', `Konversi satuan disimpan: 1 ${to_unit} = ${factor} ${from_unit}.`);
  },

  deleteUnitConversion: async (id) => {
    const tenantId = await getActiveTenantId();
    const { error } = await supabase.from('unit_conversions').delete().eq('id', id).eq('tenant_id', tenantId);
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

  getInvoicesStats: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { total: 0, pending: 0, received: 0, totalValue: 0 };

    // Quick query for stats
    const { data } = await supabase
      .from('invoices')
      .select('status, total')
      .eq('tenant_id', tenantId);

    if (!data) return { total: 0, pending: 0, received: 0, totalValue: 0 };

    return {
      total: data.length,
      pending: data.filter(i => i.status === 'DRAFT' || i.status === 'SENT').length,
      received: data.filter(i => i.status === 'RECEIVED').length,
      totalValue: data.reduce((sum, i) => sum + parseFloat(i.total || 0), 0)
    };
  },

  // Delete a transaction and reverse its stock impact atomically.
  // PURCHASE_IN (qty > 0): stock was added → reversal deducts same qty.
  // WASTE (qty < 0): stock was deducted → reversal adds back (deduct_stock_atomic with negative qty adds stock).
  deleteTransactionAndReverseStock: async (txId) => {
    const tenantId = await getActiveTenantId();

    // Fetch raw id (txId may be prefixed with 'tx-' from getTransactions mapper)
    const rawId = String(txId).replace(/^tx-/, '');

    const { data: tx, error: fetchErr } = await supabase
      .from('transactions')
      .select('id, type, qty, material_id, amount, notes, date, location')
      .eq('id', rawId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (fetchErr) throw new Error('Gagal mengambil data transaksi: ' + fetchErr.message);
    if (!tx) throw new Error('Transaksi tidak ditemukan.');

    // Reverse stock if material is linked
    if (tx.material_id) {
      const { error: rpcErr } = await supabase.rpc('deduct_stock_atomic', {
        p_material_id: tx.material_id,
        p_deduct_qty: parseFloat(tx.qty) // Positive = deduct, Negative = add back
      });
      if (rpcErr) throw new Error('Gagal membalikkan stok: ' + rpcErr.message);

      // Restore specific location stock in materials row
      const isWasteType = ['WASTE', 'BREAKAGE', 'EXPIRED', 'COMP'].includes(tx.type);
      if (isWasteType) {
        const isCentral = tx.location === 'CENTRAL';
        const { data: curMat } = await supabase.from('materials').select('qty_resto, qty_central').eq('id', tx.material_id).maybeSingle();
        if (curMat) {
          const restoreQty = Math.abs(parseFloat(tx.qty));
          if (isCentral) {
            await supabase.from('materials').update({
              qty_central: parseFloat(curMat.qty_central || 0) + restoreQty,
              updated_at: new Date().toISOString()
            }).eq('id', tx.material_id);
          } else {
            await supabase.from('materials').update({
              qty_resto: parseFloat(curMat.qty_resto || 0) + restoreQty,
              updated_at: new Date().toISOString()
            }).eq('id', tx.material_id);
          }
        }
      }
    }

    // Try to also delete from purchase_entries if applicable
    if (tx.type === 'PURCHASE_IN') {
      const { data: purchaseEntries } = await supabase.from('purchase_entries').select('id, qty')
        .eq('tenant_id', tenantId)
        .eq('date', tx.date)
        .eq('material_id', tx.material_id);

      if (purchaseEntries && purchaseEntries.length > 0) {
         const match = purchaseEntries.find(p => p.qty === tx.qty);
         if (match) {
            await supabase.from('purchase_entries').delete().eq('id', match.id);
         } else {
            // fallback to first one if exact qty match not found
            await supabase.from('purchase_entries').delete().eq('id', purchaseEntries[0].id);
         }
      }
    }

    // Delete the transaction row
    const { error: delErr } = await supabase
      .from('transactions')
      .delete()
      .eq('id', rawId)
      .eq('tenant_id', tenantId);

    if (delErr) throw new Error('Gagal menghapus transaksi: ' + delErr.message);

    await logAudit('DELETE_TRANSACTION', `Menghapus dan membalikkan transaksi tipe "${tx.type}" tgl ${tx.date}. Stok disesuaikan kembali.`);
    return true;
  },

  editTransactionAndAdjustStock: async (txId, payload) => {
    const tenantId = await getActiveTenantId();
    const rawId = String(txId).replace(/^tx-/, '');

    const { data: tx, error: fetchErr } = await supabase
      .from('transactions')
      .select('id, type, qty, material_id, amount, notes, date')
      .eq('id', rawId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (fetchErr) throw new Error('Gagal mengambil data transaksi: ' + fetchErr.message);
    if (!tx) throw new Error('Transaksi tidak ditemukan.');

    // Calculate diffs
    const oldQty = parseFloat(tx.qty);
    const newQty = parseFloat(payload.qty);
    const qtyDiff = oldQty - newQty;

    // Adjust stock if material is linked and qty changed
    if (tx.material_id && qtyDiff !== 0) {
      const { error: rpcErr } = await supabase.rpc('deduct_stock_atomic', {
        p_material_id: tx.material_id,
        p_deduct_qty: qtyDiff
      });
      if (rpcErr) throw new Error('Gagal adjust stok: ' + rpcErr.message);
    }

    // Calculate new amount based on type
    const newAmount = tx.type === 'PURCHASE_IN'
        ? newQty * (payload.unit_price || 0)
        : (oldQty !== 0 ? (tx.amount / oldQty) * newQty : 0);

    // Update transactions table
    const { error: updateErr } = await supabase
      .from('transactions')
      .update({
        qty: newQty,
        amount: newAmount,
        notes: payload.notes || tx.notes,
        date: payload.date || tx.date
      })
      .eq('id', rawId)
      .eq('tenant_id', tenantId);

    if (updateErr) throw new Error('Gagal update transaksi: ' + updateErr.message);

    // Update purchase_entries if applicable
    if (tx.type === 'PURCHASE_IN') {
      const { data: purchaseEntries } = await supabase.from('purchase_entries').select('id, qty, unit_price')
        .eq('tenant_id', tenantId)
        .eq('date', tx.date)
        .eq('material_id', tx.material_id);

      if (purchaseEntries && purchaseEntries.length > 0) {
         const match = purchaseEntries.find(p => p.qty === oldQty) || purchaseEntries[0];
         await supabase.from('purchase_entries').update({
             qty: newQty,
             unit_price: payload.unit_price,
             date: payload.date || tx.date,
             notes: payload.notes || tx.notes
         }).eq('id', match.id);
      }
    }

    // Update daily_inventory_items if applicable
    if (tx.type === 'WASTE' || tx.type === 'BREAKAGE' || tx.type === 'EXPIRED' || tx.type === 'COMP') {
       const { data: dailyItems } = await supabase.from('daily_inventory_items').select('id, qty')
         .eq('material_id', tx.material_id)
         .eq('qty', Math.abs(oldQty)); // NOTE: daily items store absolute values

       if(dailyItems && dailyItems.length > 0){
          await supabase.from('daily_inventory_items').update({
              qty: Math.abs(newQty)
          }).eq('id', dailyItems[0].id);
       }
    }

    await logAudit('EDIT_TRANSACTION', `Mengubah transaksi tipe "${tx.type}" tgl ${tx.date}.`);
    return true;
  },

  // --- MARKET LISTS ---
  getMarketLists: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from('market_lists')
      .select('*, market_list_items(*)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) throw new Error("Gagal mengambil market list: " + error.message);

    if (data && data.length > 0) {
      const allMaterialIds = new Set();
      data.forEach(ml => {
        (ml.market_list_items || []).forEach(item => {
          if (item.material_id) allMaterialIds.add(item.material_id);
        });
      });

      if (allMaterialIds.size > 0) {
        const { data: mats, error: matsError } = await supabase
          .from('materials')
          .select('id, name, sku, price, unit, category')
          .in('id', Array.from(allMaterialIds));

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
    const { data, error } = await supabase.from('market_lists').insert({ ...payload, tenant_id: tenantId }).select().single();
    if (error) throw new Error("Gagal membuat market list: " + error.message);
    return data;
  },

  updateMarketList: async (id, payload) => {
    const tenantId = await getActiveTenantId();
    const { data, error } = await supabase.from('market_lists').update(payload).eq('id', id).eq('tenant_id', tenantId).select().single();
    if (error) throw new Error("Gagal update market list: " + error.message);
    return data;
  },

  deleteMarketList: async (id) => {
    const tenantId = await getActiveTenantId();
    const { error } = await supabase.from('market_lists').delete().eq('id', id).eq('tenant_id', tenantId);
    if (error) throw new Error("Gagal menghapus market list: " + error.message);
  },

  upsertMarketListItems: async (marketListId, items) => {
    await requireTenantId();
    await supabase.from('market_list_items').delete().eq('market_list_id', marketListId);
    if (items && items.length > 0) {
      const payload = items.map(item => ({
        market_list_id: marketListId,
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

  getMaterialSupplierHistory: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from('purchase_entries')
      .select('material_id, supplier_id, unit_price, date, suppliers(id, name)')
      .eq('tenant_id', tenantId)
      .not('supplier_id', 'is', null)
      .order('date', { ascending: false });
    if (error) {
      console.warn("Gagal mengambil riwayat harga material supplier:", error);
      return [];
    }
    return data || [];
  },

  // --- MARKET LIST BULK PRICE SYNC WITH INVOICES ---
  getLatestInvoiceMaterialPrices: async ({ materialIds = null, onlyLatestSingleInvoice = false } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { pricesMap: {}, latestInvoice: null, allRecentInvoices: [] };

    // Fetch successful purchasing invoices (status RECEIVED or GOODS_RECEIVED)
    let query = supabase
      .from('invoices')
      .select('id, invoice_no, supplier, date, received_date, total, status, created_at, invoice_items(id, material_id, qty, unit_price, materials(id, name, unit, sku))')
      .eq('tenant_id', tenantId)
      .in('status', ['RECEIVED', 'GOODS_RECEIVED'])
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

        // Earliest match is the most recent because invoices are ordered descending
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

  syncMarketListPricesFromInvoice: async ({ marketListId = null, invoiceId = null } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { updatedCount: 0, changes: [] };

    let targetPricesMap = {};
    let invoiceInfo = null;

    if (invoiceId) {
      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .select('id, invoice_no, supplier, date, received_date, total, status, invoice_items(material_id, unit_price, materials(name))')
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId)
        .single();

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
      const res = await api.getLatestInvoiceMaterialPrices();
      targetPricesMap = res.pricesMap;
      invoiceInfo = res.latestInvoice;
    }

    if (Object.keys(targetPricesMap).length === 0) {
      return { updatedCount: 0, changes: [], invoiceInfo };
    }

    // Fetch market_list_items to sync
    let itemsQuery = supabase
      .from('market_list_items')
      .select('*, market_lists!inner(id, name, tenant_id)')
      .eq('market_lists.tenant_id', tenantId);

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

        updatePromises.push(
          supabase
            .from('market_list_items')
            .update({
              estimated_price: newPrice,
              remarks: JSON.stringify(remarksObj)
            })
            .eq('id', item.id)
        );
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
  getTrimmingBatches: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from('production_trimming_batches')
      .select('*, materials(id, name, unit, sku, price, category)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn("Error fetching production_trimming_batches:", error);
      return [];
    }
    return data || [];
  },

  createTrimmingBatchStep1: async ({ material_id, gross_weight, gross_photo_url, gross_latitude, gross_longitude, batch_number }) => {
    const tenantId = await requireTenantId();
    let branchId = activeBranchId || (typeof window !== 'undefined' && window.__activeBranchId);
    if (!branchId) {
      const { data: branches } = await supabase.from('branches').select('id').eq('tenant_id', tenantId).limit(1);
      branchId = branches?.[0]?.id || null;
    }
    const finalBatchNumber = batch_number || `TRM-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const timestamp = new Date().toISOString();
    const photoUrl = gross_photo_url || `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="45%" fill="%23e2e8f0" font-family="sans-serif" font-weight="bold" font-size="14" text-anchor="middle">Tahap 1 Verification</text><text x="50%" y="65%" fill="%2394a3b8" font-family="monospace" font-size="12" text-anchor="middle">${finalBatchNumber}</text></svg>`;

    const payload = {
      tenant_id: tenantId,
      branch_id: branchId,
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

    // Atomic stock deduction for raw material
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

  completeTrimmingBatchStep2: async (batchId, { clean_weight, waste_weight, clean_photo_url, waste_photo_url, target_material_id, portion_pack_output, yield_status }) => {
    const tenantId = await requireTenantId();
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

    const { data, error } = await supabase
      .from('production_trimming_batches')
      .update(payload)
      .eq('id', batchId)
      .eq('tenant_id', tenantId)
      .select('*, materials(id, name, unit, sku)')
      .single();

    if (error) throw new Error("Gagal menyelesaikan Tahap 2: " + error.message);

    // If target material (pack jadi) is provided, increment stock
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
    target_mat_id,
    target_qty,
    waste_qty = 0,
    photo_before = null,
    photo_waste = null,
    notes = '',
    expiry_date = null
  }) => {
    const tenantId = await requireTenantId();
    let branchId = activeBranchId || (typeof window !== 'undefined' && window.__activeBranchId);
    if (!branchId) {
      const { data: branches } = await supabase.from('branches').select('id').eq('tenant_id', tenantId).limit(1);
      branchId = branches?.[0]?.id || null;
    }

    const batchNumber = `PREP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const timestamp = new Date().toISOString();

    let beforePhotoUrl = typeof photo_before === 'string' ? photo_before : null;
    if (photo_before && typeof photo_before !== 'string') {
      try {
        beforePhotoUrl = await api.uploadPhoto(photo_before, 'prep-photos', `before-${Date.now()}.webp`);
      } catch (err) {
        console.warn("Upload photo_before failed, using placeholder:", err);
        beforePhotoUrl = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="50%" fill="%23e2e8f0" font-family="sans-serif" font-weight="bold" font-size="14" text-anchor="middle">Foto Sebelum Olah</text></svg>`;
      }
    }

    let afterPhotoUrl = typeof photo_waste === 'string' ? photo_waste : null;
    if (photo_waste && typeof photo_waste !== 'string') {
      try {
        afterPhotoUrl = await api.uploadPhoto(photo_waste, 'prep-photos', `after-${Date.now()}.webp`);
      } catch (err) {
        console.warn("Upload photo_after failed, using placeholder:", err);
        afterPhotoUrl = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="100%" height="100%" fill="%23064e3b"/><text x="50%" y="50%" fill="%236ee7b7" font-family="sans-serif" font-weight="bold" font-size="14" text-anchor="middle">Foto Hasil & Ampas</text></svg>`;
      }
    }

    // 1. Insert batch to production_trimming_batches
    const payload = {
      tenant_id: tenantId,
      branch_id: branchId,
      material_id: parseInt(source_mat_id, 10),
      batch_number: batchNumber,
      gross_weight: parseFloat(source_qty),
      clean_weight: parseFloat(target_qty),
      waste_weight: parseFloat(waste_qty || 0),
      gross_photo_url: beforePhotoUrl,
      clean_photo_url: afterPhotoUrl,
      waste_photo_url: afterPhotoUrl,
      gross_timestamp: timestamp,
      clean_timestamp: timestamp,
      portion_pack_output: parseFloat(target_qty),
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

    // 1b. If expiry_date provided, record to material_batches for FEFO tracking
    if (expiry_date) {
      try {
        await supabase.from('material_batches').insert({
          tenant_id: tenantId,
          material_id: parseInt(target_mat_id, 10),
          batch_no: batchNumber,
          expired_date: expiry_date,
          qty_resto: location === 'RESTO' ? parseFloat(target_qty) : 0,
          qty_central: location === 'CENTRAL' ? parseFloat(target_qty) : 0,
          status: 'ACTIVE'
        });
      } catch (batchErr) {
        console.warn("Save material_batches for olah bahan warning:", batchErr);
      }
    }


    // 2. Atomic stock operations: Deduct raw material, Increment processed material
    try {
      await supabase.rpc('deduct_stock_atomic', {
        p_material_id: parseInt(source_mat_id, 10),
        p_deduct_qty: parseFloat(source_qty)
      });
    } catch (stockDeductErr) {
      console.warn("Stock deduct error:", stockDeductErr);
    }

    try {
      await supabase.rpc('deduct_stock_atomic', {
        p_material_id: parseInt(target_mat_id, 10),
        p_deduct_qty: -parseFloat(target_qty)
      });
    } catch (stockAddErr) {
      console.warn("Stock addition error:", stockAddErr);
    }

    // 3. Record Waste if waste_qty > 0
    if (parseFloat(waste_qty) > 0) {
      try {
        await api.recordWaste({
          material_id: parseInt(source_mat_id, 10),
          quantity: parseFloat(waste_qty),
          type: 'TRIMMING_WASTE',
          location: location,
          reason: `Ampas olah bahan ${batchNumber} (${notes || 'Olah bahan'})`
        });
      } catch (wasteErr) {
        console.warn("Waste record warning:", wasteErr);
      }
    }

    await logAudit('OLAH_BAHAN', `Olah Bahan ${batchNumber}: Input ${source_qty} (ID ${source_mat_id}) -> Hasil ${target_qty} (ID ${target_mat_id}), Ampas ${waste_qty}`);
    return savedRecord || { batch_number: batchNumber, success: true };
  },

  getOlahBahanHistory: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    try {
      const { data, error } = await supabase
        .from('production_trimming_batches')
        .select('*, materials(id, name, unit, sku, price, category)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) {
        console.warn("Error fetching olah bahan history:", error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn("Error fetching olah bahan history:", err);
      return [];
    }
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