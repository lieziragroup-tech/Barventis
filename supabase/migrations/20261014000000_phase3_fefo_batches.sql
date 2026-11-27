-- ==============================================================================
-- Phase 3 Epik 1: FEFO Batch System & Cascading Deduction
-- Menggabungkan: db/epic1_fefo_schema.sql + db/epic1_fefo_rpc_update.sql
-- ==============================================================================

-- 1. Pastikan tabel material_batches ada (idempotent — upgrade_modules sudah buat versi awal)
--    Versi ini menambahkan kolom batch_no, qty_resto, qty_central yang mungkin belum ada.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='material_batches' AND column_name='batch_no') THEN
    ALTER TABLE public.material_batches ADD COLUMN batch_no character varying;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='material_batches' AND column_name='qty_resto') THEN
    ALTER TABLE public.material_batches ADD COLUMN qty_resto numeric NOT NULL DEFAULT 0 CHECK (qty_resto >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='material_batches' AND column_name='qty_central') THEN
    ALTER TABLE public.material_batches ADD COLUMN qty_central numeric NOT NULL DEFAULT 0 CHECK (qty_central >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='material_batches' AND column_name='expired_date') THEN
    ALTER TABLE public.material_batches ADD COLUMN expired_date date;
  END IF;
END $$;

-- 2. Tambah batch_id di daily_inventory_items (untuk EOD batch split nanti)
ALTER TABLE public.daily_inventory_items
ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.material_batches(id) ON DELETE CASCADE;

-- 3. Tambah kolom avg_cost di materials (dipakai oleh Moving Average)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='materials' AND column_name='avg_cost') THEN
    ALTER TABLE public.materials ADD COLUMN avg_cost numeric DEFAULT 0;
  END IF;
END $$;

-- 4. Tambah kolom unit_cost_snapshot di transactions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='unit_cost_snapshot') THEN
    ALTER TABLE public.transactions ADD COLUMN unit_cost_snapshot numeric DEFAULT 0;
  END IF;
END $$;

-- 5. Index FEFO: batch diambil berdasarkan expired_date ASC
CREATE INDEX IF NOT EXISTS idx_material_batches_fefo
ON public.material_batches (material_id, expired_date ASC)
WHERE status = 'active' OR status = 'ACTIVE';

-- ==============================================================================
-- 6. RPC: atomic_deduct_fefo — Pemotongan stok FEFO (First Expired First Out)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.atomic_deduct_fefo(
    p_tenant_id uuid,
    p_material_id bigint,
    p_qty_to_deduct numeric,
    p_location text -- 'RESTO' or 'CENTRAL'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_batch record;
    v_remaining numeric := p_qty_to_deduct;
    v_deducted_from_batch numeric;
BEGIN
    FOR v_batch IN
        SELECT * FROM public.material_batches
        WHERE material_id = p_material_id
          AND tenant_id = p_tenant_id
          AND status IN ('ACTIVE', 'active')
          AND ( (p_location = 'RESTO' AND qty_resto > 0) OR (p_location = 'CENTRAL' AND qty_central > 0) )
        ORDER BY expired_date ASC
        FOR UPDATE
    LOOP
        IF v_remaining <= 0 THEN EXIT; END IF;

        IF p_location = 'RESTO' THEN
            v_deducted_from_batch := LEAST(v_batch.qty_resto, v_remaining);
            UPDATE public.material_batches SET qty_resto = qty_resto - v_deducted_from_batch WHERE id = v_batch.id;
        ELSE
            v_deducted_from_batch := LEAST(v_batch.qty_central, v_remaining);
            UPDATE public.material_batches SET qty_central = qty_central - v_deducted_from_batch WHERE id = v_batch.id;
        END IF;

        v_remaining := v_remaining - v_deducted_from_batch;
    END LOOP;

    -- Update master material total
    IF p_location = 'RESTO' THEN
        UPDATE public.materials SET qty_resto = qty_resto - (p_qty_to_deduct - v_remaining) WHERE id = p_material_id;
    ELSE
        UPDATE public.materials SET qty_central = qty_central - (p_qty_to_deduct - v_remaining) WHERE id = p_material_id;
    END IF;

    -- Tembus minus jika batch habis tapi master masih perlu dikurangi
    IF v_remaining > 0 THEN
        IF p_location = 'RESTO' THEN
            UPDATE public.materials SET qty_resto = qty_resto - v_remaining WHERE id = p_material_id;
        ELSE
            UPDATE public.materials SET qty_central = qty_central - v_remaining WHERE id = p_material_id;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'unfulfilled_qty', v_remaining);
END;
$$;

-- ==============================================================================
-- 7. RPC: atomic_record_purchase — Catat pembelian + batch + moving average cost
-- ==============================================================================
DROP FUNCTION IF EXISTS public.atomic_record_purchase(uuid, bigint, bigint, numeric, character varying, numeric, date, text, uuid, text);
DROP FUNCTION IF EXISTS public.atomic_record_purchase(uuid, bigint, bigint, numeric, character varying, numeric, date, text, uuid, text, date);

CREATE OR REPLACE FUNCTION public.atomic_record_purchase(
    p_tenant_id uuid,
    p_material_id bigint,
    p_supplier_id bigint,
    p_qty numeric,
    p_unit character varying,
    p_unit_price numeric,
    p_date date,
    p_destination text,
    p_input_by uuid,
    p_notes text,
    p_expired_date date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_total_amount numeric;
    v_new_avg_cost numeric;
    v_current_stock numeric;
    v_current_price numeric;
    v_batch_no text;
BEGIN
    v_total_amount := p_qty * p_unit_price;

    SELECT COALESCE(qty_resto, 0) + COALESCE(qty_central, 0), COALESCE(avg_cost, price)
    INTO v_current_stock, v_current_price
    FROM public.materials WHERE id = p_material_id FOR UPDATE;

    -- Moving Average Cost
    IF (v_current_stock + p_qty) > 0 THEN
        v_new_avg_cost := ((v_current_stock * v_current_price) + (p_qty * p_unit_price)) / (v_current_stock + p_qty);
    ELSE
        v_new_avg_cost := p_unit_price;
    END IF;

    -- Insert batch jika ada expired_date
    IF p_expired_date IS NOT NULL THEN
        v_batch_no := to_char(p_date, 'YYYYMMDD') || '-' || p_material_id::text || '-' || substring(md5(random()::text) from 1 for 4);

        INSERT INTO public.material_batches (tenant_id, material_id, batch_no, expired_date, qty_resto, qty_central, status)
        VALUES (
            p_tenant_id, p_material_id, v_batch_no, p_expired_date,
            CASE WHEN p_destination = 'RESTO' THEN p_qty ELSE 0 END,
            CASE WHEN p_destination = 'CENTRAL' THEN p_qty ELSE 0 END,
            'ACTIVE'
        );
    END IF;

    -- Update Master Material (stok + avg cost)
    IF p_destination = 'RESTO' THEN
        UPDATE public.materials
        SET qty_resto = qty_resto + p_qty, price = p_unit_price, new_price = p_unit_price, avg_cost = v_new_avg_cost, updated_at = now()
        WHERE id = p_material_id;
    ELSE
        UPDATE public.materials
        SET qty_central = qty_central + p_qty, price = p_unit_price, new_price = p_unit_price, avg_cost = v_new_avg_cost, updated_at = now()
        WHERE id = p_material_id;
    END IF;

    -- Insert purchase_entries
    INSERT INTO public.purchase_entries (tenant_id, material_id, supplier_id, qty, unit, unit_price, date, input_by, notes, prev_unit_price)
    VALUES (p_tenant_id, p_material_id, p_supplier_id, p_qty, p_unit, p_unit_price, p_date, p_input_by, p_notes, v_current_price);

    -- Insert transaction log
    INSERT INTO public.transactions (tenant_id, date, material_id, type, location, qty, amount, notes, created_by, unit_cost_snapshot)
    VALUES (p_tenant_id, p_date, p_material_id, 'PURCHASE_IN', p_destination, p_qty, v_total_amount, p_notes, p_input_by, p_unit_price);

    RETURN jsonb_build_object('success', true, 'new_avg_cost', v_new_avg_cost, 'batch_no', v_batch_no);
END;
$$;
