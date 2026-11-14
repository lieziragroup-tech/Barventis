// Service: Upgrade Modules API (Fase 4 — Modul Pendukung)
// File terpisah dari api.js monolith (incremental refactor strategy)
import { supabase } from '../lib/supabase';
import { api } from './api';

// ============================================================================
// 5.1 FEFO — Material Batches & Expiry
// ============================================================================

export const fefoApi = {
  async getBatches(materialId = null, branchIdArg = null) {
    const tenantId = await api.getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await api.requireBranchContext(branchIdArg);
    let q = supabase.from('material_batches').select('*, materials(name, unit)')
      .eq('tenant_id', tenantId).eq('status', 'active').order('expiry_date', { ascending: true });
    if (branchId) q = q.eq('branch_id', branchId);
    if (materialId) q = q.eq('material_id', materialId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async createBatch({ material_id, batch_number, expiry_date, quantity, location = 'BAR', branch_id = null }) {
    const tenantId = await api.getActiveTenantId();
    const branchId = await api.requireBranchContext(branch_id, { requiredForAdmin: true });
    const { data, error } = await supabase.from('material_batches').insert({
      tenant_id: tenantId,
      branch_id: branchId,
      material_id,
      batch_number,
      expiry_date,
      quantity,
      location
    }).select().single();
    if (error) throw error;
    return data;
  },

  async getExpiringItems(daysAhead = 3, branchIdArg = null) {
    const tenantId = await api.getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await api.requireBranchContext(branchIdArg);
    const cutoff = new Date(Date.now() + daysAhead * 86400000).toISOString().split('T')[0];
    let q = supabase.from('material_batches')
      .select('*, materials(name, unit, price)')
      .eq('tenant_id', tenantId).eq('status', 'active')
      .lte('expiry_date', cutoff).order('expiry_date', { ascending: true });
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async disposeBatch(batchId, reason = 'expired', branchIdArg = null) {
    const branchId = await api.requireBranchContext(branchIdArg);
    let q = supabase.from('material_batches')
      .update({ status: reason === 'consumed' ? 'consumed' : 'disposed', updated_at: new Date().toISOString() })
      .eq('id', batchId);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q.select().single();
    if (error) throw error;
    return data;
  }
};

// ============================================================================
// 5.4 Audit Selisih Stok — Stock Adjustments
// ============================================================================

export const adjustmentApi = {
  async getAdjustments({ status = null, startDate = null, endDate = null, branchId: branchIdArg = null } = {}) {
    const tenantId = await api.getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await api.requireBranchContext(branchIdArg);
    let q = supabase.from('stock_adjustments').select('*, materials(name, unit)')
      .eq('tenant_id', tenantId).order('created_at', { ascending: false });
    if (branchId) q = q.eq('branch_id', branchId);
    if (status) q = q.eq('status', status);
    if (startDate) q = q.gte('opname_date', startDate);
    if (endDate) q = q.lte('opname_date', endDate);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async createAdjustment({ material_id, opname_date, system_qty, physical_qty, variance_pct, reason, category = 'UNCLASSIFIED', branch_id = null }) {
    const tenantId = await api.getActiveTenantId();
    const userId = await api.getActiveUserId();
    const branchId = await api.requireBranchContext(branch_id, { requiredForAdmin: true });
    const { data, error } = await supabase.from('stock_adjustments').insert({
      tenant_id: tenantId,
      branch_id: branchId,
      material_id,
      opname_date,
      system_qty,
      physical_qty,
      variance_pct,
      reason,
      category,
      requested_by: userId
    }).select().single();
    if (error) throw error;
    return data;
  },

  async approveAdjustment(adjustmentId, branchIdArg = null) {
    const userId = await api.getActiveUserId();
    const branchId = await api.requireBranchContext(branchIdArg);
    let q = supabase.from('stock_adjustments')
      .update({ status: 'approved', approved_by: userId, approved_at: new Date().toISOString() })
      .eq('id', adjustmentId).eq('status', 'pending');
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q.select().single();
    if (error) throw error;
    return data;
  },

  async rejectAdjustment(adjustmentId, notes = '', branchIdArg = null) {
    const userId = await api.getActiveUserId();
    const branchId = await api.requireBranchContext(branchIdArg);
    let q = supabase.from('stock_adjustments')
      .update({ status: 'rejected', approved_by: userId, approved_at: new Date().toISOString(), notes })
      .eq('id', adjustmentId).eq('status', 'pending');
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q.select().single();
    if (error) throw error;
    return data;
  }
};

// ============================================================================
// 5.5 Equipment Maintenance & Calibration
// ============================================================================

export const maintenanceApi = {
  async getServiceLogs(assetId = null) {
    const tenantId = await api.getActiveTenantId();
    if (!tenantId) return [];
    let q = supabase.from('equipment_service_logs').select('*, assets(name:asset_name, category:brand_model, asset_name, brand_model)')
      .eq('tenant_id', tenantId).order('performed_at', { ascending: false });
    if (assetId) q = q.eq('asset_id', assetId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async createServiceLog({ asset_id, service_type, description, performed_by, performed_at, next_due_date, parts_replaced = '', cost = 0, notes = '' }) {
    const tenantId = await api.getActiveTenantId();
    const { data, error } = await supabase.from('equipment_service_logs').insert({
      tenant_id: tenantId, asset_id, service_type, description, performed_by, performed_at, next_due_date, parts_replaced, cost, notes
    }).select().single();
    if (error) throw error;
    return data;
  },

  async getUpcomingMaintenance(daysAhead = 7) {
    const tenantId = await api.getActiveTenantId();
    if (!tenantId) return [];
    const cutoff = new Date(Date.now() + daysAhead * 86400000).toISOString().split('T')[0];
    const { data, error } = await supabase.from('equipment_service_logs')
      .select('*, assets(name:asset_name, category:brand_model, asset_name, brand_model)')
      .eq('tenant_id', tenantId).not('next_due_date', 'is', null)
      .lte('next_due_date', cutoff).order('next_due_date', { ascending: true });
    if (error) throw error;
    return data || [];
  }
};

// ============================================================================
// 5.2 Vendor Price Tracking
// ============================================================================

export const vendorApi = {
  async getPriceComparison(materialId, branchIdArg = null) {
    const tenantId = await api.getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await api.requireBranchContext(branchIdArg);
    let q = supabase.from('purchase_entries')
      .select('unit_price, prev_unit_price, date, suppliers(name)')
      .eq('tenant_id', tenantId).eq('material_id', materialId)
      .order('date', { ascending: false }).limit(50);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async getPriceChanges(branchIdArg = null) {
    const tenantId = await api.getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await api.requireBranchContext(branchIdArg);
    // Get most recent purchase per material where price changed
    let q = supabase.from('purchase_entries')
      .select('material_id, unit_price, prev_unit_price, date, materials(name, unit), suppliers(name)')
      .eq('tenant_id', tenantId).not('prev_unit_price', 'is', null)
      .order('date', { ascending: false }).limit(100);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).filter(d => d.prev_unit_price && d.unit_price !== d.prev_unit_price);
  },

  async updateVendorScore(supplierId, { on_time, accepted }, branchIdArg = null) {
    const branchId = await api.requireBranchContext(branchIdArg);
    // Atomic increment of delivery metrics
    let fetchQuery = supabase.from('suppliers')
      .select('total_deliveries, on_time_deliveries, otif_score, rejection_rate')
      .eq('id', supplierId);
    if (branchId) fetchQuery = fetchQuery.eq('branch_id', branchId);
    const { data: current, error: fetchErr } = await fetchQuery.single();
    if (fetchErr) throw fetchErr;
    const totalDel = (current.total_deliveries || 0) + 1;
    const onTimeDel = (current.on_time_deliveries || 0) + (on_time ? 1 : 0);
    const rejRate = accepted ? current.rejection_rate : Math.min(100, (current.rejection_rate || 0) + 1);
    let updateQuery = supabase.from('suppliers').update({
      total_deliveries: totalDel,
      on_time_deliveries: onTimeDel,
      otif_score: totalDel > 0 ? +((onTimeDel / totalDel * 100).toFixed(1)) : 100,
      rejection_rate: +rejRate.toFixed(1)
    }).eq('id', supplierId);
    if (branchId) updateQuery = updateQuery.eq('branch_id', branchId);
    const { error } = await updateQuery;
    if (error) throw error;
  }
};

// ============================================================================
// 5.3 Par-Stock Optimizer
// ============================================================================

export const parStockApi = {
  async calculateDynamicReorderPoints(branchIdArg = null) {
    const tenantId = await api.getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await api.requireBranchContext(branchIdArg);

    // Get avg daily usage from last 30 days of daily_inventory_items
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    let headerQuery = supabase.from('daily_inventories')
      .select('id, date').eq('tenant_id', tenantId).gte('date', thirtyDaysAgo);
    if (branchId) headerQuery = headerQuery.eq('branch_id', branchId);
    const { data: headers } = await headerQuery;

    if (!headers?.length) return [];
    const headerIds = headers.map(h => h.id);
    const dayCount = new Set(headers.map(h => h.date)).size || 1;

    let itemQuery = supabase.from('daily_inventory_items')
      .select('material_id, out_qty, waste_qty, terpakai_qty')
      .in('inventory_id', headerIds);
    if (branchId) itemQuery = itemQuery.eq('branch_id', branchId);
    const { data: items } = await itemQuery;

    // Aggregate per material
    const usage = {};
    (items || []).forEach(r => {
      if (!usage[r.material_id]) usage[r.material_id] = 0;
      usage[r.material_id] += Number(r.terpakai_qty) || (Number(r.out_qty) || 0) + (Number(r.waste_qty) || 0);
    });

    const results = [];
    const materials = await api.getMaterials(branchId);
    for (const mat of materials) {
      const totalUsed = usage[mat.id] || 0;
      const avgDaily = +(totalUsed / dayCount).toFixed(2);
      const leadTime = Number(mat.lead_time_days) || 1;
      const safetyStock = +(avgDaily * 1.5).toFixed(2); // 1.5 days buffer
      const rop = +(avgDaily * leadTime + safetyStock).toFixed(2);
      results.push({
        material_id: mat.id, name: mat.name, unit: mat.unit,
        avg_daily_usage: avgDaily, safety_stock: safetyStock,
        reorder_point: rop, lead_time_days: leadTime,
        current_stock: Number(mat.stock) || 0,
        par_stock: Number(mat.par_stock) || 0,
        needs_reorder: (Number(mat.stock) || 0) <= rop
      });
    }
    return results.sort((a, b) => (b.needs_reorder ? 1 : 0) - (a.needs_reorder ? 1 : 0) || a.name.localeCompare(b.name));
  },

  async saveReorderPoints(updates, branchIdArg = null) {
    const branchId = await api.requireBranchContext(branchIdArg);
    // updates: [{material_id, reorder_point, safety_stock, avg_daily_usage, lead_time_days}]
    for (const u of updates) {
      const targetBranch = await api.requireBranchContext(u.branch_id || branchId);
      let q = supabase.from('materials').update({
        reorder_point: u.reorder_point,
        safety_stock: u.safety_stock,
        avg_daily_usage: u.avg_daily_usage,
        lead_time_days: u.lead_time_days
      }).eq('id', u.material_id);
      if (targetBranch) q = q.eq('branch_id', targetBranch);
      const { error } = await q;
      if (error) throw error;
    }
  }
};

// ============================================================================
// 5.6 Menu Engineering
// ============================================================================

export const menuEngApi = {
  async getMenuMatrix(branchIdArg = null) {
    const tenantId = await api.getActiveTenantId();
    if (!tenantId) return [];
    const branchId = await api.requireBranchContext(branchIdArg);
    if (!branchId) {
      const { data, error } = await supabase.from('v_menu_engineering')
        .select('*').eq('tenant_id', tenantId).order('contribution', { ascending: false });
      if (!error && data) return data;
    }
    let q = supabase.from('recipes')
      .select('id, branch_id, menu_name, category, selling_price, basic_cost, total_sold, menu_class, target_cost_percent')
      .eq('tenant_id', tenantId).gt('selling_price', 0);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data: recipes, error: recErr } = await q;
    if (recErr) throw recErr;
    return (recipes || []).map(r => ({
      ...r,
      name: r.menu_name,
      total_cost: r.basic_cost,
      margin: (r.selling_price || 0) - (r.basic_cost || 0),
      contribution: ((r.selling_price || 0) - (r.basic_cost || 0)) * (r.total_sold || 0),
      food_cost_pct: r.basic_cost > 0 && r.selling_price > 0
        ? +((r.basic_cost / r.selling_price * 100).toFixed(1)) : 0
    }));
  },

  async classifyMenuItems(branchIdArg = null) {
    const items = await this.getMenuMatrix(branchIdArg);
    if (items.length === 0) return [];

    // Calculate medians for classification
    const margins = items.map(i => i.margin || 0).sort((a, b) => a - b);
    const volumes = items.map(i => i.total_sold || 0).sort((a, b) => a - b);
    const medianMargin = margins[Math.floor(margins.length / 2)] || 0;
    const medianVolume = volumes[Math.floor(volumes.length / 2)] || 0;

    return items.map(item => {
      const highMargin = (item.margin || 0) >= medianMargin;
      const highVolume = (item.total_sold || 0) >= medianVolume;
      let menu_class;
      if (highMargin && highVolume) menu_class = 'STAR';
      else if (!highMargin && highVolume) menu_class = 'PLOWHORSE';
      else if (highMargin && !highVolume) menu_class = 'PUZZLE';
      else menu_class = 'DOG';
      return { ...item, menu_class, median_margin: medianMargin, median_volume: medianVolume };
    });
  },

  async saveClassification(items, branchIdArg = null) {
    const branchId = await api.requireBranchContext(branchIdArg);
    for (const item of items) {
      const targetBranch = await api.requireBranchContext(item.branch_id || branchId);
      let q = supabase.from('recipes').update({
        menu_class: item.menu_class,
        contribution_margin: item.contribution || 0
      }).eq('id', item.id);
      if (targetBranch) q = q.eq('branch_id', targetBranch);
      const { error } = await q;
      if (error) throw error;
    }
  }
};
