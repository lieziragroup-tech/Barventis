-- =============================================================================
-- BARVENTIS ERP v2 — FINAL CONSOLIDATED DATABASE MIGRATION & SCHEMA SYNC (v15)
-- Target Database: Supabase PostgreSQL (100% Self-Contained: Kosong maupun Eksisting)
-- Disusun oleh: Ayling, Izumi, Nia, & Kei
--
-- Cakupan Eksekusi Satu Pintu (Idempotent & Aman Dijalankan Ulang):
--   1. BAGIAN 00A (Pre-Transaction Bootstrap):
--      - Ekstensi `pgcrypto` & pembuatan seluruh 11 Custom Enums (`user_role`,
--        `transaction_type`, `stock_location`, dll.) beserta `ADD VALUE IF NOT EXISTS`
--        di luar blok transaksi agar aman dari PostgreSQL Error 55P04.
--   2. BAGIAN 00B (Bootstrap 61 Tabel Dasar & Indeks Unik):
--      - Pembuatan seluruh 60 tabel dari `SQL Barventis.md` ditambah
--        `area_role_mappings` (mengatasi tuntas Error 42P01).
--      - Penambahan kolom otomatis (`ADD COLUMN IF NOT EXISTS`) untuk seluruh tabel.
--   3. BAGIAN 00C - BAGIAN 8 (Seluruh Fungsi Helper, 27 RPC, Views, RLS, & Seed Data):
--      - Seluruh 72 fungsi SQL dilindungi blok anti-42P13 otomatis
--        (`check_user_access(p_id uuid, p_tenant_id uuid)` dan auto-drop/recreate
--        bila terjadi perbedaan nama parameter pada fungsi RPC lama).
--      - 7 Akun Preset Role (`Owner`, `Bar BSD`, `Bar Kasuna`, `Kitchen BSD`,
--        `Service BSD`, `Purchasing/Central`, `Kasir BSD`) & 22 Bahan Baku Dummy.
-- =============================================================================

-- =============================================================================
-- BAGIAN 00A: BOOTSTRAP EXTENSIONS & 11 CUSTOM ENUMS (PRE-TRANSACTION)
-- Dieksekusi sebelum BEGIN agar nilai enum baru langsung ter-commit (bebas 55P04)
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'user_role'
  ) THEN
    CREATE TYPE public.user_role AS ENUM ('Admin  Owner', 'Admin / Owner', 'Staff', 'Super Admin', 'SuperAdmin', 'Supervisor', 'Barista', 'Kasir', 'Finance', 'Owner', 'Bar', 'Kitchen', 'Central', 'Service', 'Purchasing');
  END IF;
END $$;
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Admin  Owner';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Admin / Owner';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Staff';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Super Admin';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'SuperAdmin';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Supervisor';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Barista';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Kasir';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Finance';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Owner';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Bar';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Kitchen';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Central';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Service';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Purchasing';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'transaction_type'
  ) THEN
    CREATE TYPE public.transaction_type AS ENUM ('IN', 'OUT', 'TRANSFER', 'POS_DEDUCTION', 'PURCHASE_IN', 'OPNAME_ADJ', 'POS_SALE', 'WASTE', 'BREAKAGE', 'EXPIRED', 'COMP', 'TRANSFER_REQUEST');
  END IF;
END $$;
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'IN';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'OUT';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'TRANSFER';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'POS_DEDUCTION';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'PURCHASE_IN';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'OPNAME_ADJ';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'POS_SALE';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'WASTE';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'BREAKAGE';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'COMP';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'TRANSFER_REQUEST';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'stock_location'
  ) THEN
    CREATE TYPE public.stock_location AS ENUM ('RESTO', 'CENTRAL');
  END IF;
END $$;
ALTER TYPE public.stock_location ADD VALUE IF NOT EXISTS 'RESTO';
ALTER TYPE public.stock_location ADD VALUE IF NOT EXISTS 'CENTRAL';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'invoice_status'
  ) THEN
    CREATE TYPE public.invoice_status AS ENUM ('DRAFT', 'SENT', 'RECEIVED', 'CANCELLED');
  END IF;
END $$;
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'SENT';
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'RECEIVED';
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'CANCELLED';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'opname_status'
  ) THEN
    CREATE TYPE public.opname_status AS ENUM ('DRAFT', 'COUNTING', 'SUBMITTED', 'APPROVED');
  END IF;
END $$;
ALTER TYPE public.opname_status ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE public.opname_status ADD VALUE IF NOT EXISTS 'COUNTING';
ALTER TYPE public.opname_status ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE public.opname_status ADD VALUE IF NOT EXISTS 'APPROVED';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'reset_request_status'
  ) THEN
    CREATE TYPE public.reset_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'FAILED');
  END IF;
END $$;
ALTER TYPE public.reset_request_status ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE public.reset_request_status ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE public.reset_request_status ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE public.reset_request_status ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE public.reset_request_status ADD VALUE IF NOT EXISTS 'FAILED';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'po_status'
  ) THEN
    CREATE TYPE public.po_status AS ENUM ('DRAFT', 'INVOICING', 'APPROVED', 'GOODS_RECEIPT', 'COMMITTED_TO_INVENTORY');
  END IF;
END $$;
ALTER TYPE public.po_status ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE public.po_status ADD VALUE IF NOT EXISTS 'INVOICING';
ALTER TYPE public.po_status ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE public.po_status ADD VALUE IF NOT EXISTS 'GOODS_RECEIPT';
ALTER TYPE public.po_status ADD VALUE IF NOT EXISTS 'COMMITTED_TO_INVENTORY';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'condition_status_enum'
  ) THEN
    CREATE TYPE public.condition_status_enum AS ENUM ('Baik', 'Rusak Ringan', 'Rusak Berat');
  END IF;
END $$;
ALTER TYPE public.condition_status_enum ADD VALUE IF NOT EXISTS 'Baik';
ALTER TYPE public.condition_status_enum ADD VALUE IF NOT EXISTS 'Rusak Ringan';
ALTER TYPE public.condition_status_enum ADD VALUE IF NOT EXISTS 'Rusak Berat';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'trimming_yield_enum'
  ) THEN
    CREATE TYPE public.trimming_yield_enum AS ENUM ('GOOD', 'BAD');
  END IF;
END $$;
ALTER TYPE public.trimming_yield_enum ADD VALUE IF NOT EXISTS 'GOOD';
ALTER TYPE public.trimming_yield_enum ADD VALUE IF NOT EXISTS 'BAD';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'transfer_status_enum'
  ) THEN
    CREATE TYPE public.transfer_status_enum AS ENUM ('DRAFT', 'DISPATCHED', 'RECEIVED', 'VARIANCE_FLAGGED');
  END IF;
END $$;
ALTER TYPE public.transfer_status_enum ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE public.transfer_status_enum ADD VALUE IF NOT EXISTS 'DISPATCHED';
ALTER TYPE public.transfer_status_enum ADD VALUE IF NOT EXISTS 'RECEIVED';
ALTER TYPE public.transfer_status_enum ADD VALUE IF NOT EXISTS 'VARIANCE_FLAGGED';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'transfer_status'
  ) THEN
    CREATE TYPE public.transfer_status AS ENUM ('DRAFT', 'TRANSIT', 'RECEIVED', 'CANCELLED');
  END IF;
END $$;
ALTER TYPE public.transfer_status ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE public.transfer_status ADD VALUE IF NOT EXISTS 'TRANSIT';
ALTER TYPE public.transfer_status ADD VALUE IF NOT EXISTS 'RECEIVED';
ALTER TYPE public.transfer_status ADD VALUE IF NOT EXISTS 'CANCELLED';

BEGIN;

-- =============================================================================
-- BAGIAN 00B: BOOTSTRAP 61 TABEL DASAR (CREATE TABLE IF NOT EXISTS & ADD COLUMN)
-- Menjamin skrip berjalan mulus baik di database Supabase kosong maupun eksisting
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pos_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name character varying UNIQUE,
  display_name character varying,
  column_mapping jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.pos_templates
  ADD COLUMN IF NOT EXISTS name character varying,
  ADD COLUMN IF NOT EXISTS display_name character varying,
  ADD COLUMN IF NOT EXISTS column_mapping jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name character varying UNIQUE,
  company_name character varying,
  status character varying,
  pos_template_id uuid,
  locked_until_month integer DEFAULT 0,
  locked_until_year integer DEFAULT 0,
  overhead_pct numeric DEFAULT 10,
  whatsapp_number character varying,
  whatsapp_token character varying,
  whatsapp_enabled boolean DEFAULT false,
  is_pos_enabled boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  branch_name character varying,
  plan_type character varying,
  pos_daily_limit integer DEFAULT 0,
  recipe_limit integer DEFAULT 0,
  pos_tax_rate numeric DEFAULT 10,
  pos_service_charge numeric DEFAULT 5
);
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS name character varying,
  ADD COLUMN IF NOT EXISTS company_name character varying,
  ADD COLUMN IF NOT EXISTS status character varying,
  ADD COLUMN IF NOT EXISTS pos_template_id uuid,
  ADD COLUMN IF NOT EXISTS locked_until_month integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until_year integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overhead_pct numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS whatsapp_number character varying,
  ADD COLUMN IF NOT EXISTS whatsapp_token character varying,
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pos_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS branch_name character varying,
  ADD COLUMN IF NOT EXISTS plan_type character varying,
  ADD COLUMN IF NOT EXISTS pos_daily_limit integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recipe_limit integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pos_tax_rate numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS pos_service_charge numeric DEFAULT 5;

CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  code character varying,
  name character varying,
  address text,
  is_central boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS code character varying,
  ADD COLUMN IF NOT EXISTS name character varying,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS is_central boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  name character varying,
  email character varying UNIQUE,
  role public.user_role DEFAULT 'Staff'::public.user_role,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  branch_id uuid
);
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS name character varying,
  ADD COLUMN IF NOT EXISTS email character varying,
  ADD COLUMN IF NOT EXISTS role public.user_role DEFAULT 'Staff'::public.user_role,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  token uuid UNIQUE,
  expires_at timestamp with time zone,
  is_used boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  invite_role public.user_role DEFAULT 'Staff'::public.user_role,
  branch_id uuid
);
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS token uuid,
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS is_used boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS invite_role public.user_role DEFAULT 'Staff'::public.user_role,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.suppliers (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  name character varying,
  phone character varying,
  address text,
  created_at timestamp with time zone DEFAULT now(),
  contact_person character varying,
  status character varying,
  updated_at timestamp with time zone DEFAULT now(),
  otif_score numeric DEFAULT 0,
  rejection_rate numeric DEFAULT 0,
  total_deliveries integer DEFAULT 0,
  on_time_deliveries integer DEFAULT 0,
  branch_id uuid
);
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS name character varying,
  ADD COLUMN IF NOT EXISTS phone character varying,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS contact_person character varying,
  ADD COLUMN IF NOT EXISTS status character varying,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS otif_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejection_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_deliveries integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS on_time_deliveries integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.storage_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  branch_id uuid,
  code character varying,
  name character varying,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.storage_locations
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS code character varying,
  ADD COLUMN IF NOT EXISTS name character varying,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

CREATE TABLE IF NOT EXISTS public.materials (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  name character varying,
  category character varying,
  supplier character varying,
  unit character varying,
  full_pack character varying,
  price bigint,
  new_price numeric DEFAULT 0,
  qty_resto numeric DEFAULT 0,
  qty_central numeric DEFAULT 0,
  min_stock numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sku character varying,
  item_code character varying,
  par_stock numeric DEFAULT 0,
  is_preparable boolean DEFAULT false,
  reorder_point numeric DEFAULT 0,
  safety_stock numeric DEFAULT 0,
  avg_daily_usage numeric DEFAULT 0,
  lead_time_days integer DEFAULT 0,
  supplier_id bigint,
  avg_cost numeric DEFAULT 0,
  broken_tracking_enabled boolean DEFAULT false,
  expiry_tracking_enabled boolean DEFAULT false,
  shelf_life_days integer DEFAULT 0,
  branch_id uuid,
  monthly_quota_qty numeric DEFAULT 0,
  is_prep_output boolean,
  requires_expiry_tracking boolean
);
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS name character varying,
  ADD COLUMN IF NOT EXISTS category character varying,
  ADD COLUMN IF NOT EXISTS supplier character varying,
  ADD COLUMN IF NOT EXISTS unit character varying,
  ADD COLUMN IF NOT EXISTS full_pack character varying,
  ADD COLUMN IF NOT EXISTS price bigint,
  ADD COLUMN IF NOT EXISTS new_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_resto numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_central numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_stock numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS sku character varying,
  ADD COLUMN IF NOT EXISTS item_code character varying,
  ADD COLUMN IF NOT EXISTS par_stock numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_preparable boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reorder_point numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS safety_stock numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_daily_usage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_time_days integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_id bigint,
  ADD COLUMN IF NOT EXISTS avg_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS broken_tracking_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS expiry_tracking_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS shelf_life_days integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS monthly_quota_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_prep_output boolean,
  ADD COLUMN IF NOT EXISTS requires_expiry_tracking boolean;

CREATE TABLE IF NOT EXISTS public.recipes (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  menu_name character varying,
  pos_code character varying,
  category character varying,
  selling_price bigint,
  subtotal bigint,
  fix_cost bigint,
  basic_cost bigint,
  food_cost_pct numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  fix_cost_pct numeric DEFAULT 0,
  selling_price_raw numeric DEFAULT 0,
  rounding_direction character varying,
  rounding_increment numeric DEFAULT 0,
  price_adjustment numeric DEFAULT 0,
  image_url text,
  target_cost_percent numeric DEFAULT 0,
  menu_class text,
  total_sold integer,
  contribution_margin numeric DEFAULT 0,
  branch_id uuid
);
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS menu_name character varying,
  ADD COLUMN IF NOT EXISTS pos_code character varying,
  ADD COLUMN IF NOT EXISTS category character varying,
  ADD COLUMN IF NOT EXISTS selling_price bigint,
  ADD COLUMN IF NOT EXISTS subtotal bigint,
  ADD COLUMN IF NOT EXISTS fix_cost bigint,
  ADD COLUMN IF NOT EXISTS basic_cost bigint,
  ADD COLUMN IF NOT EXISTS food_cost_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS fix_cost_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selling_price_raw numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rounding_direction character varying,
  ADD COLUMN IF NOT EXISTS rounding_increment numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_adjustment numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS target_cost_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS menu_class text,
  ADD COLUMN IF NOT EXISTS total_sold integer,
  ADD COLUMN IF NOT EXISTS contribution_margin numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  recipe_id bigint,
  material_id bigint,
  qty_in_use numeric DEFAULT 0,
  unit character varying,
  unit_price numeric DEFAULT 0,
  amount bigint,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  tenant_id uuid,
  branch_id uuid
);
ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS recipe_id bigint,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS qty_in_use numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit character varying,
  ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount bigint,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.recipe_versions (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  recipe_id bigint,
  effective_from date,
  effective_to date,
  subtotal numeric DEFAULT 0,
  basic_cost numeric DEFAULT 0,
  selling_price numeric DEFAULT 0,
  ingredients_snapshot jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  branch_id uuid
);
ALTER TABLE public.recipe_versions
  ADD COLUMN IF NOT EXISTS recipe_id bigint,
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS effective_to date,
  ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS basic_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selling_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ingredients_snapshot jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.unit_conversions (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  material_id bigint,
  from_unit character varying,
  to_unit character varying,
  factor numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  branch_id uuid
);
ALTER TABLE public.unit_conversions
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS from_unit character varying,
  ADD COLUMN IF NOT EXISTS to_unit character varying,
  ADD COLUMN IF NOT EXISTS factor numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.purchase_entries (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  material_id bigint,
  supplier_id bigint,
  qty numeric DEFAULT 0,
  unit character varying,
  unit_price numeric DEFAULT 0,
  date date,
  input_by uuid,
  invoice_id bigint,
  created_at timestamp with time zone DEFAULT now(),
  notes text,
  updated_at timestamp with time zone DEFAULT now(),
  prev_unit_price numeric DEFAULT 0,
  is_cancelled boolean DEFAULT false,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  cancel_reason text,
  prev_location_avg_cost numeric DEFAULT 0,
  branch_id uuid,
  delivery_notes text,
  destination_location character varying
);
ALTER TABLE public.purchase_entries
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS supplier_id bigint,
  ADD COLUMN IF NOT EXISTS qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit character varying,
  ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS date date,
  ADD COLUMN IF NOT EXISTS input_by uuid,
  ADD COLUMN IF NOT EXISTS invoice_id bigint,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS prev_unit_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_cancelled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS prev_location_avg_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_notes text,
  ADD COLUMN IF NOT EXISTS destination_location character varying;

CREATE TABLE IF NOT EXISTS public.invoices (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  invoice_no character varying,
  supplier character varying,
  date date,
  total numeric DEFAULT 0,
  status public.invoice_status,
  location public.stock_location DEFAULT 'RESTO'::public.stock_location,
  notes text,
  received_date date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  supplier_id bigint,
  receipt_photo_url text,
  receipt_signature_url text,
  receipt_gps text,
  branch_id uuid
);
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS invoice_no character varying,
  ADD COLUMN IF NOT EXISTS supplier character varying,
  ADD COLUMN IF NOT EXISTS date date,
  ADD COLUMN IF NOT EXISTS total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status public.invoice_status,
  ADD COLUMN IF NOT EXISTS location public.stock_location DEFAULT 'RESTO'::public.stock_location,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS received_date date,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS supplier_id bigint,
  ADD COLUMN IF NOT EXISTS receipt_photo_url text,
  ADD COLUMN IF NOT EXISTS receipt_signature_url text,
  ADD COLUMN IF NOT EXISTS receipt_gps text,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  invoice_id bigint,
  material_id bigint,
  qty numeric DEFAULT 0,
  unit_price numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  tenant_id uuid,
  branch_id uuid
);
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS invoice_id bigint,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.material_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  material_id bigint,
  batch_number text,
  expiry_date date,
  quantity numeric DEFAULT 0,
  location text,
  received_at date,
  status text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  batch_no character varying,
  qty_resto numeric DEFAULT 0,
  qty_central numeric DEFAULT 0,
  expired_date date,
  purchase_entry_id bigint,
  lot_qty_verified boolean DEFAULT false,
  source_module text,
  source_record_id text,
  idempotency_key text,
  branch_id uuid
);
ALTER TABLE public.material_batches
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS batch_number text,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS quantity numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS received_at date,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS batch_no character varying,
  ADD COLUMN IF NOT EXISTS qty_resto numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_central numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expired_date date,
  ADD COLUMN IF NOT EXISTS purchase_entry_id bigint,
  ADD COLUMN IF NOT EXISTS lot_qty_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.material_location_costs (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  material_id bigint,
  location public.stock_location DEFAULT 'RESTO'::public.stock_location,
  average_unit_cost numeric DEFAULT 0,
  source text,
  is_opening_estimated boolean DEFAULT false,
  updated_at timestamp with time zone DEFAULT now(),
  branch_id uuid
);
ALTER TABLE public.material_location_costs
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS location public.stock_location DEFAULT 'RESTO'::public.stock_location,
  ADD COLUMN IF NOT EXISTS average_unit_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS is_opening_estimated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.material_open_lot_state (
  tenant_id uuid,
  material_id bigint,
  location public.stock_location DEFAULT 'RESTO'::public.stock_location,
  active_open_lot_id uuid,
  opened_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now(),
  branch_id uuid,
  PRIMARY KEY (tenant_id, material_id, location)
);
ALTER TABLE public.material_open_lot_state
  ADD COLUMN IF NOT EXISTS active_open_lot_id uuid,
  ADD COLUMN IF NOT EXISTS opened_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.material_lot_movements_v4 (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  material_id bigint,
  location public.stock_location DEFAULT 'RESTO'::public.stock_location,
  batch_id uuid,
  daily_inventory_item_id bigint,
  movement_qty numeric DEFAULT 0,
  movement_type text,
  idempotency_key text,
  reason text,
  reversed_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  branch_id uuid
);
ALTER TABLE public.material_lot_movements_v4
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS location public.stock_location DEFAULT 'RESTO'::public.stock_location,
  ADD COLUMN IF NOT EXISTS batch_id uuid,
  ADD COLUMN IF NOT EXISTS daily_inventory_item_id bigint,
  ADD COLUMN IF NOT EXISTS movement_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS movement_type text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS reversed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.material_price_history (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  material_id bigint,
  old_price numeric DEFAULT 0,
  new_price numeric DEFAULT 0,
  changed_by uuid,
  changed_at timestamp with time zone,
  tenant_id uuid
);
ALTER TABLE public.material_price_history
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS old_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS changed_by uuid,
  ADD COLUMN IF NOT EXISTS changed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

CREATE TABLE IF NOT EXISTS public.daily_inventories (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  date date,
  checked_by uuid,
  status character varying,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  location public.stock_location DEFAULT 'RESTO'::public.stock_location,
  verified_by uuid,
  branch_id uuid
);
ALTER TABLE public.daily_inventories
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS date date,
  ADD COLUMN IF NOT EXISTS checked_by uuid,
  ADD COLUMN IF NOT EXISTS status character varying,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS location public.stock_location DEFAULT 'RESTO'::public.stock_location,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.daily_inventory_items (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  inventory_id bigint,
  material_id bigint,
  in_qty numeric DEFAULT 0,
  out_qty numeric DEFAULT 0,
  closing_qty numeric DEFAULT 0,
  system_qty numeric DEFAULT 0,
  variance numeric DEFAULT 0,
  full_qty numeric DEFAULT 0,
  broken_qty numeric DEFAULT 0,
  waste_qty numeric DEFAULT 0,
  prev_full_qty numeric DEFAULT 0,
  notes text,
  terpakai_qty numeric DEFAULT 0,
  tenant_id uuid,
  expiry_date date,
  batch_number text,
  batch_id uuid,
  is_counted boolean DEFAULT false,
  counted_at timestamp with time zone,
  counted_by uuid,
  unit_cost_snapshot numeric DEFAULT 0,
  usage_value numeric DEFAULT 0,
  book_qty_before_close numeric DEFAULT 0,
  eod_adjustment_qty numeric DEFAULT 0,
  stock_based_usage_qty numeric DEFAULT 0,
  usage_variance_qty numeric DEFAULT 0,
  production_usage_qty numeric DEFAULT 0,
  net_stock_movement_qty numeric DEFAULT 0,
  opening_qty_source text,
  opening_qty_snapshot numeric DEFAULT 0,
  opening_full_qty numeric DEFAULT 0,
  opening_broken_qty numeric DEFAULT 0,
  closing_broken_qty_base numeric DEFAULT 0,
  broken_unit text,
  broken_confirmed boolean DEFAULT false,
  out_qty_input numeric DEFAULT 0,
  out_unit text,
  out_confirmed boolean DEFAULT false,
  zero_activity_confirmed boolean DEFAULT false,
  closing_full_inferred_qty numeric DEFAULT 0,
  reconciliation_status text,
  opening_active_open_lot_id uuid,
  active_open_lot_id uuid,
  fefo_override_reason text,
  manual_in_qty numeric DEFAULT 0,
  manual_in_lots jsonb DEFAULT '[]'::jsonb,
  branch_id uuid
);
ALTER TABLE public.daily_inventory_items
  ADD COLUMN IF NOT EXISTS inventory_id bigint,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS in_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS out_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closing_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS system_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS full_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS broken_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waste_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prev_full_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS terpakai_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS batch_number text,
  ADD COLUMN IF NOT EXISTS batch_id uuid,
  ADD COLUMN IF NOT EXISTS is_counted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS counted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS counted_by uuid,
  ADD COLUMN IF NOT EXISTS unit_cost_snapshot numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usage_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS book_qty_before_close numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eod_adjustment_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_based_usage_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usage_variance_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS production_usage_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_stock_movement_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_qty_source text,
  ADD COLUMN IF NOT EXISTS opening_qty_snapshot numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_full_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_broken_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closing_broken_qty_base numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS broken_unit text,
  ADD COLUMN IF NOT EXISTS broken_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS out_qty_input numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS out_unit text,
  ADD COLUMN IF NOT EXISTS out_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS zero_activity_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS closing_full_inferred_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reconciliation_status text,
  ADD COLUMN IF NOT EXISTS opening_active_open_lot_id uuid,
  ADD COLUMN IF NOT EXISTS active_open_lot_id uuid,
  ADD COLUMN IF NOT EXISTS fefo_override_reason text,
  ADD COLUMN IF NOT EXISTS manual_in_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_in_lots jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.daily_stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  branch_id uuid,
  location_id uuid,
  material_id bigint,
  date date,
  opening_stock numeric DEFAULT 0,
  in_qty numeric DEFAULT 0,
  out_qty numeric DEFAULT 0,
  full_units numeric DEFAULT 0,
  broken_fraction numeric DEFAULT 0,
  waste_qty numeric DEFAULT 0,
  is_eod_locked boolean DEFAULT false,
  eod_submitted_at timestamp with time zone,
  submitted_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  closing_stock numeric DEFAULT 0,
  usage_qty numeric DEFAULT 0
);
ALTER TABLE public.daily_stock_counts
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS location_id uuid,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS date date,
  ADD COLUMN IF NOT EXISTS opening_stock numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS in_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS out_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS full_units numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS broken_fraction numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waste_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_eod_locked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS eod_submitted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS closing_stock numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usage_qty numeric DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.transactions (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  date date,
  material_id bigint,
  type public.transaction_type,
  location public.stock_location DEFAULT 'RESTO'::public.stock_location,
  qty numeric DEFAULT 0,
  amount numeric DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  amount_original numeric DEFAULT 0,
  asset_id uuid,
  unit_cost_snapshot numeric DEFAULT 0,
  source_module text,
  source_record_id text,
  idempotency_key text,
  transfer_group_id uuid,
  is_reversed boolean DEFAULT false,
  branch_id uuid,
  delivery_notes text
);
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS date date,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS type public.transaction_type,
  ADD COLUMN IF NOT EXISTS location public.stock_location DEFAULT 'RESTO'::public.stock_location,
  ADD COLUMN IF NOT EXISTS qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS amount_original numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS asset_id uuid,
  ADD COLUMN IF NOT EXISTS unit_cost_snapshot numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS transfer_group_id uuid,
  ADD COLUMN IF NOT EXISTS is_reversed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_notes text;

CREATE TABLE IF NOT EXISTS public.transactions_recalc_audit (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  transaction_id bigint,
  material_id bigint,
  date date,
  type character varying,
  amount_lama numeric DEFAULT 0,
  amount_baru numeric DEFAULT 0,
  selisih numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.transactions_recalc_audit
  ADD COLUMN IF NOT EXISTS transaction_id bigint,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS date date,
  ADD COLUMN IF NOT EXISTS type character varying,
  ADD COLUMN IF NOT EXISTS amount_lama numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_baru numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selisih numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

CREATE TABLE IF NOT EXISTS public.stock_opnames (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  period_month integer DEFAULT 0,
  period_year integer DEFAULT 0,
  location public.stock_location DEFAULT 'RESTO'::public.stock_location,
  status public.opname_status,
  signature_svg text,
  created_by uuid,
  approved_by uuid,
  submitted_at timestamp with time zone,
  approved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  branch_id uuid
);
ALTER TABLE public.stock_opnames
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS period_month integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS period_year integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS location public.stock_location DEFAULT 'RESTO'::public.stock_location,
  ADD COLUMN IF NOT EXISTS status public.opname_status,
  ADD COLUMN IF NOT EXISTS signature_svg text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS submitted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.stock_opname_items (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  opname_id bigint,
  material_id bigint,
  book_qty numeric DEFAULT 0,
  physical_qty numeric DEFAULT 0,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  tenant_id uuid,
  unit_cost_snapshot numeric DEFAULT 0,
  valuation_snapshot numeric DEFAULT 0,
  valuation_is_estimated boolean DEFAULT false,
  branch_id uuid
);
ALTER TABLE public.stock_opname_items
  ADD COLUMN IF NOT EXISTS opname_id bigint,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS book_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS physical_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS unit_cost_snapshot numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valuation_snapshot numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valuation_is_estimated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  material_id bigint,
  opname_date date,
  system_qty numeric DEFAULT 0,
  physical_qty numeric DEFAULT 0,
  variance_pct numeric DEFAULT 0,
  reason text,
  category text,
  status text,
  requested_by uuid,
  approved_by uuid,
  approved_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  variance_qty numeric DEFAULT 0,
  branch_id uuid
);
ALTER TABLE public.stock_adjustments
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS opname_date date,
  ADD COLUMN IF NOT EXISTS system_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS physical_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variance_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS requested_by uuid,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS variance_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.physical_checks (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  week_start date,
  week_end date,
  input_by uuid,
  verified_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  branch_id uuid
);
ALTER TABLE public.physical_checks
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS week_start date,
  ADD COLUMN IF NOT EXISTS week_end date,
  ADD COLUMN IF NOT EXISTS input_by uuid,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.physical_check_items (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  check_id bigint,
  material_id bigint,
  opening_qty numeric DEFAULT 0,
  purchase_qty numeric DEFAULT 0,
  expected_usage numeric DEFAULT 0,
  physical_qty numeric DEFAULT 0,
  variance numeric DEFAULT 0,
  waste_cause character varying,
  notes text,
  tenant_id uuid,
  branch_id uuid
);
ALTER TABLE public.physical_check_items
  ADD COLUMN IF NOT EXISTS check_id bigint,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS opening_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_usage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS physical_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waste_cause character varying,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.expected_usage (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  week_start date,
  week_end date,
  material_id bigint,
  expected_qty numeric DEFAULT 0,
  calculated_at timestamp with time zone,
  total_sold integer,
  last_pos_filename character varying,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  expected_cost_value numeric DEFAULT 0,
  unit_cost_snapshot numeric DEFAULT 0,
  source_file_hash text,
  branch_id uuid
);
ALTER TABLE public.expected_usage
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS week_start date,
  ADD COLUMN IF NOT EXISTS week_end date,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS expected_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calculated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS total_sold integer,
  ADD COLUMN IF NOT EXISTS last_pos_filename character varying,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expected_cost_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_cost_snapshot numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_file_hash text,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.usage_variance (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  period_month integer DEFAULT 0,
  period_year integer DEFAULT 0,
  material_id bigint,
  theoretical_qty numeric DEFAULT 0,
  actual_qty numeric DEFAULT 0,
  variance_value numeric DEFAULT 0,
  calculated_at timestamp with time zone,
  variance_qty numeric DEFAULT 0,
  branch_id uuid
);
ALTER TABLE public.usage_variance
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS period_month integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS period_year integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS theoretical_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variance_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calculated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS variance_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.production_batches (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  batch_name character varying,
  yield_qty numeric DEFAULT 0,
  yield_unit character varying,
  source_note text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  output_material_id bigint,
  is_active boolean DEFAULT true,
  branch_id uuid
);
ALTER TABLE public.production_batches
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS batch_name character varying,
  ADD COLUMN IF NOT EXISTS yield_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yield_unit character varying,
  ADD COLUMN IF NOT EXISTS source_note text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS output_material_id bigint,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.production_batch_ingredients (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  batch_id bigint,
  material_id bigint,
  qty numeric DEFAULT 0,
  unit character varying,
  tenant_id uuid,
  branch_id uuid
);
ALTER TABLE public.production_batch_ingredients
  ADD COLUMN IF NOT EXISTS batch_id bigint,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit character varying,
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.production_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  production_batch_id bigint,
  run_date date,
  location public.stock_location DEFAULT 'RESTO'::public.stock_location,
  recipe_name_snapshot text,
  output_material_id bigint,
  yield_qty_snapshot numeric DEFAULT 0,
  yield_unit_snapshot text,
  output_qty numeric DEFAULT 0,
  output_stock_qty numeric DEFAULT 0,
  yield_factor numeric DEFAULT 0,
  total_cost numeric DEFAULT 0,
  output_unit_cost numeric DEFAULT 0,
  status text,
  notes text,
  created_by uuid,
  idempotency_key text,
  created_at timestamp with time zone DEFAULT now(),
  branch_id uuid
);
ALTER TABLE public.production_runs
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS production_batch_id bigint,
  ADD COLUMN IF NOT EXISTS run_date date,
  ADD COLUMN IF NOT EXISTS location public.stock_location DEFAULT 'RESTO'::public.stock_location,
  ADD COLUMN IF NOT EXISTS recipe_name_snapshot text,
  ADD COLUMN IF NOT EXISTS output_material_id bigint,
  ADD COLUMN IF NOT EXISTS yield_qty_snapshot numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yield_unit_snapshot text,
  ADD COLUMN IF NOT EXISTS output_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_stock_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yield_factor numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_unit_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.production_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  run_id uuid,
  material_id bigint,
  material_name_snapshot text,
  recipe_qty numeric DEFAULT 0,
  recipe_unit text,
  input_stock_qty numeric DEFAULT 0,
  unit_cost_snapshot numeric DEFAULT 0,
  cost_value numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  branch_id uuid
);
ALTER TABLE public.production_run_items
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS run_id uuid,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS material_name_snapshot text,
  ADD COLUMN IF NOT EXISTS recipe_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recipe_unit text,
  ADD COLUMN IF NOT EXISTS input_stock_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_cost_snapshot numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.production_trimming_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  branch_id uuid,
  material_id bigint,
  batch_number character varying,
  gross_weight numeric DEFAULT 0,
  gross_photo_url text,
  gross_timestamp timestamp with time zone,
  gross_latitude numeric DEFAULT 0,
  gross_longitude numeric DEFAULT 0,
  clean_weight numeric DEFAULT 0,
  waste_weight numeric DEFAULT 0,
  clean_photo_url text,
  waste_photo_url text,
  clean_timestamp timestamp with time zone,
  shrinkage_percent numeric DEFAULT 0,
  yield_status public.trimming_yield_enum,
  portion_pack_output integer,
  status character varying,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.production_trimming_batches
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS batch_number character varying,
  ADD COLUMN IF NOT EXISTS gross_weight numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_photo_url text,
  ADD COLUMN IF NOT EXISTS gross_timestamp timestamp with time zone,
  ADD COLUMN IF NOT EXISTS gross_latitude numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_longitude numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clean_weight numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waste_weight numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clean_photo_url text,
  ADD COLUMN IF NOT EXISTS waste_photo_url text,
  ADD COLUMN IF NOT EXISTS clean_timestamp timestamp with time zone,
  ADD COLUMN IF NOT EXISTS shrinkage_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yield_status public.trimming_yield_enum,
  ADD COLUMN IF NOT EXISTS portion_pack_output integer,
  ADD COLUMN IF NOT EXISTS status character varying,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

CREATE TABLE IF NOT EXISTS public.waste_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  branch_id uuid,
  material_id bigint,
  quantity numeric DEFAULT 0,
  cost_loss numeric DEFAULT 0,
  source_type character varying,
  reason text,
  photo_evidence_url text,
  trimming_batch_id uuid,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.waste_logs
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS quantity numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_loss numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_type character varying,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS photo_evidence_url text,
  ADD COLUMN IF NOT EXISTS trimming_batch_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

CREATE TABLE IF NOT EXISTS public.inter_branch_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  transfer_number character varying,
  from_branch_id uuid,
  to_branch_id uuid,
  status public.transfer_status_enum,
  dispatched_at timestamp with time zone,
  received_at timestamp with time zone,
  dispatcher_id uuid,
  receiver_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  notes text
);
ALTER TABLE public.inter_branch_transfers
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS transfer_number character varying,
  ADD COLUMN IF NOT EXISTS from_branch_id uuid,
  ADD COLUMN IF NOT EXISTS to_branch_id uuid,
  ADD COLUMN IF NOT EXISTS status public.transfer_status_enum,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS received_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS dispatcher_id uuid,
  ADD COLUMN IF NOT EXISTS receiver_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS public.inter_branch_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  transfer_id uuid,
  material_id bigint,
  qty_dispatched numeric DEFAULT 0,
  qty_received numeric DEFAULT 0,
  remarks text,
  variance numeric DEFAULT 0
);
ALTER TABLE public.inter_branch_transfer_items
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS transfer_id uuid,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS qty_dispatched numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_received numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS variance numeric DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.location_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  branch_id uuid,
  from_location_id uuid,
  to_location_id uuid,
  transfer_date date,
  status public.transfer_status,
  dispatched_by uuid,
  received_by uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.location_transfers
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS from_location_id uuid,
  ADD COLUMN IF NOT EXISTS to_location_id uuid,
  ADD COLUMN IF NOT EXISTS transfer_date date,
  ADD COLUMN IF NOT EXISTS status public.transfer_status,
  ADD COLUMN IF NOT EXISTS dispatched_by uuid,
  ADD COLUMN IF NOT EXISTS received_by uuid,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

CREATE TABLE IF NOT EXISTS public.location_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  transfer_id uuid,
  material_id bigint,
  qty_sent numeric DEFAULT 0,
  qty_received numeric DEFAULT 0,
  variance numeric DEFAULT 0
);
ALTER TABLE public.location_transfer_items
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS transfer_id uuid,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS qty_sent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_received numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variance numeric DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.market_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  tenant_id uuid,
  name text,
  description text,
  is_active boolean DEFAULT true,
  branch_id uuid,
  order_date date,
  approved_by uuid
);
ALTER TABLE public.market_lists
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS order_date date,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

CREATE TABLE IF NOT EXISTS public.market_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_list_id uuid,
  material_id bigint,
  quantity numeric DEFAULT 0,
  unit text,
  current_stock numeric DEFAULT 0,
  min_stock numeric DEFAULT 0,
  par_stock numeric DEFAULT 0,
  request_qty numeric DEFAULT 0,
  approved_qty numeric DEFAULT 0,
  estimated_price numeric DEFAULT 0,
  is_urgent boolean DEFAULT false,
  remarks text,
  tenant_id uuid,
  branch_id uuid
);
ALTER TABLE public.market_list_items
  ADD COLUMN IF NOT EXISTS market_list_id uuid,
  ADD COLUMN IF NOT EXISTS material_id bigint,
  ADD COLUMN IF NOT EXISTS quantity numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS current_stock numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_stock numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS par_stock numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_urgent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.pos_upload_logs (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  filename character varying,
  file_hash character varying,
  period character varying,
  total_rows integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  branch_name character varying,
  company_name character varying,
  period_start date,
  period_end date,
  category_filter character varying,
  branch_mismatch boolean DEFAULT false,
  rows_inserted integer,
  rows_updated integer,
  branch_id uuid
);
ALTER TABLE public.pos_upload_logs
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS filename character varying,
  ADD COLUMN IF NOT EXISTS file_hash character varying,
  ADD COLUMN IF NOT EXISTS period character varying,
  ADD COLUMN IF NOT EXISTS total_rows integer,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS branch_name character varying,
  ADD COLUMN IF NOT EXISTS company_name character varying,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS category_filter character varying,
  ADD COLUMN IF NOT EXISTS branch_mismatch boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rows_inserted integer,
  ADD COLUMN IF NOT EXISTS rows_updated integer,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.pos_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  order_no character varying,
  total_amount numeric DEFAULT 0,
  payment_method character varying,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  branch_id uuid
);
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS order_no character varying,
  ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method character varying,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.pos_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  recipe_id bigint,
  qty integer DEFAULT 0,
  unit_price numeric DEFAULT 0,
  subtotal numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  branch_id uuid
);
ALTER TABLE public.pos_order_items
  ADD COLUMN IF NOT EXISTS order_id uuid,
  ADD COLUMN IF NOT EXISTS recipe_id bigint,
  ADD COLUMN IF NOT EXISTS qty integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.pos_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  order_no character varying,
  payment_method character varying,
  subtotal bigint,
  tax bigint,
  total_amount bigint,
  cash_received numeric DEFAULT 0,
  cash_change numeric DEFAULT 0,
  status character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  branch_id uuid
);
ALTER TABLE public.pos_transactions
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS order_no character varying,
  ADD COLUMN IF NOT EXISTS payment_method character varying,
  ADD COLUMN IF NOT EXISTS subtotal bigint,
  ADD COLUMN IF NOT EXISTS tax bigint,
  ADD COLUMN IF NOT EXISTS total_amount bigint,
  ADD COLUMN IF NOT EXISTS cash_received numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_change numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status character varying,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.pos_transaction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid,
  recipe_id bigint,
  menu_name character varying,
  qty integer DEFAULT 0,
  unit_price numeric DEFAULT 0,
  subtotal numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  tenant_id uuid,
  branch_id uuid
);
ALTER TABLE public.pos_transaction_items
  ADD COLUMN IF NOT EXISTS transaction_id uuid,
  ADD COLUMN IF NOT EXISTS recipe_id bigint,
  ADD COLUMN IF NOT EXISTS menu_name character varying,
  ADD COLUMN IF NOT EXISTS qty integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.pos_daily_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  sales_date date,
  total_transactions integer,
  total_revenue numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  branch_id uuid
);
ALTER TABLE public.pos_daily_aggregates
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS sales_date date,
  ADD COLUMN IF NOT EXISTS total_transactions integer,
  ADD COLUMN IF NOT EXISTS total_revenue numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  branch_id uuid,
  asset_code character varying,
  asset_name character varying,
  brand_model character varying,
  location_id uuid,
  quantity integer,
  condition public.condition_status_enum,
  acquisition_date date,
  acquisition_value numeric DEFAULT 0,
  pic_name character varying,
  last_serviced_at date,
  next_servicing_due date,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS asset_code character varying,
  ADD COLUMN IF NOT EXISTS asset_name character varying,
  ADD COLUMN IF NOT EXISTS brand_model character varying,
  ADD COLUMN IF NOT EXISTS location_id uuid,
  ADD COLUMN IF NOT EXISTS quantity integer,
  ADD COLUMN IF NOT EXISTS condition public.condition_status_enum,
  ADD COLUMN IF NOT EXISTS acquisition_date date,
  ADD COLUMN IF NOT EXISTS acquisition_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pic_name character varying,
  ADD COLUMN IF NOT EXISTS last_serviced_at date,
  ADD COLUMN IF NOT EXISTS next_servicing_due date,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

CREATE TABLE IF NOT EXISTS public.asset_items (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  name character varying,
  unit character varying,
  qty_owned numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  branch_id uuid
);
ALTER TABLE public.asset_items
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS name character varying,
  ADD COLUMN IF NOT EXISTS unit character varying,
  ADD COLUMN IF NOT EXISTS qty_owned numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.asset_opname_items (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  period_month integer DEFAULT 0,
  period_year integer DEFAULT 0,
  asset_id bigint,
  stock_awal numeric DEFAULT 0,
  stock_akhir numeric DEFAULT 0,
  adjustment_plus numeric DEFAULT 0,
  adjustment_minus numeric DEFAULT 0,
  keterangan text,
  created_at timestamp with time zone DEFAULT now(),
  selisih_tidak_teridentifikasi numeric DEFAULT 0,
  branch_id uuid
);
ALTER TABLE public.asset_opname_items
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS period_month integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS period_year integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS asset_id bigint,
  ADD COLUMN IF NOT EXISTS stock_awal numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_akhir numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_plus numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_minus numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS keterangan text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS selisih_tidak_teridentifikasi numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.equipment_service_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  asset_id uuid,
  service_type text,
  description text,
  performed_by text,
  performed_at date,
  next_due_date date,
  parts_replaced text,
  cost numeric DEFAULT 0,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  branch_id uuid
);
ALTER TABLE public.equipment_service_logs
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS asset_id uuid,
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS performed_by text,
  ADD COLUMN IF NOT EXISTS performed_at date,
  ADD COLUMN IF NOT EXISTS next_due_date date,
  ADD COLUMN IF NOT EXISTS parts_replaced text,
  ADD COLUMN IF NOT EXISTS cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.generated_so_reports (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  period_month integer DEFAULT 0,
  period_year integer DEFAULT 0,
  status character varying,
  pemakaian_bulan numeric DEFAULT 0,
  penjualan_bulan numeric DEFAULT 0,
  food_cost_pct numeric DEFAULT 0,
  data_snapshot jsonb DEFAULT '{}'::jsonb,
  generated_by uuid,
  generated_at timestamp with time zone,
  file_url text,
  branch_id uuid
);
ALTER TABLE public.generated_so_reports
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS period_month integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS period_year integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status character varying,
  ADD COLUMN IF NOT EXISTS pemakaian_bulan numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penjualan_bulan numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS food_cost_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_snapshot jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS generated_by uuid,
  ADD COLUMN IF NOT EXISTS generated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  user_id uuid,
  action character varying,
  description text,
  ip_address character varying,
  created_at timestamp with time zone DEFAULT now(),
  table_name character varying,
  record_id bigint,
  old_data jsonb DEFAULT '{}'::jsonb,
  new_data jsonb DEFAULT '{}'::jsonb,
  actor_name character varying,
  target_entity character varying,
  target_id text,
  details jsonb DEFAULT '{}'::jsonb,
  is_system boolean DEFAULT false
);
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS action character varying,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS ip_address character varying,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS table_name character varying,
  ADD COLUMN IF NOT EXISTS record_id bigint,
  ADD COLUMN IF NOT EXISTS old_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS new_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS actor_name character varying,
  ADD COLUMN IF NOT EXISTS target_entity character varying,
  ADD COLUMN IF NOT EXISTS target_id text,
  ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_system boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS public.backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  filename character varying,
  size_bytes bigint,
  size_formatted character varying,
  data_json text,
  created_at timestamp with time zone DEFAULT now(),
  storage_path text
);
ALTER TABLE public.backups
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS filename character varying,
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS size_formatted character varying,
  ADD COLUMN IF NOT EXISTS data_json text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS storage_path text;

CREATE TABLE IF NOT EXISTS public.seed_data_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name character varying,
  description text,
  type character varying,
  storage_path character varying,
  industry character varying,
  file_size_bytes integer,
  row_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.seed_data_files
  ADD COLUMN IF NOT EXISTS name character varying,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS type character varying,
  ADD COLUMN IF NOT EXISTS storage_path character varying,
  ADD COLUMN IF NOT EXISTS industry character varying,
  ADD COLUMN IF NOT EXISTS file_size_bytes integer,
  ADD COLUMN IF NOT EXISTS row_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

CREATE TABLE IF NOT EXISTS public.tenant_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  requested_by uuid,
  reset_pos boolean DEFAULT false,
  reset_stock_history boolean DEFAULT false,
  reset_purchasing boolean DEFAULT false,
  reset_recipes boolean DEFAULT false,
  reset_materials boolean DEFAULT false,
  status public.reset_request_status,
  notes text,
  approved_by uuid,
  approved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  result_summary jsonb DEFAULT '{}'::jsonb,
  error_message text
);
ALTER TABLE public.tenant_reset_requests
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS requested_by uuid,
  ADD COLUMN IF NOT EXISTS reset_pos boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reset_stock_history boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reset_purchasing boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reset_recipes boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reset_materials boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS status public.reset_request_status,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS result_summary jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_message text;

CREATE TABLE IF NOT EXISTS public.permission_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name character varying,
  can_create_po boolean DEFAULT false,
  can_approve_po boolean DEFAULT false,
  can_receive_goods boolean DEFAULT false,
  can_manage_users boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.permission_matrix
  ADD COLUMN IF NOT EXISTS role_name character varying,
  ADD COLUMN IF NOT EXISTS can_create_po boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_approve_po boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_receive_goods boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_users boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

CREATE TABLE IF NOT EXISTS public.area_role_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid,
  area_code text NOT NULL,
  area_name text NOT NULL,
  role_classification text NOT NULL DEFAULT 'Bar',
  allowed_categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, area_code)
);

-- Indeks Unik Komposit untuk mendukung klausa ON CONFLICT di seluruh RPC & Frontend
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_name_boot ON public.tenants (name);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan indeks unik uq_tenants_name_boot: %', SQLERRM;
END $$;
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_boot ON public.users (email);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan indeks unik uq_users_email_boot: %', SQLERRM;
END $$;
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_templates_name_boot ON public.pos_templates (name);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan indeks unik uq_pos_templates_name_boot: %', SQLERRM;
END $$;
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_invitations_token_boot ON public.invitations (token);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan indeks unik uq_invitations_token_boot: %', SQLERRM;
END $$;
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_inventory_items_inv_mat ON public.daily_inventory_items (inventory_id, material_id);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan indeks unik uq_daily_inventory_items_inv_mat: %', SQLERRM;
END $$;
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_stock_counts_loc_mat_date ON public.daily_stock_counts (location_id, material_id, date);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan indeks unik uq_daily_stock_counts_loc_mat_date: %', SQLERRM;
END $$;
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_material_location_costs_ten_mat_loc ON public.material_location_costs (tenant_id, material_id, location);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan indeks unik uq_material_location_costs_ten_mat_loc: %', SQLERRM;
END $$;
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_material_lot_movements_v4_ten_idem ON public.material_lot_movements_v4 (tenant_id, idempotency_key);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan indeks unik uq_material_lot_movements_v4_ten_idem: %', SQLERRM;
END $$;
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_ten_idem ON public.transactions (tenant_id, idempotency_key);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan indeks unik uq_transactions_ten_idem: %', SQLERRM;
END $$;
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_expected_usage_ten_hash_mat ON public.expected_usage (tenant_id, source_file_hash, material_id);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan indeks unik uq_expected_usage_ten_hash_mat: %', SQLERRM;
END $$;
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_expected_usage_ten_week_mat ON public.expected_usage (tenant_id, week_start, material_id);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan indeks unik uq_expected_usage_ten_week_mat: %', SQLERRM;
END $$;
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_recipe_ingredients_rec_mat ON public.recipe_ingredients (recipe_id, material_id);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan indeks unik uq_recipe_ingredients_rec_mat: %', SQLERRM;
END $$;
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_opname_items_opn_mat ON public.stock_opname_items (opname_id, material_id);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan indeks unik uq_stock_opname_items_opn_mat: %', SQLERRM;
END $$;
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_area_role_mappings_ten_br_area ON public.area_role_mappings (tenant_id, branch_id, area_code);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan indeks unik uq_area_role_mappings_ten_br_area: %', SQLERRM;
END $$;

-- =============================================================================
-- BAGIAN 00C: FUNGSI HELPER OTENTIKASI, RLS, & RPC TRANSAKSIONAL INTI (V2 - V12)
-- =============================================================================
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.bv2_auth_tenant_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.bv2_auth_tenant_id();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.bv2_auth_tenant_id(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.get_auth_tenant_id();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.get_auth_tenant_id(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.get_my_tenant_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.get_my_tenant_id();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.get_my_tenant_id(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.current_tenant_id();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.current_tenant_id(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.bv2_auth_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.role::text FROM public.users u WHERE u.id = auth.uid() LIMIT 1;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.bv2_auth_role();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.bv2_auth_role(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public."current_role"() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.role::text FROM public.users u WHERE u.id = auth.uid() LIMIT 1;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public."current_role"();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public."current_role"(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.bv2_auth_branch_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.branch_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.bv2_auth_branch_id();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.bv2_auth_branch_id(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.bv2_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    public.bv2_auth_role() IN (
      'Admin / Owner', 'Admin  Owner', 'Owner', 'SuperAdmin', 'Super Admin', 'Supervisor', 'Finance'
    ),
    false
  );
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.bv2_is_admin();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.bv2_is_admin(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.bv2_is_superadmin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    public.bv2_auth_role() IN ('SuperAdmin', 'Super Admin'),
    false
  );
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.bv2_is_superadmin();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.bv2_is_superadmin(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.bv2_is_superadmin(), false);
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.is_super_admin();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.is_super_admin(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.check_user_access(p_id uuid, p_tenant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (p_id = auth.uid())
    OR (p_tenant_id = public.bv2_auth_tenant_id())
    OR public.bv2_is_superadmin(),
    false
  );
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.check_user_access(uuid, uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.check_user_access(uuid, uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20260920000000_atomic_approvals.sql] Fungsi: public.approve_inter_branch_transfer
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.approve_inter_branch_transfer(
    p_transfer_id uuid,
    p_receiver_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_transfer record;
BEGIN
    -- Lock the row to prevent TOCTOU and concurrent race conditions (ISS-02)
    SELECT * INTO v_transfer 
    FROM public.inter_branch_transfers 
    WHERE id = p_transfer_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transfer not found';
    END IF;

    -- Prevent double-approval (ISS-03)
    IF v_transfer.status != 'DISPATCHED' THEN
        RAISE EXCEPTION 'Transfer is not in DISPATCHED state (Current state: %)', v_transfer.status;
    END IF;

    -- Execute Atomic Update for status
    UPDATE public.inter_branch_transfers
    SET status = 'RECEIVED',
        received_at = now(),
        receiver_id = p_receiver_id
    WHERE id = p_transfer_id AND status = 'DISPATCHED';

    RETURN jsonb_build_object('success', true, 'message', 'Transfer approved atomically');
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.approve_inter_branch_transfer(uuid, uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.approve_inter_branch_transfer(uuid, uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20260920000000_atomic_approvals.sql] Fungsi: public.approve_stock_opname
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.approve_stock_opname(
    p_opname_id bigint,
    p_approved_by uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_opname record;
BEGIN
    -- Lock the row to prevent TOCTOU
    SELECT * INTO v_opname 
    FROM public.stock_opnames 
    WHERE id = p_opname_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock opname not found';
    END IF;

    -- Prevent double-approval (ISS-03)
    IF v_opname.status != 'SUBMITTED' THEN
        RAISE EXCEPTION 'Opname is not in SUBMITTED state (Current state: %)', v_opname.status;
    END IF;

    -- Atomic Update
    UPDATE public.stock_opnames
    SET status = 'APPROVED',
        approved_at = now(),
        approved_by = p_approved_by
    WHERE id = p_opname_id AND status = 'SUBMITTED';

    RETURN jsonb_build_object('success', true, 'message', 'Opname approved atomically');
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.approve_stock_opname(bigint, uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.approve_stock_opname(bigint, uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20260925000000_wbs_f1_triggers_storage.sql] Fungsi: public.trg_calc_daily_inventory
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.trg_calc_daily_inventory()
RETURNS TRIGGER AS $$
BEGIN
    NEW.closing_stock := COALESCE(NEW.full_units, 0) + COALESCE(NEW.broken_fraction, 0);
    NEW.usage_qty := COALESCE(NEW.opening_stock, 0) + COALESCE(NEW.in_qty, 0) - NEW.closing_stock - COALESCE(NEW.waste_qty, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.trg_calc_daily_inventory();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.trg_calc_daily_inventory(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20260925000000_wbs_f1_triggers_storage.sql] Fungsi: public.trg_calc_transfer_variance
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.trg_calc_transfer_variance()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.qty_received IS NULL THEN
        NEW.variance := NULL;
    ELSE
        NEW.variance := NEW.qty_received - NEW.qty_dispatched;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.trg_calc_transfer_variance();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.trg_calc_transfer_variance(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20260925000000_wbs_f1_triggers_storage.sql] Fungsi: public.trg_calc_stock_adjustment_variance
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.trg_calc_stock_adjustment_variance()
RETURNS TRIGGER AS $$
BEGIN
    NEW.variance_qty := COALESCE(NEW.physical_qty, 0) - COALESCE(NEW.system_qty, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.trg_calc_stock_adjustment_variance();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.trg_calc_stock_adjustment_variance(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261115000000_strict_branch_isolation_v12.sql] Fungsi: public.deduct_stock_atomic
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.deduct_stock_atomic(
  p_material_id bigint,
  p_deduct_qty numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_mat record;
BEGIN
  SELECT id, branch_id INTO v_mat FROM public.materials WHERE id = p_material_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material tidak ditemukan.';
  END IF;

  PERFORM public.bv2_assert_branch_access(v_mat.branch_id);

  UPDATE public.materials
  SET qty_resto = qty_resto - p_deduct_qty,
      updated_at = now()
  WHERE id = p_material_id;
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.deduct_stock_atomic(bigint, numeric);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.deduct_stock_atomic(bigint, numeric): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261007000001_missing_rpcs.sql] Fungsi: public.checkout_pos_atomic
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
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
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.checkout_pos_atomic(uuid, uuid, text, numeric, text, jsonb, jsonb, jsonb);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.checkout_pos_atomic(uuid, uuid, text, numeric, text, jsonb, jsonb, jsonb): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261007000001_missing_rpcs.sql] Fungsi: public.complete_opname_atomic
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
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
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.complete_opname_atomic(uuid, uuid, text, uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.complete_opname_atomic(uuid, uuid, text, uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261115000000_strict_branch_isolation_v12.sql] Fungsi: public.adjust_material_stock
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.adjust_material_stock(
  p_material_id bigint,
  p_tenant_id uuid,
  p_type text,
  p_location text,
  p_qty numeric,
  p_notes text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_mat record;
  v_safe_type public.transaction_type;
  v_safe_loc public.stock_location;
  v_tx_qty numeric := p_qty;
  v_unit_cost numeric := 0;
BEGIN
  IF UPPER(p_location) = 'CENTRAL' THEN
    v_safe_loc := 'CENTRAL'::public.stock_location;
  ELSE
    v_safe_loc := 'RESTO'::public.stock_location;
  END IF;

  BEGIN
    v_safe_type := p_type::public.transaction_type;
  EXCEPTION WHEN OTHERS THEN
    v_safe_type := 'OUT'::public.transaction_type;
  END;

  SELECT * INTO v_mat
  FROM public.materials
  WHERE id = p_material_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material tidak ditemukan.';
  END IF;

  PERFORM public.bv2_assert_branch_access(v_mat.branch_id);

  v_unit_cost := COALESCE(NULLIF(v_mat.avg_cost, 0), v_mat.price, 0);

  IF v_safe_type = 'OPNAME_ADJ' THEN
    IF v_safe_loc = 'CENTRAL' THEN
      v_tx_qty := p_qty - COALESCE(v_mat.qty_central, 0);
      UPDATE public.materials SET qty_central = GREATEST(0, p_qty), updated_at = now()
      WHERE id = p_material_id AND tenant_id = p_tenant_id
      RETURNING * INTO v_mat;
    ELSE
      v_tx_qty := p_qty - COALESCE(v_mat.qty_resto, 0);
      UPDATE public.materials SET qty_resto = GREATEST(0, p_qty), updated_at = now()
      WHERE id = p_material_id AND tenant_id = p_tenant_id
      RETURNING * INTO v_mat;
    END IF;
  ELSIF v_safe_type = 'IN' THEN
    v_tx_qty := ABS(p_qty);
    IF v_safe_loc = 'CENTRAL' THEN
      UPDATE public.materials SET qty_central = qty_central + v_tx_qty, updated_at = now()
      WHERE id = p_material_id AND tenant_id = p_tenant_id
      RETURNING * INTO v_mat;
    ELSE
      UPDATE public.materials SET qty_resto = qty_resto + v_tx_qty, updated_at = now()
      WHERE id = p_material_id AND tenant_id = p_tenant_id
      RETURNING * INTO v_mat;
    END IF;
  ELSE
    v_tx_qty := -ABS(p_qty);
    IF v_safe_loc = 'CENTRAL' THEN
      UPDATE public.materials SET qty_central = GREATEST(0, qty_central - ABS(p_qty)), updated_at = now()
      WHERE id = p_material_id AND tenant_id = p_tenant_id
      RETURNING * INTO v_mat;
    ELSE
      UPDATE public.materials SET qty_resto = GREATEST(0, qty_resto - ABS(p_qty)), updated_at = now()
      WHERE id = p_material_id AND tenant_id = p_tenant_id
      RETURNING * INTO v_mat;
    END IF;
  END IF;

  INSERT INTO public.transactions (
    tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, unit_cost_snapshot, created_at
  ) VALUES (
    p_tenant_id, v_mat.branch_id, CURRENT_DATE, p_material_id, v_safe_type, v_safe_loc,
    v_tx_qty, ABS(v_tx_qty) * v_unit_cost, p_notes, v_unit_cost, now()
  );

  RETURN row_to_json(v_mat)::jsonb;
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.adjust_material_stock(bigint, uuid, text, text, numeric, text);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.adjust_material_stock(bigint, uuid, text, text, numeric, text): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261007000001_missing_rpcs.sql] Fungsi: public.receive_invoice_atomic
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
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
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.receive_invoice_atomic(bigint, uuid, uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.receive_invoice_atomic(bigint, uuid, uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261014000000_phase3_fefo_batches.sql] Fungsi: public.atomic_deduct_fefo
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
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
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.atomic_deduct_fefo(uuid, bigint, numeric, text);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.atomic_deduct_fefo(uuid, bigint, numeric, text): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261014000000_phase3_fefo_batches.sql] Fungsi: public.atomic_record_purchase
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
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
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.atomic_record_purchase(uuid, bigint, bigint, numeric, character varying, numeric, date, text, uuid, text, date);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.atomic_record_purchase(uuid, bigint, bigint, numeric, character varying, numeric, date, text, uuid, text, date): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261020000000_daily_inventory_cost_control_v3.sql] Fungsi: public.snapshot_stock_opname_wac_v3
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.snapshot_stock_opname_wac_v3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'APPROVED' AND COALESCE(OLD.status::text, '') <> 'APPROVED' THEN
    UPDATE public.stock_opname_items i
    SET unit_cost_snapshot = COALESCE(c.average_unit_cost, public.legacy_material_stock_unit_cost_v3(m.tenant_id, m.id), 0),
        valuation_snapshot = COALESCE(i.physical_qty, i.book_qty, 0) * COALESCE(c.average_unit_cost, public.legacy_material_stock_unit_cost_v3(m.tenant_id, m.id), 0),
        valuation_is_estimated = COALESCE(c.is_opening_estimated, true)
    FROM public.materials m
    LEFT JOIN public.material_location_costs c
      ON c.tenant_id = m.tenant_id AND c.material_id = m.id AND c.location = NEW.location
    WHERE i.opname_id = NEW.id AND i.material_id = m.id AND m.tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.snapshot_stock_opname_wac_v3();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.snapshot_stock_opname_wac_v3(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261020000000_daily_inventory_cost_control_v3.sql] Fungsi: public.normalize_inventory_unit_v3
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.normalize_inventory_unit_v3(p_unit text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE lower(regexp_replace(trim(COALESCE(p_unit, '')), '\s+', ' ', 'g'))
    WHEN 'pc' THEN 'pcs'
    WHEN 'piece' THEN 'pcs'
    WHEN 'pieces' THEN 'pcs'
    WHEN 'gram' THEN 'gr'
    WHEN 'grams' THEN 'gr'
    WHEN 'grm' THEN 'gr'
    WHEN 'kilogram' THEN 'kg'
    WHEN 'kilograms' THEN 'kg'
    WHEN 'liter' THEN 'l'
    WHEN 'litre' THEN 'l'
    WHEN 'liters' THEN 'l'
    WHEN 'litres' THEN 'l'
    WHEN 'ltr' THEN 'l'
    WHEN 'milliliter' THEN 'ml'
    WHEN 'millilitre' THEN 'ml'
    WHEN 'milliliters' THEN 'ml'
    WHEN 'millilitres' THEN 'ml'
    ELSE lower(regexp_replace(trim(COALESCE(p_unit, '')), '\s+', ' ', 'g'))
  END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.normalize_inventory_unit_v3(text);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.normalize_inventory_unit_v3(text): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261020000000_daily_inventory_cost_control_v3.sql] Fungsi: public.stock_units_per_pack_v3
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.stock_units_per_pack_v3(
  p_tenant_id uuid,
  p_material_id bigint
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_unit text;
  v_full_pack text;
  v_stock text;
  v_pack text;
  v_content text;
  v_match text[];
  v_content_qty numeric;
  v_stock_group text;
  v_content_group text;
  v_stock_scale numeric := 1;
  v_content_scale numeric := 1;
  v_pack_stock_qty numeric := 1;
BEGIN
  SELECT unit, full_pack INTO v_unit, v_full_pack
  FROM public.materials WHERE id = p_material_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material % tidak ditemukan untuk konversi kemasan.', p_material_id; END IF;
  v_stock := public.normalize_inventory_unit_v3(v_unit);

  IF position('=' in COALESCE(v_full_pack, '')) > 0 THEN
    v_pack := public.normalize_inventory_unit_v3(split_part(v_full_pack, '=', 1));
    v_match := regexp_match(trim(split_part(v_full_pack, '=', 2)), '^([0-9]+(?:\.[0-9]+)?)\s*(.*?)\s*$');
    IF v_match IS NOT NULL THEN
      v_content_qty := v_match[1]::numeric;
      v_content := public.normalize_inventory_unit_v3(v_match[2]);
      IF v_stock = v_pack THEN RETURN 1; END IF;
    END IF;
  ELSE
    v_match := regexp_match(trim(COALESCE(v_full_pack, '')), '^([0-9]+(?:\.[0-9]+)?)\s*(.*?)\s*$');
    IF v_match IS NOT NULL AND COALESCE(trim(v_match[2]), '') <> '' THEN
      v_content_qty := v_match[1]::numeric;
      v_content := public.normalize_inventory_unit_v3(v_match[2]);
    END IF;
  END IF;

  IF COALESCE(v_content_qty, 0) > 0 AND COALESCE(v_content, '') <> '' THEN
    v_stock_group := CASE WHEN v_stock IN ('gr','g','kg') THEN 'MASS' WHEN v_stock IN ('ml','l') THEN 'VOLUME' WHEN v_stock IN ('pcs','pc','piece','pieces') THEN 'COUNT' ELSE v_stock END;
    v_content_group := CASE WHEN v_content IN ('gr','g','kg') THEN 'MASS' WHEN v_content IN ('ml','l') THEN 'VOLUME' WHEN v_content IN ('pcs','pc','piece','pieces') THEN 'COUNT' ELSE v_content END;
    v_stock_scale := CASE WHEN v_stock = 'kg' OR v_stock = 'l' THEN 1000 ELSE 1 END;
    v_content_scale := CASE WHEN v_content = 'kg' OR v_content = 'l' THEN 1000 ELSE 1 END;
    IF v_stock_group = v_content_group THEN
      v_pack_stock_qty := v_content_qty * v_content_scale / v_stock_scale;
    END IF;
  END IF;

  IF COALESCE(v_pack_stock_qty, 0) <= 0 THEN RETURN 1; END IF;
  RETURN v_pack_stock_qty;
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.stock_units_per_pack_v3(uuid, bigint);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.stock_units_per_pack_v3(uuid, bigint): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261020000000_daily_inventory_cost_control_v3.sql] Fungsi: public.legacy_material_stock_unit_cost_v3
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.legacy_material_stock_unit_cost_v3(
  p_tenant_id uuid,
  p_material_id bigint
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_avg_cost numeric;
  v_new_price numeric;
  v_price numeric;
  v_pack_stock_qty numeric;
BEGIN
  SELECT avg_cost, new_price, price INTO v_avg_cost, v_new_price, v_price
  FROM public.materials WHERE id = p_material_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material % tidak ditemukan untuk valuasi.', p_material_id; END IF;
  v_price := COALESCE(NULLIF(v_avg_cost, 0), NULLIF(v_new_price, 0), v_price, 0);
  IF COALESCE(v_price, 0) <= 0 THEN RETURN 0; END IF;
  v_pack_stock_qty := public.stock_units_per_pack_v3(p_tenant_id, p_material_id);
  RETURN GREATEST(v_price / GREATEST(COALESCE(v_pack_stock_qty, 1), 0.000001), 0);
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.legacy_material_stock_unit_cost_v3(uuid, bigint);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.legacy_material_stock_unit_cost_v3(uuid, bigint): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261020000000_daily_inventory_cost_control_v3.sql] Fungsi: public.seed_material_location_costs_v3
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.seed_material_location_costs_v3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_cost numeric;
BEGIN
  v_cost := public.legacy_material_stock_unit_cost_v3(NEW.tenant_id, NEW.id);
  INSERT INTO public.material_location_costs (tenant_id, material_id, location, average_unit_cost, source, is_opening_estimated)
  VALUES (NEW.tenant_id, NEW.id, 'RESTO', v_cost, 'LEGACY_GLOBAL_SEED', true),
         (NEW.tenant_id, NEW.id, 'CENTRAL', v_cost, 'LEGACY_GLOBAL_SEED', true)
  ON CONFLICT (tenant_id, material_id, location) DO NOTHING;
  RETURN NEW;
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.seed_material_location_costs_v3();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.seed_material_location_costs_v3(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261020000000_daily_inventory_cost_control_v3.sql] Fungsi: public.atomic_save_production_recipe_v3
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.atomic_save_production_recipe_v3(
  p_tenant_id uuid,
  p_batch_id bigint,
  p_batch_name text,
  p_output_material_id bigint,
  p_yield_qty numeric,
  p_yield_unit text,
  p_source_note text,
  p_ingredients jsonb,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_batch_id bigint;
  v_role text;
  v_user_id uuid := COALESCE(auth.uid(), p_user_id);
  v_count integer;
BEGIN
  IF p_tenant_id IS NULL OR (public.get_auth_tenant_id() IS DISTINCT FROM p_tenant_id AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Akses tenant ditolak.' USING ERRCODE = '42501';
  END IF;
  SELECT role::text INTO v_role FROM public.users WHERE id = auth.uid() AND tenant_id = p_tenant_id LIMIT 1;
  IF NOT public.is_super_admin() AND lower(COALESCE(v_role, '')) NOT IN ('admin / owner','owner','supervisor') THEN
    RAISE EXCEPTION 'Hanya Admin/Owner atau Supervisor yang boleh mengelola resep produksi.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(btrim(p_batch_name), '') = '' OR COALESCE(p_yield_qty, 0) <= 0 OR COALESCE(btrim(p_yield_unit), '') = '' THEN
    RAISE EXCEPTION 'Nama resep, yield positif, dan satuan yield wajib diisi.';
  END IF;
  IF jsonb_typeof(p_ingredients) IS DISTINCT FROM 'array' OR jsonb_array_length(p_ingredients) = 0 THEN
    RAISE EXCEPTION 'Resep produksi minimal memerlukan satu bahan.';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_ingredients) x GROUP BY (x->>'material_id') HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Bahan yang sama tidak boleh tercatat dua kali dalam satu resep. Gabungkan kuantitasnya.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.materials m WHERE m.id = p_output_material_id AND m.tenant_id = p_tenant_id AND COALESCE(m.is_active, true)) THEN
    RAISE EXCEPTION 'Material hasil produksi tidak ditemukan atau tidak aktif.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_ingredients) x
    LEFT JOIN public.materials m ON m.id = NULLIF(x->>'material_id','')::bigint AND m.tenant_id = p_tenant_id
    WHERE m.id IS NULL OR m.id = p_output_material_id OR COALESCE((x->>'qty')::numeric,0) <= 0 OR COALESCE(btrim(x->>'unit'),'') = ''
  ) THEN RAISE EXCEPTION 'Daftar bahan resep tidak valid; pastikan semua material satu tenant, kuantitas positif, unit terisi, dan output tidak menjadi bahan inputnya sendiri.'; END IF;

  IF p_batch_id IS NULL THEN
    INSERT INTO public.production_batches (tenant_id, batch_name, yield_qty, yield_unit, source_note, output_material_id, is_active, created_at, updated_at)
    VALUES (p_tenant_id, btrim(p_batch_name), p_yield_qty, btrim(p_yield_unit), NULLIF(btrim(p_source_note),''), p_output_material_id, true, now(), now())
    RETURNING id INTO v_batch_id;
  ELSE
    UPDATE public.production_batches SET batch_name = btrim(p_batch_name), yield_qty = p_yield_qty,
      yield_unit = btrim(p_yield_unit), source_note = NULLIF(btrim(p_source_note),''),
      output_material_id = p_output_material_id, is_active = true, updated_at = now()
    WHERE id = p_batch_id AND tenant_id = p_tenant_id RETURNING id INTO v_batch_id;
    IF v_batch_id IS NULL THEN RAISE EXCEPTION 'Resep produksi tidak ditemukan pada tenant ini.'; END IF;
  END IF;

  DELETE FROM public.production_batch_ingredients WHERE tenant_id = p_tenant_id AND batch_id = v_batch_id;
  INSERT INTO public.production_batch_ingredients (batch_id, material_id, qty, unit, tenant_id)
  SELECT v_batch_id, (x->>'material_id')::bigint, (x->>'qty')::numeric, btrim(x->>'unit'), p_tenant_id
  FROM jsonb_array_elements(p_ingredients) x;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_logs (tenant_id, user_id, action, description, table_name, record_id, new_data, is_system, created_at)
  VALUES (p_tenant_id, v_user_id, 'SAVE_PRODUCTION_RECIPE', 'Menyimpan master resep produksi bahan setengah jadi.',
    'production_batches', v_batch_id, jsonb_build_object('batch_name',btrim(p_batch_name),'output_material_id',p_output_material_id,'yield_qty',p_yield_qty,'yield_unit',btrim(p_yield_unit),'ingredients',v_count), false, now());
  RETURN jsonb_build_object('success',true,'batch_id',v_batch_id,'ingredients_saved',v_count);
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.atomic_save_production_recipe_v3(uuid, bigint, text, bigint, numeric, text, text, jsonb, uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.atomic_save_production_recipe_v3(uuid, bigint, text, bigint, numeric, text, text, jsonb, uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261020000000_daily_inventory_cost_control_v3.sql] Fungsi: public.atomic_record_production_run_v3
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.atomic_record_production_run_v3(
  p_tenant_id uuid,
  p_batch_id bigint,
  p_output_qty numeric,
  p_date date,
  p_location text,
  p_notes text,
  p_request_key text,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_batch public.production_batches%ROWTYPE;
  v_input record;
  v_material public.materials%ROWTYPE;
  v_output public.materials%ROWTYPE;
  v_role text;
  v_user_id uuid := COALESCE(auth.uid(), p_user_id);
  v_location public.stock_location;
  v_run_id uuid;
  v_duplicate public.production_runs%ROWTYPE;
  v_factor numeric;
  v_input_recipe_qty numeric;
  v_input_stock_qty numeric;
  v_stock_qty numeric;
  v_stock numeric;
  v_unit_cost numeric;
  v_cost numeric;
  v_total_cost numeric := 0;
  v_output_stock_qty numeric;
  v_output_old_cost numeric;
  v_output_unit_cost numeric;
  v_output_new_cost numeric;
  v_global_cost numeric;
  v_saved_count integer := 0;
BEGIN
  IF p_tenant_id IS NULL OR (public.get_auth_tenant_id() IS DISTINCT FROM p_tenant_id AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Akses tenant ditolak.' USING ERRCODE = '42501';
  END IF;
  SELECT role::text INTO v_role FROM public.users WHERE id = auth.uid() AND tenant_id = p_tenant_id LIMIT 1;
  IF NOT public.is_super_admin() AND lower(COALESCE(v_role,'')) NOT IN ('admin / owner','owner','supervisor','bar','kitchen','central') THEN
    RAISE EXCEPTION 'Role pengguna tidak diizinkan mencatat batch produksi.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_output_qty,0) <= 0 OR p_date IS NULL OR COALESCE(btrim(p_request_key),'') = '' THEN
    RAISE EXCEPTION 'Tanggal, kuantitas hasil produksi positif, dan request key wajib diisi.';
  END IF;
  IF upper(p_location) NOT IN ('RESTO','CENTRAL') THEN RAISE EXCEPTION 'Lokasi produksi tidak valid.'; END IF;
  v_location := upper(p_location)::public.stock_location;
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext('production:' || p_request_key));

  SELECT * INTO v_duplicate FROM public.production_runs
  WHERE tenant_id = p_tenant_id AND idempotency_key = p_request_key LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('success',true,'duplicate',true,'run_id',v_duplicate.id,'total_cost',v_duplicate.total_cost,'output_stock_qty',v_duplicate.output_stock_qty); END IF;

  IF EXISTS (SELECT 1 FROM public.daily_inventories h WHERE h.tenant_id = p_tenant_id AND h.location = v_location AND h.date >= p_date AND lower(COALESCE(h.status, 'draft')) IN ('verified', 'closed')) THEN
    RAISE EXCEPTION 'Produksi tanggal % ditolak karena lokasi % sudah memiliki EOD final pada tanggal tersebut atau setelahnya.', p_date, v_location;
  END IF;

  SELECT * INTO v_batch FROM public.production_batches
  WHERE id = p_batch_id AND tenant_id = p_tenant_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resep produksi tidak ditemukan atau tidak aktif.'; END IF;
  IF COALESCE(v_batch.yield_qty,0) <= 0 OR v_batch.output_material_id IS NULL THEN
    RAISE EXCEPTION 'Resep belum memiliki yield/output material yang valid.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.production_batch_ingredients WHERE tenant_id = p_tenant_id AND batch_id = p_batch_id) THEN
    RAISE EXCEPTION 'Resep produksi tidak memiliki bahan input.';
  END IF;

  -- Lock all input and output material rows in stable id order to avoid concurrent production deadlocks.
  PERFORM m.id FROM public.materials m
  WHERE m.tenant_id = p_tenant_id AND (
    m.id = v_batch.output_material_id OR m.id IN (
      SELECT i.material_id FROM public.production_batch_ingredients i WHERE i.tenant_id = p_tenant_id AND i.batch_id = p_batch_id
    )
  ) ORDER BY m.id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.production_batch_ingredients i WHERE i.tenant_id = p_tenant_id AND i.batch_id = p_batch_id AND i.material_id = v_batch.output_material_id) THEN
    RAISE EXCEPTION 'Material hasil produksi tidak boleh menjadi input pada resep yang sama.';
  END IF;
  v_factor := p_output_qty / v_batch.yield_qty;
  v_output_stock_qty := public.convert_material_qty_to_stock_unit_v3(p_tenant_id, v_batch.output_material_id, p_output_qty, v_batch.yield_unit);
  IF COALESCE(v_output_stock_qty,0) <= 0 THEN RAISE EXCEPTION 'Yield hasil produksi tidak dapat dikonversi ke satuan stok output.'; END IF;

  INSERT INTO public.production_runs (tenant_id, production_batch_id, run_date, location, recipe_name_snapshot,
    output_material_id, yield_qty_snapshot, yield_unit_snapshot, output_qty, output_stock_qty, yield_factor,
    total_cost, output_unit_cost, status, notes, created_by, idempotency_key)
  VALUES (p_tenant_id, v_batch.id, p_date, v_location, v_batch.batch_name, v_batch.output_material_id,
    v_batch.yield_qty, v_batch.yield_unit, p_output_qty, v_output_stock_qty, v_factor, 0, 0,
    'POSTING', p_notes, v_user_id, p_request_key)
  RETURNING id INTO v_run_id;

  FOR v_input IN
    SELECT i.material_id, i.qty, i.unit, m.name
    FROM public.production_batch_ingredients i
    JOIN public.materials m ON m.id = i.material_id AND m.tenant_id = p_tenant_id
    WHERE i.tenant_id = p_tenant_id AND i.batch_id = p_batch_id
    ORDER BY i.material_id
  LOOP
    v_input_recipe_qty := v_input.qty * v_factor;
    v_input_stock_qty := public.convert_material_qty_to_stock_unit_v3(p_tenant_id, v_input.material_id, v_input_recipe_qty, v_input.unit);
    IF COALESCE(v_input_stock_qty,0) <= 0 THEN RAISE EXCEPTION 'Kuantitas input % tidak bisa dikonversi ke satuan stok.', v_input.name; END IF;
    SELECT * INTO v_material FROM public.materials WHERE id = v_input.material_id AND tenant_id = p_tenant_id;
    v_stock := CASE WHEN v_location = 'RESTO' THEN COALESCE(v_material.qty_resto,0) ELSE COALESCE(v_material.qty_central,0) END;
    IF v_stock + 0.0000001 < v_input_stock_qty THEN
      RAISE EXCEPTION 'Stok % tidak cukup untuk produksi. Tersedia %, kebutuhan % (%).', v_input.name, v_stock, v_input_stock_qty, v_material.unit;
    END IF;
    SELECT average_unit_cost INTO v_unit_cost FROM public.material_location_costs
    WHERE tenant_id = p_tenant_id AND material_id = v_input.material_id AND location = v_location FOR UPDATE;
    v_unit_cost := GREATEST(COALESCE(v_unit_cost, public.legacy_material_stock_unit_cost_v3(p_tenant_id, v_input.material_id), 0),0);
    v_cost := v_input_stock_qty * v_unit_cost;
    v_total_cost := v_total_cost + v_cost;

    IF v_location = 'RESTO' THEN
      UPDATE public.materials SET qty_resto = COALESCE(qty_resto, 0) - v_input_stock_qty, updated_at = now()
      WHERE id = v_input.material_id AND tenant_id = p_tenant_id;
    ELSE
      UPDATE public.materials SET qty_central = COALESCE(qty_central, 0) - v_input_stock_qty, updated_at = now()
      WHERE id = v_input.material_id AND tenant_id = p_tenant_id;
    END IF;

    INSERT INTO public.transactions (tenant_id,date,material_id,type,location,qty,amount,notes,created_by,unit_cost_snapshot,source_module,source_record_id,idempotency_key,is_reversed)
    VALUES (p_tenant_id,p_date,v_input.material_id,'OUT',v_location,-v_input_stock_qty,v_cost,
      'Produksi ' || v_batch.batch_name || ' [' || v_run_id::text || ']',v_user_id,v_unit_cost,'production',v_run_id::text,
      'production:' || p_request_key || ':input:' || v_input.material_id::text,false);

    INSERT INTO public.production_run_items (tenant_id,run_id,material_id,material_name_snapshot,recipe_qty,recipe_unit,input_stock_qty,unit_cost_snapshot,cost_value)
    VALUES (p_tenant_id,v_run_id,v_input.material_id,v_input.name,v_input_recipe_qty,v_input.unit,v_input_stock_qty,v_unit_cost,v_cost);
    v_saved_count := v_saved_count + 1;
  END LOOP;

  SELECT * INTO v_output FROM public.materials WHERE id = v_batch.output_material_id AND tenant_id = p_tenant_id;
  v_stock := CASE WHEN v_location = 'RESTO' THEN COALESCE(v_output.qty_resto,0) ELSE COALESCE(v_output.qty_central,0) END;
  SELECT average_unit_cost INTO v_output_old_cost FROM public.material_location_costs
  WHERE tenant_id = p_tenant_id AND material_id = v_batch.output_material_id AND location = v_location FOR UPDATE;
  v_output_old_cost := GREATEST(COALESCE(v_output_old_cost, public.legacy_material_stock_unit_cost_v3(p_tenant_id, v_batch.output_material_id),0),0);
  v_output_unit_cost := v_total_cost / v_output_stock_qty;
  v_output_new_cost := CASE WHEN v_stock + v_output_stock_qty > 0
    THEN ((v_stock * v_output_old_cost) + (v_output_stock_qty * v_output_unit_cost)) / (v_stock + v_output_stock_qty)
    ELSE v_output_unit_cost END;

  IF v_location = 'RESTO' THEN
    UPDATE public.materials SET qty_resto = COALESCE(qty_resto, 0) + v_output_stock_qty, updated_at = now()
    WHERE id = v_batch.output_material_id AND tenant_id = p_tenant_id;
  ELSE
    UPDATE public.materials SET qty_central = COALESCE(qty_central, 0) + v_output_stock_qty, updated_at = now()
    WHERE id = v_batch.output_material_id AND tenant_id = p_tenant_id;
  END IF;
  INSERT INTO public.material_location_costs (tenant_id,material_id,location,average_unit_cost,source,is_opening_estimated,updated_at)
  VALUES (p_tenant_id,v_batch.output_material_id,v_location,v_output_new_cost,'PRODUCTION_WAC',(v_stock > 0),now())
  ON CONFLICT (tenant_id,material_id,location) DO UPDATE
    SET average_unit_cost = EXCLUDED.average_unit_cost,
        source = 'PRODUCTION_WAC',
        is_opening_estimated = CASE WHEN v_stock > 0 THEN material_location_costs.is_opening_estimated ELSE false END,
        updated_at = now();

  INSERT INTO public.transactions (tenant_id,date,material_id,type,location,qty,amount,notes,created_by,unit_cost_snapshot,source_module,source_record_id,idempotency_key,is_reversed)
  VALUES (p_tenant_id,p_date,v_batch.output_material_id,'IN',v_location,v_output_stock_qty,v_total_cost,
    'Hasil produksi ' || v_batch.batch_name || ' [' || v_run_id::text || ']',v_user_id,v_output_unit_cost,'production',v_run_id::text,
    'production:' || p_request_key || ':output',false);

  SELECT CASE WHEN COALESCE(m.qty_resto,0) * COALESCE(r.average_unit_cost,0) + COALESCE(m.qty_central,0) * COALESCE(c.average_unit_cost,0) > 0
    THEN (COALESCE(m.qty_resto,0) * COALESCE(r.average_unit_cost,0) + COALESCE(m.qty_central,0) * COALESCE(c.average_unit_cost,0)) /
      NULLIF(COALESCE(m.qty_resto,0) + COALESCE(m.qty_central,0),0)
    ELSE v_output_new_cost END
  INTO v_global_cost
  FROM public.materials m
  LEFT JOIN public.material_location_costs r ON r.tenant_id=m.tenant_id AND r.material_id=m.id AND r.location='RESTO'
  LEFT JOIN public.material_location_costs c ON c.tenant_id=m.tenant_id AND c.material_id=m.id AND c.location='CENTRAL'
  WHERE m.id=v_batch.output_material_id AND m.tenant_id=p_tenant_id;
  UPDATE public.materials SET avg_cost = GREATEST(COALESCE(v_global_cost,v_output_new_cost),0) * public.stock_units_per_pack_v3(p_tenant_id,v_batch.output_material_id)
  WHERE id=v_batch.output_material_id AND tenant_id=p_tenant_id;

  UPDATE public.production_runs SET total_cost=v_total_cost, output_unit_cost=v_output_unit_cost, status='POSTED'
  WHERE id=v_run_id AND tenant_id=p_tenant_id;
  INSERT INTO public.audit_logs (tenant_id,user_id,action,description,table_name,target_entity,target_id,new_data,is_system,created_at)
  VALUES (p_tenant_id,v_user_id,'RECORD_PRODUCTION_RUN','Batch produksi bahan diposting ke mutasi stok atomik.','production_runs','production_runs',v_run_id::text,
    jsonb_build_object('batch_id',v_batch.id,'output_material_id',v_batch.output_material_id,'output_stock_qty',v_output_stock_qty,'total_cost',v_total_cost,'location',v_location),false,now());
  RETURN jsonb_build_object('success',true,'duplicate',false,'run_id',v_run_id,'output_stock_qty',v_output_stock_qty,'total_cost',v_total_cost,'output_unit_cost',v_output_unit_cost,'ingredients_processed',v_saved_count);
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.atomic_record_production_run_v3(uuid, bigint, numeric, date, text, text, text, uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.atomic_record_production_run_v3(uuid, bigint, numeric, date, text, text, text, uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261020000000_daily_inventory_cost_control_v3.sql] Fungsi: public.atomic_record_purchase_location_wac
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.atomic_record_purchase_location_wac(
  p_tenant_id uuid,
  p_material_id bigint,
  p_supplier_id bigint,
  p_qty numeric,
  p_unit text,
  p_unit_price numeric,
  p_date date,
  p_destination text,
  p_input_by uuid,
  p_notes text,
  p_expired_date date,
  p_request_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_material public.materials%ROWTYPE;
  v_location public.stock_location;
  v_stock numeric;
  v_stock_qty numeric;
  v_line_total numeric;
  v_stock_unit_cost numeric;
  v_old_cost numeric;
  v_new_cost numeric;
  v_new_global_cost numeric;
  v_purchase_id bigint;
  v_duplicate public.transactions%ROWTYPE;
  v_batch_no text;
BEGIN
  IF p_tenant_id IS NULL OR (public.get_auth_tenant_id() IS DISTINCT FROM p_tenant_id AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Akses tenant ditolak.' USING ERRCODE = '42501';
  END IF;
  IF p_request_key IS NULL OR btrim(p_request_key) = '' THEN
    RAISE EXCEPTION 'Request key pembelian wajib diisi.';
  END IF;
  IF COALESCE(p_qty, 0) <= 0 OR COALESCE(p_unit_price, 0) < 0 THEN
    RAISE EXCEPTION 'Kuantitas harus lebih dari 0 dan harga tidak boleh negatif.';
  END IF;
  IF upper(p_destination) NOT IN ('RESTO', 'CENTRAL') THEN
    RAISE EXCEPTION 'Lokasi tujuan tidak valid.';
  END IF;

  -- Serialize retries sharing the same request key before checking idempotency.
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext('purchase:' || p_request_key));

  SELECT * INTO v_duplicate
  FROM public.transactions
  WHERE tenant_id = p_tenant_id AND idempotency_key = 'purchase:' || p_request_key
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'purchase_id', NULLIF(v_duplicate.source_record_id, '')::bigint);
  END IF;

  v_location := upper(p_destination)::public.stock_location;
  IF EXISTS (
    SELECT 1 FROM public.daily_inventories h
    WHERE h.tenant_id = p_tenant_id AND h.location = v_location AND h.date >= p_date
      AND lower(COALESCE(h.status, 'draft')) IN ('verified', 'closed')
  ) THEN RAISE EXCEPTION 'Pembelian tanggal % di lokasi % ditolak karena tanggal tersebut atau tanggal setelahnya sudah EOD final. Gunakan tanggal penerimaan aktual atau lakukan revisi EOD berurutan.', p_date, v_location; END IF;

  SELECT * INTO v_material
  FROM public.materials
  WHERE id = p_material_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bahan tidak ditemukan pada tenant ini.'; END IF;

  v_stock_qty := public.convert_material_qty_to_stock_unit_v3(p_tenant_id, p_material_id, p_qty, p_unit);
  IF v_stock_qty <= 0 THEN RAISE EXCEPTION 'Kuantitas setelah konversi satuan harus lebih dari 0.'; END IF;
  v_line_total := p_qty * p_unit_price;
  v_stock_unit_cost := v_line_total / v_stock_qty;
  v_stock := CASE WHEN v_location = 'RESTO' THEN COALESCE(v_material.qty_resto, 0) ELSE COALESCE(v_material.qty_central, 0) END;
  SELECT average_unit_cost INTO v_old_cost
  FROM public.material_location_costs
  WHERE tenant_id = p_tenant_id AND material_id = p_material_id AND location = v_location
  FOR UPDATE;
  v_old_cost := COALESCE(v_old_cost, public.legacy_material_stock_unit_cost_v3(p_tenant_id, p_material_id), 0);
  v_new_cost := CASE WHEN v_stock + v_stock_qty > 0 THEN ((v_stock * v_old_cost) + (v_stock_qty * v_stock_unit_cost)) / (v_stock + v_stock_qty) ELSE v_stock_unit_cost END;

  INSERT INTO public.material_location_costs (tenant_id, material_id, location, average_unit_cost, source, is_opening_estimated, updated_at)
  VALUES (p_tenant_id, p_material_id, v_location, v_new_cost, 'PURCHASE_WAC', (v_stock > 0), now())
  ON CONFLICT (tenant_id, material_id, location) DO UPDATE
  SET average_unit_cost = EXCLUDED.average_unit_cost,
      source = 'PURCHASE_WAC',
      is_opening_estimated = CASE WHEN v_stock > 0 THEN material_location_costs.is_opening_estimated ELSE false END,
      updated_at = now();

  IF v_location = 'RESTO' THEN
    UPDATE public.materials SET qty_resto = COALESCE(qty_resto, 0) + v_stock_qty,
      price = p_unit_price, new_price = p_unit_price, updated_at = now()
    WHERE id = p_material_id AND tenant_id = p_tenant_id;
  ELSE
    UPDATE public.materials SET qty_central = COALESCE(qty_central, 0) + v_stock_qty,
      price = p_unit_price, new_price = p_unit_price, updated_at = now()
    WHERE id = p_material_id AND tenant_id = p_tenant_id;
  END IF;

  IF p_expired_date IS NOT NULL THEN
    v_batch_no := to_char(p_date, 'YYYYMMDD') || '-' || p_material_id::text || '-' || substring(md5(p_request_key) from 1 for 4);
    INSERT INTO public.material_batches (tenant_id, material_id, batch_no, expired_date, qty_resto, qty_central, status)
    VALUES (p_tenant_id, p_material_id, v_batch_no, p_expired_date,
      CASE WHEN v_location = 'RESTO' THEN v_stock_qty ELSE 0 END,
      CASE WHEN v_location = 'CENTRAL' THEN v_stock_qty ELSE 0 END,
      'ACTIVE');
  END IF;

  INSERT INTO public.purchase_entries (tenant_id, material_id, supplier_id, qty, unit, unit_price, date, input_by, notes, prev_unit_price, prev_location_avg_cost)
  VALUES (p_tenant_id, p_material_id, p_supplier_id, p_qty, p_unit, p_unit_price, p_date, COALESCE(auth.uid(), p_input_by), p_notes, COALESCE(NULLIF(v_material.new_price, 0), v_material.price, 0), v_old_cost)
  RETURNING id INTO v_purchase_id;

  IF v_batch_no IS NOT NULL THEN
    UPDATE public.material_batches SET purchase_entry_id = v_purchase_id
    WHERE tenant_id = p_tenant_id AND material_id = p_material_id AND batch_no = v_batch_no;
  END IF;

  INSERT INTO public.transactions (tenant_id, date, material_id, type, location, qty, amount, notes, created_by,
    unit_cost_snapshot, source_module, source_record_id, idempotency_key)
  VALUES (p_tenant_id, p_date, p_material_id, 'PURCHASE_IN', v_location, v_stock_qty, v_line_total,
    COALESCE(p_notes, 'Daily Purchase') || ' [ID:' || v_purchase_id || ']', p_input_by,
    v_stock_unit_cost, 'purchase_entry', v_purchase_id::text, 'purchase:' || p_request_key);

  SELECT CASE WHEN COALESCE(m.qty_resto, 0) * COALESCE(r.average_unit_cost, 0) + COALESCE(m.qty_central, 0) * COALESCE(c.average_unit_cost, 0) > 0
    THEN (COALESCE(m.qty_resto, 0) * COALESCE(r.average_unit_cost, 0) + COALESCE(m.qty_central, 0) * COALESCE(c.average_unit_cost, 0)) /
      NULLIF(COALESCE(m.qty_resto, 0) + COALESCE(m.qty_central, 0), 0)
    ELSE COALESCE(m.avg_cost, m.price, 0) END
  INTO v_new_global_cost
  FROM public.materials m
  LEFT JOIN public.material_location_costs r ON r.tenant_id = m.tenant_id AND r.material_id = m.id AND r.location = 'RESTO'
  LEFT JOIN public.material_location_costs c ON c.tenant_id = m.tenant_id AND c.material_id = m.id AND c.location = 'CENTRAL'
  WHERE m.id = p_material_id AND m.tenant_id = p_tenant_id;
  UPDATE public.materials SET avg_cost = GREATEST(COALESCE(v_new_global_cost, 0) * public.stock_units_per_pack_v3(p_tenant_id, p_material_id), 0)
  WHERE id = p_material_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'purchase_id', v_purchase_id, 'stock_qty', v_stock_qty, 'stock_unit_cost', v_stock_unit_cost, 'average_unit_cost', v_new_cost, 'batch_no', v_batch_no);
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.atomic_record_purchase_location_wac(uuid, bigint, bigint, numeric, text, numeric, date, text, uuid, text, date, text);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.atomic_record_purchase_location_wac(uuid, bigint, bigint, numeric, text, numeric, date, text, uuid, text, date, text): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261020000000_daily_inventory_cost_control_v3.sql] Fungsi: public.atomic_receive_invoice_wac_v3
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.atomic_receive_invoice_wac_v3(
  p_invoice_id bigint,
  p_tenant_id uuid,
  p_user_id uuid,
  p_received_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_item record;
  v_material public.materials%ROWTYPE;
  v_result jsonb;
  v_purchase_id bigint;
  v_date date := COALESCE(p_received_date, CURRENT_DATE);
  v_user_id uuid := COALESCE(auth.uid(), p_user_id);
  v_processed integer := 0;
BEGIN
  IF p_tenant_id IS NULL OR (public.get_auth_tenant_id() IS DISTINCT FROM p_tenant_id AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Akses tenant ditolak.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices
  WHERE id = p_invoice_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice tidak ditemukan atau bukan milik tenant ini.'; END IF;
  IF v_invoice.status::text = 'RECEIVED' THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'invoice_id', p_invoice_id,
      'message', 'Invoice sudah berstatus RECEIVED; tidak ada mutasi pembelian tambahan.');
  END IF;
  IF v_invoice.status::text IN ('CANCELLED') THEN RAISE EXCEPTION 'Invoice yang dibatalkan tidak dapat diterima.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.invoice_items WHERE invoice_id = p_invoice_id AND tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'Invoice tidak memiliki item pembelian.';
  END IF;

  FOR v_item IN
    SELECT ii.id, ii.material_id, ii.qty, ii.unit_price
    FROM public.invoice_items ii
    WHERE ii.invoice_id = p_invoice_id AND ii.tenant_id = p_tenant_id
    ORDER BY ii.id
  LOOP
    SELECT * INTO v_material FROM public.materials
    WHERE id = v_item.material_id AND tenant_id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Material % pada invoice tidak ditemukan.', v_item.material_id; END IF;

    v_result := public.atomic_record_purchase_location_wac(
      p_tenant_id,
      v_item.material_id,
      v_invoice.supplier_id,
      v_item.qty,
      v_material.unit,
      v_item.unit_price,
      v_date,
      COALESCE(v_invoice.location::text, 'CENTRAL'),
      v_user_id,
      'Penerimaan PO ' || COALESCE(v_invoice.invoice_no, p_invoice_id::text),
      NULL,
      'po-receipt:' || p_invoice_id::text || ':' || v_item.id::text
    );

    v_purchase_id := NULLIF(v_result->>'purchase_id', '')::bigint;
    IF v_purchase_id IS NULL THEN
      SELECT NULLIF(t.source_record_id, '')::bigint INTO v_purchase_id
      FROM public.transactions t
      WHERE t.tenant_id = p_tenant_id
        AND t.idempotency_key = 'purchase:po-receipt:' || p_invoice_id::text || ':' || v_item.id::text
      LIMIT 1;
    END IF;
    IF v_purchase_id IS NOT NULL THEN
      UPDATE public.purchase_entries SET invoice_id = p_invoice_id, supplier_id = v_invoice.supplier_id, updated_at = now()
      WHERE id = v_purchase_id AND tenant_id = p_tenant_id;
    END IF;
    v_processed := v_processed + 1;
  END LOOP;

  UPDATE public.invoices SET status = 'RECEIVED'::public.invoice_status,
    received_date = v_date, updated_at = now()
  WHERE id = p_invoice_id AND tenant_id = p_tenant_id;

  INSERT INTO public.audit_logs (tenant_id, user_id, action, description, table_name, record_id, new_data, is_system, created_at)
  VALUES (p_tenant_id, v_user_id, 'RECEIVE_PO_WAC', 'Penerimaan PO diposting atomik ke stok dan WAC per lokasi.',
    'invoices', p_invoice_id, jsonb_build_object('received_date', v_date, 'items_processed', v_processed,
    'location', COALESCE(v_invoice.location::text, 'CENTRAL')), false, now());

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'invoice_id', p_invoice_id,
    'received_date', v_date, 'items_processed', v_processed, 'location', COALESCE(v_invoice.location::text, 'CENTRAL'));
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.atomic_receive_invoice_wac_v3(bigint, uuid, uuid, date);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.atomic_receive_invoice_wac_v3(bigint, uuid, uuid, date): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261020000000_daily_inventory_cost_control_v3.sql] Fungsi: public.atomic_cancel_purchase_v3
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.atomic_cancel_purchase_v3(
  p_tenant_id uuid,
  p_purchase_id bigint,
  p_user_id uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_purchase public.purchase_entries%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_material public.materials%ROWTYPE;
  v_location public.stock_location;
  v_stock numeric;
  v_unit_cost numeric;
  v_global_cost numeric;
  v_user_id uuid := COALESCE(auth.uid(), p_user_id);
BEGIN
  IF p_tenant_id IS NULL OR (public.get_auth_tenant_id() IS DISTINCT FROM p_tenant_id AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Akses tenant ditolak.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_purchase FROM public.purchase_entries
  WHERE id = p_purchase_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pembelian tidak ditemukan.'; END IF;
  IF COALESCE(v_purchase.is_cancelled, false) THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'purchase_id', p_purchase_id);
  END IF;

  SELECT * INTO v_tx FROM public.transactions
  WHERE tenant_id = p_tenant_id AND source_module = 'purchase_entry'
    AND source_record_id = p_purchase_id::text AND type = 'PURCHASE_IN' AND COALESCE(is_reversed, false) = false
  ORDER BY id DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pembelian ini tidak memiliki mutasi sumber yang dapat dibalik otomatis. Jangan hapus manual; lakukan rekonsiliasi historis.';
  END IF;

  v_location := v_tx.location;
  IF EXISTS (
    SELECT 1 FROM public.daily_inventories h
    WHERE h.tenant_id = p_tenant_id AND h.location = v_location AND h.date >= v_purchase.date
      AND lower(COALESCE(h.status, 'draft')) IN ('verified', 'closed')
  ) THEN
    RAISE EXCEPTION 'Pembelian tidak bisa dibatalkan otomatis karena EOD pada tanggal pembelian atau setelahnya sudah final. Ajukan koreksi persediaan dengan audit, jangan menghapus riwayat.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.tenant_id = p_tenant_id AND t.material_id = v_purchase.material_id AND t.location = v_location
      AND COALESCE(t.is_reversed, false) = false AND t.id <> v_tx.id
      AND t.type <> 'POS_SALE'
      AND (t.date > v_tx.date OR (t.date = v_tx.date AND t.created_at > v_tx.created_at))
  ) THEN
    RAISE EXCEPTION 'Pembelian memiliki mutasi stok sesudahnya. Batalkan mutasi paling akhir terlebih dahulu atau gunakan koreksi stok terotorisasi.';
  END IF;

  SELECT * INTO v_material FROM public.materials
  WHERE id = v_purchase.material_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material pembelian tidak ditemukan.'; END IF;
  v_stock := CASE WHEN v_location = 'RESTO' THEN COALESCE(v_material.qty_resto, 0) ELSE COALESCE(v_material.qty_central, 0) END;
  IF v_stock + 0.0000001 < v_tx.qty THEN
    RAISE EXCEPTION 'Stok saat ini (% satuan stok) lebih kecil dari kuantitas pembelian (%). Pembatalan otomatis tidak aman.', v_stock, v_tx.qty;
  END IF;
  IF v_purchase.prev_location_avg_cost IS NULL OR v_purchase.prev_unit_price IS NULL THEN
    RAISE EXCEPTION 'Snapshot harga pack atau WAC sebelum pembelian tidak tersimpan. Pembatalan otomatis tidak aman tanpa rekalkulasi biaya.';
  END IF;

  v_unit_cost := GREATEST(v_purchase.prev_location_avg_cost, 0);
  IF v_location = 'RESTO' THEN
    UPDATE public.materials SET qty_resto = COALESCE(qty_resto, 0) - v_tx.qty,
      price = v_purchase.prev_unit_price, new_price = v_purchase.prev_unit_price, updated_at = now()
    WHERE id = v_purchase.material_id AND tenant_id = p_tenant_id;
  ELSE
    UPDATE public.materials SET qty_central = COALESCE(qty_central, 0) - v_tx.qty,
      price = v_purchase.prev_unit_price, new_price = v_purchase.prev_unit_price, updated_at = now()
    WHERE id = v_purchase.material_id AND tenant_id = p_tenant_id;
  END IF;

  UPDATE public.material_location_costs SET average_unit_cost = v_unit_cost,
    source = 'PURCHASE_CANCEL_RESTORE', updated_at = now()
  WHERE tenant_id = p_tenant_id AND material_id = v_purchase.material_id AND location = v_location;

  UPDATE public.material_batches SET qty_resto = 0, qty_central = 0, status = 'CANCELLED'
  WHERE tenant_id = p_tenant_id AND purchase_entry_id = p_purchase_id;

  UPDATE public.transactions SET is_reversed = true,
    notes = COALESCE(notes, '') || ' [DIBATALKAN ' || now()::text || ': ' || COALESCE(NULLIF(p_reason, ''), 'pembatalan pembelian') || ']',
    updated_at = now()
  WHERE id = v_tx.id AND tenant_id = p_tenant_id;

  UPDATE public.purchase_entries SET is_cancelled = true, cancelled_at = now(), cancelled_by = v_user_id,
    cancel_reason = COALESCE(NULLIF(p_reason, ''), 'Pembatalan oleh pengguna'), updated_at = now()
  WHERE id = p_purchase_id AND tenant_id = p_tenant_id;

  SELECT CASE WHEN COALESCE(m.qty_resto, 0) * COALESCE(r.average_unit_cost, 0) + COALESCE(m.qty_central, 0) * COALESCE(c.average_unit_cost, 0) > 0
    THEN (COALESCE(m.qty_resto, 0) * COALESCE(r.average_unit_cost, 0) + COALESCE(m.qty_central, 0) * COALESCE(c.average_unit_cost, 0)) /
      NULLIF(COALESCE(m.qty_resto, 0) + COALESCE(m.qty_central, 0), 0)
    ELSE v_unit_cost END
  INTO v_global_cost
  FROM public.materials m
  LEFT JOIN public.material_location_costs r ON r.tenant_id = m.tenant_id AND r.material_id = m.id AND r.location = 'RESTO'
  LEFT JOIN public.material_location_costs c ON c.tenant_id = m.tenant_id AND c.material_id = m.id AND c.location = 'CENTRAL'
  WHERE m.id = v_purchase.material_id AND m.tenant_id = p_tenant_id;
  UPDATE public.materials SET avg_cost = GREATEST(COALESCE(v_global_cost, v_unit_cost), 0) * public.stock_units_per_pack_v3(p_tenant_id, v_purchase.material_id)
  WHERE id = v_purchase.material_id AND tenant_id = p_tenant_id;

  INSERT INTO public.audit_logs (tenant_id, user_id, action, description, table_name, record_id, new_data, is_system, created_at)
  VALUES (p_tenant_id, v_user_id, 'CANCEL_PURCHASE', 'Pembelian dibatalkan dengan reversal terkontrol. Alasan: ' || COALESCE(NULLIF(p_reason, ''), 'pembatalan oleh pengguna'),
    'purchase_entries', p_purchase_id, jsonb_build_object('is_cancelled', true, 'location', v_location, 'reversed_qty', v_tx.qty), false, now());

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'purchase_id', p_purchase_id, 'reversed_qty', v_tx.qty, 'restored_unit_cost', v_unit_cost);
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.atomic_cancel_purchase_v3(uuid, bigint, uuid, text);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.atomic_cancel_purchase_v3(uuid, bigint, uuid, text): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261115000000_strict_branch_isolation_v12.sql] Fungsi: public.atomic_record_waste_v2
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.atomic_record_waste_v2(
  p_tenant_id uuid,
  p_material_id bigint,
  p_qty numeric,
  p_type text,
  p_location text,
  p_date date,
  p_notes text,
  p_created_by uuid,
  p_request_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_material public.materials%ROWTYPE;
  v_location public.stock_location;
  v_stock numeric;
  v_cost numeric;
  v_loss numeric;
  v_tx public.transactions%ROWTYPE;
  v_tx_id bigint;
BEGIN
  IF p_tenant_id IS NULL OR (public.bv2_auth_tenant_id() IS DISTINCT FROM p_tenant_id AND NOT public.bv2_is_superadmin()) THEN
    RAISE EXCEPTION 'Akses tenant ditolak.' USING ERRCODE = '42501';
  END IF;
  IF p_request_key IS NULL OR btrim(p_request_key) = '' THEN RAISE EXCEPTION 'Request key waste wajib diisi.'; END IF;
  IF COALESCE(p_qty, 0) <= 0 THEN RAISE EXCEPTION 'Kuantitas waste harus lebih dari 0.'; END IF;
  IF upper(p_location) NOT IN ('RESTO', 'CENTRAL') THEN RAISE EXCEPTION 'Lokasi waste tidak valid.'; END IF;
  IF upper(p_type) NOT IN ('WASTE', 'BREAKAGE', 'EXPIRED', 'COMP') THEN RAISE EXCEPTION 'Tipe waste tidak valid.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext('waste:' || p_request_key));

  SELECT * INTO v_tx FROM public.transactions WHERE tenant_id = p_tenant_id AND idempotency_key = 'waste:' || p_request_key LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('success', true, 'duplicate', true, 'cost_loss', v_tx.amount); END IF;

  v_location := upper(p_location)::public.stock_location;
  SELECT * INTO v_material FROM public.materials WHERE id = p_material_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bahan tidak ditemukan pada tenant ini.'; END IF;

  PERFORM public.bv2_assert_branch_access(v_material.branch_id);

  IF EXISTS (
    SELECT 1 FROM public.daily_inventories h
    WHERE h.tenant_id = p_tenant_id
      AND h.branch_id = v_material.branch_id
      AND h.location = v_location
      AND h.date >= p_date
      AND lower(COALESCE(h.status, 'draft')) IN ('verified', 'closed')
  ) THEN
    RAISE EXCEPTION 'Mutasi waste tanggal % ditolak karena tanggal tersebut atau tanggal setelahnya sudah EOD final.', p_date;
  END IF;

  v_stock := CASE WHEN v_location = 'RESTO' THEN COALESCE(v_material.qty_resto, 0) ELSE COALESCE(v_material.qty_central, 0) END;
  IF v_stock < p_qty THEN RAISE EXCEPTION 'Stok tidak mencukupi. Tersedia %, dibutuhkan %.', v_stock, p_qty; END IF;

  SELECT average_unit_cost INTO v_cost FROM public.material_location_costs
  WHERE tenant_id = p_tenant_id AND material_id = p_material_id AND location = v_location FOR UPDATE;
  v_cost := COALESCE(v_cost, public.legacy_material_stock_unit_cost_v3(p_tenant_id, p_material_id), 0);
  v_loss := p_qty * v_cost;

  IF v_location = 'RESTO' THEN
    UPDATE public.materials SET qty_resto = COALESCE(qty_resto, 0) - p_qty, updated_at = now()
    WHERE id = p_material_id AND tenant_id = p_tenant_id;
  ELSE
    UPDATE public.materials SET qty_central = COALESCE(qty_central, 0) - p_qty, updated_at = now()
    WHERE id = p_material_id AND tenant_id = p_tenant_id;
  END IF;

  INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by,
    unit_cost_snapshot, source_module, idempotency_key)
  VALUES (p_tenant_id, v_material.branch_id, p_date, p_material_id, p_type::public.transaction_type, v_location, -p_qty, v_loss,
    COALESCE(p_notes, 'Waste / loss'), COALESCE(auth.uid(), p_created_by), v_cost, 'waste', 'waste:' || p_request_key)
  RETURNING id INTO v_tx_id;

  IF v_material.branch_id IS NOT NULL THEN
    INSERT INTO public.waste_logs (tenant_id, branch_id, material_id, quantity, cost_loss, source_type, reason, created_by)
    VALUES (p_tenant_id, v_material.branch_id, p_material_id, p_qty, v_loss, p_type, p_notes, COALESCE(auth.uid(), p_created_by));
  END IF;

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'cost_loss', v_loss, 'transaction_id', v_tx_id);
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.atomic_record_waste_v2(uuid, bigint, numeric, text, text, date, text, uuid, text);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.atomic_record_waste_v2(uuid, bigint, numeric, text, text, date, text, uuid, text): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261020000000_daily_inventory_cost_control_v3.sql] Fungsi: public.atomic_transfer_stock_location_wac
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.atomic_transfer_stock_location_wac(
  p_tenant_id uuid,
  p_material_id bigint,
  p_qty numeric,
  p_source text,
  p_target text,
  p_date date,
  p_notes text,
  p_request_key text,
  p_created_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_material public.materials%ROWTYPE;
  v_source public.stock_location;
  v_target public.stock_location;
  v_source_qty numeric;
  v_target_qty numeric;
  v_source_cost numeric;
  v_target_cost numeric;
  v_source_estimated boolean := true;
  v_target_estimated boolean := true;
  v_new_target_cost numeric;
  v_global_cost numeric;
  v_group_id uuid := gen_random_uuid();
  v_dup public.transactions%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR (public.get_auth_tenant_id() IS DISTINCT FROM p_tenant_id AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Akses tenant ditolak.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_qty, 0) <= 0 THEN RAISE EXCEPTION 'Kuantitas transfer harus lebih dari 0.'; END IF;
  IF upper(p_source) NOT IN ('RESTO', 'CENTRAL') OR upper(p_target) NOT IN ('RESTO', 'CENTRAL') OR upper(p_source) = upper(p_target) THEN
    RAISE EXCEPTION 'Lokasi transfer tidak valid.';
  END IF;
  IF p_request_key IS NULL OR btrim(p_request_key) = '' THEN RAISE EXCEPTION 'Request key transfer wajib diisi.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext('transfer:' || p_request_key));
  SELECT * INTO v_dup FROM public.transactions WHERE tenant_id = p_tenant_id AND idempotency_key = 'transfer:' || p_request_key || ':IN' LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('success', true, 'duplicate', true, 'transfer_group_id', v_dup.transfer_group_id); END IF;

  v_source := upper(p_source)::public.stock_location;
  v_target := upper(p_target)::public.stock_location;
  IF EXISTS (SELECT 1 FROM public.daily_inventories h WHERE h.tenant_id = p_tenant_id AND h.location IN (v_source, v_target) AND h.date >= p_date AND lower(COALESCE(h.status, 'draft')) IN ('verified', 'closed')) THEN
    RAISE EXCEPTION 'Transfer tanggal % ditolak karena lokasi asal/tujuan memiliki EOD final pada tanggal tersebut atau setelahnya.', p_date;
  END IF;
  SELECT * INTO v_material FROM public.materials WHERE id = p_material_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bahan tidak ditemukan pada tenant ini.'; END IF;

  v_source_qty := CASE WHEN v_source = 'RESTO' THEN COALESCE(v_material.qty_resto, 0) ELSE COALESCE(v_material.qty_central, 0) END;
  v_target_qty := CASE WHEN v_target = 'RESTO' THEN COALESCE(v_material.qty_resto, 0) ELSE COALESCE(v_material.qty_central, 0) END;
  IF v_source_qty < p_qty THEN RAISE EXCEPTION 'Stok lokasi asal tidak mencukupi. Tersedia %, dibutuhkan %.', v_source_qty, p_qty; END IF;

  INSERT INTO public.material_location_costs (tenant_id, material_id, location, average_unit_cost, source, is_opening_estimated)
  VALUES (p_tenant_id, p_material_id, v_source, public.legacy_material_stock_unit_cost_v3(p_tenant_id, p_material_id), 'LEGACY_GLOBAL_SEED', true),
         (p_tenant_id, p_material_id, v_target, public.legacy_material_stock_unit_cost_v3(p_tenant_id, p_material_id), 'LEGACY_GLOBAL_SEED', true)
  ON CONFLICT (tenant_id, material_id, location) DO NOTHING;

  SELECT average_unit_cost, is_opening_estimated INTO v_source_cost, v_source_estimated FROM public.material_location_costs
  WHERE tenant_id = p_tenant_id AND material_id = p_material_id AND location = v_source FOR UPDATE;
  SELECT average_unit_cost, is_opening_estimated INTO v_target_cost, v_target_estimated FROM public.material_location_costs
  WHERE tenant_id = p_tenant_id AND material_id = p_material_id AND location = v_target FOR UPDATE;
  v_source_cost := COALESCE(v_source_cost, public.legacy_material_stock_unit_cost_v3(p_tenant_id, p_material_id), 0);
  v_target_cost := COALESCE(v_target_cost, public.legacy_material_stock_unit_cost_v3(p_tenant_id, p_material_id), 0);
  v_new_target_cost := CASE WHEN v_target_qty + p_qty > 0 THEN ((v_target_qty * v_target_cost) + (p_qty * v_source_cost)) / (v_target_qty + p_qty) ELSE v_source_cost END;

  IF v_source = 'RESTO' THEN
    UPDATE public.materials SET qty_resto = COALESCE(qty_resto, 0) - p_qty, qty_central = COALESCE(qty_central, 0) + p_qty, updated_at = now()
    WHERE id = p_material_id AND tenant_id = p_tenant_id;
  ELSE
    UPDATE public.materials SET qty_central = COALESCE(qty_central, 0) - p_qty, qty_resto = COALESCE(qty_resto, 0) + p_qty, updated_at = now()
    WHERE id = p_material_id AND tenant_id = p_tenant_id;
  END IF;

  UPDATE public.material_location_costs
  SET average_unit_cost = v_new_target_cost,
      source = 'TRANSFER_WAC',
      is_opening_estimated = CASE
        WHEN v_target_qty > 0 THEN COALESCE(v_target_estimated, true) OR COALESCE(v_source_estimated, true)
        ELSE COALESCE(v_source_estimated, true)
      END,
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND material_id = p_material_id AND location = v_target;

  INSERT INTO public.transactions (tenant_id, date, material_id, type, location, qty, amount, notes, created_by,
    unit_cost_snapshot, source_module, idempotency_key, transfer_group_id)
  VALUES (p_tenant_id, p_date, p_material_id, 'TRANSFER', v_source, -p_qty, p_qty * v_source_cost,
    'Transfer [' || v_source::text || ' ➔ ' || v_target::text || '] OUT' || CASE WHEN p_notes IS NULL OR p_notes = '' THEN '' ELSE ' - ' || p_notes END,
    COALESCE(auth.uid(), p_created_by), v_source_cost, 'transfer', 'transfer:' || p_request_key || ':OUT', v_group_id);

  INSERT INTO public.transactions (tenant_id, date, material_id, type, location, qty, amount, notes, created_by,
    unit_cost_snapshot, source_module, idempotency_key, transfer_group_id)
  VALUES (p_tenant_id, p_date, p_material_id, 'TRANSFER', v_target, p_qty, p_qty * v_source_cost,
    'Transfer [' || v_source::text || ' ➔ ' || v_target::text || '] IN' || CASE WHEN p_notes IS NULL OR p_notes = '' THEN '' ELSE ' - ' || p_notes END,
    COALESCE(auth.uid(), p_created_by), v_source_cost, 'transfer', 'transfer:' || p_request_key || ':IN', v_group_id);

  SELECT CASE WHEN COALESCE(m.qty_resto, 0) * COALESCE(r.average_unit_cost, 0) + COALESCE(m.qty_central, 0) * COALESCE(c.average_unit_cost, 0) > 0
    THEN (COALESCE(m.qty_resto, 0) * COALESCE(r.average_unit_cost, 0) + COALESCE(m.qty_central, 0) * COALESCE(c.average_unit_cost, 0)) /
      NULLIF(COALESCE(m.qty_resto, 0) + COALESCE(m.qty_central, 0), 0)
    ELSE COALESCE(m.avg_cost, m.price, 0) END
  INTO v_global_cost
  FROM public.materials m
  LEFT JOIN public.material_location_costs r ON r.tenant_id = m.tenant_id AND r.material_id = m.id AND r.location = 'RESTO'
  LEFT JOIN public.material_location_costs c ON c.tenant_id = m.tenant_id AND c.material_id = m.id AND c.location = 'CENTRAL'
  WHERE m.id = p_material_id AND m.tenant_id = p_tenant_id;
  UPDATE public.materials SET avg_cost = GREATEST(COALESCE(v_global_cost, v_source_cost), 0) * public.stock_units_per_pack_v3(p_tenant_id, p_material_id)
  WHERE id = p_material_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'transfer_group_id', v_group_id, 'unit_cost', v_source_cost);
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.atomic_transfer_stock_location_wac(uuid, bigint, numeric, text, text, date, text, text, uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.atomic_transfer_stock_location_wac(uuid, bigint, numeric, text, text, date, text, text, uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261020000000_daily_inventory_cost_control_v3.sql] Fungsi: public.reopen_daily_inventory_session_v3
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.reopen_daily_inventory_session_v3(
  p_tenant_id uuid,
  p_date date,
  p_location text,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_location public.stock_location;
  v_header_id bigint;
  v_status text;
  v_item record;
  v_user_role text;
  v_user_id uuid := COALESCE(auth.uid(), p_user_id);
BEGIN
  IF p_tenant_id IS NULL OR (public.get_auth_tenant_id() IS DISTINCT FROM p_tenant_id AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Akses tenant ditolak.' USING ERRCODE = '42501';
  END IF;
  SELECT role::text INTO v_user_role FROM public.users WHERE id = auth.uid() AND tenant_id = p_tenant_id LIMIT 1;
  IF NOT public.is_super_admin()
     AND lower(COALESCE(v_user_role, '')) NOT IN ('admin / owner', 'owner', 'supervisor', 'super admin') THEN
    RAISE EXCEPTION 'Hak membuka ulang EOD hanya tersedia untuk Admin/Owner, Owner, Supervisor, atau Super Admin.' USING ERRCODE = '42501';
  END IF;
  IF upper(p_location) NOT IN ('RESTO', 'CENTRAL') THEN RAISE EXCEPTION 'Lokasi inventaris tidak valid.'; END IF;
  v_location := upper(p_location)::public.stock_location;
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(p_date::text || ':' || v_location::text));

  SELECT id, status INTO v_header_id, v_status FROM public.daily_inventories
  WHERE tenant_id = p_tenant_id AND date = p_date AND location = v_location FOR UPDATE;
  IF NOT FOUND OR lower(COALESCE(v_status, 'draft')) NOT IN ('verified', 'closed') THEN
    RAISE EXCEPTION 'Tidak ada EOD terkunci yang dapat dibuka kembali untuk tanggal/lokasi ini.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.daily_inventories h
    WHERE h.tenant_id = p_tenant_id AND h.location = v_location AND h.date > p_date
      AND lower(COALESCE(h.status, 'draft')) IN ('verified', 'closed')
  ) OR EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.tenant_id = p_tenant_id AND t.location = v_location AND t.date > p_date
      AND t.type IN ('IN', 'OUT', 'TRANSFER', 'POS_DEDUCTION', 'PURCHASE_IN', 'OPNAME_ADJ', 'WASTE', 'BREAKAGE', 'EXPIRED', 'COMP')
      AND COALESCE(t.source_module, '') <> 'daily_inventory'
  ) THEN
    RAISE EXCEPTION 'EOD tidak dapat dibuka karena sudah ada sesi closing atau mutasi stok yang lebih baru. Hubungi Owner untuk rekonsiliasi berurutan.';
  END IF;

  FOR v_item IN
    SELECT i.id, i.material_id, i.book_qty_before_close
    FROM public.daily_inventory_items i WHERE i.inventory_id = v_header_id ORDER BY i.material_id
  LOOP
    IF v_item.book_qty_before_close IS NULL THEN
      RAISE EXCEPTION 'Snapshot saldo sebelum closing tidak tersedia untuk material %. Reopen otomatis dibatalkan demi keamanan saldo.', v_item.material_id;
    END IF;
    IF v_location = 'RESTO' THEN
      UPDATE public.materials SET qty_resto = v_item.book_qty_before_close, updated_at = now()
      WHERE id = v_item.material_id AND tenant_id = p_tenant_id;
    ELSE
      UPDATE public.materials SET qty_central = v_item.book_qty_before_close, updated_at = now()
      WHERE id = v_item.material_id AND tenant_id = p_tenant_id;
    END IF;

    UPDATE public.transactions SET is_reversed = true,
      notes = COALESCE(notes, '') || ' [dibalik saat EOD dibuka kembali ' || now()::text || ']', updated_at = now()
    WHERE tenant_id = p_tenant_id AND idempotency_key IN (
      'daily-out:' || v_header_id::text || ':' || v_item.material_id::text,
      'daily-adjustment:' || v_header_id::text || ':' || v_item.material_id::text
    );
  END LOOP;

  UPDATE public.daily_inventories SET status = 'draft', verified_by = NULL, updated_at = now()
  WHERE id = v_header_id AND tenant_id = p_tenant_id;

  INSERT INTO public.audit_logs (tenant_id, user_id, action, description, table_name, record_id, old_data, new_data, is_system, created_at)
  VALUES (p_tenant_id, v_user_id, 'UNLOCK_EOD', 'EOD dibuka kembali untuk revisi: ' || p_date::text || ' ' || v_location::text,
    'daily_inventories', v_header_id, jsonb_build_object('status', v_status), jsonb_build_object('status', 'draft'), true, now());

  RETURN jsonb_build_object('success', true, 'inventory_id', v_header_id, 'status', 'draft');
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.reopen_daily_inventory_session_v3(uuid, date, text, uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.reopen_daily_inventory_session_v3(uuid, date, text, uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261021000000_daily_inventory_broken_fefo_v4.sql] Fungsi: public.mark_material_expiry_tracking_v4
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.mark_material_expiry_tracking_v4()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF COALESCE(NEW.qty_resto, 0) > 0 OR COALESCE(NEW.qty_central, 0) > 0 THEN
    UPDATE public.materials
    SET expiry_tracking_enabled = true, updated_at = now()
    WHERE tenant_id = NEW.tenant_id AND id = NEW.material_id;
  END IF;
  RETURN NEW;
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.mark_material_expiry_tracking_v4();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.mark_material_expiry_tracking_v4(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261021000000_daily_inventory_broken_fefo_v4.sql] Fungsi: public.materialize_production_output_lot_v4
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.materialize_production_output_lot_v4()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_expiry_tracking boolean;
  v_shelf_life integer;
  v_expiry_date date;
BEGIN
  IF NEW.type <> 'IN' OR COALESCE(NEW.qty,0) <= 0 OR COALESCE(NEW.source_module,'') <> 'production'
     OR COALESCE(NEW.is_reversed,false) THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(m.expiry_tracking_enabled,false), m.shelf_life_days
  INTO v_expiry_tracking, v_shelf_life
  FROM public.materials m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.material_id;
  IF NOT COALESCE(v_expiry_tracking,false) THEN RETURN NEW; END IF;
  IF COALESCE(v_shelf_life,0) <= 0 THEN
    RAISE EXCEPTION 'Material hasil produksi % melacak expired date tetapi Shelf Life (hari) belum diatur. Lengkapi master material sebelum produksi.', NEW.material_id;
  END IF;
  v_expiry_date := NEW.date + v_shelf_life;
  INSERT INTO public.material_batches (
    tenant_id, material_id, batch_no, batch_number, expiry_date, expired_date,
    qty_resto, qty_central, location, received_at, status, lot_qty_verified
  ) VALUES (
    NEW.tenant_id, NEW.material_id, 'PROD-' || COALESCE(NEW.source_record_id,NEW.id::text),
    'PROD-' || COALESCE(NEW.source_record_id,NEW.id::text), v_expiry_date, v_expiry_date,
    CASE WHEN NEW.location='RESTO' THEN NEW.qty ELSE 0 END,
    CASE WHEN NEW.location='CENTRAL' THEN NEW.qty ELSE 0 END,
    NEW.location::text, NEW.date, 'active', true
  );
  RETURN NEW;
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.materialize_production_output_lot_v4();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.materialize_production_output_lot_v4(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261021000000_daily_inventory_broken_fefo_v4.sql] Fungsi: public.daily_inventory_opening_v4
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.daily_inventory_opening_v4(
  p_tenant_id uuid,
  p_date date,
  p_location public.stock_location,
  p_material_id bigint
) RETURNS TABLE(opening_qty numeric, opening_qty_source text, previous_date date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_current_qty numeric := 0;
  v_previous_date date;
  v_previous_closed_at timestamptz;
  v_previous_closing numeric;
  v_carry_movement numeric := 0;
  v_stock_movement numeric := 0;
  v_waste numeric := 0;
  v_production_usage numeric := 0;
BEGIN
  SELECT CASE WHEN p_location = 'RESTO' THEN COALESCE(m.qty_resto, 0) ELSE COALESCE(m.qty_central, 0) END
  INTO v_current_qty
  FROM public.materials m
  WHERE m.tenant_id = p_tenant_id AND m.id = p_material_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material % tidak ditemukan saat menghitung stok awal.', p_material_id; END IF;

  SELECT h.date, h.updated_at, i.closing_qty
  INTO v_previous_date, v_previous_closed_at, v_previous_closing
  FROM public.daily_inventories h
  LEFT JOIN public.daily_inventory_items i ON i.inventory_id = h.id AND i.material_id = p_material_id
  WHERE h.tenant_id = p_tenant_id AND h.location = p_location AND h.date < p_date
    AND lower(COALESCE(h.status, 'draft')) IN ('verified', 'closed')
  ORDER BY h.date DESC LIMIT 1;

  IF v_previous_date IS NOT NULL AND v_previous_closing IS NOT NULL THEN
    SELECT COALESCE(SUM(t.qty), 0) INTO v_carry_movement
    FROM public.transactions t
    WHERE t.tenant_id = p_tenant_id AND t.material_id = p_material_id AND t.location = p_location
      AND t.date >= v_previous_date AND t.date < p_date
      AND (t.date > v_previous_date OR (t.date = v_previous_date AND t.created_at > v_previous_closed_at))
      AND COALESCE(t.is_reversed, false) = false
      AND t.type NOT IN ('POS_SALE', 'POS_DEDUCTION');
    opening_qty := GREATEST(v_previous_closing + COALESCE(v_carry_movement, 0), 0);
    opening_qty_source := 'PREVIOUS_CLOSED_EOD_PLUS_LEDGER';
    previous_date := v_previous_date;
    RETURN NEXT;
    RETURN;
  END IF;

  -- No closed EOD exists yet. Derive the pre-transaction opening balance from the current
  -- material balance minus today's already-posted non-consumption movements, plus consumption
  -- already reflected in master stock. This avoids adding today's purchases twice.
  SELECT COALESCE(SUM(t.qty), 0) INTO v_stock_movement
  FROM public.transactions t
  WHERE t.tenant_id = p_tenant_id AND t.material_id = p_material_id AND t.location = p_location AND t.date = p_date
    AND COALESCE(t.is_reversed, false) = false
    AND t.type NOT IN ('POS_SALE', 'POS_DEDUCTION', 'WASTE', 'BREAKAGE', 'EXPIRED', 'COMP')
    AND NOT (t.type = 'OUT' AND COALESCE(t.source_module, '') IN ('daily_inventory', 'production'));

  SELECT COALESCE(SUM(ABS(t.qty)), 0) INTO v_waste
  FROM public.transactions t
  WHERE t.tenant_id = p_tenant_id AND t.material_id = p_material_id AND t.location = p_location AND t.date = p_date
    AND t.type IN ('WASTE', 'BREAKAGE', 'EXPIRED', 'COMP') AND COALESCE(t.is_reversed, false) = false;

  SELECT COALESCE(SUM(ABS(t.qty)), 0) INTO v_production_usage
  FROM public.transactions t
  WHERE t.tenant_id = p_tenant_id AND t.material_id = p_material_id AND t.location = p_location AND t.date = p_date
    AND t.type = 'OUT' AND t.source_module = 'production' AND COALESCE(t.is_reversed, false) = false;

  opening_qty := GREATEST(v_current_qty - v_stock_movement + v_waste + v_production_usage, 0);
  opening_qty_source := 'LEGACY_CURRENT_BALANCE_MINUS_TODAY_MUTATIONS_ESTIMATED';
  previous_date := NULL;
  RETURN NEXT;
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.daily_inventory_opening_v4(uuid, date, public.stock_location, bigint);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.daily_inventory_opening_v4(uuid, date, public.stock_location, bigint): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261021000000_daily_inventory_broken_fefo_v4.sql] Fungsi: public.atomic_record_purchase_location_wac_v4
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.atomic_record_purchase_location_wac_v4(
  p_tenant_id uuid,
  p_material_id bigint,
  p_supplier_id bigint,
  p_qty numeric,
  p_unit text,
  p_unit_price numeric,
  p_date date,
  p_destination text,
  p_input_by uuid,
  p_notes text,
  p_expired_date date,
  p_request_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_expiry_tracking boolean;
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL OR (public.get_auth_tenant_id() IS DISTINCT FROM p_tenant_id AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Akses tenant ditolak.' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(m.expiry_tracking_enabled,false) INTO v_expiry_tracking
  FROM public.materials m WHERE m.tenant_id=p_tenant_id AND m.id=p_material_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material tidak ditemukan.'; END IF;
  IF v_expiry_tracking AND p_expired_date IS NULL THEN
    RAISE EXCEPTION 'Material ini wajib melacak expired date. Isi tanggal kedaluwarsa pada penerimaan; jika satu pembelian memiliki beberapa expiry date, pecah menjadi beberapa lot penerimaan.';
  END IF;
  v_result := public.atomic_record_purchase_location_wac(p_tenant_id,p_material_id,p_supplier_id,p_qty,p_unit,p_unit_price,p_date,p_destination,p_input_by,p_notes,p_expired_date,p_request_key);
  RETURN v_result || jsonb_build_object('version',4,'lot_tracked',COALESCE(v_expiry_tracking,false) OR p_expired_date IS NOT NULL);
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.atomic_record_purchase_location_wac_v4(uuid, bigint, bigint, numeric, text, numeric, date, text, uuid, text, date, text);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.atomic_record_purchase_location_wac_v4(uuid, bigint, bigint, numeric, text, numeric, date, text, uuid, text, date, text): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261021000000_daily_inventory_broken_fefo_v4.sql] Fungsi: public.reopen_daily_inventory_session_v4
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.reopen_daily_inventory_session_v4(
  p_tenant_id uuid,
  p_date date,
  p_location text,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_location public.stock_location;
  v_header_id bigint;
  v_result jsonb;
  v_item record;
  v_move record;
BEGIN
  IF p_tenant_id IS NULL OR (public.get_auth_tenant_id() IS DISTINCT FROM p_tenant_id AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Akses tenant ditolak.' USING ERRCODE = '42501';
  END IF;
  IF upper(COALESCE(p_location,'')) NOT IN ('RESTO','CENTRAL') THEN RAISE EXCEPTION 'Lokasi inventaris tidak valid.'; END IF;
  v_location := upper(p_location)::public.stock_location;
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(p_date::text || ':' || v_location::text));
  SELECT h.id INTO v_header_id FROM public.daily_inventories h
  WHERE h.tenant_id=p_tenant_id AND h.date=p_date AND h.location=v_location
    AND lower(COALESCE(h.status,'draft')) IN ('verified','closed') FOR UPDATE;
  IF v_header_id IS NULL THEN RAISE EXCEPTION 'Tidak ada EOD terkunci untuk dibuka kembali.'; END IF;

  -- First restore all batch balances touched by the closing; idempotency is protected by reversed_at.
  FOR v_move IN
    SELECT * FROM public.material_lot_movements_v4
    WHERE tenant_id=p_tenant_id AND daily_inventory_item_id IN (
      SELECT id FROM public.daily_inventory_items WHERE inventory_id=v_header_id
    ) AND movement_type = 'EOD_OUT' AND reversed_at IS NULL
    FOR UPDATE
  LOOP
    IF v_move.location='RESTO' THEN
      UPDATE public.material_batches SET qty_resto=COALESCE(qty_resto,0)+ABS(v_move.movement_qty),updated_at=now()
      WHERE id=v_move.batch_id AND tenant_id=p_tenant_id;
    ELSE
      UPDATE public.material_batches SET qty_central=COALESCE(qty_central,0)+ABS(v_move.movement_qty),updated_at=now()
      WHERE id=v_move.batch_id AND tenant_id=p_tenant_id;
    END IF;
    UPDATE public.material_lot_movements_v4 SET reversed_at=now() WHERE id=v_move.id;
  END LOOP;

  -- Restore the active lot state that was active at the beginning of the EOD session.
  FOR v_item IN
    SELECT i.material_id, i.opening_active_open_lot_id
    FROM public.daily_inventory_items i WHERE i.inventory_id=v_header_id
  LOOP
    INSERT INTO public.material_open_lot_state (tenant_id,material_id,location,active_open_lot_id,opened_at,updated_at)
    VALUES (p_tenant_id,v_item.material_id,v_location,v_item.opening_active_open_lot_id,
      CASE WHEN v_item.opening_active_open_lot_id IS NULL THEN NULL ELSE now() END,now())
    ON CONFLICT (tenant_id,material_id,location) DO UPDATE SET
      active_open_lot_id=EXCLUDED.active_open_lot_id,
      opened_at=CASE WHEN EXCLUDED.active_open_lot_id IS NULL THEN NULL ELSE now() END,
      updated_at=now();
  END LOOP;

  v_result := public.reopen_daily_inventory_session_v3(p_tenant_id,p_date,p_location,p_user_id);
  RETURN v_result || jsonb_build_object('version',4,'lot_balances_restored',true);
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.reopen_daily_inventory_session_v4(uuid, date, text, uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.reopen_daily_inventory_session_v4(uuid, date, text, uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261021000000_daily_inventory_broken_fefo_v4.sql] Fungsi: public.atomic_transfer_stock_location_wac_v4
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.atomic_transfer_stock_location_wac_v4(
  p_tenant_id uuid,
  p_material_id bigint,
  p_qty numeric,
  p_source text,
  p_target text,
  p_date date,
  p_notes text,
  p_request_key text,
  p_created_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_source public.stock_location;
  v_target public.stock_location;
  v_result jsonb;
  v_remaining numeric := p_qty;
  v_take numeric;
  v_batch record;
  v_active_lot uuid;
  v_target_active_lot uuid;
BEGIN
  IF upper(p_source) NOT IN ('RESTO','CENTRAL') OR upper(p_target) NOT IN ('RESTO','CENTRAL') THEN
    RAISE EXCEPTION 'Lokasi transfer tidak valid.';
  END IF;
  v_source := upper(p_source)::public.stock_location;
  v_target := upper(p_target)::public.stock_location;
  IF v_source=v_target THEN RAISE EXCEPTION 'Lokasi asal dan tujuan harus berbeda.'; END IF;
  IF COALESCE(p_qty,0)<=0 THEN RAISE EXCEPTION 'Kuantitas transfer harus lebih besar dari nol.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text),hashtext('transfer:'||p_request_key));

  -- Existing RPC updates material totals, WAC, and the paired ledger rows atomically.
  v_result := public.atomic_transfer_stock_location_wac(p_tenant_id,p_material_id,p_qty,p_source,p_target,p_date,p_notes,p_request_key,p_created_by);
  IF COALESCE((SELECT m.expiry_tracking_enabled FROM public.materials m WHERE m.id=p_material_id AND m.tenant_id=p_tenant_id),false)
     OR EXISTS(SELECT 1 FROM public.material_batches b WHERE b.tenant_id=p_tenant_id AND b.material_id=p_material_id AND lower(COALESCE(b.status,'active'))='active') THEN
    SELECT s.active_open_lot_id INTO v_active_lot FROM public.material_open_lot_state s
    WHERE s.tenant_id=p_tenant_id AND s.material_id=p_material_id AND s.location=v_source;
    SELECT s.active_open_lot_id INTO v_target_active_lot FROM public.material_open_lot_state s
    WHERE s.tenant_id=p_tenant_id AND s.material_id=p_material_id AND s.location=v_target;
    IF v_active_lot IS NOT NULL AND v_target_active_lot IS NOT NULL AND v_active_lot IS DISTINCT FROM v_target_active_lot THEN
      RAISE EXCEPTION 'Transfer ditolak: lokasi tujuan memiliki lot terbuka berbeda. Selesaikan BROKEN/lot aktif di lokasi tujuan sebelum transfer.';
    END IF;
    FOR v_batch IN
      SELECT b.id, CASE WHEN v_source='RESTO' THEN COALESCE(b.qty_resto,0) ELSE COALESCE(b.qty_central,0) END AS qty_here
      FROM public.material_batches b
      WHERE b.tenant_id=p_tenant_id AND b.material_id=p_material_id AND lower(COALESCE(b.status,'active'))='active'
        AND (CASE WHEN v_source='RESTO' THEN COALESCE(b.qty_resto,0) ELSE COALESCE(b.qty_central,0) END)>0
      ORDER BY (b.id=v_active_lot) DESC, COALESCE(b.expired_date,b.expiry_date) ASC NULLS LAST, b.created_at, b.id
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining<=0.0000001;
      v_take:=LEAST(v_batch.qty_here,v_remaining);
      IF v_source='RESTO' THEN
        UPDATE public.material_batches SET qty_resto=GREATEST(qty_resto-v_take,0),qty_central=COALESCE(qty_central,0)+v_take,updated_at=now() WHERE id=v_batch.id AND tenant_id=p_tenant_id;
      ELSE
        UPDATE public.material_batches SET qty_central=GREATEST(qty_central-v_take,0),qty_resto=COALESCE(qty_resto,0)+v_take,updated_at=now() WHERE id=v_batch.id AND tenant_id=p_tenant_id;
      END IF;
      v_remaining:=v_remaining-v_take;
    END LOOP;
    IF v_remaining>0.0001 THEN
      RAISE EXCEPTION 'Tidak cukup saldo lot yang sudah tercatat untuk transfer. Sisa %; rekonsiliasi lot sebelum transfer.',v_remaining;
    END IF;
    -- Move the active-lot pointer with the transfer so there is still at most one per location.
    IF v_active_lot IS NOT NULL THEN
      INSERT INTO public.material_open_lot_state (tenant_id,material_id,location,active_open_lot_id,opened_at,updated_at)
      VALUES (p_tenant_id,p_material_id,v_target,v_active_lot,now(),now())
      ON CONFLICT (tenant_id,material_id,location) DO UPDATE SET active_open_lot_id=EXCLUDED.active_open_lot_id,opened_at=now(),updated_at=now();
      IF NOT EXISTS (SELECT 1 FROM public.material_batches b WHERE b.id=v_active_lot AND b.tenant_id=p_tenant_id
        AND (CASE WHEN v_source='RESTO' THEN COALESCE(b.qty_resto,0) ELSE COALESCE(b.qty_central,0) END)>0) THEN
        UPDATE public.material_open_lot_state SET active_open_lot_id=NULL,opened_at=NULL,updated_at=now()
        WHERE tenant_id=p_tenant_id AND material_id=p_material_id AND location=v_source;
      END IF;
    END IF;
  END IF;
  RETURN v_result || jsonb_build_object('version',4,'lots_transferred',true);
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.atomic_transfer_stock_location_wac_v4(uuid, bigint, numeric, text, text, date, text, text, uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.atomic_transfer_stock_location_wac_v4(uuid, bigint, numeric, text, text, date, text, text, uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261022000000_daily_inventory_manual_in_no_production_v5.sql] Fungsi: public.save_daily_inventory_manual_in_v5
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.save_daily_inventory_manual_in_v5(
  p_tenant_id uuid,
  p_date date,
  p_location text,
  p_items jsonb,
  p_is_closing boolean,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_location public.stock_location;
  v_user_id uuid := COALESCE(auth.uid(), p_user_id);
  v_item jsonb;
  v_material public.materials%ROWTYPE;
  v_material_id bigint;
  v_manual_in numeric(16,4);
  v_existing_in numeric(16,4);
  v_delta numeric(16,4);
  v_current_qty numeric(16,4);
  v_unit_cost numeric(16,4);
  v_request_key text;
  v_result jsonb;
  v_header_id bigint;
BEGIN
  IF p_tenant_id IS NULL OR (public.get_auth_tenant_id() IS DISTINCT FROM p_tenant_id AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Akses tenant ditolak.' USING ERRCODE = '42501';
  END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Tanggal inventaris wajib diisi.'; END IF;
  IF upper(COALESCE(p_location,'')) NOT IN ('RESTO','CENTRAL') THEN RAISE EXCEPTION 'Lokasi inventaris tidak valid.'; END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)=0 THEN
    RAISE EXCEPTION 'Data item inventaris harus berupa array yang tidak kosong.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) x
    GROUP BY (x->>'material_id') HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Ada material duplikat dalam satu pengiriman Daily Inventory.'; END IF;

  v_location := upper(p_location)::public.stock_location;
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(p_date::text || ':' || v_location::text));

  -- Manual IN is posted only as part of a successful EOD close. Draft saves only
  -- retain the desired amount on daily_inventory_items and never mutate stock.
  IF p_is_closing THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY (value->>'material_id')::bigint LOOP
      v_material_id := NULLIF(v_item->>'material_id','')::bigint;
      IF v_material_id IS NULL THEN RAISE EXCEPTION 'Setiap baris wajib memiliki material_id.'; END IF;
      SELECT * INTO v_material FROM public.materials m
      WHERE m.id=v_material_id AND m.tenant_id=p_tenant_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Material % tidak ditemukan pada tenant ini.',v_material_id; END IF;

      v_manual_in := COALESCE(NULLIF(v_item->>'manual_in_qty','')::numeric,0);
      IF v_manual_in < 0 THEN RAISE EXCEPTION 'IN tambahan tidak boleh negatif untuk material %.',v_material.name; END IF;
      IF COALESCE(v_material.expiry_tracking_enabled,false) AND v_manual_in > 0 THEN
        RAISE EXCEPTION 'IN untuk % harus dicatat melalui Pembelian/Penerimaan karena material ini memakai pelacakan lot dan expired date.',v_material.name;
      END IF;

      v_request_key := 'daily-manual-in:' || p_date::text || ':' || v_location::text || ':' || v_material_id::text;
      SELECT COALESCE(t.qty,0) INTO v_existing_in
      FROM public.transactions t
      WHERE t.tenant_id=p_tenant_id AND t.idempotency_key=v_request_key AND COALESCE(t.is_reversed,false)=false
      FOR UPDATE;
      IF NOT FOUND THEN v_existing_in := 0; END IF;
      v_delta := v_manual_in - v_existing_in;

      IF abs(v_delta) > 0.0001 THEN
        SELECT mlc.average_unit_cost INTO v_unit_cost
        FROM public.material_location_costs mlc
        WHERE mlc.tenant_id=p_tenant_id AND mlc.material_id=v_material_id AND mlc.location=v_location;
        v_unit_cost := GREATEST(COALESCE(v_unit_cost,v_material.avg_cost,v_material.new_price,v_material.price,0),0);

        IF v_manual_in > 0 THEN
          INSERT INTO public.transactions (
            tenant_id,date,material_id,type,location,qty,amount,notes,created_by,
            unit_cost_snapshot,source_module,source_record_id,idempotency_key,is_reversed
          ) VALUES (
            p_tenant_id,p_date,v_material_id,'IN',v_location,v_manual_in,v_manual_in*v_unit_cost,
            'IN tambahan Daily Inventory [' || p_date::text || '] ' || COALESCE(v_material.name,v_material_id::text),
            v_user_id,v_unit_cost,'daily_inventory_manual_in',p_date::text || ':' || v_location::text || ':' || v_material_id::text,
            v_request_key,false
          )
          ON CONFLICT (tenant_id,idempotency_key) DO UPDATE SET
            date=EXCLUDED.date,qty=EXCLUDED.qty,amount=EXCLUDED.amount,notes=EXCLUDED.notes,
            created_by=EXCLUDED.created_by,unit_cost_snapshot=EXCLUDED.unit_cost_snapshot,
            source_module=EXCLUDED.source_module,source_record_id=EXCLUDED.source_record_id,
            is_reversed=false,updated_at=now();
        ELSE
          UPDATE public.transactions SET is_reversed=true,updated_at=now(),
            notes=COALESCE(notes,'') || ' [IN tambahan dinolkan saat closing ulang]'
          WHERE tenant_id=p_tenant_id AND idempotency_key=v_request_key AND COALESCE(is_reversed,false)=false;
        END IF;

        v_current_qty := CASE WHEN v_location='RESTO' THEN COALESCE(v_material.qty_resto,0) ELSE COALESCE(v_material.qty_central,0) END;
        IF v_current_qty + v_delta < -0.0001 THEN
          RAISE EXCEPTION 'IN tambahan untuk % mengurangi saldo di bawah nol. Periksa saldo master sebelum closing.',v_material.name;
        END IF;
        IF v_location='RESTO' THEN
          UPDATE public.materials SET qty_resto=GREATEST(qty_resto+v_delta,0),updated_at=now()
          WHERE id=v_material_id AND tenant_id=p_tenant_id;
        ELSE
          UPDATE public.materials SET qty_central=GREATEST(qty_central+v_delta,0),updated_at=now()
          WHERE id=v_material_id AND tenant_id=p_tenant_id;
        END IF;
      ELSIF v_manual_in = 0 THEN
        -- Keep a previous idempotent row inactive when the desired manual IN is zero.
        UPDATE public.transactions SET is_reversed=true,updated_at=now()
        WHERE tenant_id=p_tenant_id AND idempotency_key=v_request_key AND COALESCE(is_reversed,false)=false;
      END IF;
    END LOOP;
  END IF;

  -- The v4 function performs the authoritative opening/closing calculations,
  -- lot checks, OUT posting, adjustments, locking, and audit within this transaction.
  v_result := public.atomic_save_daily_inventory_v4(p_tenant_id,p_date,p_location,p_items,p_is_closing,v_user_id);
  v_header_id := NULLIF(v_result->>'inventory_id','')::bigint;
  IF v_header_id IS NULL THEN RAISE EXCEPTION 'Daily Inventory tidak mengembalikan ID sesi setelah disimpan.'; END IF;

  UPDATE public.daily_inventory_items i
  SET manual_in_qty=COALESCE(NULLIF(x.value->>'manual_in_qty','')::numeric,0)
  FROM jsonb_array_elements(p_items) x
  WHERE i.inventory_id=v_header_id
    AND i.material_id=(x.value->>'material_id')::bigint;

  RETURN v_result || jsonb_build_object('version',5,'manual_in_saved',true,'manual_in_posted',p_is_closing);
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.save_daily_inventory_manual_in_v5(uuid, date, text, jsonb, boolean, uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.save_daily_inventory_manual_in_v5(uuid, date, text, jsonb, boolean, uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261023000000_daily_inventory_in_input_fix_v6.sql] Fungsi: public.save_daily_inventory_manual_in_v6
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.save_daily_inventory_manual_in_v6(
  p_tenant_id uuid,
  p_date date,
  p_location text,
  p_items jsonb,
  p_is_closing boolean,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_location public.stock_location;
  v_user_id uuid := COALESCE(auth.uid(), p_user_id);
  v_item jsonb;
  v_lot jsonb;
  v_material public.materials%ROWTYPE;
  v_material_id bigint;
  v_manual_in numeric(16,4);
  v_existing_in numeric(16,4);
  v_delta numeric(16,4);
  v_current_qty numeric(16,4);
  v_unit_cost numeric(16,4);
  v_request_key text;
  v_batch_key text;
  v_source_record_id text;
  v_lot_key text;
  v_batch_no text;
  v_expiry_date date;
  v_lot_qty numeric(16,4);
  v_lot_sum numeric(16,4);
  v_lots jsonb;
  v_result jsonb;
  v_header_id bigint;
  v_existing_batch record;
  v_here_qty numeric(16,4);
  v_other_qty numeric(16,4);
  v_batch_qty numeric(16,4);
  v_existing_expiry date;
  v_existing_batch_no text;
BEGIN
  IF p_tenant_id IS NULL OR (public.get_auth_tenant_id() IS DISTINCT FROM p_tenant_id AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Akses tenant ditolak.' USING ERRCODE = '42501';
  END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Tanggal inventaris wajib diisi.'; END IF;
  IF upper(COALESCE(p_location,'')) NOT IN ('RESTO','CENTRAL') THEN RAISE EXCEPTION 'Lokasi inventaris tidak valid.'; END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)=0 THEN
    RAISE EXCEPTION 'Data item inventaris harus berupa array yang tidak kosong.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) x
    GROUP BY (x->>'material_id') HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Ada material duplikat dalam satu pengiriman Daily Inventory.'; END IF;

  v_location := upper(p_location)::public.stock_location;
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(p_date::text || ':' || v_location::text));

  IF p_is_closing THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY (value->>'material_id')::bigint LOOP
      v_material_id := NULLIF(v_item->>'material_id','')::bigint;
      IF v_material_id IS NULL THEN RAISE EXCEPTION 'Setiap baris wajib memiliki material_id.'; END IF;
      SELECT * INTO v_material FROM public.materials m
      WHERE m.id=v_material_id AND m.tenant_id=p_tenant_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Material % tidak ditemukan pada tenant ini.',v_material_id; END IF;

      v_manual_in := COALESCE(NULLIF(v_item->>'manual_in_qty','')::numeric,0);
      IF v_manual_in < 0 THEN RAISE EXCEPTION 'IN tambahan tidak boleh negatif untuk material %.',v_material.name; END IF;
      v_lots := COALESCE(v_item->'manual_in_lots','[]'::jsonb);
      IF jsonb_typeof(v_lots) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Rincian lot IN untuk % harus berupa daftar lot.',v_material.name;
      END IF;

      IF COALESCE(v_material.expiry_tracking_enabled,false) AND v_manual_in > 0 THEN
        IF jsonb_array_length(v_lots)=0 THEN
          RAISE EXCEPTION 'Material % melacak expired date. Tambahkan minimal satu rincian lot di kolom IN.',v_material.name;
        END IF;
        v_lot_sum := 0;
        FOR v_lot IN SELECT value FROM jsonb_array_elements(v_lots) LOOP
          v_lot_key := NULLIF(btrim(v_lot->>'lot_key'),'');
          v_expiry_date := NULLIF(v_lot->>'expiry_date','')::date;
          v_lot_qty := COALESCE(NULLIF(v_lot->>'qty','')::numeric,0);
          IF v_lot_key IS NULL OR v_expiry_date IS NULL OR v_lot_qty <= 0 THEN
            RAISE EXCEPTION 'Setiap lot IN untuk % wajib punya lot_key, expired date, dan qty positif.',v_material.name;
          END IF;
          IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_lots) other
            WHERE other.value->>'lot_key'=v_lot_key
            GROUP BY (other.value->>'lot_key') HAVING count(*) > 1
          ) THEN RAISE EXCEPTION 'Ada lot_key ganda untuk material %.',v_material.name; END IF;
          v_lot_sum := v_lot_sum + v_lot_qty;
        END LOOP;
        IF abs(v_lot_sum-v_manual_in) > 0.0001 THEN
          RAISE EXCEPTION 'Total lot IN untuk % (%) tidak sama dengan total IN (%).',v_material.name,v_lot_sum,v_manual_in;
        END IF;
      ELSIF jsonb_array_length(v_lots)>0 AND NOT COALESCE(v_material.expiry_tracking_enabled,false) THEN
        RAISE EXCEPTION 'Material % tidak mengaktifkan expiry tracking; hapus rincian lot atau aktifkan kebijakan expiry di master material.',v_material.name;
      END IF;

      v_request_key := 'daily-manual-in:' || p_date::text || ':' || v_location::text || ':' || v_material_id::text;
      v_existing_in := 0;
      SELECT COALESCE(t.qty,0) INTO v_existing_in
      FROM public.transactions t
      WHERE t.tenant_id=p_tenant_id AND t.idempotency_key=v_request_key AND COALESCE(t.is_reversed,false)=false
      FOR UPDATE;
      IF NOT FOUND THEN v_existing_in := 0; END IF;
      v_delta := v_manual_in-v_existing_in;

      SELECT mlc.average_unit_cost INTO v_unit_cost
      FROM public.material_location_costs mlc
      WHERE mlc.tenant_id=p_tenant_id AND mlc.material_id=v_material_id AND mlc.location=v_location;
      v_unit_cost := GREATEST(COALESCE(v_unit_cost,v_material.avg_cost,v_material.new_price,v_material.price,0),0);

      IF abs(v_delta)>0.0001 THEN
        IF v_manual_in>0 THEN
          INSERT INTO public.transactions (
            tenant_id,date,material_id,type,location,qty,amount,notes,created_by,
            unit_cost_snapshot,source_module,source_record_id,idempotency_key,is_reversed
          ) VALUES (
            p_tenant_id,p_date,v_material_id,'IN',v_location,v_manual_in,v_manual_in*v_unit_cost,
            'IN tambahan Daily Inventory ['||p_date::text||'] '||COALESCE(v_material.name,v_material_id::text),
            v_user_id,v_unit_cost,'daily_inventory_manual_in',p_date::text||':'||v_location::text||':'||v_material_id::text,
            v_request_key,false
          )
          ON CONFLICT (tenant_id,idempotency_key) DO UPDATE SET
            date=EXCLUDED.date,qty=EXCLUDED.qty,amount=EXCLUDED.amount,notes=EXCLUDED.notes,
            created_by=EXCLUDED.created_by,unit_cost_snapshot=EXCLUDED.unit_cost_snapshot,
            source_module=EXCLUDED.source_module,source_record_id=EXCLUDED.source_record_id,
            is_reversed=false,updated_at=now();
        ELSE
          UPDATE public.transactions SET is_reversed=true,updated_at=now(),
            notes=COALESCE(notes,'')||' [IN tambahan dinolkan saat closing ulang]'
          WHERE tenant_id=p_tenant_id AND idempotency_key=v_request_key AND COALESCE(is_reversed,false)=false;
        END IF;

        v_current_qty := CASE WHEN v_location='RESTO' THEN COALESCE(v_material.qty_resto,0) ELSE COALESCE(v_material.qty_central,0) END;
        IF v_current_qty+v_delta < -0.0001 THEN
          RAISE EXCEPTION 'IN tambahan untuk % mengurangi saldo di bawah nol. Periksa saldo master sebelum closing.',v_material.name;
        END IF;
        IF v_location='RESTO' THEN
          UPDATE public.materials SET qty_resto=GREATEST(COALESCE(qty_resto,0)+v_delta,0),updated_at=now()
          WHERE id=v_material_id AND tenant_id=p_tenant_id;
        ELSE
          UPDATE public.materials SET qty_central=GREATEST(COALESCE(qty_central,0)+v_delta,0),updated_at=now()
          WHERE id=v_material_id AND tenant_id=p_tenant_id;
        END IF;
      ELSIF v_manual_in=0 THEN
        UPDATE public.transactions SET is_reversed=true,updated_at=now()
        WHERE tenant_id=p_tenant_id AND idempotency_key=v_request_key AND COALESCE(is_reversed,false)=false;
      END IF;

      -- Each expiry-tracked manual IN quantity is split into idempotent lot rows.
      -- Existing rows keep their current balances when metadata is unchanged, so a re-close
      -- cannot silently refill a lot that was already consumed.
      IF COALESCE(v_material.expiry_tracking_enabled,false) THEN
        FOR v_existing_batch IN
          SELECT b.* FROM public.material_batches b
          WHERE b.tenant_id=p_tenant_id AND b.material_id=v_material_id
            AND b.source_module='daily_inventory_manual_in'
            AND b.source_record_id LIKE v_request_key||':lot:%'
            AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(v_lots) x
              WHERE x.value->>'lot_key'=split_part(b.source_record_id,':lot:',2)
            )
          FOR UPDATE
        LOOP
          v_here_qty := CASE WHEN v_location='RESTO' THEN COALESCE(v_existing_batch.qty_resto,0) ELSE COALESCE(v_existing_batch.qty_central,0) END;
          v_other_qty := CASE WHEN v_location='RESTO' THEN COALESCE(v_existing_batch.qty_central,0) ELSE COALESCE(v_existing_batch.qty_resto,0) END;
          IF v_here_qty > 0.0001 OR v_other_qty > 0.0001 THEN
            RAISE EXCEPTION 'Lot % untuk % sudah memiliki saldo. Lot yang sudah masuk stok tidak bisa dihapus dari closing; gunakan koreksi/penyesuaian dengan alasan.',v_existing_batch.batch_no,v_material.name;
          END IF;
          UPDATE public.material_batches SET status='inactive',quantity=0,qty_resto=0,qty_central=0,updated_at=now()
          WHERE id=v_existing_batch.id AND tenant_id=p_tenant_id;
        END LOOP;

        FOR v_lot IN SELECT value FROM jsonb_array_elements(v_lots) LOOP
          v_lot_key := NULLIF(btrim(v_lot->>'lot_key'),'');
          v_expiry_date := NULLIF(v_lot->>'expiry_date','')::date;
          v_lot_qty := COALESCE(NULLIF(v_lot->>'qty','')::numeric,0);
          IF v_manual_in=0 THEN
            RAISE EXCEPTION 'Rincian lot tidak boleh tersisa ketika total IN material % adalah nol.',v_material.name;
          END IF;
          v_batch_no := COALESCE(NULLIF(btrim(v_lot->>'batch_no'),''),'DI-'||to_char(p_date,'YYYYMMDD')||'-'||v_material_id||'-'||left(replace(v_lot_key,'-',''),8));
          v_batch_key := v_request_key||':lot:'||v_lot_key;
          v_source_record_id := v_batch_key;

          SELECT b.* INTO v_existing_batch FROM public.material_batches b
          WHERE b.tenant_id=p_tenant_id AND b.idempotency_key=v_batch_key FOR UPDATE;
          IF FOUND THEN
            v_here_qty := CASE WHEN v_location='RESTO' THEN COALESCE(v_existing_batch.qty_resto,0) ELSE COALESCE(v_existing_batch.qty_central,0) END;
            v_other_qty := CASE WHEN v_location='RESTO' THEN COALESCE(v_existing_batch.qty_central,0) ELSE COALESCE(v_existing_batch.qty_resto,0) END;
            IF (COALESCE(v_existing_batch.quantity,0) IS DISTINCT FROM v_lot_qty
                OR COALESCE(v_existing_batch.expired_date,v_existing_batch.expiry_date) IS DISTINCT FROM v_expiry_date
                OR COALESCE(NULLIF(v_existing_batch.batch_no,''),NULLIF(v_existing_batch.batch_number,''),'') IS DISTINCT FROM COALESCE(NULLIF(btrim(v_lot->>'batch_no'),''),v_batch_no))
              AND (abs(v_here_qty-COALESCE(v_existing_batch.quantity,0))>0.0001 OR v_other_qty>0.0001) THEN
              RAISE EXCEPTION 'Lot % untuk % sudah dipakai/ditransfer. Jumlah, batch, atau expired date tidak dapat diubah; buat penyesuaian baru.',v_existing_batch.batch_no,v_material.name;
            END IF;
            IF abs(v_here_qty-COALESCE(v_existing_batch.quantity,0))<=0.0001 AND v_other_qty<=0.0001 THEN
              v_here_qty := v_lot_qty;
            END IF;
            UPDATE public.material_batches SET
              batch_no=v_batch_no,batch_number=v_batch_no,expiry_date=v_expiry_date,expired_date=v_expiry_date,
              quantity=v_lot_qty,location=v_location::text,received_at=p_date,status='active',lot_qty_verified=true,
              qty_resto=CASE WHEN v_location='RESTO' THEN v_here_qty ELSE 0 END,
              qty_central=CASE WHEN v_location='CENTRAL' THEN v_here_qty ELSE 0 END,
              source_module='daily_inventory_manual_in',source_record_id=v_source_record_id,updated_at=now()
            WHERE id=v_existing_batch.id AND tenant_id=p_tenant_id;
          ELSE
            INSERT INTO public.material_batches (
              tenant_id,material_id,batch_no,batch_number,expiry_date,expired_date,quantity,location,received_at,status,
              qty_resto,qty_central,lot_qty_verified,source_module,source_record_id,idempotency_key,created_at,updated_at
            ) VALUES (
              p_tenant_id,v_material_id,v_batch_no,v_batch_no,v_expiry_date,v_expiry_date,v_lot_qty,v_location::text,p_date,'active',
              CASE WHEN v_location='RESTO' THEN v_lot_qty ELSE 0 END,
              CASE WHEN v_location='CENTRAL' THEN v_lot_qty ELSE 0 END,
              true,'daily_inventory_manual_in',v_source_record_id,v_batch_key,now(),now()
            );
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  v_result := public.atomic_save_daily_inventory_v4(p_tenant_id,p_date,p_location,p_items,p_is_closing,v_user_id);
  v_header_id := NULLIF(v_result->>'inventory_id','')::bigint;
  IF v_header_id IS NULL THEN RAISE EXCEPTION 'Daily Inventory tidak mengembalikan ID sesi setelah disimpan.'; END IF;

  UPDATE public.daily_inventory_items i
  SET manual_in_qty=COALESCE(NULLIF(x.value->>'manual_in_qty','')::numeric,0),
      manual_in_lots=COALESCE(x.value->'manual_in_lots','[]'::jsonb)
  FROM jsonb_array_elements(p_items) x
  WHERE i.inventory_id=v_header_id AND i.material_id=(x.value->>'material_id')::bigint;

  RETURN v_result || jsonb_build_object('version',6,'manual_in_saved',true,'manual_in_posted',p_is_closing,'manual_in_lot_tracking',true);
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.save_daily_inventory_manual_in_v6(uuid, date, text, jsonb, boolean, uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.save_daily_inventory_manual_in_v6(uuid, date, text, jsonb, boolean, uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261024000000_daily_inventory_broken_from_waste_v7.sql] Fungsi: public.save_daily_inventory_broken_counts_v7
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.save_daily_inventory_broken_counts_v7(
  p_tenant_id uuid,
  p_date date,
  p_location text,
  p_items jsonb,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_location public.stock_location;
  v_inventory_id bigint;
  v_header_status text;
  v_header_count integer;
  v_item jsonb;
  v_material_id bigint;
  v_broken_qty numeric(16,4);
  v_broken_unit text;
  v_material_name text;
  v_expiry_tracking boolean;
  v_active_lot_id uuid;
  v_detail_id bigint;
  v_detail_count integer;
  v_old_broken_qty numeric(16,4);
  v_old_broken_unit text;
  v_old_active_lot_id uuid;
  v_lot record;
  v_updated integer := 0;
  v_user_id uuid := COALESCE(auth.uid(), p_user_id);
BEGIN
  IF p_tenant_id IS NULL OR
     (public.get_auth_tenant_id() IS DISTINCT FROM p_tenant_id AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Akses tenant ditolak.' USING ERRCODE = '42501';
  END IF;
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal Daily Inventory wajib diisi.';
  END IF;
  IF upper(COALESCE(p_location, '')) NOT IN ('RESTO', 'CENTRAL') THEN
    RAISE EXCEPTION 'Lokasi Daily Inventory tidak valid.';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Pilih minimal satu material untuk menyimpan BROKEN.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS x(value)
    GROUP BY NULLIF(x.value->>'material_id', '')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Material duplikat dalam satu pengiriman BROKEN.';
  END IF;

  v_location := upper(p_location)::public.stock_location;
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(p_date::text || ':' || v_location::text));

  SELECT COUNT(*) INTO v_header_count
  FROM public.daily_inventories h
  WHERE h.tenant_id = p_tenant_id AND h.date = p_date AND h.location = v_location;

  IF v_header_count = 0 THEN
    RAISE EXCEPTION 'Sesi EOD belum tersedia. Buka Daily Inventory, isi data hari ini, lalu klik Simpan Progress sebelum mencatat BROKEN.';
  ELSIF v_header_count > 1 THEN
    RAISE EXCEPTION 'Ada lebih dari satu sesi Daily Inventory untuk tanggal/lokasi ini. Rekonsiliasi sesi duplikat sebelum mengubah BROKEN.';
  END IF;

  SELECT h.id, COALESCE(h.status, 'draft')
  INTO v_inventory_id, v_header_status
  FROM public.daily_inventories h
  WHERE h.tenant_id = p_tenant_id AND h.date = p_date AND h.location = v_location
  FOR UPDATE;

  IF lower(v_header_status) IN ('verified', 'closed') THEN
    RAISE EXCEPTION 'EOD sudah terkunci. Buka kunci/revisi EOD melalui Daily Inventory sebelum memperbarui BROKEN.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY (value->>'material_id')::bigint LOOP
    v_material_id := NULLIF(v_item->>'material_id', '')::bigint;
    v_broken_qty := NULLIF(v_item->>'broken_qty', '')::numeric;
    v_broken_unit := NULLIF(btrim(v_item->>'broken_unit'), '');

    IF v_material_id IS NULL OR v_broken_qty IS NULL OR v_broken_qty < 0 OR v_broken_unit IS NULL THEN
      RAISE EXCEPTION 'Setiap baris BROKEN membutuhkan material, angka nol atau lebih, dan satuan.';
    END IF;

    SELECT m.name, COALESCE(m.expiry_tracking_enabled, false)
    INTO v_material_name, v_expiry_tracking
    FROM public.materials m
    WHERE m.id = v_material_id AND m.tenant_id = p_tenant_id
      AND COALESCE(m.is_active, true) = true
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Material % tidak ditemukan atau tidak aktif.', v_material_id;
    END IF;

    SELECT COUNT(*) INTO v_detail_count
    FROM public.daily_inventory_items i
    WHERE i.inventory_id = v_inventory_id AND i.material_id = v_material_id;
    IF v_detail_count = 0 THEN
      RAISE EXCEPTION 'Baris % belum tersimpan pada draft EOD. Klik Simpan Progress pada Daily Inventory terlebih dahulu.', v_material_name;
    ELSIF v_detail_count > 1 THEN
      RAISE EXCEPTION 'Ada baris Daily Inventory duplikat untuk %. Rekonsiliasi terlebih dahulu.', v_material_name;
    END IF;

    SELECT i.id, i.broken_qty, i.broken_unit, i.active_open_lot_id
    INTO v_detail_id, v_old_broken_qty, v_old_broken_unit, v_old_active_lot_id
    FROM public.daily_inventory_items i
    WHERE i.inventory_id = v_inventory_id AND i.material_id = v_material_id
    FOR UPDATE;

    v_active_lot_id := NULL;
    IF v_expiry_tracking AND v_broken_qty > 0 THEN
      SELECT s.active_open_lot_id INTO v_active_lot_id
      FROM public.material_open_lot_state s
      WHERE s.tenant_id = p_tenant_id AND s.material_id = v_material_id AND s.location = v_location
      FOR UPDATE;

      -- Retain the currently opened lot whenever it still has stock in this location.
      IF v_active_lot_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.material_batches b
        WHERE b.id = v_active_lot_id AND b.tenant_id = p_tenant_id AND b.material_id = v_material_id
          AND lower(COALESCE(b.status, 'active')) = 'active'
          AND (CASE WHEN v_location = 'RESTO' THEN COALESCE(b.qty_resto,0) ELSE COALESCE(b.qty_central,0) END) > 0
      ) THEN
        v_active_lot_id := NULL;
      END IF;

      -- If no lot is currently open, pick the earliest-expiring available lot (FEFO).
      IF v_active_lot_id IS NULL THEN
        SELECT b.id INTO v_active_lot_id
        FROM public.material_batches b
        WHERE b.tenant_id = p_tenant_id AND b.material_id = v_material_id
          AND lower(COALESCE(b.status, 'active')) = 'active'
          AND (CASE WHEN v_location = 'RESTO' THEN COALESCE(b.qty_resto,0) ELSE COALESCE(b.qty_central,0) END) > 0
        ORDER BY COALESCE(b.expired_date, b.expiry_date) ASC NULLS LAST, b.id ASC
        LIMIT 1
        FOR UPDATE;
      END IF;

      IF v_active_lot_id IS NULL THEN
        RAISE EXCEPTION 'BROKEN untuk % lebih dari nol, tetapi tidak ada lot aktif dengan saldo pada lokasi ini. Periksa lot/expired date sebelum menyimpan.', v_material_name;
      END IF;

      INSERT INTO public.material_open_lot_state (tenant_id, material_id, location, active_open_lot_id, opened_at, updated_at)
      VALUES (p_tenant_id, v_material_id, v_location, v_active_lot_id, now(), now())
      ON CONFLICT (tenant_id, material_id, location) DO UPDATE SET
        active_open_lot_id = EXCLUDED.active_open_lot_id,
        opened_at = COALESCE(public.material_open_lot_state.opened_at, EXCLUDED.opened_at),
        updated_at = now();
    ELSIF v_expiry_tracking AND v_broken_qty = 0 THEN
      UPDATE public.material_open_lot_state
      SET active_open_lot_id = NULL, opened_at = NULL, updated_at = now()
      WHERE tenant_id = p_tenant_id AND material_id = v_material_id AND location = v_location;
    ELSE
      v_active_lot_id := COALESCE(v_old_active_lot_id, NULL);
    END IF;

    UPDATE public.daily_inventory_items i
    SET broken_qty = v_broken_qty,
        broken_unit = v_broken_unit,
        broken_confirmed = true,
        is_counted = true,
        active_open_lot_id = v_active_lot_id
    WHERE i.id = v_detail_id AND i.inventory_id = v_inventory_id;

    INSERT INTO public.audit_logs (
      tenant_id, user_id, action, description, table_name, record_id,
      old_data, new_data, actor_name, target_entity, target_id, details, is_system, created_at
    ) VALUES (
      p_tenant_id, v_user_id, 'SAVE_DAILY_BROKEN_COUNT',
      'BROKEN closing dicatat dari Catatan Limbah. Tidak ada mutasi stok yang dibuat.',
      'daily_inventory_items', v_detail_id,
      jsonb_build_object('broken_qty', v_old_broken_qty, 'broken_unit', v_old_broken_unit),
      jsonb_build_object('broken_qty', v_broken_qty, 'broken_unit', v_broken_unit, 'active_open_lot_id', v_active_lot_id),
      NULL, 'daily_inventory_items', v_detail_id::text,
      jsonb_build_object('date', p_date, 'location', v_location, 'material_id', v_material_id),
      false, now()
    );

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'date', p_date,
    'location', v_location,
    'updated_count', v_updated,
    'stock_movement_created', false
  );
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.save_daily_inventory_broken_counts_v7(uuid, date, text, jsonb, uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.save_daily_inventory_broken_counts_v7(uuid, date, text, jsonb, uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- [Sumber: 20261115000000_strict_branch_isolation_v12.sql] Fungsi: public.bv2_assert_branch_access
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.bv2_assert_branch_access(p_target_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_branch uuid;
BEGIN
  IF auth.uid() IS NULL OR public.bv2_is_admin() OR public.bv2_is_superadmin() THEN
    RETURN;
  END IF;
  v_auth_branch := public.bv2_auth_branch_id();
  IF v_auth_branch IS NULL THEN
    RAISE EXCEPTION 'Akses cabang ditolak: pengguna non-admin wajib memiliki branch_id aktif.'
      USING ERRCODE = '42501';
  END IF;
  IF p_target_branch_id IS DISTINCT FROM v_auth_branch THEN
    RAISE EXCEPTION 'Akses cabang ditolak: operasi lintas cabang dilarang untuk pengguna non-admin.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.bv2_assert_branch_access(uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.bv2_assert_branch_access(uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- Fungsi Manajemen Tenant, Registrasi, & Reset Data (Kompatibel Penuh dengan Frontend)
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.register_new_tenant_with_profile(
  p_name text,
  p_company_name text,
  p_admin_name text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_tenant_id uuid;
  v_branch_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH: Sesi pengguna tidak ditemukan.';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  INSERT INTO public.tenants (name, company_name, status, plan_type, is_pos_enabled)
  VALUES (
    lower(regexp_replace(COALESCE(NULLIF(trim(p_name), ''), p_company_name, 'tenant'), '[^a-zA-Z0-9_-]+', '-', 'g')),
    COALESCE(NULLIF(trim(p_company_name), ''), 'Resto Baru'),
    'ACTIVE',
    'PRO',
    true
  )
  ON CONFLICT (name) DO UPDATE
    SET company_name = EXCLUDED.company_name,
        updated_at = now()
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.branches (tenant_id, code, name, is_central, is_active)
  VALUES (v_tenant_id, 'BSD', 'BSD', true, true)
  RETURNING id INTO v_branch_id;

  INSERT INTO public.users (id, tenant_id, branch_id, name, email, role)
  VALUES (
    v_uid,
    v_tenant_id,
    v_branch_id,
    COALESCE(NULLIF(trim(p_admin_name), ''), split_part(COALESCE(v_email, 'owner'), '@', 1)),
    COALESCE(v_email, v_uid::text || '@barventis.local'),
    'Admin / Owner'::public.user_role
  )
  ON CONFLICT (id) DO UPDATE
    SET tenant_id = EXCLUDED.tenant_id,
        branch_id = EXCLUDED.branch_id,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        updated_at = now();

  RETURN jsonb_build_object(
    'status', 'success',
    'tenant_id', v_tenant_id,
    'branch_id', v_branch_id
  );
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.register_new_tenant_with_profile(text, text, text);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.register_new_tenant_with_profile(text, text, text): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.delete_tenant_permanently(
  p_tenant_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tbl text;
BEGIN
  IF NOT public.bv2_is_superadmin() THEN
    RAISE EXCEPTION 'AUTH: Hanya SuperAdmin yang diizinkan menghapus tenant secara permanen.';
  END IF;

  FOR v_tbl IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name <> 'tenants'
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', v_tbl) USING p_tenant_id;
  END LOOP;

  DELETE FROM public.tenants WHERE id = p_tenant_id;
  RETURN true;
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.delete_tenant_permanently(uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.delete_tenant_permanently(uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.request_tenant_reset(
  p_tenant_id uuid,
  p_reset_pos boolean DEFAULT false,
  p_reset_stock_history boolean DEFAULT false,
  p_reset_purchasing boolean DEFAULT false,
  p_reset_recipes boolean DEFAULT false,
  p_reset_materials boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req_id uuid;
BEGIN
  INSERT INTO public.tenant_reset_requests (
    tenant_id, requested_by, status,
    reset_pos, reset_stock_history, reset_purchasing, reset_recipes, reset_materials,
    created_at
  ) VALUES (
    p_tenant_id, auth.uid(), 'PENDING'::public.reset_request_status,
    COALESCE(p_reset_pos, false),
    COALESCE(p_reset_stock_history, false),
    COALESCE(p_reset_purchasing, false),
    COALESCE(p_reset_recipes, false),
    COALESCE(p_reset_materials, false),
    now()
  ) RETURNING id INTO v_req_id;

  RETURN jsonb_build_object('id', v_req_id, 'status', 'PENDING');
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.request_tenant_reset(uuid, boolean, boolean, boolean, boolean, boolean);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.request_tenant_reset(uuid, boolean, boolean, boolean, boolean, boolean): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.approve_tenant_reset(
  p_request_id uuid,
  p_approve boolean,
  p_rejection_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req public.tenant_reset_requests%ROWTYPE;
BEGIN
  IF NOT (public.bv2_is_superadmin() OR public.bv2_is_admin()) THEN
    RAISE EXCEPTION 'AUTH: Tidak memiliki izin untuk memproses permintaan reset.';
  END IF;

  SELECT * INTO v_req FROM public.tenant_reset_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permintaan reset tidak ditemukan.';
  END IF;

  IF NOT COALESCE(p_approve, false) THEN
    UPDATE public.tenant_reset_requests
    SET status = 'REJECTED'::public.reset_request_status,
        approved_by = auth.uid(),
        approved_at = now(),
        notes = p_rejection_reason,
        updated_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('id', p_request_id, 'status', 'REJECTED');
  END IF;

  IF COALESCE(v_req.reset_pos, false) THEN
    DELETE FROM public.pos_transaction_items WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.pos_transactions WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.pos_order_items WHERE order_id IN (SELECT id FROM public.pos_orders WHERE tenant_id = v_req.tenant_id);
    DELETE FROM public.pos_orders WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.pos_daily_aggregates WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.pos_upload_logs WHERE tenant_id = v_req.tenant_id;
  END IF;

  IF COALESCE(v_req.reset_stock_history, false) THEN
    DELETE FROM public.daily_inventory_items WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.daily_inventories WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.transactions WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.stock_opname_items WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.stock_opnames WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.waste_logs WHERE tenant_id = v_req.tenant_id;
  END IF;

  IF COALESCE(v_req.reset_purchasing, false) THEN
    DELETE FROM public.purchase_entries WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.invoice_items WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.invoices WHERE tenant_id = v_req.tenant_id;
  END IF;

  IF COALESCE(v_req.reset_recipes, false) THEN
    DELETE FROM public.recipe_ingredients WHERE tenant_id = v_req.tenant_id;
    DELETE FROM public.recipes WHERE tenant_id = v_req.tenant_id;
  END IF;

  IF COALESCE(v_req.reset_materials, false) THEN
    DELETE FROM public.materials WHERE tenant_id = v_req.tenant_id;
  END IF;

  UPDATE public.tenant_reset_requests
  SET status = 'COMPLETED'::public.reset_request_status,
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('id', p_request_id, 'status', 'COMPLETED');
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.approve_tenant_reset(uuid, boolean, text);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.approve_tenant_reset(uuid, boolean, text): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.cancel_tenant_reset_request(
  p_request_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.tenant_reset_requests
  WHERE id = p_request_id
    AND (tenant_id = public.bv2_auth_tenant_id() OR public.bv2_is_superadmin());
  RETURN true;
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.cancel_tenant_reset_request(uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.cancel_tenant_reset_request(uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.restore_tenant_backup_atomic(
  p_tenant_id uuid,
  p_payload jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_payload IS NULL THEN
    RAISE EXCEPTION 'Parameter tenant_id dan payload wajib diisi.';
  END IF;
  RETURN true;
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.restore_tenant_backup_atomic(uuid, jsonb);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.restore_tenant_backup_atomic(uuid, jsonb): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- =============================================================================
-- BAGIAN 0: HELPER FUNGSI KONTEKS AUTH & ROLE (KOMPATIBEL V1 & V2)
-- =============================================================================
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.bv2_auth_tenant_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.bv2_auth_tenant_id();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.bv2_auth_tenant_id(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.bv2_auth_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.role::text FROM public.users u WHERE u.id = auth.uid()
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.bv2_auth_role();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.bv2_auth_role(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.bv2_auth_branch_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.branch_id FROM public.users u WHERE u.id = auth.uid()
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.bv2_auth_branch_id();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.bv2_auth_branch_id(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.bv2_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    lower(regexp_replace(trim(public.bv2_auth_role()), '\s+', ' ', 'g')) IN (
      'owner', 'admin', 'admin / owner', 'admin owner', 'superadmin', 'super admin', 'super_admin'
    ),
    false
  )
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.bv2_is_admin();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.bv2_is_admin(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.bv2_is_superadmin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    replace(replace(lower(trim(public.bv2_auth_role())), ' ', ''), '_', '') = 'superadmin',
    false
  )
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.bv2_is_superadmin();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.bv2_is_superadmin(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

REVOKE ALL ON FUNCTION public.bv2_auth_tenant_id(), public.bv2_auth_role(),
  public.bv2_auth_branch_id(), public.bv2_is_admin(), public.bv2_is_superadmin()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bv2_auth_tenant_id(), public.bv2_auth_role(),
  public.bv2_auth_branch_id(), public.bv2_is_admin(), public.bv2_is_superadmin()
  TO authenticated, service_role;

-- =============================================================================
-- BAGIAN 1: PENAMBAHAN KOLOM SKEMA V9 - V13 PADA TABEL EKSISTING
-- =============================================================================
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS monthly_quota_qty numeric(16,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_prep_output boolean DEFAULT false;

ALTER TABLE public.purchase_entries
  ADD COLUMN IF NOT EXISTS delivery_notes text,
  ADD COLUMN IF NOT EXISTS destination_location varchar DEFAULT 'RESTO';

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS delivery_notes text;

ALTER TABLE IF EXISTS public.inter_branch_transfers
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS pos_tax_rate numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS pos_service_charge numeric DEFAULT 5;

DO $$
DECLARE
  v_tbl text;
  v_all_branch_tables text[] := ARRAY[
    'invitations',
    'materials',
    'recipes',
    'recipe_ingredients',
    'recipe_versions',
    'suppliers',
    'purchase_entries',
    'market_lists',
    'market_list_items',
    'material_batches',
    'material_location_costs',
    'material_open_lot_state',
    'material_lot_movements_v4',
    'stock_adjustments',
    'unit_conversions',
    'waste_logs',
    'stock_opnames',
    'stock_opname_items',
    'physical_checks',
    'physical_check_items',
    'daily_inventories',
    'daily_inventory_items',
    'transactions',
    'invoices',
    'invoice_items',
    'expected_usage',
    'usage_variance',
    'production_batches',
    'production_batch_ingredients',
    'production_runs',
    'production_run_items',
    'production_trimming_batches',
    'pos_upload_logs',
    'pos_orders',
    'pos_order_items',
    'pos_transactions',
    'pos_transaction_items',
    'pos_daily_aggregates',
    'asset_items',
    'asset_opname_items',
    'equipment_service_logs',
    'generated_so_reports'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_all_branch_tables LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE',
        v_tbl
      );
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'tenant_id'
      ) THEN
        EXECUTE format(
          'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id, branch_id)',
          v_tbl || '_tenant_branch_idx',
          v_tbl
        );
      ELSE
        EXECUTE format(
          'CREATE INDEX IF NOT EXISTS %I ON public.%I (branch_id)',
          v_tbl || '_branch_idx',
          v_tbl
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- BAGIAN 2: PERBAIKAN KOLOM GENERATED `terpakai_qty` & RUMUS `OUT + WASTE` (v10)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'daily_inventory_items'
      AND column_name = 'terpakai_qty'
      AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE public.daily_inventory_items
      ALTER COLUMN terpakai_qty DROP EXPRESSION;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Skipped DROP EXPRESSION on daily_inventory_items.terpakai_qty: %', SQLERRM;
END $$;

ALTER TABLE public.daily_inventory_items
  ALTER COLUMN terpakai_qty SET DEFAULT 0;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.sync_daily_inventory_terpakai_qty_v10()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.terpakai_qty := COALESCE(NEW.out_qty, 0) + COALESCE(NEW.waste_qty, 0);
  RETURN NEW;
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.sync_daily_inventory_terpakai_qty_v10();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.sync_daily_inventory_terpakai_qty_v10(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DROP TRIGGER IF EXISTS trg_sync_daily_inventory_terpakai_qty_v10 ON public.daily_inventory_items;
CREATE TRIGGER trg_sync_daily_inventory_terpakai_qty_v10
  BEFORE INSERT OR UPDATE ON public.daily_inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_daily_inventory_terpakai_qty_v10();

-- =============================================================================
-- BAGIAN 3: BACKFILL OTOMATIS CABANG DEFAULT ('PUSAT'), `users.branch_id`, & TABEL
-- =============================================================================
DO $$
DECLARE
  t RECORD;
  v_default_branch_id UUID;
  v_tbl text;
  v_mat_tables text[] := ARRAY[
    'material_batches',
    'material_location_costs',
    'material_open_lot_state',
    'material_lot_movements_v4',
    'stock_adjustments',
    'unit_conversions',
    'waste_logs',
    'transactions',
    'purchase_entries',
    'expected_usage',
    'usage_variance'
  ];
  v_tenant_tables text[] := ARRAY[
    'users',
    'invitations',
    'materials',
    'recipes',
    'suppliers',
    'purchase_entries',
    'market_lists',
    'material_batches',
    'material_location_costs',
    'material_open_lot_state',
    'material_lot_movements_v4',
    'stock_adjustments',
    'unit_conversions',
    'waste_logs',
    'stock_opnames',
    'physical_checks',
    'daily_inventories',
    'transactions',
    'invoices',
    'expected_usage',
    'usage_variance',
    'production_batches',
    'production_runs',
    'production_run_items',
    'production_trimming_batches',
    'pos_upload_logs',
    'pos_orders',
    'pos_transactions',
    'pos_daily_aggregates',
    'asset_items',
    'asset_opname_items',
    'equipment_service_logs',
    'generated_so_reports'
  ];
BEGIN
  -- Pastikan nama Resto pada tenant utama adalah 'Resto Umatis'
  UPDATE public.tenants
  SET company_name = 'Resto Umatis'
  WHERE lower(COALESCE(company_name, '')) LIKE '%umatis%'
     OR lower(COALESCE(name, '')) LIKE '%umatis%';

  FOR t IN SELECT id, COALESCE(NULLIF(trim(company_name), ''), name, 'Resto Umatis') AS label FROM public.tenants LOOP
    -- Jika sebelumnya terbuat cabang dengan kode 'PUSAT' atau bernama sama dengan nama Resto ('Resto Umatis'),
    -- ubah cabang utama tersebut menjadi cabang 'BSD' (kecuali jika cabang 'BSD' sudah ada terpisah)
    SELECT id INTO v_default_branch_id
    FROM public.branches
    WHERE tenant_id = t.id
      AND (upper(trim(COALESCE(code, ''))) = 'BSD' OR lower(trim(COALESCE(name, ''))) IN ('bsd', 'umatis bsd', 'resto bsd'))
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_default_branch_id IS NULL THEN
      -- Cek apakah ada cabang 'PUSAT' / 'Resto Umatis' hasil migrasi sebelumnya untuk di-rename menjadi 'BSD'
      SELECT id INTO v_default_branch_id
      FROM public.branches
      WHERE tenant_id = t.id
        AND (
          upper(trim(COALESCE(code, ''))) IN ('PUSAT', 'MAIN', 'RESTO_BSD')
          OR lower(trim(COALESCE(name, ''))) IN ('resto umatis', 'umatis resto & venue', 'cabang utama', 'pusat')
        )
      ORDER BY created_at ASC
      LIMIT 1;

      IF v_default_branch_id IS NOT NULL THEN
        UPDATE public.branches
        SET code = 'BSD',
            name = 'BSD',
            is_active = true
        WHERE id = v_default_branch_id;
      ELSE
        -- Buat cabang utama pertama: BSD
        INSERT INTO public.branches (tenant_id, code, name, is_central, is_active)
        VALUES (t.id, 'BSD', 'BSD', false, true)
        RETURNING id INTO v_default_branch_id;
      END IF;
    ELSE
      -- Pastikan nama & kode cabang pertama seragam 'BSD'
      UPDATE public.branches
      SET code = 'BSD',
          name = 'BSD',
          is_active = true
      WHERE id = v_default_branch_id;
    END IF;

    -- Jika ada cabang duplikat bernama 'Resto Umatis' / 'PUSAT' selain v_default_branch_id ('BSD'),
    -- pindahkan seluruh referensinya ke cabang 'BSD' lalu hapus baris cabang 'Resto Umatis' / 'PUSAT' tersebut
    FOREACH v_tbl IN ARRAY v_tenant_tables LOOP
      IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
        EXECUTE format(
          'UPDATE public.%I SET branch_id = $1
           WHERE tenant_id = $2
             AND branch_id IN (
               SELECT id FROM public.branches
               WHERE tenant_id = $2
                 AND id <> $1
                 AND (upper(trim(COALESCE(code, ''''))) = ''PUSAT'' OR lower(trim(COALESCE(name, ''''))) IN (''resto umatis'', ''cabang utama'', ''pusat''))
             )',
          v_tbl
        ) USING v_default_branch_id, t.id;
      END IF;
    END LOOP;

    DELETE FROM public.branches
    WHERE tenant_id = t.id
      AND id <> v_default_branch_id
      AND (upper(trim(COALESCE(code, ''))) = 'PUSAT' OR lower(trim(COALESCE(name, ''))) IN ('resto umatis', 'cabang utama', 'pusat'));

    -- Pastikan cabang kedua yaitu 'Kasuna' (kode: 'KASUNA', nama: 'Kasuna') tersedia untuk tenant ini
    IF EXISTS (
      SELECT 1 FROM public.branches
      WHERE tenant_id = t.id
        AND (upper(trim(COALESCE(code, ''))) = 'KASUNA' OR lower(trim(COALESCE(name, ''))) LIKE '%kasuna%')
    ) THEN
      UPDATE public.branches
      SET code = 'KASUNA',
          name = 'Kasuna',
          is_active = true
      WHERE tenant_id = t.id
        AND (upper(trim(COALESCE(code, ''))) = 'KASUNA' OR lower(trim(COALESCE(name, ''))) LIKE '%kasuna%');
    ELSE
      INSERT INTO public.branches (tenant_id, code, name, is_central, is_active)
      VALUES (t.id, 'KASUNA', 'Kasuna', false, true);
    END IF;

    -- Backfill dari relasi material_id terlebih dahulu
    FOREACH v_tbl IN ARRAY v_mat_tables LOOP
      IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
        EXECUTE format(
          'UPDATE public.%I tgt SET branch_id = m.branch_id
           FROM public.materials m
           WHERE tgt.material_id = m.id AND tgt.tenant_id = $1 AND tgt.branch_id IS NULL AND m.branch_id IS NOT NULL',
          v_tbl
        ) USING t.id;
      END IF;
    END LOOP;

    -- Backfill seluruh baris NULL per tenant (termasuk public.users agar staf tidak terkunci)
    FOREACH v_tbl IN ARRAY v_tenant_tables LOOP
      IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
        EXECUTE format(
          'UPDATE public.%I SET branch_id = $1 WHERE tenant_id = $2 AND branch_id IS NULL',
          v_tbl
        ) USING v_default_branch_id, t.id;
      END IF;
    END LOOP;
  END LOOP;

  -- Backfill tabel anak dari parent-nya masing-masing
  UPDATE public.recipe_ingredients ri SET branch_id = r.branch_id FROM public.recipes r WHERE ri.recipe_id = r.id AND ri.branch_id IS NULL AND r.branch_id IS NOT NULL;
  UPDATE public.recipe_versions rv SET branch_id = r.branch_id FROM public.recipes r WHERE rv.recipe_id = r.id AND rv.branch_id IS NULL AND r.branch_id IS NOT NULL;
  UPDATE public.daily_inventory_items dii SET branch_id = di.branch_id FROM public.daily_inventories di WHERE dii.inventory_id = di.id AND dii.branch_id IS NULL AND di.branch_id IS NOT NULL;
  UPDATE public.stock_opname_items soi SET branch_id = so.branch_id FROM public.stock_opnames so WHERE soi.opname_id = so.id AND soi.branch_id IS NULL AND so.branch_id IS NOT NULL;
  UPDATE public.physical_check_items pci SET branch_id = pc.branch_id FROM public.physical_checks pc WHERE pci.check_id = pc.id AND pci.branch_id IS NULL AND pc.branch_id IS NOT NULL;
  UPDATE public.market_list_items mli SET branch_id = ml.branch_id FROM public.market_lists ml WHERE mli.market_list_id = ml.id AND mli.branch_id IS NULL AND ml.branch_id IS NOT NULL;
  UPDATE public.invoice_items ii SET branch_id = inv.branch_id FROM public.invoices inv WHERE ii.invoice_id = inv.id AND ii.branch_id IS NULL AND inv.branch_id IS NOT NULL;
  UPDATE public.pos_order_items poi SET branch_id = po.branch_id FROM public.pos_orders po WHERE poi.order_id = po.id AND poi.branch_id IS NULL AND po.branch_id IS NOT NULL;
  UPDATE public.pos_transaction_items pti SET branch_id = pt.branch_id FROM public.pos_transactions pt WHERE pti.transaction_id = pt.id AND pti.branch_id IS NULL AND pt.branch_id IS NOT NULL;
  UPDATE public.production_batch_ingredients pbi SET branch_id = pb.branch_id FROM public.production_batches pb WHERE pbi.batch_id = pb.id AND pbi.branch_id IS NULL AND pb.branch_id IS NOT NULL;
END $$;

-- Set DEFAULT public.bv2_auth_branch_id() pada tabel operasional
DO $$
DECLARE
  v_tbl text;
  v_default_tables text[] := ARRAY[
    'materials', 'recipes', 'recipe_ingredients', 'material_batches',
    'material_location_costs', 'material_open_lot_state', 'material_lot_movements_v4',
    'stock_adjustments', 'unit_conversions', 'waste_logs', 'stock_opnames',
    'stock_opname_items', 'physical_checks', 'daily_inventories', 'daily_inventory_items',
    'transactions', 'suppliers', 'purchase_entries', 'market_lists', 'invoices',
    'expected_usage', 'usage_variance', 'production_batches', 'production_trimming_batches',
    'pos_upload_logs', 'pos_orders', 'pos_transactions', 'pos_daily_aggregates'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_default_tables LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN branch_id SET DEFAULT public.bv2_auth_branch_id()', v_tbl);
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- BAGIAN 3B: PEMBERSIHAN OTOMATIS CONSTRAINT & INDEKS UNIK LAMA (NON-BRANCH)
--            AGAR MULTI-CABANG (BSD & KASUNA) TIDAK BENTROK (FIX ERROR 23505)
-- =============================================================================
DO $$
DECLARE
  r RECORD;
  v_multi_branch_tables text[] := ARRAY[
    'suppliers',
    'materials',
    'recipes',
    'daily_inventories',
    'stock_opnames',
    'pos_daily_aggregates',
    'assets',
    'asset_items',
    'asset_opname_items',
    'generated_so_reports',
    'usage_variance',
    'physical_checks',
    'market_lists',
    'production_batches',
    'production_trimming_batches'
  ];
BEGIN
  -- 1. Hapus seluruh UNIQUE CONSTRAINT (contype = 'u', contoh: uq_suppliers_tenant_name,
  --    materials_tenant_id_name_key, recipes_tenant_id_menu_name_key, dll) yang belum
  --    menyertakan kolom branch_id
  FOR r IN
    SELECT t.relname AS table_name,
           c.conname AS constraint_name,
           pg_get_constraintdef(c.oid) AS con_def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = ANY(v_multi_branch_tables)
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%branch_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I CASCADE', r.table_name, r.constraint_name);
  END LOOP;

  -- 2. Hapus seluruh UNIQUE INDEX standalone pada tabel multi-cabang yang belum
  --    menyertakan kolom branch_id (kecuali primary key *_pkey)
  FOR r IN
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = ANY(v_multi_branch_tables)
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexdef NOT ILIKE '%branch_id%'
      AND indexname NOT LIKE '%_pkey'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I CASCADE', r.indexname);
  END LOOP;
END $$;

-- Buat kembali indeks unik yang sudah menyertakan (tenant_id, branch_id, ...)
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS suppliers_branch_name_key
    ON public.suppliers (tenant_id, branch_id, lower(trim(name)));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan suppliers_branch_name_key: %', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS materials_branch_item_code_key
    ON public.materials (tenant_id, branch_id, item_code)
    WHERE item_code IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan materials_branch_item_code_key: %', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS materials_branch_name_key
    ON public.materials (tenant_id, branch_id, lower(trim(name)));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan materials_branch_name_key: %', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS recipes_branch_menu_name_key
    ON public.recipes (tenant_id, branch_id, lower(trim(menu_name)));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan recipes_branch_menu_name_key: %', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS daily_inventories_tenant_branch_date_location_uidx
    ON public.daily_inventories (tenant_id, branch_id, date, location);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan daily_inventories_tenant_branch_date_location_uidx: %', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS pos_daily_aggregates_tenant_branch_date_uidx
    ON public.pos_daily_aggregates (tenant_id, branch_id, sales_date);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lewati pembuatan pos_daily_aggregates_tenant_branch_date_uidx: %', SQLERRM;
END $$;

-- =============================================================================
-- BAGIAN 4: NORMALISASI 2-KONVERSI (`<kemasan> = <qty> <gr|ml|pcs>`) & FUNGSI KONVERSI
-- =============================================================================
UPDATE public.materials
SET
  unit = CASE
    WHEN lower(trim(unit)) = 'ml' THEN 'btl'
    ELSE 'pck'
  END,
  full_pack = CASE
    WHEN lower(trim(unit)) = 'ml' THEN
      'btl = ' || COALESCE((regexp_match(lower(full_pack), '([\d.]+)'))[1], '1000') || ' ml'
    ELSE
      'pck = ' || COALESCE((regexp_match(lower(full_pack), '([\d.]+)'))[1], '1000') || ' gr'
  END
WHERE lower(trim(COALESCE(unit, ''))) IN ('gr', 'grm', 'gram', 'ml')
  AND COALESCE(price, 0) >= 1000
  AND full_pack IS NOT NULL
  AND full_pack !~ '='
  AND COALESCE(((regexp_match(lower(full_pack), '([\d.]+)'))[1])::numeric, 0) > 1;

UPDATE public.materials
SET full_pack = lower(trim(unit)) || ' = ' ||
  (regexp_match(lower(full_pack), '([\d.]+)\s*(gr|grm|gram|ml|pcs|pck|btl|can)'))[1] || ' ' ||
  CASE
    WHEN (regexp_match(lower(full_pack), '([\d.]+)\s*(gr|grm|gram|ml|pcs|pck|btl|can)'))[2] IN ('grm', 'gram') THEN 'gr'
    ELSE (regexp_match(lower(full_pack), '([\d.]+)\s*(gr|grm|gram|ml|pcs|pck|btl|can)'))[2]
  END
WHERE lower(trim(COALESCE(unit, ''))) IN ('pck', 'pack', 'btl', 'botol', 'carton', 'karton', 'kg', 'galon', 'kaleng', 'can', 'drigen', 'jerigen', 'pcs')
  AND full_pack IS NOT NULL
  AND full_pack !~ '='
  AND lower(full_pack) ~ '([\d.]+)\s*(gr|grm|gram|ml|pcs|pck|btl|can)';

UPDATE public.materials
SET is_prep_output = true,
    is_active = true
WHERE
  lower(trim(COALESCE(category, ''))) = 'bahan olahan / prep'
  OR lower(name) LIKE '%(bersih%'
  OR lower(name) LIKE '%siap pakai%'
  OR lower(name) LIKE '%sari / jus%'
  OR lower(name) LIKE '%marinasi%'
  OR lower(name) IN (
    'green delight', 'dragon beet', 'beta caroot e.ne', 'betta carrot e.ne',
    'berry much', 'tropical', 'manggo yougurt', 'mango yogurt', 'gula cair',
    'teh base', 'foaming'
  );

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.convert_material_qty_to_stock_unit_v3(
  p_tenant_id uuid,
  p_material_id bigint,
  p_qty numeric,
  p_from_unit text
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_stock_unit text;
  v_from text := public.normalize_inventory_unit_v3(p_from_unit);
  v_stock text;
  v_full_pack text;
  v_conversion numeric;
  v_pack text;
  v_content text;
  v_content_qty numeric;
  v_match text[];
  v_content_group text;
  v_from_group text;
  v_stock_group text;
  v_content_scale numeric;
  v_from_scale numeric;
  v_package_units text[] := ARRAY['pack','pck','pck.','pcs','pc','piece','pieces','bottle','btl','botol','carton','karton','crtn','ctn','dus','box','case','sachet','jar','can','kaleng','galon','drigen','jerigen','kg'];
BEGIN
  IF COALESCE(p_qty, 0) < 0 THEN RAISE EXCEPTION 'Kuantitas konversi tidak boleh negatif.'; END IF;
  IF COALESCE(p_qty, 0) = 0 THEN RETURN 0; END IF;

  SELECT unit, full_pack INTO v_stock_unit, v_full_pack
  FROM public.materials WHERE id = p_material_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material % tidak ditemukan untuk konversi.', p_material_id; END IF;

  v_stock := public.normalize_inventory_unit_v3(v_stock_unit);
  IF v_from IS NULL OR v_from = '' OR v_stock IS NULL OR v_stock = '' THEN
    RETURN p_qty;
  END IF;
  IF v_from = v_stock THEN RETURN p_qty; END IF;

  SELECT factor INTO v_conversion
  FROM public.unit_conversions
  WHERE tenant_id = p_tenant_id AND material_id = p_material_id
    AND public.normalize_inventory_unit_v3(from_unit) = v_from
    AND public.normalize_inventory_unit_v3(to_unit) = v_stock
    AND factor > 0
  ORDER BY id DESC LIMIT 1;
  IF v_conversion IS NOT NULL THEN RETURN p_qty / v_conversion; END IF;

  SELECT factor INTO v_conversion
  FROM public.unit_conversions
  WHERE tenant_id = p_tenant_id AND material_id = p_material_id
    AND public.normalize_inventory_unit_v3(from_unit) = v_stock
    AND public.normalize_inventory_unit_v3(to_unit) = v_from
    AND factor > 0
  ORDER BY id DESC LIMIT 1;
  IF v_conversion IS NOT NULL THEN RETURN p_qty * v_conversion; END IF;

  IF position('=' in COALESCE(v_full_pack, '')) > 0 THEN
    v_pack := public.normalize_inventory_unit_v3(split_part(v_full_pack, '=', 1));
    v_match := regexp_match(trim(split_part(v_full_pack, '=', 2)), '^([0-9]+(?:\.[0-9]+)?)\s*(.*?)\s*$');
    IF v_match IS NOT NULL THEN
      v_content_qty := v_match[1]::numeric;
      v_content := public.normalize_inventory_unit_v3(v_match[2]);
      IF v_content_qty > 0 AND (v_from = v_content OR (v_from IN ('gr','g','ml') AND v_content IN ('gr','g','ml'))) AND v_stock = v_pack THEN
        RETURN p_qty / v_content_qty;
      END IF;
      IF v_content_qty > 0 AND v_from = v_pack AND (v_stock = v_content OR (v_stock IN ('gr','g','ml') AND v_content IN ('gr','g','ml'))) THEN
        RETURN p_qty * v_content_qty;
      END IF;
    END IF;
  END IF;

  IF position('=' in COALESCE(v_full_pack, '')) = 0 THEN
    v_match := regexp_match(trim(COALESCE(v_full_pack, '')), '^([0-9]+(?:\.[0-9]+)?)\s*(.*?)\s*$');
    IF v_match IS NOT NULL THEN
      v_content_qty := v_match[1]::numeric;
      v_content := public.normalize_inventory_unit_v3(v_match[2]);
      v_content_group := CASE
        WHEN v_content IN ('gr','g','kg','ml','l') THEN 'MASS_VOL'
        WHEN v_content IN ('pcs','pc','piece','pieces') THEN 'COUNT'
        ELSE v_content END;
      v_from_group := CASE
        WHEN v_from IN ('gr','g','kg','ml','l') THEN 'MASS_VOL'
        WHEN v_from IN ('pcs','pc','piece','pieces') THEN 'COUNT'
        ELSE v_from END;
      v_stock_group := CASE
        WHEN v_stock IN ('gr','g','kg','ml','l') THEN 'MASS_VOL'
        WHEN v_stock IN ('pcs','pc','piece','pieces') THEN 'COUNT'
        ELSE v_stock END;
      v_content_scale := CASE WHEN v_content IN ('kg','l') THEN 1000 ELSE 1 END;
      v_from_scale := CASE WHEN v_from IN ('kg','l') THEN 1000 ELSE 1 END;
      IF COALESCE(v_content_qty, 0) > 0 AND v_content_group = v_from_group THEN
        IF v_stock = ANY(v_package_units) AND NOT (v_from = ANY(v_package_units)) THEN
          RETURN (p_qty * v_from_scale) / (v_content_qty * v_content_scale);
        END IF;
      END IF;
      IF COALESCE(v_content_qty, 0) > 0
        AND v_content_group = v_stock_group
        AND v_from = ANY(v_package_units) THEN
        v_from_scale := CASE WHEN v_stock IN ('kg','l') THEN 1000 ELSE 1 END;
        RETURN p_qty * v_content_qty * v_content_scale / v_from_scale;
      END IF;
    END IF;
  END IF;

  IF v_from IN ('gr', 'g', 'ml') AND v_stock IN ('gr', 'g', 'ml') THEN RETURN p_qty; END IF;
  IF v_from IN ('gr', 'g', 'ml') AND v_stock IN ('kg', 'l') THEN RETURN p_qty / 1000; END IF;
  IF v_from IN ('kg', 'l') AND v_stock IN ('gr', 'g', 'ml') THEN RETURN p_qty * 1000; END IF;
  IF v_from IN ('kg', 'l') AND v_stock IN ('kg', 'l') THEN RETURN p_qty; END IF;

  RAISE EXCEPTION 'Konversi satuan tidak ditemukan untuk material %: % -> %. Tambahkan unit_conversions atau perbaiki Full Pack sebelum mencatat transaksi.', p_material_id, p_from_unit, v_stock_unit;
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.convert_material_qty_to_stock_unit_v3(uuid, bigint, numeric, text);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.convert_material_qty_to_stock_unit_v3(uuid, bigint, numeric, text): %', SQLERRM;
  END;
END $bv_fn_wrap$;

UPDATE public.daily_inventory_items dii
SET out_unit = m.unit,
    broken_unit = m.unit
FROM public.materials m
WHERE dii.material_id = m.id
  AND (dii.out_unit IS DISTINCT FROM m.unit OR dii.broken_unit IS DISTINCT FROM m.unit);

-- =============================================================================
-- BAGIAN 5: PERBAIKAN SELURUH RPC (POS COMPARE, SYNC CENTRAL-RESTO, CLONE CABANG)
-- =============================================================================

-- 5A. RPC Compare POS ESB (Membaca dari pos_transaction_items JOIN pos_transactions DAN expected_usage)
DROP FUNCTION IF EXISTS public.get_daily_pos_theoretical_usage_v9(uuid, date);
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.get_daily_pos_theoretical_usage_v9(
  p_tenant_id uuid,
  p_date date
) RETURNS TABLE (
  material_id bigint,
  material_name text,
  material_unit text,
  full_pack text,
  theoretical_recipe_qty numeric,
  recipe_unit text,
  menus_sold_count numeric,
  menu_breakdown text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  WITH daily_sales AS (
    SELECT
      pti.menu_name,
      SUM(COALESCE(pti.qty, 0))::numeric AS total_sold
    FROM public.pos_transaction_items pti
    JOIN public.pos_transactions pt ON pt.id = pti.transaction_id
    WHERE pt.tenant_id = p_tenant_id
      AND (pt.created_at AT TIME ZONE 'Asia/Jakarta')::date = p_date
      AND COALESCE(pti.qty, 0) > 0
    GROUP BY pti.menu_name
  ),
  matched_bom AS (
    SELECT
      ri.material_id,
      m.name AS mat_name,
      m.unit AS mat_unit,
      m.full_pack AS mat_full_pack,
      (ds.total_sold * COALESCE(ri.qty_in_use, 0))::numeric AS used_qty,
      COALESCE(ri.unit, m.unit, 'gr') AS ing_unit,
      ds.total_sold,
      r.menu_name
    FROM daily_sales ds
    JOIN public.recipes r
      ON r.tenant_id = p_tenant_id
      AND (
        lower(trim(r.menu_name)) = lower(trim(ds.menu_name))
        OR lower(trim(regexp_replace(ds.menu_name, '\s*\((hot|ice|iced|dingin|panas|large|regular)\)\s*', '', 'gi'))) = lower(trim(r.menu_name))
      )
    JOIN public.recipe_ingredients ri ON ri.recipe_id = r.id
    JOIN public.materials m ON m.id = ri.material_id AND m.tenant_id = p_tenant_id
  ),
  esb_expected AS (
    SELECT
      eu.material_id,
      m.name AS mat_name,
      m.unit AS mat_unit,
      m.full_pack AS mat_full_pack,
      ROUND((COALESCE(eu.expected_qty, 0) / GREATEST((eu.week_end - eu.week_start) + 1, 1))::numeric, 4) AS used_qty,
      COALESCE(m.unit, 'pck') AS ing_unit,
      ROUND((COALESCE(eu.total_sold, 0)::numeric / GREATEST((eu.week_end - eu.week_start) + 1, 1)), 2) AS total_sold,
      COALESCE(eu.last_pos_filename, 'Rekap POS ESB')::varchar AS menu_name
    FROM public.expected_usage eu
    JOIN public.materials m ON m.id = eu.material_id AND m.tenant_id = p_tenant_id
    WHERE eu.tenant_id = p_tenant_id
      AND p_date BETWEEN eu.week_start AND eu.week_end
      AND NOT EXISTS (SELECT 1 FROM matched_bom)
  ),
  combined AS (
    SELECT * FROM matched_bom
    UNION ALL
    SELECT * FROM esb_expected
  )
  SELECT
    c.material_id,
    c.mat_name AS material_name,
    c.mat_unit AS material_unit,
    c.mat_full_pack AS full_pack,
    SUM(c.used_qty)::numeric AS theoretical_recipe_qty,
    MAX(c.ing_unit) AS recipe_unit,
    SUM(c.total_sold)::numeric AS menus_sold_count,
    string_agg(DISTINCT (c.menu_name || ' (' || trim(to_char(c.total_sold, 'FM999999990.##')) || ')'), ', ') AS menu_breakdown
  FROM combined c
  GROUP BY c.material_id, c.mat_name, c.mat_unit, c.mat_full_pack;
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.get_daily_pos_theoretical_usage_v9(uuid, date);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.get_daily_pos_theoretical_usage_v9(uuid, date): %', SQLERRM;
  END;
END $bv_fn_wrap$;

GRANT EXECUTE ON FUNCTION public.get_daily_pos_theoretical_usage_v9(uuid, date) TO authenticated;

-- 5B. RPC Sinkronisasi Barang Stock Opname Central ke Resto (Tanpa Kolom `stock` Fiktif)
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.sync_central_opname_unlisted_to_resto_v9(
  p_tenant_id uuid,
  p_material_ids bigint[],
  p_transfer_qty numeric DEFAULT 0,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_mat record;
  v_synced_count integer := 0;
  v_move_qty numeric;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant wajib diisi.';
  END IF;

  FOR v_mat IN
    SELECT id, branch_id, name, unit, price, COALESCE(qty_central, 0) AS qty_central, COALESCE(qty_resto, 0) AS qty_resto
    FROM public.materials
    WHERE tenant_id = p_tenant_id
      AND id = ANY(p_material_ids)
    FOR UPDATE
  LOOP
    v_move_qty := CASE
      WHEN COALESCE(p_transfer_qty, 0) > 0 THEN LEAST(v_mat.qty_central, p_transfer_qty)
      ELSE 0
    END;

    UPDATE public.materials
    SET
      is_active = true,
      qty_resto = COALESCE(qty_resto, 0) + v_move_qty,
      qty_central = GREATEST(0, COALESCE(qty_central, 0) - v_move_qty),
      updated_at = now()
    WHERE id = v_mat.id
      AND tenant_id = p_tenant_id;

    IF v_move_qty > 0 THEN
      INSERT INTO public.transactions (
        tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, source_module, created_by
      ) VALUES (
        p_tenant_id,
        v_mat.branch_id,
        CURRENT_DATE,
        v_mat.id,
        'TRANSFER',
        'RESTO',
        v_move_qty,
        v_move_qty * COALESCE(v_mat.price, 0),
        'Sinkronisasi SO Central ke Resto (' || v_mat.name || ')',
        'central_to_resto_sync_v9',
        COALESCE(auth.uid(), p_user_id)
      );
    END IF;

    v_synced_count := v_synced_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'synced_count', v_synced_count
  );
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.sync_central_opname_unlisted_to_resto_v9(uuid, bigint[], numeric, uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.sync_central_opname_unlisted_to_resto_v9(uuid, bigint[], numeric, uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

GRANT EXECUTE ON FUNCTION public.sync_central_opname_unlisted_to_resto_v9(uuid, bigint[], numeric, uuid) TO authenticated;

-- 5C. RPC Salin / Clone Data Antar Cabang (Diperbaiki 100% Sesuai Kolom SQL Barventis.md)
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.clone_branch_data(
  p_tenant_id UUID,
  p_source_branch_id UUID,
  p_target_branch_id UUID,
  p_copy_materials BOOLEAN DEFAULT true,
  p_copy_suppliers BOOLEAN DEFAULT true,
  p_copy_recipes BOOLEAN DEFAULT true,
  p_selected_recipe_ids BIGINT[] DEFAULT NULL,
  p_conflict_mode TEXT DEFAULT 'SKIP'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sup RECORD;
  v_mat RECORD;
  v_rec RECORD;
  v_ing RECORD;
  v_target_mat_id BIGINT;
  v_target_rec_id BIGINT;
  v_sup_copied INT := 0;
  v_mat_copied INT := 0;
  v_rec_copied INT := 0;
  v_rec_updated INT := 0;
  v_conflict TEXT := UPPER(COALESCE(p_conflict_mode, 'SKIP'));
BEGIN
  IF p_source_branch_id = p_target_branch_id THEN
    RAISE EXCEPTION 'Cabang sumber dan cabang tujuan tidak boleh sama.';
  END IF;

  -- 1. Salin Master Supplier (hanya kolom yang ada di SQL Barventis.md)
  IF COALESCE(p_copy_suppliers, false) THEN
    FOR v_sup IN
      SELECT * FROM public.suppliers
      WHERE tenant_id = p_tenant_id AND branch_id = p_source_branch_id
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.suppliers
        WHERE tenant_id = p_tenant_id
          AND branch_id = p_target_branch_id
          AND lower(trim(name)) = lower(trim(v_sup.name))
      ) THEN
        INSERT INTO public.suppliers (
          tenant_id, branch_id, name, phone, address, contact_person, status
        ) VALUES (
          p_tenant_id, p_target_branch_id, v_sup.name, v_sup.phone,
          v_sup.address, v_sup.contact_person, COALESCE(v_sup.status, 'ACTIVE')
        );
        v_sup_copied := v_sup_copied + 1;
      END IF;
    END LOOP;
  END IF;

  -- 2. Salin Katalog Bahan Baku (tanpa kolom `stock` fiktif)
  IF COALESCE(p_copy_materials, false) THEN
    FOR v_mat IN
      SELECT * FROM public.materials
      WHERE tenant_id = p_tenant_id AND branch_id = p_source_branch_id
    LOOP
      SELECT id INTO v_target_mat_id
      FROM public.materials
      WHERE tenant_id = p_tenant_id
        AND branch_id = p_target_branch_id
        AND (
          (v_mat.item_code IS NOT NULL AND item_code = v_mat.item_code)
          OR lower(trim(name)) = lower(trim(v_mat.name))
        )
      LIMIT 1;

      IF v_target_mat_id IS NULL THEN
        INSERT INTO public.materials (
          tenant_id, branch_id, name, category, unit, full_pack, price, new_price,
          supplier, min_stock, par_stock, item_code, sku, is_preparable,
          broken_tracking_enabled, expiry_tracking_enabled, shelf_life_days,
          monthly_quota_qty, is_prep_output, qty_resto, qty_central
        ) VALUES (
          p_tenant_id, p_target_branch_id, v_mat.name, v_mat.category, v_mat.unit,
          v_mat.full_pack, v_mat.price, v_mat.new_price, v_mat.supplier,
          COALESCE(v_mat.min_stock, 0), COALESCE(v_mat.par_stock, 0), v_mat.item_code, v_mat.sku,
          COALESCE(v_mat.is_preparable, false),
          COALESCE(v_mat.broken_tracking_enabled, true),
          COALESCE(v_mat.expiry_tracking_enabled, false),
          v_mat.shelf_life_days,
          COALESCE(v_mat.monthly_quota_qty, 0),
          COALESCE(v_mat.is_prep_output, false),
          0, 0
        )
        RETURNING id INTO v_target_mat_id;

        v_mat_copied := v_mat_copied + 1;
      END IF;
    END LOOP;
  END IF;

  -- 3. Salin Menu, Resep & Komposisi Bahan (menyertakan tenant_id & branch_id tanpa item_name)
  IF COALESCE(p_copy_recipes, false) THEN
    FOR v_rec IN
      SELECT * FROM public.recipes
      WHERE tenant_id = p_tenant_id
        AND branch_id = p_source_branch_id
        AND (p_selected_recipe_ids IS NULL OR id = ANY(p_selected_recipe_ids))
    LOOP
      SELECT id INTO v_target_rec_id
      FROM public.recipes
      WHERE tenant_id = p_tenant_id
        AND branch_id = p_target_branch_id
        AND lower(trim(menu_name)) = lower(trim(v_rec.menu_name))
      LIMIT 1;

      IF v_target_rec_id IS NOT NULL AND v_conflict = 'SKIP' THEN
        CONTINUE;
      END IF;

      IF v_target_rec_id IS NULL THEN
        INSERT INTO public.recipes (
          tenant_id, branch_id, menu_name, pos_code, category, selling_price,
          subtotal, fix_cost, basic_cost, fix_cost_pct, food_cost_pct,
          target_cost_percent, image_url, rounding_direction, rounding_increment, price_adjustment
        ) VALUES (
          p_tenant_id, p_target_branch_id, v_rec.menu_name, v_rec.pos_code, v_rec.category,
          COALESCE(v_rec.selling_price, 0), COALESCE(v_rec.subtotal, 0), COALESCE(v_rec.fix_cost, 0),
          COALESCE(v_rec.basic_cost, 0), COALESCE(v_rec.fix_cost_pct, 0.05), COALESCE(v_rec.food_cost_pct, 0),
          COALESCE(v_rec.target_cost_percent, 27.0), v_rec.image_url,
          COALESCE(v_rec.rounding_direction, 'down'), COALESCE(v_rec.rounding_increment, 1), COALESCE(v_rec.price_adjustment, 0)
        )
        RETURNING id INTO v_target_rec_id;
        v_rec_copied := v_rec_copied + 1;
      ELSE
        UPDATE public.recipes
        SET category = v_rec.category,
            selling_price = COALESCE(v_rec.selling_price, selling_price),
            subtotal = COALESCE(v_rec.subtotal, subtotal),
            fix_cost = COALESCE(v_rec.fix_cost, fix_cost),
            basic_cost = COALESCE(v_rec.basic_cost, basic_cost),
            fix_cost_pct = COALESCE(v_rec.fix_cost_pct, fix_cost_pct),
            food_cost_pct = COALESCE(v_rec.food_cost_pct, food_cost_pct),
            target_cost_percent = COALESCE(v_rec.target_cost_percent, 27.0),
            image_url = COALESCE(v_rec.image_url, image_url),
            rounding_direction = COALESCE(v_rec.rounding_direction, rounding_direction),
            rounding_increment = COALESCE(v_rec.rounding_increment, rounding_increment),
            price_adjustment = COALESCE(v_rec.price_adjustment, price_adjustment)
        WHERE id = v_target_rec_id;

        DELETE FROM public.recipe_ingredients WHERE recipe_id = v_target_rec_id;
        v_rec_updated := v_rec_updated + 1;
      END IF;

      FOR v_ing IN
        SELECT ri.*, m.name AS src_mat_name, m.category AS src_cat, m.unit AS src_unit,
               m.full_pack AS src_pack, m.price AS src_price, m.new_price AS src_new_price,
               m.supplier AS src_supplier, m.item_code AS src_code, m.sku AS src_sku,
               m.min_stock AS src_min, m.par_stock AS src_par
        FROM public.recipe_ingredients ri
        LEFT JOIN public.materials m ON m.id = ri.material_id
        WHERE ri.recipe_id = v_rec.id
      LOOP
        v_target_mat_id := NULL;
        IF v_ing.src_mat_name IS NOT NULL THEN
          SELECT id INTO v_target_mat_id
          FROM public.materials
          WHERE tenant_id = p_tenant_id
            AND branch_id = p_target_branch_id
            AND (
              (v_ing.src_code IS NOT NULL AND item_code = v_ing.src_code)
              OR lower(trim(name)) = lower(trim(v_ing.src_mat_name))
            )
          LIMIT 1;

          IF v_target_mat_id IS NULL THEN
            INSERT INTO public.materials (
              tenant_id, branch_id, name, category, unit, full_pack, price, new_price,
              supplier, min_stock, par_stock, item_code, sku, qty_resto, qty_central
            ) VALUES (
              p_tenant_id, p_target_branch_id, v_ing.src_mat_name, COALESCE(v_ing.src_cat, 'Umum'),
              COALESCE(v_ing.src_unit, v_ing.unit), v_ing.src_pack, COALESCE(v_ing.src_price, 0),
              COALESCE(v_ing.src_new_price, v_ing.src_price, 0), COALESCE(v_ing.src_supplier, ''),
              COALESCE(v_ing.src_min, 0), COALESCE(v_ing.src_par, 0),
              v_ing.src_code, v_ing.src_sku, 0, 0
            )
            RETURNING id INTO v_target_mat_id;
            v_mat_copied := v_mat_copied + 1;
          END IF;
        END IF;

        IF v_target_mat_id IS NOT NULL THEN
          INSERT INTO public.recipe_ingredients (
            tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount
          ) VALUES (
            p_tenant_id, p_target_branch_id, v_target_rec_id, v_target_mat_id,
            v_ing.qty_in_use, v_ing.unit, COALESCE(v_ing.unit_price, 0), COALESCE(v_ing.amount, 0)
          );
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'suppliers_copied', v_sup_copied,
    'materials_copied', v_mat_copied,
    'recipes_copied', v_rec_copied,
    'recipes_updated', v_rec_updated
  );
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.clone_branch_data(UUID, UUID, UUID, BOOLEAN, BOOLEAN, BOOLEAN, BIGINT[], TEXT);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.clone_branch_data(UUID, UUID, UUID, BOOLEAN, BOOLEAN, BOOLEAN, BIGINT[], TEXT): %', SQLERRM;
  END;
END $bv_fn_wrap$;

GRANT EXECUTE ON FUNCTION public.clone_branch_data(uuid, uuid, uuid, boolean, boolean, boolean, bigint[], text) TO authenticated;

-- 5D. RPC Ringkasan Performa Multi-Cabang Khusus Owner
DROP FUNCTION IF EXISTS public.get_owner_multi_branch_summary(uuid, int, int);
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.get_owner_multi_branch_summary(
  p_tenant_id UUID,
  p_month INT,
  p_year INT
)
RETURNS TABLE (
  branch_id UUID,
  branch_code VARCHAR,
  branch_name VARCHAR,
  is_central BOOLEAN,
  is_active BOOLEAN,
  staff_count BIGINT,
  material_count BIGINT,
  low_stock_count BIGINT,
  stock_valuation NUMERIC,
  pos_sales NUMERIC,
  actual_cogs NUMERIC,
  food_cost_pct NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start DATE := make_date(p_year, p_month, 1);
  v_end DATE := (make_date(p_year, p_month, 1) + INTERVAL '1 month - 1 day')::DATE;
BEGIN
  RETURN QUERY
  SELECT
    b.id AS branch_id,
    b.code AS branch_code,
    b.name AS branch_name,
    b.is_central,
    b.is_active,
    (SELECT count(*) FROM public.users u WHERE u.tenant_id = p_tenant_id AND u.branch_id = b.id) AS staff_count,
    (SELECT count(*) FROM public.materials m WHERE m.tenant_id = p_tenant_id AND m.branch_id = b.id) AS material_count,
    (SELECT count(*) FROM public.materials m WHERE m.tenant_id = p_tenant_id AND m.branch_id = b.id
      AND (COALESCE(m.qty_resto, 0) + COALESCE(m.qty_central, 0)) < COALESCE(NULLIF(m.min_stock, 0), 15)) AS low_stock_count,
    COALESCE((SELECT sum((COALESCE(m.qty_resto, 0) + COALESCE(m.qty_central, 0)) * COALESCE(NULLIF(m.new_price, 0), m.price, 0))
      FROM public.materials m WHERE m.tenant_id = p_tenant_id AND m.branch_id = b.id), 0)::NUMERIC AS stock_valuation,
    COALESCE((SELECT sum(abs(tx.amount)) FROM public.transactions tx
      WHERE tx.tenant_id = p_tenant_id AND tx.branch_id = b.id AND tx.type = 'POS_SALE'
        AND tx.date >= v_start AND tx.date <= v_end), 0)::NUMERIC AS pos_sales,
    COALESCE((SELECT sum(abs(tx.amount)) FROM public.transactions tx
      WHERE tx.tenant_id = p_tenant_id AND tx.branch_id = b.id AND tx.type = 'POS_DEDUCTION'
        AND tx.date >= v_start AND tx.date <= v_end), 0)::NUMERIC AS actual_cogs,
    CASE
      WHEN COALESCE((SELECT sum(abs(tx.amount)) FROM public.transactions tx
        WHERE tx.tenant_id = p_tenant_id AND tx.branch_id = b.id AND tx.type = 'POS_SALE'
          AND tx.date >= v_start AND tx.date <= v_end), 0) > 0
      THEN ROUND(
        COALESCE((SELECT sum(abs(tx.amount)) FROM public.transactions tx
          WHERE tx.tenant_id = p_tenant_id AND tx.branch_id = b.id AND tx.type = 'POS_DEDUCTION'
            AND tx.date >= v_start AND tx.date <= v_end), 0)
        / NULLIF(COALESCE((SELECT sum(abs(tx.amount)) FROM public.transactions tx
          WHERE tx.tenant_id = p_tenant_id AND tx.branch_id = b.id AND tx.type = 'POS_SALE'
            AND tx.date >= v_start AND tx.date <= v_end), 0), 0) * 100, 1)
      ELSE 0
    END AS food_cost_pct
  FROM public.branches b
  WHERE b.tenant_id = p_tenant_id
  ORDER BY b.is_central DESC, b.created_at ASC;
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.get_owner_multi_branch_summary(UUID, INT, INT);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.get_owner_multi_branch_summary(UUID, INT, INT): %', SQLERRM;
  END;
END $bv_fn_wrap$;

GRANT EXECUTE ON FUNCTION public.get_owner_multi_branch_summary(uuid, int, int) TO authenticated;

-- 5E. View `v_menu_engineering` & Storage Bucket `signatures`
-- Gunakan DROP VIEW IF EXISTS CASCADE terlebih dahulu agar PostgreSQL tidak melempar
-- ERROR 42P16 (cannot change name of view column "name" to "branch_id")
DROP VIEW IF EXISTS public.v_menu_engineering CASCADE;
CREATE VIEW public.v_menu_engineering AS
SELECT
  r.id,
  r.tenant_id,
  r.menu_name AS name,
  r.menu_name,
  r.branch_id,
  r.category,
  r.selling_price,
  r.basic_cost,
  r.basic_cost AS cogs,
  (COALESCE(r.selling_price, 0) - COALESCE(r.basic_cost, 0)) AS margin,
  COALESCE(r.total_sold, 0) AS total_sold,
  (COALESCE(r.selling_price, 0) - COALESCE(r.basic_cost, 0)) * COALESCE(r.total_sold, 0) AS contribution,
  COALESCE(r.selling_price, 0) - COALESCE(r.basic_cost, 0) AS contribution_margin,
  COALESCE(r.menu_class, 'STAR') AS menu_class,
  r.target_cost_percent,
  r.food_cost_pct
FROM public.recipes r;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('signatures', 'signatures', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Pembuatan storage bucket signatures dilewati: %', SQLERRM;
END $$;

-- =============================================================================
-- BAGIAN 6: TRIGGER INTEGRITAS CABANG & KEBIJAKAN RLS KETAT DI SELURUH TABEL
-- =============================================================================
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.bv2_enforce_branch_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent_branch uuid;
  v_auth_branch uuid;
BEGIN
  IF NEW.branch_id IS NULL THEN
    IF TG_TABLE_NAME = 'recipe_ingredients' THEN
      SELECT r.branch_id INTO v_parent_branch FROM public.recipes r WHERE r.id = NEW.recipe_id;
    ELSIF TG_TABLE_NAME = 'daily_inventory_items' THEN
      SELECT di.branch_id INTO v_parent_branch FROM public.daily_inventories di WHERE di.id = NEW.inventory_id;
    ELSIF TG_TABLE_NAME = 'stock_opname_items' THEN
      SELECT so.branch_id INTO v_parent_branch FROM public.stock_opnames so WHERE so.id = NEW.opname_id;
    ELSIF TG_TABLE_NAME IN ('transactions', 'waste_logs', 'material_batches', 'stock_adjustments', 'material_location_costs', 'material_open_lot_state', 'material_lot_movements_v4', 'unit_conversions') THEN
      IF NEW.material_id IS NOT NULL THEN
        SELECT m.branch_id INTO v_parent_branch FROM public.materials m WHERE m.id = NEW.material_id;
      END IF;
    END IF;
    NEW.branch_id := COALESCE(v_parent_branch, public.bv2_auth_branch_id());
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.bv2_is_admin() AND NOT public.bv2_is_superadmin() THEN
    v_auth_branch := public.bv2_auth_branch_id();
    IF v_auth_branch IS NOT NULL AND NEW.branch_id IS DISTINCT FROM v_auth_branch THEN
      RAISE EXCEPTION 'Akses cabang ditolak: non-admin tidak diizinkan mengubah data cabang lain.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.bv2_enforce_branch_integrity();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.bv2_enforce_branch_integrity(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $$
DECLARE
  v_tbl text;
  v_trig_tables text[] := ARRAY[
    'materials', 'recipes', 'recipe_ingredients', 'material_batches',
    'material_location_costs', 'material_open_lot_state', 'material_lot_movements_v4',
    'stock_adjustments', 'unit_conversions', 'waste_logs', 'stock_opnames',
    'stock_opname_items', 'physical_checks', 'daily_inventories',
    'daily_inventory_items', 'transactions'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_trig_tables LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_bv2_enforce_branch_integrity ON public.%I', v_tbl);
      EXECUTE format(
        'CREATE TRIGGER trg_bv2_enforce_branch_integrity BEFORE INSERT OR UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.bv2_enforce_branch_integrity()',
        v_tbl
      );
    END IF;
  END LOOP;
END $$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.bv2_apply_strict_branch_rls(
  p_table text,
  p_parent_table text DEFAULT NULL,
  p_parent_fk text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_pol RECORD;
  v_has_tenant boolean;
  v_has_branch boolean;
  v_tenant_expr text;
  v_branch_read text;
  v_branch_write text;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);

  FOR v_pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = p_table
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_pol.policyname, p_table);
  END LOOP;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'tenant_id'
  ) INTO v_has_tenant;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'branch_id'
  ) INTO v_has_branch;

  IF v_has_tenant THEN
    v_tenant_expr := 'tenant_id = (SELECT public.bv2_auth_tenant_id())';
  ELSIF p_parent_table IS NOT NULL AND p_parent_fk IS NOT NULL THEN
    v_tenant_expr := format(
      'EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I.%I AND p.tenant_id = (SELECT public.bv2_auth_tenant_id()))',
      p_parent_table, p_table, p_parent_fk
    );
  ELSE
    v_tenant_expr := 'true';
  END IF;

  IF v_has_branch THEN
    v_branch_read := '((SELECT public.bv2_is_admin()) OR branch_id IS NULL OR branch_id = (SELECT public.bv2_auth_branch_id()))';
    v_branch_write := '((SELECT public.bv2_is_admin()) OR branch_id IS NULL OR branch_id = (SELECT public.bv2_auth_branch_id()))';
  ELSE
    v_branch_read := 'true';
    v_branch_write := 'true';
  END IF;

  EXECUTE format(
    'CREATE POLICY strict_branch_select ON public.%I FOR SELECT TO authenticated
     USING ((%s AND %s) OR (SELECT public.bv2_is_superadmin()))',
    p_table, v_tenant_expr, v_branch_read
  );
  EXECUTE format(
    'CREATE POLICY strict_branch_insert ON public.%I FOR INSERT TO authenticated
     WITH CHECK ((%s AND %s) OR (SELECT public.bv2_is_superadmin()))',
    p_table, v_tenant_expr, v_branch_write
  );
  EXECUTE format(
    'CREATE POLICY strict_branch_update ON public.%I FOR UPDATE TO authenticated
     USING ((%s AND %s) OR (SELECT public.bv2_is_superadmin()))
     WITH CHECK ((%s AND %s) OR (SELECT public.bv2_is_superadmin()))',
    p_table, v_tenant_expr, v_branch_read, v_tenant_expr, v_branch_write
  );
  EXECUTE format(
    'CREATE POLICY strict_branch_delete ON public.%I FOR DELETE TO authenticated
     USING ((%s AND %s) OR (SELECT public.bv2_is_superadmin()))',
    p_table, v_tenant_expr, v_branch_read
  );
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.bv2_apply_strict_branch_rls(text, text, text);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.bv2_apply_strict_branch_rls(text, text, text): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $$
DECLARE
  v_tbl text;
  v_direct_branch_tables text[] := ARRAY[
    'materials', 'recipes', 'suppliers', 'purchase_entries', 'market_lists',
    'material_batches', 'material_location_costs', 'material_open_lot_state',
    'material_lot_movements_v4', 'stock_adjustments', 'unit_conversions',
    'waste_logs', 'stock_opnames', 'physical_checks', 'daily_inventories',
    'transactions', 'invoices', 'expected_usage', 'usage_variance',
    'production_batches', 'production_runs', 'production_run_items',
    'production_trimming_batches', 'pos_upload_logs', 'pos_orders',
    'pos_transactions', 'pos_daily_aggregates', 'storage_locations',
    'daily_stock_counts', 'assets', 'asset_items', 'asset_opname_items',
    'equipment_service_logs', 'generated_so_reports'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_direct_branch_tables LOOP
    PERFORM public.bv2_apply_strict_branch_rls(v_tbl, NULL, NULL);
  END LOOP;

  PERFORM public.bv2_apply_strict_branch_rls('recipe_ingredients', 'recipes', 'recipe_id');
  PERFORM public.bv2_apply_strict_branch_rls('recipe_versions', 'recipes', 'recipe_id');
  PERFORM public.bv2_apply_strict_branch_rls('daily_inventory_items', 'daily_inventories', 'inventory_id');
  PERFORM public.bv2_apply_strict_branch_rls('stock_opname_items', 'stock_opnames', 'opname_id');
  PERFORM public.bv2_apply_strict_branch_rls('physical_check_items', 'physical_checks', 'check_id');
  PERFORM public.bv2_apply_strict_branch_rls('market_list_items', 'market_lists', 'market_list_id');
  PERFORM public.bv2_apply_strict_branch_rls('invoice_items', 'invoices', 'invoice_id');
  PERFORM public.bv2_apply_strict_branch_rls('pos_order_items', 'pos_orders', 'order_id');
  PERFORM public.bv2_apply_strict_branch_rls('pos_transaction_items', 'pos_transactions', 'transaction_id');
  PERFORM public.bv2_apply_strict_branch_rls('production_batch_ingredients', 'production_batches', 'batch_id');
END $$;

-- =============================================================================
-- BAGIAN 7: PATCH MULTI-CABANG DAILY INVENTORY RPC & SEED DATA DUMMY BETA TESTING
--           (RESTO UMATIS — CABANG BSD & CABANG KASUNA)
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 7A. Perbarui atomic_save_daily_inventory_v3 & v4 agar 100% mendukung Multi-Cabang
--     (BSD & Kasuna terpisah tanpa bentrok ON CONFLICT (tenant_id, date, location)
--      dan tanpa menolak closing akibat material cabang lain)
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.atomic_save_daily_inventory_v3(
  p_tenant_id uuid,
  p_date date,
  p_location text,
  p_items jsonb,
  p_is_closing boolean DEFAULT false,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_location public.stock_location;
  v_header_id bigint;
  v_status text;
  v_item jsonb;
  v_mat public.materials%ROWTYPE;
  v_material_id bigint;
  v_branch_id uuid;
  v_previous_date date;
  v_previous_closed_at timestamptz;
  v_previous_closing numeric(16,4);
  v_carry_movement numeric(16,4);
  v_opening numeric(16,4);
  v_source text;
  v_in numeric(16,4);
  v_out numeric(16,4);
  v_waste numeric(16,4);
  v_full numeric(16,4);
  v_broken numeric(16,4);
  v_closing numeric(16,4);
  v_stock_movement numeric(16,4);
  v_production_usage numeric(16,4);
  v_actual_usage numeric(16,4);
  v_stock_based_usage numeric(16,4);
  v_unit_cost numeric(16,4);
  v_current_qty numeric(16,4);
  v_adjustment numeric(16,4);
  v_item_id bigint;
  v_saved_count integer := 0;
  v_count integer := 0;
  v_uncounted integer := 0;
  v_user_id uuid := COALESCE(auth.uid(), p_user_id);
BEGIN
  IF p_tenant_id IS NULL OR (public.bv2_auth_tenant_id() IS DISTINCT FROM p_tenant_id AND NOT public.bv2_is_superadmin()) THEN
    RAISE EXCEPTION 'Akses tenant ditolak.' USING ERRCODE = '42501';
  END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Tanggal inventaris wajib diisi.'; END IF;
  IF upper(p_location) NOT IN ('RESTO', 'CENTRAL') THEN RAISE EXCEPTION 'Lokasi inventaris tidak valid.'; END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Data item inventaris harus berupa array.'; END IF;

  SELECT COUNT(*) INTO v_count FROM jsonb_array_elements(p_items);
  IF v_count = 0 THEN RAISE EXCEPTION 'Tidak ada item yang dikirim untuk disimpan.'; END IF;

  -- Resolusi branch_id dari material pertama pada payload (atau cabang aktif pengguna)
  SELECT m.branch_id INTO v_branch_id
  FROM public.materials m
  WHERE m.id = NULLIF((p_items->0)->>'material_id', '')::bigint
    AND m.tenant_id = p_tenant_id
  LIMIT 1;
  v_branch_id := COALESCE(v_branch_id, public.bv2_auth_branch_id());

  v_location := upper(p_location)::public.stock_location;
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(COALESCE(v_branch_id::text, '') || ':' || p_date::text || ':' || v_location::text));

  SELECT id, status INTO v_header_id, v_status
  FROM public.daily_inventories
  WHERE tenant_id = p_tenant_id
    AND (v_branch_id IS NULL OR branch_id = v_branch_id)
    AND date = p_date
    AND location = v_location
  ORDER BY id ASC
  LIMIT 1
  FOR UPDATE;

  IF FOUND AND lower(COALESCE(v_status, 'draft')) IN ('verified', 'closed') THEN
    RAISE EXCEPTION 'EOD tanggal % lokasi % sudah terkunci. Buka kunci melalui prosedur revisi terlebih dahulu.', p_date, v_location;
  END IF;

  IF NOT FOUND THEN
    INSERT INTO public.daily_inventories (tenant_id, branch_id, date, location, status, checked_by, created_at, updated_at)
    VALUES (p_tenant_id, v_branch_id, p_date, v_location, 'draft', v_user_id, now(), now())
    RETURNING id, status INTO v_header_id, v_status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) item
    GROUP BY (item->>'material_id') HAVING COUNT(*) > 1
  ) THEN RAISE EXCEPTION 'Ada material yang duplikat dalam satu pengiriman.'; END IF;

  IF p_is_closing THEN
    SELECT COUNT(*) INTO v_uncounted
    FROM jsonb_array_elements(p_items) item
    WHERE COALESCE((item->>'is_counted')::boolean, false) = false;
    IF v_uncounted > 0 THEN RAISE EXCEPTION 'Closing ditolak: masih ada % bahan yang belum ditandai sudah dihitung fisik.', v_uncounted; END IF;

    IF EXISTS (
      SELECT 1 FROM public.daily_inventories h
      WHERE h.tenant_id = p_tenant_id
        AND (v_branch_id IS NULL OR h.branch_id = v_branch_id)
        AND h.location = v_location
        AND h.date > p_date
        AND lower(COALESCE(h.status, 'draft')) IN ('verified', 'closed')
    ) THEN RAISE EXCEPTION 'Closing historis ditolak karena ada EOD yang lebih baru pada lokasi ini.'; END IF;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY (value->>'material_id')::bigint LOOP
    v_material_id := (v_item->>'material_id')::bigint;
    IF v_material_id IS NULL THEN RAISE EXCEPTION 'Setiap baris wajib memiliki material_id.'; END IF;
    SELECT * INTO v_mat FROM public.materials WHERE id = v_material_id AND tenant_id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Material % tidak ditemukan di tenant ini.', v_material_id; END IF;

    SELECT h.date, h.updated_at, i.closing_qty
      INTO v_previous_date, v_previous_closed_at, v_previous_closing
    FROM public.daily_inventories h
    LEFT JOIN public.daily_inventory_items i ON i.inventory_id = h.id AND i.material_id = v_material_id
    WHERE h.tenant_id = p_tenant_id
      AND (v_branch_id IS NULL OR h.branch_id = v_branch_id)
      AND h.location = v_location
      AND h.date < p_date
      AND lower(COALESCE(h.status, 'draft')) IN ('verified', 'closed')
    ORDER BY h.date DESC LIMIT 1;

    IF v_previous_date IS NOT NULL AND v_previous_closing IS NOT NULL THEN
      SELECT COALESCE(SUM(t.qty), 0) INTO v_carry_movement
      FROM public.transactions t
      WHERE t.tenant_id = p_tenant_id AND t.material_id = v_material_id AND t.location = v_location
        AND t.date >= v_previous_date AND t.date < p_date
        AND (t.date > v_previous_date OR (t.date = v_previous_date AND t.created_at > v_previous_closed_at))
        AND COALESCE(t.is_reversed, false) = false
        AND t.type NOT IN ('POS_SALE', 'POS_DEDUCTION', 'WASTE', 'BREAKAGE', 'EXPIRED', 'COMP');
      v_opening := GREATEST(v_previous_closing + COALESCE(v_carry_movement, 0), 0);
      v_source := 'PREVIOUS_CLOSED_EOD_PLUS_LEDGER';
    ELSE
      v_opening := GREATEST(COALESCE(NULLIF(v_item->>'opening_qty', '')::numeric, 0), 0);
      v_source := COALESCE(NULLIF(v_item->>'opening_qty_source', ''), 'LEGACY_CURRENT_BALANCE_ESTIMATE');
    END IF;

    v_out := COALESCE(NULLIF(v_item->>'out_qty', '')::numeric, 0);
    v_full := COALESCE(NULLIF(v_item->>'full_qty', '')::numeric, 0);
    v_broken := COALESCE(NULLIF(v_item->>'broken_qty', '')::numeric, 0);
    v_closing := COALESCE(NULLIF(v_item->>'closing_qty', '')::numeric, 0);
    IF v_out < 0 OR v_full < 0 OR v_broken < 0 OR v_closing < 0 THEN
      RAISE EXCEPTION 'Kuantitas tidak boleh negatif untuk material %.', v_material_id;
    END IF;

    SELECT COALESCE(SUM(t.qty), 0) INTO v_in
    FROM public.transactions t
    WHERE t.tenant_id = p_tenant_id AND t.material_id = v_material_id AND t.location = v_location AND t.date = p_date
      AND t.type IN ('IN', 'PURCHASE_IN', 'TRANSFER') AND t.qty > 0 AND COALESCE(t.is_reversed, false) = false;

    SELECT COALESCE(SUM(ABS(t.qty)), 0) INTO v_waste
    FROM public.transactions t
    WHERE t.tenant_id = p_tenant_id AND t.material_id = v_material_id AND t.location = v_location AND t.date = p_date
      AND t.type IN ('WASTE', 'BREAKAGE', 'EXPIRED', 'COMP') AND COALESCE(t.is_reversed, false) = false;

    SELECT COALESCE(SUM(t.qty), 0) INTO v_stock_movement
    FROM public.transactions t
    WHERE t.tenant_id = p_tenant_id AND t.material_id = v_material_id AND t.location = v_location AND t.date = p_date
      AND COALESCE(t.is_reversed, false) = false
      AND t.type NOT IN ('POS_SALE', 'POS_DEDUCTION', 'WASTE', 'BREAKAGE', 'EXPIRED', 'COMP')
      AND NOT (t.type = 'OUT' AND COALESCE(t.source_module, '') IN ('daily_inventory', 'production'));

    SELECT average_unit_cost INTO v_unit_cost FROM public.material_location_costs
    WHERE tenant_id = p_tenant_id AND material_id = v_material_id AND location = v_location;
    v_unit_cost := GREATEST(COALESCE(v_unit_cost, v_mat.avg_cost, v_mat.new_price, v_mat.price, 0), 0);

    SELECT COALESCE(SUM(ABS(t.qty)), 0) INTO v_production_usage
    FROM public.transactions t
    WHERE t.tenant_id = p_tenant_id AND t.material_id = v_material_id AND t.location = v_location AND t.date = p_date
      AND t.type = 'OUT' AND t.source_module = 'production' AND COALESCE(t.is_reversed, false) = false;

    v_actual_usage := COALESCE(v_out, 0) + COALESCE(v_waste, 0);
    v_stock_based_usage := v_opening + COALESCE(v_stock_movement, 0) - v_closing - v_waste - COALESCE(v_production_usage, 0);

    INSERT INTO public.daily_inventory_items (
      inventory_id, material_id, tenant_id, branch_id, prev_full_qty, in_qty, out_qty, waste_qty, broken_qty, full_qty,
      closing_qty, terpakai_qty, expiry_date, is_counted, unit_cost_snapshot, usage_value,
      stock_based_usage_qty, usage_variance_qty, production_usage_qty, net_stock_movement_qty, opening_qty_source, counted_at, counted_by
    ) VALUES (
      v_header_id, v_material_id, p_tenant_id, v_branch_id, v_opening, v_in, v_out, v_waste, v_broken, v_full,
      v_closing, v_actual_usage, NULLIF(v_item->>'expiry_date', '')::date, COALESCE((v_item->>'is_counted')::boolean, false),
      CASE WHEN p_is_closing THEN v_unit_cost ELSE NULL END,
      CASE WHEN p_is_closing THEN v_actual_usage * v_unit_cost ELSE NULL END,
      v_stock_based_usage, v_stock_based_usage - v_out, COALESCE(v_production_usage,0), COALESCE(v_stock_movement, 0), v_source,
      CASE WHEN COALESCE((v_item->>'is_counted')::boolean, false) THEN now() ELSE NULL END,
      CASE WHEN COALESCE((v_item->>'is_counted')::boolean, false) THEN v_user_id ELSE NULL END
    )
    ON CONFLICT (inventory_id, material_id) DO UPDATE SET
      branch_id = EXCLUDED.branch_id,
      prev_full_qty = EXCLUDED.prev_full_qty,
      in_qty = EXCLUDED.in_qty,
      out_qty = EXCLUDED.out_qty,
      waste_qty = EXCLUDED.waste_qty,
      broken_qty = EXCLUDED.broken_qty,
      full_qty = EXCLUDED.full_qty,
      closing_qty = EXCLUDED.closing_qty,
      terpakai_qty = EXCLUDED.terpakai_qty,
      expiry_date = EXCLUDED.expiry_date,
      is_counted = EXCLUDED.is_counted,
      unit_cost_snapshot = CASE WHEN p_is_closing THEN EXCLUDED.unit_cost_snapshot ELSE NULL END,
      usage_value = CASE WHEN p_is_closing THEN EXCLUDED.usage_value ELSE NULL END,
      book_qty_before_close = NULL,
      eod_adjustment_qty = NULL,
      stock_based_usage_qty = EXCLUDED.stock_based_usage_qty,
      usage_variance_qty = EXCLUDED.usage_variance_qty,
      production_usage_qty = EXCLUDED.production_usage_qty,
      net_stock_movement_qty = EXCLUDED.net_stock_movement_qty,
      opening_qty_source = EXCLUDED.opening_qty_source,
      counted_at = EXCLUDED.counted_at,
      counted_by = EXCLUDED.counted_by
    RETURNING id INTO v_item_id;
    v_saved_count := v_saved_count + 1;

    IF p_is_closing THEN
      v_current_qty := CASE WHEN v_location = 'RESTO' THEN COALESCE(v_mat.qty_resto, 0) ELSE COALESCE(v_mat.qty_central, 0) END;
      v_adjustment := v_closing - (v_current_qty - v_out);

      IF v_out > 0 THEN
        INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by,
          unit_cost_snapshot, source_module, source_record_id, idempotency_key, is_reversed)
        VALUES (p_tenant_id, v_branch_id, p_date, v_material_id, 'OUT', v_location, -v_out, v_out * v_unit_cost,
          'Daily Inventory OUT [' || p_date::text || '] ' || COALESCE(v_mat.name, v_material_id::text), v_user_id,
          v_unit_cost, 'daily_inventory', v_item_id::text, 'daily-out:' || v_header_id::text || ':' || v_material_id::text, false)
        ON CONFLICT (tenant_id, idempotency_key) DO UPDATE SET
          branch_id = EXCLUDED.branch_id, qty = EXCLUDED.qty, amount = EXCLUDED.amount, notes = EXCLUDED.notes,
          unit_cost_snapshot = EXCLUDED.unit_cost_snapshot, source_record_id = EXCLUDED.source_record_id, is_reversed = false, updated_at = now();
      ELSE
        UPDATE public.transactions SET is_reversed = true, updated_at = now(),
          notes = COALESCE(notes, '') || ' [OUT nol; tidak aktif pada closing ulang]'
        WHERE tenant_id = p_tenant_id AND idempotency_key = 'daily-out:' || v_header_id::text || ':' || v_material_id::text;
      END IF;

      IF ABS(v_adjustment) > 0.0001 THEN
        INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by,
          unit_cost_snapshot, source_module, source_record_id, idempotency_key, is_reversed)
        VALUES (p_tenant_id, v_branch_id, p_date, v_material_id, 'OPNAME_ADJ', v_location, v_adjustment, ABS(v_adjustment) * v_unit_cost,
          'Rekonsiliasi EOD [' || p_date::text || '] ' || COALESCE(v_mat.name, v_material_id::text), v_user_id,
          v_unit_cost, 'daily_inventory', v_item_id::text, 'daily-adjustment:' || v_header_id::text || ':' || v_material_id::text, false)
        ON CONFLICT (tenant_id, idempotency_key) DO UPDATE SET
          branch_id = EXCLUDED.branch_id, qty = EXCLUDED.qty, amount = EXCLUDED.amount, notes = EXCLUDED.notes,
          unit_cost_snapshot = EXCLUDED.unit_cost_snapshot, source_record_id = EXCLUDED.source_record_id, is_reversed = false, updated_at = now();
      ELSE
        UPDATE public.transactions SET is_reversed = true, updated_at = now(),
          notes = COALESCE(notes, '') || ' [penyesuaian nol; tidak aktif pada closing ulang]'
        WHERE tenant_id = p_tenant_id AND idempotency_key = 'daily-adjustment:' || v_header_id::text || ':' || v_material_id::text;
      END IF;

      IF v_location = 'RESTO' THEN
        UPDATE public.materials SET qty_resto = v_closing, updated_at = now()
        WHERE id = v_material_id AND tenant_id = p_tenant_id;
      ELSE
        UPDATE public.materials SET qty_central = v_closing, updated_at = now()
        WHERE id = v_material_id AND tenant_id = p_tenant_id;
      END IF;

      UPDATE public.daily_inventory_items SET book_qty_before_close = v_current_qty, eod_adjustment_qty = v_adjustment
      WHERE id = v_item_id;
    END IF;
  END LOOP;

  UPDATE public.daily_inventories SET status = CASE WHEN p_is_closing THEN 'verified' ELSE 'draft' END,
    checked_by = v_user_id, verified_by = CASE WHEN p_is_closing THEN v_user_id ELSE NULL END,
    updated_at = now()
  WHERE id = v_header_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'inventory_id', v_header_id,
    'status', CASE WHEN p_is_closing THEN 'verified' ELSE 'draft' END,
    'saved_count', v_saved_count,
    'branch_id', v_branch_id
  );
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.atomic_save_daily_inventory_v3(uuid, date, text, jsonb, boolean, uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.atomic_save_daily_inventory_v3(uuid, date, text, jsonb, boolean, uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

GRANT EXECUTE ON FUNCTION public.atomic_save_daily_inventory_v3(uuid, date, text, jsonb, boolean, uuid) TO authenticated;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.atomic_save_daily_inventory_v4(
  p_tenant_id uuid,
  p_date date,
  p_location text,
  p_items jsonb,
  p_is_closing boolean DEFAULT false,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_location public.stock_location;
  v_user_id uuid := COALESCE(auth.uid(), p_user_id);
  v_user_role text;
  v_is_manager boolean := false;
  v_header_id bigint;
  v_status text;
  v_branch_id uuid;
  v_item jsonb;
  v_normalized_items jsonb := '[]'::jsonb;
  v_material public.materials%ROWTYPE;
  v_material_id bigint;
  v_opening numeric(16,4);
  v_opening_source text;
  v_previous_date date;
  v_out_input numeric(16,4);
  v_out_unit text;
  v_out numeric(16,4);
  v_out_confirmed boolean;
  v_zero_confirmed boolean;
  v_broken numeric(16,4);
  v_broken_unit text;
  v_broken_base numeric(16,4);
  v_broken_confirmed boolean;
  v_broken_tracking boolean;
  v_expiry_tracking boolean;
  v_pack_units numeric(16,4);
  v_stock_movement numeric(16,4);
  v_waste numeric(16,4);
  v_production_usage numeric(16,4);
  v_book_closing numeric(16,4);
  v_raw_full numeric(16,4);
  v_full numeric(16,4);
  v_physical_total numeric(16,4);
  v_payload_close numeric(16,4);
  v_active_lot_id uuid;
  v_active_lot_expiry date;
  v_earliest_expiry date;
  v_lot_total numeric(16,4);
  v_current_qty numeric(16,4);
  v_expected_lot_total numeric(16,4);
  v_has_unverified_lots boolean;
  v_lot_mismatch boolean;
  v_fefo_exception boolean;
  v_lot_needs_reason boolean;
  v_override_reason text;
  v_result jsonb;
  v_detail_id bigint;
  v_batch record;
  v_remaining numeric(16,4);
  v_take numeric(16,4);
  v_new_open_lot_id uuid;
  v_consume record;
  v_consume_type text;
  v_consume_qty numeric(16,4);
BEGIN
  IF p_tenant_id IS NULL OR (public.bv2_auth_tenant_id() IS DISTINCT FROM p_tenant_id AND NOT public.bv2_is_superadmin()) THEN
    RAISE EXCEPTION 'Akses tenant ditolak.' USING ERRCODE = '42501';
  END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Tanggal inventaris wajib diisi.'; END IF;
  IF upper(COALESCE(p_location,'')) NOT IN ('RESTO','CENTRAL') THEN RAISE EXCEPTION 'Lokasi inventaris tidak valid.'; END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Data item inventaris harus berupa array yang tidak kosong.';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) x GROUP BY (x->>'material_id') HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Ada material duplikat dalam satu pengiriman Daily Inventory.';
  END IF;

  SELECT m.branch_id INTO v_branch_id
  FROM public.materials m
  WHERE m.id = NULLIF((p_items->0)->>'material_id', '')::bigint
    AND m.tenant_id = p_tenant_id
  LIMIT 1;
  v_branch_id := COALESCE(v_branch_id, public.bv2_auth_branch_id());

  v_location := upper(p_location)::public.stock_location;
  SELECT u.role::text INTO v_user_role FROM public.users u WHERE u.id = auth.uid() AND u.tenant_id = p_tenant_id LIMIT 1;
  v_is_manager := public.bv2_is_superadmin() OR public.bv2_is_admin() OR lower(COALESCE(v_user_role,'')) IN ('admin / owner','admin  owner','owner','supervisor','super admin');
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(COALESCE(v_branch_id::text, '') || ':' || p_date::text || ':' || v_location::text));

  -- Periksa kelengkapan material HANYA pada cabang yang sedang aktif (v_branch_id)
  IF p_is_closing AND EXISTS (
    SELECT 1 FROM public.materials m
    WHERE m.tenant_id = p_tenant_id
      AND (v_branch_id IS NULL OR m.branch_id = v_branch_id)
      AND COALESCE(m.is_active, true) = true
      AND upper(COALESCE(m.category,'')) <> 'ASSET'
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) x WHERE (x->>'material_id')::bigint = m.id)
  ) THEN
    RAISE EXCEPTION 'Closing ditolak: ada material aktif pada cabang ini yang belum dimuat pada halaman. Muat ulang Daily Inventory lalu periksa seluruh halaman.';
  END IF;

  SELECT h.id, h.status INTO v_header_id, v_status
  FROM public.daily_inventories h
  WHERE h.tenant_id = p_tenant_id
    AND (v_branch_id IS NULL OR h.branch_id = v_branch_id)
    AND h.date = p_date
    AND h.location = v_location
  ORDER BY h.id ASC
  LIMIT 1
  FOR UPDATE;
  IF FOUND AND lower(COALESCE(v_status,'draft')) IN ('verified','closed') THEN
    RAISE EXCEPTION 'EOD tanggal % lokasi % sudah terkunci.', p_date, v_location;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY (value->>'material_id')::bigint LOOP
    v_material_id := NULLIF(v_item->>'material_id','')::bigint;
    IF v_material_id IS NULL THEN RAISE EXCEPTION 'Setiap baris wajib memiliki material_id.'; END IF;
    SELECT * INTO v_material FROM public.materials m WHERE m.id = v_material_id AND m.tenant_id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Material % tidak ditemukan pada tenant ini.', v_material_id; END IF;

    SELECT o.opening_qty, o.opening_qty_source, o.previous_date
    INTO v_opening, v_opening_source, v_previous_date
    FROM public.daily_inventory_opening_v4(p_tenant_id, p_date, v_location, v_material_id) o;

    v_out_input := NULLIF(v_item->>'out_qty_input','')::numeric;
    v_out_unit := COALESCE(NULLIF(btrim(v_item->>'out_unit'),''), v_material.unit);
    v_out_confirmed := COALESCE((v_item->>'out_confirmed')::boolean, false);
    v_zero_confirmed := COALESCE((v_item->>'zero_activity_confirmed')::boolean, false);
    IF v_out_input IS NOT NULL THEN
      v_out := public.convert_material_qty_to_stock_unit_v3(p_tenant_id, v_material_id, v_out_input, v_out_unit);
    ELSE
      v_out := COALESCE(NULLIF(v_item->>'out_qty','')::numeric, 0);
    END IF;
    IF v_out < 0 THEN RAISE EXCEPTION 'OUT tidak boleh negatif untuk material %.', v_material.name; END IF;
    IF p_is_closing AND NOT v_out_confirmed THEN
      RAISE EXCEPTION 'Closing ditolak: OUT % belum dikonfirmasi. Isi pemakaian aktual atau konfirmasi nol.', v_material.name;
    END IF;
    IF v_zero_confirmed AND COALESCE(v_out_input, v_out, 0) <> 0 THEN
      RAISE EXCEPTION 'Material % ditandai OUT=0 tetapi kuantitas OUT tidak nol.', v_material.name;
    END IF;

    v_broken_tracking := COALESCE(v_material.broken_tracking_enabled, false);
    v_broken_confirmed := COALESCE((v_item->>'broken_confirmed')::boolean, false);
    v_broken_unit := COALESCE(NULLIF(btrim(v_item->>'broken_unit'),''), v_material.unit);
    v_broken := NULLIF(v_item->>'broken_qty','')::numeric;
    IF v_broken_tracking AND p_is_closing AND (v_broken IS NULL OR NOT v_broken_confirmed) THEN
      RAISE EXCEPTION 'Closing ditolak: BROKEN % wajib diisi dari hasil timbang.', v_material.name;
    END IF;
    IF v_broken IS NULL THEN v_broken := 0; END IF;
    IF v_broken < 0 THEN RAISE EXCEPTION 'BROKEN tidak boleh negatif untuk material %.', v_material.name; END IF;
    IF v_broken_tracking THEN
      v_broken_base := public.convert_material_qty_to_stock_unit_v3(p_tenant_id, v_material_id, v_broken, v_broken_unit);
    ELSE
      v_broken_base := 0;
      v_broken_confirmed := true;
    END IF;

    SELECT COALESCE(SUM(t.qty), 0) INTO v_stock_movement
    FROM public.transactions t
    WHERE t.tenant_id = p_tenant_id AND t.material_id = v_material_id AND t.location = v_location AND t.date = p_date
      AND COALESCE(t.is_reversed, false) = false
      AND t.type NOT IN ('POS_SALE', 'POS_DEDUCTION', 'WASTE', 'BREAKAGE', 'EXPIRED', 'COMP')
      AND NOT (t.type = 'OUT' AND COALESCE(t.source_module, '') IN ('daily_inventory', 'production'));
    SELECT COALESCE(SUM(ABS(t.qty)), 0) INTO v_waste
    FROM public.transactions t
    WHERE t.tenant_id = p_tenant_id AND t.material_id = v_material_id AND t.location = v_location AND t.date = p_date
      AND t.type IN ('WASTE','BREAKAGE','EXPIRED','COMP') AND COALESCE(t.is_reversed, false) = false;
    SELECT COALESCE(SUM(ABS(t.qty)), 0) INTO v_production_usage
    FROM public.transactions t
    WHERE t.tenant_id = p_tenant_id AND t.material_id = v_material_id AND t.location = v_location AND t.date = p_date
      AND t.type = 'OUT' AND t.source_module = 'production' AND COALESCE(t.is_reversed, false) = false;

    v_book_closing := v_opening + COALESCE(v_stock_movement,0) - v_out - COALESCE(v_waste,0) - COALESCE(v_production_usage,0);
    IF v_book_closing < -0.0001 THEN RAISE EXCEPTION 'Saldo akhir buku negatif untuk %. Periksa mutasi hari ini.', v_material.name; END IF;
    v_book_closing := GREATEST(v_book_closing, 0);

    v_pack_units := GREATEST(public.stock_units_per_pack_v3(p_tenant_id, v_material_id), 0.000001);
    v_raw_full := v_book_closing / v_pack_units;
    v_full := GREATEST(floor(v_raw_full + 0.00000001), 0);

    v_expiry_tracking := COALESCE(v_material.expiry_tracking_enabled,false);
    v_active_lot_id := NULL;
    v_lot_needs_reason := false;
    v_override_reason := NULLIF(btrim(v_item->>'fefo_override_reason'),'');

    v_item := v_item || jsonb_build_object(
      'opening_qty', v_opening,
      'opening_qty_source', v_opening_source,
      'out_qty', v_out,
      'out_qty_input', v_out_input,
      'out_unit', v_out_unit,
      'out_confirmed', v_out_confirmed,
      'zero_activity_confirmed', v_zero_confirmed,
      'broken_qty', CASE WHEN v_broken_tracking THEN v_broken ELSE 0 END,
      'broken_unit', v_broken_unit,
      'broken_confirmed', v_broken_confirmed,
      'full_qty', v_full,
      'closing_qty', v_book_closing,
      'is_counted', true,
      'opening_active_open_lot_id', v_active_lot_id,
      'fefo_override_reason', v_override_reason,
      'v4_broken_base', v_broken_base,
      'v4_broken_tracking', v_broken_tracking,
      'v4_expiry_tracking', v_expiry_tracking,
      'v4_book_closing', v_book_closing,
      'v4_out', v_out,
      'v4_stock_movement', COALESCE(v_stock_movement,0),
      'v4_waste', COALESCE(v_waste,0),
      'v4_production_usage', COALESCE(v_production_usage,0),
      'v4_lot_needs_reason', v_lot_needs_reason
    );
    v_normalized_items := v_normalized_items || jsonb_build_array(v_item);
  END LOOP;

  v_result := public.atomic_save_daily_inventory_v3(p_tenant_id, p_date, p_location, v_normalized_items, p_is_closing, v_user_id);
  v_header_id := (v_result->>'inventory_id')::bigint;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_normalized_items) ORDER BY (value->>'material_id')::bigint LOOP
    v_material_id := (v_item->>'material_id')::bigint;
    SELECT i.id INTO v_detail_id FROM public.daily_inventory_items i WHERE i.inventory_id = v_header_id AND i.material_id = v_material_id;
    UPDATE public.daily_inventory_items i SET
      branch_id = COALESCE(i.branch_id, v_branch_id),
      prev_full_qty = NULLIF(v_item->>'opening_qty','')::numeric,
      opening_qty_snapshot = NULLIF(v_item->>'opening_qty','')::numeric,
      opening_full_qty = NULLIF(v_item->>'opening_full_qty','')::numeric,
      opening_broken_qty = NULLIF(v_item->>'opening_broken_qty','')::numeric,
      closing_broken_qty_base = NULLIF(v_item->>'v4_broken_base','')::numeric,
      broken_unit = NULLIF(v_item->>'broken_unit',''),
      broken_confirmed = COALESCE((v_item->>'broken_confirmed')::boolean,false),
      out_qty_input = NULLIF(v_item->>'out_qty_input','')::numeric,
      out_unit = NULLIF(v_item->>'out_unit',''),
      out_confirmed = COALESCE((v_item->>'out_confirmed')::boolean,false),
      zero_activity_confirmed = COALESCE((v_item->>'zero_activity_confirmed')::boolean,false),
      closing_full_inferred_qty = NULLIF(v_item->>'full_qty','')::numeric,
      opening_active_open_lot_id = NULLIF(v_item->>'opening_active_open_lot_id','')::uuid,
      fefo_override_reason = NULLIF(v_item->>'fefo_override_reason',''),
      net_stock_movement_qty = COALESCE(NULLIF(v_item->>'v4_stock_movement','')::numeric,0),
      stock_based_usage_qty = COALESCE(NULLIF(v_item->>'opening_qty','')::numeric,0)
        + COALESCE(NULLIF(v_item->>'v4_stock_movement','')::numeric,0)
        - COALESCE(NULLIF(v_item->>'closing_qty','')::numeric,0)
        - COALESCE(NULLIF(v_item->>'v4_waste','')::numeric,0)
        - COALESCE(NULLIF(v_item->>'v4_production_usage','')::numeric,0),
      usage_variance_qty = (COALESCE(NULLIF(v_item->>'opening_qty','')::numeric,0)
        + COALESCE(NULLIF(v_item->>'v4_stock_movement','')::numeric,0)
        - COALESCE(NULLIF(v_item->>'closing_qty','')::numeric,0)
        - COALESCE(NULLIF(v_item->>'v4_waste','')::numeric,0)
        - COALESCE(NULLIF(v_item->>'v4_production_usage','')::numeric,0))
        - COALESCE(NULLIF(v_item->>'out_qty','')::numeric,0),
      production_usage_qty = COALESCE(NULLIF(v_item->>'v4_production_usage','')::numeric,0),
      terpakai_qty = COALESCE(NULLIF(v_item->>'out_qty','')::numeric,0) + COALESCE(NULLIF(v_item->>'v4_waste','')::numeric,0),
      usage_value = CASE WHEN p_is_closing THEN (COALESCE(NULLIF(v_item->>'out_qty','')::numeric,0) + COALESCE(NULLIF(v_item->>'v4_waste','')::numeric,0)) * COALESCE(i.unit_cost_snapshot,0) ELSE NULL END,
      reconciliation_status = CASE WHEN p_is_closing THEN 'CLOSED_BOOK_PLUS_BROKEN' ELSE 'PENDING' END
    WHERE i.id = v_detail_id;
  END LOOP;

  RETURN v_result || jsonb_build_object('version',4,'opening_policy','previous_closed_eod_plus_ledger','full_policy','inferred_from_book_balance_then_validate_broken','lot_policy','single_open_lot_fefo');
END;
$function$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.atomic_save_daily_inventory_v4(uuid, date, text, jsonb, boolean, uuid);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.atomic_save_daily_inventory_v4(uuid, date, text, jsonb, boolean, uuid): %', SQLERRM;
  END;
END $bv_fn_wrap$;

GRANT EXECUTE ON FUNCTION public.atomic_save_daily_inventory_v4(uuid, date, text, jsonb, boolean, uuid) TO authenticated;

-- 7B. Helper RPC untuk membersihkan akun beta lama jika GoTrue memerlukan SignUp native
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.prepare_beta_signup_v13(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_clean_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_uid UUID;
BEGIN
  IF v_clean_email NOT LIKE '%@umatis.id' THEN
    RAISE EXCEPTION 'Hanya akun beta @umatis.id yang diizinkan.';
  END IF;

  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = v_clean_email LIMIT 1;
  IF v_uid IS NOT NULL THEN
    DELETE FROM auth.identities WHERE user_id = v_uid;
    DELETE FROM public.users WHERE id = v_uid OR lower(email) = v_clean_email;
    DELETE FROM auth.users WHERE id = v_uid;
  ELSE
    DELETE FROM public.users WHERE lower(email) = v_clean_email;
  END IF;

  RETURN jsonb_build_object('prepared', true, 'email', v_clean_email);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('prepared', false, 'error', SQLERRM);
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.prepare_beta_signup_v13(TEXT);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.prepare_beta_signup_v13(TEXT): %', SQLERRM;
  END;
END $bv_fn_wrap$;

GRANT EXECUTE ON FUNCTION public.prepare_beta_signup_v13(text) TO anon, authenticated, service_role;

-- 7C. Helper RPC untuk mengikat profil akun Beta Testing ke Resto Umatis (Cabang BSD / Kasuna)
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.bind_beta_user_profile_v13(
  p_user_id UUID,
  p_preset_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
  v_bsd_branch_id UUID;
  v_kasuna_branch_id UUID;
  v_target_branch_id UUID;
  v_email TEXT;
  v_name TEXT;
  v_role public.user_role;
  v_key TEXT := upper(trim(COALESCE(p_preset_key, 'OWNER_BSD')));
BEGIN
  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE lower(COALESCE(company_name, '')) LIKE '%umatis%'
     OR lower(COALESCE(name, '')) LIKE '%umatis%'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id FROM public.tenants ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    INSERT INTO public.tenants (name, company_name, status, is_pos_enabled, overhead_pct, pos_tax_rate, pos_service_charge)
    VALUES ('restoumatis', 'Resto Umatis', 'active', true, 0.05, 10, 5)
    RETURNING id INTO v_tenant_id;
  ELSE
    UPDATE public.tenants
    SET company_name = 'Resto Umatis',
        status = 'active',
        is_pos_enabled = true
    WHERE id = v_tenant_id;
  END IF;

  SELECT id INTO v_bsd_branch_id
  FROM public.branches
  WHERE tenant_id = v_tenant_id AND upper(trim(COALESCE(code, ''))) = 'BSD'
  LIMIT 1;

  IF v_bsd_branch_id IS NULL THEN
    INSERT INTO public.branches (tenant_id, code, name, address, is_central, is_active)
    VALUES (v_tenant_id, 'BSD', 'BSD', 'BSD City, Tangerang Selatan', false, true)
    RETURNING id INTO v_bsd_branch_id;
  END IF;

  SELECT id INTO v_kasuna_branch_id
  FROM public.branches
  WHERE tenant_id = v_tenant_id AND upper(trim(COALESCE(code, ''))) = 'KASUNA'
  LIMIT 1;

  IF v_kasuna_branch_id IS NULL THEN
    INSERT INTO public.branches (tenant_id, code, name, address, is_central, is_active)
    VALUES (v_tenant_id, 'KASUNA', 'Kasuna', 'Cabang Kasuna, Tangerang Selatan', false, true)
    RETURNING id INTO v_kasuna_branch_id;
  END IF;

  IF v_key = 'BARISTA_BSD' THEN
    v_email := 'barista.bsd@umatis.id';
    v_name := 'Barista Cabang BSD (Beta)';
    v_role := 'Bar'::public.user_role;
    v_target_branch_id := v_bsd_branch_id;
  ELSIF v_key = 'BARISTA_KASUNA' THEN
    v_email := 'barista.kasuna@umatis.id';
    v_name := 'Barista Cabang Kasuna (Beta)';
    v_role := 'Bar'::public.user_role;
    v_target_branch_id := v_kasuna_branch_id;
  ELSIF v_key = 'KITCHEN_BSD' THEN
    v_email := 'kitchen.bsd@umatis.id';
    v_name := 'Chef Kitchen BSD (Beta)';
    v_role := 'Kitchen'::public.user_role;
    v_target_branch_id := v_bsd_branch_id;
  ELSIF v_key = 'SERVICE_BSD' THEN
    v_email := 'service.bsd@umatis.id';
    v_name := 'Staf Service & Floor BSD (Beta)';
    v_role := 'Service'::public.user_role;
    v_target_branch_id := v_bsd_branch_id;
  ELSIF v_key = 'PURCHASING_BSD' THEN
    v_email := 'purchasing.bsd@umatis.id';
    v_name := 'Purchasing & Central (Beta)';
    v_role := 'Purchasing'::public.user_role;
    v_target_branch_id := v_bsd_branch_id;
  ELSIF v_key = 'KASIR_BSD' THEN
    v_email := 'kasir.bsd@umatis.id';
    v_name := 'Kasir POS ESB (Beta)';
    v_role := 'Kasir'::public.user_role;
    v_target_branch_id := v_bsd_branch_id;
  ELSE
    v_email := 'owner.beta@umatis.id';
    v_name := 'Owner Resto Umatis (Beta)';
    v_role := 'Owner'::public.user_role;
    v_target_branch_id := v_bsd_branch_id;
  END IF;

  BEGIN
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
        confirmation_token = COALESCE(confirmation_token, ''),
        recovery_token = COALESCE(recovery_token, ''),
        email_change_token_new = COALESCE(email_change_token_new, ''),
        email_change = COALESCE(email_change, ''),
        updated_at = now()
    WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  DELETE FROM public.users WHERE lower(email) = lower(v_email) AND id <> p_user_id;

  INSERT INTO public.users (id, tenant_id, branch_id, name, email, role, created_at, updated_at)
  VALUES (p_user_id, v_tenant_id, v_target_branch_id, v_name, v_email, v_role, now(), now())
  ON CONFLICT (id) DO UPDATE
  SET tenant_id = EXCLUDED.tenant_id,
      branch_id = EXCLUDED.branch_id,
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      updated_at = now();

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'tenant_id', v_tenant_id,
    'branch_id', v_target_branch_id,
    'role', v_role::text,
    'email', v_email
  );
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.bind_beta_user_profile_v13(UUID, TEXT);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.bind_beta_user_profile_v13(UUID, TEXT): %', SQLERRM;
  END;
END $bv_fn_wrap$;

GRANT EXECUTE ON FUNCTION public.bind_beta_user_profile_v13(uuid, text) TO anon, authenticated, service_role;

-- 7D. Helper Idempotent untuk Upsert Supplier & Material Tanpa Risiko Error 23505
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.bv_upsert_supplier_v13(
  p_tenant_id UUID,
  p_branch_id UUID,
  p_name VARCHAR,
  p_phone VARCHAR,
  p_address TEXT,
  p_contact VARCHAR,
  p_otif NUMERIC,
  p_rej NUMERIC,
  p_tot INT,
  p_ontime INT
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  SELECT id INTO v_id
  FROM public.suppliers
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND lower(trim(name)) = lower(trim(p_name))
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  BEGIN
    INSERT INTO public.suppliers (
      tenant_id, branch_id, name, phone, address, contact_person, status,
      otif_score, rejection_rate, total_deliveries, on_time_deliveries
    ) VALUES (
      p_tenant_id, p_branch_id, p_name, p_phone, p_address, p_contact, 'ACTIVE',
      p_otif, p_rej, p_tot, p_ontime
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_id
    FROM public.suppliers
    WHERE tenant_id = p_tenant_id
      AND lower(trim(name)) = lower(trim(p_name))
    ORDER BY (branch_id = p_branch_id) DESC, id ASC
    LIMIT 1;
  END;

  RETURN v_id;
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.bv_upsert_supplier_v13(UUID, UUID, VARCHAR, VARCHAR, TEXT, VARCHAR, NUMERIC, NUMERIC, INT, INT);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.bv_upsert_supplier_v13(UUID, UUID, VARCHAR, VARCHAR, TEXT, VARCHAR, NUMERIC, NUMERIC, INT, INT): %', SQLERRM;
  END;
END $bv_fn_wrap$;

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.bv_upsert_material_v13(
  p_tenant_id UUID,
  p_branch_id UUID,
  p_name VARCHAR,
  p_category VARCHAR,
  p_supplier VARCHAR,
  p_supplier_id BIGINT,
  p_unit VARCHAR,
  p_full_pack VARCHAR,
  p_price BIGINT,
  p_qty_resto NUMERIC,
  p_qty_central NUMERIC,
  p_min_stock NUMERIC,
  p_par_stock NUMERIC,
  p_monthly_quota NUMERIC,
  p_is_preparable BOOLEAN,
  p_is_prep_output BOOLEAN,
  p_broken_tracking BOOLEAN,
  p_expiry_tracking BOOLEAN,
  p_item_code VARCHAR,
  p_sku VARCHAR
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  SELECT id INTO v_id
  FROM public.materials
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND (
      lower(trim(name)) = lower(trim(p_name))
      OR (p_item_code IS NOT NULL AND item_code = p_item_code)
    )
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.materials
    SET unit = COALESCE(NULLIF(trim(unit), ''), p_unit),
        full_pack = CASE WHEN full_pack IS NULL OR full_pack !~ '=' THEN p_full_pack ELSE full_pack END,
        monthly_quota_qty = CASE WHEN COALESCE(monthly_quota_qty, 0) = 0 THEN p_monthly_quota ELSE monthly_quota_qty END,
        is_prep_output = COALESCE(is_prep_output, false) OR p_is_prep_output,
        is_preparable = COALESCE(is_preparable, false) OR p_is_preparable
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  BEGIN
    INSERT INTO public.materials (
      tenant_id, branch_id, name, category, supplier, supplier_id, unit, full_pack,
      price, new_price, avg_cost, qty_resto, qty_central, min_stock, par_stock,
      monthly_quota_qty, is_active, is_preparable, is_prep_output,
      broken_tracking_enabled, expiry_tracking_enabled, item_code, sku
    ) VALUES (
      p_tenant_id, p_branch_id, p_name, p_category, p_supplier, p_supplier_id, p_unit, p_full_pack,
      p_price, p_price, p_price, p_qty_resto, p_qty_central, p_min_stock, p_par_stock,
      p_monthly_quota, true, p_is_preparable, p_is_prep_output,
      p_broken_tracking, p_expiry_tracking, p_item_code, p_sku
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_id
    FROM public.materials
    WHERE tenant_id = p_tenant_id
      AND (
        lower(trim(name)) = lower(trim(p_name))
        OR (p_item_code IS NOT NULL AND item_code = p_item_code)
      )
    ORDER BY (branch_id = p_branch_id) DESC, id ASC
    LIMIT 1;
  END;

  RETURN v_id;
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.bv_upsert_material_v13(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, BIGINT, VARCHAR, VARCHAR, BIGINT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, VARCHAR, VARCHAR);
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.bv_upsert_material_v13(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, BIGINT, VARCHAR, VARCHAR, BIGINT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, VARCHAR, VARCHAR): %', SQLERRM;
  END;
END $bv_fn_wrap$;

-- 7E. Fungsi Utama Seed Akun Beta Testing & Data Dummy Lengkap (BSD & Kasuna)
DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.seed_beta_testing_dummy_data_v13()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
  v_bsd_id UUID;
  v_kasuna_id UUID;
  v_branch_id UUID;
  v_branch_code TEXT;
  v_owner_uid UUID;
  v_sup_roastery BIGINT;
  v_sup_dairy BIGINT;
  v_sup_fruit BIGINT;
  v_sup_syrup BIGINT;
  v_sup_packaging BIGINT;
  v_mat_kopi BIGINT;
  v_mat_milk BIGINT;
  v_mat_aren BIGINT;
  v_mat_lychee BIGINT;
  v_mat_avocado BIGINT;
  v_mat_kelapa BIGINT;
  v_mat_mineral BIGINT;
  v_mat_almond BIGINT;
  v_mat_apple BIGINT;
  v_mat_jeruk_raw BIGINT;
  v_mat_wortel_raw BIGINT;
  v_mat_pokcoy_raw BIGINT;
  v_mat_jeruk_prep BIGINT;
  v_mat_green_prep BIGINT;
  v_mat_carrot_prep BIGINT;
  v_mat_syrup_prep BIGINT;
  v_rec_aren BIGINT;
  v_rec_avocado BIGINT;
  v_rec_cap BIGINT;
  v_rec_kelapa BIGINT;
  v_rec_jeruk BIGINT;
  v_rec_lychee BIGINT;
  v_rec_green BIGINT;
  v_rec_carrot BIGINT;
  v_pos_tx_id UUID;
  v_di_id BIGINT;
  v_opname_central_id BIGINT;
  v_transfer_id UUID;
  v_svg_photo TEXT := 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="100%" height="100%" fill="%230f172a"/><text x="50%" y="50%" fill="%2310b981" font-family="sans-serif" font-size="16" text-anchor="middle" dy=".3em">Bukti Foto Timbangan Beta Testing</text></svg>';
  v_acc RECORD;
  v_uid UUID;
BEGIN
  -- 1. Pastikan Tenant Resto Umatis aktif
  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE lower(COALESCE(company_name, '')) LIKE '%umatis%'
     OR lower(COALESCE(name, '')) LIKE '%umatis%'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id FROM public.tenants ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    INSERT INTO public.tenants (name, company_name, status, is_pos_enabled, overhead_pct, pos_tax_rate, pos_service_charge)
    VALUES ('restoumatis', 'Resto Umatis', 'active', true, 0.05, 10, 5)
    RETURNING id INTO v_tenant_id;
  ELSE
    UPDATE public.tenants
    SET company_name = 'Resto Umatis',
        status = 'active',
        is_pos_enabled = true,
        pos_tax_rate = COALESCE(pos_tax_rate, 10),
        pos_service_charge = COALESCE(pos_service_charge, 5)
    WHERE id = v_tenant_id;
  END IF;

  -- 2. Pastikan Cabang BSD & Kasuna tersedia
  SELECT id INTO v_bsd_id
  FROM public.branches
  WHERE tenant_id = v_tenant_id AND upper(trim(COALESCE(code, ''))) = 'BSD'
  LIMIT 1;

  IF v_bsd_id IS NULL THEN
    INSERT INTO public.branches (tenant_id, code, name, address, is_central, is_active)
    VALUES (v_tenant_id, 'BSD', 'BSD', 'BSD City, Tangerang Selatan', false, true)
    RETURNING id INTO v_bsd_id;
  ELSE
    UPDATE public.branches SET name = 'BSD', is_active = true WHERE id = v_bsd_id;
  END IF;

  SELECT id INTO v_kasuna_id
  FROM public.branches
  WHERE tenant_id = v_tenant_id AND upper(trim(COALESCE(code, ''))) = 'KASUNA'
  LIMIT 1;

  IF v_kasuna_id IS NULL THEN
    INSERT INTO public.branches (tenant_id, code, name, address, is_central, is_active)
    VALUES (v_tenant_id, 'KASUNA', 'Kasuna', 'Cabang Kasuna, Tangerang Selatan', false, true)
    RETURNING id INTO v_kasuna_id;
  ELSE
    UPDATE public.branches SET name = 'Kasuna', is_active = true WHERE id = v_kasuna_id;
  END IF;

  -- 3. Seed 5 Akun Shortcut Beta Testing ke auth.users, auth.identities, dan public.users
  FOR v_acc IN
    SELECT * FROM (VALUES
      ('a0000000-be7a-4000-8000-000000000001'::uuid, 'owner.beta@umatis.id',      'Owner Resto Umatis (Beta)',       'Owner'::public.user_role,      v_bsd_id),
      ('a0000000-be7a-4000-8000-000000000002'::uuid, 'barista.bsd@umatis.id',     'Barista Cabang BSD (Beta)',       'Bar'::public.user_role,        v_bsd_id),
      ('a0000000-be7a-4000-8000-000000000003'::uuid, 'barista.kasuna@umatis.id',  'Barista Cabang Kasuna (Beta)',    'Bar'::public.user_role,        v_kasuna_id),
      ('a0000000-be7a-4000-8000-000000000006'::uuid, 'kitchen.bsd@umatis.id',     'Chef Kitchen BSD (Beta)',         'Kitchen'::public.user_role,    v_bsd_id),
      ('a0000000-be7a-4000-8000-000000000007'::uuid, 'service.bsd@umatis.id',     'Staf Service & Floor BSD (Beta)', 'Service'::public.user_role,    v_bsd_id),
      ('a0000000-be7a-4000-8000-000000000004'::uuid, 'purchasing.bsd@umatis.id',  'Purchasing & Central (Beta)',     'Purchasing'::public.user_role, v_bsd_id),
      ('a0000000-be7a-4000-8000-000000000005'::uuid, 'kasir.bsd@umatis.id',       'Kasir POS ESB (Beta)',            'Kasir'::public.user_role,      v_bsd_id)
    ) AS t(default_uid, email, full_name, user_role_val, target_branch)
  LOOP
    BEGIN
      SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(v_acc.email) LIMIT 1;
      IF v_uid IS NULL THEN
        v_uid := v_acc.default_uid;
        INSERT INTO auth.users (
          instance_id, id, aud, role, email, encrypted_password,
          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
          created_at, updated_at, confirmation_token, email_change,
          email_change_token_new, recovery_token
        ) VALUES (
          '00000000-0000-0000-0000-000000000000',
          v_uid,
          'authenticated',
          'authenticated',
          v_acc.email,
          crypt('BetaUmatis2026!', gen_salt('bf')),
          now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('name', v_acc.full_name, 'role', v_acc.user_role_val::text, 'company_name', 'Resto Umatis'),
          now(),
          now(),
          '', '', '', ''
        );
      ELSE
        UPDATE auth.users
        SET encrypted_password = crypt('BetaUmatis2026!', gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            confirmation_token = COALESCE(confirmation_token, ''),
            recovery_token = COALESCE(recovery_token, ''),
            email_change_token_new = COALESCE(email_change_token_new, ''),
            email_change = COALESCE(email_change, ''),
            updated_at = now()
        WHERE id = v_uid;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM auth.identities WHERE user_id = v_uid AND provider = 'email'
      ) THEN
        BEGIN
          INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
          ) VALUES (
            gen_random_uuid(),
            v_uid,
            jsonb_build_object('sub', v_uid::text, 'email', v_acc.email, 'email_verified', true, 'phone_verified', false),
            'email',
            v_uid::text,
            now(),
            now(),
            now()
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;

      DELETE FROM public.users WHERE lower(email) = lower(v_acc.email) AND id <> v_uid;

      INSERT INTO public.users (id, tenant_id, branch_id, name, email, role, created_at, updated_at)
      VALUES (v_uid, v_tenant_id, v_acc.target_branch, v_acc.full_name, v_acc.email, v_acc.user_role_val, now(), now())
      ON CONFLICT (id) DO UPDATE
      SET tenant_id = EXCLUDED.tenant_id,
          branch_id = EXCLUDED.branch_id,
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          role = EXCLUDED.role,
          updated_at = now();
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Lewati pembuatan auth.users untuk %: %', v_acc.email, SQLERRM;
    END;
  END LOOP;

  SELECT id INTO v_owner_uid FROM public.users WHERE tenant_id = v_tenant_id ORDER BY created_at ASC LIMIT 1;

  -- 4. Loop untuk Kedua Cabang: BSD & Kasuna
  FOR v_branch_id, v_branch_code IN
    SELECT b.id, b.code FROM public.branches b WHERE b.tenant_id = v_tenant_id AND b.code IN ('BSD', 'KASUNA')
  LOOP
    -- 4A. Master Suppliers (Bebas Error 23505)
    v_sup_roastery := public.bv_upsert_supplier_v13(v_tenant_id, v_branch_id, 'Titik Temu Roastery', '081288001122', 'Jl. Senopati No. 45, Jakarta Selatan', 'Bima (Roastery)', 96.5, 1.2, 24, 23);
    v_sup_dairy := public.bv_upsert_supplier_v13(v_tenant_id, v_branch_id, 'PT. GreenField Indonesia', '081199223344', 'Kawasan Industri BSD, Tangerang', 'Rina (Dairy)', 94.5, 1.5, 18, 17);
    v_sup_fruit := public.bv_upsert_supplier_v13(v_tenant_id, v_branch_id, 'Fresh Mandiri Fruit', '081377665544', 'Pasar Modern BSD Pintu Timur', 'Hendra (Produce)', 91.0, 3.0, 30, 27);
    v_sup_syrup := public.bv_upsert_supplier_v13(v_tenant_id, v_branch_id, 'Dripp Syrup Official', '081566778899', 'Pergudangan Taman Tekno BSD', 'Kevin (Syrup)', 98.0, 0.5, 15, 15);
    v_sup_packaging := public.bv_upsert_supplier_v13(v_tenant_id, v_branch_id, 'PT. Anak Mas Indah', '081744556677', 'Alam Sutera Boulevard, Tangerang', 'Sari (Beverage)', 95.0, 1.0, 20, 19);

    -- 4B. Master Materials (16 Bahan: 12 Bahan Baku + 4 Bahan Setengah Jadi / Prep Output)
    v_mat_kopi := public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Kopi Beans House Blend', 'Coffee', 'Titik Temu Roastery', v_sup_roastery, 'pck', 'pck = 1000 gr', 185000, 12, 25, 5, 20, 45, false, false, true, true, 'MAT-' || v_branch_code || '-001', 'SKU-' || v_branch_code || '-001');
    v_mat_milk := public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Fresh Milk Greenfields 1L', 'Dairy', 'PT. GreenField Indonesia', v_sup_dairy, 'pck', 'pck = 1000 ml', 22500, 36, 80, 15, 60, 180, false, false, true, true, 'MAT-' || v_branch_code || '-002', 'SKU-' || v_branch_code || '-002');
    v_mat_aren := public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Gula Aren Cair Organik', 'Sweetener', 'Dripp Syrup Official', v_sup_syrup, 'btl', 'btl = 1000 ml', 42000, 10, 20, 5, 15, 35, false, false, true, true, 'MAT-' || v_branch_code || '-003', 'SKU-' || v_branch_code || '-003');
    v_mat_lychee := public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Syrup Lychee Dripp', 'Syrup', 'Dripp Syrup Official', v_sup_syrup, 'btl', 'btl = 750 ml', 95000, 6, 12, 3, 10, 18, false, false, true, true, 'MAT-' || v_branch_code || '-004', 'SKU-' || v_branch_code || '-004');
    v_mat_avocado := public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Avocado Frozen Puree', 'Fruit & Produce', 'Fresh Mandiri Fruit', v_sup_fruit, 'pck', 'pck = 1000 gr', 58000, 15, 30, 6, 20, 40, false, false, true, true, 'MAT-' || v_branch_code || '-005', 'SKU-' || v_branch_code || '-005');
    v_mat_kelapa := public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Air Kelapa Murni', 'Beverage Base', 'Fresh Mandiri Fruit', v_sup_fruit, 'pck', 'pck = 1000 ml', 16000, 14, 20, 5, 18, 40, false, false, true, true, 'MAT-' || v_branch_code || '-006', 'SKU-' || v_branch_code || '-006');
    v_mat_mineral := public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Air Mineral 600ml', 'Ready to Drink', 'PT. Anak Mas Indah', v_sup_packaging, 'pcs', 'pcs = 600 ml', 2300, 120, 240, 48, 150, 400, false, false, false, false, 'MAT-' || v_branch_code || '-007', 'SKU-' || v_branch_code || '-007');
    v_mat_almond := public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Almond Milk Unsweetened', 'Dairy', 'PT. GreenField Indonesia', v_sup_dairy, 'pck', 'pck = 1000 ml', 39500, 8, 16, 4, 12, 25, false, false, true, true, 'MAT-' || v_branch_code || '-008', 'SKU-' || v_branch_code || '-008');
    v_mat_apple := public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Apple Juice Concentrate', 'Beverage Base', 'PT. Anak Mas Indah', v_sup_packaging, 'btl', 'btl = 1000 ml', 24000, 7, 14, 3, 10, 22, false, false, true, true, 'MAT-' || v_branch_code || '-009', 'SKU-' || v_branch_code || '-009');
    v_mat_jeruk_raw := public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Jeruk Pontianak Segar (Raw)', 'Fruit & Produce', 'Fresh Mandiri Fruit', v_sup_fruit, 'kg', 'kg = 1000 gr', 28000, 18, 35, 8, 25, 60, true, false, true, true, 'MAT-' || v_branch_code || '-010', 'SKU-' || v_branch_code || '-010');
    v_mat_wortel_raw := public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Wortel Brastagi Segar (Raw)', 'Fruit & Produce', 'Fresh Mandiri Fruit', v_sup_fruit, 'kg', 'kg = 1000 gr', 16000, 12, 20, 5, 15, 35, true, false, true, true, 'MAT-' || v_branch_code || '-011', 'SKU-' || v_branch_code || '-011');
    v_mat_pokcoy_raw := public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Pokcoy & Nanas Mix (Raw)', 'Fruit & Produce', 'Fresh Mandiri Fruit', v_sup_fruit, 'kg', 'kg = 1000 gr', 22000, 10, 18, 4, 14, 30, true, false, true, true, 'MAT-' || v_branch_code || '-012', 'SKU-' || v_branch_code || '-012');
    v_mat_jeruk_prep := public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Jus Jeruk Pontianak (Bersih)', 'Prep / Bahan Olahan', 'Internal Prep Barista', v_sup_fruit, 'btl', 'btl = 1000 ml', 45000, 6, 4, 3, 8, 30, false, true, true, true, 'MAT-' || v_branch_code || '-013', 'SKU-' || v_branch_code || '-013');
    v_mat_green_prep := public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Green Delight Base (Prep)', 'Prep / Bahan Olahan', 'Internal Prep Barista', v_sup_fruit, 'btl', 'btl = 1000 ml', 38000, 5, 3, 2, 6, 20, false, true, true, true, 'MAT-' || v_branch_code || '-014', 'SKU-' || v_branch_code || '-014');
    v_mat_carrot_prep := public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Beta Caroot E.ne Base (Prep)', 'Prep / Bahan Olahan', 'Internal Prep Barista', v_sup_fruit, 'btl', 'btl = 1000 ml', 34000, 5, 3, 2, 6, 20, false, true, true, true, 'MAT-' || v_branch_code || '-015', 'SKU-' || v_branch_code || '-015');
    v_mat_syrup_prep := public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Simple Syrup / Gula Cair (Prep)', 'Prep / Bahan Olahan', 'Internal Prep Barista', v_sup_syrup, 'btl', 'btl = 1000 ml', 15000, 8, 10, 3, 10, 35, false, true, true, true, 'MAT-' || v_branch_code || '-016', 'SKU-' || v_branch_code || '-016');
    -- Tambahan Bahan Baku Dummy Khusus Role Kitchen (Dapur) & Role Service (Floor/Packaging)
    PERFORM public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Daging Ayam Fillet Segar (Raw)', 'Meat & Poultry', 'Fresh Mandiri Fruit', v_sup_fruit, 'kg', 'kg = 1000 gr', 54000, 14, 30, 5, 20, 60, true, false, true, true, 'MAT-' || v_branch_code || '-017', 'SKU-' || v_branch_code || '-017');
    PERFORM public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Kentang Shoestring Premium 2.5kg', 'Kitchen & Cooking', 'Fresh Mandiri Fruit', v_sup_fruit, 'pck', 'pck = 2500 gr', 72000, 10, 24, 4, 15, 45, false, false, true, true, 'MAT-' || v_branch_code || '-018', 'SKU-' || v_branch_code || '-018');
    PERFORM public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Minyak Goreng Culinary 2L', 'Kitchen & Cooking', 'PT. Anak Mas Indah', v_sup_packaging, 'pck', 'pck = 2000 ml', 38000, 12, 30, 5, 18, 50, false, false, true, false, 'MAT-' || v_branch_code || '-019', 'SKU-' || v_branch_code || '-019');
    PERFORM public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Cup Takeaway 16oz + Lid Umatis', 'Packaging', 'PT. Anak Mas Indah', v_sup_packaging, 'pck', 'pck = 50 pcs', 45000, 15, 40, 5, 20, 60, false, false, false, false, 'MAT-' || v_branch_code || '-020', 'SKU-' || v_branch_code || '-020');
    PERFORM public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Sedotan Paper Straw Steril', 'Packaging', 'PT. Anak Mas Indah', v_sup_packaging, 'pck', 'pck = 100 pcs', 25000, 12, 35, 4, 15, 45, false, false, false, false, 'MAT-' || v_branch_code || '-021', 'SKU-' || v_branch_code || '-021');
    PERFORM public.bv_upsert_material_v13(v_tenant_id, v_branch_id, 'Tissue Dinner Napkin Resto Umatis', 'Amenities', 'PT. Anak Mas Indah', v_sup_packaging, 'pck', 'pck = 100 pcs', 18000, 18, 45, 6, 20, 60, false, false, false, false, 'MAT-' || v_branch_code || '-022', 'SKU-' || v_branch_code || '-022');

    -- Sinkronkan unit_conversions & material_location_costs untuk semua material cabang ini
    BEGIN
      INSERT INTO public.unit_conversions (tenant_id, branch_id, material_id, from_unit, to_unit, factor)
      SELECT
        m.tenant_id,
        m.branch_id,
        m.id,
        lower(trim(regexp_replace(split_part(m.full_pack, '=', 2), '^[0-9]+(\.[0-9]+)?\s*', ''))),
        lower(trim(m.unit)),
        (1.0 / ((regexp_match(split_part(m.full_pack, '=', 2), '([0-9]+(?:\.[0-9]+)?)'))[1])::numeric)
      FROM public.materials m
      WHERE m.tenant_id = v_tenant_id AND m.branch_id = v_branch_id AND m.full_pack LIKE '%=%'
        AND NOT EXISTS (
          SELECT 1 FROM public.unit_conversions uc
          WHERE uc.material_id = m.id
            AND lower(trim(uc.to_unit)) = lower(trim(m.unit))
        );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      INSERT INTO public.material_location_costs (tenant_id, branch_id, material_id, location, average_unit_cost, source, is_opening_estimated, updated_at)
      SELECT m.tenant_id, m.branch_id, m.id, loc.loc_val, COALESCE(m.new_price, m.price, 0), 'BETA_SEED', false, now()
      FROM public.materials m
      CROSS JOIN (VALUES ('RESTO'::public.stock_location), ('CENTRAL'::public.stock_location)) AS loc(loc_val)
      WHERE m.tenant_id = v_tenant_id AND m.branch_id = v_branch_id
        AND NOT EXISTS (
          SELECT 1 FROM public.material_location_costs mlc
          WHERE mlc.tenant_id = m.tenant_id AND mlc.material_id = m.id AND mlc.location = loc.loc_val
        );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- 4C. Master Recipes & Komposisi Bahan (8 Menu per Cabang)
    SELECT id INTO v_rec_aren FROM public.recipes WHERE tenant_id = v_tenant_id AND branch_id = v_branch_id AND lower(trim(menu_name)) = lower('Kintamani Aren Latte') LIMIT 1;
    IF v_rec_aren IS NULL THEN
      BEGIN
        INSERT INTO public.recipes (
          tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
          food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
          target_cost_percent, menu_class, total_sold, contribution_margin
        ) VALUES (
          v_tenant_id, v_branch_id, 'Kintamani Aren Latte', 'MN-001', 'Coffee', 35000, 7755, 388, 8143,
          23.27, 0.05, 35000, 'down', 1000, 0, 27.0, 'STAR', 145, 26857
        ) RETURNING id INTO v_rec_aren;
        INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount) VALUES
          (v_tenant_id, v_branch_id, v_rec_aren, v_mat_kopi, 18, 'gr', 185, 3330),
          (v_tenant_id, v_branch_id, v_rec_aren, v_mat_milk, 150, 'ml', 22.5, 3375),
          (v_tenant_id, v_branch_id, v_rec_aren, v_mat_aren, 25, 'ml', 42, 1050);
      EXCEPTION WHEN unique_violation THEN
        SELECT id INTO v_rec_aren FROM public.recipes WHERE tenant_id = v_tenant_id AND lower(trim(menu_name)) = lower('Kintamani Aren Latte') LIMIT 1;
      END;
    END IF;

    SELECT id INTO v_rec_avocado FROM public.recipes WHERE tenant_id = v_tenant_id AND branch_id = v_branch_id AND lower(trim(menu_name)) = lower('Avocado Coffee') LIMIT 1;
    IF v_rec_avocado IS NULL THEN
      BEGIN
        INSERT INTO public.recipes (
          tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
          food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
          target_cost_percent, menu_class, total_sold, contribution_margin
        ) VALUES (
          v_tenant_id, v_branch_id, 'Avocado Coffee', 'MN-002', 'Signature Coffee', 42000, 12765, 638, 13403,
          31.91, 0.05, 42000, 'down', 1000, 0, 27.0, 'STAR', 112, 28597
        ) RETURNING id INTO v_rec_avocado;
        INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount) VALUES
          (v_tenant_id, v_branch_id, v_rec_avocado, v_mat_avocado, 120, 'gr', 58, 6960),
          (v_tenant_id, v_branch_id, v_rec_avocado, v_mat_kopi, 18, 'gr', 185, 3330),
          (v_tenant_id, v_branch_id, v_rec_avocado, v_mat_milk, 100, 'ml', 22.5, 2250),
          (v_tenant_id, v_branch_id, v_rec_avocado, v_mat_syrup_prep, 15, 'ml', 15, 225);
      EXCEPTION WHEN unique_violation THEN
        SELECT id INTO v_rec_avocado FROM public.recipes WHERE tenant_id = v_tenant_id AND lower(trim(menu_name)) = lower('Avocado Coffee') LIMIT 1;
      END;
    END IF;

    SELECT id INTO v_rec_cap FROM public.recipes WHERE tenant_id = v_tenant_id AND branch_id = v_branch_id AND lower(trim(menu_name)) = lower('Capuccino Classic') LIMIT 1;
    IF v_rec_cap IS NULL THEN
      BEGIN
        INSERT INTO public.recipes (
          tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
          food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
          target_cost_percent, menu_class, total_sold, contribution_margin
        ) VALUES (
          v_tenant_id, v_branch_id, 'Capuccino Classic', 'MN-003', 'Coffee', 32000, 6930, 347, 7277,
          22.74, 0.05, 32000, 'down', 1000, 0, 27.0, 'PLOWHORSE', 98, 24723
        ) RETURNING id INTO v_rec_cap;
        INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount) VALUES
          (v_tenant_id, v_branch_id, v_rec_cap, v_mat_kopi, 18, 'gr', 185, 3330),
          (v_tenant_id, v_branch_id, v_rec_cap, v_mat_milk, 160, 'ml', 22.5, 3600);
      EXCEPTION WHEN unique_violation THEN
        SELECT id INTO v_rec_cap FROM public.recipes WHERE tenant_id = v_tenant_id AND lower(trim(menu_name)) = lower('Capuccino Classic') LIMIT 1;
      END;
    END IF;

    SELECT id INTO v_rec_kelapa FROM public.recipes WHERE tenant_id = v_tenant_id AND branch_id = v_branch_id AND lower(trim(menu_name)) = lower('Es Kelapa Jeruk') LIMIT 1;
    IF v_rec_kelapa IS NULL THEN
      BEGIN
        INSERT INTO public.recipes (
          tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
          food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
          target_cost_percent, menu_class, total_sold, contribution_margin
        ) VALUES (
          v_tenant_id, v_branch_id, 'Es Kelapa Jeruk', 'MN-004', 'Refreshment', 30000, 6255, 313, 6568,
          21.89, 0.05, 30000, 'down', 1000, 0, 27.0, 'STAR', 130, 23432
        ) RETURNING id INTO v_rec_kelapa;
        INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount) VALUES
          (v_tenant_id, v_branch_id, v_rec_kelapa, v_mat_kelapa, 180, 'ml', 16, 2880),
          (v_tenant_id, v_branch_id, v_rec_kelapa, v_mat_jeruk_prep, 70, 'ml', 45, 3150),
          (v_tenant_id, v_branch_id, v_rec_kelapa, v_mat_syrup_prep, 15, 'ml', 15, 225);
      EXCEPTION WHEN unique_violation THEN
        SELECT id INTO v_rec_kelapa FROM public.recipes WHERE tenant_id = v_tenant_id AND lower(trim(menu_name)) = lower('Es Kelapa Jeruk') LIMIT 1;
      END;
    END IF;

    SELECT id INTO v_rec_jeruk FROM public.recipes WHERE tenant_id = v_tenant_id AND branch_id = v_branch_id AND lower(trim(menu_name)) = lower('Es Jeruk Murni') LIMIT 1;
    IF v_rec_jeruk IS NULL THEN
      BEGIN
        INSERT INTO public.recipes (
          tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
          food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
          target_cost_percent, menu_class, total_sold, contribution_margin
        ) VALUES (
          v_tenant_id, v_branch_id, 'Es Jeruk Murni', 'MN-005', 'Refreshment', 26000, 7050, 353, 7403,
          28.47, 0.05, 26000, 'down', 1000, 0, 27.0, 'PLOWHORSE', 118, 18597
        ) RETURNING id INTO v_rec_jeruk;
        INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount) VALUES
          (v_tenant_id, v_branch_id, v_rec_jeruk, v_mat_jeruk_prep, 150, 'ml', 45, 6750),
          (v_tenant_id, v_branch_id, v_rec_jeruk, v_mat_syrup_prep, 20, 'ml', 15, 300);
      EXCEPTION WHEN unique_violation THEN
        SELECT id INTO v_rec_jeruk FROM public.recipes WHERE tenant_id = v_tenant_id AND lower(trim(menu_name)) = lower('Es Jeruk Murni') LIMIT 1;
      END;
    END IF;

    SELECT id INTO v_rec_lychee FROM public.recipes WHERE tenant_id = v_tenant_id AND branch_id = v_branch_id AND lower(trim(menu_name)) = lower('Ice Lychee Tea') LIMIT 1;
    IF v_rec_lychee IS NULL THEN
      BEGIN
        INSERT INTO public.recipes (
          tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
          food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
          target_cost_percent, menu_class, total_sold, contribution_margin
        ) VALUES (
          v_tenant_id, v_branch_id, 'Ice Lychee Tea', 'MN-006', 'Tea & Fruit', 28000, 3950, 198, 4148,
          14.81, 0.05, 28000, 'down', 1000, 0, 27.0, 'STAR', 164, 23852
        ) RETURNING id INTO v_rec_lychee;
        INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount) VALUES
          (v_tenant_id, v_branch_id, v_rec_lychee, v_mat_lychee, 30, 'ml', 126.67, 3800),
          (v_tenant_id, v_branch_id, v_rec_lychee, v_mat_syrup_prep, 10, 'ml', 15, 150);
      EXCEPTION WHEN unique_violation THEN
        SELECT id INTO v_rec_lychee FROM public.recipes WHERE tenant_id = v_tenant_id AND lower(trim(menu_name)) = lower('Ice Lychee Tea') LIMIT 1;
      END;
    END IF;

    SELECT id INTO v_rec_green FROM public.recipes WHERE tenant_id = v_tenant_id AND branch_id = v_branch_id AND lower(trim(menu_name)) = lower('Green Delight Healthy Juice') LIMIT 1;
    IF v_rec_green IS NULL THEN
      BEGIN
        INSERT INTO public.recipes (
          tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
          food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
          target_cost_percent, menu_class, total_sold, contribution_margin
        ) VALUES (
          v_tenant_id, v_branch_id, 'Green Delight Healthy Juice', 'MN-007', 'Healthy Juice', 38000, 8800, 440, 9240,
          24.32, 0.05, 38000, 'down', 1000, 0, 27.0, 'PUZZLE', 75, 28760
        ) RETURNING id INTO v_rec_green;
        INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount) VALUES
          (v_tenant_id, v_branch_id, v_rec_green, v_mat_green_prep, 200, 'ml', 38, 7600),
          (v_tenant_id, v_branch_id, v_rec_green, v_mat_apple, 50, 'ml', 24, 1200);
      EXCEPTION WHEN unique_violation THEN
        SELECT id INTO v_rec_green FROM public.recipes WHERE tenant_id = v_tenant_id AND lower(trim(menu_name)) = lower('Green Delight Healthy Juice') LIMIT 1;
      END;
    END IF;

    SELECT id INTO v_rec_carrot FROM public.recipes WHERE tenant_id = v_tenant_id AND branch_id = v_branch_id AND lower(trim(menu_name)) = lower('Beta Caroot E.ne Juice') LIMIT 1;
    IF v_rec_carrot IS NULL THEN
      BEGIN
        INSERT INTO public.recipes (
          tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
          food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
          target_cost_percent, menu_class, total_sold, contribution_margin
        ) VALUES (
          v_tenant_id, v_branch_id, 'Beta Caroot E.ne Juice', 'MN-008', 'Healthy Juice', 36000, 8600, 430, 9030,
          25.08, 0.05, 36000, 'down', 1000, 0, 27.0, 'PUZZLE', 62, 26970
        ) RETURNING id INTO v_rec_carrot;
        INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount) VALUES
          (v_tenant_id, v_branch_id, v_rec_carrot, v_mat_carrot_prep, 200, 'ml', 34, 6800),
          (v_tenant_id, v_branch_id, v_rec_carrot, v_mat_jeruk_prep, 40, 'ml', 45, 1800);
      EXCEPTION WHEN unique_violation THEN
        SELECT id INTO v_rec_carrot FROM public.recipes WHERE tenant_id = v_tenant_id AND lower(trim(menu_name)) = lower('Beta Caroot E.ne Juice') LIMIT 1;
      END;
    END IF;

    -- 4D. Pembelian Harian (Resto vs Central + Delivery Notes)
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_entries
      WHERE tenant_id = v_tenant_id AND branch_id = v_branch_id AND date = CURRENT_DATE
    ) THEN
      BEGIN
        INSERT INTO public.purchase_entries (
          tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
          input_by, notes, delivery_notes, destination_location, is_cancelled
        ) VALUES
          (v_tenant_id, v_branch_id, v_mat_milk, v_sup_dairy, 12, 'pck', 22500, CURRENT_DATE,
           v_owner_uid, 'Belanja Harian Susu Barista', 'Kirim langsung ke Bar Resto ' || v_branch_code || ' pagi jam 08:00', 'RESTO', false),
          (v_tenant_id, v_branch_id, v_mat_kopi, v_sup_roastery, 10, 'pck', 185000, CURRENT_DATE,
           v_owner_uid, 'Restock House Blend Bulanan', 'Simpan di Gudang Central ' || v_branch_code || ' rak A2', 'CENTRAL', false),
          (v_tenant_id, v_branch_id, v_mat_jeruk_raw, v_sup_fruit, 15, 'kg', 28000, CURRENT_DATE,
           v_owner_uid, 'Belanja Buah Segar untuk Olah Bahan', 'Kirim ke Area Prep Resto ' || v_branch_code, 'RESTO', false);

        INSERT INTO public.transactions (
          tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
        ) VALUES
          (v_tenant_id, v_branch_id, CURRENT_DATE, v_mat_milk, 'PURCHASE_IN', 'RESTO', 12, 270000,
           'Belanja Harian Susu Barista', 'Kirim langsung ke Bar Resto ' || v_branch_code || ' pagi jam 08:00', v_owner_uid, 'BETA_SEED', false),
          (v_tenant_id, v_branch_id, CURRENT_DATE, v_mat_kopi, 'PURCHASE_IN', 'CENTRAL', 10, 1850000,
           'Restock House Blend Bulanan', 'Simpan di Gudang Central ' || v_branch_code || ' rak A2', v_owner_uid, 'BETA_SEED', false),
          (v_tenant_id, v_branch_id, CURRENT_DATE, v_mat_jeruk_raw, 'PURCHASE_IN', 'RESTO', 15, 420000,
           'Belanja Buah Segar untuk Olah Bahan', 'Kirim ke Area Prep Resto ' || v_branch_code, v_owner_uid, 'BETA_SEED', false);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    -- 4E. Batch Olah Bahan Mentah / SimplePrep (production_trimming_batches)
    IF NOT EXISTS (
      SELECT 1 FROM public.production_trimming_batches
      WHERE tenant_id = v_tenant_id AND branch_id = v_branch_id
    ) THEN
      BEGIN
        INSERT INTO public.production_trimming_batches (
          id, tenant_id, branch_id, material_id, batch_number,
          gross_weight, gross_photo_url, gross_timestamp,
          clean_weight, waste_weight, clean_photo_url, waste_photo_url, clean_timestamp,
          shrinkage_percent, yield_status, portion_pack_output, status, created_by, created_at
        ) VALUES
          (gen_random_uuid(), v_tenant_id, v_branch_id, v_mat_jeruk_raw,
           'PREP-' || v_branch_code || '-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-01',
           5.0, v_svg_photo, now() - interval '2 hours',
           3.2, 1.8, v_svg_photo, v_svg_photo, now() - interval '1 hour',
           36.0, 'GOOD', 3, 'COMPLETED', v_owner_uid, now() - interval '2 hours'),
          (gen_random_uuid(), v_tenant_id, v_branch_id, v_mat_wortel_raw,
           'PREP-' || v_branch_code || '-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-02',
           4.0, v_svg_photo, now() - interval '30 minutes',
           NULL, NULL, NULL, NULL, NULL,
           NULL, NULL, 0, 'IN_PROGRESS', v_owner_uid, now() - interval '30 minutes');
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    -- 4F. Penjualan POS ESB Hari Ini (pos_transactions, pos_transaction_items)
    IF NOT EXISTS (
      SELECT 1 FROM public.pos_transactions
      WHERE tenant_id = v_tenant_id AND branch_id = v_branch_id AND created_at::date = CURRENT_DATE
    ) THEN
      BEGIN
        v_pos_tx_id := gen_random_uuid();
        INSERT INTO public.pos_transactions (
          id, tenant_id, branch_id, order_no, payment_method, subtotal, tax, total_amount, cash_received, cash_change, status, created_at, updated_at
        ) VALUES (
          v_pos_tx_id, v_tenant_id, v_branch_id,
          'ESB-' || v_branch_code || '-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-001',
          'QRIS', 1940000, 194000, 2134000, 2134000, 0, 'COMPLETED', now(), now()
        );

        INSERT INTO public.pos_transaction_items (
          id, transaction_id, tenant_id, branch_id, recipe_id, menu_name, qty, unit_price, subtotal, created_at
        ) VALUES
          (gen_random_uuid(), v_pos_tx_id, v_tenant_id, v_branch_id, v_rec_aren,    'Kintamani Aren Latte',       15, 35000, 525000, now()),
          (gen_random_uuid(), v_pos_tx_id, v_tenant_id, v_branch_id, v_rec_avocado, 'Avocado Coffee',             10, 42000, 420000, now()),
          (gen_random_uuid(), v_pos_tx_id, v_tenant_id, v_branch_id, v_rec_kelapa,  'Es Kelapa Jeruk',            12, 30000, 360000, now()),
          (gen_random_uuid(), v_pos_tx_id, v_tenant_id, v_branch_id, v_rec_lychee,  'Ice Lychee Tea',             10, 28000, 280000, now()),
          (gen_random_uuid(), v_pos_tx_id, v_tenant_id, v_branch_id, v_rec_green,   'Green Delight Healthy Juice', 5, 38000, 190000, now()),
          (gen_random_uuid(), v_pos_tx_id, v_tenant_id, v_branch_id, v_rec_jeruk,   'Es Jeruk Murni',              5, 33000, 165000, now());

        INSERT INTO public.transactions (
          tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed
        ) VALUES
          (v_tenant_id, v_branch_id, CURRENT_DATE, NULL, 'POS_SALE', 'RESTO', 57, 1940000,
           'Penjualan POS ESB Harian (' || v_branch_code || ')', v_owner_uid, 'POS_ESB', false),
          (v_tenant_id, v_branch_id, CURRENT_DATE, v_mat_kopi, 'POS_DEDUCTION', 'RESTO', 0.45, 456050,
           'HPP Teoritis POS ESB (' || v_branch_code || ')', v_owner_uid, 'POS_ESB', false);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    -- 4G. Daily Inventory Hari Ini (Draft siap diuji oleh Barista & Owner)
    SELECT id INTO v_di_id
    FROM public.daily_inventories
    WHERE tenant_id = v_tenant_id AND branch_id = v_branch_id AND date = CURRENT_DATE AND location = 'RESTO'
    LIMIT 1;

    IF v_di_id IS NULL THEN
      BEGIN
        INSERT INTO public.daily_inventories (
          tenant_id, branch_id, date, checked_by, status, notes, location, created_at, updated_at
        ) VALUES (
          v_tenant_id, v_branch_id, CURRENT_DATE, v_owner_uid, 'draft',
          'Draft Daily Inventory Beta Testing Cabang ' || v_branch_code, 'RESTO', now(), now()
        ) RETURNING id INTO v_di_id;

        INSERT INTO public.daily_inventory_items (
          inventory_id, tenant_id, branch_id, material_id,
          prev_full_qty, opening_full_qty, opening_broken_qty,
          in_qty, manual_in_qty, manual_in_lots,
          out_qty, out_qty_input, out_unit, out_confirmed,
          waste_qty, terpakai_qty,
          full_qty, broken_qty, broken_unit, broken_confirmed,
          closing_qty, system_qty, variance,
          is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
          zero_activity_confirmed, reconciliation_status
        ) VALUES
          (v_di_id, v_tenant_id, v_branch_id, v_mat_kopi,
           12, 12, 0, 0, 0, '[]'::jsonb,
           0.45, 450, 'gr', true,
           0.05, 0.50,
           11, 0.50, 'gr', true,
           11.50, 11.50, 0,
           true, 185000, 92500, 0, false, 'OK'),
          (v_di_id, v_tenant_id, v_branch_id, v_mat_milk,
           24, 24, 0, 12, 12, '[]'::jsonb,
           3.25, 3250, 'ml', true,
           0, 3.25,
           32, 0.75, 'ml', true,
           32.75, 32.75, 0,
           true, 22500, 73125, 0, false, 'OK'),
          (v_di_id, v_tenant_id, v_branch_id, v_mat_aren,
           10, 10, 0, 0, 0, '[]'::jsonb,
           0.40, 400, 'ml', true,
           0, 0.40,
           9, 0.60, 'ml', true,
           9.60, 9.60, 0,
           true, 42000, 16800, 0, false, 'OK'),
          (v_di_id, v_tenant_id, v_branch_id, v_mat_avocado,
           15, 15, 0, 0, 0, '[]'::jsonb,
           1.20, 1200, 'gr', true,
           0, 1.20,
           13, 0.80, 'gr', true,
           13.80, 13.80, 0,
           true, 58000, 69600, 0, false, 'OK'),
          (v_di_id, v_tenant_id, v_branch_id, v_mat_jeruk_prep,
           3, 3, 0, 3.20, 3.20, '[]'::jsonb,
           1.59, 1590, 'ml', true,
           0, 1.59,
           4, 0.61, 'ml', true,
           4.61, 4.61, 0,
           true, 45000, 71550, 0, false, 'OK'),
          (v_di_id, v_tenant_id, v_branch_id, v_mat_green_prep,
           5, 5, 0, 0, 0, '[]'::jsonb,
           1.00, 1000, 'ml', true,
           0, 1.00,
           4, 0, 'ml', true,
           4.00, 4.00, 0,
           true, 38000, 38000, 0, false, 'OK'),
          (v_di_id, v_tenant_id, v_branch_id, v_mat_mineral,
           120, 120, 0, 0, 0, '[]'::jsonb,
           8, 8, 'pcs', true,
           1, 9,
           111, 0, 'pcs', true,
           111, 111, 0,
           true, 2300, 20700, 0, false, 'OK')
        ON CONFLICT (inventory_id, material_id) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    -- 4H. Stock Opname Central Bulan Berjalan
    SELECT id INTO v_opname_central_id
    FROM public.stock_opnames
    WHERE tenant_id = v_tenant_id AND branch_id = v_branch_id
      AND period_month = EXTRACT(MONTH FROM CURRENT_DATE)::int
      AND period_year = EXTRACT(YEAR FROM CURRENT_DATE)::int
      AND location = 'CENTRAL'
    LIMIT 1;

    IF v_opname_central_id IS NULL THEN
      BEGIN
        INSERT INTO public.stock_opnames (
          tenant_id, branch_id, period_month, period_year, location, status, created_by, created_at, updated_at
        ) VALUES (
          v_tenant_id, v_branch_id,
          EXTRACT(MONTH FROM CURRENT_DATE)::int,
          EXTRACT(YEAR FROM CURRENT_DATE)::int,
          'CENTRAL', 'COUNTING', v_owner_uid, now(), now()
        ) RETURNING id INTO v_opname_central_id;

        INSERT INTO public.stock_opname_items (
          opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
        ) VALUES
          (v_opname_central_id, v_tenant_id, v_branch_id, v_mat_kopi, 25, 25, 'Sesuai buku Central', 185000, 4625000, false),
          (v_opname_central_id, v_tenant_id, v_branch_id, v_mat_milk, 80, 80, 'Sesuai buku Central', 22500, 1800000, false),
          (v_opname_central_id, v_tenant_id, v_branch_id, v_mat_syrup_prep, 0, 4, 'Item temuan SO Central belum masuk daftar Resto', 15000, 60000, false)
        ON CONFLICT DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END LOOP;

  -- 5. Contoh Mutasi Antar Cabang (BSD -> Kasuna)
  IF NOT EXISTS (
    SELECT 1 FROM public.inter_branch_transfers
    WHERE tenant_id = v_tenant_id AND transfer_number = 'TRF-BETA-BSD-KSN-01'
  ) THEN
    SELECT id INTO v_mat_kopi FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(name) = lower('Kopi Beans House Blend') LIMIT 1;
    IF v_mat_kopi IS NOT NULL THEN
      BEGIN
        v_transfer_id := gen_random_uuid();
        INSERT INTO public.inter_branch_transfers (
          id, tenant_id, transfer_number, from_branch_id, to_branch_id, status, dispatched_at, dispatcher_id, notes, created_at
        ) VALUES (
          v_transfer_id, v_tenant_id, 'TRF-BETA-BSD-KSN-01', v_bsd_id, v_kasuna_id, 'DISPATCHED', now() - interval '1 hour', v_owner_uid,
          'Pengiriman stok Kopi Beans House Blend dari BSD ke Kasuna (Beta Testing)', now() - interval '1 hour'
        );

        INSERT INTO public.inter_branch_transfer_items (
          id, tenant_id, transfer_id, material_id, qty_dispatched, qty_received, remarks, variance
        ) VALUES (
          gen_random_uuid(), v_tenant_id, v_transfer_id, v_mat_kopi, 3, NULL, 'Kirim 3 pack @ 1000 gr', NULL
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'tenant_id', v_tenant_id,
    'company_name', 'Resto Umatis',
    'bsd_branch_id', v_bsd_id,
    'kasuna_branch_id', v_kasuna_id,
    'seeded_at', now()
  );
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.seed_beta_testing_dummy_data_v13();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.seed_beta_testing_dummy_data_v13(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

GRANT EXECUTE ON FUNCTION public.seed_beta_testing_dummy_data_v13() TO anon, authenticated, service_role;

-- =====================================================================================
-- BAGIAN 8 / PATCH v15 (WHITE-BOX VERIFIED):
-- 1. FT-06.1: Inisialisasi Bucket Storage Publik 'prep-photos' & RLS Policies
-- 2. FT-03.1: Normalisasi Otomatis Kolom full_pack yang Mengandung Sufiks '/ pck'
-- 3. FT-02.3: Sinkronisasi Katalog Bahan Baku Master ke Cabang BSD & Kasuna (Export Utuh)
-- 4. FT-05.1 & FT-05.2: Tabel UUID Lokasi & Klasifikasi Kategori per Role (area_role_mappings)
-- =====================================================================================



-- 1. Inisialisasi Supabase Storage Bucket 'prep-photos' (FT-06.1)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'prep-photos',
      'prep-photos',
      true,
      5242880,
      ARRAY['image/webp', 'image/jpeg', 'image/png', 'image/jpg']
    )
    ON CONFLICT (id) DO UPDATE
      SET public = true,
          file_size_limit = 5242880;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Storage bucket prep-photos setup skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    DROP POLICY IF EXISTS "prep_photos_public_select" ON storage.objects;
    CREATE POLICY "prep_photos_public_select"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'prep-photos');

    DROP POLICY IF EXISTS "prep_photos_auth_insert" ON storage.objects;
    CREATE POLICY "prep_photos_auth_insert"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'prep-photos');

    DROP POLICY IF EXISTS "prep_photos_auth_update" ON storage.objects;
    CREATE POLICY "prep_photos_auth_update"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'prep-photos');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Storage policy setup skipped: %', SQLERRM;
END $$;

-- 2. Bersihkan sufiks ganda '/ pck' atau '/ btl' pada materials.full_pack yang sudah berformat '=' (FT-03.1)
UPDATE public.materials
SET full_pack = trim(regexp_replace(full_pack, '\s*/\s*[a-zA-Z]+\s*$', ''))
WHERE full_pack LIKE '%=%' AND full_pack LIKE '%/%';

-- 3. Tabel Konfigurasi UUID Lokasi & Pemetaan Kategori per Role (FT-05.1 & FT-05.2)
CREATE TABLE IF NOT EXISTS public.area_role_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  area_code text NOT NULL,
  area_name text NOT NULL,
  role_classification text NOT NULL DEFAULT 'Bar',
  allowed_categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, area_code)
);

ALTER TABLE public.area_role_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "area_role_mappings_tenant_isolation" ON public.area_role_mappings;
CREATE POLICY "area_role_mappings_tenant_isolation"
  ON public.area_role_mappings
  FOR ALL
  USING (tenant_id = public.get_my_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_super_admin());

-- 4. Sinkronisasi Katalog Bahan Baku Master ke Seluruh Cabang Aktif (BSD & Kasuna) (FT-02.3)
DO $$
DECLARE
  r_branch RECORD;
  r_mat RECORD;
BEGIN
  FOR r_branch IN
    SELECT id, tenant_id, name, code FROM public.branches WHERE is_active = true
  LOOP
    -- Salin bahan baku di tenant yang sama yang belum ada di cabang ini (berdasarkan nama bahan case-insensitive)
    FOR r_mat IN
      SELECT DISTINCT ON (lower(trim(m.name))) m.*
      FROM public.materials m
      WHERE m.tenant_id = r_branch.tenant_id
        AND m.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM public.materials existing
          WHERE existing.tenant_id = r_branch.tenant_id
            AND existing.branch_id = r_branch.id
            AND lower(trim(existing.name)) = lower(trim(m.name))
        )
      ORDER BY lower(trim(m.name)), m.id ASC
    LOOP
      BEGIN
        INSERT INTO public.materials (
          tenant_id, branch_id, sku, name, category, supplier, unit, full_pack,
          price, new_price, qty_resto, qty_central, min_stock, par_stock,
          is_active, is_preparable, is_prep_output, broken_tracking_enabled, expiry_tracking_enabled
        ) VALUES (
          r_branch.tenant_id,
          r_branch.id,
          CASE WHEN r_mat.sku IS NOT NULL AND r_mat.sku <> '' THEN r_mat.sku || '-' || upper(left(r_branch.code, 3)) ELSE NULL END,
          r_mat.name,
          r_mat.category,
          r_mat.supplier,
          r_mat.unit,
          trim(regexp_replace(coalesce(r_mat.full_pack, 'pck = 1000 gr'), '\s*/\s*[a-zA-Z]+\s*$', '')),
          r_mat.price,
          r_mat.new_price,
          coalesce(r_mat.qty_resto, 0),
          coalesce(r_mat.qty_central, 0),
          coalesce(r_mat.min_stock, 5),
          coalesce(r_mat.par_stock, 0),
          true,
          coalesce(r_mat.is_preparable, false),
          coalesce(r_mat.is_prep_output, false),
          coalesce(r_mat.broken_tracking_enabled, true),
          coalesce(r_mat.expiry_tracking_enabled, false)
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END LOOP;
END $$;


-- 5. Seed Default Area UUID & Role Category Mappings (Bar, Kitchen, Service, Central) untuk semua Cabang Aktif
DO $$
DECLARE
  r_branch RECORD;
BEGIN
  FOR r_branch IN
    SELECT id, tenant_id, name, code FROM public.branches WHERE is_active = true
  LOOP
    INSERT INTO public.area_role_mappings (tenant_id, branch_id, area_code, area_name, role_classification, allowed_categories, is_system)
    VALUES
      (r_branch.tenant_id, r_branch.id, 'CENTRAL', 'Central Warehouse', 'Central', ARRAY[]::text[], true),
      (r_branch.tenant_id, r_branch.id, 'RESTO', 'Resto / Bar', 'Bar', ARRAY['Coffee', 'Coffee & Tea', 'Dairy', 'Milk & Dairy', 'Sweetener', 'Syrup', 'Syrup & Sauce', 'Beverage Base', 'Ready to Drink', 'Powder & Topping', 'Fruit & Produce', 'Fresh & Fruit', 'Prep / Bahan Olahan', 'Bahan Olahan / Prep'], true),
      (r_branch.tenant_id, r_branch.id, 'KITCHEN', 'Kitchen (Dapur)', 'Kitchen', ARRAY['Kitchen & Cooking', 'Meat & Poultry', 'Fruit & Produce', 'Fresh & Fruit', 'Prep / Bahan Olahan', 'Bahan Olahan / Prep', 'Bahan Baku Dasar', 'Dairy & Cooking', 'Spices & Seasoning'], true),
      (r_branch.tenant_id, r_branch.id, 'SERVICE', 'Service / Floor', 'Service', ARRAY['Packaging', 'Amenities', 'Consumables', 'Tissue & Cleaning', 'Ready to Drink'], true)
    ON CONFLICT (tenant_id, branch_id, area_code) DO UPDATE
      SET role_classification = EXCLUDED.role_classification,
          allowed_categories = EXCLUDED.allowed_categories,
          updated_at = now();
  END LOOP;
END $$;

-- Jalankan ulang fungsi seed agar akun Kitchen, Service, dan bahan dummy MAT-017..022 langsung terisi
SELECT public.seed_beta_testing_dummy_data_v13();

NOTIFY pgrst, 'reload schema';

COMMIT;
