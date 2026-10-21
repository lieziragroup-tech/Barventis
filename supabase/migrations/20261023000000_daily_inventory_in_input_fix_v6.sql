-- BARVENTIS v6 — make manual IN genuinely editable and lot-aware.
-- Run after v3, v4, and v5 migrations. Additive only; no historical inventory rows are deleted.

BEGIN;

ALTER TABLE public.daily_inventory_items
  ADD COLUMN IF NOT EXISTS manual_in_lots jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.material_batches
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS material_batches_tenant_idempotency_key_v6
  ON public.material_batches (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.daily_inventory_items.manual_in_lots IS
  'Manual Daily Inventory IN split into receipt lots when expiry tracking is enabled. Each lot stores stable lot_key, qty, expiry_date and optional batch_no.';
COMMENT ON COLUMN public.material_batches.idempotency_key IS
  'Idempotency key for receipt lots created through Daily Inventory.';

-- Replace v4 close logic too: FULL is derived from book closing only; BROKEN is validated after.
CREATE OR REPLACE FUNCTION public.atomic_save_daily_inventory_v4(
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
  v_user_role text;
  v_is_manager boolean := false;
  v_header_id bigint;
  v_item jsonb;
  v_normalized_items jsonb := '[]'::jsonb;
  v_material public.materials%ROWTYPE;
  v_material_id bigint;
  v_detail_id bigint;
  v_opening numeric;
  v_opening_source text;
  v_previous_date date;
  v_out_input numeric;
  v_out_unit text;
  v_out numeric;
  v_out_confirmed boolean;
  v_zero_confirmed boolean;
  v_broken numeric;
  v_broken_unit text;
  v_broken_confirmed boolean;
  v_broken_base numeric;
  v_broken_tracking boolean;
  v_expiry_tracking boolean;
  v_pack_units numeric;
  v_book_closing numeric;
  v_raw_full numeric;
  v_full numeric;
  v_physical_total numeric;
  v_incoming numeric;
  v_waste numeric;
  v_production_usage numeric;
  v_stock_movement numeric;
  v_current_qty numeric;
  v_lot_total numeric;
  v_expected_lot_total numeric;
  v_has_unverified_lots boolean;
  v_lot_mismatch boolean;
  v_active_lot_id uuid;
  v_active_lot_expiry date;
  v_earliest_expiry date;
  v_fefo_exception boolean;
  v_lot_needs_reason boolean;
  v_override_reason text;
  v_lot_open_qty numeric;
  v_take numeric;
  v_remaining numeric;
  v_consumption numeric;
  v_batch record;
  v_consume record;
  v_consume_qty numeric;
  v_consume_type text;
  v_new_open_lot_id uuid;
  v_status text;
  v_result jsonb;
  v_payload_close numeric;
  v_now timestamptz := now();
BEGIN
  IF p_tenant_id IS NULL OR (public.get_auth_tenant_id() IS DISTINCT FROM p_tenant_id AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Akses tenant ditolak.' USING ERRCODE = '42501';
  END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Tanggal inventaris wajib diisi.'; END IF;
  IF upper(COALESCE(p_location, '')) NOT IN ('RESTO', 'CENTRAL') THEN RAISE EXCEPTION 'Lokasi inventaris tidak valid.'; END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Data item inventaris harus berupa array yang tidak kosong.';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) x GROUP BY (x->>'material_id') HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Ada material duplikat dalam satu pengiriman Daily Inventory.';
  END IF;
  v_location := upper(p_location)::public.stock_location;
  SELECT u.role::text INTO v_user_role FROM public.users u WHERE u.id = auth.uid() AND u.tenant_id = p_tenant_id LIMIT 1;
  v_is_manager := public.is_super_admin() OR lower(COALESCE(v_user_role,'')) IN ('admin / owner','owner','supervisor','super admin');
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(p_date::text || ':' || v_location::text));

  IF p_is_closing AND EXISTS (
    SELECT 1 FROM public.materials m
    WHERE m.tenant_id = p_tenant_id AND COALESCE(m.is_active, true) = true
      AND upper(COALESCE(m.category,'')) <> 'ASSET'
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) x WHERE (x->>'material_id')::bigint = m.id)
  ) THEN
    RAISE EXCEPTION 'Closing ditolak: ada material aktif yang belum dimuat pada halaman. Muat ulang Daily Inventory lalu periksa seluruh halaman.';
  END IF;

  SELECT h.id, h.status INTO v_header_id, v_status
  FROM public.daily_inventories h
  WHERE h.tenant_id = p_tenant_id AND h.date = p_date AND h.location = v_location
  FOR UPDATE;
  IF FOUND AND lower(COALESCE(v_status,'draft')) IN ('verified','closed') THEN
    RAISE EXCEPTION 'EOD tanggal % lokasi % sudah terkunci.', p_date, v_location;
  END IF;

  -- Compute and validate all rows before writing anything. The outer RPC and called v3 RPC run
  -- inside the same PostgreSQL transaction; one exception rolls back the entire close.
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
    v_payload_close := NULLIF(v_item->>'closing_qty','')::numeric;
    IF p_is_closing AND v_payload_close IS NOT NULL AND abs(v_payload_close - v_book_closing) > 0.0001 THEN
      RAISE EXCEPTION 'Saldo % berubah saat validasi server (form %, server %). Muat ulang dan periksa mutasi sebelum closing.', v_material.name, v_payload_close, v_book_closing;
    END IF;

    v_pack_units := GREATEST(public.stock_units_per_pack_v3(p_tenant_id, v_material_id), 0.000001);
    -- FULL is inferred from book balance only, never derived by subtracting the weighed BROKEN.
    -- When there is no IN/WASTE/other movement, book balance is opening stock minus OUT.
    -- BROKEN is then validated independently against the book balance.
    v_raw_full := v_book_closing / v_pack_units;
    v_full := GREATEST(floor(v_raw_full + 0.00000001), 0);
    v_physical_total := v_full * v_pack_units + v_broken_base;
    IF v_broken_tracking AND p_is_closing THEN
      IF v_broken_base >= v_pack_units - 0.0001 OR abs(v_physical_total - v_book_closing) > (0.005 * v_pack_units) THEN
        RAISE EXCEPTION 'BROKEN % tidak konsisten dengan saldo akhir %. FULL hasil sistem=% kemasan dan BROKEN=% satuan stok. Periksa OUT, IN, WASTE, satuan dan hasil timbang.', v_material.name, v_book_closing, v_full, v_broken_base;
      END IF;
    END IF;

    -- Lot balance health and one-open-lot policy. Existing legacy lots marked unverified require
    -- a manager reason until counted and reconciled. A BROKEN amount requires a real active lot.
    -- Expiry/FEFO controls are opt-in per material. A generic legacy batch row by itself
    -- does not silently turn every inventory item into expiry-controlled stock.
    v_expiry_tracking := COALESCE(v_material.expiry_tracking_enabled,false);
    v_active_lot_id := NULL;
    v_active_lot_expiry := NULL;
    SELECT s.active_open_lot_id INTO v_active_lot_id
    FROM public.material_open_lot_state s
    WHERE s.tenant_id = p_tenant_id AND s.material_id = v_material_id AND s.location = v_location;
    IF v_active_lot_id IS NOT NULL THEN
      SELECT COALESCE(b.expired_date,b.expiry_date) INTO v_active_lot_expiry
      FROM public.material_batches b
      WHERE b.id = v_active_lot_id AND b.tenant_id = p_tenant_id AND b.material_id = v_material_id
        AND lower(COALESCE(b.status,'active')) = 'active'
        AND (CASE WHEN v_location = 'RESTO' THEN COALESCE(b.qty_resto,0) ELSE COALESCE(b.qty_central,0) END) > 0;
      IF NOT FOUND THEN v_active_lot_id := NULL; v_active_lot_expiry := NULL; END IF;
    END IF;
    SELECT MIN(COALESCE(b.expired_date,b.expiry_date)) INTO v_earliest_expiry
    FROM public.material_batches b
    WHERE b.tenant_id = p_tenant_id AND b.material_id = v_material_id
      AND lower(COALESCE(b.status,'active')) = 'active'
      AND (CASE WHEN v_location = 'RESTO' THEN COALESCE(b.qty_resto,0) ELSE COALESCE(b.qty_central,0) END) > 0;
    SELECT COALESCE(SUM(CASE WHEN v_location = 'RESTO' THEN COALESCE(b.qty_resto,0) ELSE COALESCE(b.qty_central,0) END),0)
    INTO v_lot_total
    FROM public.material_batches b
    WHERE b.tenant_id = p_tenant_id AND b.material_id = v_material_id AND lower(COALESCE(b.status,'active')) = 'active';
    SELECT EXISTS(SELECT 1 FROM public.material_batches b
      WHERE b.tenant_id = p_tenant_id AND b.material_id = v_material_id AND lower(COALESCE(b.status,'active')) = 'active'
        AND b.lot_qty_verified = false
        AND (CASE WHEN v_location = 'RESTO' THEN COALESCE(b.qty_resto,0) ELSE COALESCE(b.qty_central,0) END) > 0)
    INTO v_has_unverified_lots;
    -- Current material master has already been changed by today’s waste/production transactions but
    -- old batch rows have not always been. Add these consumptions back for a fair pre-close lot check.
    v_current_qty := CASE WHEN v_location = 'RESTO' THEN COALESCE(v_material.qty_resto,0) ELSE COALESCE(v_material.qty_central,0) END;
    v_expected_lot_total := v_current_qty + COALESCE(v_waste,0) + COALESCE(v_production_usage,0);
    v_lot_mismatch := abs(COALESCE(v_lot_total,0) - v_expected_lot_total) > 0.0001;
    v_fefo_exception := v_active_lot_id IS NOT NULL AND v_earliest_expiry IS NOT NULL
      AND v_active_lot_expiry IS NOT NULL AND v_active_lot_expiry > v_earliest_expiry;
    v_lot_needs_reason := v_expiry_tracking AND (v_has_unverified_lots OR v_lot_mismatch OR v_fefo_exception);
    v_override_reason := NULLIF(btrim(v_item->>'fefo_override_reason'),'');
    IF p_is_closing AND v_lot_needs_reason AND (NOT v_is_manager OR v_override_reason IS NULL) THEN
      RAISE EXCEPTION 'Exception lot untuk % perlu rekonsiliasi atau persetujuan manager dengan alasan. Unverified %, mismatch %, FEFO %.',
        v_material.name, v_has_unverified_lots, v_lot_mismatch, v_fefo_exception;
    END IF;

    -- Once a manager has confirmed an unverified legacy lot AND its aggregate lot quantity
    -- exactly matches the current material balance, preserve the verification. Never mark an
    -- actually mismatched stock balance as reconciled just because a reason was supplied.
    IF p_is_closing AND v_is_manager AND v_lot_needs_reason AND NOT v_lot_mismatch
       AND v_override_reason IS NOT NULL AND v_has_unverified_lots THEN
      UPDATE public.material_batches b
      SET lot_qty_verified = true, updated_at = now()
      WHERE b.tenant_id = p_tenant_id AND b.material_id = v_material_id
        AND lower(COALESCE(b.status,'active')) = 'active'
        AND (CASE WHEN v_location='RESTO' THEN COALESCE(b.qty_resto,0) ELSE COALESCE(b.qty_central,0) END) > 0
        AND COALESCE(b.expired_date,b.expiry_date) IS NOT NULL;
    END IF;

    IF p_is_closing AND v_expiry_tracking AND v_broken_tracking AND v_broken_base > 0 AND v_active_lot_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.material_batches b WHERE b.tenant_id=p_tenant_id AND b.material_id=v_material_id
        AND lower(COALESCE(b.status,'active'))='active'
        AND (CASE WHEN v_location='RESTO' THEN COALESCE(b.qty_resto,0) ELSE COALESCE(b.qty_central,0) END)>0) THEN
      RAISE EXCEPTION 'BROKEN % tidak dapat ditautkan ke lot aktif karena belum ada saldo lot di lokasi. Buat/rekonsiliasi lot pembukaan sebelum closing.', v_material.name;
    END IF;

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

  -- Call v3's well-tested idempotent ledger posting after all v4 validation has passed.
  v_result := public.atomic_save_daily_inventory_v3(p_tenant_id, p_date, p_location, v_normalized_items, p_is_closing, v_user_id);
  v_header_id := (v_result->>'inventory_id')::bigint;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_normalized_items) ORDER BY (value->>'material_id')::bigint LOOP
    v_material_id := (v_item->>'material_id')::bigint;
    SELECT i.id INTO v_detail_id FROM public.daily_inventory_items i WHERE i.inventory_id = v_header_id AND i.material_id = v_material_id;
    UPDATE public.daily_inventory_items i SET
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
      terpakai_qty = COALESCE(NULLIF(v_item->>'out_qty','')::numeric,0),
      usage_value = CASE WHEN p_is_closing THEN COALESCE(NULLIF(v_item->>'out_qty','')::numeric,0) * COALESCE(i.unit_cost_snapshot,0) ELSE NULL END,
      reconciliation_status = CASE WHEN p_is_closing THEN 'CLOSED_BOOK_PLUS_BROKEN' ELSE 'PENDING' END
    WHERE i.id = v_detail_id;

    IF p_is_closing AND COALESCE((v_item->>'v4_expiry_tracking')::boolean,false) THEN
      v_expiry_tracking := true;
      v_out := COALESCE(NULLIF(v_item->>'v4_out','')::numeric,0);
      v_waste := COALESCE(NULLIF(v_item->>'v4_waste','')::numeric,0);
      v_production_usage := COALESCE(NULLIF(v_item->>'v4_production_usage','')::numeric,0);
      v_active_lot_id := NULLIF(v_item->>'opening_active_open_lot_id','')::uuid;

      -- Keep each kind of depletion separate. Reopening EOD reverses only EOD_OUT;
      -- waste and production consumption remain posted and therefore stay depleted from lots.
      FOR v_consume IN
        SELECT x.movement_type, x.quantity
        FROM (VALUES
          ('EOD_OUT'::text, GREATEST(COALESCE(v_out,0),0)),
          ('EOD_WASTE'::text, GREATEST(COALESCE(v_waste,0),0)),
          ('EOD_PRODUCTION_INPUT'::text, GREATEST(COALESCE(v_production_usage,0),0))
        ) AS x(movement_type, quantity)
      LOOP
        v_consume_type := v_consume.movement_type;
        v_consume_qty := COALESCE(v_consume.quantity,0);
        IF v_consume_qty <= 0.0000001 THEN CONTINUE; END IF;

        -- These two movements survive an EOD reopen. Do not deduct them again on re-close.
        IF v_consume_type IN ('EOD_WASTE','EOD_PRODUCTION_INPUT') AND EXISTS (
          SELECT 1 FROM public.material_lot_movements_v4 lm
          WHERE lm.tenant_id=p_tenant_id AND lm.daily_inventory_item_id=v_detail_id
            AND lm.movement_type=v_consume_type AND lm.reversed_at IS NULL
        ) THEN
          CONTINUE;
        END IF;

        v_remaining := v_consume_qty;
        -- Finish the currently opened bottle first; any exception to FEFO was validated
        -- above and requires a manager reason. Otherwise remaining sealed stock follows FEFO.
        FOR v_batch IN
          SELECT b.id, b.batch_no, b.expired_date, b.expiry_date,
            CASE WHEN v_location='RESTO' THEN COALESCE(b.qty_resto,0) ELSE COALESCE(b.qty_central,0) END AS qty_here
          FROM public.material_batches b
          WHERE b.tenant_id=p_tenant_id AND b.material_id=v_material_id
            AND lower(COALESCE(b.status,'active'))='active'
            AND (CASE WHEN v_location='RESTO' THEN COALESCE(b.qty_resto,0) ELSE COALESCE(b.qty_central,0) END)>0
          ORDER BY (b.id = v_active_lot_id) DESC, COALESCE(b.expired_date,b.expiry_date) ASC NULLS LAST, b.created_at ASC, b.id
          FOR UPDATE
        LOOP
          EXIT WHEN v_remaining <= 0.0000001;
          v_take := LEAST(v_batch.qty_here, v_remaining);
          IF v_take <= 0 THEN CONTINUE; END IF;
          IF v_location='RESTO' THEN
            UPDATE public.material_batches SET qty_resto=GREATEST(COALESCE(qty_resto,0)-v_take,0), updated_at=now() WHERE id=v_batch.id AND tenant_id=p_tenant_id;
          ELSE
            UPDATE public.material_batches SET qty_central=GREATEST(COALESCE(qty_central,0)-v_take,0), updated_at=now() WHERE id=v_batch.id AND tenant_id=p_tenant_id;
          END IF;
          INSERT INTO public.material_lot_movements_v4 (tenant_id,material_id,location,batch_id,daily_inventory_item_id,movement_qty,movement_type,idempotency_key,reason,created_by,reversed_at)
          VALUES (p_tenant_id,v_material_id,v_location,v_batch.id,v_detail_id,-v_take,v_consume_type,
            'daily-lot:'||v_detail_id::text||':'||v_consume_type||':'||v_batch.id::text,
            COALESCE(v_item->>'fefo_override_reason',v_consume_type||' stock depletion'),v_user_id,NULL)
          ON CONFLICT (tenant_id,idempotency_key) DO UPDATE SET movement_qty=EXCLUDED.movement_qty,
            reason=EXCLUDED.reason,created_by=EXCLUDED.created_by,reversed_at=NULL,created_at=now();
          v_remaining := v_remaining-v_take;
        END LOOP;

        IF v_remaining > 0.0001 THEN
          RAISE EXCEPTION 'Stok lot untuk material % tidak cukup untuk alokasi % (kurang % satuan stok). Rekonsiliasi lot sebelum closing.', v_material_id, v_consume_type, v_remaining;
        END IF;
      END LOOP;

      v_new_open_lot_id := NULL;
      IF COALESCE(NULLIF(v_item->>'v4_broken_base','')::numeric,0) > 0 THEN
        -- Keep the current open lot while it still has stock; otherwise open the next FEFO lot.
        IF v_active_lot_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.material_batches b WHERE b.id=v_active_lot_id AND b.tenant_id=p_tenant_id
            AND lower(COALESCE(b.status,'active'))='active'
            AND (CASE WHEN v_location='RESTO' THEN COALESCE(b.qty_resto,0) ELSE COALESCE(b.qty_central,0) END)>0
        ) THEN
          v_new_open_lot_id := v_active_lot_id;
        ELSE
          SELECT b.id INTO v_new_open_lot_id FROM public.material_batches b
          WHERE b.tenant_id=p_tenant_id AND b.material_id=v_material_id AND lower(COALESCE(b.status,'active'))='active'
            AND (CASE WHEN v_location='RESTO' THEN COALESCE(b.qty_resto,0) ELSE COALESCE(b.qty_central,0) END)>0
          ORDER BY COALESCE(b.expired_date,b.expiry_date) ASC NULLS LAST,b.created_at ASC,b.id LIMIT 1;
          IF v_new_open_lot_id IS NULL THEN
            RAISE EXCEPTION 'BROKEN material % belum dapat ditautkan ke lot aktif sesudah FEFO. Periksa saldo lot.', v_material_id;
          END IF;
        END IF;
      END IF;

      INSERT INTO public.material_open_lot_state (tenant_id,material_id,location,active_open_lot_id,opened_at,updated_at)
      VALUES (p_tenant_id,v_material_id,v_location,v_new_open_lot_id,CASE WHEN v_new_open_lot_id IS NULL THEN NULL ELSE now() END,now())
      ON CONFLICT (tenant_id,material_id,location) DO UPDATE
      SET active_open_lot_id=EXCLUDED.active_open_lot_id,
          opened_at=CASE WHEN EXCLUDED.active_open_lot_id IS NULL THEN NULL
                         WHEN material_open_lot_state.active_open_lot_id IS DISTINCT FROM EXCLUDED.active_open_lot_id THEN now()
                         ELSE material_open_lot_state.opened_at END,
          updated_at=now();

      UPDATE public.daily_inventory_items SET active_open_lot_id=v_new_open_lot_id,
        reconciliation_status=CASE WHEN COALESCE((v_item->>'v4_lot_needs_reason')::boolean,false) THEN 'CLOSED_WITH_MANAGER_LOT_OVERRIDE' ELSE 'CLOSED_BOOK_PLUS_BROKEN' END
      WHERE id=v_detail_id;
    END IF;
  END LOOP;

  RETURN v_result || jsonb_build_object('version',4,'opening_policy','previous_closed_eod_plus_ledger','full_policy','inferred_from_book_balance_then_validate_broken','lot_policy','single_open_lot_fefo');
END;
$function$;

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

REVOKE ALL ON FUNCTION public.save_daily_inventory_manual_in_v6(uuid,date,text,jsonb,boolean,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_daily_inventory_manual_in_v6(uuid,date,text,jsonb,boolean,uuid) TO authenticated;

COMMIT;
