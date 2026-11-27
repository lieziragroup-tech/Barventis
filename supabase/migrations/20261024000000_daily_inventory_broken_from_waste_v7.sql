-- Barventis v7: capture aggregate BROKEN closing quantity from Waste Logs UI.
-- BROKEN is a physical remainder count, not a waste movement. This function updates
-- only the daily inventory detail and open-lot state; it never changes material stock.
-- Run after the existing v3, v4, v5, and v6 migrations have succeeded.

BEGIN;

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

REVOKE ALL ON FUNCTION public.save_daily_inventory_broken_counts_v7(uuid, date, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_daily_inventory_broken_counts_v7(uuid, date, text, jsonb, uuid) TO authenticated;

COMMIT;
