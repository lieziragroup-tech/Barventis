-- Migration: 20261016000002_fix_adjust_material_stock.sql
-- Fix: Define adjust_material_stock with explicit enum casting for transaction_type and stock_location
-- Handles IN, OUT, and OPNAME_ADJ correctly.

CREATE OR REPLACE FUNCTION public.adjust_material_stock(
  p_material_id bigint,
  p_tenant_id uuid,
  p_type text,
  p_location text,
  p_qty numeric,
  p_notes text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_mat record;
  v_safe_type public.transaction_type;
  v_safe_loc public.stock_location;
  v_tx_qty numeric := p_qty;
  v_unit_cost numeric := 0;
BEGIN
  -- Validate and cast location
  IF UPPER(p_location) = 'CENTRAL' THEN
    v_safe_loc := 'CENTRAL'::public.stock_location;
  ELSE
    v_safe_loc := 'RESTO'::public.stock_location;
  END IF;

  -- Validate and cast type
  BEGIN
    v_safe_type := p_type::public.transaction_type;
  EXCEPTION WHEN OTHERS THEN
    v_safe_type := 'OUT'::public.transaction_type;
  END;

  -- Lock material row
  SELECT * INTO v_mat 
  FROM public.materials 
  WHERE id = p_material_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material tidak ditemukan.';
  END IF;

  v_unit_cost := COALESCE(NULLIF(v_mat.avg_cost, 0), v_mat.price, 0);

  -- Handle stock calculation based on type
  IF v_safe_type = 'OPNAME_ADJ' THEN
    -- If OPNAME_ADJ, p_qty is the target physical count
    IF v_safe_loc = 'CENTRAL' THEN
      v_tx_qty := p_qty - COALESCE(v_mat.qty_central, 0);
      UPDATE public.materials SET qty_central = GREATEST(0, p_qty), updated_at = now()
      WHERE id = p_material_id AND tenant_id = p_tenant_id
      RETURNING * INTO v_mat;
    ELSE
      v_tx_qty := p_qty - COALESCE(v_mat.qty_resto, 0);
      UPDATE public.materials SET qty_resto = GREATEST(0, p_qty), updated_at = now()
      WHERE id = p_material_id AND tenant_id = p_tenant_id
      RETURNING * INTO v_mat;
    END IF;
  ELSIF v_safe_type = 'IN' THEN
    v_tx_qty := ABS(p_qty);
    IF v_safe_loc = 'CENTRAL' THEN
      UPDATE public.materials SET qty_central = qty_central + v_tx_qty, updated_at = now()
      WHERE id = p_material_id AND tenant_id = p_tenant_id
      RETURNING * INTO v_mat;
    ELSE
      UPDATE public.materials SET qty_resto = qty_resto + v_tx_qty, updated_at = now()
      WHERE id = p_material_id AND tenant_id = p_tenant_id
      RETURNING * INTO v_mat;
    END IF;
  ELSE
    -- OUT or others
    v_tx_qty := -ABS(p_qty);
    IF v_safe_loc = 'CENTRAL' THEN
      UPDATE public.materials SET qty_central = GREATEST(0, qty_central - ABS(p_qty)), updated_at = now()
      WHERE id = p_material_id AND tenant_id = p_tenant_id
      RETURNING * INTO v_mat;
    ELSE
      UPDATE public.materials SET qty_resto = GREATEST(0, qty_resto - ABS(p_qty)), updated_at = now()
      WHERE id = p_material_id AND tenant_id = p_tenant_id
      RETURNING * INTO v_mat;
    END IF;
  END IF;

  -- Insert transaction with explicit enum cast
  INSERT INTO public.transactions (
    tenant_id, 
    date, 
    material_id, 
    type, 
    location, 
    qty, 
    amount, 
    notes, 
    unit_cost_snapshot,
    created_at
  ) VALUES (
    p_tenant_id, 
    CURRENT_DATE, 
    p_material_id, 
    v_safe_type, 
    v_safe_loc, 
    v_tx_qty, 
    ABS(v_tx_qty) * v_unit_cost, 
    p_notes, 
    v_unit_cost,
    now()
  );

  RETURN row_to_json(v_mat)::jsonb;
END;
$$;
