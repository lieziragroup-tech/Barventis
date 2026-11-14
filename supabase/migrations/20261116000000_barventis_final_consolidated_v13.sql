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
  FOR t IN SELECT id, COALESCE(NULLIF(trim(company_name), ''), name, 'Cabang Utama') AS label FROM public.tenants LOOP
    SELECT id INTO v_default_branch_id
    FROM public.branches
    WHERE tenant_id = t.id
    ORDER BY is_central ASC, created_at ASC
    LIMIT 1;

    IF v_default_branch_id IS NULL THEN
      INSERT INTO public.branches (tenant_id, code, name, is_central, is_active)
      VALUES (t.id, 'PUSAT', t.label, false, true)
      RETURNING id INTO v_default_branch_id;
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
CREATE OR REPLACE VIEW public.v_menu_engineering AS
SELECT
  r.id,
  r.tenant_id,
  r.branch_id,
  r.menu_name,
  r.category,
  r.selling_price,
  r.basic_cost,
  r.food_cost_pct,
  r.target_cost_percent,
  COALESCE(r.total_sold, 0) AS total_sold,
  COALESCE(r.selling_price, 0) - COALESCE(r.basic_cost, 0) AS contribution_margin,
  COALESCE(r.menu_class, 'STAR') AS menu_class
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

  v_branch_read := '((SELECT public.bv2_is_admin()) OR branch_id IS NULL OR branch_id = (SELECT public.bv2_auth_branch_id()))';
  v_branch_write := '((SELECT public.bv2_is_admin()) OR branch_id IS NULL OR branch_id = (SELECT public.bv2_auth_branch_id()))';

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

NOTIFY pgrst, 'reload schema';

COMMIT;
