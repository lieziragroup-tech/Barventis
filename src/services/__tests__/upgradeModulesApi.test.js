// Service: Upgrade Modules API (Fase 4 — Modul Pendukung)
// File terpisah dari api.js monolith (incremental refactor strategy)
import { supabase } from '../lib/supabase';
import { api } from './api';

// ============================================================================
// 5.1 FEFO — Material Batches & Expiry
// ============================================================================

export const fefoApi = {
  async getBatches(materialId = null) {
    const tenantId = await api.getActiveTenantId();
    if (!tenantId) return [];
    let q = supabase.from('material_batches').select('*, materials(name, unit)')
      .eq('tenant_id', tenantId).eq('status', 'active').order('expiry_date', { ascending: true });
    if (materialId) q = q.eq('material_id', materialId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async createBatch({ material_id, batch_number, expiry_date, quantity, location = 'BAR' }) {
    const tenantId = await api.getActiveTenantId();
    const { data, error } = await supabase.from('material_batches').insert({
      tenant_id: tenantId, material_id, batch_number, expiry_date, quantity, location
    }).select().single();
    if (error) throw error;
    return data;
  },

  async getExpiringItems(daysAhead = 3) {
    const tenantId = await api.getActiveTenantId();
    if (!tenantId) return [];
    const cutoff = new Date(Date.now() + daysAhead * 86400000).toISOString().split('T')[0];
    const { data, error } = await supabase.from('material_batches')
      .select('*, materials(name, unit, price)')
      .eq('tenant_id', tenantId).eq('status', 'active')
      .lte('expiry_date', cutoff).order('expiry_date', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async disposeBatch(batchId, reason = 'expired') {
    const { data, error } = await supabase.from('material_batches')
      .update({ status: reason === 'consumed' ? 'consumed' : 'disposed', updated_at: new Date().toISOString() })
      .eq('id', batchId).select().single();
    if (error) throw error;
    return data;
  }
};

// ============================================================================
// 5.4 Audit Selisih Stok — Stock Adjustments
// ============================================================================

export const adjustmentApi = {
  async getAdjustments({ status = null, startDate = null, endDate = null } = {}) {
    const tenantId = await api.getActiveTenantId();
    if (!tenantId) return [];
    let q = supabase.from('stock_adjustments').select('*, materials(name, unit)')
      .eq('tenant_id', tenantId).order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    if (startDate) q = q.gte('opname_date', startDate);
    if (endDate) q = q.lte('opname_date', endDate);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async createAdjustment({ material_id, opname_date, system_qty, physical_qty, variance_pct, reason, category = 'UNCLASSIFIED' }) {
    const tenantId = await api.getActiveTenantId();
    const userId = await api.getActiveUserId();
    const { data, error } = await supabase.from('stock_adjustments').insert({
      tenant_id: tenantId, material_id, opname_date, system_qty, physical_qty,
      variance_pct, reason, category, requested_by: userId
    }).select().single();
    if (error) throw error;
    return data;
  },

  async approveAdjustment(adjustmentId) {
    const userId = await api.getActiveUserId();
    const { data, error } = await supabase.from('stock_adjustments')
      .update({ status: 'approved', approved_by: userId, approved_at: new Date().toISOString() })
      .eq('id', adjustmentId).eq('status', 'pending').select().single();
    if (error) throw error;
    return data;
  },

  async rejectAdjustment(adjustmentId, notes = '') {
    const userId = await api.getActiveUserId();
    const { data, error } = await supabase.from('stock_adjustments')
      .update({ status: 'rejected', approved_by: userId, approved_at: new Date().toISOString(), notes })
      .eq('id', adjustmentId).eq('status', 'pending').select().single();
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
    let q = supabase.from('equipment_service_logs').select('*, assets(name, category)')
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
      .select('*, assets(name, category)')
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
  async getPriceComparison(materialId) {
    const tenantId = await api.getActiveTenantId();
    if (!tenantId) return [];
    const { data, error } = await supabase.from('purchase_entries')
      .select('unit_price, prev_unit_price, date, suppliers(name)')
      .eq('tenant_id', tenantId).eq('material_id', materialId)
      .order('date', { ascending: false }).limit(50);
    if (error) throw error;
    return data || [];
  },

  async getPriceChanges() {
    const tenantId = await api.getActiveTenantId();
    if (!tenantId) return [];
    // Get most recent purchase per material where price changed
    const { data, error } = await supabase.from('purchase_entries')
      .select('material_id, unit_price, prev_unit_price, date, materials(name, unit), suppliers(name)')
      .eq('tenant_id', tenantId).not('prev_unit_price', 'is', null)
      .order('date', { ascending: false }).limit(100);
    if (error) throw error;
    return (data || []).filter(d => d.prev_unit_price && d.unit_price !== d.prev_unit_price);
  },

  async updateVendorScore(supplierId, { on_time, accepted }) {
    // Atomic increment of delivery metrics
    const { data: current, error: fetchErr } = await supabase.from('suppliers')
      .select('total_deliveries, on_time_deliveries, otif_score, rejection_rate')
      .eq('id', supplierId).single();
    if (fetchErr) throw fetchErr;
    const totalDel = (current.total_deliveries || 0) + 1;
    const onTimeDel = (current.on_time_deliveries || 0) + (on_time ? 1 : 0);
    const rejRate = accepted ? current.rejection_rate : Math.min(100, (current.rejection_rate || 0) + 1);
    const { error } = await supabase.from('suppliers').update({
      total_deliveries: totalDel,
      on_time_deliveries: onTimeDel,
      otif_score: totalDel > 0 ? +((onTimeDel / totalDel * 100).toFixed(1)) : 100,
      rejection_rate: +rejRate.toFixed(1)
    }).eq('id', supplierId);
    if (error) throw error;
  }
};

// ============================================================================
// 5.3 Par-Stock Optimizer
// ============================================================================

export const parStockApi = {
  async calculateDynamicReorderPoints() {
    const tenantId = await api.getActiveTenantId();
    if (!tenantId) return [];

    // Get avg daily usage from last 30 days of daily_inventory_items
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const { data: headers } = await supabase.from('daily_inventories')
      .select('id, date').eq('tenant_id', tenantId).gte('date', thirtyDaysAgo);

    if (!headers?.length) return [];
    const headerIds = headers.map(h => h.id);
    const dayCount = new Set(headers.map(h => h.date)).size || 1;

    const { data: items } = await supabase.from('daily_inventory_items')
      .select('material_id, out_qty, waste_qty, terpakai_qty')
      .in('inventory_id', headerIds);

    // Aggregate per material
    const usage = {};
    (items || []).forEach(r => {
      if (!usage[r.material_id]) usage[r.material_id] = 0;
      usage[r.material_id] += Number(r.terpakai_qty) || (Number(r.out_qty) || 0) + (Number(r.waste_qty) || 0);
    });

    const results = [];
    const materials = await api.getMaterials();
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

  async saveReorderPoints(updates) {
    // updates: [{material_id, reorder_point, safety_stock, avg_daily_usage, lead_time_days}]
    for (const u of updates) {
      await supabase.from('materials').update({
        reorder_point: u.reorder_point,
        safety_stock: u.safety_stock,
        avg_daily_usage: u.avg_daily_usage,
        lead_time_days: u.lead_time_days
      }).eq('id', u.material_id);
    }
  }
};

// ============================================================================
// 5.6 Menu Engineering
// ============================================================================

export const menuEngApi = {
  async getMenuMatrix() {
    const tenantId = await api.getActiveTenantId();
    if (!tenantId) return [];
    const { data, error } = await supabase.from('v_menu_engineering')
      .select('*').eq('tenant_id', tenantId).order('contribution', { ascending: false });
    if (error) {
      // View might not exist yet, fallback to direct query
      const { data: recipes } = await supabase.from('recipes')
        .select('id, menu_name, category, selling_price, total_cost, total_sold, menu_class, target_cost_percent')
        .eq('tenant_id', tenantId).gt('selling_price', 0);
      return (recipes || []).map(r => ({
        ...r,
        // recipes table's real column is menu_name (no `name` column exists) —
        // aliased to `name` here so it matches the v_menu_engineering view's
        // shape and UnifiedCogsPricing.jsx (which reads recipe.name).
        name: r.menu_name,
        margin: (r.selling_price || 0) - (r.total_cost || 0),
        contribution: ((r.selling_price || 0) - (r.total_cost || 0)) * (r.total_sold || 0),
        food_cost_pct: r.total_cost > 0 && r.selling_price > 0
          ? +((r.total_cost / r.selling_price * 100).toFixed(1)) : 0
      }));
    }
    return data || [];
  },

  async classifyMenuItems() {
    const items = await this.getMenuMatrix();
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

  async saveClassification(items) {
    for (const item of items) {
      await supabase.from('recipes').update({
        menu_class: item.menu_class,
        contribution_margin: item.contribution || 0
      }).eq('id', item.id);
    }
  }
};