import { supabase } from '../lib/supabase';

const SHELF_LIFE_STORAGE_PREFIX = 'barventis_mat_shelf_life_';
const V9_META_STORAGE_PREFIX = 'barventis_mat_v9_meta_';
let dbSupportsShelfLifeColumn = true;
let dbSupportsV9Columns = true;

const PREP_BATCH_NAMES = new Set([
  'green delight',
  'dragon beet',
  'beta caroot e.ne',
  'berry much',
  'tropical',
  'manggo yougurt',
  'mango yogurt',
  'gula cair',
  'teh base',
  'foaming'
]);

function inferIsPrepOutput(material) {
  if (typeof material?.is_prep_output === 'boolean') return material.is_prep_output;
  const cat = String(material?.category || '').toLowerCase().trim();
  const name = String(material?.name || '').toLowerCase().trim();
  return (
    cat === 'bahan olahan / prep' ||
    PREP_BATCH_NAMES.has(name) ||
    name.includes('(bersih') ||
    name.includes('siap pakai') ||
    name.includes('sari / jus') ||
    name.includes('marinasi')
  );
}

function normalizeMaterialCreatePayload(tenantId, material) {
  const roundedPrice = Math.round(Number(material.price) || 0);
  const newPrice = Number(material.new_price ?? material.price ?? 0);
  const unit = (material.unit || 'pck').trim();
  const defaultFullPack =
    unit === 'kg' ? 'kg = 1000 gr' :
    unit === 'L' ? 'btl = 1000 ml' :
    unit === 'btl' ? 'btl = 750 ml' :
    unit === 'pck' ? 'pck = 1000 gr' :
    unit === 'carton' ? 'carton = 24 pcs' :
    `${unit} = 1 pcs`;

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
    is_prep_output: inferIsPrepOutput(material),
    monthly_quota_qty: Number(material.monthly_quota_qty) || 0,
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

function getLocalV9MetaMap(tenantId) {
  if (typeof window === 'undefined' || !tenantId) return {};
  try {
    const raw = localStorage.getItem(`${V9_META_STORAGE_PREFIX}${tenantId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setLocalV9Meta(tenantId, materialId, patch) {
  if (typeof window === 'undefined' || !tenantId || !materialId) return;
  try {
    const map = getLocalV9MetaMap(tenantId);
    map[materialId] = { ...(map[materialId] || {}), ...patch };
    localStorage.setItem(`${V9_META_STORAGE_PREFIX}${tenantId}`, JSON.stringify(map));
  } catch (_err) {
    // ignore storage errors
  }
}

function stripUnsupportedColumns(payload) {
  const copy = { ...payload };
  if (!dbSupportsShelfLifeColumn) {
    delete copy.shelf_life_days;
  }
  if (!dbSupportsV9Columns) {
    delete copy.monthly_quota_qty;
    delete copy.is_prep_output;
  }
  return copy;
}

function mergeShelfLife(tenantId, items) {
  if (!items || !tenantId) return items;
  const map = getLocalShelfLifeMap(tenantId);
  const v9Map = getLocalV9MetaMap(tenantId);
  return items.map(item => {
    const localV9 = v9Map[item.id] || {};
    return {
      ...item,
      shelf_life_days: item.shelf_life_days ?? map[item.id] ?? null,
      monthly_quota_qty: Number(item.monthly_quota_qty ?? localV9.monthly_quota_qty ?? item.par_stock ?? 0),
      is_prep_output: item.is_prep_output ?? localV9.is_prep_output ?? inferIsPrepOutput(item)
    };
  });
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
    const cleanPayload = stripUnsupportedColumns(basePayload);

    try {
      const { data, error } = await supabase
        .from('materials')
        .insert([cleanPayload])
        .select()
        .single();
      if (error) throw error;
      if (shelfLifeVal !== undefined) setLocalShelfLife(tenantId, data.id, shelfLifeVal);
      setLocalV9Meta(tenantId, data.id, {
        monthly_quota_qty: basePayload.monthly_quota_qty,
        is_prep_output: basePayload.is_prep_output
      });
      return {
        ...data,
        shelf_life_days: data.shelf_life_days ?? shelfLifeVal ?? null,
        monthly_quota_qty: data.monthly_quota_qty ?? basePayload.monthly_quota_qty,
        is_prep_output: data.is_prep_output ?? basePayload.is_prep_output
      };
    } catch (insertErr) {
      const msg = String(insertErr?.message || '');
      if (msg.includes('shelf_life_days') || msg.includes('monthly_quota_qty') || msg.includes('is_prep_output')) {
        if (msg.includes('shelf_life_days')) dbSupportsShelfLifeColumn = false;
        if (msg.includes('monthly_quota_qty') || msg.includes('is_prep_output')) dbSupportsV9Columns = false;
        const fallbackMaterial = stripUnsupportedColumns(basePayload);
        delete fallbackMaterial.shelf_life_days;
        delete fallbackMaterial.monthly_quota_qty;
        delete fallbackMaterial.is_prep_output;
        const { data, error } = await supabase
          .from('materials')
          .insert([fallbackMaterial])
          .select()
          .single();
        if (error) throw error;
        if (shelfLifeVal !== undefined) setLocalShelfLife(tenantId, data.id, shelfLifeVal);
        setLocalV9Meta(tenantId, data.id, {
          monthly_quota_qty: basePayload.monthly_quota_qty,
          is_prep_output: basePayload.is_prep_output
        });
        return {
          ...data,
          shelf_life_days: shelfLifeVal ?? null,
          monthly_quota_qty: basePayload.monthly_quota_qty,
          is_prep_output: basePayload.is_prep_output
        };
      }
      throw insertErr;
    }
  },

  update: async (tenantId, id, updates) => {
    if (!tenantId) throw new Error("Missing active session.");
    const shelfLifeVal = updates.shelf_life_days;
    if (updates.monthly_quota_qty !== undefined || updates.is_prep_output !== undefined) {
      setLocalV9Meta(tenantId, id, {
        ...(updates.monthly_quota_qty !== undefined ? { monthly_quota_qty: Number(updates.monthly_quota_qty) || 0 } : {}),
        ...(updates.is_prep_output !== undefined ? { is_prep_output: Boolean(updates.is_prep_output) } : {})
      });
    }
    const cleanUpdates = stripUnsupportedColumns(updates);
    try {
      const { data, error } = await supabase
        .from('materials')
        .update(cleanUpdates)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();
      if (error) throw error;
      if (shelfLifeVal !== undefined) setLocalShelfLife(tenantId, id, shelfLifeVal);
      return {
        ...data,
        shelf_life_days: data.shelf_life_days ?? shelfLifeVal,
        monthly_quota_qty: data.monthly_quota_qty ?? updates.monthly_quota_qty,
        is_prep_output: data.is_prep_output ?? updates.is_prep_output
      };
    } catch (updateErr) {
      const msg = String(updateErr?.message || '');
      if (msg.includes('shelf_life_days') || msg.includes('monthly_quota_qty') || msg.includes('is_prep_output')) {
        if (msg.includes('shelf_life_days')) dbSupportsShelfLifeColumn = false;
        if (msg.includes('monthly_quota_qty') || msg.includes('is_prep_output')) dbSupportsV9Columns = false;
        const fallbackUpdates = { ...updates };
        delete fallbackUpdates.shelf_life_days;
        delete fallbackUpdates.monthly_quota_qty;
        delete fallbackUpdates.is_prep_output;
        if (Object.keys(fallbackUpdates).length === 0) {
          return { id, ...updates };
        }
        const { data, error } = await supabase
          .from('materials')
          .update(fallbackUpdates)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select()
          .single();
        if (error) throw error;
        if (shelfLifeVal !== undefined) setLocalShelfLife(tenantId, id, shelfLifeVal);
        return {
          ...data,
          shelf_life_days: shelfLifeVal,
          monthly_quota_qty: updates.monthly_quota_qty,
          is_prep_output: updates.is_prep_output
        };
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