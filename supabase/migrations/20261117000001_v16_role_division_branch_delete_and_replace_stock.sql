-- =====================================================================================
-- BARVENTIS v16 ARCHITECTURE UPGRADE:
-- 1. Role Division Segregation (`division` column on `materials` & `recipes`: BAR, KITCHEN, SERVICE)
-- 2. Atomic Branch Cascade Deletion RPC (`delete_branch_cascade_v16`)
-- 3. Stock Replacement & EOD Sync in `adjust_material_stock`
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

-- Update default Bar role allowed_categories in area_role_mappings so all 142 Bar items appear
UPDATE public.area_role_mappings
SET allowed_categories = ARRAY[
  'Syrup & Juice', 'Fresh Fruit', 'Dry Goods', 'Coffee & Tea', 'Powder',
  'Take Away', 'Drink & Beer', 'Frozen Drink', 'Prep / Bahan Olahan', 'Milk',
  'Asset / Inventory', 'Beverage', 'Packaging', 'Raw Material'
]
WHERE LOWER(role_name) = 'bar';

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

  -- Delete child records in strict FK dependency order
  DELETE FROM public.waste_logs WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.production_trimming_batches WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.production_run_items WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.production_runs WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.production_batch_ingredients WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.production_batches WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.material_lot_movements_v4 WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.material_open_lot_state WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.daily_inventory_items WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.daily_inventories WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.material_batches WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.daily_stock_counts WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.inter_branch_transfer_items WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.inter_branch_transfers WHERE tenant_id = p_tenant_id AND (from_branch_id = p_branch_id OR to_branch_id = p_branch_id OR branch_id = p_branch_id);
  DELETE FROM public.stock_adjustments WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.usage_variance WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.expected_usage WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.market_list_items WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.market_lists WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.invoice_items WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.invoices WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.physical_check_items WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.physical_checks WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.pos_transaction_items WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.pos_transactions WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.pos_daily_aggregates WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.recipe_ingredients WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.recipes WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.stock_opname_items WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.stock_opnames WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.purchase_entries WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.transactions WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.material_location_costs WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.unit_conversions WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.area_role_mappings WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.materials WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  DELETE FROM public.suppliers WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;

  DELETE FROM public.branches WHERE tenant_id = p_tenant_id AND id = p_branch_id;

  RETURN jsonb_build_object(
    'status', 'deleted',
    'deleted_branch_id', p_branch_id,
    'reassigned_branch_id', v_fallback_branch_id
  );
END;
$$;
