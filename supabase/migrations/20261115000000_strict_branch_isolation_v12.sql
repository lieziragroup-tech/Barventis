-- =============================================================================
-- BARVENTIS STRICT BRANCH ISOLATION (v12)
-- 1. Pastikan kolom branch_id ada & ter-backfill di seluruh tabel cabang + anak
-- 2. Terapkan NOT NULL & DEFAULT bv2_auth_branch_id() pada Materials, Recipes, Stock
-- 3. Perbarui indeks unik harian/POS/resep agar terisolasi per (tenant_id, branch_id)
-- 4. Trigger integritas branch_id untuk memblokir mutasi lintas cabang non-admin
-- 5. Kebijakan RLS PostgreSQL ketat di SELURUH tabel cabang untuk user non-admin
-- 6. Hardening RPC stok (adjust_material_stock, deduct_stock_atomic, atomic_record_waste_v2)
-- =============================================================================

BEGIN;

-- 0. Helper fungsi konteks auth (konsisten untuk semua role V1 & V2)
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
    lower(trim(public.bv2_auth_role())) IN ('owner', 'admin', 'admin / owner', 'superadmin', 'super admin', 'super_admin'),
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

-- 1. Pastikan kolom branch_id + indeks tersedia di seluruh tabel cabang & tabel anak
DO $$
DECLARE
  v_tbl text;
  v_all_branch_tables text[] := ARRAY[
    'materials',
    'recipes',
    'recipe_ingredients',
    'recipe_versions',
    'suppliers',
    'supplier_materials',
    'purchase_orders',
    'purchase_order_items',
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
    'production_trimming_batches',
    'pos_upload_logs',
    'pos_orders',
    'pos_order_items',
    'pos_transactions',
    'pos_transaction_items',
    'pos_daily_aggregates'
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

-- 2. Backfill bertahap:
--    (a) Dari relasi material_id -> materials.branch_id
--    (b) Dari parent tabel anak (recipes, daily_inventories, stock_opnames, dll)
--    (c) Sisa baris NULL per tenant -> cabang utama pertama ('PUSAT')
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
    'supplier_materials',
    'expected_usage',
    'usage_variance'
  ];
  v_tenant_tables text[] := ARRAY[
    'materials',
    'recipes',
    'suppliers',
    'supplier_materials',
    'purchase_orders',
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
    'production_trimming_batches',
    'pos_upload_logs',
    'pos_orders',
    'pos_transactions',
    'pos_daily_aggregates'
  ];
BEGIN
  -- 2A. Pastikan semua tenant punya cabang utama dan backfill tabel ber-tenant_id
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

    -- Backfill dari material terlebih dahulu agar konsisten dengan cabang material
    FOREACH v_tbl IN ARRAY v_mat_tables LOOP
      IF to_regclass('public.' || v_tbl) IS NOT NULL AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'material_id'
      ) THEN
        EXECUTE format(
          'UPDATE public.%I tgt SET branch_id = m.branch_id
           FROM public.materials m
           WHERE tgt.material_id = m.id AND tgt.tenant_id = $1 AND tgt.branch_id IS NULL AND m.branch_id IS NOT NULL',
          v_tbl
        ) USING t.id;
      END IF;
    END LOOP;

    -- Backfill sisa baris NULL per tenant ke cabang default
    FOREACH v_tbl IN ARRAY v_tenant_tables LOOP
      IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
        EXECUTE format(
          'UPDATE public.%I SET branch_id = $1 WHERE tenant_id = $2 AND branch_id IS NULL',
          v_tbl
        ) USING v_default_branch_id, t.id;
      END IF;
    END LOOP;
  END LOOP;

  -- 2B. Backfill tabel anak dari parent-nya masing-masing
  IF to_regclass('public.recipe_ingredients') IS NOT NULL THEN
    UPDATE public.recipe_ingredients ri
    SET branch_id = r.branch_id
    FROM public.recipes r
    WHERE ri.recipe_id = r.id AND ri.branch_id IS NULL AND r.branch_id IS NOT NULL;
  END IF;

  IF to_regclass('public.recipe_versions') IS NOT NULL THEN
    UPDATE public.recipe_versions rv
    SET branch_id = r.branch_id
    FROM public.recipes r
    WHERE rv.recipe_id = r.id AND rv.branch_id IS NULL AND r.branch_id IS NOT NULL;
  END IF;

  IF to_regclass('public.daily_inventory_items') IS NOT NULL THEN
    UPDATE public.daily_inventory_items dii
    SET branch_id = di.branch_id
    FROM public.daily_inventories di
    WHERE dii.inventory_id = di.id AND dii.branch_id IS NULL AND di.branch_id IS NOT NULL;
  END IF;

  IF to_regclass('public.stock_opname_items') IS NOT NULL THEN
    UPDATE public.stock_opname_items soi
    SET branch_id = so.branch_id
    FROM public.stock_opnames so
    WHERE soi.opname_id = so.id AND soi.branch_id IS NULL AND so.branch_id IS NOT NULL;
  END IF;

  IF to_regclass('public.physical_check_items') IS NOT NULL THEN
    UPDATE public.physical_check_items pci
    SET branch_id = pc.branch_id
    FROM public.physical_checks pc
    WHERE pci.check_id = pc.id AND pci.branch_id IS NULL AND pc.branch_id IS NOT NULL;
  END IF;

  IF to_regclass('public.purchase_order_items') IS NOT NULL THEN
    UPDATE public.purchase_order_items poi
    SET branch_id = po.branch_id
    FROM public.purchase_orders po
    WHERE poi.po_id = po.id AND poi.branch_id IS NULL AND po.branch_id IS NOT NULL;
  END IF;

  IF to_regclass('public.market_list_items') IS NOT NULL THEN
    UPDATE public.market_list_items mli
    SET branch_id = ml.branch_id
    FROM public.market_lists ml
    WHERE mli.market_list_id = ml.id AND mli.branch_id IS NULL AND ml.branch_id IS NOT NULL;
  END IF;

  IF to_regclass('public.invoice_items') IS NOT NULL THEN
    UPDATE public.invoice_items ii
    SET branch_id = inv.branch_id
    FROM public.invoices inv
    WHERE ii.invoice_id = inv.id AND ii.branch_id IS NULL AND inv.branch_id IS NOT NULL;
  END IF;

  IF to_regclass('public.pos_order_items') IS NOT NULL THEN
    UPDATE public.pos_order_items poi
    SET branch_id = po.branch_id
    FROM public.pos_orders po
    WHERE poi.order_id = po.id AND poi.branch_id IS NULL AND po.branch_id IS NOT NULL;
  END IF;

  IF to_regclass('public.pos_transaction_items') IS NOT NULL THEN
    UPDATE public.pos_transaction_items pti
    SET branch_id = pt.branch_id
    FROM public.pos_transactions pt
    WHERE pti.transaction_id = pt.id AND pti.branch_id IS NULL AND pt.branch_id IS NOT NULL;
  END IF;
END $$;

-- 3. Terapkan NOT NULL & DEFAULT public.bv2_auth_branch_id() pada Materials, Recipes, Stock & seluruh tabel cabang
DO $$
DECLARE
  v_tbl text;
  v_has_null boolean;
  v_strict_tables text[] := ARRAY[
    'materials',
    'recipes',
    'recipe_ingredients',
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
    'daily_inventories',
    'daily_inventory_items',
    'transactions',
    'suppliers',
    'supplier_materials',
    'purchase_orders',
    'purchase_entries',
    'market_lists',
    'invoices',
    'expected_usage',
    'usage_variance',
    'production_batches',
    'production_trimming_batches',
    'pos_upload_logs',
    'pos_orders',
    'pos_transactions',
    'pos_daily_aggregates'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_strict_tables LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN branch_id SET DEFAULT public.bv2_auth_branch_id()', v_tbl);
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE branch_id IS NULL)', v_tbl) INTO v_has_null;
      IF NOT v_has_null THEN
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN branch_id SET NOT NULL', v_tbl);
      ELSE
        RAISE NOTICE 'Tabel % masih memiliki baris branch_id NULL (orphan) — NOT NULL ditunda.', v_tbl;
      END IF;
    END IF;
  END LOOP;
END $$;

-- 4. Perbarui indeks unik agar mengizinkan data terpisah per cabang tanpa bentrok antar cabang
DROP INDEX IF EXISTS public.daily_inventories_tenant_date_location_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS daily_inventories_tenant_branch_date_location_uidx
  ON public.daily_inventories (tenant_id, branch_id, date, location);

DROP INDEX IF EXISTS public.pos_daily_aggregates_tenant_date_idx;
CREATE UNIQUE INDEX IF NOT EXISTS pos_daily_aggregates_tenant_branch_date_uidx
  ON public.pos_daily_aggregates (tenant_id, branch_id, sales_date);

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS recipes_branch_menu_name_key
    ON public.recipes (tenant_id, branch_id, lower(trim(menu_name)));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Pembuatan recipes_branch_menu_name_key dilewati: %', SQLERRM;
END $$;

-- 5. Trigger integritas branch_id untuk Materials, Recipes, dan Stock:
--    - Mengisi otomatis branch_id dari parent / material bila dihilangkan oleh RPC lama
--    - Memastikan non-admin tidak dapat menyisipkan/mengubah baris milik cabang lain
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
    -- Coba turunkan dari kolom parent jika tersedia di tabel
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
    IF v_auth_branch IS NULL THEN
      RAISE EXCEPTION 'Akses cabang ditolak: pengguna non-admin wajib terikat pada branch_id.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.branch_id IS DISTINCT FROM v_auth_branch THEN
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
    'materials',
    'recipes',
    'recipe_ingredients',
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
    'daily_inventories',
    'daily_inventory_items',
    'transactions'
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

-- 6. Kebijakan PostgreSQL RLS ketat per cabang untuk SELURUH tabel cabang
--    Menghapus seluruh policy lama (termasuk policy tenant-wide lama) agar tidak ada bypass.
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

  -- Drop semua policy lama pada tabel target supaya tidak ada policy permisif sisa yang meng-OR filter cabang
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

  v_branch_read := '((SELECT public.bv2_is_admin()) OR (branch_id IS NOT NULL AND branch_id = (SELECT public.bv2_auth_branch_id())))';
  v_branch_write := '(branch_id IS NOT NULL AND ((SELECT public.bv2_is_admin()) OR branch_id = (SELECT public.bv2_auth_branch_id())))';

  EXECUTE format(
    'CREATE POLICY strict_branch_select ON public.%I FOR SELECT TO authenticated
     USING ((%s AND %s) OR (SELECT public.bv2_is_superadmin()))',
    p_table, v_tenant_expr, v_branch_read
  );
  EXECUTE format(
    'CREATE POLICY strict_branch_insert ON public.%I FOR INSERT TO authenticated
     WITH CHECK (%s AND %s)',
    p_table, v_tenant_expr, v_branch_write
  );
  EXECUTE format(
    'CREATE POLICY strict_branch_update ON public.%I FOR UPDATE TO authenticated
     USING (%s AND %s) WITH CHECK (%s AND %s)',
    p_table, v_tenant_expr, v_branch_read, v_tenant_expr, v_branch_write
  );
  EXECUTE format(
    'CREATE POLICY strict_branch_delete ON public.%I FOR DELETE TO authenticated
     USING (%s AND %s)',
    p_table, v_tenant_expr, v_branch_read
  );
END;
$$;

DO $$
DECLARE
  v_tbl text;
  v_direct_branch_tables text[] := ARRAY[
    'materials',
    'recipes',
    'suppliers',
    'supplier_materials',
    'purchase_orders',
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
    'production_trimming_batches',
    'pos_upload_logs',
    'pos_orders',
    'pos_transactions',
    'pos_daily_aggregates',
    'storage_locations',
    'daily_stock_counts',
    'assets',
    'equipment_service_logs',
    'invitations'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_direct_branch_tables LOOP
    PERFORM public.bv2_apply_strict_branch_rls(v_tbl, NULL, NULL);
  END LOOP;

  -- Tabel anak (mendukung baik yang punya tenant_id langsung maupun via parent FK)
  PERFORM public.bv2_apply_strict_branch_rls('recipe_ingredients', 'recipes', 'recipe_id');
  PERFORM public.bv2_apply_strict_branch_rls('recipe_versions', 'recipes', 'recipe_id');
  PERFORM public.bv2_apply_strict_branch_rls('daily_inventory_items', 'daily_inventories', 'inventory_id');
  PERFORM public.bv2_apply_strict_branch_rls('stock_opname_items', 'stock_opnames', 'opname_id');
  PERFORM public.bv2_apply_strict_branch_rls('physical_check_items', 'physical_checks', 'check_id');
  PERFORM public.bv2_apply_strict_branch_rls('purchase_order_items', 'purchase_orders', 'po_id');
  PERFORM public.bv2_apply_strict_branch_rls('market_list_items', 'market_lists', 'market_list_id');
  PERFORM public.bv2_apply_strict_branch_rls('invoice_items', 'invoices', 'invoice_id');
  PERFORM public.bv2_apply_strict_branch_rls('pos_order_items', 'pos_orders', 'order_id');
  PERFORM public.bv2_apply_strict_branch_rls('pos_transaction_items', 'pos_transactions', 'transaction_id');
END $$;

-- 7. Hardening RPC stok (SECURITY DEFINER / atomic stock operations)
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

-- Perbarui adjust_material_stock agar memeriksa branch_id dan meneruskannya ke transactions
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

-- Perbarui deduct_stock_atomic agar memeriksa akses cabang material
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

-- Perbarui atomic_record_waste_v2 agar memeriksa branch_id material dan menyimpannya ke transactions & waste_logs
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

NOTIFY pgrst, 'reload schema';

COMMIT;
