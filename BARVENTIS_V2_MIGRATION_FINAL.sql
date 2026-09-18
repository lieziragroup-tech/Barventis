-- =========================================================================
-- BARVENTIS V2 - CONSOLIDATED MIGRATION SCRIPT (FINAL, FIXED)
-- =========================================================================
-- Perbaikan dari versi sebelumnya:
--   Bagian 5 (Finance Atomicity) sebelumnya gagal dengan error:
--     ERROR: 0A000: cannot alter type of a column used by a view or rule
--     DETAIL: rule _RETURN on view v_item_usage depends on column "price"
--   Sebabnya: ada VIEW (v_item_usage, dan mungkin view lain) yang dibuat
--   langsung di database (bukan lewat migration file), sehingga tidak
--   terlihat di kode. Postgres tidak bisa mengubah tipe kolom yang masih
--   dipakai oleh view, karena setiap view "dibekukan" lewat rule _RETURN.
--
--   Fix di bawah ini TIDAK menebak isi view. Sebagai gantinya, script akan:
--     1. Mencari SEMUA view yang bergantung pada kolom-kolom yang akan
--        diubah (di tabel pos_transactions, recipes, materials,
--        recipe_ingredients), lalu menyimpan definisi ASLI-nya (pg_get_viewdef)
--        ke tabel sementara.
--     2. Men-drop view-view tersebut (non-CASCADE -> kalau ada view LAIN
--        yang menumpuk di atasnya dan belum tercakup, proses akan berhenti
--        dengan error yang jelas, bukan diam-diam merusak sesuatu).
--     3. Menjalankan ALTER COLUMN seperti semula.
--     4. Membuat ulang setiap view dari definisi asli yang tersimpan.
--
--   Seluruh proses dibungkus satu transaksi: kalau ada langkah yang gagal,
--   semuanya di-rollback, database tidak tertinggal dalam kondisi setengah
--   jadi (tabel sudah BIGINT tapi view hilang, dsb).
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. FIX: ISS-01 Atomic Stock Update (Trimming & Inventory)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION add_stock_atomic(p_item_id bigint, p_quantity_change numeric)
RETURNS VOID AS $$
BEGIN
    UPDATE materials
    SET
        qty_resto = qty_resto + p_quantity_change,
        updated_at = NOW()
    WHERE id = p_item_id;
END;
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------------------------
-- 2. ENUM & STATUS UPDATES (Enterprise PO Lifecycle)
-- -------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'po_status') THEN
        CREATE TYPE po_status AS ENUM (
            'DRAFT',
            'INVOICING',
            'APPROVED',
            'GOODS_RECEIPT',
            'COMMITTED_TO_INVENTORY'
        );
    END IF;
END $$;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS receipt_photo_url TEXT,
ADD COLUMN IF NOT EXISTS receipt_signature_url TEXT,
ADD COLUMN IF NOT EXISTS receipt_gps TEXT;

-- -------------------------------------------------------------------------
-- 3. ROLE BASED ACCESS CONTROL (6 Roles V2)
-- -------------------------------------------------------------------------
-- Menambahkan role baru ke ENUM 'user_role' (jika tipe ini sudah ada di DB)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Owner';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Bar';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Kitchen';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Central';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Service';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Purchasing';

-- Membuat Tabel Matrix Hak Akses
CREATE TABLE IF NOT EXISTS permission_matrix (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name VARCHAR(50) NOT NULL UNIQUE,
    can_create_po BOOLEAN DEFAULT false,
    can_approve_po BOOLEAN DEFAULT false,
    can_receive_goods BOOLEAN DEFAULT false,
    can_manage_users BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert nilai default untuk ke-6 role
INSERT INTO permission_matrix (role_name)
VALUES
    ('Bar'),
    ('Kitchen'),
    ('Central'),
    ('Service'),
    ('Purchasing'),
    ('Owner')
ON CONFLICT (role_name) DO NOTHING;

-- -------------------------------------------------------------------------
-- 4. MARKETLIST SCHEMA (Untuk Modul Marketlist Baru)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  tenant_id uuid,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.market_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_list_id uuid REFERENCES public.market_lists(id) ON DELETE CASCADE,
  material_id bigint,
  quantity numeric NOT NULL,
  unit text
);

-- Enable RLS & Add standard policy
ALTER TABLE public.market_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_list_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'market_lists'
          AND policyname = 'Allow authenticated access'
    ) THEN
        CREATE POLICY "Allow authenticated access" ON public.market_lists
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'market_list_items'
          AND policyname = 'Allow authenticated access'
    ) THEN
        CREATE POLICY "Allow authenticated access" ON public.market_list_items
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
END $$;

-- -------------------------------------------------------------------------
-- 5. FINANCE ATOMICITY (Float -> BIGINT) -- versi aman terhadap view
-- -------------------------------------------------------------------------

-- 5a. Tabel sementara untuk menyimpan definisi view yang akan terdampak.
--     ON COMMIT DROP -> otomatis hilang begitu transaksi ini selesai,
--     tidak menyisakan sampah di schema.
CREATE TEMP TABLE _mig_view_backup (
    view_schema text,
    view_name   text,
    view_def    text
) ON COMMIT DROP;

-- 5b. Temukan & simpan SEMUA view yang bergantung pada kolom-kolom yang
--     akan diubah tipenya (bukan cuma v_item_usage / materials.price --
--     mencakup juga kolom lain di pos_transactions, recipes,
--     recipe_ingredients kalau ternyata ada view yang belum ketahuan).
INSERT INTO _mig_view_backup (view_schema, view_name, view_def)
SELECT DISTINCT
    dependent_ns.nspname,
    dependent_view.relname,
    pg_get_viewdef(dependent_view.oid, true)
FROM pg_depend
JOIN pg_rewrite        ON pg_depend.objid = pg_rewrite.oid
JOIN pg_class dependent_view ON pg_rewrite.ev_class = dependent_view.oid
JOIN pg_class source_table   ON pg_depend.refobjid = source_table.oid
JOIN pg_attribute ON pg_depend.refobjid = pg_attribute.attrelid
                  AND pg_depend.refobjsubid = pg_attribute.attnum
JOIN pg_namespace dependent_ns ON dependent_ns.oid = dependent_view.relnamespace
WHERE dependent_view.relkind = 'v'
  AND pg_attribute.attnum > 0
  AND (
        (source_table.relname = 'pos_transactions'  AND pg_attribute.attname IN ('subtotal', 'tax', 'total_amount'))
     OR (source_table.relname = 'recipes'            AND pg_attribute.attname IN ('fix_cost', 'basic_cost', 'subtotal', 'selling_price'))
     OR (source_table.relname = 'materials'          AND pg_attribute.attname = 'price')
     OR (source_table.relname = 'recipe_ingredients' AND pg_attribute.attname = 'amount')
      );

-- 5c. Drop setiap view yang ditemukan (non-CASCADE dengan sengaja: kalau
--     ada view lain yang menumpuk di atas salah satu view ini dan belum
--     tercakup di query 5b, DROP akan gagal dengan error yang jelas,
--     bukan menghilangkan sesuatu diam-diam).
DO $$
DECLARE
    v_rec RECORD;
BEGIN
    FOR v_rec IN SELECT * FROM _mig_view_backup LOOP
        RAISE NOTICE 'Menyimpan & menghapus sementara view: %.%', v_rec.view_schema, v_rec.view_name;
        EXECUTE format('DROP VIEW IF EXISTS %I.%I', v_rec.view_schema, v_rec.view_name);
    END LOOP;
END $$;

-- 5d. Sekarang ALTER COLUMN aman dijalankan karena tidak ada view yang
--     masih bergantung padanya.
ALTER TABLE pos_transactions ALTER COLUMN subtotal TYPE BIGINT USING subtotal::bigint;
ALTER TABLE pos_transactions ALTER COLUMN tax TYPE BIGINT USING tax::bigint;
ALTER TABLE pos_transactions ALTER COLUMN total_amount TYPE BIGINT USING total_amount::bigint;

ALTER TABLE recipes ALTER COLUMN fix_cost TYPE BIGINT USING fix_cost::bigint;
ALTER TABLE recipes ALTER COLUMN basic_cost TYPE BIGINT USING basic_cost::bigint;
ALTER TABLE recipes ALTER COLUMN subtotal TYPE BIGINT USING subtotal::bigint;
ALTER TABLE recipes ALTER COLUMN selling_price TYPE BIGINT USING selling_price::bigint;

ALTER TABLE materials ALTER COLUMN price TYPE BIGINT USING price::bigint;

ALTER TABLE recipe_ingredients ALTER COLUMN amount TYPE BIGINT USING amount::bigint;

-- 5e. Buat ulang setiap view dari definisi ASLI yang sudah disimpan di 5b.
--     Tidak ada logika view yang ditebak/diubah -- persis seperti semula,
--     hanya kolom sumbernya sekarang BIGINT.
DO $$
DECLARE
    v_rec RECORD;
BEGIN
    FOR v_rec IN SELECT * FROM _mig_view_backup LOOP
        EXECUTE format('CREATE VIEW %I.%I AS %s', v_rec.view_schema, v_rec.view_name, v_rec.view_def);
        RAISE NOTICE 'View dibuat ulang: %.%', v_rec.view_schema, v_rec.view_name;
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM _mig_view_backup) THEN
        RAISE NOTICE 'Tidak ada view yang bergantung pada kolom-kolom ini -- ALTER COLUMN berjalan langsung tanpa perlu drop/recreate.';
    END IF;
END $$;

COMMIT;