import { supabase } from '../lib/supabase';

const SHELF_LIFE_STORAGE_PREFIX = 'barventis_mat_shelf_life_';
let dbSupportsShelfLifeColumn = true;

function normalizeMaterialCreatePayload(tenantId, material) {
  const roundedPrice = Math.round(Number(material.price) || 0);
  const newPrice = Number(material.new_price ?? material.price ?? 0);
  const unit = (material.unit || 'pcs').trim();
  const defaultFullPack =
    unit === 'kg' ? '1000 gr' :
    unit === 'L' ? '1000 ml' :
    `1 ${unit}`;

  return {
    ...material,
    tenant_id: tenantId,
    name: String(material.name || '').trim(),
    category: material.category || 'Bahan Mentah / Raw Material',
    supplier: material.supplier != null && String(material.supplier).trim() !== '' ? String(material.supplier).trim() : '-',
    unit: unit,
    full_pack: material.full_pack != null && String(material.full_pack).trim() !== '' ? String(material.full_pack).trim() : defaultFullPack,
    price: roundedPrice,
    new_price: newPrice,
    qty_resto: Number(material.qty_resto) || 0,
    qty_central: Number(material.qty_central) || 0,
    min_stock: Number(material.min_stock ?? 5),
    par_stock: Number(material.par_stock ?? 0),
    is_active: material.is_active ?? true,
    is_preparable: Boolean(material.is_preparable),
    broken_tracking_enabled: Boolean(material.broken_tracking_enabled),
    expiry_tracking_enabled: Boolean(material.expiry_tracking_enabled)
  };
}
function getLocalShelfLifeMap(tenantId) {
  if (typeof window === 'undefined' || !tenantId) return {};
  try {
    const raw = localStorage.getItem(`${SHELF_LIFE_STORAGE_PREFIX}${tenantId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setLocalShelfLife(tenantId, materialId, days) {
  if (typeof window === 'undefined' || !tenantId || !materialId) return;
  try {
    const map = getLocalShelfLifeMap(tenantId);
    if (days !== null && days !== undefined && !isNaN(days)) {
      map[materialId] = Number(days);
    } else {
      delete map[materialId];
    }
    localStorage.setItem(`${SHELF_LIFE_STORAGE_PREFIX}${tenantId}`, JSON.stringify(map));
  } catch (err) {
    console.warn('Failed to save local shelf life:', err);
  }
}

function mergeShelfLife(tenantId, items) {
  if (!items || !tenantId) return items;
  const map = getLocalShelfLifeMap(tenantId);
  return items.map(item => ({
    ...item,
    shelf_life_days: item.shelf_life_days ?? map[item.id] ?? null
  }));
}

export const materialsRepo = {
  getAll: async (tenantId) => {
    if (!tenantId) throw new Error("Missing active session.");
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return mergeShelfLife(tenantId, data);
  },

  getPaged: async (tenantId, { page = 1, pageSize = 20, search = '', category = 'ALL' } = {}) => {
    if (!tenantId) throw new Error("Missing active session.");
    let query = supabase.from('materials').select('*', { count: 'exact' }).eq('tenant_id', tenantId).eq('is_active', true);

    if (search) query = query.ilike('name', `%${search}%`);
    if (category && category !== 'ALL') query = query.eq('category', category);

    const { data, error, count } = await query
      .order('name')
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (error) throw error;
    return { data: mergeShelfLife(tenantId, data), total: count || 0, page, pageSize };
  },

  create: async (tenantId, material) => {
    if (!tenantId) throw new Error("Missing active session.");
    const shelfLifeVal = material.shelf_life_days;
    const basePayload = normalizeMaterialCreatePayload(tenantId, material);

    if (!dbSupportsShelfLifeColumn) {
      delete basePayload.shelf_life_days;
    }

    try {
      const { data, error } = await supabase
        .from('materials')
        .insert([basePayload])
        .select()
        .single();
      if (error) throw error;
      if (shelfLifeVal !== undefined) setLocalShelfLife(tenantId, data.id, shelfLifeVal);
      return { ...data, shelf_life_days: data.shelf_life_days ?? shelfLifeVal ?? null };
    } catch (insertErr) {
      if (insertErr.message && insertErr.message.includes('shelf_life_days')) {
        dbSupportsShelfLifeColumn = false;
        const fallbackMaterial = { ...basePayload };
        delete fallbackMaterial.shelf_life_days;
        const { data, error } = await supabase
          .from('materials')
          .insert([fallbackMaterial])
          .select()
          .single();
        if (error) throw error;
        if (shelfLifeVal !== undefined) setLocalShelfLife(tenantId, data.id, shelfLifeVal);
        return { ...data, shelf_life_days: shelfLifeVal ?? null };
      }
      throw insertErr;
    }
  },

  update: async (tenantId, id, updates) => {
    if (!tenantId) throw new Error("Missing active session.");
    const shelfLifeVal = updates.shelf_life_days;
    try {
      const { data, error } = await supabase
        .from('materials')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();
      if (error) throw error;
      if (shelfLifeVal !== undefined) setLocalShelfLife(tenantId, id, shelfLifeVal);
      return { ...data, shelf_life_days: data.shelf_life_days ?? shelfLifeVal };
    } catch (updateErr) {
      if (updateErr.message && updateErr.message.includes('shelf_life_days')) {
        const fallbackUpdates = { ...updates };
        delete fallbackUpdates.shelf_life_days;
        const { data, error } = await supabase
          .from('materials')
          .update(fallbackUpdates)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select()
          .single();
        if (error) throw error;
        if (shelfLifeVal !== undefined) setLocalShelfLife(tenantId, id, shelfLifeVal);
        return { ...data, shelf_life_days: shelfLifeVal };
      }
      throw updateErr;
    }
  },


  delete: async (tenantId, id) => {
    if (!tenantId) throw new Error("Missing active session.");

    // We already fetch the material name in deleteMaterial in api.js if we want it,
    // wait... in api.js I did:
    // const data = await materialsRepo.delete(tenantId, id);
    // await logAudit('DELETE_MATERIAL', `Menonaktifkan bahan mentah: "${data.name}" dari database inventory.`);
    // So delete needs to return the deleted row!

    const { data, error } = await supabase
      .from('materials')
      .update({ is_active: false }) // It's soft delete in api.js!!!
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }
};