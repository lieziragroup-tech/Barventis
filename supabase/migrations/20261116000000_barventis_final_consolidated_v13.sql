-- =============================================================================
-- BARVENTIS ERP v2 — FINAL CONSOLIDATED DATABASE MIGRATION & SCHEMA SYNC (v13)
-- Target Database: Supabase PostgreSQL (Sinkron 100% dengan SQL Barventis.md)
-- Disusun oleh: Ayling, Izumi, & Kei
--
-- Cakupan Eksekusi Satu Pintu (Idempotent & Aman Dijalankan Ulang):
--   1. Penambahan seluruh kolom yang belum ada di database live (SQL Barventis.md):
--      - materials: branch_id, monthly_quota_qty, is_prep_output
--      - purchase_entries: branch_id, delivery_notes, destination_location
--      - transactions: branch_id, delivery_notes
--      - inter_branch_transfers: notes
--      - tenants: pos_tax_rate, pos_service_charge
--      - 34 tabel operasional & anak: branch_id + indeks komposit (tenant_id, branch_id)
--   2. Perbaikan kolom GENERATED ALWAYS `daily_inventory_items.terpakai_qty`
--      beserta trigger otomatis `terpakai_qty = COALESCE(out_qty, 0) + COALESCE(waste_qty, 0)`.
--   3. Normalisasi otomatis Konversi 2-Satuan (`<kemasan> = <jumlah> <gr|ml|pcs>`)
--      dan fungsi PostgreSQL `convert_material_qty_to_stock_unit_v3` (mendukung
--      ml <-> gr 1:1 F&B, pcs <-> ml/gr, dan p_qty = 0 tanpa error HTTP 400).
--   4. Backfill otomatis Cabang Default ('PUSAT'), `users.branch_id` (agar staf/barista
--      tidak terkunci), dan `branch_id` pada seluruh 34 tabel.
--   5. Perbaikan seluruh fungsi RPC:
--      - `get_daily_pos_theoretical_usage_v9` (membaca dari `pos_transaction_items`
--        DAN `expected_usage` hasil upload Excel ESB, bebas bug `pos_transactions.menu_name`).
--      - `sync_central_opname_unlisted_to_resto_v9` (bebas bug `materials.stock`).
--      - `clone_branch_data` (bebas bug `materials.stock`, `suppliers.email`,
--        `recipe_ingredients.item_name`, dan menyertakan `recipe_ingredients.tenant_id`).
--      - `get_owner_multi_branch_summary`, `adjust_material_stock`,
--        `deduct_stock_atomic`, dan `atomic_record_waste_v2`.
--   6. Pembuatan View `v_menu_engineering` dan Storage Bucket `signatures`.
--   7. Kebijakan RLS Ketat Multi-Tenant & Multi-Cabang di seluruh tabel (termasuk
--      `unit_conversions`, `recipe_versions`, `usage_variance`, `generated_so_reports`).
-- =============================================================================

BEGIN;

-- =============================================================================
-- BAGIAN 0: HELPER FUNGSI KONTEKS AUTH & ROLE (KOMPATIBEL V1 & V2)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.bv2_auth_tenant_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.bv2_auth_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.role::text FROM public.users u WHERE u.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.bv2_auth_branch_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.branch_id FROM public.users u WHERE u.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.bv2_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    lower(regexp_replace(trim(public.bv2_auth_role()), '\s+', ' ', 'g')) IN (
      'owner', 'admin', 'admin / owner', 'admin owner', 'superadmin', 'super admin', 'super_admin'
    ),
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.bv2_is_superadmin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    replace(replace(lower(trim(public.bv2_auth_role())), ' ', ''), '_', '') = 'superadmin',
    false
  )
$$;

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

CREATE OR REPLACE FUNCTION public.sync_daily_inventory_terpakai_qty_v10()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.terpakai_qty := COALESCE(NEW.out_qty, 0) + COALESCE(NEW.waste_qty, 0);
  RETURN NEW;
END;
$function$;

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

GRANT EXECUTE ON FUNCTION public.get_daily_pos_theoretical_usage_v9(uuid, date) TO authenticated;

-- 5B. RPC Sinkronisasi Barang Stock Opname Central ke Resto (Tanpa Kolom `stock` Fiktif)
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

GRANT EXECUTE ON FUNCTION public.sync_central_opname_unlisted_to_resto_v9(uuid, bigint[], numeric, uuid) TO authenticated;

-- 5C. RPC Salin / Clone Data Antar Cabang (Diperbaiki 100% Sesuai Kolom SQL Barventis.md)
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

GRANT EXECUTE ON FUNCTION public.clone_branch_data(uuid, uuid, uuid, boolean, boolean, boolean, bigint[], text) TO authenticated;

-- 5D. RPC Ringkasan Performa Multi-Cabang Khusus Owner
DROP FUNCTION IF EXISTS public.get_owner_multi_branch_summary(uuid, int, int);
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

GRANT EXECUTE ON FUNCTION public.atomic_save_daily_inventory_v3(uuid, date, text, jsonb, boolean, uuid) TO authenticated;

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

GRANT EXECUTE ON FUNCTION public.atomic_save_daily_inventory_v4(uuid, date, text, jsonb, boolean, uuid) TO authenticated;

-- 7B. Helper RPC untuk membersihkan akun beta lama jika GoTrue memerlukan SignUp native
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

GRANT EXECUTE ON FUNCTION public.prepare_beta_signup_v13(text) TO anon, authenticated, service_role;

-- 7C. Helper RPC untuk mengikat profil akun Beta Testing ke Resto Umatis (Cabang BSD / Kasuna)
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
    v_role := 'Barista'::public.user_role;
    v_target_branch_id := v_bsd_branch_id;
  ELSIF v_key = 'BARISTA_KASUNA' THEN
    v_email := 'barista.kasuna@umatis.id';
    v_name := 'Barista Cabang Kasuna (Beta)';
    v_role := 'Barista'::public.user_role;
    v_target_branch_id := v_kasuna_branch_id;
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

GRANT EXECUTE ON FUNCTION public.bind_beta_user_profile_v13(uuid, text) TO anon, authenticated, service_role;

-- 7D. Helper Idempotent untuk Upsert Supplier & Material Tanpa Risiko Error 23505
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

-- 7E. Fungsi Utama Seed Akun Beta Testing & Data Dummy Lengkap (BSD & Kasuna)
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
      ('a0000000-be7a-4000-8000-000000000001'::uuid, 'owner.beta@umatis.id',      'Owner Resto Umatis (Beta)',    'Owner'::public.user_role,      v_bsd_id),
      ('a0000000-be7a-4000-8000-000000000002'::uuid, 'barista.bsd@umatis.id',     'Barista Cabang BSD (Beta)',    'Barista'::public.user_role,    v_bsd_id),
      ('a0000000-be7a-4000-8000-000000000003'::uuid, 'barista.kasuna@umatis.id',  'Barista Cabang Kasuna (Beta)', 'Barista'::public.user_role,    v_kasuna_id),
      ('a0000000-be7a-4000-8000-000000000004'::uuid, 'purchasing.bsd@umatis.id',  'Purchasing & Central (Beta)',  'Purchasing'::public.user_role, v_bsd_id),
      ('a0000000-be7a-4000-8000-000000000005'::uuid, 'kasir.bsd@umatis.id',       'Kasir POS ESB (Beta)',         'Kasir'::public.user_role,      v_bsd_id)
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

GRANT EXECUTE ON FUNCTION public.seed_beta_testing_dummy_data_v13() TO anon, authenticated, service_role;

-- Jalankan seed secara otomatis saat script SQL dieksekusi
SELECT public.seed_beta_testing_dummy_data_v13();

NOTIFY pgrst, 'reload schema';

COMMIT;
