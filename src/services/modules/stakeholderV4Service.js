import { supabase } from '../../lib/supabase';

async function resolveSessionContext(branchIdArg = null) {
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes?.user?.id || null;
  if (!userId) return { userId: null, tenantId: null, branchId: branchIdArg || null };
  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id, branch_id, name')
    .eq('id', userId)
    .maybeSingle();
  return {
    userId,
    tenantId: profile?.tenant_id || null,
    branchId: branchIdArg || profile?.branch_id || null,
    actorName: profile?.name || 'Staf Barventis'
  };
}

export const beritaAcaraService = {
  async getByPeriod(periodMonth, branchIdArg = null) {
    const ctx = await resolveSessionContext(branchIdArg);
    if (!ctx.tenantId) return null;
    let q = supabase
      .from('berita_acara_documents')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .eq('period_month', periodMonth)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (ctx.branchId) q = q.eq('branch_id', ctx.branchId);
    const { data, error } = await q;
    if (error || !Array.isArray(data) || data.length === 0) return null;
    return data[0];
  },

  async saveDocument(payload, branchIdArg = null) {
    const ctx = await resolveSessionContext(branchIdArg);
    if (!ctx.tenantId) return { savedToDb: false };

    const record = {
      tenant_id: ctx.tenantId,
      branch_id: ctx.branchId,
      period_month: payload.periodMonth,
      document_date: payload.documentDate,
      location_division: payload.locationDivision,
      submitter_name: payload.submitterName,
      submitter_nip: payload.submitterNip,
      submitter_title: payload.submitterTitle,
      intro_statement: payload.introStatement,
      approver_name: payload.approverName,
      approver_title: payload.approverTitle,
      disposition_statement: payload.dispositionStatement,
      closing_statement: payload.closingStatement,
      sign_city: payload.signCity,
      waste_items: payload.wasteItems || [],
      breakage_items: payload.breakageItems || [],
      total_waste_amount: Number(payload.totalWasteAmount) || 0,
      total_breakage_amount: Number(payload.totalBreakageAmount) || 0,
      disposal_photo_urls: payload.disposalPhotos || [],
      status: payload.status || 'APPROVED',
      created_by: ctx.userId,
      updated_at: new Date().toISOString()
    };

    const existing = await beritaAcaraService.getByPeriod(payload.periodMonth, ctx.branchId);
    if (existing?.id) {
      const { data, error } = await supabase
        .from('berita_acara_documents')
        .update(record)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return { savedToDb: true, data };
    }

    const { data, error } = await supabase
      .from('berita_acara_documents')
      .insert(record)
      .select()
      .single();
    if (error) throw error;
    return { savedToDb: true, data };
  }
};

export const costControlAdjustmentService = {
  async listByPeriod(periodMonth, branchIdArg = null) {
    const ctx = await resolveSessionContext(branchIdArg);
    if (!ctx.tenantId) return null;
    let q = supabase
      .from('cost_control_adjustments')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .eq('period_month', periodMonth)
      .order('event_date', { ascending: false });
    if (ctx.branchId) q = q.eq('branch_id', ctx.branchId);
    const { data, error } = await q;
    if (error) return null;
    return (data || []).map((row) => ({
      id: row.id,
      type: row.adjustment_type,
      title: row.title,
      date: row.event_date || `${periodMonth}-01`,
      pax_or_qty: Number(row.pax_or_qty) || 1,
      estimated_cost: Number(row.estimated_cost) || 0,
      notes: row.notes || ''
    }));
  },

  async create(periodMonth, item, branchIdArg = null) {
    const ctx = await resolveSessionContext(branchIdArg);
    if (!ctx.tenantId) return null;
    const { data, error } = await supabase
      .from('cost_control_adjustments')
      .insert({
        tenant_id: ctx.tenantId,
        branch_id: ctx.branchId,
        period_month: periodMonth,
        adjustment_type: item.type || 'BUFFET',
        title: item.title,
        event_date: item.date || `${periodMonth}-01`,
        pax_or_qty: Number(item.pax_or_qty) || 1,
        estimated_cost: Number(item.estimated_cost) || 0,
        notes: item.notes || '',
        created_by: ctx.actorName
      })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      type: data.adjustment_type,
      title: data.title,
      date: data.event_date,
      pax_or_qty: Number(data.pax_or_qty) || 1,
      estimated_cost: Number(data.estimated_cost) || 0,
      notes: data.notes || ''
    };
  },

  async remove(id) {
    const { error } = await supabase.from('cost_control_adjustments').delete().eq('id', id);
    if (error) throw error;
    return true;
  }
};

export const zeroWasteSplitService = {
  async listRecent(branchIdArg = null) {
    const ctx = await resolveSessionContext(branchIdArg);
    if (!ctx.tenantId) return null;
    let q = supabase
      .from('zero_waste_splits')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (ctx.branchId) q = q.eq('branch_id', ctx.branchId);
    const { data, error } = await q;
    if (error) return null;
    return (data || []).map((row) => ({
      id: row.id,
      date: row.split_date,
      parent_name: row.source_material_name,
      parent_qty: Number(row.source_qty) || 0,
      parent_unit: row.source_unit || 'pck',
      outputs: Array.isArray(row.outputs) ? row.outputs : [],
      waste_qty: 0,
      actor: row.created_by || 'Head Barista'
    }));
  },

  async executeAtomicSplit({ sourceMaterialId, sourceQty, outputs, notes, actorName, branchId = null }) {
    const ctx = await resolveSessionContext(branchId);
    if (!ctx.tenantId || !sourceMaterialId) return null;
    const { data, error } = await supabase.rpc('atomic_split_material_zero_waste_v18', {
      p_tenant_id: ctx.tenantId,
      p_branch_id: ctx.branchId,
      p_source_material_id: Number(sourceMaterialId),
      p_source_qty: Number(sourceQty),
      p_outputs: outputs,
      p_notes: notes || 'Split Bahan Zero-Waste (Cutting Portion 0%)',
      p_actor_name: actorName || ctx.actorName
    });
    if (error) throw error;
    return data;
  },

  async markLotBarcodePrinted(materialId, barcodeCode, branchIdArg = null) {
    const ctx = await resolveSessionContext(branchIdArg);
    if (!ctx.tenantId || !materialId) return false;
    const { error } = await supabase
      .from('material_batches')
      .update({ barcode_code: barcodeCode, printed_at: new Date().toISOString() })
      .eq('tenant_id', ctx.tenantId)
      .eq('material_id', materialId);
    return !error;
  }
};

export const pettyCashService = {
  async listEntries(periodMonth, branchIdArg = null) {
    const ctx = await resolveSessionContext(branchIdArg);
    if (!ctx.tenantId) return null;
    const [y, m] = String(periodMonth || '2026-10').split('-');
    const lastDay = new Date(Number(y) || 2026, Number(m) || 10, 0).getDate();
    let q = supabase
      .from('purchase_entries')
      .select('id, date, qty, unit, unit_price, destination_location, payment_source, payment_status, due_date, payment_proof_url, notes, materials(name), suppliers(name)')
      .eq('tenant_id', ctx.tenantId)
      .in('payment_source', ['PETTY_CASH_RESTO', 'CASH_URGENT', 'TEMPO'])
      .gte('date', `${periodMonth}-01`)
      .lte('date', `${periodMonth}-${String(lastDay).padStart(2, '0')}`)
      .order('date', { ascending: false });
    if (ctx.branchId) q = q.eq('branch_id', ctx.branchId);
    const { data, error } = await q;
    if (error || !Array.isArray(data) || data.length === 0) return null;
    return data.map((row) => ({
      id: row.id,
      date: row.date,
      item_name: row.materials?.name || 'Belanja Urgent Resto',
      supplier: row.suppliers?.name || 'Pasar Umum',
      location: row.destination_location || 'RESTO',
      qty: Number(row.qty) || 0,
      unit: row.unit || 'pcs',
      unit_price: Number(row.unit_price) || 0,
      total: Math.round((Number(row.qty) || 0) * (Number(row.unit_price) || 0)),
      payment_method: row.payment_source === 'PETTY_CASH_RESTO' ? 'PETTY_CASH' : (row.payment_source || 'PETTY_CASH'),
      payment_status: row.payment_status || 'PAID',
      due_date: row.due_date || '',
      accurate_account: row.payment_source === 'TEMPO' ? '2101-01 Hutang Dagang Supplier (Tempo)' : '1101-02 Kas Kecil Resto (Petty Cash)',
      proof_photo: row.payment_proof_url || '',
      notes: row.notes || ''
    }));
  },

  async updatePaymentState(entryId, updates) {
    if (!entryId || String(entryId).startsWith('pc-')) return false;
    const { error } = await supabase
      .from('purchase_entries')
      .update({
        payment_status: updates.payment_status,
        payment_proof_url: updates.payment_proof_url,
        updated_at: new Date().toISOString()
      })
      .eq('id', entryId);
    return !error;
  }
};
