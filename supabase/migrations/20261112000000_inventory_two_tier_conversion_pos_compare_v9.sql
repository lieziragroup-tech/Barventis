-- ==============================================================================
-- Barventis v9: 4 Konfirmasi Alur Inventory
-- 1. Arsitektur Konversi 2-Satuan (Kemasan <-> Isi gr/ml/pcs)
-- 2. Rekonsiliasi Manual OUT Barista vs Pemakaian Teoritis POS ESB
-- 3. Penataan Pembelian Harian (Tujuan Kirim + Keterangan), Acuan Stok 1 Bulan, & Sync SO Central ke Resto
-- 4. Visibilitas Bahan Hasil Olahan (SimplePrep / Proses Produksi Bahan) di Daily Inventory
-- ==============================================================================

BEGIN;

-- 1. Penambahan Kolom Skema v9
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS monthly_quota_qty numeric(16,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_prep_output boolean DEFAULT false;

ALTER TABLE public.purchase_entries
  ADD COLUMN IF NOT EXISTS delivery_notes text;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS delivery_notes text;

-- 2. Migrasi Otomatis Konversi 2-Satuan (Two-Tier Conversion) pada Data Lama
-- Memperbaiki bahan yang telanjur berlabel unit = 'gr'/'grm'/'ml' padahal memiliki harga per kemasan (>= Rp 1.000)
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

-- Standarisasi full_pack ke format "<kemasan> = <jumlah> <satuan_isi>" untuk satuan kemasan
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

-- 3. Tandai Bahan Hasil Olahan (SimplePrep & 9 Item Batching Proses Produksi Bahan)
UPDATE public.materials
SET
  is_prep_output = true,
  is_active = true
WHERE
  lower(trim(COALESCE(category, ''))) = 'bahan olahan / prep'
  OR lower(name) LIKE '%(bersih%'
  OR lower(name) LIKE '%siap pakai%'
  OR lower(name) LIKE '%sari / jus%'
  OR lower(name) LIKE '%marinasi%'
  OR lower(name) IN (
    'green delight',
    'dragon beet',
    'beta caroot e.ne',
    'berry much',
    'tropical',
    'manggo yougurt',
    'mango yogurt',
    'gula cair',
    'teh base',
    'foaming'
  );

-- 4. RPC: Perhitungan Pemakaian Teoritis Harian dari Penjualan POS ESB (Compare POS ESB)
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
      pt.menu_name,
      SUM(COALESCE(pt.qty, 0))::numeric AS total_sold
    FROM public.pos_transactions pt
    WHERE pt.tenant_id = p_tenant_id
      AND pt.date = p_date
      AND COALESCE(pt.qty, 0) > 0
    GROUP BY pt.menu_name
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
        OR lower(trim( regexp_replace(ds.menu_name, '\s*\((hot|ice|iced|dingin|panas|large|regular)\)\s*', '', 'gi') )) = lower(trim(r.menu_name))
      )
    JOIN public.recipe_ingredients ri
      ON ri.recipe_id = r.id
    JOIN public.materials m
      ON m.id = ri.material_id
      AND m.tenant_id = p_tenant_id
  )
  SELECT
    mb.material_id,
    mb.mat_name AS material_name,
    mb.mat_unit AS material_unit,
    mb.mat_full_pack AS full_pack,
    SUM(mb.used_qty)::numeric AS theoretical_recipe_qty,
    MAX(mb.ing_unit) AS recipe_unit,
    SUM(mb.total_sold)::numeric AS menus_sold_count,
    string_agg(DISTINCT (mb.menu_name || ' (' || trim(to_char(mb.total_sold, 'FM999999990.##')) || ')'), ', ') AS menu_breakdown
  FROM matched_bom mb
  GROUP BY mb.material_id, mb.mat_name, mb.mat_unit, mb.mat_full_pack;
END;
$function$;

-- 5. RPC: Sinkronisasi Barang Stock Opname Central yang Belum Ada / Bersaldo 0 ke Resto
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
    SELECT id, name, unit, price, COALESCE(qty_central, 0) AS qty_central, COALESCE(qty_resto, 0) AS qty_resto
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
        tenant_id, date, material_id, type, location, qty, amount, notes, source_module, created_by
      ) VALUES (
        p_tenant_id,
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

COMMIT;
