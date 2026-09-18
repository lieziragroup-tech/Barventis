-- ==============================================================================
-- MIGRATION: 0007_barventis_v2_sprint3.sql
-- DESCRIPTION: Barventis V2 Sprint 3 - Daily Inventory Refactor & Trimming
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTEND DAILY INVENTORIES TABLE (FULL, BROKEN, WASTE, IN, OUT)
-- If daily_inventories doesn't exist, create it. If it exists, add columns.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_inventories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    date date NOT NULL,
    location varchar(50) NOT NULL DEFAULT 'RESTO', -- RESTO | CENTRAL | BAR
    opening_stock numeric(12,3) DEFAULT 0,    -- Stok Awal (auto from previous closing)
    full_qty numeric(12,3) DEFAULT 0,          -- FULL: Kemasan utuh belum terbuka
    broken_qty numeric(12,3) DEFAULT 0,        -- BROKEN: Kemasan terbuka/timbangan desimal
    waste_qty numeric(12,3) DEFAULT 0,         -- WASTE: Rusak/tumpah/kedaluarsa
    in_qty numeric(12,3) DEFAULT 0,            -- IN: Penambahan dari central/purchasing
    out_qty numeric(12,3) DEFAULT 0,           -- OUT: Penyaluran ke station lain
    closing_stock numeric(12,3) DEFAULT 0,     -- Stok Akhir = full + broken
    qty_used numeric(12,3) GENERATED ALWAYS AS (
        -- Terpakai = Stok Awal + IN - (FULL + BROKEN) + WASTE
        opening_stock + in_qty - full_qty - broken_qty + waste_qty
    ) STORED,
    notes text,
    submitted_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(tenant_id, material_id, date, location)
);

ALTER TABLE public.daily_inventories ADD COLUMN IF NOT EXISTS full_qty numeric(12,3) DEFAULT 0;
ALTER TABLE public.daily_inventories ADD COLUMN IF NOT EXISTS broken_qty numeric(12,3) DEFAULT 0;
ALTER TABLE public.daily_inventories ADD COLUMN IF NOT EXISTS waste_qty numeric(12,3) DEFAULT 0;
ALTER TABLE public.daily_inventories ADD COLUMN IF NOT EXISTS in_qty numeric(12,3) DEFAULT 0;
ALTER TABLE public.daily_inventories ADD COLUMN IF NOT EXISTS out_qty numeric(12,3) DEFAULT 0;
ALTER TABLE public.daily_inventories ADD COLUMN IF NOT EXISTS opening_stock numeric(12,3) DEFAULT 0;
ALTER TABLE public.daily_inventories ADD COLUMN IF NOT EXISTS closing_stock numeric(12,3) DEFAULT 0;
ALTER TABLE public.daily_inventories ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id);
ALTER TABLE public.daily_inventories ADD COLUMN IF NOT EXISTS location varchar(50) DEFAULT 'RESTO';

CREATE TRIGGER trg_daily_inventories_updated_at
BEFORE UPDATE ON public.daily_inventories
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

-- ------------------------------------------------------------------------------
-- 2. PRODUCTION BATCHES (2-STAGE TRIMMING)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_batches (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    operator_id uuid REFERENCES auth.users(id),
    date date NOT NULL DEFAULT CURRENT_DATE,
    stage varchar(20) NOT NULL DEFAULT 'raw', -- 'raw', 'semi', 'pack'

    -- Stage 1: Raw -> Semi
    gross_weight numeric(12,3) NOT NULL DEFAULT 0,    -- Berat Mentah (Wgross)
    gross_photo_url text,                              -- Foto bahan mentah

    -- Stage 2: Semi -> Pack
    clean_weight numeric(12,3) DEFAULT 0,             -- Berat Bersih (Wclean)
    waste_weight numeric(12,3) DEFAULT 0,             -- Berat Limbah/Kulit (Wwaste)
    clean_photo_url text,                             -- Foto hasil bersih
    waste_photo_url text,                             -- Foto limbah/kulit

    -- Result
    shrinkage_pct numeric(5,2) GENERATED ALWAYS AS (
        CASE WHEN gross_weight > 0
        THEN ROUND((gross_weight - clean_weight) / gross_weight * 100, 2)
        ELSE 0
        END
    ) STORED,
    max_shrinkage_pct numeric(5,2) NOT NULL DEFAULT 30.0, -- Toleransi default 30%
    yield_status varchar(10) GENERATED ALWAYS AS (
        CASE WHEN gross_weight > 0 AND ((gross_weight - clean_weight) / gross_weight * 100) <= max_shrinkage_pct
        THEN 'GOOD' ELSE 'BAD'
        END
    ) STORED,
    portion_size numeric(10,3) DEFAULT 0,             -- Ukuran porsi (mis. 100 gr)
    portion_unit varchar(50) DEFAULT 'gr',
    result_packs numeric(10,0) GENERATED ALWAYS AS (
        CASE WHEN portion_size > 0 AND clean_weight > 0
        THEN FLOOR(clean_weight / portion_size)
        ELSE 0
        END
    ) STORED,

    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER trg_production_batches_updated_at
BEFORE UPDATE ON public.production_batches
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

-- Storage bucket for production batch photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('production-batches', 'production-batches', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for storage bucket
DO $$
BEGIN
  -- Recreate if exists
  DROP POLICY IF EXISTS "Public Access production-batches" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated upload production-batches" ON storage.objects;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Public Access production-batches" ON storage.objects FOR SELECT USING (bucket_id = 'production-batches');
CREATE POLICY "Authenticated upload production-batches" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'production-batches' AND auth.role() = 'authenticated');

-- ------------------------------------------------------------------------------
-- 3. RLS & AUDIT
-- ------------------------------------------------------------------------------
ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_inventories ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['production_batches', 'daily_inventories']) LOOP
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

-- ==============================================================================
-- MIGRATION END
-- ==============================================================================
