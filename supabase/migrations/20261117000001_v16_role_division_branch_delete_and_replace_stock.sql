-- =====================================================================================
-- BARVENTIS v16 ARCHITECTURE UPGRADE:
-- 1. Role Division Segregation (division column on materials & recipes: BAR, KITCHEN, SERVICE)
-- 2. Update area_role_mappings.allowed_categories on role_classification = 'Bar'
-- 3. Atomic Branch Cascade Deletion RPC (delete_branch_cascade_v16)
-- =====================================================================================

ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS division text DEFAULT 'BAR';
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS division text DEFAULT 'BAR';

UPDATE public.materials
SET division = CASE
  WHEN LOWER(COALESCE(category, '')) SIMILAR TO '%(kitchen|dapur|meat|poultry|seafood|sayur|bumbu|spice|food|masak)%' THEN 'KITCHEN'
  WHEN LOWER(COALESCE(category, '')) SIMILAR TO '%(asset|alat|glassware|chinaware|cutlery|equipment|linen|service|chemical)%' THEN 'SERVICE'
  ELSE 'BAR'
END
WHERE division IS NULL OR division = 'BAR';

UPDATE public.recipes
SET division = CASE
  WHEN UPPER(COALESCE(category, '')) IN ('MAIN COURSE', 'APPETIZER', 'PASTA & NOODLE', 'SOUP & SALAD', 'DESSERT', 'SAUCE & PREP', 'KITCHEN', 'FOOD') THEN 'KITCHEN'
  ELSE 'BAR'
END
WHERE division IS NULL OR division = 'BAR';

-- Update default Bar role allowed_categories in area_role_mappings (using role_classification / area_code)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'area_role_mappings' AND column_name = 'role_classification'
  ) THEN
    UPDATE public.area_role_mappings
    SET allowed_categories = ARRAY[
      'Syrup & Juice', 'Fresh Fruit', 'Dry Goods', 'Coffee & Tea', 'Powder',
      'Take Away', 'Drink & Beer', 'Frozen Drink', 'Prep / Bahan Olahan', 'Milk',
      'Asset / Inventory', 'Beverage', 'Packaging', 'Raw Material'
    ],
    updated_at = now()
    WHERE LOWER(COALESCE(role_classification, '')) IN ('bar', 'barista')
       OR UPPER(COALESCE(area_code, '')) IN ('RESTO', 'BAR');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped area_role_mappings update: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.delete_branch_cascade_v16(
  p_tenant_id uuid,
  p_branch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fallback_branch_id uuid;
  v_tbl text;
  v_tables text[] := ARRAY[
    'waste_logs',
    'production_trimming_batches',
    'production_run_items',
    'production_runs',
    'production_batch_ingredients',
    'production_batches',
    'material_lot_movements_v4',
    'material_open_lot_state',
    'daily_inventory_items',
    'daily_inventories',
    'material_batches',
    'daily_stock_counts',
    'inter_branch_transfer_items',
    'inter_branch_transfers',
    'stock_adjustments',
    'usage_variance',
    'expected_usage',
    'market_list_items',
    'market_lists',
    'invoice_items',
    'invoices',
    'physical_check_items',
    'physical_checks',
    'pos_transaction_items',
    'pos_transactions',
    'pos_daily_aggregates',
    'recipe_ingredients',
    'recipes',
    'stock_opname_items',
    'stock_opnames',
    'purchase_entries',
    'transactions',
    'material_location_costs',
    'unit_conversions',
    'area_role_mappings',
    'materials',
    'suppliers'
  ];
BEGIN
  SELECT id INTO v_fallback_branch_id
  FROM public.branches
  WHERE tenant_id = p_tenant_id AND id <> p_branch_id
  ORDER BY is_active DESC NULLS LAST, created_at ASC
  LIMIT 1;

  IF v_fallback_branch_id IS NULL THEN
    RAISE EXCEPTION 'Tidak dapat menghapus satu-satunya cabang yang tersisa di dalam sistem.';
  END IF;

  -- Reassign users to fallback active branch so login accounts remain intact
  UPDATE public.users
  SET branch_id = v_fallback_branch_id
  WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;

  -- Safely delete child records in strict FK dependency order using dynamic schema checks
  FOREACH v_tbl IN ARRAY v_tables LOOP
    BEGIN
      IF v_tbl = 'inter_branch_transfers' THEN
        EXECUTE 'DELETE FROM public.inter_branch_transfers WHERE tenant_id = $1 AND (branch_id = $2 OR from_branch_id = $2 OR to_branch_id = $2)'
        USING p_tenant_id, p_branch_id;
      ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'branch_id'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'tenant_id'
      ) THEN
        EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1 AND branch_id = $2', v_tbl)
        USING p_tenant_id, p_branch_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Notice while cleaning % for branch %: %', v_tbl, p_branch_id, SQLERRM;
    END;
  END LOOP;

  DELETE FROM public.branches WHERE tenant_id = p_tenant_id AND id = p_branch_id;

  RETURN jsonb_build_object(
    'status', 'deleted',
    'deleted_branch_id', p_branch_id,
    'reassigned_branch_id', v_fallback_branch_id
  );
END;
$$;
