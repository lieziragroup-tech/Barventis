-- Migration: 20261016000001_fix_atomic_record_waste_enum_cast.sql
-- Fix: Cast p_type and p_location explicitly to custom enums (transaction_type, stock_location)
-- Also protect waste_logs optional insert with branch_id resolution and exception handling.

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
    v_branch_id uuid;
    v_safe_type public.transaction_type;
    v_safe_loc public.stock_location;
BEGIN
    -- LOCK BARIS MATERIAL
    SELECT * INTO v_mat 
    FROM public.materials 
    WHERE id = p_material_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Material tidak ditemukan.';
    END IF;

    -- Validate and cast location
    IF UPPER(p_location) = 'CENTRAL' THEN
        v_safe_loc := 'CENTRAL'::public.stock_location;
        IF COALESCE(v_mat.qty_central, 0) < p_qty THEN
            RAISE EXCEPTION 'Stok Central tidak mencukupi.';
        END IF;
        UPDATE public.materials 
        SET qty_central = qty_central - p_qty, updated_at = now()
        WHERE id = p_material_id;
    ELSE
        v_safe_loc := 'RESTO'::public.stock_location;
        IF COALESCE(v_mat.qty_resto, 0) < p_qty THEN
            RAISE EXCEPTION 'Stok Resto tidak mencukupi.';
        END IF;
        UPDATE public.materials 
        SET qty_resto = qty_resto - p_qty, updated_at = now()
        WHERE id = p_material_id;
    END IF;

    -- Validate and cast transaction type
    BEGIN
        v_safe_type := p_type::public.transaction_type;
    EXCEPTION WHEN OTHERS THEN
        v_safe_type := 'WASTE'::public.transaction_type;
    END;

    -- Cost loss pakai avg_cost (jika 0 pakai price master)
    v_cost_loss := p_qty * COALESCE(NULLIF(v_mat.avg_cost, 0), v_mat.price, 0);

    -- Insert Transaksi dengan explicit cast ke enum transaction_type dan stock_location
    INSERT INTO public.transactions (
        tenant_id, 
        date, 
        material_id, 
        type, 
        location, 
        qty, 
        amount, 
        notes, 
        created_by, 
        unit_cost_snapshot
    ) VALUES (
        p_tenant_id, 
        p_date, 
        p_material_id, 
        v_safe_type, 
        v_safe_loc, 
        -p_qty, 
        v_cost_loss, 
        p_notes, 
        p_created_by, 
        COALESCE(NULLIF(v_mat.avg_cost, 0), v_mat.price, 0)
    );

    -- Optional waste_logs fallback with safe branch_id resolution
    BEGIN
        SELECT id INTO v_branch_id FROM public.branches WHERE tenant_id = p_tenant_id LIMIT 1;
        INSERT INTO public.waste_logs (
            tenant_id, 
            branch_id, 
            material_id, 
            quantity, 
            cost_loss, 
            source_type, 
            reason, 
            created_by
        ) VALUES (
            p_tenant_id, 
            v_branch_id, 
            p_material_id, 
            p_qty, 
            v_cost_loss, 
            p_type, 
            p_notes, 
            p_created_by
        );
    EXCEPTION WHEN OTHERS THEN
        -- Non-blocking for secondary log table
        NULL;
    END;

    RETURN jsonb_build_object('success', true, 'cost_loss', v_cost_loss);
END;
$$;
