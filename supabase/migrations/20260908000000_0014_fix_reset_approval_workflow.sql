-- Migration 0014: Perbaikan alur approval reset data tenant
--
-- Root cause bug yang diperbaiki:
-- 1. approve_tenant_reset() bisa gagal di tengah proses DELETE karena ada
--    tabel anak yang belum dibersihkan (transactions_recalc_audit,
--    recipe_versions, referensi ke materials/recipes lain), dan Postgres
--    otomatis ROLLBACK SELURUH transaksi begitu exception tidak tertangkap.
--    Akibatnya request tersangkut selamanya di status PENDING, dan tombol
--    "Ajukan Reset" milik owner terkunci permanen.
-- 2. approve_tenant_reset() dideklarasikan RETURNS void, padahal frontend
--    (SuperAdminPanel.jsx) mengharapkan JSON {status, result, error}.
--    Akibatnya approval yang sukses pun ditampilkan sebagai gagal.
-- 3. request_tenant_reset() tidak punya guard server-side terhadap
--    duplikat request pending (selama ini hanya dicegah di client).
-- 4. Tidak ada RLS policy untuk tenant_reset_requests di migration manapun.
-- 5. Owner tidak punya cara membatalkan reset request miliknya sendiri
--    kalau ternyata butuh diajukan ulang dengan opsi berbeda.

-- ---------------------------------------------------------------------
-- 1. Tambah value 'FAILED' ke enum status (idempotent, aman dijalankan
--    berkali-kali). Statement top-level terpisah dari transaksi lain
--    supaya tidak kena batasan "unsafe use of new enum value".
-- ---------------------------------------------------------------------
ALTER TYPE reset_request_status ADD VALUE IF NOT EXISTS 'FAILED';

-- ---------------------------------------------------------------------
-- 2. Kolom baru untuk audit trail yang jelas: ringkasan hasil sukses,
--    dan pesan error asli kalau gagal (dibaca SuperAdminPanel.jsx).
-- ---------------------------------------------------------------------
ALTER TABLE public.tenant_reset_requests
  ADD COLUMN IF NOT EXISTS result_summary jsonb,
  ADD COLUMN IF NOT EXISTS error_message text;

-- ---------------------------------------------------------------------
-- 3. RLS: tabel ini sebelumnya tidak punya policy sama sekali di migration
--    manapun. Tanpa ini, tergantung setting RLS server, request tenant lain
--    berpotensi terlihat/tidak terlihat sama sekali oleh owner.
-- ---------------------------------------------------------------------
ALTER TABLE public.tenant_reset_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select" ON public.tenant_reset_requests;
CREATE POLICY "tenant_select" ON public.tenant_reset_requests
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "superadmin_full_access" ON public.tenant_reset_requests;
CREATE POLICY "superadmin_full_access" ON public.tenant_reset_requests
  FOR ALL USING ((SELECT role::text FROM public.users WHERE id = auth.uid()) = 'SuperAdmin');

-- ---------------------------------------------------------------------
-- 4. request_tenant_reset: tambah guard server-side, jangan andalkan
--    client saja untuk mencegah duplikat pending.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_tenant_reset(
  p_tenant_id uuid,
  p_reset_pos boolean,
  p_reset_stock_history boolean,
  p_reset_purchasing boolean,
  p_reset_recipes boolean,
  p_reset_materials boolean
) RETURNS uuid AS $$
DECLARE
  v_request_id uuid;
  v_user_id uuid;
  v_existing_pending integer;
BEGIN
  v_user_id := auth.uid();

  SELECT count(*) INTO v_existing_pending
  FROM public.tenant_reset_requests
  WHERE tenant_id = p_tenant_id AND status = 'PENDING';

  IF v_existing_pending > 0 THEN
    RAISE EXCEPTION 'Masih ada permintaan reset yang menunggu persetujuan Super Admin. Batalkan permintaan itu dulu, atau tunggu sampai diproses.';
  END IF;

  INSERT INTO public.tenant_reset_requests (
    tenant_id, requested_by, reset_pos, reset_stock_history, reset_purchasing,
    reset_recipes, reset_materials, status
  ) VALUES (
    p_tenant_id, v_user_id, p_reset_pos, p_reset_stock_history, p_reset_purchasing,
    p_reset_recipes, p_reset_materials, 'PENDING'
  ) RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------
-- 5. cancel_tenant_reset_request: owner bisa membatalkan permintaan
--    miliknya sendiri yang masih PENDING, tanpa harus menunggu SuperAdmin.
--    Ini jaring pengaman kalau approval sisi SuperAdmin lagi bermasalah.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_tenant_reset_request(
  p_request_id uuid
) RETURNS void AS $$
DECLARE
  v_user_id uuid;
  v_req record;
BEGIN
  v_user_id := auth.uid();

  SELECT * INTO v_req FROM public.tenant_reset_requests WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request tidak ditemukan';
  END IF;

  IF v_req.requested_by != v_user_id THEN
    RAISE EXCEPTION 'AUTH: Anda hanya bisa membatalkan permintaan yang Anda ajukan sendiri';
  END IF;

  IF v_req.status != 'PENDING' THEN
    RAISE EXCEPTION 'Permintaan ini sudah diproses (Status: %), tidak bisa dibatalkan', v_req.status;
  END IF;

  UPDATE public.tenant_reset_requests
  SET status = 'REJECTED',
      notes = COALESCE(notes || ' ', '') || '[Dibatalkan oleh pengaju]',
      approved_at = now()
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------
-- 6. approve_tenant_reset: bersihkan tabel anak yang selama ini terlewat,
--    dan bungkus proses hapus dengan EXCEPTION handler supaya kegagalan
--    apa pun tidak lagi meninggalkan request macet di PENDING selamanya.
--    RETURN jsonb sesuai kontrak yang sudah diasumsikan SuperAdminPanel.jsx.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.approve_tenant_reset(uuid, boolean, text);

CREATE FUNCTION public.approve_tenant_reset(
  p_request_id uuid,
  p_approve boolean,
  p_rejection_reason text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_req record;
  v_user_id uuid;
  v_role text;
  v_counts jsonb := '{}'::jsonb;
  v_n bigint;
BEGIN
  v_user_id := auth.uid();

  SELECT role::text INTO v_role FROM public.users WHERE id = v_user_id;
  IF v_role != 'SuperAdmin' THEN
    RAISE EXCEPTION 'AUTH: Hanya SuperAdmin yang dapat menyetujui reset data';
  END IF;

  SELECT * INTO v_req FROM public.tenant_reset_requests WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request tidak ditemukan';
  END IF;

  IF v_req.status != 'PENDING' THEN
    RAISE EXCEPTION 'Request sudah diproses sebelumnya (Status: %)', v_req.status;
  END IF;

  IF p_approve = false THEN
    UPDATE public.tenant_reset_requests
    SET status = 'REJECTED', notes = p_rejection_reason, approved_by = v_user_id, approved_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('status', 'rejected');
  END IF;

  -- Blok destruktif: dibungkus EXCEPTION supaya error apa pun (FK violation,
  -- dsb) tertangkap di sini, request ditandai FAILED dengan pesan yang jelas,
  -- dan TIDAK membiarkan request tersangkut di PENDING selamanya.
  BEGIN
    -- (a) transactions_recalc_audit harus bersih sebelum baris transactions
    --     yang direferensikannya dihapus, di skenario manapun.
    IF v_req.reset_stock_history OR v_req.reset_purchasing OR v_req.reset_pos OR v_req.reset_materials THEN
      DELETE FROM public.transactions_recalc_audit
      WHERE transaction_id IN (SELECT id FROM public.transactions WHERE tenant_id = v_req.tenant_id);
    END IF;

    IF v_req.reset_pos THEN
      DELETE FROM public.pos_transaction_items WHERE tenant_id = v_req.tenant_id;
      DELETE FROM public.pos_transactions WHERE tenant_id = v_req.tenant_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('pos_transactions', v_n);
      DELETE FROM public.pos_order_items WHERE tenant_id = v_req.tenant_id;
      DELETE FROM public.pos_orders WHERE tenant_id = v_req.tenant_id;
      DELETE FROM public.pos_upload_logs WHERE tenant_id = v_req.tenant_id;
      DELETE FROM public.pos_daily_aggregates WHERE tenant_id = v_req.tenant_id;
    END IF;

    IF v_req.reset_stock_history THEN
      DELETE FROM public.physical_check_items WHERE tenant_id = v_req.tenant_id;
      DELETE FROM public.physical_checks WHERE tenant_id = v_req.tenant_id;
      DELETE FROM public.stock_opname_items WHERE tenant_id = v_req.tenant_id;
      DELETE FROM public.stock_opnames WHERE tenant_id = v_req.tenant_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('stock_opnames', v_n);
      DELETE FROM public.daily_inventory_items WHERE tenant_id = v_req.tenant_id;
      DELETE FROM public.daily_inventories WHERE tenant_id = v_req.tenant_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('daily_inventories', v_n);
      DELETE FROM public.usage_variance WHERE tenant_id = v_req.tenant_id;
      DELETE FROM public.generated_so_reports WHERE tenant_id = v_req.tenant_id;
    END IF;

    IF v_req.reset_purchasing THEN
      DELETE FROM public.purchase_entries WHERE tenant_id = v_req.tenant_id;
      DELETE FROM public.invoice_items WHERE tenant_id = v_req.tenant_id;
      DELETE FROM public.invoices WHERE tenant_id = v_req.tenant_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('invoices', v_n);
    END IF;

    -- Transactions adalah ledger gabungan POS Deduction, Purchase, Opname
    -- Adjustment. Direset kalau salah satu dari purchasing/stock/pos/materials
    -- direset (materials ikut ditambahkan: kalau bahan bakunya dihapus,
    -- transaksi yang mereferensikan bahan itu juga wajib ikut dibersihkan,
    -- kalau tidak DELETE FROM materials akan gagal FK).
    IF v_req.reset_stock_history OR v_req.reset_purchasing OR v_req.reset_pos OR v_req.reset_materials THEN
      DELETE FROM public.transactions WHERE tenant_id = v_req.tenant_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('transactions', v_n);
    END IF;

    IF v_req.reset_recipes THEN
      -- Bersihkan referensi recipe_id di tabel lain dulu -- kalau reset_pos
      -- TIDAK dicentang, baris-baris ini masih ada dan akan memblokir
      -- DELETE FROM recipes.
      DELETE FROM public.pos_transaction_items
        WHERE tenant_id = v_req.tenant_id
          AND recipe_id IN (SELECT id FROM public.recipes WHERE tenant_id = v_req.tenant_id);
      DELETE FROM public.pos_order_items
        WHERE tenant_id = v_req.tenant_id
          AND recipe_id IN (SELECT id FROM public.recipes WHERE tenant_id = v_req.tenant_id);
      DELETE FROM public.recipe_versions
        WHERE recipe_id IN (SELECT id FROM public.recipes WHERE tenant_id = v_req.tenant_id);
      DELETE FROM public.recipe_ingredients WHERE tenant_id = v_req.tenant_id;
      DELETE FROM public.recipes WHERE tenant_id = v_req.tenant_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('recipes', v_n);
    END IF;

    IF v_req.reset_materials THEN
      -- Bersihkan semua tabel anak yang mereferensikan materials.id dulu --
      -- sebelumnya cuma sebagian yang dibersihkan, sehingga kalau owner
      -- mencentang "Master Bahan Baku" saja (tanpa Recipes/Stock/Purchasing),
      -- DELETE FROM materials selalu gagal FK.
      DELETE FROM public.recipe_ingredients
        WHERE tenant_id = v_req.tenant_id
          AND material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_req.tenant_id);
      DELETE FROM public.stock_opname_items
        WHERE tenant_id = v_req.tenant_id
          AND material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_req.tenant_id);
      DELETE FROM public.physical_check_items
        WHERE tenant_id = v_req.tenant_id
          AND material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_req.tenant_id);
      DELETE FROM public.daily_inventory_items
        WHERE tenant_id = v_req.tenant_id
          AND material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_req.tenant_id);
      DELETE FROM public.production_batch_ingredients
        WHERE material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_req.tenant_id);
      DELETE FROM public.material_price_history
        WHERE material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_req.tenant_id);
      DELETE FROM public.unit_conversions WHERE tenant_id = v_req.tenant_id;
      DELETE FROM public.expected_usage WHERE tenant_id = v_req.tenant_id;
      DELETE FROM public.asset_items WHERE tenant_id = v_req.tenant_id; -- opsional, biasa nempel ke material
      DELETE FROM public.materials WHERE tenant_id = v_req.tenant_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('materials', v_n);
      DELETE FROM public.suppliers WHERE tenant_id = v_req.tenant_id;
    END IF;

    UPDATE public.tenant_reset_requests
    SET status = 'APPROVED', approved_by = v_user_id, approved_at = now(), result_summary = v_counts
    WHERE id = p_request_id;

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.tenant_reset_requests
    SET status = 'FAILED', error_message = SQLERRM, approved_by = v_user_id, approved_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('status', 'failed', 'error', SQLERRM);
  END;

  RETURN jsonb_build_object('status', 'executed', 'result', v_counts);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
