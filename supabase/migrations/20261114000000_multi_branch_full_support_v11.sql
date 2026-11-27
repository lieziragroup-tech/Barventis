-- =============================================================================
-- BARVENTIS MULTI-BRANCH FULL SUPPORT (v11)
-- 1. Isolasi katalog bahan, supplier, resep, pengadaan & stok per branch_id
-- 2. Backfill aman ke cabang default untuk semua tenant lama
-- 3. Undangan staf terikat branch_id
-- 4. RPC salin/tarik menu, bahan & supplier antar cabang
-- 5. RPC pengiriman & penerimaan mutasi stok lintas cabang (DISPATCH -> RECEIVE)
-- 6. RPC ringkasan laporan lintas cabang untuk Owner
-- =============================================================================

BEGIN;

-- 1. Pastikan kolom branch_id tersedia di semua tabel master & operasional
DO $$
DECLARE
  v_tbl text;
  v_tables text[] := ARRAY[
    'invitations',
    'materials',
    'recipes',
    'suppliers',
    'supplier_materials',
    'purchase_orders',
    'purchase_entries',
    'market_lists',
    'material_batches',
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
  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE',
        v_tbl
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id, branch_id)',
        v_tbl || '_tenant_branch_idx',
        v_tbl
      );
    END IF;
  END LOOP;
END $$;

-- Pastikan inter_branch_transfers punya kolom catatan & meta tambahan jika diperlukan
ALTER TABLE IF EXISTS public.inter_branch_transfers
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Pastikan fungsi helper RLS bv2_is_admin mengenali role 'Admin / Owner' di V1
CREATE OR REPLACE FUNCTION public.bv2_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(lower(trim(public.bv2_auth_role())) IN ('owner', 'admin', 'admin / owner', 'superadmin', 'super admin'), false)
$$;

-- 2. Backfill cabang default untuk setiap tenant yang belum punya cabang,
--    lalu petakan seluruh baris lama (branch_id IS NULL) ke cabang utama pertama.
DO $$
DECLARE
  t RECORD;
  v_default_branch_id UUID;
  v_tbl text;
  v_tables text[] := ARRAY[
    'materials',
    'recipes',
    'suppliers',
    'supplier_materials',
    'purchase_orders',
    'purchase_entries',
    'market_lists',
    'material_batches',
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

    FOREACH v_tbl IN ARRAY v_tables LOOP
      IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
        EXECUTE format(
          'UPDATE public.%I SET branch_id = $1 WHERE tenant_id = $2 AND branch_id IS NULL',
          v_tbl
        ) USING v_default_branch_id, t.id;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 3. Izinkan nama bahan / kode item / nama menu yang sama dipakai di cabang berbeda
--    (unik per (tenant_id, branch_id, ...), bukan global per tenant_id).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'materials_tenant_item_code_key') THEN
    DROP INDEX public.materials_tenant_item_code_key;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materials_tenant_id_name_key') THEN
    ALTER TABLE public.materials DROP CONSTRAINT materials_tenant_id_name_key;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipes_tenant_id_menu_name_key') THEN
    ALTER TABLE public.recipes DROP CONSTRAINT recipes_tenant_id_menu_name_key;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_tenant_id_name_key') THEN
    ALTER TABLE public.suppliers DROP CONSTRAINT suppliers_tenant_id_name_key;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Penyesuaian indeks unik dilewati: %', SQLERRM;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS materials_branch_item_code_key
  ON public.materials (tenant_id, branch_id, item_code)
  WHERE item_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_branch_name_key
  ON public.suppliers (tenant_id, branch_id, lower(name));

-- 4. Pastikan policy RLS branches mendukung Owner/Admin mengelola cabang dalam tenant
DO $$
BEGIN
  IF to_regclass('public.branches') IS NOT NULL THEN
    ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS branches_tenant_select ON public.branches;
    CREATE POLICY branches_tenant_select ON public.branches
      FOR SELECT TO authenticated
      USING (tenant_id = public.bv2_auth_tenant_id() OR public.bv2_is_superadmin());

    DROP POLICY IF EXISTS branches_admin_write ON public.branches;
    CREATE POLICY branches_admin_write ON public.branches
      FOR ALL TO authenticated
      USING (tenant_id = public.bv2_auth_tenant_id() AND (public.bv2_is_admin() OR public.bv2_is_superadmin()))
      WITH CHECK (tenant_id = public.bv2_auth_tenant_id() AND (public.bv2_is_admin() OR public.bv2_is_superadmin()));
  END IF;
END $$;

-- 5. RPC Salin / Tarik Data Antar Cabang (Bahan, Supplier, & Menu/Resep)
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

  -- 5A. Salin Master Supplier
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
          p_tenant_id, p_target_branch_id, v_sup.name, v_sup.phone, v_sup.address, v_sup.contact_person, COALESCE(v_sup.status, 'ACTIVE')
        );
        v_sup_copied := v_sup_copied + 1;
      END IF;
    END LOOP;
  END IF;

  -- 5B. Salin Katalog Bahan Baku (stok awal = 0 agar fisik tidak terganda)
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
          qty_resto, qty_central
        ) VALUES (
          p_tenant_id, p_target_branch_id, v_mat.name, v_mat.category, v_mat.unit,
          v_mat.full_pack, v_mat.price, v_mat.new_price, v_mat.supplier,
          COALESCE(v_mat.min_stock, 0), COALESCE(v_mat.par_stock, 0), v_mat.item_code, v_mat.sku,
          COALESCE(v_mat.is_preparable, false),
          COALESCE(v_mat.broken_tracking_enabled, true),
          COALESCE(v_mat.expiry_tracking_enabled, false),
          v_mat.shelf_life_days,
          0, 0
        )
        RETURNING id INTO v_target_mat_id;

        v_mat_copied := v_mat_copied + 1;
      END IF;
    END LOOP;
  END IF;

  -- 5C. Salin Menu, Resep & Harga Jual (plus bahan penyusun yang belum ada)
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
          tenant_id, branch_id, menu_name, category, selling_price, basic_cost,
          fix_cost_pct, food_cost_pct, target_cost_percent, image_url,
          rounding_direction, rounding_increment, price_adjustment
        ) VALUES (
          p_tenant_id, p_target_branch_id, v_rec.menu_name, v_rec.category,
          v_rec.selling_price, v_rec.basic_cost, v_rec.fix_cost_pct, v_rec.food_cost_pct,
          COALESCE(v_rec.target_cost_percent, 27.0), v_rec.image_url,
          v_rec.rounding_direction, v_rec.rounding_increment, v_rec.price_adjustment
        )
        RETURNING id INTO v_target_rec_id;
        v_rec_copied := v_rec_copied + 1;
      ELSE
        UPDATE public.recipes
        SET category = v_rec.category,
            selling_price = v_rec.selling_price,
            basic_cost = v_rec.basic_cost,
            fix_cost_pct = v_rec.fix_cost_pct,
            food_cost_pct = v_rec.food_cost_pct,
            target_cost_percent = COALESCE(v_rec.target_cost_percent, 27.0),
            image_url = COALESCE(v_rec.image_url, image_url),
            rounding_direction = v_rec.rounding_direction,
            rounding_increment = v_rec.rounding_increment,
            price_adjustment = v_rec.price_adjustment
        WHERE id = v_target_rec_id;

        DELETE FROM public.recipe_ingredients WHERE recipe_id = v_target_rec_id;
        v_rec_updated := v_rec_updated + 1;
      END IF;

      -- Salin komposisi bahan resep & pastikan bahan tersedia di cabang tujuan
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
              v_ing.src_new_price, v_ing.src_supplier, COALESCE(v_ing.src_min, 0), COALESCE(v_ing.src_par, 0),
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

-- 6. RPC Ringkasan Performa Multi-Cabang Khusus Owner
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

NOTIFY pgrst, 'reload schema';

COMMIT;
