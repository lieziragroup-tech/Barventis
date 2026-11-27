-- BARVENTIS v5: make supplementary IN editable in Daily Inventory without duplicating
-- Procurement receipts, and keep the retired Proses Produksi workflow out of the UI.
-- Run after the v3 and v4 migrations.

BEGIN;

ALTER TABLE public.daily_inventory_items
  ADD COLUMN IF NOT EXISTS manual_in_qty numeric(16,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.daily_inventory_items.manual_in_qty IS
  'Supplementary IN entered in Daily Inventory in the material stock unit. Procurement/purchase/transfer IN remains source-derived and is stored separately in in_qty.';

CREATE OR REPLACE FUNCTION public.save_daily_inventory_manual_in_v5(
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
  v_material public.materials%ROWTYPE;
  v_material_id bigint;
  v_manual_in numeric(16,4);
  v_existing_in numeric(16,4);
  v_delta numeric(16,4);
  v_current_qty numeric(16,4);
  v_unit_cost numeric(16,4);
  v_request_key text;
  v_result jsonb;
  v_header_id bigint;
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

  -- Manual IN is posted only as part of a successful EOD close. Draft saves only
  -- retain the desired amount on daily_inventory_items and never mutate stock.
  IF p_is_closing THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY (value->>'material_id')::bigint LOOP
      v_material_id := NULLIF(v_item->>'material_id','')::bigint;
      IF v_material_id IS NULL THEN RAISE EXCEPTION 'Setiap baris wajib memiliki material_id.'; END IF;
      SELECT * INTO v_material FROM public.materials m
      WHERE m.id=v_material_id AND m.tenant_id=p_tenant_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Material % tidak ditemukan pada tenant ini.',v_material_id; END IF;

      v_manual_in := COALESCE(NULLIF(v_item->>'manual_in_qty','')::numeric,0);
      IF v_manual_in < 0 THEN RAISE EXCEPTION 'IN tambahan tidak boleh negatif untuk material %.',v_material.name; END IF;
      IF COALESCE(v_material.expiry_tracking_enabled,false) AND v_manual_in > 0 THEN
        RAISE EXCEPTION 'IN untuk % harus dicatat melalui Pembelian/Penerimaan karena material ini memakai pelacakan lot dan expired date.',v_material.name;
      END IF;

      v_request_key := 'daily-manual-in:' || p_date::text || ':' || v_location::text || ':' || v_material_id::text;
      SELECT COALESCE(t.qty,0) INTO v_existing_in
      FROM public.transactions t
      WHERE t.tenant_id=p_tenant_id AND t.idempotency_key=v_request_key AND COALESCE(t.is_reversed,false)=false
      FOR UPDATE;
      IF NOT FOUND THEN v_existing_in := 0; END IF;
      v_delta := v_manual_in - v_existing_in;

      IF abs(v_delta) > 0.0001 THEN
        SELECT mlc.average_unit_cost INTO v_unit_cost
        FROM public.material_location_costs mlc
        WHERE mlc.tenant_id=p_tenant_id AND mlc.material_id=v_material_id AND mlc.location=v_location;
        v_unit_cost := GREATEST(COALESCE(v_unit_cost,v_material.avg_cost,v_material.new_price,v_material.price,0),0);

        IF v_manual_in > 0 THEN
          INSERT INTO public.transactions (
            tenant_id,date,material_id,type,location,qty,amount,notes,created_by,
            unit_cost_snapshot,source_module,source_record_id,idempotency_key,is_reversed
          ) VALUES (
            p_tenant_id,p_date,v_material_id,'IN',v_location,v_manual_in,v_manual_in*v_unit_cost,
            'IN tambahan Daily Inventory [' || p_date::text || '] ' || COALESCE(v_material.name,v_material_id::text),
            v_user_id,v_unit_cost,'daily_inventory_manual_in',p_date::text || ':' || v_location::text || ':' || v_material_id::text,
            v_request_key,false
          )
          ON CONFLICT (tenant_id,idempotency_key) DO UPDATE SET
            date=EXCLUDED.date,qty=EXCLUDED.qty,amount=EXCLUDED.amount,notes=EXCLUDED.notes,
            created_by=EXCLUDED.created_by,unit_cost_snapshot=EXCLUDED.unit_cost_snapshot,
            source_module=EXCLUDED.source_module,source_record_id=EXCLUDED.source_record_id,
            is_reversed=false,updated_at=now();
        ELSE
          UPDATE public.transactions SET is_reversed=true,updated_at=now(),
            notes=COALESCE(notes,'') || ' [IN tambahan dinolkan saat closing ulang]'
          WHERE tenant_id=p_tenant_id AND idempotency_key=v_request_key AND COALESCE(is_reversed,false)=false;
        END IF;

        v_current_qty := CASE WHEN v_location='RESTO' THEN COALESCE(v_material.qty_resto,0) ELSE COALESCE(v_material.qty_central,0) END;
        IF v_current_qty + v_delta < -0.0001 THEN
          RAISE EXCEPTION 'IN tambahan untuk % mengurangi saldo di bawah nol. Periksa saldo master sebelum closing.',v_material.name;
        END IF;
        IF v_location='RESTO' THEN
          UPDATE public.materials SET qty_resto=GREATEST(qty_resto+v_delta,0),updated_at=now()
          WHERE id=v_material_id AND tenant_id=p_tenant_id;
        ELSE
          UPDATE public.materials SET qty_central=GREATEST(qty_central+v_delta,0),updated_at=now()
          WHERE id=v_material_id AND tenant_id=p_tenant_id;
        END IF;
      ELSIF v_manual_in = 0 THEN
        -- Keep a previous idempotent row inactive when the desired manual IN is zero.
        UPDATE public.transactions SET is_reversed=true,updated_at=now()
        WHERE tenant_id=p_tenant_id AND idempotency_key=v_request_key AND COALESCE(is_reversed,false)=false;
      END IF;
    END LOOP;
  END IF;

  -- The v4 function performs the authoritative opening/closing calculations,
  -- lot checks, OUT posting, adjustments, locking, and audit within this transaction.
  v_result := public.atomic_save_daily_inventory_v4(p_tenant_id,p_date,p_location,p_items,p_is_closing,v_user_id);
  v_header_id := NULLIF(v_result->>'inventory_id','')::bigint;
  IF v_header_id IS NULL THEN RAISE EXCEPTION 'Daily Inventory tidak mengembalikan ID sesi setelah disimpan.'; END IF;

  UPDATE public.daily_inventory_items i
  SET manual_in_qty=COALESCE(NULLIF(x.value->>'manual_in_qty','')::numeric,0)
  FROM jsonb_array_elements(p_items) x
  WHERE i.inventory_id=v_header_id
    AND i.material_id=(x.value->>'material_id')::bigint;

  RETURN v_result || jsonb_build_object('version',5,'manual_in_saved',true,'manual_in_posted',p_is_closing);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_daily_inventory_manual_in_v5(uuid,date,text,jsonb,boolean,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_daily_inventory_manual_in_v5(uuid,date,text,jsonb,boolean,uuid) TO authenticated;

COMMIT;
