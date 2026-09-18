-- ==============================================================================
-- MIGRATION: 0009_multi_branch.sql
-- DESCRIPTION: Multi-Branch Schema Implementation
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CREATE BRANCHES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branches (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    address text,
    is_central boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Trigger for updated_at on branches
CREATE TRIGGER update_branches_modtime
    BEFORE UPDATE ON public.branches
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_update_timestamp();

-- Enable RLS
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. MIGRATE DATA (TENANTS -> BRANCHES)
-- ------------------------------------------------------------------------------
-- Create default branch for each tenant based on existing branch_name or company_name
INSERT INTO public.branches (tenant_id, name, address, is_central)
SELECT
    id,
    COALESCE(branch_name, company_name, 'Cabang Utama'),
    NULL,
    true
FROM public.tenants
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. UPDATE USERS TABLE
-- ------------------------------------------------------------------------------
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

-- Assign existing users to the first branch of their tenant
UPDATE public.users u
SET branch_id = (
    SELECT b.id FROM public.branches b
    WHERE b.tenant_id = u.tenant_id
    ORDER BY b.is_central DESC, b.created_at ASC
    LIMIT 1
)
WHERE u.branch_id IS NULL;

-- ------------------------------------------------------------------------------
-- 4. CREATE MATERIAL STOCKS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.material_stocks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    material_id bigint NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    qty numeric(10,2) NOT NULL DEFAULT 0.00,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(branch_id, material_id)
);

CREATE TRIGGER update_material_stocks_modtime
    BEFORE UPDATE ON public.material_stocks
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_update_timestamp();

ALTER TABLE public.material_stocks ENABLE ROW LEVEL SECURITY;

-- Migrate existing qty_resto to material_stocks for default branch
INSERT INTO public.material_stocks (tenant_id, branch_id, material_id, qty)
SELECT
    m.tenant_id,
    b.id,
    m.id,
    m.qty_resto
FROM public.materials m
JOIN public.branches b ON b.tenant_id = m.tenant_id AND b.is_central = true
ON CONFLICT DO NOTHING;

-- (Optional) If we want to keep central stock, we might need a separate branch or just add it.
-- For now, we migrate qty_resto. The plan is to deprecate qty_resto/qty_central from materials.

-- ------------------------------------------------------------------------------
-- 5. UPDATE OPERATIONAL TABLES (ADD branch_id)
-- ------------------------------------------------------------------------------

-- Function to safely add branch_id and populate it
CREATE OR REPLACE FUNCTION add_branch_id_to_table(table_name text)
RETURNS void AS $$
BEGIN
    EXECUTE format('
        ALTER TABLE %I ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE RESTRICT;

        UPDATE %I t
        SET branch_id = (
            SELECT b.id FROM public.branches b
            WHERE b.tenant_id = t.tenant_id
            ORDER BY b.is_central DESC, b.created_at ASC
            LIMIT 1
        )
        WHERE t.branch_id IS NULL AND t.tenant_id IS NOT NULL;

        -- ALTER TABLE %I ALTER COLUMN branch_id SET NOT NULL;
    ', table_name, table_name, table_name);
END;
$$ LANGUAGE plpgsql;

-- Inventory
SELECT add_branch_id_to_table('daily_inventories');
SELECT add_branch_id_to_table('stock_opnames');
SELECT add_branch_id_to_table('physical_checks');

-- Transactions
SELECT add_branch_id_to_table('transactions');
SELECT add_branch_id_to_table('purchase_entries');
SELECT add_branch_id_to_table('invoices');
SELECT add_branch_id_to_table('usage_variance');

-- Production
SELECT add_branch_id_to_table('production_batches');

-- POS
SELECT add_branch_id_to_table('pos_orders');
SELECT add_branch_id_to_table('pos_transactions');
SELECT add_branch_id_to_table('pos_daily_aggregates');

DROP FUNCTION add_branch_id_to_table(text);

-- ------------------------------------------------------------------------------
-- 6. AUTHENTICATED BRANCH FUNCTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_auth_branch_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT branch_id FROM public.users WHERE id = auth.uid();
$$;

-- Note: RLS policies will need to be updated subsequently to check for branch_id where necessary.
