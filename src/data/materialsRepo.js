import { supabase } from '../lib/supabase';

export const materialsRepo = {
  getAll: async (tenantId) => {
    if (!tenantId) throw new Error("Missing active session.");
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name');
    if (error) throw error;
    return data;
  },

  getPaged: async (tenantId, { page = 1, pageSize = 20, search = '', category = 'ALL' } = {}) => {
    if (!tenantId) throw new Error("Missing active session.");
    let query = supabase.from('materials').select('*', { count: 'exact' }).eq('tenant_id', tenantId);

    if (search) query = query.ilike('name', `%${search}%`);
    if (category && category !== 'ALL') query = query.eq('category', category);

    const { data, error, count } = await query
      .order('name')
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (error) throw error;
    return { data, total: count || 0, page, pageSize };
  },

  create: async (tenantId, material) => {
    if (!tenantId) throw new Error("Missing active session.");
    const { data, error } = await supabase
      .from('materials')
      .insert([{ ...material, tenant_id: tenantId }])
      .select()
      .single();
    if (error) throw error;
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
    return data;
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