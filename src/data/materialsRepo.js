import { supabase } from '../lib/supabase';
import { offlineInventoryCache } from '../services/offlineInventoryCache';

export const materialsRepo = {
  getAll: async (tenantId) => {
    if (!tenantId) throw new Error("Missing active session.");

    // If completely offline, immediately load from localforage cache
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const cached = await offlineInventoryCache.getStockList(tenantId);
      if (cached && cached.length > 0) {
        return cached;
      }
    }

    try {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;

      // Update offline cache for resilient offline viewing
      if (data) {
        offlineInventoryCache.saveStockList(tenantId, data);
      }
      return data;
    } catch (err) {
      console.warn('[materialsRepo] Network fetch failed, reading from offline cache...', err);
      const cached = await offlineInventoryCache.getStockList(tenantId);
      if (cached && cached.length > 0) {
        return cached;
      }
      throw err;
    }
  },

  getPaged: async (tenantId, { page = 1, pageSize = 20, search = '', category = 'ALL' } = {}) => {
    if (!tenantId) throw new Error("Missing active session.");

    // Helper for slicing cached offline data
    const getOfflinePagedResult = async () => {
      const cached = await offlineInventoryCache.getStockList(tenantId);
      if (cached && cached.length > 0) {
        let filtered = cached;
        if (search) {
          const s = search.toLowerCase();
          filtered = filtered.filter(m => m.name && m.name.toLowerCase().includes(s));
        }
        if (category && category !== 'ALL') {
          filtered = filtered.filter(m => m.category === category);
        }
        const start = (page - 1) * pageSize;
        const pageItems = filtered.slice(start, start + pageSize);
        return { data: pageItems, total: filtered.length, page, pageSize, isOffline: true };
      }
      return null;
    };

    // If offline, return immediately from cache
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const offlineResult = await getOfflinePagedResult();
      if (offlineResult) return offlineResult;
    }

    try {
      let query = supabase.from('materials').select('*', { count: 'exact' }).eq('tenant_id', tenantId).eq('is_active', true);

      if (search) query = query.ilike('name', `%${search}%`);
      if (category && category !== 'ALL') query = query.eq('category', category);

      const { data, error, count } = await query
        .order('name')
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (error) throw error;
      return { data, total: count || 0, page, pageSize };
    } catch (err) {
      console.warn('[materialsRepo.getPaged] Fetch error, falling back to offline cache:', err);
      const offlineResult = await getOfflinePagedResult();
      if (offlineResult) return offlineResult;
      throw err;
    }
  },

  create: async (tenantId, material) => {
    if (!tenantId) throw new Error("Missing active session.");
    const { data, error } = await supabase
      .from('materials')
      .insert([{ ...material, tenant_id: tenantId }])
      .select()
      .single();
    if (error) throw error;

    // Refresh cache in background
    materialsRepo.getAll(tenantId).catch(() => {});
    return data;
  },

  update: async (tenantId, id, updates) => {
    if (!tenantId) throw new Error("Missing active session.");
    const { data, error } = await supabase
      .from('materials')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();
    if (error) throw error;

    // Refresh cache in background
    materialsRepo.getAll(tenantId).catch(() => {});
    return data;
  },

  delete: async (tenantId, id) => {
    if (!tenantId) throw new Error("Missing active session.");

    const { data, error } = await supabase
      .from('materials')
      .update({ is_active: false })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (error) throw error;

    // Refresh cache in background
    materialsRepo.getAll(tenantId).catch(() => {});
    return data;
  }
};
