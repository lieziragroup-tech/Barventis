-- BARVENTIS v4 — Daily Inventory opening carry-forward, manual BROKEN, inferred FULL,
-- lot-aware FEFO, and search/pagination fields consumed by the frontend.
-- Additive migration: run AFTER 20261020000000_daily_inventory_cost_control_v3.sql.
-- This migration intentionally does not delete/rewrite historical inventory rows.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Per-material policies and daily row snapshots
-- ---------------------------------------------------------------------------
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS broken_tracking_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expiry_tracking_enabled boolean NOT NULL DEFAULT false;

-- Seed BROKEN tracking for materials whose Full Pack has a recognised physical content unit.
-- Owners can turn this off/on per material afterward. This is an initial heuristic, not a
-- substitute for reviewing the material master.
UPDATE public.materials m
SET broken_tracking_enabled = true
WHERE COALESCE(NULLIF(btrim(m.full_pack), ''), '') ~* '(^|=)[[:space:]]*[0-9]+([.][0-9]+)?[[:space:]]*(g|gr|grm|gram|grams|kg|ml|l|ltr|liter|litre|pcs|pc|piece|pieces)([[:space:]]|$)'
  AND m.broken_tracking_enabled = false;

UPDATE public.materials m
SET expiry_tracking_enabled = true
WHERE EXISTS (
  SELECT 1 FROM public.material_batches b
  WHERE b.tenant_id = m.tenant_id AND b.material_id = m.id
    AND (COALESCE(b.qty_resto, 0) > 0 OR COALESCE(b.qty_central, 0) > 0)
    AND COALESCE(b.expired_date, b.expiry_date) IS NOT NULL
);

ALTER TABLE public.daily_inventory_items
  ADD COLUMN IF NOT EXISTS opening_qty_snapshot numeric(16,4),
  ADD COLUMN IF NOT EXISTS opening_full_qty numeric(16,4),
  ADD COLUMN IF NOT EXISTS opening_broken_qty numeric(16,4),
  ADD COLUMN IF NOT EXISTS closing_broken_qty_base numeric(16,4),
  ADD COLUMN IF NOT EXISTS broken_unit text,
  ADD COLUMN IF NOT EXISTS broken_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS out_qty_input numeric(16,4),
  ADD COLUMN IF NOT EXISTS out_unit text,
  ADD COLUMN IF NOT EXISTS out_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS zero_activity_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closing_full_inferred_qty numeric(16,4),
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS opening_active_open_lot_id uuid,
  ADD COLUMN IF NOT EXISTS active_open_lot_id uuid,
  ADD COLUMN IF NOT EXISTS fefo_override_reason text;

-- Preserve historical closed rows as legacy-confirmed where the old schema already recorded
-- a completed EOD. The `legacy` note is represented by reconciliation_status; no values change.
UPDATE public.daily_inventory_items i
SET opening_qty_snapshot = COALESCE(i.opening_qty_snapshot, i.prev_full_qty),
    closing_full_inferred_qty = COALESCE(i.closing_full_inferred_qty, i.full_qty),
    out_confirmed = CASE WHEN lower(COALESCE(h.status, 'draft')) IN ('verified', 'closed') THEN true ELSE i.out_confirmed END,
    broken_confirmed = CASE WHEN lower(COALESCE(h.status, 'draft')) IN ('verified', 'closed') AND i.is_counted THEN true ELSE i.broken_confirmed END,
    reconciliation_status = CASE WHEN lower(COALESCE(h.status, 'draft')) IN ('verified', 'closed') THEN 'LEGACY_CLOSED_REVIEW' ELSE i.reconciliation_status END
FROM public.daily_inventories h
WHERE h.id = i.inventory_id
  AND (i.opening_qty_snapshot IS NULL OR i.closing_full_inferred_qty IS NULL OR (lower(COALESCE(h.status, 'draft')) IN ('verified', 'closed') AND i.out_confirmed = false));

-- Existing lots are not necessarily reconciled to material master quantity. Mark them explicitly
-- unverified; new lots are verified by the atomic receiving path unless later reconciled otherwise.
ALTER TABLE public.material_batches ADD COLUMN IF NOT EXISTS lot_qty_verified boolean;
UPDATE public.material_batches SET lot_qty_verified = false WHERE lot_qty_verified IS NULL;
ALTER TABLE public.material_batches ALTER COLUMN lot_qty_verified SET DEFAULT true;
ALTER TABLE public.material_batches ALTER COLUMN lot_qty_verified SET NOT NULL;

CREATE INDEX IF NOT EXISTS material_batches_v4_tenant_material_expiry_idx
  ON public.material_batches (tenant_id, material_id, expired_date, expiry_date)
  WHERE lower(COALESCE(status, 'active')) = 'active';

-- ---------------------------------------------------------------------------
-- 2) One active open lot per material/location; immutable lot movement audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.material_open_lot_state (
  tenant_id uuid NOT NULL,
  material_id bigint NOT NULL REFERENCES public.materials(id),
  location public.stock_location NOT NULL,
  active_open_lot_id uuid REFERENCES public.material_batches(id),
  opened_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, material_id, location)
);

CREATE TABLE IF NOT EXISTS public.material_lot_movements_v4 (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  material_id bigint NOT NULL REFERENCES public.materials(id),
  location public.stock_location NOT NULL,
  batch_id uuid NOT NULL REFERENCES public.material_batches(id),
  daily_inventory_item_id bigint NOT NULL,
  movement_qty numeric(16,4) NOT NULL CHECK (movement_qty <> 0),
  movement_type text NOT NULL DEFAULT 'EOD_CONSUMPTION',
  idempotency_key text NOT NULL,
  reason text,
  reversed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_lot_movements_v4_tenant_idempotency_key UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS material_lot_movements_v4_daily_item_idx
  ON public.material_lot_movements_v4 (tenant_id, daily_inventory_item_id);
CREATE INDEX IF NOT EXISTS material_lot_movements_v4_lot_idx
  ON public.material_lot_movements_v4 (tenant_id, batch_id, created_at DESC);

ALTER TABLE public.material_open_lot_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_lot_movements_v4 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS material_open_lot_state_tenant_select_v4 ON public.material_open_lot_state;
CREATE POLICY material_open_lot_state_tenant_select_v4 ON public.material_open_lot_state
  FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
DROP POLICY IF EXISTS material_lot_movements_tenant_select_v4 ON public.material_lot_movements_v4;
CREATE POLICY material_lot_movements_tenant_select_v4 ON public.material_lot_movements_v4
  FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
GRANT SELECT ON public.material_open_lot_state, public.material_lot_movements_v4 TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.material_lot_movements_v4_id_seq TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_material_expiry_tracking_v4()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF COALESCE(NEW.qty_resto, 0) > 0 OR COALESCE(NEW.qty_central, 0) > 0 THEN
    UPDATE public.materials
    SET expiry_tracking_enabled = true, updated_at = now()
    WHERE tenant_id = NEW.tenant_id AND id = NEW.material_id;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS mark_material_expiry_tracking_v4_trigger ON public.material_batches;
CREATE TRIGGER mark_material_expiry_tracking_v4_trigger
AFTER INSERT ON public.material_batches
FOR EACH ROW EXECUTE FUNCTION public.mark_material_expiry_tracking_v4();

-- When an output material is expiry-tracked, each production run creates its own output lot.
-- Shelf life must be configured; the migration never invents an expiry interval.
CREATE OR REPLACE FUNCTION public.materialize_production_output_lot_v4()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_expiry_tracking boolean;
  v_shelf_life integer;
  v_expiry_date date;
BEGIN
  IF NEW.type <> 'IN' OR COALESCE(NEW.qty,0) <= 0 OR COALESCE(NEW.source_module,'') <> 'production'
     OR COALESCE(NEW.is_reversed,false) THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(m.expiry_tracking_enabled,false), m.shelf_life_days
  INTO v_expiry_tracking, v_shelf_life
  FROM public.materials m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.material_id;
  IF NOT COALESCE(v_expiry_tracking,false) THEN RETURN NEW; END IF;
  IF COALESCE(v_shelf_life,0) <= 0 THEN
    RAISE EXCEPTION 'Material hasil produksi % melacak expired date tetapi Shelf Life (hari) belum diatur. Lengkapi master material sebelum produksi.', NEW.material_id;
  END IF;
  v_expiry_date := NEW.date + v_shelf_life;
  INSERT INTO public.material_batches (
    tenant_id, material_id, batch_no, batch_number, expiry_date, expired_date,
    qty_resto, qty_central, location, received_at, status, lot_qty_verified
  ) VALUES (
    NEW.tenant_id, NEW.material_id, 'PROD-' || COALESCE(NEW.source_record_id,NEW.id::text),
    'PROD-' || COALESCE(NEW.source_record_id,NEW.id::text), v_expiry_date, v_expiry_date,
    CASE WHEN NEW.location='RESTO' THEN NEW.qty ELSE 0 END,
    CASE WHEN NEW.location='CENTRAL' THEN NEW.qty ELSE 0 END,
    NEW.location::text, NEW.date, 'active', true
  );
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS materialize_production_output_lot_v4_trigger ON public.transactions;
CREATE TRIGGER materialize_production_output_lot_v4_trigger
AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.materialize_production_output_lot_v4();

-- ---------------------------------------------------------------------------
-- 3) Server-authoritative opening balance for a specific date/location/material
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.daily_inventory_opening_v4(
  p_tenant_id uuid,
  p_date date,
  p_location public.stock_location,
  p_material_id bigint
) RETURNS TABLE(opening_qty numeric, opening_qty_source text, previous_date date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_current_qty numeric := 0;
  v_previous_date date;
  v_previous_closed_at timestamptz;
  v_previous_closing numeric;
  v_carry_movement numeric := 0;
  v_stock_movement numeric := 0;
  v_waste numeric := 0;
  v_production_usage numeric := 0;
BEGIN
  SELECT CASE WHEN p_location = 'RESTO' THEN COALESCE(m.qty_resto, 0) ELSE COALESCE(m.qty_central, 0) END
  INTO v_current_qty
  FROM public.materials m
  WHERE m.tenant_id = p_tenant_id AND m.id = p_material_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material % tidak ditemukan saat menghitung stok awal.', p_material_id; END IF;

  SELECT h.date, h.updated_at, i.closing_qty
  INTO v_previous_date, v_previous_closed_at, v_previous_closing
  FROM public.daily_inventories h
  LEFT JOIN public.daily_inventory_items i ON i.inventory_id = h.id AND i.material_id = p_material_id
  WHERE h.tenant_id = p_tenant_id AND h.location = p_location AND h.date < p_date
    AND lower(COALESCE(h.status, 'draft')) IN ('verified', 'closed')
  ORDER BY h.date DESC LIMIT 1;

  IF v_previous_date IS NOT NULL AND v_previous_closing IS NOT NULL THEN
    SELECT COALESCE(SUM(t.qty), 0) INTO v_carry_movement
    FROM public.transactions t
    WHERE t.tenant_id = p_tenant_id AND t.material_id = p_material_id AND t.location = p_location
      AND t.date >= v_previous_date AND t.date < p_date
      AND (t.date > v_previous_date OR (t.date = v_previous_date AND t.created_at > v_previous_closed_at))
      AND COALESCE(t.is_reversed, false) = false
      AND t.type NOT IN ('POS_SALE', 'POS_DEDUCTION');
    opening_qty := GREATEST(v_previous_closing + COALESCE(v_carry_movement, 0), 0);
    opening_qty_source := 'PREVIOUS_CLOSED_EOD_PLUS_LEDGER';
    previous_date := v_previous_date;
    RETURN NEXT;
    RETURN;
  END IF;

  -- No closed EOD exists yet. Derive the pre-transaction opening balance from the current
  -- material balance minus today's already-posted non-consumption movements, plus consumption
  -- already reflected in master stock. This avoids adding today's purchases twice.
  SELECT COALESCE(SUM(t.qty), 0) INTO v_stock_movement
  FROM public.transactions t
  WHERE t.tenant_id = p_tenant_id AND t.material_id = p_material_id AND t.location = p_location AND t.date = p_date
    AND COALESCE(t.is_reversed, false) = false
    AND t.type NOT IN ('POS_SALE', 'POS_DEDUCTION', 'WASTE', 'BREAKAGE', 'EXPIRED', 'COMP')
    AND NOT (t.type = 'OUT' AND COALESCE(t.source_module, '') IN ('daily_inventory', 'production'));

  SELECT COALESCE(SUM(ABS(t.qty)), 0) INTO v_waste
  FROM public.transactions t
  WHERE t.tenant_id = p_tenant_id AND t.material_id = p_material_id AND t.location = p_location AND t.date = p_date
    AND t.type IN ('WASTE', 'BREAKAGE', 'EXPIRED', 'COMP') AND COALESCE(t.is_reversed, false) = false;

  SELECT COALESCE(SUM(ABS(t.qty)), 0) INTO v_production_usage
  FROM public.transactions t
  WHERE t.tenant_id = p_tenant_id AND t.material_id = p_material_id AND t.location = p_location AND t.date = p_date
    AND t.type = 'OUT' AND t.source_module = 'production' AND COALESCE(t.is_reversed, false) = false;

  opening_qty := GREATEST(v_current_qty - v_stock_movement + v_waste + v_production_usage, 0);
  opening_qty_source := 'LEGACY_CURRENT_BALANCE_MINUS_TODAY_MUTATIONS_ESTIMATED';
  previous_date := NULL;
  RETURN NEXT;
END;
$function$;

-- Require expiry date for purchasing a material that has lot tracking enabled.
CREATE OR REPLACE FUNCTION public.atomic_record_purchase_location_wac_v4(
  p_tenant_id uuid,
  p_material_id bigint,
  p_supplier_id bigint,
  p_qty numeric,
  p_unit text,
  p_unit_price numeric,
  p_date date,
  p_destination text,
  p_input_by uuid,
  p_notes text,
  p_expired_date date,
  p_request_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_expiry_tracking boolean;
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL OR (public.get_auth_tenant_id() IS DISTINCT FROM p_tenant_id AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Akses tenant ditolak.' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(m.expiry_tracking_enabled,false) INTO v_expiry_tracking
  FROM public.materials m WHERE m.tenant_id=p_tenant_id AND m.id=p_material_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material tidak ditemukan.'; END IF;
  IF v_expiry_tracking AND p_expired_date IS NULL THEN
    RAISE EXCEPTION 'Material ini wajib melacak expired date. Isi tanggal kedaluwarsa pada penerimaan; jika satu pembelian memiliki beberapa expiry date, pecah menjadi beberapa lot penerimaan.';
  END IF;
  v_result := public.atomic_record_purchase_location_wac(p_tenant_id,p_material_id,p_supplier_id,p_qty,p_unit,p_unit_price,p_date,p_destination,p_input_by,p_notes,p_expired_date,p_request_key);
  RETURN v_result || jsonb_build_object('version',4,'lot_tracked',COALESCE(v_expiry_tracking,false) OR p_expired_date IS NOT NULL);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4) Daily Inventory v4 RPC: explicit OUT confirmation, manual BROKEN,
--    inferred FULL, server-side opening, FEFO exception approval, and lot audit.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 5) Reopen EOD also restores batch quantities and the prior open-lot pointer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reopen_daily_inventory_session_v4(
  p_tenant_id uuid,
  p_date date,
  p_location text,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_location public.stock_location;
  v_header_id bigint;
  v_result jsonb;
  v_item record;
  v_move record;
BEGIN
  IF p_tenant_id IS NULL OR (public.get_auth_tenant_id() IS DISTINCT FROM p_tenant_id AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Akses tenant ditolak.' USING ERRCODE = '42501';
  END IF;
  IF upper(COALESCE(p_location,'')) NOT IN ('RESTO','CENTRAL') THEN RAISE EXCEPTION 'Lokasi inventaris tidak valid.'; END IF;
  v_location := upper(p_location)::public.stock_location;
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(p_date::text || ':' || v_location::text));
  SELECT h.id INTO v_header_id FROM public.daily_inventories h
  WHERE h.tenant_id=p_tenant_id AND h.date=p_date AND h.location=v_location
    AND lower(COALESCE(h.status,'draft')) IN ('verified','closed') FOR UPDATE;
  IF v_header_id IS NULL THEN RAISE EXCEPTION 'Tidak ada EOD terkunci untuk dibuka kembali.'; END IF;

  -- First restore all batch balances touched by the closing; idempotency is protected by reversed_at.
  FOR v_move IN
    SELECT * FROM public.material_lot_movements_v4
    WHERE tenant_id=p_tenant_id AND daily_inventory_item_id IN (
      SELECT id FROM public.daily_inventory_items WHERE inventory_id=v_header_id
    ) AND movement_type = 'EOD_OUT' AND reversed_at IS NULL
    FOR UPDATE
  LOOP
    IF v_move.location='RESTO' THEN
      UPDATE public.material_batches SET qty_resto=COALESCE(qty_resto,0)+ABS(v_move.movement_qty),updated_at=now()
      WHERE id=v_move.batch_id AND tenant_id=p_tenant_id;
    ELSE
      UPDATE public.material_batches SET qty_central=COALESCE(qty_central,0)+ABS(v_move.movement_qty),updated_at=now()
      WHERE id=v_move.batch_id AND tenant_id=p_tenant_id;
    END IF;
    UPDATE public.material_lot_movements_v4 SET reversed_at=now() WHERE id=v_move.id;
  END LOOP;

  -- Restore the active lot state that was active at the beginning of the EOD session.
  FOR v_item IN
    SELECT i.material_id, i.opening_active_open_lot_id
    FROM public.daily_inventory_items i WHERE i.inventory_id=v_header_id
  LOOP
    INSERT INTO public.material_open_lot_state (tenant_id,material_id,location,active_open_lot_id,opened_at,updated_at)
    VALUES (p_tenant_id,v_item.material_id,v_location,v_item.opening_active_open_lot_id,
      CASE WHEN v_item.opening_active_open_lot_id IS NULL THEN NULL ELSE now() END,now())
    ON CONFLICT (tenant_id,material_id,location) DO UPDATE SET
      active_open_lot_id=EXCLUDED.active_open_lot_id,
      opened_at=CASE WHEN EXCLUDED.active_open_lot_id IS NULL THEN NULL ELSE now() END,
      updated_at=now();
  END LOOP;

  v_result := public.reopen_daily_inventory_session_v3(p_tenant_id,p_date,p_location,p_user_id);
  RETURN v_result || jsonb_build_object('version',4,'lot_balances_restored',true);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6) Transfer batches with the stock transfer, preserving receipt lot/expiry.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atomic_transfer_stock_location_wac_v4(
  p_tenant_id uuid,
  p_material_id bigint,
  p_qty numeric,
  p_source text,
  p_target text,
  p_date date,
  p_notes text,
  p_request_key text,
  p_created_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_source public.stock_location;
  v_target public.stock_location;
  v_result jsonb;
  v_remaining numeric := p_qty;
  v_take numeric;
  v_batch record;
  v_active_lot uuid;
  v_target_active_lot uuid;
BEGIN
  IF upper(p_source) NOT IN ('RESTO','CENTRAL') OR upper(p_target) NOT IN ('RESTO','CENTRAL') THEN
    RAISE EXCEPTION 'Lokasi transfer tidak valid.';
  END IF;
  v_source := upper(p_source)::public.stock_location;
  v_target := upper(p_target)::public.stock_location;
  IF v_source=v_target THEN RAISE EXCEPTION 'Lokasi asal dan tujuan harus berbeda.'; END IF;
  IF COALESCE(p_qty,0)<=0 THEN RAISE EXCEPTION 'Kuantitas transfer harus lebih besar dari nol.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text),hashtext('transfer:'||p_request_key));

  -- Existing RPC updates material totals, WAC, and the paired ledger rows atomically.
  v_result := public.atomic_transfer_stock_location_wac(p_tenant_id,p_material_id,p_qty,p_source,p_target,p_date,p_notes,p_request_key,p_created_by);
  IF COALESCE((SELECT m.expiry_tracking_enabled FROM public.materials m WHERE m.id=p_material_id AND m.tenant_id=p_tenant_id),false)
     OR EXISTS(SELECT 1 FROM public.material_batches b WHERE b.tenant_id=p_tenant_id AND b.material_id=p_material_id AND lower(COALESCE(b.status,'active'))='active') THEN
    SELECT s.active_open_lot_id INTO v_active_lot FROM public.material_open_lot_state s
    WHERE s.tenant_id=p_tenant_id AND s.material_id=p_material_id AND s.location=v_source;
    SELECT s.active_open_lot_id INTO v_target_active_lot FROM public.material_open_lot_state s
    WHERE s.tenant_id=p_tenant_id AND s.material_id=p_material_id AND s.location=v_target;
    IF v_active_lot IS NOT NULL AND v_target_active_lot IS NOT NULL AND v_active_lot IS DISTINCT FROM v_target_active_lot THEN
      RAISE EXCEPTION 'Transfer ditolak: lokasi tujuan memiliki lot terbuka berbeda. Selesaikan BROKEN/lot aktif di lokasi tujuan sebelum transfer.';
    END IF;
    FOR v_batch IN
      SELECT b.id, CASE WHEN v_source='RESTO' THEN COALESCE(b.qty_resto,0) ELSE COALESCE(b.qty_central,0) END AS qty_here
      FROM public.material_batches b
      WHERE b.tenant_id=p_tenant_id AND b.material_id=p_material_id AND lower(COALESCE(b.status,'active'))='active'
        AND (CASE WHEN v_source='RESTO' THEN COALESCE(b.qty_resto,0) ELSE COALESCE(b.qty_central,0) END)>0
      ORDER BY (b.id=v_active_lot) DESC, COALESCE(b.expired_date,b.expiry_date) ASC NULLS LAST, b.created_at, b.id
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining<=0.0000001;
      v_take:=LEAST(v_batch.qty_here,v_remaining);
      IF v_source='RESTO' THEN
        UPDATE public.material_batches SET qty_resto=GREATEST(qty_resto-v_take,0),qty_central=COALESCE(qty_central,0)+v_take,updated_at=now() WHERE id=v_batch.id AND tenant_id=p_tenant_id;
      ELSE
        UPDATE public.material_batches SET qty_central=GREATEST(qty_central-v_take,0),qty_resto=COALESCE(qty_resto,0)+v_take,updated_at=now() WHERE id=v_batch.id AND tenant_id=p_tenant_id;
      END IF;
      v_remaining:=v_remaining-v_take;
    END LOOP;
    IF v_remaining>0.0001 THEN
      RAISE EXCEPTION 'Tidak cukup saldo lot yang sudah tercatat untuk transfer. Sisa %; rekonsiliasi lot sebelum transfer.',v_remaining;
    END IF;
    -- Move the active-lot pointer with the transfer so there is still at most one per location.
    IF v_active_lot IS NOT NULL THEN
      INSERT INTO public.material_open_lot_state (tenant_id,material_id,location,active_open_lot_id,opened_at,updated_at)
      VALUES (p_tenant_id,p_material_id,v_target,v_active_lot,now(),now())
      ON CONFLICT (tenant_id,material_id,location) DO UPDATE SET active_open_lot_id=EXCLUDED.active_open_lot_id,opened_at=now(),updated_at=now();
      IF NOT EXISTS (SELECT 1 FROM public.material_batches b WHERE b.id=v_active_lot AND b.tenant_id=p_tenant_id
        AND (CASE WHEN v_source='RESTO' THEN COALESCE(b.qty_resto,0) ELSE COALESCE(b.qty_central,0) END)>0) THEN
        UPDATE public.material_open_lot_state SET active_open_lot_id=NULL,opened_at=NULL,updated_at=now()
        WHERE tenant_id=p_tenant_id AND material_id=p_material_id AND location=v_source;
      END IF;
    END IF;
  END IF;
  RETURN v_result || jsonb_build_object('version',4,'lots_transferred',true);
END;
$function$;

REVOKE ALL ON FUNCTION public.daily_inventory_opening_v4(uuid,date,public.stock_location,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atomic_record_purchase_location_wac_v4(uuid,bigint,bigint,numeric,text,numeric,date,text,uuid,text,date,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atomic_save_daily_inventory_v4(uuid,date,text,jsonb,boolean,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_daily_inventory_session_v4(uuid,date,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atomic_transfer_stock_location_wac_v4(uuid,bigint,numeric,text,text,date,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atomic_record_purchase_location_wac_v4(uuid,bigint,bigint,numeric,text,numeric,date,text,uuid,text,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_save_daily_inventory_v4(uuid,date,text,jsonb,boolean,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_daily_inventory_session_v4(uuid,date,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_transfer_stock_location_wac_v4(uuid,bigint,numeric,text,text,date,text,text,uuid) TO authenticated;

COMMIT;
