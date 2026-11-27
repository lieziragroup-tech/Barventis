-- Migration: Fix TOCTOU (ISS-01, ISS-02) and add Cost Snapshot (V2)
BEGIN;

-- 1. Tambah Schema Finansial (HPP) ke master
ALTER TABLE public.materials 
ADD COLUMN IF NOT EXISTS avg_cost numeric DEFAULT 0 CHECK (avg_cost >= 0);

-- 2. Tambah Snapshot HPP ke Transactions (Buku Besar)
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS unit_cost_snapshot numeric DEFAULT 0 CHECK (unit_cost_snapshot >= 0);

-- 3. RPC Atomic Pembelian (Goods Receipt)
CREATE OR REPLACE FUNCTION public.atomic_record_purchase(
    p_tenant_id uuid,
    p_material_id bigint,
    p_supplier_id bigint,
    p_qty numeric,
    p_unit text,
    p_unit_price numeric,
    p_date date,
    p_destination text,
    p_input_by uuid,
    p_notes text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_mat record;
    v_new_avg_cost numeric;
    v_inserted_purchase_id bigint;
BEGIN
    -- LOCK BARIS MATERIAL UNTUK MENCEGAH TOCTOU (ISS-02)
    SELECT * INTO v_mat 
    FROM public.materials 
    WHERE id = p_material_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Material tidak ditemukan.';
    END IF;

    -- Update qty (Atomic)
    IF p_destination = 'CENTRAL' THEN
        UPDATE public.materials 
        SET qty_central = COALESCE(qty_central, 0) + p_qty,
            updated_at = now()
        WHERE id = p_material_id AND tenant_id = p_tenant_id;
    ELSE
        UPDATE public.materials 
        SET qty_resto = COALESCE(qty_resto, 0) + p_qty,
            updated_at = now()
        WHERE id = p_material_id AND tenant_id = p_tenant_id;
    END IF;

    -- Hitung WAC (Weighted Average Cost)
    -- Total Value Lama = (qty_resto + qty_central) * avg_cost
    -- Total Value Baru = Total Value Lama + (p_qty * p_unit_price)
    -- avg_cost baru = Total Value Baru / Total Qty Baru
    /* Opsional: Kita bisa tambahkan logika WAC jika stok fisik > 0, 
       tapi V1 minta update `avg_cost`. Untuk simplifikasi, set avg_cost = unit_price terakhir 
       atau hitung WAC di masa depan. Kita update ke harga pembelian terakhir dulu. */
    UPDATE public.materials
    SET avg_cost = p_unit_price
    WHERE id = p_material_id AND tenant_id = p_tenant_id;

    -- Insert ke purchase_entries
    INSERT INTO public.purchase_entries (tenant_id, material_id, supplier_id, qty, unit, unit_price, date, input_by, notes)
    VALUES (p_tenant_id, p_material_id, p_supplier_id, p_qty, p_unit, p_unit_price, p_date, p_input_by, p_notes)
    RETURNING id INTO v_inserted_purchase_id;

    -- Insert Transaksi Ledger
    INSERT INTO public.transactions (tenant_id, date, material_id, type, location, qty, amount, notes, created_by, unit_cost_snapshot)
    VALUES (p_tenant_id, p_date, p_material_id, 'PURCHASE_IN', p_destination, p_qty, p_qty * p_unit_price, 
            'Daily Purchase Entry [ID:' || v_inserted_purchase_id || '] - Tujuan: ' || p_destination, p_input_by, p_unit_price);

    RETURN jsonb_build_object('success', true, 'purchase_id', v_inserted_purchase_id);
END;
$$;

-- 4. RPC Atomic Pengurangan Stok (Waste / Manual)
CREATE OR REPLACE FUNCTION public.atomic_record_waste(
    p_tenant_id uuid,
    p_material_id bigint,
    p_qty numeric,
    p_type text,
    p_location text,
    p_date date,
    p_notes text,
    p_created_by uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_mat record;
    v_cost_loss numeric;
BEGIN
    -- LOCK BARIS MATERIAL
    SELECT * INTO v_mat 
    FROM public.materials 
    WHERE id = p_material_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Material tidak ditemukan.';
    END IF;

    -- Check and Deduct
    IF p_location = 'CENTRAL' THEN
        IF COALESCE(v_mat.qty_central, 0) < p_qty THEN
            RAISE EXCEPTION 'Stok Central tidak mencukupi.';
        END IF;
        UPDATE public.materials 
        SET qty_central = qty_central - p_qty, updated_at = now()
        WHERE id = p_material_id;
    ELSE
        IF COALESCE(v_mat.qty_resto, 0) < p_qty THEN
            RAISE EXCEPTION 'Stok Resto tidak mencukupi.';
        END IF;
        UPDATE public.materials 
        SET qty_resto = qty_resto - p_qty, updated_at = now()
        WHERE id = p_material_id;
    END IF;

    -- Cost loss pakai avg_cost (jika 0 pakai price master)
    v_cost_loss := p_qty * COALESCE(NULLIF(v_mat.avg_cost, 0), v_mat.price, 0);

    -- Insert Transaksi
    INSERT INTO public.transactions (tenant_id, date, material_id, type, location, qty, amount, notes, created_by, unit_cost_snapshot)
    VALUES (p_tenant_id, p_date, p_material_id, p_type, p_location, -p_qty, v_cost_loss, p_notes, p_created_by, COALESCE(NULLIF(v_mat.avg_cost, 0), v_mat.price, 0));

    -- Optional waste_logs fallback
    INSERT INTO public.waste_logs (tenant_id, material_id, quantity, cost_loss, source_type, reason)
    VALUES (p_tenant_id, p_material_id, p_qty, v_cost_loss, p_type, p_notes);

    RETURN jsonb_build_object('success', true, 'cost_loss', v_cost_loss);
END;
$$;

COMMIT;