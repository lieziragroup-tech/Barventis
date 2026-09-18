-- ==============================================================================
-- MIGRATION: 0008_barventis_v2_sprint4.sql
-- DESCRIPTION: Barventis V2 Sprint 4 - Cost Control UI & FIFO Engine
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. STOCK LEDGER ENTRIES (FIFO ENGINE)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_ledger_entries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    batch_number varchar(100) NOT NULL,
    received_date date NOT NULL DEFAULT CURRENT_DATE,
    expiry_date date,
    initial_qty numeric(12,3) NOT NULL,
    remaining_qty numeric(12,3) NOT NULL,
    unit_price numeric(15,2) DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER trg_stock_ledger_entries_updated_at
BEFORE UPDATE ON public.stock_ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

ALTER TABLE public.stock_ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_stock_ledger_entries" ON public.stock_ledger_entries;
CREATE POLICY "tenant_isolation_stock_ledger_entries" ON public.stock_ledger_entries FOR ALL USING (tenant_id = public.get_auth_tenant_id()) WITH CHECK (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS "superadmin_bypass_stock_ledger_entries" ON public.stock_ledger_entries;
CREATE POLICY "superadmin_bypass_stock_ledger_entries" ON public.stock_ledger_entries FOR ALL USING (public.is_superadmin());

DROP TRIGGER IF EXISTS trg_audit_stock_ledger_entries ON public.stock_ledger_entries;
CREATE TRIGGER trg_audit_stock_ledger_entries AFTER INSERT OR UPDATE OR DELETE ON public.stock_ledger_entries FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- ------------------------------------------------------------------------------
-- 2. FIFO ALLOCATION FUNCTION (RPC)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_fifo_allocate_stock(
    p_tenant_id uuid,
    p_material_id uuid,
    p_qty_needed numeric
)
RETURNS void AS $$
DECLARE
    v_remaining_needed numeric := p_qty_needed;
    v_row record;
    v_take numeric;
BEGIN
    FOR v_row IN
        SELECT id, remaining_qty
        FROM public.stock_ledger_entries
        WHERE tenant_id = p_tenant_id
          AND material_id = p_material_id
          AND remaining_qty > 0
        ORDER BY
          -- Sort by expiry date first (earliest to expire), nulls last
          expiry_date ASC NULLS LAST,
          -- Then by received date (oldest first)
          received_date ASC
        FOR UPDATE
    LOOP
        IF v_remaining_needed <= 0 THEN
            EXIT;
        END IF;

        IF v_row.remaining_qty >= v_remaining_needed THEN
            v_take := v_remaining_needed;
        ELSE
            v_take := v_row.remaining_qty;
        END IF;

        UPDATE public.stock_ledger_entries
        SET remaining_qty = remaining_qty - v_take
        WHERE id = v_row.id;

        v_remaining_needed := v_remaining_needed - v_take;
    END LOOP;

    -- If we still need more after draining all tracked batches,
    -- we allow it but log a warning or it just means we are out of strict batch stock.
    -- (In reality we might throw an error if strict inventory is enforced,
    -- but we'll leave it flexible for now)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- MIGRATION END
-- ==============================================================================
