-- ==============================================================================
-- MIGRATION: 0005_barventis_v2_sprint1.sql
-- DESCRIPTION: Barventis V2 Sprint 1 - Data Foundation & RBAC
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTEND RBAC ROLES (ENUM UPDATE)
-- ------------------------------------------------------------------------------
-- PostgreSQL doesn't allow easy altering of enum values inside a transaction if we use it,
-- but we can add new values if they don't exist.
-- Assuming user_role enum exists. Let's try adding values.
-- If the type doesn't exist, this will fail but it's safe to run in a standalone block.
-- Create timestamp trigger function if not exists
CREATE OR REPLACE FUNCTION public.fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Alter types outside transaction block (Requires Postgres 12+ for IF NOT EXISTS)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Superadmin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Bar';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Kitchen';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Central';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Service';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Purchasing';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Owner';

-- ------------------------------------------------------------------------------
-- 2. MARKET LISTS & MARKET LIST ITEMS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_lists (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.market_list_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    market_list_id uuid NOT NULL REFERENCES public.market_lists(id) ON DELETE CASCADE,
    material_id uuid REFERENCES public.materials(id) ON DELETE CASCADE,
    quantity numeric(10,2) NOT NULL DEFAULT 0,
    unit varchar(50) NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Trigger updated_at
CREATE TRIGGER trg_market_lists_updated_at
BEFORE UPDATE ON public.market_lists
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

CREATE TRIGGER trg_market_list_items_updated_at
BEFORE UPDATE ON public.market_list_items
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

-- ------------------------------------------------------------------------------
-- 3. ASSETS VS MATERIALS SEPARATION
-- ------------------------------------------------------------------------------
-- Materials already exists. Let's make sure assets are distinct.
-- The document says: "Pemisahan aset tetap (Barang/Peralatan seperti grinder, jigger, mesin espresso) ke tabel assets"
-- Let's create assets table.
CREATE TABLE IF NOT EXISTS public.assets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code varchar(100) NOT NULL,
    name varchar(255) NOT NULL,
    category varchar(100) NOT NULL,
    purchase_date date,
    purchase_price numeric(15,2) DEFAULT 0,
    condition varchar(50) DEFAULT 'Good',
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(tenant_id, code)
);

CREATE TRIGGER trg_assets_updated_at
BEFORE UPDATE ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

-- ------------------------------------------------------------------------------
-- 4. APPLY RLS
-- ------------------------------------------------------------------------------
ALTER TABLE public.market_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_market_lists" ON public.market_lists;
CREATE POLICY "tenant_isolation_market_lists" ON public.market_lists FOR ALL USING (tenant_id = public.get_auth_tenant_id()) WITH CHECK (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS "superadmin_bypass_market_lists" ON public.market_lists;
CREATE POLICY "superadmin_bypass_market_lists" ON public.market_lists FOR ALL USING (public.is_superadmin());

DROP POLICY IF EXISTS "tenant_isolation_market_list_items" ON public.market_list_items;
CREATE POLICY "tenant_isolation_market_list_items" ON public.market_list_items FOR ALL USING (tenant_id = public.get_auth_tenant_id()) WITH CHECK (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS "superadmin_bypass_market_list_items" ON public.market_list_items;
CREATE POLICY "superadmin_bypass_market_list_items" ON public.market_list_items FOR ALL USING (public.is_superadmin());

DROP POLICY IF EXISTS "tenant_isolation_assets" ON public.assets;
CREATE POLICY "tenant_isolation_assets" ON public.assets FOR ALL USING (tenant_id = public.get_auth_tenant_id()) WITH CHECK (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS "superadmin_bypass_assets" ON public.assets;
CREATE POLICY "superadmin_bypass_assets" ON public.assets FOR ALL USING (public.is_superadmin());

-- Audit Triggers
DROP TRIGGER IF EXISTS trg_audit_market_lists ON public.market_lists;
CREATE TRIGGER trg_audit_market_lists AFTER INSERT OR UPDATE OR DELETE ON public.market_lists FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_market_list_items ON public.market_list_items;
CREATE TRIGGER trg_audit_market_list_items AFTER INSERT OR UPDATE OR DELETE ON public.market_list_items FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_assets ON public.assets;
CREATE TRIGGER trg_audit_assets AFTER INSERT OR UPDATE OR DELETE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- ==============================================================================
-- MIGRATION END
-- ==============================================================================
