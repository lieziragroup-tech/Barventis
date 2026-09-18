-- ==============================================================================
-- MIGRATION: 0006_barventis_v2_sprint2.sql
-- DESCRIPTION: Barventis V2 Sprint 2 - Enterprise PO & Beer Category
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PO ORDERS (DRAFT -> APPROVED -> GOODS_RECEIPT)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.po_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    supplier_id uuid REFERENCES public.suppliers(id),
    po_number varchar(100) NOT NULL,
    status varchar(50) NOT NULL DEFAULT 'DRAFT', -- DRAFT, INVOICING, APPROVED, GOODS_RECEIPT, COMMITTED_TO_INVENTORY
    total_amount numeric(15,2) DEFAULT 0,
    created_by uuid REFERENCES auth.users(id),
    approved_by uuid REFERENCES auth.users(id),
    approved_at timestamptz,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(tenant_id, po_number)
);

CREATE TABLE IF NOT EXISTS public.po_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    po_order_id uuid NOT NULL REFERENCES public.po_orders(id) ON DELETE CASCADE,
    material_id uuid REFERENCES public.materials(id),
    quantity numeric(10,2) NOT NULL DEFAULT 0,
    unit varchar(50) NOT NULL,
    unit_price numeric(15,2) DEFAULT 0,
    total_price numeric(15,2) DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 2. PO RECEIPTS (BAST & Geotagging)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.po_receipts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    po_order_id uuid NOT NULL REFERENCES public.po_orders(id) ON DELETE CASCADE,
    received_by uuid REFERENCES auth.users(id),
    received_at timestamptz DEFAULT now(),
    photo_url text,
    lat_lng text,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER trg_po_orders_updated_at
BEFORE UPDATE ON public.po_orders
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

CREATE TRIGGER trg_po_items_updated_at
BEFORE UPDATE ON public.po_items
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

CREATE TRIGGER trg_po_receipts_updated_at
BEFORE UPDATE ON public.po_receipts
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

-- ------------------------------------------------------------------------------
-- 3. STORAGE BUCKET FOR PO RECEIPTS
-- ------------------------------------------------------------------------------
-- Creating buckets must be done by superuser or via dashboard usually,
-- but we can insert into storage.buckets if using standard supabase setup.
INSERT INTO storage.buckets (id, name, public)
VALUES ('po-evidence', 'po-evidence', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for storage
CREATE POLICY "Public Access po-evidence" ON storage.objects FOR SELECT USING (bucket_id = 'po-evidence');
CREATE POLICY "Authenticated users can upload po-evidence" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'po-evidence' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update po-evidence" ON storage.objects FOR UPDATE USING (bucket_id = 'po-evidence' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can delete po-evidence" ON storage.objects FOR DELETE USING (bucket_id = 'po-evidence' AND auth.role() = 'authenticated');

-- ------------------------------------------------------------------------------
-- 4. RLS & AUDIT
-- ------------------------------------------------------------------------------
ALTER TABLE public.po_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_receipts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['po_orders', 'po_items', 'po_receipts']) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_%I" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "superadmin_bypass_%I" ON public.%I', t, t);

    EXECUTE format(
      'CREATE POLICY "tenant_isolation_%I" ON public.%I FOR ALL USING (tenant_id = public.get_auth_tenant_id()) WITH CHECK (tenant_id = public.get_auth_tenant_id())',
      t, t
    );

    EXECUTE format(
      'CREATE POLICY "superadmin_bypass_%I" ON public.%I FOR ALL USING (public.is_superadmin())',
      t, t
    );

    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger()', t, t);
  END LOOP;
END;
$$;
