-- =============================================================================
-- BARVENTIS V2.1 — UPGRADE MODULES MIGRATION
-- Modul Pendukung: FEFO, Vendor Tracking, Par-Stock, Audit Selisih,
--                  Equipment Maintenance, Menu Engineering
--
-- Prinsip: Aditif, idempoten, multi-tenant aware (tenant_id + RLS).
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. MODUL 5.1: FEFO — Material Batches & Expiry Tracking
-- =============================================================================

-- Kolom expiry_date pada daily_inventory_items (fix hack materials.brand)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'daily_inventory_items'
      AND column_name = 'expiry_date'
  ) THEN
    ALTER TABLE public.daily_inventory_items
      ADD COLUMN expiry_date DATE DEFAULT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'daily_inventory_items'
      AND column_name = 'batch_number'
  ) THEN
    ALTER TABLE public.daily_inventory_items
      ADD COLUMN batch_number TEXT DEFAULT NULL;
  END IF;
END $$;

-- Tabel material_batches (batch tracking per material per location)
CREATE TABLE IF NOT EXISTS public.material_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  material_id BIGINT NOT NULL,
  batch_number TEXT,
  expiry_date DATE NOT NULL,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  location TEXT DEFAULT 'BAR',
  received_at DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'consumed', 'expired', 'disposed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.material_batches ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'material_batches_tenant_isolation' AND tablename = 'material_batches') THEN
    CREATE POLICY material_batches_tenant_isolation ON public.material_batches
      FOR ALL USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
  END IF;
END $$;

-- Index for FEFO query performance
CREATE INDEX IF NOT EXISTS idx_material_batches_fefo
  ON public.material_batches (tenant_id, material_id, expiry_date ASC)
  WHERE status = 'active';

-- =============================================================================
-- 2. MODUL 5.4: Audit Selisih Stok — Stock Adjustments & Approval
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  material_id BIGINT NOT NULL,
  opname_date DATE NOT NULL,
  system_qty NUMERIC(12,3) DEFAULT 0,
  physical_qty NUMERIC(12,3) DEFAULT 0,
  variance_qty NUMERIC(12,3) GENERATED ALWAYS AS (physical_qty - system_qty) STORED,
  variance_pct NUMERIC(6,2) DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  category TEXT DEFAULT 'UNCLASSIFIED'
    CHECK (category IN ('UNCLASSIFIED','SPILLAGE','RECIPE_ERROR','THEFT','COUNTING_ERROR','EXPIRY','OTHER')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'stock_adjustments_tenant_isolation' AND tablename = 'stock_adjustments') THEN
    CREATE POLICY stock_adjustments_tenant_isolation ON public.stock_adjustments
      FOR ALL USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_pending
  ON public.stock_adjustments (tenant_id, status, opname_date DESC)
  WHERE status = 'pending';

-- =============================================================================
-- 3. MODUL 5.5: Equipment Maintenance — Calibration & Service Logs
-- =============================================================================

-- Kolom asset_id pada calibration records (link grinder ke assets)
-- GrinderCalibration saves to transactions table with type CALIBRATION
-- We add asset_id FK to link calibrations to specific equipment
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'asset_id'
  ) THEN
    ALTER TABLE public.transactions
      ADD COLUMN asset_id UUID DEFAULT NULL;
  END IF;
END $$;

-- Maintenance schedule & service history
CREATE TABLE IF NOT EXISTS public.equipment_service_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  asset_id UUID NOT NULL,
  service_type TEXT NOT NULL DEFAULT 'PREVENTIVE'
    CHECK (service_type IN ('PREVENTIVE','CORRECTIVE','CALIBRATION','REPLACEMENT')),
  description TEXT DEFAULT '',
  performed_by TEXT DEFAULT '',
  performed_at DATE DEFAULT CURRENT_DATE,
  next_due_date DATE,
  parts_replaced TEXT DEFAULT '',
  cost NUMERIC(12,2) DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.equipment_service_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'equipment_service_logs_tenant_isolation' AND tablename = 'equipment_service_logs') THEN
    CREATE POLICY equipment_service_logs_tenant_isolation ON public.equipment_service_logs
      FOR ALL USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
  END IF;
END $$;

-- =============================================================================
-- 4. MODUL 5.2: Vendor Price Tracking — Kolom tambahan
-- =============================================================================

-- Track price changes on purchase_entries
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchase_entries'
      AND column_name = 'prev_unit_price'
  ) THEN
    ALTER TABLE public.purchase_entries
      ADD COLUMN prev_unit_price NUMERIC(12,2) DEFAULT NULL;
  END IF;
END $$;

-- Vendor scorecard tracking
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'suppliers'
      AND column_name = 'otif_score'
  ) THEN
    ALTER TABLE public.suppliers
      ADD COLUMN otif_score NUMERIC(5,2) DEFAULT 100.00,
      ADD COLUMN rejection_rate NUMERIC(5,2) DEFAULT 0.00,
      ADD COLUMN total_deliveries INT DEFAULT 0,
      ADD COLUMN on_time_deliveries INT DEFAULT 0;
  END IF;
END $$;

-- =============================================================================
-- 5. MODUL 5.3: Par-Stock — Dynamic Reorder Point columns
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'reorder_point'
  ) THEN
    ALTER TABLE public.materials
      ADD COLUMN reorder_point NUMERIC(12,3) DEFAULT 0,
      ADD COLUMN safety_stock NUMERIC(12,3) DEFAULT 0,
      ADD COLUMN avg_daily_usage NUMERIC(12,3) DEFAULT 0,
      ADD COLUMN lead_time_days INT DEFAULT 1;
  END IF;
END $$;

-- =============================================================================
-- 6. MODUL 5.6: Menu Engineering — Popularity & Margin data
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recipes'
      AND column_name = 'menu_class'
  ) THEN
    ALTER TABLE public.recipes
      ADD COLUMN menu_class TEXT DEFAULT NULL
        CHECK (menu_class IS NULL OR menu_class IN ('STAR','PLOWHORSE','PUZZLE','DOG')),
      ADD COLUMN total_sold INT DEFAULT 0,
      ADD COLUMN contribution_margin NUMERIC(12,2) DEFAULT 0;
  END IF;
END $$;

-- View: Menu Engineering Matrix
CREATE OR REPLACE VIEW public.v_menu_engineering AS
SELECT
  r.id,
  r.tenant_id,
  r.name AS menu_name,
  r.category,
  r.selling_price,
  r.total_cost AS cogs,
  (r.selling_price - r.total_cost) AS margin,
  r.total_sold,
  (r.selling_price - r.total_cost) * COALESCE(r.total_sold, 0) AS contribution,
  r.menu_class,
  r.target_cost_percent,
  CASE
    WHEN r.total_cost > 0 THEN ROUND(r.total_cost / NULLIF(r.selling_price, 0) * 100, 1)
    ELSE 0
  END AS food_cost_pct
FROM public.recipes r
WHERE r.selling_price > 0;

COMMIT;
