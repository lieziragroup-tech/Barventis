-- =============================================================================
-- Migration: Missing RPCs Fix
-- Description: Implementasi 5 RPC kritis untuk mengembalikan fungsi atomic dan 
--              memperbaiki bug race condition di Barventis V2.
-- =============================================================================

BEGIN;

-- 1. Tambah nilai Enum yang mungkin hilang (Aman dijalankan berulang)
DO $$ BEGIN
  ALTER TYPE public.invoice_status ADD VALUE 'SENT';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.invoice_status ADD VALUE 'RECEIVED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. DEDUCT STOCK ATOMIC
-- Sesuai dengan workaround logic di app, ini hardcoded memotong (atau menambah jika negatif)
-- dari qty_resto (mis. di deleteTransactionAndReverseStock, app men-kompensasi jika CENTRAL).
CREATE OR REPLACE FUNCTION public.deduct_stock_atomic(
  p_material_id bigint,
  p_deduct_qty numeric
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.materials
  SET qty_resto = qty_resto - p_deduct_qty,
      updated_at = now()
  WHERE id = p_material_id;
END;
$$;

-- 3. CHECKOUT POS ATOMIC
-- Fix "Data shift 2 menimpa shift 1": Gunakan INSERT ... ON CONFLICT untuk AKUMULASI total_revenue & total_transactions.
-- Memastikan index unik untuk upsert
CREATE UNIQUE INDEX IF NOT EXISTS pos_daily_aggregates_tenant_date_idx 
  ON public.pos_daily_aggregates (tenant_id, sales_date);

CREATE OR REPLACE FUNCTION public.checkout_pos_atomic(
  p_tenant_id uuid,
  p_user_id uuid,
  p_order_no text,
  p_total_amount numeric,
  p_payment_method text,
  p_order_items jsonb,
  p_deductions jsonb,
  p_transactions jsonb
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_order_id uuid;
  v_item jsonb;
  v_tx jsonb;
  v_deduct jsonb;
BEGIN
  -- Insert POS Order
  INSERT INTO public.pos_orders (tenant_id, order_no, total_amount, payment_method, created_by, created_at, updated_at)
  VALUES (p_tenant_id, p_order_no, p_total_amount, COALESCE(p_payment_method, 'CASH'), p_user_id, now(), now())
  RETURNING id INTO v_order_id;

  -- Insert POS Order Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_items)
  LOOP
    INSERT INTO public.pos_order_items (order_id, recipe_id, qty, unit_price, subtotal, created_at)
    VALUES (
      v_order_id,
      (v_item->>'recipe_id')::bigint,
      (v_item->>'qty')::int,
      (v_item->>'unit_price')::numeric,
      (v_item->>'subtotal')::numeric,
      now()
    );
  END LOOP;

  -- Atomic Stock Deduction via deduct_stock_atomic
  FOR v_deduct IN SELECT * FROM jsonb_array_elements(p_deductions)
  LOOP
    PERFORM public.deduct_stock_atomic((v_deduct->>'material_id')::bigint, (v_deduct->>'deduct_qty')::numeric);
  END LOOP;

  -- Insert Ledger Transactions
  FOR v_tx IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    INSERT INTO public.transactions (tenant_id, date, material_id, type, location, qty, amount, notes, created_by, created_at)
    VALUES (
      p_tenant_id,
      (v_tx->>'date')::date,
      (v_tx->>'material_id')::bigint,
      v_tx->>'type',
      v_tx->>'location',
      (v_tx->>'qty')::numeric,
      (v_tx->>'amount')::numeric,
      v_tx->>'notes',
      p_user_id,
      now()
    );
  END LOOP;

  -- Akumulasi ke daily aggregate (Menghindari shift 2 menimpa shift 1)
  INSERT INTO public.pos_daily_aggregates (tenant_id, sales_date, total_transactions, total_revenue, created_at)
  VALUES (p_tenant_id, CURRENT_DATE, 1, p_total_amount, now())
  ON CONFLICT (tenant_id, sales_date) DO UPDATE 
  SET 
    total_transactions = public.pos_daily_aggregates.total_transactions + 1,
    total_revenue = public.pos_daily_aggregates.total_revenue + EXCLUDED.total_revenue;

END;
$$;

-- 4. COMPLETE OPNAME ATOMIC
-- Menghitung penyesuaian (adjustment) otomatis secara atomik dan finalisasi status
CREATE OR REPLACE FUNCTION public.complete_opname_atomic(
  p_opname_id uuid,
  p_tenant_id uuid,
  p_location text,
  p_user_id uuid
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_item record;
  v_diff numeric;
  v_adj_count int := 0;
BEGIN
  -- 1. Kunci & tandai opname APPROVED
  UPDATE public.stock_opnames
  SET status = 'APPROVED'::public.opname_status,
      updated_at = now()
  WHERE id = p_opname_id AND tenant_id = p_tenant_id;

  -- 2. Terapkan varians ke transaksi dan stok bahan
  FOR v_item IN 
    SELECT material_id, system_qty, physical_qty, notes 
    FROM public.stock_opname_items 
    WHERE opname_id = p_opname_id
  LOOP
    v_diff := v_item.physical_qty - v_item.system_qty;
    
    IF v_diff <> 0 THEN
      -- Log transaksi adjustment
      INSERT INTO public.transactions (tenant_id, date, material_id, type, location, qty, amount, notes, created_by, created_at)
      VALUES (
        p_tenant_id,
        CURRENT_DATE,
        v_item.material_id,
        'STOCK_ADJUSTMENT',
        p_location,
        v_diff,
        0, 
        'Opname Finalisasi: ' || p_opname_id || COALESCE(' - ' || v_item.notes, ''),
        p_user_id,
        now()
      );

      -- Update actual physical stock (berdasarkan lokasi)
      IF p_location = 'RESTO' THEN
        UPDATE public.materials
        SET qty_resto = qty_resto + v_diff, updated_at = now()
        WHERE id = v_item.material_id AND tenant_id = p_tenant_id;
      ELSE
        UPDATE public.materials
        SET qty_central = qty_central + v_diff, updated_at = now()
        WHERE id = v_item.material_id AND tenant_id = p_tenant_id;
      END IF;
      
      v_adj_count := v_adj_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('adjustments_made', v_adj_count);
END;
$$;

-- 5. ADJUST MATERIAL STOCK ATOMIC
CREATE OR REPLACE FUNCTION public.adjust_material_stock(
  p_material_id bigint,
  p_tenant_id uuid,
  p_type text,
  p_location text,
  p_qty numeric,
  p_notes text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_mat record;
BEGIN
  -- Insert transaction
  INSERT INTO public.transactions (tenant_id, date, material_id, type, location, qty, amount, notes, created_at)
  VALUES (p_tenant_id, CURRENT_DATE, p_material_id, p_type, p_location, p_qty, 0, p_notes, now());

  -- Update materials stock based on location
  IF p_location = 'RESTO' THEN
    UPDATE public.materials SET qty_resto = qty_resto + p_qty, updated_at = now()
    WHERE id = p_material_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_mat;
  ELSE
    UPDATE public.materials SET qty_central = qty_central + p_qty, updated_at = now()
    WHERE id = p_material_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_mat;
  END IF;

  RETURN row_to_json(v_mat)::jsonb;
END;
$$;

-- 6. RECEIVE INVOICE ATOMIC
CREATE OR REPLACE FUNCTION public.receive_invoice_atomic(
  p_invoice_id bigint,
  p_tenant_id uuid,
  p_user_id uuid
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_inv record;
  v_item record;
BEGIN
  -- Row lock
  SELECT * INTO v_inv FROM public.invoices 
  WHERE id = p_invoice_id AND tenant_id = p_tenant_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice tidak ditemukan atau bukan milik tenant ini.';
  END IF;

  IF v_inv.status::text = 'RECEIVED' THEN
    RAISE EXCEPTION 'PO Invoice ini sudah diterima sebelumnya.';
  END IF;

  -- Update Invoice Status
  UPDATE public.invoices 
  SET status = 'RECEIVED'::public.invoice_status,
      received_date = CURRENT_DATE,
      updated_at = now()
  WHERE id = p_invoice_id;

  -- Process Purchase Items & Add Stock (PO is received at CENTRAL)
  FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id
  LOOP
    -- 1. Stok masuk ke central
    UPDATE public.materials
    SET qty_central = qty_central + v_item.qty,
        updated_at = now()
    WHERE id = v_item.material_id AND tenant_id = p_tenant_id;

    -- 2. Riwayat transaksi
    INSERT INTO public.transactions (tenant_id, date, material_id, type, location, qty, amount, notes, created_by, created_at)
    VALUES (
      p_tenant_id,
      CURRENT_DATE,
      v_item.material_id,
      'PURCHASE_IN',
      v_inv.location,
      v_item.qty,
      (v_item.qty * v_item.unit_price),
      'Penerimaan PO Inbound: ' || COALESCE(v_inv.invoice_no, v_inv.id::text),
      p_user_id,
      now()
    );

    -- 3. Jurnal/History detail untuk UI list purchase history
    INSERT INTO public.purchase_entries (tenant_id, material_id, supplier_id, qty, unit, unit_price, date, input_by, invoice_id, created_at, updated_at)
    SELECT 
      p_tenant_id,
      v_item.material_id,
      v_inv.supplier_id,
      v_item.qty,
      m.unit,
      v_item.unit_price,
      CURRENT_DATE,
      p_user_id,
      p_invoice_id,
      now(),
      now()
    FROM public.materials m
    WHERE m.id = v_item.material_id;
  END LOOP;
END;
$$;

COMMIT;
