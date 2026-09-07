-- Migration: Tambahkan RPC untuk request dan approve tenant data reset

CREATE OR REPLACE FUNCTION public.request_tenant_reset(
  p_tenant_id uuid,
  p_reset_pos boolean,
  p_reset_stock_history boolean,
  p_reset_purchasing boolean,
  p_reset_recipes boolean,
  p_reset_materials boolean
) RETURNS uuid AS $$
DECLARE
  v_request_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  -- Insert request baru ke tabel tenant_reset_requests
  INSERT INTO public.tenant_reset_requests (
    tenant_id, 
    requested_by,
    reset_pos, 
    reset_stock_history, 
    reset_purchasing, 
    reset_recipes, 
    reset_materials,
    status
  ) VALUES (
    p_tenant_id, 
    v_user_id,
    p_reset_pos, 
    p_reset_stock_history, 
    p_reset_purchasing, 
    p_reset_recipes, 
    p_reset_materials,
    'PENDING'
  ) RETURNING id INTO v_request_id;
  
  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.approve_tenant_reset(
  p_request_id uuid,
  p_approve boolean,
  p_rejection_reason text DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_req record;
  v_user_id uuid;
  v_role text;
BEGIN
  v_user_id := auth.uid();
  
  -- Verifikasi SuperAdmin
  SELECT role::text INTO v_role FROM public.users WHERE id = v_user_id;
  IF v_role != 'SuperAdmin' THEN
    RAISE EXCEPTION 'AUTH: Hanya SuperAdmin yang dapat menyetujui reset data';
  END IF;

  -- Kunci row request agar tidak ada race condition
  SELECT * INTO v_req FROM public.tenant_reset_requests WHERE id = p_request_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request tidak ditemukan';
  END IF;

  IF v_req.status != 'PENDING' THEN
    RAISE EXCEPTION 'Request sudah diproses sebelumnya (Status: %)', v_req.status;
  END IF;

  IF p_approve = false THEN
    UPDATE public.tenant_reset_requests
    SET status = 'REJECTED', 
        notes = p_rejection_reason, 
        approved_by = v_user_id, 
        approved_at = now()
    WHERE id = p_request_id;
    RETURN;
  END IF;

  -- PROSES RESET (Hanya eksekusi jika approve = true)
  
  IF v_req.reset_pos THEN
    DELETE FROM public.pos_transaction_items WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.pos_transactions WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.pos_order_items WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.pos_orders WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.pos_upload_logs WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.pos_daily_aggregates WHERE tenant_id = v_req.tenant_id;
  END IF;

  IF v_req.reset_stock_history THEN
    DELETE FROM public.physical_check_items WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.physical_checks WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.stock_opname_items WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.stock_opnames WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.daily_inventory_items WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.daily_inventories WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.usage_variance WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.generated_so_reports WHERE tenant_id = v_req.tenant_id;
  END IF;

  IF v_req.reset_purchasing THEN
    DELETE FROM public.purchase_entries WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.invoice_items WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.invoices WHERE tenant_id = v_req.tenant_id;
  END IF;

  -- Transactions adalah ledger gabungan POS Deduction, Purchase, Opname Adjusment.
  -- Direset jika purchasing ATAU stock history direset.
  IF v_req.reset_stock_history OR v_req.reset_purchasing OR v_req.reset_pos THEN
    DELETE FROM public.transactions WHERE tenant_id = v_req.tenant_id;
  END IF;

  IF v_req.reset_recipes THEN
    DELETE FROM public.recipe_ingredients WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.recipes WHERE tenant_id = v_req.tenant_id;
  END IF;

  IF v_req.reset_materials THEN
    DELETE FROM public.material_price_history WHERE material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_req.tenant_id);
    DELETE FROM public.unit_conversions WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.expected_usage WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.asset_items WHERE tenant_id = v_req.tenant_id; -- opsional, biasa nempel ke material
    DELETE FROM public.materials WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.suppliers WHERE tenant_id = v_req.tenant_id;
  END IF;

  -- Tandai request sebagai APPROVED
  UPDATE public.tenant_reset_requests
  SET status = 'APPROVED', 
      approved_by = v_user_id, 
      approved_at = now()
  WHERE id = p_request_id;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

