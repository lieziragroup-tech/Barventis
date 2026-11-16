BEGIN;

-- =====================================================================================
-- BARVENTIS PRODUCTION & RBAC SEEDER — UMATIS RESTO & VENUE (AGUSTUS 2026 FULL DATA)
-- =====================================================================================
-- 1. Mempertahankan 100% Akun Login, Profil User, Tenant, Cabang (BSD & Kasuna), dan RBAC/RLS
-- 2. Menghapus seluruh data operasional demo secara urut dari Child ke Parent (termasuk waste_logs
--    sebelum production_trimming_batches & materials) + Dynamic Foreign Key Sweeper (Bebas Error 23503)
-- 3. Mengisi penuh 30 Supplier Kanonik (+ alias), 142 Material (Stok Aktif = Stok Akhir 31 Agustus 2026),
--    dan 68 Resep Menu Umatis (59 Menu Komersial + 9 Menu RTD Beer)
-- 4. Mencatat 100% Histori Agustus 2026 (Stok Awal 1 Agu, 84 Pembelian Agustus,
--    Pemakaian Agustus, Stock Opname Akhir 31 Agu Resto & Central, serta Rekap EOD 31 Agu 2026)
-- =====================================================================================

DO $bv_fn_wrap$
DECLARE
  v_ddl text := $bv_fn_ddl$
CREATE OR REPLACE FUNCTION public.seed_beta_testing_dummy_data_v13()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
  v_bsd_id UUID;
  v_kasuna_id UUID;
  v_owner_uid UUID;
  v_acc RECORD;
  v_fk_rec RECORD;
  v_uid UUID;
  v_di_id BIGINT;
  v_opname_resto_id BIGINT;
  v_opname_central_id BIGINT;
  v_rec_id BIGINT;
  v_mat_id BIGINT;
  v_sup_id BIGINT;
BEGIN
  -- 1. Pastikan Tenant Resto Umatis aktif (Pertahankan tenant yang sudah ada)
  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE lower(COALESCE(company_name, '')) LIKE '%umatis%'
     OR lower(COALESCE(name, '')) LIKE '%umatis%'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id FROM public.tenants ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    INSERT INTO public.tenants (name, company_name, status, is_pos_enabled, overhead_pct, pos_tax_rate, pos_service_charge)
    VALUES ('restoumatis', 'Resto Umatis', 'active', true, 0.05, 10, 5)
    RETURNING id INTO v_tenant_id;
  ELSE
    UPDATE public.tenants
    SET company_name = 'Resto Umatis',
        status = 'active',
        is_pos_enabled = true,
        overhead_pct = COALESCE(overhead_pct, 0.05),
        pos_tax_rate = COALESCE(pos_tax_rate, 10),
        pos_service_charge = COALESCE(pos_service_charge, 5)
    WHERE id = v_tenant_id;
  END IF;

  -- 2. Pastikan Cabang BSD & Kasuna tersedia
  SELECT id INTO v_bsd_id
  FROM public.branches
  WHERE tenant_id = v_tenant_id AND upper(trim(COALESCE(code, ''))) = 'BSD'
  LIMIT 1;

  IF v_bsd_id IS NULL THEN
    INSERT INTO public.branches (tenant_id, code, name, address, is_central, is_active)
    VALUES (v_tenant_id, 'BSD', 'BSD', 'BSD City, Tangerang Selatan', false, true)
    RETURNING id INTO v_bsd_id;
  ELSE
    UPDATE public.branches SET name = 'BSD', is_active = true WHERE id = v_bsd_id;
  END IF;

  SELECT id INTO v_kasuna_id
  FROM public.branches
  WHERE tenant_id = v_tenant_id AND upper(trim(COALESCE(code, ''))) = 'KASUNA'
  LIMIT 1;

  IF v_kasuna_id IS NULL THEN
    INSERT INTO public.branches (tenant_id, code, name, address, is_central, is_active)
    VALUES (v_tenant_id, 'KASUNA', 'Kasuna', 'Cabang Kasuna, Tangerang Selatan', false, true)
    RETURNING id INTO v_kasuna_id;
  ELSE
    UPDATE public.branches SET name = 'Kasuna', is_active = true WHERE id = v_kasuna_id;
  END IF;

  -- 3. Pertahankan & Pastikan 7 Akun Login Pengecekan Role & RBAC/RLS Tetap Aktif
  FOR v_acc IN
    SELECT * FROM (VALUES
      ('a0000000-be7a-4000-8000-000000000001'::uuid, 'owner.beta@umatis.id',      'Owner Resto Umatis (Beta)',       'Owner'::public.user_role,      v_bsd_id),
      ('a0000000-be7a-4000-8000-000000000002'::uuid, 'barista.bsd@umatis.id',     'Barista Cabang BSD (Beta)',       'Bar'::public.user_role,        v_bsd_id),
      ('a0000000-be7a-4000-8000-000000000003'::uuid, 'barista.kasuna@umatis.id',  'Barista Cabang Kasuna (Beta)',    'Bar'::public.user_role,        v_kasuna_id),
      ('a0000000-be7a-4000-8000-000000000006'::uuid, 'kitchen.bsd@umatis.id',     'Chef Kitchen BSD (Beta)',         'Kitchen'::public.user_role,    v_bsd_id),
      ('a0000000-be7a-4000-8000-000000000007'::uuid, 'service.bsd@umatis.id',     'Staf Service & Floor BSD (Beta)', 'Service'::public.user_role,    v_bsd_id),
      ('a0000000-be7a-4000-8000-000000000004'::uuid, 'purchasing.bsd@umatis.id',  'Purchasing & Central (Beta)',     'Purchasing'::public.user_role, v_bsd_id),
      ('a0000000-be7a-4000-8000-000000000005'::uuid, 'kasir.bsd@umatis.id',       'Kasir POS ESB (Beta)',            'Kasir'::public.user_role,      v_bsd_id)
    ) AS t(default_uid, email, full_name, user_role_val, target_branch)
  LOOP
    BEGIN
      SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(v_acc.email) LIMIT 1;
      IF v_uid IS NULL THEN
        v_uid := v_acc.default_uid;
        INSERT INTO auth.users (
          instance_id, id, aud, role, email, encrypted_password,
          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
          created_at, updated_at, confirmation_token, email_change,
          email_change_token_new, recovery_token
        ) VALUES (
          '00000000-0000-0000-0000-000000000000',
          v_uid,
          'authenticated',
          'authenticated',
          v_acc.email,
          crypt('BetaUmatis2026!', gen_salt('bf')),
          now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('name', v_acc.full_name, 'role', v_acc.user_role_val::text, 'company_name', 'Resto Umatis'),
          now(),
          now(),
          '', '', '', ''
        );
      ELSE
        UPDATE auth.users
        SET encrypted_password = crypt('BetaUmatis2026!', gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            confirmation_token = COALESCE(confirmation_token, ''),
            recovery_token = COALESCE(recovery_token, ''),
            email_change_token_new = COALESCE(email_change_token_new, ''),
            email_change = COALESCE(email_change, ''),
            updated_at = now()
        WHERE id = v_uid;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM auth.identities WHERE user_id = v_uid AND provider = 'email'
      ) THEN
        BEGIN
          INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
          ) VALUES (
            gen_random_uuid(),
            v_uid,
            jsonb_build_object('sub', v_uid::text, 'email', v_acc.email, 'email_verified', true, 'phone_verified', false),
            'email',
            v_uid::text,
            now(),
            now(),
            now()
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;

      DELETE FROM public.users WHERE lower(email) = lower(v_acc.email) AND id <> v_uid;

      INSERT INTO public.users (id, tenant_id, branch_id, name, email, role, created_at, updated_at)
      VALUES (v_uid, v_tenant_id, v_acc.target_branch, v_acc.full_name, v_acc.email, v_acc.user_role_val, now(), now())
      ON CONFLICT (id) DO UPDATE
      SET tenant_id = EXCLUDED.tenant_id,
          branch_id = EXCLUDED.branch_id,
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          role = EXCLUDED.role,
          updated_at = now();
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Lewati pembuatan auth.users untuk %: %', v_acc.email, SQLERRM;
    END;
  END LOOP;

  SELECT id INTO v_owner_uid FROM public.users WHERE tenant_id = v_tenant_id ORDER BY created_at ASC LIMIT 1;

  -- ===================================================================================
  -- 4. HAPUS SELURUH DATA OPERASIONAL DEMO DARI CHILD KE PARENT (BEBAS ERROR FK 23503)
  --    (Sama sekali TIDAK menyentuh auth.users, public.users, tenants, branches, RBAC)
  -- ===================================================================================
  PERFORM set_config('bv2.allow_unlock', 'on', true);

  -- Nonaktifkan sementara trigger guard pada inter_branch_transfer_items saat pembersihan
  BEGIN
    ALTER TABLE public.inter_branch_transfer_items DISABLE TRIGGER bv2_transfer_items_guard;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 4A. Hapus waste_logs terlebih dahulu (karena mereferensi production_trimming_batches & materials dengan ON DELETE RESTRICT)
  IF to_regclass('public.waste_logs') IS NOT NULL THEN
    BEGIN
      DELETE FROM public.waste_logs
      WHERE tenant_id = v_tenant_id
         OR trimming_batch_id IN (SELECT id FROM public.production_trimming_batches WHERE tenant_id = v_tenant_id)
         OR material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
    EXCEPTION WHEN OTHERS THEN
      DELETE FROM public.waste_logs WHERE tenant_id = v_tenant_id;
    END;
  END IF;

  -- 4B. Hapus production_trimming_batches setelah waste_logs bersih
  IF to_regclass('public.production_trimming_batches') IS NOT NULL THEN
    DELETE FROM public.production_trimming_batches
    WHERE tenant_id = v_tenant_id
       OR material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
  END IF;

  -- 4C. Hapus tabel produksi batch & run
  IF to_regclass('public.production_run_items') IS NOT NULL THEN
    DELETE FROM public.production_run_items
    WHERE tenant_id = v_tenant_id
       OR run_id IN (SELECT id FROM public.production_runs WHERE tenant_id = v_tenant_id)
       OR material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
  END IF;

  IF to_regclass('public.production_runs') IS NOT NULL THEN
    DELETE FROM public.production_runs
    WHERE tenant_id = v_tenant_id
       OR production_batch_id IN (SELECT id FROM public.production_batches WHERE tenant_id = v_tenant_id)
       OR output_material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
  END IF;

  IF to_regclass('public.production_batch_ingredients') IS NOT NULL THEN
    DELETE FROM public.production_batch_ingredients
    WHERE tenant_id = v_tenant_id
       OR batch_id IN (SELECT id FROM public.production_batches WHERE tenant_id = v_tenant_id)
       OR material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
  END IF;

  IF to_regclass('public.production_batches') IS NOT NULL THEN
    DELETE FROM public.production_batches
    WHERE tenant_id = v_tenant_id
       OR output_material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
  END IF;

  -- 4D. Hapus FEFO lot movements, open lot state, daily_inventory_items, daily_inventories, dan material_batches
  IF to_regclass('public.material_lot_movements_v4') IS NOT NULL THEN
    DELETE FROM public.material_lot_movements_v4
    WHERE tenant_id = v_tenant_id
       OR batch_id IN (SELECT id FROM public.material_batches WHERE tenant_id = v_tenant_id)
       OR material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
  END IF;

  IF to_regclass('public.material_open_lot_state') IS NOT NULL THEN
    DELETE FROM public.material_open_lot_state
    WHERE tenant_id = v_tenant_id
       OR active_open_lot_id IN (SELECT id FROM public.material_batches WHERE tenant_id = v_tenant_id)
       OR material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
  END IF;

  IF to_regclass('public.daily_inventory_items') IS NOT NULL THEN
    DELETE FROM public.daily_inventory_items
    WHERE tenant_id = v_tenant_id
       OR inventory_id IN (SELECT id FROM public.daily_inventories WHERE tenant_id = v_tenant_id)
       OR material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
  END IF;

  IF to_regclass('public.daily_inventories') IS NOT NULL THEN
    DELETE FROM public.daily_inventories WHERE tenant_id = v_tenant_id;
  END IF;

  IF to_regclass('public.material_batches') IS NOT NULL THEN
    DELETE FROM public.material_batches
    WHERE tenant_id = v_tenant_id
       OR material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
  END IF;

  IF to_regclass('public.daily_stock_counts') IS NOT NULL THEN
    DELETE FROM public.daily_stock_counts
    WHERE tenant_id = v_tenant_id
       OR material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
  END IF;

  -- 4E. Hapus inter_branch_transfer_items & inter_branch_transfers
  IF to_regclass('public.inter_branch_transfer_items') IS NOT NULL THEN
    DELETE FROM public.inter_branch_transfer_items
    WHERE tenant_id = v_tenant_id
       OR transfer_id IN (SELECT id FROM public.inter_branch_transfers WHERE tenant_id = v_tenant_id)
       OR material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
  END IF;

  IF to_regclass('public.inter_branch_transfers') IS NOT NULL THEN
    DELETE FROM public.inter_branch_transfers WHERE tenant_id = v_tenant_id;
  END IF;

  BEGIN
    ALTER TABLE public.inter_branch_transfer_items ENABLE TRIGGER bv2_transfer_items_guard;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 4F. Hapus tabel pendukung (adjustments, variance, market_lists, invoices, physical_checks, POS)
  IF to_regclass('public.stock_adjustments') IS NOT NULL THEN
    DELETE FROM public.stock_adjustments
    WHERE tenant_id = v_tenant_id
       OR material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
  END IF;

  IF to_regclass('public.usage_variance') IS NOT NULL THEN
    DELETE FROM public.usage_variance WHERE tenant_id = v_tenant_id;
  END IF;

  IF to_regclass('public.expected_usage') IS NOT NULL THEN
    DELETE FROM public.expected_usage
    WHERE tenant_id = v_tenant_id
       OR material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
  END IF;

  IF to_regclass('public.generated_so_reports') IS NOT NULL THEN
    DELETE FROM public.generated_so_reports WHERE tenant_id = v_tenant_id;
  END IF;

  IF to_regclass('public.market_list_items') IS NOT NULL THEN
    BEGIN
      DELETE FROM public.market_list_items WHERE tenant_id = v_tenant_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF to_regclass('public.market_lists') IS NOT NULL THEN
    DELETE FROM public.market_lists WHERE tenant_id = v_tenant_id;
  END IF;

  IF to_regclass('public.invoice_items') IS NOT NULL THEN
    BEGIN
      DELETE FROM public.invoice_items WHERE tenant_id = v_tenant_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF to_regclass('public.invoices') IS NOT NULL THEN
    DELETE FROM public.invoices WHERE tenant_id = v_tenant_id;
  END IF;

  IF to_regclass('public.physical_check_items') IS NOT NULL THEN
    BEGIN
      DELETE FROM public.physical_check_items WHERE tenant_id = v_tenant_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF to_regclass('public.physical_checks') IS NOT NULL THEN
    DELETE FROM public.physical_checks WHERE tenant_id = v_tenant_id;
  END IF;

  IF to_regclass('public.pos_order_items') IS NOT NULL THEN
    BEGIN
      DELETE FROM public.pos_order_items
      WHERE order_id IN (SELECT id FROM public.pos_orders WHERE tenant_id = v_tenant_id)
         OR recipe_id IN (SELECT id FROM public.recipes WHERE tenant_id = v_tenant_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF to_regclass('public.pos_orders') IS NOT NULL THEN
    DELETE FROM public.pos_orders WHERE tenant_id = v_tenant_id;
  END IF;

  IF to_regclass('public.pos_transaction_items') IS NOT NULL THEN
    DELETE FROM public.pos_transaction_items
    WHERE tenant_id = v_tenant_id
       OR transaction_id IN (SELECT id FROM public.pos_transactions WHERE tenant_id = v_tenant_id)
       OR recipe_id IN (SELECT id FROM public.recipes WHERE tenant_id = v_tenant_id);
  END IF;

  IF to_regclass('public.pos_transactions') IS NOT NULL THEN
    DELETE FROM public.pos_transactions WHERE tenant_id = v_tenant_id;
  END IF;

  IF to_regclass('public.pos_daily_aggregates') IS NOT NULL THEN
    DELETE FROM public.pos_daily_aggregates WHERE tenant_id = v_tenant_id;
  END IF;

  -- 4G. Hapus resep, opname, purchase_entries, transactions, harga & konversi
  IF to_regclass('public.recipe_versions') IS NOT NULL THEN
    BEGIN
      DELETE FROM public.recipe_versions
      WHERE recipe_id IN (SELECT id FROM public.recipes WHERE tenant_id = v_tenant_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF to_regclass('public.recipe_ingredients') IS NOT NULL THEN
    DELETE FROM public.recipe_ingredients
    WHERE tenant_id = v_tenant_id
       OR recipe_id IN (SELECT id FROM public.recipes WHERE tenant_id = v_tenant_id)
       OR material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
  END IF;

  IF to_regclass('public.recipes') IS NOT NULL THEN
    DELETE FROM public.recipes WHERE tenant_id = v_tenant_id;
  END IF;

  IF to_regclass('public.stock_opname_items') IS NOT NULL THEN
    DELETE FROM public.stock_opname_items
    WHERE tenant_id = v_tenant_id
       OR opname_id IN (SELECT id FROM public.stock_opnames WHERE tenant_id = v_tenant_id)
       OR material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
  END IF;

  IF to_regclass('public.stock_opnames') IS NOT NULL THEN
    DELETE FROM public.stock_opnames WHERE tenant_id = v_tenant_id;
  END IF;

  IF to_regclass('public.purchase_entries') IS NOT NULL THEN
    DELETE FROM public.purchase_entries
    WHERE tenant_id = v_tenant_id
       OR material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id)
       OR supplier_id IN (SELECT id FROM public.suppliers WHERE tenant_id = v_tenant_id);
  END IF;

  IF to_regclass('public.transactions') IS NOT NULL THEN
    DELETE FROM public.transactions
    WHERE tenant_id = v_tenant_id
       OR material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
  END IF;

  IF to_regclass('public.material_price_history') IS NOT NULL THEN
    BEGIN
      DELETE FROM public.material_price_history
      WHERE material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF to_regclass('public.material_location_costs') IS NOT NULL THEN
    DELETE FROM public.material_location_costs
    WHERE tenant_id = v_tenant_id
       OR material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
  END IF;

  IF to_regclass('public.unit_conversions') IS NOT NULL THEN
    DELETE FROM public.unit_conversions
    WHERE tenant_id = v_tenant_id
       OR material_id IN (SELECT id FROM public.materials WHERE tenant_id = v_tenant_id);
  END IF;

  -- 4H. Dynamic Foreign Key Safety Net: Sapu bersih baris tersisa di tabel child mana pun yang masih mereferensi materials / suppliers / recipes
  FOR v_fk_rec IN
    SELECT
      c.conrelid::regclass::text AS child_table,
      a.attname AS child_col,
      c.confrelid::regclass::text AS parent_table
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.confrelid IN (
        to_regclass('public.production_trimming_batches'),
        to_regclass('public.material_batches'),
        to_regclass('public.recipes'),
        to_regclass('public.materials'),
        to_regclass('public.suppliers')
      )
      AND c.conrelid NOT IN (
        to_regclass('public.users'),
        to_regclass('public.tenants'),
        to_regclass('public.branches'),
        to_regclass('public.materials')
      )
  LOOP
    BEGIN
      EXECUTE format(
        'DELETE FROM %s WHERE %I IN (SELECT id FROM %s WHERE tenant_id = $1)',
        v_fk_rec.child_table, v_fk_rec.child_col, v_fk_rec.parent_table
      ) USING v_tenant_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  -- 4I. Terakhir hapus materials dan suppliers lama milik tenant ini
  DELETE FROM public.materials WHERE tenant_id = v_tenant_id;
  DELETE FROM public.suppliers WHERE tenant_id = v_tenant_id;

  -- 5. SEED SUPPLIERS UMATIS (CABANG BSD)

  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Dripp Official (PT. Dripp Indonesia)', '0811-7700-9901', 'Jakarta / Tangerang (Syrup, Fruit Pulp & Powder Chocolate)', 'Key Account Dripp HoReCa', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Produksi Internal Barista Umatis', '0819-7888-123', 'Bar Umatis Resto & Venue, Kav. Taman Kota Barat Lot II.6 BSD City', 'Head Barista Umatis BSD', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Toko Elisa', '0813-1100-3301', 'Pasar Modern BSD City, Tangerang Selatan', 'Ko/Ci Elisa (Grosir Bahan Kue & Bar)', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Fresh Mandiri Fruit & Veggie', '0812-9900-1101', 'Pasar Modern BSD / Tangerang (Supplier Buah & Sayur Segar Harian)', 'PIC Order Fresh Mandiri', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'PT. David Roy Indonesia', '0812-2200-4402', 'Kawasan Industri Jababeka / Jakarta (Distributor Resmi Dilmah & Equelo)', 'Account Manager David Roy', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Tokopedia Official Marketplace', '0811-9900-2201', 'Platform E-Commerce Tokopedia (Pengadaan Online Barista)', 'Admin Procurement Online', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Delifru Official (PT. Delifru Utama)', '0811-8800-1001', 'Jakarta / Tangerang (Syrup, Sauce Caramel & Non-Dairy Creamer)', 'Sales HoReCa Delifru', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Squeeze Indonesia (Juice & Smoothies)', '0812-8800-1002', 'Jakarta / Tangerang (Juice 1L & Frozen Smoothies Pack)', 'Sales Admin Squeeze', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'PT. Akar Distribusi Indonesia', '0811-6600-8802', 'Tangerang / Jakarta (Distributor Resmi Multi Bintang & Heineken)', 'Sales HoReCa Beer Bintang', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Coco Fresh Supplier Kelapa', '0813-9900-1102', 'Cisauk / Serpong, Tangerang (Kelapa Muda Batok, Daging & Air Kelapa)', 'Pak Coco (Supplier Kelapa Muda)', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Koperasi Berlian Emas Indonesia', '0811-6600-8803', 'Tangerang / Jakarta (Distributor Resmi Bali Hai Beer)', 'Sales HoReCa Bali Hai', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Pak Toyib (Supplier Sayur & Rempah Pasar)', '0813-9900-1106', 'Pasar Cisauk / Sampora, Tangerang (Pandan, Sereh, Beetroot, Bengkoang)', 'Pak Toyib', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Ransom Berkat Packaging', '0812-9900-1302', 'Tangerang / Jakarta (Custom Cup Glass & Lid Ice/Hot Umatis)', 'Sales Admin Ransom Berkat', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Sunway Juice Frozen', '0812-9900-1201', 'Jakarta / Tangerang (Frozen Fruit Puree Pack isi 10 Porsi)', 'Sales Admin Sunway Juice', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Toko Juara Plastik', '0813-9900-1301', 'Pasar Modern BSD, Tangerang Selatan (Straw Ice/Hot, Sleeve & Plastik Take Away)', 'Admin Toko Juara Plastik', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Astro Quick Commerce', '0811-5500-7701', 'Hub Astro BSD City, Tangerang Selatan (Oat Milk, Soy Milk, Fresh Milk Urgent)', 'Layanan Instan Astro BSD', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Denali Gourmet (Suplai Garage)', '0812-7700-9902', 'Jakarta / Tangerang (Powder Matcha & Avocado Base)', 'Sales Admin Denali / Suplai Garage', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Groseri Ingredients (Tokopedia)', '0812-9900-1204', 'Tokopedia Online (Cinnamon Powder, Cinnamon Stick & Cengkeh)', 'Admin Groseri Ingredients', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Bubuqu (Suplai Garage)', '0812-7700-9905', 'Jakarta / Tangerang (Powder Avocado & Macchiato Foaming)', 'Sales Admin Bubuqu / Suplai Garage', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Cincau Fresh Pasar Umum', '0813-9900-1103', 'Pasar Tradisional Cisauk / BSD, Tangerang', 'Pedagang Cincau Hijau Segar', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'PT. Anak Mas Indah', '0812-7700-9904', 'Jakarta / Tangerang (Lychee Tea & Lemon Tea Powder Lipton)', 'Sales Admin PT. Anak Mas Indah', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'PT. Multibev Indonesia', '0812-2200-4401', 'Jakarta / Tangerang (Jasmine Green Tea & Blue Tea)', 'Sales Representative Multibev', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Scuro Official Store', '0812-7700-9903', 'Tokopedia / Jakarta (Lemongrass Tea & Keepcap Cheese Foam)', 'Admin Scuro Official', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Toko Naga Jaya Plastik & Bahan Kue', '0812-9900-1202', 'Pasar Modern BSD, Tangerang Selatan (Gula Stick & Chocolate Sauce)', 'Ko Naga Jaya', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'AEON Supermarket BSD City', '021-2916-8585', 'AEON Mall BSD City, Jl. BSD Raya Utama, Pagedangan, Tangerang', 'Customer Service AEON BSD', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Auromas Indonesia (Tokopedia)', '0812-9900-1203', 'Tokopedia Online (Coconut Crispy 1 Kg)', 'Admin Auromas Indonesia', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Berkat Plastik', '0813-9900-1304', 'Tangerang Selatan (Trash Bag 60x100)', 'Admin Berkat Plastik', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Demam Buah Supplier', '0812-9900-1105', 'BSD / Tangerang Selatan (Nanas Honi Segar)', 'Admin Demam Buah', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Dismak Official (Tokopedia)', '0813-1100-3302', 'Malang / Tokopedia Online (Teh Naga Malang)', 'Admin Dismak Tea', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Fatur Es Batu Kristal', '0813-8800-1003', 'Cisauk / Sampora BSD, Tangerang (Es Batu Kristal 5 Kg)', 'Pak Fatur (Supplier Es Kristal)', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Flavo Indonesia', '0812-9900-1104', 'Jakarta / Tangerang (Lychee in Syrup Can 565gr)', 'Sales Admin Flavo', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Milak Gold Dairy', '0812-4400-6602', 'Jakarta / Tangerang (Whipping Milk 1L)', 'Sales Distributor Milak Gold', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Official Santan Kara', '0812-5500-7702', 'Jakarta / Tokopedia Official Store (Santan Kara 200ml)', 'Distributor Kara HoReCa', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'PT. Amidis Tirta Mulia', '0812-3300-5501', 'Cisauk / BSD City, Tangerang (Air Minum Galon 19L)', 'Agen Distribusi Amidis BSD', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'PT. Food Station Tjipinang Jaya', '021-4711-088', 'Jl. Pisangan Lama Selatan No.1, Jakarta Timur (Gula Pasir 1 Kg)', 'Sales Distribusi Food Station', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'PT. Greenfields Indonesia', '0811-4400-6601', 'Jakarta / Tangerang (Fresh Milk UHT 1L)', 'Sales HoReCa Greenfields', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'PT. Prima Kemasindo', '0812-9900-1303', 'Tangerang / Jakarta (Plastik Wrapping Roll)', 'Sales Admin Prima Kemas', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'PT. Ramasurya (Distributor Pristine)', '0812-6600-8801', 'Tangerang, Banten (Mineral Water Pristine 400ml)', 'Sales Admin PT. Ramasurya', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'PT. Rotaryana Prima', '021-310-6767', 'Jl. Teuku Cik Ditiro No.16, Menteng / BSD (Charger CO2 iSi)', 'Sales Showroom Rotaryana', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Titik Temu Roastery', '0812-8800-1101', 'BSD / Jakarta Selatan (Supplier Biji Kopi House Blend 50:50)', 'PIC Roastery Titik Temu', 96.0, 0.5, 12, 12);
  PERFORM public.bv_upsert_supplier_v13(v_tenant_id, v_bsd_id, 'Toko Puspita Bahan Kue', '0812-9900-1107', 'Tangerang Selatan (Cherry Maraschino Tangkal)', 'Admin Toko Puspita', 96.0, 0.5, 12, 12);

  -- 6. SEED 142 MATERIALS UMATIS (CABANG BSD) DENGAN STOK AKTIF = STOK AKHIR 31 AGUSTUS 2026
  --    (qty_resto = Stok Akhir Bar Resto 31 Agu, qty_central = Stok Akhir Central 31 Agu)

  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Titik Temu Roastery')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Coffee Bean 50:50', 'Coffee & Tea', 'Titik Temu Roastery', v_sup_id,
    'pck', 'pck = 1000 gr', 220000,
    7.0, 0.0, 2, 12.0, 12.0,
    false, false, true, false, 'SKU-UMT-001', 'SKU-UMT-001'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-001',
      item_code = 'SKU-UMT-001',
      category = 'Coffee & Tea',
      supplier = 'Titik Temu Roastery',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 220000,
      new_price = 220000,
      avg_cost = 220000,
      qty_resto = 7.0,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 12.0,
      monthly_quota_qty = 12.0,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Tokopedia Official Marketplace')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Coffee single Origin 100% Arabica Natural', 'Coffee & Tea', 'Tokopedia Official Marketplace', v_sup_id,
    'pck', 'pck = 500 gr', 150000,
    0.4, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-002', 'SKU-UMT-002'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-002',
      item_code = 'SKU-UMT-002',
      category = 'Coffee & Tea',
      supplier = 'Tokopedia Official Marketplace',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 500 gr',
      price = 150000,
      new_price = 150000,
      avg_cost = 150000,
      qty_resto = 0.4,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Tokopedia Official Marketplace')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Coffee single Origin 100% Arabica Taste', 'Coffee & Tea', 'Tokopedia Official Marketplace', v_sup_id,
    'pck', 'pck = 500 gr', 150000,
    0.0, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-003', 'SKU-UMT-003'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-003',
      item_code = 'SKU-UMT-003',
      category = 'Coffee & Tea',
      supplier = 'Tokopedia Official Marketplace',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 500 gr',
      price = 150000,
      new_price = 150000,
      avg_cost = 150000,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Elisa')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Teh Tong tji harum', 'Coffee & Tea', 'Toko Elisa', v_sup_id,
    'pck', 'pck = 80 gr', 3750,
    50.0, 100.0, 10, 53.0, 53.0,
    false, false, true, false, 'SKU-UMT-004', 'SKU-UMT-004'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-004',
      item_code = 'SKU-UMT-004',
      category = 'Coffee & Tea',
      supplier = 'Toko Elisa',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 80 gr',
      price = 3750,
      new_price = 3750,
      avg_cost = 3750,
      qty_resto = 50.0,
      qty_central = 100.0,
      min_stock = 10,
      par_stock = 53.0,
      monthly_quota_qty = 53.0,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dismak Official (Tokopedia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Teh Naga Malang', 'Coffee & Tea', 'Dismak Official (Tokopedia)', v_sup_id,
    'pck', 'pck = 20 gr', 1400,
    100.0, 800.0, 10, 230.0, 230.0,
    false, false, true, false, 'SKU-UMT-005', 'SKU-UMT-005'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-005',
      item_code = 'SKU-UMT-005',
      category = 'Coffee & Tea',
      supplier = 'Dismak Official (Tokopedia)',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 20 gr',
      price = 1400,
      new_price = 1400,
      avg_cost = 1400,
      qty_resto = 100.0,
      qty_central = 800.0,
      min_stock = 10,
      par_stock = 230.0,
      monthly_quota_qty = 230.0,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Multibev Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Teh Jasmine Green Tea', 'Coffee & Tea', 'PT. Multibev Indonesia', v_sup_id,
    'pck', 'pck = 600 gr', 188000,
    0.5, 5.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-006', 'SKU-UMT-006'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-006',
      item_code = 'SKU-UMT-006',
      category = 'Coffee & Tea',
      supplier = 'PT. Multibev Indonesia',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 600 gr',
      price = 188000,
      new_price = 188000,
      avg_cost = 188000,
      qty_resto = 0.5,
      qty_central = 5.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Multibev Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Teh Blue Tea', 'Coffee & Tea', 'PT. Multibev Indonesia', v_sup_id,
    'pck', 'pck = 100 gr', 68800,
    0.0, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-007', 'SKU-UMT-007'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-007',
      item_code = 'SKU-UMT-007',
      category = 'Coffee & Tea',
      supplier = 'PT. Multibev Indonesia',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 100 gr',
      price = 68800,
      new_price = 68800,
      avg_cost = 68800,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. David Roy Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Teh Dilmah ( Peppermint & English Toffee)', 'Coffee & Tea', 'PT. David Roy Indonesia', v_sup_id,
    'pck', 'pck = 2 gr', 5536,
    15.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-008', 'SKU-UMT-008'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-008',
      item_code = 'SKU-UMT-008',
      category = 'Coffee & Tea',
      supplier = 'PT. David Roy Indonesia',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 2 gr',
      price = 5536,
      new_price = 5536,
      avg_cost = 5536,
      qty_resto = 15.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. David Roy Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Teh Dilmah (Berry Sensation)', 'Coffee & Tea', 'PT. David Roy Indonesia', v_sup_id,
    'pck', 'pck = 2 gr', 5536,
    50.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-009', 'SKU-UMT-009'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-009',
      item_code = 'SKU-UMT-009',
      category = 'Coffee & Tea',
      supplier = 'PT. David Roy Indonesia',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 2 gr',
      price = 5536,
      new_price = 5536,
      avg_cost = 5536,
      qty_resto = 50.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. David Roy Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Teh Dilmah (Elegant Earl Grey)', 'Coffee & Tea', 'PT. David Roy Indonesia', v_sup_id,
    'pck', 'pck = 2 gr', 5536,
    15.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-010', 'SKU-UMT-010'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-010',
      item_code = 'SKU-UMT-010',
      category = 'Coffee & Tea',
      supplier = 'PT. David Roy Indonesia',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 2 gr',
      price = 5536,
      new_price = 5536,
      avg_cost = 5536,
      qty_resto = 15.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. David Roy Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Teh Dilmah (Fragrant Jasmine Green)', 'Coffee & Tea', 'PT. David Roy Indonesia', v_sup_id,
    'pck', 'pck = 2 gr', 5536,
    5.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-011', 'SKU-UMT-011'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-011',
      item_code = 'SKU-UMT-011',
      category = 'Coffee & Tea',
      supplier = 'PT. David Roy Indonesia',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 2 gr',
      price = 5536,
      new_price = 5536,
      avg_cost = 5536,
      qty_resto = 5.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. David Roy Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Teh Dilmah (English Breakfast)', 'Coffee & Tea', 'PT. David Roy Indonesia', v_sup_id,
    'pck', 'pck = 2 gr', 5536,
    10.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-012', 'SKU-UMT-012'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-012',
      item_code = 'SKU-UMT-012',
      category = 'Coffee & Tea',
      supplier = 'PT. David Roy Indonesia',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 2 gr',
      price = 5536,
      new_price = 5536,
      avg_cost = 5536,
      qty_resto = 10.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. David Roy Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Teh Dilmah (Chamomile)', 'Coffee & Tea', 'PT. David Roy Indonesia', v_sup_id,
    'pck', 'pck = 2 gr', 5536,
    31.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-013', 'SKU-UMT-013'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-013',
      item_code = 'SKU-UMT-013',
      category = 'Coffee & Tea',
      supplier = 'PT. David Roy Indonesia',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 2 gr',
      price = 5536,
      new_price = 5536,
      avg_cost = 5536,
      qty_resto = 31.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. David Roy Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Teh Dilmah (Rose with Fresnch Vanila)', 'Coffee & Tea', 'PT. David Roy Indonesia', v_sup_id,
    'pck', 'pck = 2 gr', 5536,
    15.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-014', 'SKU-UMT-014'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-014',
      item_code = 'SKU-UMT-014',
      category = 'Coffee & Tea',
      supplier = 'PT. David Roy Indonesia',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 2 gr',
      price = 5536,
      new_price = 5536,
      avg_cost = 5536,
      qty_resto = 15.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Amidis Tirta Mulia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Amidis', 'Coffee & Tea', 'PT. Amidis Tirta Mulia', v_sup_id,
    'pcs', 'pcs = 19000 ml', 19500,
    4.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-015', 'SKU-UMT-015'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-015',
      item_code = 'SKU-UMT-015',
      category = 'Coffee & Tea',
      supplier = 'PT. Amidis Tirta Mulia',
      supplier_id = v_sup_id,
      unit = 'pcs',
      full_pack = 'pcs = 19000 ml',
      price = 19500,
      new_price = 19500,
      avg_cost = 19500,
      qty_resto = 4.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Greenfields Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Fresh Milk', 'Milk', 'PT. Greenfields Indonesia', v_sup_id,
    'pck', 'pck = 1000 gr', 19739,
    30.0, 0.0, 10, 127.0, 127.0,
    false, false, true, false, 'SKU-UMT-016', 'SKU-UMT-016'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-016',
      item_code = 'SKU-UMT-016',
      category = 'Milk',
      supplier = 'PT. Greenfields Indonesia',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 19739,
      new_price = 19739,
      avg_cost = 19739,
      qty_resto = 30.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 127.0,
      monthly_quota_qty = 127.0,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Milak Gold Dairy')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Whipping Milk', 'Milk', 'Milak Gold Dairy', v_sup_id,
    'pck', 'pck = 1000 gr', 75000,
    0.0, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-017', 'SKU-UMT-017'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-017',
      item_code = 'SKU-UMT-017',
      category = 'Milk',
      supplier = 'Milak Gold Dairy',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 75000,
      new_price = 75000,
      avg_cost = 75000,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Astro Quick Commerce')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Oat Milk', 'Milk', 'Astro Quick Commerce', v_sup_id,
    'pcs', 'pcs = 200 ml', 11500,
    3.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-018', 'SKU-UMT-018'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-018',
      item_code = 'SKU-UMT-018',
      category = 'Milk',
      supplier = 'Astro Quick Commerce',
      supplier_id = v_sup_id,
      unit = 'pcs',
      full_pack = 'pcs = 200 ml',
      price = 11500,
      new_price = 11500,
      avg_cost = 11500,
      qty_resto = 3.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Astro Quick Commerce')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Soy Milk', 'Milk', 'Astro Quick Commerce', v_sup_id,
    'pcs', 'pcs = 200 ml', 14000,
    5.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-019', 'SKU-UMT-019'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-019',
      item_code = 'SKU-UMT-019',
      category = 'Milk',
      supplier = 'Astro Quick Commerce',
      supplier_id = v_sup_id,
      unit = 'pcs',
      full_pack = 'pcs = 200 ml',
      price = 14000,
      new_price = 14000,
      avg_cost = 14000,
      qty_resto = 5.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Elisa')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Skm', 'Milk', 'Toko Elisa', v_sup_id,
    'kaleng', 'kaleng = 300 gr', 11500,
    11.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-020', 'SKU-UMT-020'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-020',
      item_code = 'SKU-UMT-020',
      category = 'Milk',
      supplier = 'Toko Elisa',
      supplier_id = v_sup_id,
      unit = 'kaleng',
      full_pack = 'kaleng = 300 gr',
      price = 11500,
      new_price = 11500,
      avg_cost = 11500,
      qty_resto = 11.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Official Santan Kara')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Santan kara', 'Milk', 'Official Santan Kara', v_sup_id,
    'pcs', 'pcs = 200 gr', 14000,
    11.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-021', 'SKU-UMT-021'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-021',
      item_code = 'SKU-UMT-021',
      category = 'Milk',
      supplier = 'Official Santan Kara',
      supplier_id = v_sup_id,
      unit = 'pcs',
      full_pack = 'pcs = 200 gr',
      price = 14000,
      new_price = 14000,
      avg_cost = 14000,
      qty_resto = 11.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Ramasurya (Distributor Pristine)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Mineral water 400 ml', 'Drink & Beer', 'PT. Ramasurya (Distributor Pristine)', v_sup_id,
    'Crtn', 'Crtn = 24 pcs', 58000,
    0.375, 0.0, 5, 55.75, 55.75,
    false, false, true, false, 'SKU-UMT-022', 'SKU-UMT-022'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-022',
      item_code = 'SKU-UMT-022',
      category = 'Drink & Beer',
      supplier = 'PT. Ramasurya (Distributor Pristine)',
      supplier_id = v_sup_id,
      unit = 'Crtn',
      full_pack = 'Crtn = 24 pcs',
      price = 58000,
      new_price = 58000,
      avg_cost = 58000,
      qty_resto = 0.375,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 55.75,
      monthly_quota_qty = 55.75,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Akar Distribusi Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Bintang Pilsener', 'Drink & Beer', 'PT. Akar Distribusi Indonesia', v_sup_id,
    'Crtn', 'Crtn = 24 pcs', 515200,
    1.4167, 0.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-023', 'SKU-UMT-023'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-023',
      item_code = 'SKU-UMT-023',
      category = 'Drink & Beer',
      supplier = 'PT. Akar Distribusi Indonesia',
      supplier_id = v_sup_id,
      unit = 'Crtn',
      full_pack = 'Crtn = 24 pcs',
      price = 515200,
      new_price = 515200,
      avg_cost = 515200,
      qty_resto = 1.4167,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Akar Distribusi Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Bintang Reddler', 'Drink & Beer', 'PT. Akar Distribusi Indonesia', v_sup_id,
    'Crtn', 'Crtn = 24 pcs', 495000,
    0.6667, 0.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-024', 'SKU-UMT-024'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-024',
      item_code = 'SKU-UMT-024',
      category = 'Drink & Beer',
      supplier = 'PT. Akar Distribusi Indonesia',
      supplier_id = v_sup_id,
      unit = 'Crtn',
      full_pack = 'Crtn = 24 pcs',
      price = 495000,
      new_price = 495000,
      avg_cost = 495000,
      qty_resto = 0.6667,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Akar Distribusi Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Bintang Crystal', 'Drink & Beer', 'PT. Akar Distribusi Indonesia', v_sup_id,
    'Crtn', 'Crtn = 24 pcs', 539200,
    0.875, 0.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-025', 'SKU-UMT-025'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-025',
      item_code = 'SKU-UMT-025',
      category = 'Drink & Beer',
      supplier = 'PT. Akar Distribusi Indonesia',
      supplier_id = v_sup_id,
      unit = 'Crtn',
      full_pack = 'Crtn = 24 pcs',
      price = 539200,
      new_price = 539200,
      avg_cost = 539200,
      qty_resto = 0.875,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Akar Distribusi Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Bintang Heineken', 'Drink & Beer', 'PT. Akar Distribusi Indonesia', v_sup_id,
    'Crtn', 'Crtn = 24 pcs', 602200,
    0.4583, 0.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-026', 'SKU-UMT-026'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-026',
      item_code = 'SKU-UMT-026',
      category = 'Drink & Beer',
      supplier = 'PT. Akar Distribusi Indonesia',
      supplier_id = v_sup_id,
      unit = 'Crtn',
      full_pack = 'Crtn = 24 pcs',
      price = 602200,
      new_price = 602200,
      avg_cost = 602200,
      qty_resto = 0.4583,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Akar Distribusi Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Bintang Arak Madu', 'Drink & Beer', 'PT. Akar Distribusi Indonesia', v_sup_id,
    'Crtn', 'Crtn = 24 pcs', 524200,
    0.9167, 0.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-027', 'SKU-UMT-027'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-027',
      item_code = 'SKU-UMT-027',
      category = 'Drink & Beer',
      supplier = 'PT. Akar Distribusi Indonesia',
      supplier_id = v_sup_id,
      unit = 'Crtn',
      full_pack = 'Crtn = 24 pcs',
      price = 524200,
      new_price = 524200,
      avg_cost = 524200,
      qty_resto = 0.9167,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Koperasi Berlian Emas Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Bali Hai Premium 330', 'Drink & Beer', 'Koperasi Berlian Emas Indonesia', v_sup_id,
    'Crtn', 'Crtn = 24 pcs', 495000,
    0.9167, 0.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-028', 'SKU-UMT-028'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-028',
      item_code = 'SKU-UMT-028',
      category = 'Drink & Beer',
      supplier = 'Koperasi Berlian Emas Indonesia',
      supplier_id = v_sup_id,
      unit = 'Crtn',
      full_pack = 'Crtn = 24 pcs',
      price = 495000,
      new_price = 495000,
      avg_cost = 495000,
      qty_resto = 0.9167,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Koperasi Berlian Emas Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Bali Hai Draft beer 220', 'Drink & Beer', 'Koperasi Berlian Emas Indonesia', v_sup_id,
    'Crtn', 'Crtn = 24 pcs', 351000,
    0.875, 0.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-029', 'SKU-UMT-029'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-029',
      item_code = 'SKU-UMT-029',
      category = 'Drink & Beer',
      supplier = 'Koperasi Berlian Emas Indonesia',
      supplier_id = v_sup_id,
      unit = 'Crtn',
      full_pack = 'Crtn = 24 pcs',
      price = 351000,
      new_price = 351000,
      avg_cost = 351000,
      qty_resto = 0.875,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Koperasi Berlian Emas Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Bali Hai Romantic day beer can 500 ml', 'Drink & Beer', 'Koperasi Berlian Emas Indonesia', v_sup_id,
    'Crtn', 'Crtn = 24 pcs', 641700,
    1.4167, 0.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-030', 'SKU-UMT-030'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-030',
      item_code = 'SKU-UMT-030',
      category = 'Drink & Beer',
      supplier = 'Koperasi Berlian Emas Indonesia',
      supplier_id = v_sup_id,
      unit = 'Crtn',
      full_pack = 'Crtn = 24 pcs',
      price = 641700,
      new_price = 641700,
      avg_cost = 641700,
      qty_resto = 1.4167,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Koperasi Berlian Emas Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Bali Hai Panther beer 330ml', 'Drink & Beer', 'Koperasi Berlian Emas Indonesia', v_sup_id,
    'Crtn', 'Crtn = 24 pcs', 585900,
    0.8333, 0.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-031', 'SKU-UMT-031'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-031',
      item_code = 'SKU-UMT-031',
      category = 'Drink & Beer',
      supplier = 'Koperasi Berlian Emas Indonesia',
      supplier_id = v_sup_id,
      unit = 'Crtn',
      full_pack = 'Crtn = 24 pcs',
      price = 585900,
      new_price = 585900,
      avg_cost = 585900,
      qty_resto = 0.8333,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Chocolate', 'Powder', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'pck', 'pck = 1000 gr', 156000,
    0.5, 6.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-032', 'SKU-UMT-032'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-032',
      item_code = 'SKU-UMT-032',
      category = 'Powder',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 156000,
      new_price = 156000,
      avg_cost = 156000,
      qty_resto = 0.5,
      qty_central = 6.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Denali Gourmet (Suplai Garage)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Matcha', 'Powder', 'Denali Gourmet (Suplai Garage)', v_sup_id,
    'pck', 'pck = 1000 gr', 180000,
    1.0, 5.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-033', 'SKU-UMT-033'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-033',
      item_code = 'SKU-UMT-033',
      category = 'Powder',
      supplier = 'Denali Gourmet (Suplai Garage)',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 180000,
      new_price = 180000,
      avg_cost = 180000,
      qty_resto = 1.0,
      qty_central = 5.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Scuro Official Store')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Lemongrass tea', 'Powder', 'Scuro Official Store', v_sup_id,
    'pck', 'pck = 1000 gr', 93000,
    8.0, 10.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-034', 'SKU-UMT-034'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-034',
      item_code = 'SKU-UMT-034',
      category = 'Powder',
      supplier = 'Scuro Official Store',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 93000,
      new_price = 93000,
      avg_cost = 93000,
      qty_resto = 8.0,
      qty_central = 10.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Anak Mas Indah')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Lychee Tea', 'Powder', 'PT. Anak Mas Indah', v_sup_id,
    'pck', 'pck = 500 gr', 40191,
    4.0, 13.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-035', 'SKU-UMT-035'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-035',
      item_code = 'SKU-UMT-035',
      category = 'Powder',
      supplier = 'PT. Anak Mas Indah',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 500 gr',
      price = 40191,
      new_price = 40191,
      avg_cost = 40191,
      qty_resto = 4.0,
      qty_central = 13.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Anak Mas Indah')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Lemon Tea', 'Powder', 'PT. Anak Mas Indah', v_sup_id,
    'pck', 'pck = 500 gr', 40191,
    9.0, 23.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-036', 'SKU-UMT-036'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-036',
      item_code = 'SKU-UMT-036',
      category = 'Powder',
      supplier = 'PT. Anak Mas Indah',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 500 gr',
      price = 40191,
      new_price = 40191,
      avg_cost = 40191,
      qty_resto = 9.0,
      qty_central = 23.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Denali Gourmet (Suplai Garage)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Avocado Base Denali', 'Powder', 'Denali Gourmet (Suplai Garage)', v_sup_id,
    'pck', 'pck = 1000 gr', 104880,
    1.0, 6.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-037', 'SKU-UMT-037'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-037',
      item_code = 'SKU-UMT-037',
      category = 'Powder',
      supplier = 'Denali Gourmet (Suplai Garage)',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 104880,
      new_price = 104880,
      avg_cost = 104880,
      qty_resto = 1.0,
      qty_central = 6.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Bubuqu (Suplai Garage)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Avocado Bubuqu', 'Powder', 'Bubuqu (Suplai Garage)', v_sup_id,
    'pck', 'pck = 1000 gr', 62000,
    1.0, 7.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-038', 'SKU-UMT-038'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-038',
      item_code = 'SKU-UMT-038',
      category = 'Powder',
      supplier = 'Bubuqu (Suplai Garage)',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 62000,
      new_price = 62000,
      avg_cost = 62000,
      qty_resto = 1.0,
      qty_central = 7.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Bubuqu (Suplai Garage)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Machiato Foaming Bubuqu', 'Powder', 'Bubuqu (Suplai Garage)', v_sup_id,
    'pck', 'pck = 1000 gr', 62000,
    1.0, 2.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-039', 'SKU-UMT-039'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-039',
      item_code = 'SKU-UMT-039',
      category = 'Powder',
      supplier = 'Bubuqu (Suplai Garage)',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 62000,
      new_price = 62000,
      avg_cost = 62000,
      qty_resto = 1.0,
      qty_central = 2.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Scuro Official Store')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Whize Chesee Foaming Keepcap', 'Powder', 'Scuro Official Store', v_sup_id,
    'pck', 'pck = 1000 gr', 255000,
    1.5, 3.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-040', 'SKU-UMT-040'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-040',
      item_code = 'SKU-UMT-040',
      category = 'Powder',
      supplier = 'Scuro Official Store',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 255000,
      new_price = 255000,
      avg_cost = 255000,
      qty_resto = 1.5,
      qty_central = 3.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Delifru Official (PT. Delifru Utama)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Creamer non dairy Delifru', 'Powder', 'Delifru Official (PT. Delifru Utama)', v_sup_id,
    'pck', 'pck = 1000 gr', 55000,
    1.0, 2.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-041', 'SKU-UMT-041'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-041',
      item_code = 'SKU-UMT-041',
      category = 'Powder',
      supplier = 'Delifru Official (PT. Delifru Utama)',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 55000,
      new_price = 55000,
      avg_cost = 55000,
      qty_resto = 1.0,
      qty_central = 2.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Harum Manis Fruit Pulp', 'Syrup & Juice', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'Btl', 'Btl = 1015 gr', 166500,
    2.0, 2.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-042', 'SKU-UMT-042'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-042',
      item_code = 'SKU-UMT-042',
      category = 'Syrup & Juice',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 1015 gr',
      price = 166500,
      new_price = 166500,
      avg_cost = 166500,
      qty_resto = 2.0,
      qty_central = 2.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Kiwie fruit Pulp', 'Syrup & Juice', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'Btl', 'Btl = 1030 gr', 166500,
    1.0, 3.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-043', 'SKU-UMT-043'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-043',
      item_code = 'SKU-UMT-043',
      category = 'Syrup & Juice',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 1030 gr',
      price = 166500,
      new_price = 166500,
      avg_cost = 166500,
      qty_resto = 1.0,
      qty_central = 3.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Mix Berries Pulp', 'Syrup & Juice', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'Btl', 'Btl = 1030 gr', 166500,
    2.0, 2.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-044', 'SKU-UMT-044'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-044',
      item_code = 'SKU-UMT-044',
      category = 'Syrup & Juice',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 1030 gr',
      price = 166500,
      new_price = 166500,
      avg_cost = 166500,
      qty_resto = 2.0,
      qty_central = 2.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Peach syrup', 'Syrup & Juice', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'Btl', 'Btl = 750 ml', 111000,
    1.0, 3.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-045', 'SKU-UMT-045'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-045',
      item_code = 'SKU-UMT-045',
      category = 'Syrup & Juice',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 750 ml',
      price = 111000,
      new_price = 111000,
      avg_cost = 111000,
      qty_resto = 1.0,
      qty_central = 3.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Lychee syrup', 'Syrup & Juice', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'Btl', 'Btl = 750 ml', 111000,
    1.0, 9.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-046', 'SKU-UMT-046'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-046',
      item_code = 'SKU-UMT-046',
      category = 'Syrup & Juice',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 750 ml',
      price = 111000,
      new_price = 111000,
      avg_cost = 111000,
      qty_resto = 1.0,
      qty_central = 9.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Passion Fruit syrup', 'Syrup & Juice', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'Btl', 'Btl = 750 ml', 111000,
    2.0, 2.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-047', 'SKU-UMT-047'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-047',
      item_code = 'SKU-UMT-047',
      category = 'Syrup & Juice',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 750 ml',
      price = 111000,
      new_price = 111000,
      avg_cost = 111000,
      qty_resto = 2.0,
      qty_central = 2.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Osmanthus syrup', 'Syrup & Juice', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'Btl', 'Btl = 750 ml', 111000,
    1.0, 2.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-048', 'SKU-UMT-048'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-048',
      item_code = 'SKU-UMT-048',
      category = 'Syrup & Juice',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 750 ml',
      price = 111000,
      new_price = 111000,
      avg_cost = 111000,
      qty_resto = 1.0,
      qty_central = 2.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Mint syrup', 'Syrup & Juice', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'Btl', 'Btl = 750 ml', 111000,
    1.0, 3.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-049', 'SKU-UMT-049'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-049',
      item_code = 'SKU-UMT-049',
      category = 'Syrup & Juice',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 750 ml',
      price = 111000,
      new_price = 111000,
      avg_cost = 111000,
      qty_resto = 1.0,
      qty_central = 3.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Lemonade syrup', 'Syrup & Juice', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'Btl', 'Btl = 750 ml', 111000,
    1.0, 4.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-050', 'SKU-UMT-050'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-050',
      item_code = 'SKU-UMT-050',
      category = 'Syrup & Juice',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 750 ml',
      price = 111000,
      new_price = 111000,
      avg_cost = 111000,
      qty_resto = 1.0,
      qty_central = 4.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Honey syrup', 'Syrup & Juice', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'Btl', 'Btl = 750 ml', 111000,
    1.0, 2.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-051', 'SKU-UMT-051'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-051',
      item_code = 'SKU-UMT-051',
      category = 'Syrup & Juice',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 750 ml',
      price = 111000,
      new_price = 111000,
      avg_cost = 111000,
      qty_resto = 1.0,
      qty_central = 2.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Pandan Syrup', 'Syrup & Juice', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'Btl', 'Btl = 750 ml', 111000,
    4.0, 3.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-052', 'SKU-UMT-052'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-052',
      item_code = 'SKU-UMT-052',
      category = 'Syrup & Juice',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 750 ml',
      price = 111000,
      new_price = 111000,
      avg_cost = 111000,
      qty_resto = 4.0,
      qty_central = 3.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Coconut syrup', 'Syrup & Juice', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'Btl', 'Btl = 750 ml', 111000,
    1.0, 3.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-053', 'SKU-UMT-053'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-053',
      item_code = 'SKU-UMT-053',
      category = 'Syrup & Juice',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 750 ml',
      price = 111000,
      new_price = 111000,
      avg_cost = 111000,
      qty_resto = 1.0,
      qty_central = 3.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Pistachio syrup', 'Syrup & Juice', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'Btl', 'Btl = 750 ml', 111000,
    2.0, 1.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-054', 'SKU-UMT-054'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-054',
      item_code = 'SKU-UMT-054',
      category = 'Syrup & Juice',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 750 ml',
      price = 111000,
      new_price = 111000,
      avg_cost = 111000,
      qty_resto = 2.0,
      qty_central = 1.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Hazelnut syrup', 'Syrup & Juice', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'Btl', 'Btl = 750 ml', 111000,
    2.0, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-055', 'SKU-UMT-055'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-055',
      item_code = 'SKU-UMT-055',
      category = 'Syrup & Juice',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 750 ml',
      price = 111000,
      new_price = 111000,
      avg_cost = 111000,
      qty_resto = 2.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Rumbullion syrup', 'Syrup & Juice', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'Btl', 'Btl = 750 ml', 111000,
    2.0, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-056', 'SKU-UMT-056'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-056',
      item_code = 'SKU-UMT-056',
      category = 'Syrup & Juice',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 750 ml',
      price = 111000,
      new_price = 111000,
      avg_cost = 111000,
      qty_resto = 2.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Butterscoth syrup', 'Syrup & Juice', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'Btl', 'Btl = 750 ml', 111000,
    0.0, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-057', 'SKU-UMT-057'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-057',
      item_code = 'SKU-UMT-057',
      category = 'Syrup & Juice',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 750 ml',
      price = 111000,
      new_price = 111000,
      avg_cost = 111000,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Strawberry syrup', 'Syrup & Juice', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'Btl', 'Btl = 750 ml', 111000,
    1.0, 4.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-058', 'SKU-UMT-058'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-058',
      item_code = 'SKU-UMT-058',
      category = 'Syrup & Juice',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 750 ml',
      price = 111000,
      new_price = 111000,
      avg_cost = 111000,
      qty_resto = 1.0,
      qty_central = 4.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Ginger Bread Syrup', 'Syrup & Juice', 'Dripp Official (PT. Dripp Indonesia)', v_sup_id,
    'Btl', 'Btl = 750 ml', 111000,
    1.0, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-059', 'SKU-UMT-059'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-059',
      item_code = 'SKU-UMT-059',
      category = 'Syrup & Juice',
      supplier = 'Dripp Official (PT. Dripp Indonesia)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 750 ml',
      price = 111000,
      new_price = 111000,
      avg_cost = 111000,
      qty_resto = 1.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Delifru Official (PT. Delifru Utama)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Blue caraco syrup', 'Syrup & Juice', 'Delifru Official (PT. Delifru Utama)', v_sup_id,
    'Btl', 'Btl = 750 ml', 100000,
    2.0, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-060', 'SKU-UMT-060'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-060',
      item_code = 'SKU-UMT-060',
      category = 'Syrup & Juice',
      supplier = 'Delifru Official (PT. Delifru Utama)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 750 ml',
      price = 100000,
      new_price = 100000,
      avg_cost = 100000,
      qty_resto = 2.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Delifru Official (PT. Delifru Utama)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'salted caramel syrup', 'Syrup & Juice', 'Delifru Official (PT. Delifru Utama)', v_sup_id,
    'Btl', 'Btl = 1360 gr', 100000,
    1.0, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-061', 'SKU-UMT-061'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-061',
      item_code = 'SKU-UMT-061',
      category = 'Syrup & Juice',
      supplier = 'Delifru Official (PT. Delifru Utama)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 1360 gr',
      price = 100000,
      new_price = 100000,
      avg_cost = 100000,
      qty_resto = 1.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Delifru Official (PT. Delifru Utama)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Osaka Brown Sugar Syrup', 'Syrup & Juice', 'Delifru Official (PT. Delifru Utama)', v_sup_id,
    'Btl', 'Btl = 1000 gr', 100000,
    1.0, 2.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-062', 'SKU-UMT-062'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-062',
      item_code = 'SKU-UMT-062',
      category = 'Syrup & Juice',
      supplier = 'Delifru Official (PT. Delifru Utama)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 1000 gr',
      price = 100000,
      new_price = 100000,
      avg_cost = 100000,
      qty_resto = 1.0,
      qty_central = 2.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Delifru Official (PT. Delifru Utama)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Roasted Barley Syrup', 'Syrup & Juice', 'Delifru Official (PT. Delifru Utama)', v_sup_id,
    'Btl', 'Btl = 1090 gr', 156000,
    1.0, 2.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-063', 'SKU-UMT-063'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-063',
      item_code = 'SKU-UMT-063',
      category = 'Syrup & Juice',
      supplier = 'Delifru Official (PT. Delifru Utama)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 1090 gr',
      price = 156000,
      new_price = 156000,
      avg_cost = 156000,
      qty_resto = 1.0,
      qty_central = 2.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Delifru Official (PT. Delifru Utama)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Souce Caramel', 'Syrup & Juice', 'Delifru Official (PT. Delifru Utama)', v_sup_id,
    'Btl', 'Btl = 1000 gr', 80000,
    1.0, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-064', 'SKU-UMT-064'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-064',
      item_code = 'SKU-UMT-064',
      category = 'Syrup & Juice',
      supplier = 'Delifru Official (PT. Delifru Utama)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 1000 gr',
      price = 80000,
      new_price = 80000,
      avg_cost = 80000,
      qty_resto = 1.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Peinapple juivce', 'Syrup & Juice', 'Squeeze Indonesia (Juice & Smoothies)', v_sup_id,
    'Btl', 'Btl = 1090 gr', 16095,
    5.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-065', 'SKU-UMT-065'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-065',
      item_code = 'SKU-UMT-065',
      category = 'Syrup & Juice',
      supplier = 'Squeeze Indonesia (Juice & Smoothies)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 1090 gr',
      price = 16095,
      new_price = 16095,
      avg_cost = 16095,
      qty_resto = 5.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Lemon Juice', 'Syrup & Juice', 'Squeeze Indonesia (Juice & Smoothies)', v_sup_id,
    'Btl', 'Btl = 1090 gr', 18315,
    3.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-066', 'SKU-UMT-066'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-066',
      item_code = 'SKU-UMT-066',
      category = 'Syrup & Juice',
      supplier = 'Squeeze Indonesia (Juice & Smoothies)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 1090 gr',
      price = 18315,
      new_price = 18315,
      avg_cost = 18315,
      qty_resto = 3.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Orange juice premium', 'Syrup & Juice', 'Squeeze Indonesia (Juice & Smoothies)', v_sup_id,
    'Btl', 'Btl = 1000 gr', 18315,
    5.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-067', 'SKU-UMT-067'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-067',
      item_code = 'SKU-UMT-067',
      category = 'Syrup & Juice',
      supplier = 'Squeeze Indonesia (Juice & Smoothies)',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 1000 gr',
      price = 18315,
      new_price = 18315,
      avg_cost = 18315,
      qty_resto = 5.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fatur Es Batu Kristal')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Es Batu', 'Syrup & Juice', 'Fatur Es Batu Kristal', v_sup_id,
    'pck', 'pck = 5000 gr', 18000,
    0.0, 0.0, 10, 236.0, 236.0,
    false, false, true, false, 'SKU-UMT-068', 'SKU-UMT-068'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-068',
      item_code = 'SKU-UMT-068',
      category = 'Syrup & Juice',
      supplier = 'Fatur Es Batu Kristal',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 5000 gr',
      price = 18000,
      new_price = 18000,
      avg_cost = 18000,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 236.0,
      monthly_quota_qty = 236.0,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Produksi Internal Barista Umatis')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Syrup gula merah', 'Syrup & Juice', 'Produksi Internal Barista Umatis', v_sup_id,
    'kg', 'kg = 5000 gr', 92000,
    0.3, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-069', 'SKU-UMT-069'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-069',
      item_code = 'SKU-UMT-069',
      category = 'Syrup & Juice',
      supplier = 'Produksi Internal Barista Umatis',
      supplier_id = v_sup_id,
      unit = 'kg',
      full_pack = 'kg = 5000 gr',
      price = 92000,
      new_price = 92000,
      avg_cost = 92000,
      qty_resto = 0.3,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Jeruk Pontianak', 'Fresh Fruit', 'Fresh Mandiri Fruit & Veggie', v_sup_id,
    'kg', 'kg = 1000 gr', 23000,
    5.0, 0.0, 10, 125.0, 125.0,
    true, false, true, false, 'SKU-UMT-070', 'SKU-UMT-070'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-070',
      item_code = 'SKU-UMT-070',
      category = 'Fresh Fruit',
      supplier = 'Fresh Mandiri Fruit & Veggie',
      supplier_id = v_sup_id,
      unit = 'kg',
      full_pack = 'kg = 1000 gr',
      price = 23000,
      new_price = 23000,
      avg_cost = 23000,
      qty_resto = 5.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 125.0,
      monthly_quota_qty = 125.0,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Kelapa Batok Umatis', 'Fresh Fruit', 'Coco Fresh Supplier Kelapa', v_sup_id,
    'pcs', 'pcs = 1 pcs', 11500,
    6.0, 0.0, 10, 214.0, 214.0,
    true, false, true, false, 'SKU-UMT-071', 'SKU-UMT-071'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-071',
      item_code = 'SKU-UMT-071',
      category = 'Fresh Fruit',
      supplier = 'Coco Fresh Supplier Kelapa',
      supplier_id = v_sup_id,
      unit = 'pcs',
      full_pack = 'pcs = 1 pcs',
      price = 11500,
      new_price = 11500,
      avg_cost = 11500,
      qty_resto = 6.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 214.0,
      monthly_quota_qty = 214.0,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Dging kelapa', 'Fresh Fruit', 'Coco Fresh Supplier Kelapa', v_sup_id,
    'kg', 'kg = 1000 gr', 55000,
    0.0, 0.0, 5, 10, 10.0,
    true, false, true, false, 'SKU-UMT-072', 'SKU-UMT-072'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-072',
      item_code = 'SKU-UMT-072',
      category = 'Fresh Fruit',
      supplier = 'Coco Fresh Supplier Kelapa',
      supplier_id = v_sup_id,
      unit = 'kg',
      full_pack = 'kg = 1000 gr',
      price = 55000,
      new_price = 55000,
      avg_cost = 55000,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10.0,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'air kelapa 1 L', 'Fresh Fruit', 'Coco Fresh Supplier Kelapa', v_sup_id,
    'pck', 'pck = 1000 gr', 14500,
    1.0, 0.0, 10, 43.0, 43.0,
    true, false, true, false, 'SKU-UMT-073', 'SKU-UMT-073'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-073',
      item_code = 'SKU-UMT-073',
      category = 'Fresh Fruit',
      supplier = 'Coco Fresh Supplier Kelapa',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 14500,
      new_price = 14500,
      avg_cost = 14500,
      qty_resto = 1.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 43.0,
      monthly_quota_qty = 43.0,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Cincau Fresh Pasar Umum')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Cincau Hijau', 'Fresh Fruit', 'Cincau Fresh Pasar Umum', v_sup_id,
    'pck', 'pck = 500 gr', 15000,
    10.0, 0.0, 10, 49.0, 49.0,
    true, false, true, false, 'SKU-UMT-074', 'SKU-UMT-074'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-074',
      item_code = 'SKU-UMT-074',
      category = 'Fresh Fruit',
      supplier = 'Cincau Fresh Pasar Umum',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 500 gr',
      price = 15000,
      new_price = 15000,
      avg_cost = 15000,
      qty_resto = 10.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 49.0,
      monthly_quota_qty = 49.0,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Lemon import', 'Fresh Fruit', 'Fresh Mandiri Fruit & Veggie', v_sup_id,
    'kg', 'kg = 1000 gr', 55000,
    2.7, 0.0, 5, 10, 10,
    true, false, true, false, 'SKU-UMT-075', 'SKU-UMT-075'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-075',
      item_code = 'SKU-UMT-075',
      category = 'Fresh Fruit',
      supplier = 'Fresh Mandiri Fruit & Veggie',
      supplier_id = v_sup_id,
      unit = 'kg',
      full_pack = 'kg = 1000 gr',
      price = 55000,
      new_price = 55000,
      avg_cost = 55000,
      qty_resto = 2.7,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Strawberry', 'Fresh Fruit', 'Fresh Mandiri Fruit & Veggie', v_sup_id,
    'kg', 'kg = 200 gr', 15000,
    0.4, 0.0, 10, 20, 20,
    true, false, true, false, 'SKU-UMT-076', 'SKU-UMT-076'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-076',
      item_code = 'SKU-UMT-076',
      category = 'Fresh Fruit',
      supplier = 'Fresh Mandiri Fruit & Veggie',
      supplier_id = v_sup_id,
      unit = 'kg',
      full_pack = 'kg = 200 gr',
      price = 15000,
      new_price = 15000,
      avg_cost = 15000,
      qty_resto = 0.4,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Flavo Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Lychee Can', 'Fresh Fruit', 'Flavo Indonesia', v_sup_id,
    'kg', 'kg = 565 gr', 27000,
    3.0, 31.0, 10, 20, 20,
    true, false, true, false, 'SKU-UMT-077', 'SKU-UMT-077'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-077',
      item_code = 'SKU-UMT-077',
      category = 'Fresh Fruit',
      supplier = 'Flavo Indonesia',
      supplier_id = v_sup_id,
      unit = 'kg',
      full_pack = 'kg = 565 gr',
      price = 27000,
      new_price = 27000,
      avg_cost = 27000,
      qty_resto = 3.0,
      qty_central = 31.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Kale', 'Fresh Fruit', 'Fresh Mandiri Fruit & Veggie', v_sup_id,
    'kg', 'kg = 1000 gr', 60000,
    0.0, 0.0, 5, 10, 10,
    true, false, true, false, 'SKU-UMT-078', 'SKU-UMT-078'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-078',
      item_code = 'SKU-UMT-078',
      category = 'Fresh Fruit',
      supplier = 'Fresh Mandiri Fruit & Veggie',
      supplier_id = v_sup_id,
      unit = 'kg',
      full_pack = 'kg = 1000 gr',
      price = 60000,
      new_price = 60000,
      avg_cost = 60000,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Demam Buah Supplier')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Nanas Honi', 'Fresh Fruit', 'Demam Buah Supplier', v_sup_id,
    'kg', 'kg = 1000 gr', 38000,
    0.0, 0.0, 10, 20, 20,
    true, false, true, false, 'SKU-UMT-079', 'SKU-UMT-079'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-079',
      item_code = 'SKU-UMT-079',
      category = 'Fresh Fruit',
      supplier = 'Demam Buah Supplier',
      supplier_id = v_sup_id,
      unit = 'kg',
      full_pack = 'kg = 1000 gr',
      price = 38000,
      new_price = 38000,
      avg_cost = 38000,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Buah Naga', 'Fresh Fruit', 'Fresh Mandiri Fruit & Veggie', v_sup_id,
    'kg', 'kg = 1000 gr', 28000,
    0.0, 0.0, 10, 20, 20,
    true, false, true, false, 'SKU-UMT-080', 'SKU-UMT-080'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-080',
      item_code = 'SKU-UMT-080',
      category = 'Fresh Fruit',
      supplier = 'Fresh Mandiri Fruit & Veggie',
      supplier_id = v_sup_id,
      unit = 'kg',
      full_pack = 'kg = 1000 gr',
      price = 28000,
      new_price = 28000,
      avg_cost = 28000,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Wortel', 'Fresh Fruit', 'Fresh Mandiri Fruit & Veggie', v_sup_id,
    'kg', 'kg = 1000 gr', 20000,
    0.0, 0.0, 10, 20, 20,
    true, false, true, false, 'SKU-UMT-081', 'SKU-UMT-081'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-081',
      item_code = 'SKU-UMT-081',
      category = 'Fresh Fruit',
      supplier = 'Fresh Mandiri Fruit & Veggie',
      supplier_id = v_sup_id,
      unit = 'kg',
      full_pack = 'kg = 1000 gr',
      price = 20000,
      new_price = 20000,
      avg_cost = 20000,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Beet root', 'Fresh Fruit', 'Pak Toyib (Supplier Sayur & Rempah Pasar)', v_sup_id,
    'kg', 'kg = 1000 gr', 25000,
    0.0, 0.0, 10, 20, 20,
    true, false, true, false, 'SKU-UMT-082', 'SKU-UMT-082'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-082',
      item_code = 'SKU-UMT-082',
      category = 'Fresh Fruit',
      supplier = 'Pak Toyib (Supplier Sayur & Rempah Pasar)',
      supplier_id = v_sup_id,
      unit = 'kg',
      full_pack = 'kg = 1000 gr',
      price = 25000,
      new_price = 25000,
      avg_cost = 25000,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Lime', 'Fresh Fruit', 'Fresh Mandiri Fruit & Veggie', v_sup_id,
    'kg', 'kg = 1000 gr', 25000,
    1.7, 0.0, 10, 20, 20,
    true, false, true, false, 'SKU-UMT-083', 'SKU-UMT-083'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-083',
      item_code = 'SKU-UMT-083',
      category = 'Fresh Fruit',
      supplier = 'Fresh Mandiri Fruit & Veggie',
      supplier_id = v_sup_id,
      unit = 'kg',
      full_pack = 'kg = 1000 gr',
      price = 25000,
      new_price = 25000,
      avg_cost = 25000,
      qty_resto = 1.7,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Puspita Bahan Kue')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Cherry', 'Fresh Fruit', 'Toko Puspita Bahan Kue', v_sup_id,
    'kg', 'kg = 283 gr', 69000,
    2.0, 0.0, 5, 10, 10,
    true, false, true, false, 'SKU-UMT-084', 'SKU-UMT-084'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-084',
      item_code = 'SKU-UMT-084',
      category = 'Fresh Fruit',
      supplier = 'Toko Puspita Bahan Kue',
      supplier_id = v_sup_id,
      unit = 'kg',
      full_pack = 'kg = 283 gr',
      price = 69000,
      new_price = 69000,
      avg_cost = 69000,
      qty_resto = 2.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Bengkoang', 'Fresh Fruit', 'Pak Toyib (Supplier Sayur & Rempah Pasar)', v_sup_id,
    'kg', 'kg = 1000 gr', 20000,
    0.0, 0.0, 10, 20, 20,
    true, false, true, false, 'SKU-UMT-085', 'SKU-UMT-085'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-085',
      item_code = 'SKU-UMT-085',
      category = 'Fresh Fruit',
      supplier = 'Pak Toyib (Supplier Sayur & Rempah Pasar)',
      supplier_id = v_sup_id,
      unit = 'kg',
      full_pack = 'kg = 1000 gr',
      price = 20000,
      new_price = 20000,
      avg_cost = 20000,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('AEON Supermarket BSD City')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Daun Mint', 'Fresh Fruit', 'AEON Supermarket BSD City', v_sup_id,
    'pck', 'pck = 50 gr', 10000,
    5.0, 0.0, 10, 30.0, 30.0,
    true, false, true, false, 'SKU-UMT-086', 'SKU-UMT-086'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-086',
      item_code = 'SKU-UMT-086',
      category = 'Fresh Fruit',
      supplier = 'AEON Supermarket BSD City',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 50 gr',
      price = 10000,
      new_price = 10000,
      avg_cost = 10000,
      qty_resto = 5.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 30.0,
      monthly_quota_qty = 30.0,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Daun Pandan', 'Fresh Fruit', 'Pak Toyib (Supplier Sayur & Rempah Pasar)', v_sup_id,
    'pck', 'pck = 50 gr', 3000,
    2.0, 0.0, 10, 20, 20,
    true, false, true, false, 'SKU-UMT-087', 'SKU-UMT-087'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-087',
      item_code = 'SKU-UMT-087',
      category = 'Fresh Fruit',
      supplier = 'Pak Toyib (Supplier Sayur & Rempah Pasar)',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 50 gr',
      price = 3000,
      new_price = 3000,
      avg_cost = 3000,
      qty_resto = 2.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Daun Sereh', 'Fresh Fruit', 'Pak Toyib (Supplier Sayur & Rempah Pasar)', v_sup_id,
    'pck', 'pck = 50 gr', 5000,
    0.5, 0.0, 10, 20, 20,
    true, false, true, false, 'SKU-UMT-088', 'SKU-UMT-088'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-088',
      item_code = 'SKU-UMT-088',
      category = 'Fresh Fruit',
      supplier = 'Pak Toyib (Supplier Sayur & Rempah Pasar)',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 50 gr',
      price = 5000,
      new_price = 5000,
      avg_cost = 5000,
      qty_resto = 0.5,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Produksi Internal Barista Umatis')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Green Delight', 'Frozen Drink', 'Produksi Internal Barista Umatis', v_sup_id,
    'pck', 'pck = 1 pcs', 9049,
    14.0, 0.0, 10, 21.0, 21.0,
    false, false, true, false, 'SKU-UMT-089', 'SKU-UMT-089'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-089',
      item_code = 'SKU-UMT-089',
      category = 'Frozen Drink',
      supplier = 'Produksi Internal Barista Umatis',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1 pcs',
      price = 9049,
      new_price = 9049,
      avg_cost = 9049,
      qty_resto = 14.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 21.0,
      monthly_quota_qty = 21.0,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Produksi Internal Barista Umatis')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Dragon Beet', 'Frozen Drink', 'Produksi Internal Barista Umatis', v_sup_id,
    'pck', 'pck = 1 pcs', 10100,
    10.0, 0.0, 10, 21.0, 21.0,
    false, false, true, false, 'SKU-UMT-090', 'SKU-UMT-090'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-090',
      item_code = 'SKU-UMT-090',
      category = 'Frozen Drink',
      supplier = 'Produksi Internal Barista Umatis',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1 pcs',
      price = 10100,
      new_price = 10100,
      avg_cost = 10100,
      qty_resto = 10.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 21.0,
      monthly_quota_qty = 21.0,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Produksi Internal Barista Umatis')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Beta Caroot E.ne', 'Frozen Drink', 'Produksi Internal Barista Umatis', v_sup_id,
    'pck', 'pck = 1 pcs', 10100,
    3.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-091', 'SKU-UMT-091'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-091',
      item_code = 'SKU-UMT-091',
      category = 'Frozen Drink',
      supplier = 'Produksi Internal Barista Umatis',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1 pcs',
      price = 10100,
      new_price = 10100,
      avg_cost = 10100,
      qty_resto = 3.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Berry Much', 'Frozen Drink', 'Squeeze Indonesia (Juice & Smoothies)', v_sup_id,
    'pck', 'pck = 6 pcs', 93240,
    5.6667, 0.0, 5, 11.17, 11.17,
    false, false, true, false, 'SKU-UMT-092', 'SKU-UMT-092'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-092',
      item_code = 'SKU-UMT-092',
      category = 'Frozen Drink',
      supplier = 'Squeeze Indonesia (Juice & Smoothies)',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 6 pcs',
      price = 93240,
      new_price = 93240,
      avg_cost = 93240,
      qty_resto = 5.6667,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 11.17,
      monthly_quota_qty = 11.17,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Tropical', 'Frozen Drink', 'Squeeze Indonesia (Juice & Smoothies)', v_sup_id,
    'pck', 'pck = 6 pcs', 93240,
    8.3333, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-093', 'SKU-UMT-093'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-093',
      item_code = 'SKU-UMT-093',
      category = 'Frozen Drink',
      supplier = 'Squeeze Indonesia (Juice & Smoothies)',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 6 pcs',
      price = 93240,
      new_price = 93240,
      avg_cost = 93240,
      qty_resto = 8.3333,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Manggo Yougurt', 'Frozen Drink', 'Squeeze Indonesia (Juice & Smoothies)', v_sup_id,
    'pck', 'pck = 6 pcs', 93240,
    5.8333, 0.0, 5, 12.0, 12.0,
    false, false, true, false, 'SKU-UMT-094', 'SKU-UMT-094'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-094',
      item_code = 'SKU-UMT-094',
      category = 'Frozen Drink',
      supplier = 'Squeeze Indonesia (Juice & Smoothies)',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 6 pcs',
      price = 93240,
      new_price = 93240,
      avg_cost = 93240,
      qty_resto = 5.8333,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 12.0,
      monthly_quota_qty = 12.0,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Sunway Juice Frozen')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Alpukat', 'Frozen Drink', 'Sunway Juice Frozen', v_sup_id,
    'pck', 'pck = 10 pcs', 105000,
    0.1, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-095', 'SKU-UMT-095'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-095',
      item_code = 'SKU-UMT-095',
      category = 'Frozen Drink',
      supplier = 'Sunway Juice Frozen',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 10 pcs',
      price = 105000,
      new_price = 105000,
      avg_cost = 105000,
      qty_resto = 0.1,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Sunway Juice Frozen')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Sirsak', 'Frozen Drink', 'Sunway Juice Frozen', v_sup_id,
    'pck', 'pck = 10 pcs', 105000,
    1.5, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-096', 'SKU-UMT-096'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-096',
      item_code = 'SKU-UMT-096',
      category = 'Frozen Drink',
      supplier = 'Sunway Juice Frozen',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 10 pcs',
      price = 105000,
      new_price = 105000,
      avg_cost = 105000,
      qty_resto = 1.5,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Sunway Juice Frozen')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Jambu', 'Frozen Drink', 'Sunway Juice Frozen', v_sup_id,
    'pck', 'pck = 10 pcs', 105000,
    2.8, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-097', 'SKU-UMT-097'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-097',
      item_code = 'SKU-UMT-097',
      category = 'Frozen Drink',
      supplier = 'Sunway Juice Frozen',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 10 pcs',
      price = 105000,
      new_price = 105000,
      avg_cost = 105000,
      qty_resto = 2.8,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Sunway Juice Frozen')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Mangga', 'Frozen Drink', 'Sunway Juice Frozen', v_sup_id,
    'pck', 'pck = 10 pcs', 105000,
    1.0, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-098', 'SKU-UMT-098'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-098',
      item_code = 'SKU-UMT-098',
      category = 'Frozen Drink',
      supplier = 'Sunway Juice Frozen',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 10 pcs',
      price = 105000,
      new_price = 105000,
      avg_cost = 105000,
      qty_resto = 1.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Food Station Tjipinang Jaya')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Gula Pasir', 'Dry Goods', 'PT. Food Station Tjipinang Jaya', v_sup_id,
    'pck', 'pck = 1000 gr', 17500,
    11.0, 0.0, 10, 35.0, 35.0,
    false, false, true, false, 'SKU-UMT-099', 'SKU-UMT-099'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-099',
      item_code = 'SKU-UMT-099',
      category = 'Dry Goods',
      supplier = 'PT. Food Station Tjipinang Jaya',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 17500,
      new_price = 17500,
      avg_cost = 17500,
      qty_resto = 11.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 35.0,
      monthly_quota_qty = 35.0,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Naga Jaya Plastik & Bahan Kue')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Gula Stick White Sugar', 'Dry Goods', 'Toko Naga Jaya Plastik & Bahan Kue', v_sup_id,
    'pck', 'pck = 75 pcs', 70000,
    1.3333, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-100', 'SKU-UMT-100'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-100',
      item_code = 'SKU-UMT-100',
      category = 'Dry Goods',
      supplier = 'Toko Naga Jaya Plastik & Bahan Kue',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 75 pcs',
      price = 70000,
      new_price = 70000,
      avg_cost = 70000,
      qty_resto = 1.3333,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. David Roy Indonesia')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Gula Equelo (sejenis tropicana slim)', 'Dry Goods', 'PT. David Roy Indonesia', v_sup_id,
    'pck', 'pck = 1000 pcs', 283050,
    0.0, 0.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-101', 'SKU-UMT-101'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-101',
      item_code = 'SKU-UMT-101',
      category = 'Dry Goods',
      supplier = 'PT. David Roy Indonesia',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 pcs',
      price = 283050,
      new_price = 283050,
      avg_cost = 283050,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Elisa')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Gula Tropicana Slim', 'Dry Goods', 'Toko Elisa', v_sup_id,
    'pck', 'pck = 100 pcs', 100000,
    3.0, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-102', 'SKU-UMT-102'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-102',
      item_code = 'SKU-UMT-102',
      category = 'Dry Goods',
      supplier = 'Toko Elisa',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 100 pcs',
      price = 100000,
      new_price = 100000,
      avg_cost = 100000,
      qty_resto = 3.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Auromas Indonesia (Tokopedia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Coconut Srispy', 'Dry Goods', 'Auromas Indonesia (Tokopedia)', v_sup_id,
    'pck', 'pck = 1000 gr', 200000,
    5.0, 5.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-103', 'SKU-UMT-103'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-103',
      item_code = 'SKU-UMT-103',
      category = 'Dry Goods',
      supplier = 'Auromas Indonesia (Tokopedia)',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 200000,
      new_price = 200000,
      avg_cost = 200000,
      qty_resto = 5.0,
      qty_central = 5.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Elisa')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Gress Jelly', 'Dry Goods', 'Toko Elisa', v_sup_id,
    'pck', 'pck = 200 gr', 6500,
    0.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-104', 'SKU-UMT-104'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-104',
      item_code = 'SKU-UMT-104',
      category = 'Dry Goods',
      supplier = 'Toko Elisa',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 200 gr',
      price = 6500,
      new_price = 6500,
      avg_cost = 6500,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Naga Jaya Plastik & Bahan Kue')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Chocolate Souce', 'Dry Goods', 'Toko Naga Jaya Plastik & Bahan Kue', v_sup_id,
    'pck', 'pck = 300 gr', 24000,
    4.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-105', 'SKU-UMT-105'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-105',
      item_code = 'SKU-UMT-105',
      category = 'Dry Goods',
      supplier = 'Toko Naga Jaya Plastik & Bahan Kue',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 300 gr',
      price = 24000,
      new_price = 24000,
      avg_cost = 24000,
      qty_resto = 4.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Elisa')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Nade Coco', 'Dry Goods', 'Toko Elisa', v_sup_id,
    'pck', 'pck = 600 gr', 17666,
    12.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-106', 'SKU-UMT-106'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-106',
      item_code = 'SKU-UMT-106',
      category = 'Dry Goods',
      supplier = 'Toko Elisa',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 600 gr',
      price = 17666,
      new_price = 17666,
      avg_cost = 17666,
      qty_resto = 12.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Tokopedia Official Marketplace')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Kacang Pistachio', 'Dry Goods', 'Tokopedia Official Marketplace', v_sup_id,
    'pck', 'pck = 1000 gr', 200000,
    0.3, 0.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-107', 'SKU-UMT-107'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-107',
      item_code = 'SKU-UMT-107',
      category = 'Dry Goods',
      supplier = 'Tokopedia Official Marketplace',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 200000,
      new_price = 200000,
      avg_cost = 200000,
      qty_resto = 0.3,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Tokopedia Official Marketplace')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Lotus Crumble', 'Dry Goods', 'Tokopedia Official Marketplace', v_sup_id,
    'pck', 'pck = 1000 gr', 150000,
    0.5, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-108', 'SKU-UMT-108'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-108',
      item_code = 'SKU-UMT-108',
      category = 'Dry Goods',
      supplier = 'Tokopedia Official Marketplace',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 150000,
      new_price = 150000,
      avg_cost = 150000,
      qty_resto = 0.5,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Groseri Ingredients (Tokopedia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Cinamon powder', 'Dry Goods', 'Groseri Ingredients (Tokopedia)', v_sup_id,
    'pck', 'pck = 1000 gr', 284000,
    0.2, 0.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-109', 'SKU-UMT-109'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-109',
      item_code = 'SKU-UMT-109',
      category = 'Dry Goods',
      supplier = 'Groseri Ingredients (Tokopedia)',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 284000,
      new_price = 284000,
      avg_cost = 284000,
      qty_resto = 0.2,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Groseri Ingredients (Tokopedia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Cinamon Batang Garnish', 'Dry Goods', 'Groseri Ingredients (Tokopedia)', v_sup_id,
    'pck', 'pck = 1000 gr', 200000,
    0.6, 0.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-110', 'SKU-UMT-110'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-110',
      item_code = 'SKU-UMT-110',
      category = 'Dry Goods',
      supplier = 'Groseri Ingredients (Tokopedia)',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 200000,
      new_price = 200000,
      avg_cost = 200000,
      qty_resto = 0.6,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Groseri Ingredients (Tokopedia)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Cengkeh', 'Dry Goods', 'Groseri Ingredients (Tokopedia)', v_sup_id,
    'pck', 'pck = 1000 gr', 360000,
    0.0, 0.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-111', 'SKU-UMT-111'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-111',
      item_code = 'SKU-UMT-111',
      category = 'Dry Goods',
      supplier = 'Groseri Ingredients (Tokopedia)',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 360000,
      new_price = 360000,
      avg_cost = 360000,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Elisa')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Biji Selasih', 'Dry Goods', 'Toko Elisa', v_sup_id,
    'pck', 'pck = 50 gr', 11000,
    3.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-112', 'SKU-UMT-112'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-112',
      item_code = 'SKU-UMT-112',
      category = 'Dry Goods',
      supplier = 'Toko Elisa',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 50 gr',
      price = 11000,
      new_price = 11000,
      avg_cost = 11000,
      qty_resto = 3.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Tokopedia Official Marketplace')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Toothpick Bamboe', 'Dry Goods', 'Tokopedia Official Marketplace', v_sup_id,
    'pck', 'pck = 50 pcs', 31500,
    4.0, 23.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-113', 'SKU-UMT-113'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-113',
      item_code = 'SKU-UMT-113',
      category = 'Dry Goods',
      supplier = 'Tokopedia Official Marketplace',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 50 pcs',
      price = 31500,
      new_price = 31500,
      avg_cost = 31500,
      qty_resto = 4.0,
      qty_central = 23.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Tokopedia Official Marketplace')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Payung Garnish', 'Dry Goods', 'Tokopedia Official Marketplace', v_sup_id,
    'pck', 'pck = 50 pcs', 50000,
    2.0, 17.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-114', 'SKU-UMT-114'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-114',
      item_code = 'SKU-UMT-114',
      category = 'Dry Goods',
      supplier = 'Tokopedia Official Marketplace',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 50 pcs',
      price = 50000,
      new_price = 50000,
      avg_cost = 50000,
      qty_resto = 2.0,
      qty_central = 17.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Elisa')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Gas Revil Butane', 'Dry Goods', 'Toko Elisa', v_sup_id,
    'pcs', 'pcs = 1 pcs', 41000,
    2.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-115', 'SKU-UMT-115'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-115',
      item_code = 'SKU-UMT-115',
      category = 'Dry Goods',
      supplier = 'Toko Elisa',
      supplier_id = v_sup_id,
      unit = 'pcs',
      full_pack = 'pcs = 1 pcs',
      price = 41000,
      new_price = 41000,
      avg_cost = 41000,
      qty_resto = 2.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Tokopedia Official Marketplace')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Charger N2o MOSA', 'Dry Goods', 'Tokopedia Official Marketplace', v_sup_id,
    'pck', 'pck = 10 pcs', 70000,
    4.0, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-116', 'SKU-UMT-116'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-116',
      item_code = 'SKU-UMT-116',
      category = 'Dry Goods',
      supplier = 'Tokopedia Official Marketplace',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 10 pcs',
      price = 70000,
      new_price = 70000,
      avg_cost = 70000,
      qty_resto = 4.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Rotaryana Prima')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Charger Co2 ISI', 'Dry Goods', 'PT. Rotaryana Prima', v_sup_id,
    'pck', 'pck = 10 pcs', 70000,
    27.0, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-117', 'SKU-UMT-117'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-117',
      item_code = 'SKU-UMT-117',
      category = 'Dry Goods',
      supplier = 'PT. Rotaryana Prima',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 10 pcs',
      price = 70000,
      new_price = 70000,
      avg_cost = 70000,
      qty_resto = 27.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Juara Plastik')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Straw Ice', 'Take Away', 'Toko Juara Plastik', v_sup_id,
    'pck', 'pck = 100 pcs', 20000,
    6.0, 9.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-118', 'SKU-UMT-118'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-118',
      item_code = 'SKU-UMT-118',
      category = 'Take Away',
      supplier = 'Toko Juara Plastik',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 100 pcs',
      price = 20000,
      new_price = 20000,
      avg_cost = 20000,
      qty_resto = 6.0,
      qty_central = 9.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Juara Plastik')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Straw Hot', 'Take Away', 'Toko Juara Plastik', v_sup_id,
    'pck', 'pck = 50 pcs', 6000,
    1.0, 7.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-119', 'SKU-UMT-119'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-119',
      item_code = 'SKU-UMT-119',
      category = 'Take Away',
      supplier = 'Toko Juara Plastik',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 50 pcs',
      price = 6000,
      new_price = 6000,
      avg_cost = 6000,
      qty_resto = 1.0,
      qty_central = 7.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Ransom Berkat Packaging')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Cup Glass Ice', 'Take Away', 'Ransom Berkat Packaging', v_sup_id,
    'pcs', 'pcs = 1 pcs', 730,
    7.0, 122.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-120', 'SKU-UMT-120'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-120',
      item_code = 'SKU-UMT-120',
      category = 'Take Away',
      supplier = 'Ransom Berkat Packaging',
      supplier_id = v_sup_id,
      unit = 'pcs',
      full_pack = 'pcs = 1 pcs',
      price = 730,
      new_price = 730,
      avg_cost = 730,
      qty_resto = 7.0,
      qty_central = 122.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Ransom Berkat Packaging')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Cup Glass Hot', 'Take Away', 'Ransom Berkat Packaging', v_sup_id,
    'pcs', 'pcs = 1 pcs', 836,
    6.0, 38.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-121', 'SKU-UMT-121'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-121',
      item_code = 'SKU-UMT-121',
      category = 'Take Away',
      supplier = 'Ransom Berkat Packaging',
      supplier_id = v_sup_id,
      unit = 'pcs',
      full_pack = 'pcs = 1 pcs',
      price = 836,
      new_price = 836,
      avg_cost = 836,
      qty_resto = 6.0,
      qty_central = 38.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Ransom Berkat Packaging')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Tutup Cup ice', 'Take Away', 'Ransom Berkat Packaging', v_sup_id,
    'pcs', 'pcs = 1 pcs', 258,
    8.0, 136.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-122', 'SKU-UMT-122'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-122',
      item_code = 'SKU-UMT-122',
      category = 'Take Away',
      supplier = 'Ransom Berkat Packaging',
      supplier_id = v_sup_id,
      unit = 'pcs',
      full_pack = 'pcs = 1 pcs',
      price = 258,
      new_price = 258,
      avg_cost = 258,
      qty_resto = 8.0,
      qty_central = 136.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Ransom Berkat Packaging')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Tutup Cup Hot', 'Take Away', 'Ransom Berkat Packaging', v_sup_id,
    'pcs', 'pcs = 1 pcs', 258,
    9.0, 19.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-123', 'SKU-UMT-123'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-123',
      item_code = 'SKU-UMT-123',
      category = 'Take Away',
      supplier = 'Ransom Berkat Packaging',
      supplier_id = v_sup_id,
      unit = 'pcs',
      full_pack = 'pcs = 1 pcs',
      price = 258,
      new_price = 258,
      avg_cost = 258,
      qty_resto = 9.0,
      qty_central = 19.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Juara Plastik')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Slive', 'Take Away', 'Toko Juara Plastik', v_sup_id,
    'pck', 'pck = 10 pcs', 14000,
    0.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-124', 'SKU-UMT-124'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-124',
      item_code = 'SKU-UMT-124',
      category = 'Take Away',
      supplier = 'Toko Juara Plastik',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 10 pcs',
      price = 14000,
      new_price = 14000,
      avg_cost = 14000,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Juara Plastik')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Plastik Take Away', 'Take Away', 'Toko Juara Plastik', v_sup_id,
    'pck', 'pck = 50 pcs', 14000,
    1.0, 5.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-125', 'SKU-UMT-125'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-125',
      item_code = 'SKU-UMT-125',
      category = 'Take Away',
      supplier = 'Toko Juara Plastik',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 50 pcs',
      price = 14000,
      new_price = 14000,
      avg_cost = 14000,
      qty_resto = 1.0,
      qty_central = 5.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Prima Kemasindo')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Plastik Wrapping', 'Take Away', 'PT. Prima Kemasindo', v_sup_id,
    'pcs', 'pcs = 1 pcs', 111000,
    0.0, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-126', 'SKU-UMT-126'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-126',
      item_code = 'SKU-UMT-126',
      category = 'Take Away',
      supplier = 'PT. Prima Kemasindo',
      supplier_id = v_sup_id,
      unit = 'pcs',
      full_pack = 'pcs = 1 pcs',
      price = 111000,
      new_price = 111000,
      avg_cost = 111000,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Berkat Plastik')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Trash bag 60 x 100', 'Take Away', 'Berkat Plastik', v_sup_id,
    'pcs', 'pcs = 1 pcs', 9200,
    0.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-127', 'SKU-UMT-127'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-127',
      item_code = 'SKU-UMT-127',
      category = 'Take Away',
      supplier = 'Berkat Plastik',
      supplier_id = v_sup_id,
      unit = 'pcs',
      full_pack = 'pcs = 1 pcs',
      price = 9200,
      new_price = 9200,
      avg_cost = 9200,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Elisa')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Sunlight Mama lemon', 'Take Away', 'Toko Elisa', v_sup_id,
    'Crtn', 'Crtn = 12 pcs', 192000,
    0.0, 0.0, 5, 10, 10,
    false, false, true, false, 'SKU-UMT-128', 'SKU-UMT-128'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-128',
      item_code = 'SKU-UMT-128',
      category = 'Take Away',
      supplier = 'Toko Elisa',
      supplier_id = v_sup_id,
      unit = 'Crtn',
      full_pack = 'Crtn = 12 pcs',
      price = 192000,
      new_price = 192000,
      avg_cost = 192000,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Elisa')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Nutrijelly Lychee', 'Dry Goods', 'Toko Elisa', v_sup_id,
    'pck', 'pck = 15 gr', 5600,
    16.0, 0.0, 10, 20, 20,
    false, false, true, false, 'SKU-UMT-129', 'SKU-UMT-129'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-129',
      item_code = 'SKU-UMT-129',
      category = 'Dry Goods',
      supplier = 'Toko Elisa',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 15 gr',
      price = 5600,
      new_price = 5600,
      avg_cost = 5600,
      qty_resto = 16.0,
      qty_central = 0.0,
      min_stock = 10,
      par_stock = 20,
      monthly_quota_qty = 20,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Cincau Fresh Pasar Umum')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Merah Delima', 'Dry Goods', 'Cincau Fresh Pasar Umum', v_sup_id,
    'pck', 'pck = 1000 gr', 25000,
    0.0, 0.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-130', 'SKU-UMT-130'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-130',
      item_code = 'SKU-UMT-130',
      category = 'Dry Goods',
      supplier = 'Cincau Fresh Pasar Umum',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 25000,
      new_price = 25000,
      avg_cost = 25000,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Kelapa Muda Sampora', 'Fresh Fruit', 'Coco Fresh Supplier Kelapa', v_sup_id,
    'pcs', 'pcs = 1 pcs', 12000,
    1.0, 0.0, 5, 10, 10,
    true, false, true, false, 'SKU-UMT-131', 'SKU-UMT-131'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-131',
      item_code = 'SKU-UMT-131',
      category = 'Fresh Fruit',
      supplier = 'Coco Fresh Supplier Kelapa',
      supplier_id = v_sup_id,
      unit = 'pcs',
      full_pack = 'pcs = 1 pcs',
      price = 12000,
      new_price = 12000,
      avg_cost = 12000,
      qty_resto = 1.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Orange Sunkist', 'Fresh Fruit', 'Fresh Mandiri Fruit & Veggie', v_sup_id,
    'kg', 'kg = 1000 gr', 55000,
    0.0, 0.0, 3, 6, 6,
    true, false, true, false, 'SKU-UMT-132', 'SKU-UMT-132'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-132',
      item_code = 'SKU-UMT-132',
      category = 'Fresh Fruit',
      supplier = 'Fresh Mandiri Fruit & Veggie',
      supplier_id = v_sup_id,
      unit = 'kg',
      full_pack = 'kg = 1000 gr',
      price = 55000,
      new_price = 55000,
      avg_cost = 55000,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 3,
      par_stock = 6,
      monthly_quota_qty = 6,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Astro Quick Commerce')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Fresh Milk Urgent (Astro)', 'Milk', 'Astro Quick Commerce', v_sup_id,
    'pcs', 'pcs = 1000 ml', 33000,
    0.0, 0.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-133', 'SKU-UMT-133'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-133',
      item_code = 'SKU-UMT-133',
      category = 'Milk',
      supplier = 'Astro Quick Commerce',
      supplier_id = v_sup_id,
      unit = 'pcs',
      full_pack = 'pcs = 1000 ml',
      price = 33000,
      new_price = 33000,
      avg_cost = 33000,
      qty_resto = 0.0,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Denali Gourmet (Suplai Garage)')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Powder Red Velvet', 'Powder', 'Denali Gourmet (Suplai Garage)', v_sup_id,
    'pck', 'pck = 1000 gr', 130000,
    1.0, 0.0, 2, 4, 4,
    false, false, true, false, 'SKU-UMT-134', 'SKU-UMT-134'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-134',
      item_code = 'SKU-UMT-134',
      category = 'Powder',
      supplier = 'Denali Gourmet (Suplai Garage)',
      supplier_id = v_sup_id,
      unit = 'pck',
      full_pack = 'pck = 1000 gr',
      price = 130000,
      new_price = 130000,
      avg_cost = 130000,
      qty_resto = 1.0,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Produksi Internal Barista Umatis')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Teh Base (Prep)', 'Prep / Bahan Olahan', 'Produksi Internal Barista Umatis', v_sup_id,
    'Btl', 'Btl = 10000 ml', 10750,
    1.0, 0.0, 2, 4, 4,
    false, true, true, false, 'SKU-UMT-135', 'SKU-UMT-135'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-135',
      item_code = 'SKU-UMT-135',
      category = 'Prep / Bahan Olahan',
      supplier = 'Produksi Internal Barista Umatis',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 10000 ml',
      price = 10750,
      new_price = 10750,
      avg_cost = 10750,
      qty_resto = 1.0,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Produksi Internal Barista Umatis')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Blue Tea Base (Prep)', 'Prep / Bahan Olahan', 'Produksi Internal Barista Umatis', v_sup_id,
    'Btl', 'Btl = 500 ml', 3440,
    1.0, 0.0, 2, 4, 4,
    false, true, true, false, 'SKU-UMT-136', 'SKU-UMT-136'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-136',
      item_code = 'SKU-UMT-136',
      category = 'Prep / Bahan Olahan',
      supplier = 'Produksi Internal Barista Umatis',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 500 ml',
      price = 3440,
      new_price = 3440,
      avg_cost = 3440,
      qty_resto = 1.0,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Produksi Internal Barista Umatis')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Jasmine Green Tea Base (Prep)', 'Prep / Bahan Olahan', 'Produksi Internal Barista Umatis', v_sup_id,
    'Btl', 'Btl = 500 ml', 3133,
    1.0, 0.0, 2, 4, 4,
    false, true, true, false, 'SKU-UMT-137', 'SKU-UMT-137'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-137',
      item_code = 'SKU-UMT-137',
      category = 'Prep / Bahan Olahan',
      supplier = 'Produksi Internal Barista Umatis',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 500 ml',
      price = 3133,
      new_price = 3133,
      avg_cost = 3133,
      qty_resto = 1.0,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Produksi Internal Barista Umatis')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Simple Syrup / Gula Cair (Prep)', 'Prep / Bahan Olahan', 'Produksi Internal Barista Umatis', v_sup_id,
    'Btl', 'Btl = 800 ml', 17500,
    2.0, 0.0, 5, 10, 10,
    false, true, true, false, 'SKU-UMT-138', 'SKU-UMT-138'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-138',
      item_code = 'SKU-UMT-138',
      category = 'Prep / Bahan Olahan',
      supplier = 'Produksi Internal Barista Umatis',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 800 ml',
      price = 17500,
      new_price = 17500,
      avg_cost = 17500,
      qty_resto = 2.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Produksi Internal Barista Umatis')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Soda Water Siphon (Prep)', 'Prep / Bahan Olahan', 'Produksi Internal Barista Umatis', v_sup_id,
    'Btl', 'Btl = 900 ml', 7000,
    2.0, 0.0, 5, 10, 10,
    false, true, true, false, 'SKU-UMT-139', 'SKU-UMT-139'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-139',
      item_code = 'SKU-UMT-139',
      category = 'Prep / Bahan Olahan',
      supplier = 'Produksi Internal Barista Umatis',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 900 ml',
      price = 7000,
      new_price = 7000,
      avg_cost = 7000,
      qty_resto = 2.0,
      qty_central = 0.0,
      min_stock = 5,
      par_stock = 10,
      monthly_quota_qty = 10,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Produksi Internal Barista Umatis')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Jus Jeruk Peras Murni (Prep)', 'Prep / Bahan Olahan', 'Produksi Internal Barista Umatis', v_sup_id,
    'Btl', 'Btl = 3000 ml', 115000,
    1.0, 0.0, 2, 4, 4,
    false, true, true, false, 'SKU-UMT-140', 'SKU-UMT-140'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-140',
      item_code = 'SKU-UMT-140',
      category = 'Prep / Bahan Olahan',
      supplier = 'Produksi Internal Barista Umatis',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 3000 ml',
      price = 115000,
      new_price = 115000,
      avg_cost = 115000,
      qty_resto = 1.0,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Produksi Internal Barista Umatis')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Foaming Bravocado (Prep)', 'Prep / Bahan Olahan', 'Produksi Internal Barista Umatis', v_sup_id,
    'Btl', 'Btl = 1000 gr', 30657,
    1.0, 0.0, 2, 4, 4,
    false, true, true, false, 'SKU-UMT-141', 'SKU-UMT-141'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-141',
      item_code = 'SKU-UMT-141',
      category = 'Prep / Bahan Olahan',
      supplier = 'Produksi Internal Barista Umatis',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 1000 gr',
      price = 30657,
      new_price = 30657,
      avg_cost = 30657,
      qty_resto = 1.0,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Produksi Internal Barista Umatis')) LIMIT 1;
  v_mat_id := public.bv_upsert_material_v13(
    v_tenant_id, v_bsd_id, 'Foaming Cheese (Prep)', 'Prep / Bahan Olahan', 'Produksi Internal Barista Umatis', v_sup_id,
    'Btl', 'Btl = 1000 gr', 88557,
    1.0, 0.0, 2, 4, 4,
    false, true, true, false, 'SKU-UMT-142', 'SKU-UMT-142'
  );
  UPDATE public.materials
  SET sku = 'SKU-UMT-142',
      item_code = 'SKU-UMT-142',
      category = 'Prep / Bahan Olahan',
      supplier = 'Produksi Internal Barista Umatis',
      supplier_id = v_sup_id,
      unit = 'Btl',
      full_pack = 'Btl = 1000 gr',
      price = 88557,
      new_price = 88557,
      avg_cost = 88557,
      qty_resto = 1.0,
      qty_central = 0.0,
      min_stock = 2,
      par_stock = 4,
      monthly_quota_qty = 4,
      is_active = true
  WHERE id = v_mat_id;

  -- Sinkronkan unit_conversions & material_location_costs untuk seluruh 142 material Umatis
  BEGIN
    INSERT INTO public.unit_conversions (tenant_id, branch_id, material_id, from_unit, to_unit, factor)
    SELECT
      m.tenant_id,
      m.branch_id,
      m.id,
      lower(trim(regexp_replace(split_part(m.full_pack, '=', 2), '^[0-9]+(\.[0-9]+)?\s*', ''))),
      lower(trim(m.unit)),
      (1.0 / ((regexp_match(split_part(m.full_pack, '=', 2), '([0-9]+(?:\.[0-9]+)?)'))[1])::numeric)
    FROM public.materials m
    WHERE m.tenant_id = v_tenant_id AND m.branch_id = v_bsd_id AND m.full_pack LIKE '%=%'
      AND NOT EXISTS (
        SELECT 1 FROM public.unit_conversions uc
        WHERE uc.material_id = m.id
          AND lower(trim(uc.to_unit)) = lower(trim(m.unit))
      );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.material_location_costs (tenant_id, branch_id, material_id, location, average_unit_cost, source, is_opening_estimated, updated_at)
    SELECT m.tenant_id, m.branch_id, m.id, loc.loc_val, COALESCE(m.new_price, m.price, 0), 'UMATIS_AUG2026', false, now()
    FROM public.materials m
    CROSS JOIN (VALUES ('RESTO'::public.stock_location), ('CENTRAL'::public.stock_location)) AS loc(loc_val)
    WHERE m.tenant_id = v_tenant_id AND m.branch_id = v_bsd_id
    ON CONFLICT (tenant_id, material_id, location) DO UPDATE
      SET average_unit_cost = EXCLUDED.average_unit_cost,
          source = 'UMATIS_AUG2026',
          updated_at = now();
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 7. SEED 68 RECIPES UMATIS (59 MENU KOMERSIAL + 9 RTD BEER) BESERTA KOMPOSISI BAHAN & PENJUALAN AGUSTUS 2026

  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Espresso', 'RCP-UMT-001', 'KOPI',
    24000, 4400, 220, 4620,
    0.1925, 0.05, 24000, 'down', 1000, 0,
    18, 'DOG', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 220000, 4400)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Piccolo', 'RCP-UMT-002', 'KOPI',
    26000, 3187, 159, 3346,
    0.1287, 0.05, 26000, 'down', 1000, 0,
    8, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'gr', 220000, 2200)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 50.0, 'gr', 19739, 987)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Latte', 'RCP-UMT-003', 'KOPI',
    36000, 7541, 377, 7918,
    0.2199, 0.05, 36000, 'down', 1000, 0,
    13, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 220000, 4400)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 19739, 2961)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 50.0, 'gr', 18000, 180)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Capuccino', 'RCP-UMT-004', 'KOPI',
    36000, 6890, 344, 7234,
    0.2009, 0.05, 36000, 'down', 1000, 0,
    13, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 220000, 4400)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 19739, 1974)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 18000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-032' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'gr', 156000, 156)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Americano', 'RCP-UMT-005', 'KOPI',
    28000, 5043, 252, 5295,
    0.1891, 0.05, 28000, 'down', 1000, 0,
    11, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 220000, 4400)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-015' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'ml', 19500, 103)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 18000, 540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Creme Brulee', 'RCP-UMT-006', 'KOPI',
    36000, 9887, 494, 10381,
    0.2884, 0.05, 36000, 'down', 1000, 0,
    20, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 220000, 4400)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 19739, 1974)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-057' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 15.0, 'ml', 111000, 2220)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-100' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 70000, 933)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 18000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Avocado Coffee', 'RCP-UMT-007', 'KOPI',
    38000, 9784, 489, 10273,
    0.2703, 0.05, 38000, 'down', 1000, 0,
    27, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'gr', 220000, 2200)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-037' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 104880, 3146)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 160.0, 'gr', 19739, 3158)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-141' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 30657, 920)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 18000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Salted caramel Chesse Coffee', 'RCP-UMT-008', 'KOPI',
    38000, 11371, 569, 11940,
    0.3142, 0.05, 38000, 'down', 1000, 0,
    27, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'gr', 220000, 2200)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-061' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 100000, 2206)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 200.0, 'gr', 19739, 3948)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-142' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 88557, 2657)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 18000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Klepon Latte Signature', 'RCP-UMT-009', 'KOPI',
    42000, 15574, 779, 16353,
    0.3894, 0.05, 42000, 'down', 1000, 0,
    27, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 220000, 4400)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 19739, 1974)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-052' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 15.0, 'ml', 111000, 2220)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-053' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'ml', 111000, 4440)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-103' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'gr', 200000, 2000)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 18000, 540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Kopi Rempah', 'RCP-UMT-010', 'KOPI',
    38000, 11513, 576, 12089,
    0.3181, 0.05, 38000, 'down', 1000, 0,
    25, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 70.0, 'gr', 19739, 1382)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 220000, 4400)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-059' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'ml', 111000, 2960)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-109' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'gr', 284000, 284)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-111' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'gr', 360000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-020' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 11500, 767)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 18000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-110' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 5.0, 'gr', 200000, 1000)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Flavored Latte', 'RCP-UMT-011', 'KOPI',
    42000, 11981, 599, 12580,
    0.2995, 0.05, 42000, 'down', 1000, 0,
    20, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 220000, 4400)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 19739, 2961)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 50.0, 'gr', 18000, 180)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-055' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'ml', 111000, 4440)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Flate white', 'RCP-UMT-012', 'KOPI',
    36000, 7361, 368, 7729,
    0.2147, 0.05, 36000, 'down', 1000, 0,
    12, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 19739, 2961)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 220000, 4400)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Kintamani Aren Latte', 'RCP-UMT-013', 'KOPI',
    42000, 13018, 651, 13669,
    0.3255, 0.05, 42000, 'down', 1000, 0,
    22, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 19739, 2961)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 220000, 4400)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-062' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 15.0, 'gr', 100000, 1500)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-063' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 15.0, 'gr', 156000, 2147)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-041' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 55000, 1650)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 18000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Butterscoth Sea Salt Kusamba', 'RCP-UMT-014', 'KOPI',
    42000, 14661, 733, 15394,
    0.3665, 0.05, 42000, 'down', 1000, 0,
    26, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-057' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 25.0, 'ml', 111000, 3700)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-064' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 5.0, 'gr', 80000, 400)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 120.0, 'gr', 18000, 432)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 120.0, 'gr', 19739, 2369)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 220000, 4400)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-039' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 62000, 1860)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-108' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'gr', 150000, 1500)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Huzelnut Coffee Cream', 'RCP-UMT-015', 'KOPI',
    38000, 12452, 623, 13075,
    0.3441, 0.05, 38000, 'down', 1000, 0,
    26, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-055' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'ml', 111000, 2960)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 120.0, 'gr', 18000, 432)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-073' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 80.0, 'gr', 14500, 1160)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 220000, 4400)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-017' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 75000, 1500)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-107' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'gr', 200000, 2000)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Matcha', 'RCP-UMT-016', 'NON-KOPI',
    30000, 7734, 387, 8121,
    0.2707, 0.05, 30000, 'down', 1000, 0,
    27, 'DOG', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-033' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 180000, 5400)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 19739, 1974)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 18000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Chocolate', 'RCP-UMT-017', 'NON-KOPI',
    30000, 7014, 351, 7365,
    0.2455, 0.05, 30000, 'down', 1000, 0,
    23, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-032' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 156000, 4680)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 19739, 1974)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 18000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Red Velvet', 'RCP-UMT-018', 'NON-KOPI',
    30000, 6234, 312, 6546,
    0.2182, 0.05, 30000, 'down', 1000, 0,
    22, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-134' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 130000, 3900)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 19739, 1974)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 18000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Choco Black Forest', 'RCP-UMT-019', 'NON-KOPI',
    42000, 9914, 496, 10410,
    0.2479, 0.05, 42000, 'down', 1000, 0,
    25, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-032' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 156000, 3120)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 19739, 1974)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 18000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-056' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'ml', 111000, 1480)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-058' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'ml', 111000, 1480)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-017' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 75000, 1500)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Ice Lychee tea', 'RCP-UMT-020', 'TEA',
    32000, 5750, 288, 6038,
    0.1887, 0.05, 32000, 'down', 1000, 0,
    15, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-035' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 40191, 2411)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-015' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'ml', 19500, 154)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 18000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-077' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 25.0, 'gr', 27000, 1195)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-113' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 31500, 630)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-086' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 5.0, 'gr', 10000, 1000)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Ice Lemon Tea', 'RCP-UMT-021', 'TEA',
    24000, 4915, 246, 5161,
    0.215, 0.05, 24000, 'down', 1000, 0,
    10, 'DOG', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-036' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 40191, 2411)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-015' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'ml', 19500, 154)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 18000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-075' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 18.0, 'gr', 55000, 990)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-086' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 5.0, 'gr', 10000, 1000)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Ice Lemonrass Tea', 'RCP-UMT-022', 'TEA',
    24000, 5573, 279, 5852,
    0.2438, 0.05, 24000, 'down', 1000, 0,
    19, 'DOG', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-034' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 33.0, 'gr', 93000, 3069)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-015' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'ml', 19500, 154)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 18000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-075' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 18.0, 'gr', 55000, 990)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-086' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 5.0, 'gr', 10000, 1000)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Es Teh Tawar', 'RCP-UMT-023', 'TEA',
    15000, 755, 38, 793,
    0.0529, 0.05, 15000, 'down', 1000, 0,
    5, 'DOG', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-135' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 200.0, 'ml', 10750, 215)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 18000, 540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Es Teh Manis', 'RCP-UMT-024', 'TEA',
    18000, 1630, 82, 1712,
    0.0951, 0.05, 18000, 'down', 1000, 0,
    9, 'DOG', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-135' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 200.0, 'ml', 10750, 215)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 18000, 540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-138' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 40.0, 'ml', 17500, 875)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Es Kelapa Muda', 'RCP-UMT-025', 'NON-KOPI',
    32000, 6160, 308, 6468,
    0.2021, 0.05, 32000, 'down', 1000, 0,
    20, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-072' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 50.0, 'gr', 55000, 2750)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-073' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 14500, 2175)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-138' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 40.0, 'ml', 17500, 875)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 18000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Es Kelapa Jeruk', 'RCP-UMT-026', 'NON-KOPI',
    32000, 7760, 388, 8148,
    0.2546, 0.05, 32000, 'down', 1000, 0,
    20, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-072' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 40.0, 'gr', 55000, 2200)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-073' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 14500, 1450)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-138' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 40.0, 'ml', 17500, 875)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 18000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-140' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 75.0, 'ml', 115000, 2875)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Kelapa Muda Utuh', 'RCP-UMT-027', 'NON-KOPI',
    36000, 12500, 625, 13125,
    0.3646, 0.05, 36000, 'down', 1000, 0,
    33, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-071' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 11500, 11500)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-114' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 50000, 1000)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Es Jeruk', 'RCP-UMT-028', 'NON-KOPI',
    26000, 6985, 349, 7334,
    0.2821, 0.05, 26000, 'down', 1000, 0,
    25, 'DOG', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-140' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'ml', 115000, 5750)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-138' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 40.0, 'ml', 17500, 875)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 18000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Air Mineral', 'RCP-UMT-029', 'NON-KOPI',
    14000, 2417, 121, 2538,
    0.1813, 0.05, 14000, 'down', 1000, 0,
    17, 'DOG', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-022' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 58000, 2417)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Dilmah Tea Pot', 'RCP-UMT-030', 'TEA',
    48000, 3025, 151, 3176,
    0.0662, 0.05, 48000, 'down', 1000, 0,
    12, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-013' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'gr', 5536, 2768)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-015' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 250.0, 'ml', 19500, 257)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Es Daluman', 'RCP-UMT-031', 'NON-KOPI',
    32000, 5334, 267, 5601,
    0.175, 0.05, 32000, 'down', 1000, 0,
    21, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-074' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 50.0, 'gr', 15000, 1500)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-130' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 25000, 750)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-021' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 14000, 2100)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-069' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 92000, 552)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 120.0, 'gr', 18000, 432)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Pistachio Matcha', 'RCP-UMT-032', 'NON-KOPI',
    38000, 11361, 568, 11929,
    0.3139, 0.05, 38000, 'down', 1000, 0,
    27, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-054' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'ml', 111000, 2960)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 120.0, 'gr', 18000, 432)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 120.0, 'gr', 19739, 2369)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-033' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 180000, 3600)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-107' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'gr', 200000, 2000)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Bali Magical Sky', 'RCP-UMT-033', 'MOCKTAIL',
    42000, 11342, 567, 11909,
    0.2835, 0.05, 42000, 'down', 1000, 0,
    22, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-065' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 16095, 443)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-073' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 14500, 435)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-048' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'ml', 111000, 4440)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-049' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'ml', 111000, 4440)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-106' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'gr', 17666, 294)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-083' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 25000, 750)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 18000, 540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Canggu Sunset', 'RCP-UMT-034', 'MOCKTAIL',
    42000, 7851, 393, 8244,
    0.1963, 0.05, 42000, 'down', 1000, 0,
    17, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-042' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 166500, 3281)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-047' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'ml', 111000, 2960)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 18000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-075' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'gr', 55000, 550)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-139' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 90.0, 'ml', 7000, 700)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Relax On Nusa Dua Beach', 'RCP-UMT-035', 'MOCKTAIL',
    42000, 8636, 432, 9068,
    0.2159, 0.05, 42000, 'down', 1000, 0,
    19, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-065' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 60.0, 'gr', 16095, 886)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-046' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'ml', 111000, 2960)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-060' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 15.0, 'ml', 100000, 2000)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-139' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 90.0, 'ml', 7000, 700)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-114' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 50000, 1000)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-075' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'gr', 55000, 550)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 18000, 540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Kiwie Gingger', 'RCP-UMT-036', 'MOCKTAIL',
    38000, 10302, 515, 10817,
    0.2847, 0.05, 38000, 'down', 1000, 0,
    24, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-043' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 166500, 4850)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-059' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'ml', 111000, 2960)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-066' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 15.0, 'gr', 18315, 252)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-139' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 90.0, 'ml', 7000, 700)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 18000, 540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-086' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 5.0, 'gr', 10000, 1000)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Elderflower Mint', 'RCP-UMT-037', 'MOCKTAIL',
    38000, 9236, 462, 9698,
    0.2552, 0.05, 38000, 'down', 1000, 0,
    22, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-048' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 25.0, 'ml', 111000, 3700)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-049' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'ml', 111000, 2960)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-066' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 18315, 336)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-139' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 90.0, 'ml', 7000, 700)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-086' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 5.0, 'gr', 10000, 1000)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 18000, 540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Bungan Jepun', 'RCP-UMT-038', 'MOCKTAIL',
    38000, 7825, 391, 8216,
    0.2162, 0.05, 38000, 'down', 1000, 0,
    22, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-045' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'ml', 111000, 2960)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-048' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'ml', 111000, 2960)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-066' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 15.0, 'gr', 18315, 252)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-136' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 60.0, 'ml', 3440, 413)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-139' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 90.0, 'ml', 7000, 700)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 18000, 540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Manggo Rumble', 'RCP-UMT-039', 'MOCKTAIL',
    38000, 10354, 518, 10872,
    0.2861, 0.05, 38000, 'down', 1000, 0,
    28, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-042' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 166500, 3281)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-065' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 16095, 443)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-058' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'ml', 111000, 1480)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-049' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'ml', 111000, 1480)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-139' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 90.0, 'ml', 7000, 700)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-076' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 15000, 1500)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-113' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 31500, 630)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-087' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 5.0, 'gr', 3000, 300)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 18000, 540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Honey Lemon Soda', 'RCP-UMT-040', 'MOCKTAIL',
    38000, 9182, 459, 9641,
    0.2537, 0.05, 38000, 'down', 1000, 0,
    19, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-051' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'ml', 111000, 2960)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-050' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'ml', 111000, 2960)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-106' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'gr', 17666, 294)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-112' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 5.0, 'gr', 11000, 1100)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-075' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'gr', 55000, 550)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-139' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'ml', 7000, 778)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 18000, 540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Black Peach', 'RCP-UMT-041', 'MOCKTAIL',
    38000, 9592, 480, 10072,
    0.2651, 0.05, 38000, 'down', 1000, 0,
    25, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-045' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 25.0, 'ml', 111000, 3700)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 220000, 4400)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-066' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 15.0, 'gr', 18315, 252)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-139' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 90.0, 'ml', 7000, 700)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 18000, 540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Strawberry Mojito', 'RCP-UMT-042', 'MOCKTAIL',
    38000, 12893, 645, 13538,
    0.3563, 0.05, 38000, 'down', 1000, 0,
    30, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-076' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 15000, 1500)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-058' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'ml', 111000, 4440)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-049' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'ml', 111000, 4440)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-066' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 18315, 504)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-138' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'ml', 17500, 219)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-139' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 90.0, 'ml', 7000, 700)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 18000, 540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-075' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'gr', 55000, 550)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Uluwatu wave', 'RCP-UMT-043', 'MOCKTAIL',
    38000, 7762, 388, 8150,
    0.2145, 0.05, 38000, 'down', 1000, 0,
    19, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-060' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 15.0, 'ml', 100000, 2000)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-048' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 15.0, 'ml', 111000, 2220)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-021' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 15.0, 'gr', 14000, 1050)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-073' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 14500, 435)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-065' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 16095, 443)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-066' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'gr', 18315, 168)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-136' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'ml', 3440, 206)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-139' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 90.0, 'ml', 7000, 700)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 18000, 540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Sunrise Bliss Ubud Carafe', 'RCP-UMT-044', 'MOCKTAIL',
    60000, 12034, 602, 12636,
    0.2106, 0.05, 60000, 'down', 1000, 0,
    20, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-043' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 166500, 4850)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-046' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'ml', 111000, 2960)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-065' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 60.0, 'gr', 16095, 886)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-104' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 6500, 975)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-139' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'ml', 7000, 1167)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-138' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'ml', 17500, 656)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 18000, 540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Tropical Tango Carafe', 'RCP-UMT-045', 'MOCKTAIL',
    60000, 13585, 679, 14264,
    0.2377, 0.05, 60000, 'down', 1000, 0,
    22, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-042' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 166500, 4921)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-058' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 15.0, 'ml', 111000, 2220)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-049' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 15.0, 'ml', 111000, 2220)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-065' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 60.0, 'gr', 16095, 886)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-104' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 6500, 975)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-139' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'ml', 7000, 1167)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-138' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'ml', 17500, 656)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 18000, 540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'The tangy kiwie', 'RCP-UMT-046', 'MOCKTAIL',
    42000, 10743, 537, 11280,
    0.2686, 0.05, 42000, 'down', 1000, 0,
    24, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-043' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 166500, 4850)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-046' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'ml', 111000, 2960)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-088' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'gr', 5000, 1000)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-139' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 60.0, 'ml', 7000, 467)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-137' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 60.0, 'ml', 3133, 376)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 18000, 540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-075' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'gr', 55000, 550)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'ProstBerry Tea Bliss', 'RCP-UMT-047', 'MOCKTAIL',
    42000, 10676, 534, 11210,
    0.2669, 0.05, 42000, 'down', 1000, 0,
    25, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-076' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 15.0, 'gr', 15000, 1125)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-044' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 166500, 3233)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-058' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'ml', 111000, 1480)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-045' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 15.0, 'ml', 111000, 2220)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-137' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 60.0, 'ml', 3133, 376)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 170.0, 'gr', 18000, 612)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-114' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 50000, 1000)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-113' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 31500, 630)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Pina Tropicano', 'RCP-UMT-048', 'MOCKTAIL',
    38000, 8541, 427, 8968,
    0.236, 0.05, 38000, 'down', 1000, 0,
    25, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-065' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 16095, 1477)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-066' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 5.0, 'gr', 18315, 84)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-048' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 15.0, 'ml', 111000, 2220)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 220000, 4400)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'gr', 18000, 360)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Black Berries Coffee', 'RCP-UMT-049', 'MOCKTAIL',
    38000, 13958, 698, 14656,
    0.3857, 0.05, 38000, 'down', 1000, 0,
    31, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-076' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 15.0, 'gr', 15000, 1125)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-044' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 166500, 3233)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-058' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'ml', 111000, 1480)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-045' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'ml', 111000, 1480)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-139' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 90.0, 'ml', 7000, 700)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'gr', 220000, 4400)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'gr', 18000, 540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-086' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 5.0, 'gr', 10000, 1000)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Green Delight', 'RCP-UMT-050', 'JUICE',
    40000, 14096, 705, 14801,
    0.37, 0.05, 40000, 'down', 1000, 0,
    34, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-089' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 9049, 9049)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-066' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'gr', 18315, 504)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-051' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 30.0, 'ml', 111000, 4440)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-015' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 100.0, 'ml', 19500, 103)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Betta Carrot E.ne', 'RCP-UMT-051', 'JUICE',
    40000, 16159, 808, 16967,
    0.4242, 0.05, 40000, 'down', 1000, 0,
    40, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-091' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 10100, 10100)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-051' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'ml', 111000, 1480)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-067' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 250.0, 'gr', 18315, 4579)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Dragon Beet', 'RCP-UMT-052', 'JUICE',
    40000, 16159, 808, 16967,
    0.4242, 0.05, 40000, 'down', 1000, 0,
    40, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-090' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 10100, 10100)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-051' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 10.0, 'ml', 111000, 1480)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-067' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 250.0, 'gr', 18315, 4579)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Berry Much Smoothies', 'RCP-UMT-053', 'JUICE',
    38000, 16312, 816, 17128,
    0.4507, 0.05, 38000, 'down', 1000, 0,
    30, 'DOG', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-092' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 93240, 15540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-138' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'ml', 17500, 438)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 50.0, 'gr', 18000, 180)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-015' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'ml', 19500, 154)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Tropical Smoothies', 'RCP-UMT-054', 'JUICE',
    38000, 16312, 816, 17128,
    0.4507, 0.05, 38000, 'down', 1000, 0,
    30, 'DOG', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-093' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 93240, 15540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-138' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'ml', 17500, 438)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 50.0, 'gr', 18000, 180)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-015' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'ml', 19500, 154)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Manggo Yogurt Smoothies', 'RCP-UMT-055', 'JUICE',
    38000, 16312, 816, 17128,
    0.4507, 0.05, 38000, 'down', 1000, 0,
    30, 'DOG', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-094' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 93240, 15540)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-138' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 20.0, 'ml', 17500, 438)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 50.0, 'gr', 18000, 180)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-015' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 150.0, 'ml', 19500, 154)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Avocado Juice', 'RCP-UMT-056', 'JUICE',
    42000, 10829, 541, 11370,
    0.2707, 0.05, 42000, 'down', 1000, 0,
    30, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-095' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 105000, 10500)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-015' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 180.0, 'ml', 19500, 185)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 40.0, 'gr', 18000, 144)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Guava Juice', 'RCP-UMT-057', 'JUICE',
    38000, 10829, 541, 11370,
    0.2992, 0.05, 38000, 'down', 1000, 0,
    30, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-097' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 105000, 10500)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-015' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 180.0, 'ml', 19500, 185)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 40.0, 'gr', 18000, 144)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Soursop Juice', 'RCP-UMT-058', 'JUICE',
    38000, 10829, 541, 11370,
    0.2992, 0.05, 38000, 'down', 1000, 0,
    30, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-096' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 105000, 10500)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-015' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 180.0, 'ml', 19500, 185)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 40.0, 'gr', 18000, 144)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Mango Juice', 'RCP-UMT-059', 'JUICE',
    38000, 10829, 541, 11370,
    0.2992, 0.05, 38000, 'down', 1000, 0,
    30, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-098' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 105000, 10500)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-015' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 180.0, 'ml', 19500, 185)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 40.0, 'gr', 18000, 144)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Bintang Pilsener', 'RCP-UMT-060', 'BEER',
    50000, 21467, 1073, 22540,
    0.4508, 0.05, 50000, 'down', 1000, 0,
    45, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-023' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 515200, 21467)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Bintang Reddler', 'RCP-UMT-061', 'BEER',
    48000, 20625, 1031, 21656,
    0.4512, 0.05, 48000, 'down', 1000, 0,
    45, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-024' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 495000, 20625)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Bintang Crystal', 'RCP-UMT-062', 'BEER',
    52000, 22467, 1123, 23590,
    0.4537, 0.05, 52000, 'down', 1000, 0,
    45, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-025' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 539200, 22467)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Bintang Heineken', 'RCP-UMT-063', 'BEER',
    58000, 25092, 1255, 26347,
    0.4543, 0.05, 58000, 'down', 1000, 0,
    45, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-026' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 602200, 25092)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Bintang Arak Madu', 'RCP-UMT-064', 'BEER',
    50000, 21842, 1092, 22934,
    0.4587, 0.05, 50000, 'down', 1000, 0,
    45, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-027' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 524200, 21842)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Bali Hai Premium 330', 'RCP-UMT-065', 'BEER',
    48000, 20625, 1031, 21656,
    0.4512, 0.05, 48000, 'down', 1000, 0,
    45, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-028' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 495000, 20625)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Bali Hai Draft beer 220', 'RCP-UMT-066', 'BEER',
    35000, 14625, 731, 15356,
    0.4387, 0.05, 35000, 'down', 1000, 0,
    45, 'DOG', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-029' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 351000, 14625)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Bali Hai Romantic day beer can 500 ml', 'RCP-UMT-067', 'BEER',
    62000, 26738, 1337, 28075,
    0.4528, 0.05, 62000, 'down', 1000, 0,
    45, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-030' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 641700, 26738)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;
  INSERT INTO public.recipes (
    tenant_id, branch_id, menu_name, pos_code, category, selling_price, subtotal, fix_cost, basic_cost,
    food_cost_pct, fix_cost_pct, selling_price_raw, rounding_direction, rounding_increment, price_adjustment,
    target_cost_percent, menu_class, total_sold, contribution_margin
  ) VALUES (
    v_tenant_id, v_bsd_id, 'Bali Hai Panther beer 330ml', 'RCP-UMT-068', 'BEER',
    56000, 24412, 1221, 25633,
    0.4577, 0.05, 56000, 'down', 1000, 0,
    45, 'PUZZLE', 0, 0
  ) RETURNING id INTO v_rec_id;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-031' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.recipe_ingredients (tenant_id, branch_id, recipe_id, material_id, qty_in_use, unit, unit_price, amount)
    VALUES (v_tenant_id, v_bsd_id, v_rec_id, v_mat_id, 1.0, 'pcs', 585900, 24412)
    ON CONFLICT (recipe_id, material_id) DO UPDATE
      SET qty_in_use = EXCLUDED.qty_in_use,
          unit = EXCLUDED.unit,
          unit_price = EXCLUDED.unit_price,
          amount = EXCLUDED.amount;
  END IF;

  -- 8. CATAT HISTORI AGUSTUS 2026 KE TABEL TRANSACTIONS (STOK AWAL 1 AGU & PEMAKAIAN AGUSTUS)

  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 10.0, 2200000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 12.0, 2640000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-002' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 150000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-002' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 0.2, 30000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-004' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 51.0, 191250, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-004' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 53.0, 198750, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-005' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 70.0, 98000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-005' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 230.0, 322000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-006' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.5, 94000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-007' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.3, 20640, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-008' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 4.0, 22144, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-008' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 5536, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-009' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 10.0, 55360, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-009' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 2.0, 11072, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-010' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 3.0, 16608, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-010' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 2.0, 11072, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-011' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 9.0, 49824, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-012' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 5.0, 27680, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-012' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 3.0, 16608, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-013' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 43.0, 238048, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-013' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 13.0, 71968, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-014' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 9.0, 49824, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-015' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.0, 39000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-015' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 13.0, 253500, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 36.0, 710604, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 127.0, 2506853, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-018' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 4.0, 46000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-018' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 11500, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-019' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 5.0, 70000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-020' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 7.0, 80500, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-020' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 4.0, 46000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-021' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 16.0, 224000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-021' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 11.0, 154000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-022' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.4583, 84581, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-022' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 55.75, 3233500, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-023' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.4167, 729884, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-023' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 0.9167, 472284, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-024' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.6667, 330016, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-024' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 0.7083, 350608, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-025' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.875, 471800, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-025' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 0.0417, 22485, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-026' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.4583, 275988, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-026' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.125, 677475, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-027' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.9167, 480534, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-027' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 0.0833, 43666, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-028' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.9167, 453766, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-028' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 0.3333, 164984, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-029' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.875, 307125, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-030' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.4167, 909096, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-030' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 0.1667, 106971, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-031' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.8333, 488230, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-031' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 0.0833, 48805, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-032' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 156000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-032' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 156000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-033' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.0, 360000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-033' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 2.0, 360000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-034' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 4.0, 372000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-034' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 6.0, 558000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-035' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 5.0, 200955, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-035' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 9.0, 361719, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-036' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 7.0, 281337, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-036' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 5.0, 200955, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-037' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.0, 209760, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-037' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 2.0, 209760, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-038' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 62000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-039' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.5, 93000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-039' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 2.5, 155000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-040' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.0, 510000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-040' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 255000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-041' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.5, 82500, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-041' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 55000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-042' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 3.0, 499500, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-043' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.0, 333000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-043' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 2.0, 333000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-044' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.0, 333000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-044' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 166500, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-045' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 111000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-046' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 111000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-046' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 3.0, 333000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-047' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 111000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-047' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 111000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-048' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 111000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-048' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 111000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-049' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 111000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-049' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 2.0, 222000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-050' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 111000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-050' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 111000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-051' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 111000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-051' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 3.0, 333000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-052' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 5.0, 555000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-053' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 111000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-053' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 111000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-054' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 3.0, 333000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-054' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 111000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-055' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 111000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-056' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.0, 222000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-056' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 111000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-057' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 111000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-057' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 3.0, 333000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-058' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 5.0, 555000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-060' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 100000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-060' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 2.0, 200000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-061' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.0, 200000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-062' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.0, 200000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-062' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 100000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-063' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.0, 312000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-063' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 156000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-064' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.0, 160000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-064' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 80000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-065' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 16095, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-065' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 10.0, 160950, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-066' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 3.0, 54945, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-066' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 5.0, 91575, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-067' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 3.0, 54945, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-067' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 2.0, 36630, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.0, 36000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 236.0, 4248000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-069' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.4, 220800, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-070' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 125.0, 2875000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-071' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 18.0, 207000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-071' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 214.0, 2461000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-072' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.0, 110000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-072' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 10.0, 550000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-073' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 14500, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-073' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 43.0, 623500, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-074' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 5.0, 75000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-074' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 49.0, 735000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-075' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 3.6, 198000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-075' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 6.9, 379500, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-076' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.3, 4500, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-076' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.5, 22500, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-077' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 6.0, 162000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-077' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 8.0, 216000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-083' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.9, 22500, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-083' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 0.8, 20000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-084' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.5, 103500, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-084' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.5, 103500, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-086' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 5.0, 50000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-086' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 30.0, 300000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-087' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 3000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-087' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 9.0, 27000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-088' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 5000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-088' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 8.0, 40000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-089' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 32.0, 289568, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-089' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 21.0, 190029, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-090' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 9.0, 90900, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-090' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 21.0, 212100, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-091' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 18.0, 181800, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-091' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 13.0, 131300, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-092' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 7.5, 699300, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-092' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 11.1667, 1041183, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-093' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 9.5, 885780, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-093' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 5.8333, 543897, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-094' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 6.8333, 637137, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-094' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 12.0, 1118880, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-095' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.3, 31500, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-095' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 0.2, 21000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-096' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.1, 220500, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-096' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.6, 168000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-097' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.8, 294000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-097' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.3, 136500, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-098' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.5, 262500, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-098' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 2.6, 273000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-099' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 12.0, 210000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-099' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 35.0, 612500, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-100' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.1333, 9331, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-102' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 3.3, 330000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-103' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 5.0, 1000000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-105' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 7.0, 168000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-106' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 3.0, 52998, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-106' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 5.0, 88330, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-107' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.5, 100000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-107' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 2.0, 400000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-108' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.7, 105000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-108' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 2.0, 300000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-109' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.2, 56800, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-110' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.7, 140000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-111' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.1, 36000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-112' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 4.0, 44000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-112' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 11000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-113' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 4.0, 126000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-114' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 4.0, 200000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-114' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 5.0, 250000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-115' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.0, 82000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-115' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 41000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-116' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.5, 35000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-116' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 70000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-117' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 3.2, 224000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-117' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 3.1, 217000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-118' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 3.0, 60000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-118' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 5.0, 100000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-119' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 6000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-120' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 3.0, 2190, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-120' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 3.0, 2190, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-121' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 5.0, 4180, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-121' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 836, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-122' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 6.0, 1548, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-122' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 258, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-123' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 9.0, 2322, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-125' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.5, 21000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-125' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 1.0, 14000, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-127' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 3.0, 27600, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-128' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.0, 384000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-129' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 10.0, 56000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-129' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-31', v_mat_id, 'OUT', 'RESTO', 4.0, 22400, 'Histori Total Pemakaian Barista Agustus 2026 (SO BAR RESTO)', v_owner_uid, 'HISTORY_AUG2026_USAGE', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-130' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 0.5, 12500, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-131' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 12000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-134' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 130000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-135' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 10750, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-136' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 3440, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-137' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 3133, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-138' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.0, 35000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-139' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 2.0, 14000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-140' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 115000, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-141' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 30657, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-142' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.transactions (tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, created_by, source_module, is_reversed)
    VALUES (v_tenant_id, v_bsd_id, '2026-08-01', v_mat_id, 'IN', 'RESTO', 1.0, 88557, 'Histori Stok Awal Bar Resto 1 Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_OPENING', false);
  END IF;

  -- 9. CATAT TRANSAKSI PEMBELIAN AGUSTUS 2026 KE PURCHASE_ENTRIES & TRANSACTIONS

  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-01'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-01'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Gula Pasir')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Food Station Tjipinang Jaya')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 8.0, 'pck', 17500, '2026-08-01'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'PT. Food Station Tjipinang Jaya' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-01'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 8.0, 140000,
      'Histori Pembelian Agustus 2026 (' || 'PT. Food Station Tjipinang Jaya' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-02'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-02'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Santan kara')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Official Santan Kara')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'crtn', 140000, '2026-08-02'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Official Santan Kara' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-02'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 140000,
      'Histori Pembelian Agustus 2026 (' || 'Official Santan Kara' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-03'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-03'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Lemon import')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'kg', 55000, '2026-08-03'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-03'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 110000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Sereh')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'pck', 5000, '2026-08-03'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-03'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 10000,
      'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Strawberry')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'kg', 15000, '2026-08-03'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-03'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 30000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Amidis')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Amidis Tirta Mulia')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 6.0, 'pcs', 19500, '2026-08-03'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'PT. Amidis Tirta Mulia' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-03'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 6.0, 117000,
      'Histori Pembelian Agustus 2026 (' || 'PT. Amidis Tirta Mulia' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Cincau Hijau')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Cincau Fresh Pasar Umum')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 10.0, 'pck', 15000, '2026-08-03'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Cincau Fresh Pasar Umum' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-03'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 10.0, 150000,
      'Histori Pembelian Agustus 2026 (' || 'Cincau Fresh Pasar Umum' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Kelapa Batok Umatis')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 40.0, 'pcs', 11500, '2026-08-04'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-04'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 40.0, 460000,
      'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dging kelapa')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'kg', 55000, '2026-08-04'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-04'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 110000,
      'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('air kelapa 1 L')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 8.0, 'pck', 14500, '2026-08-04'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-04'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 8.0, 116000,
      'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-04'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-04'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Sereh')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'pck', 5000, '2026-08-05'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-05'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 10000,
      'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Pandan')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 3.0, 'pck', 5000, '2026-08-05'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-05'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 3.0, 15000,
      'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-05'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-05'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Mint')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('AEON Supermarket BSD City')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'pck', 10000, '2026-08-06'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'AEON Supermarket BSD City' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-06'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 50000,
      'Histori Pembelian Agustus 2026 (' || 'AEON Supermarket BSD City' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-06'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-06'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Gula Pasir')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Food Station Tjipinang Jaya')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 8.0, 'pck', 17500, '2026-08-06'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'PT. Food Station Tjipinang Jaya' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-06'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 8.0, 140000,
      'Histori Pembelian Agustus 2026 (' || 'PT. Food Station Tjipinang Jaya' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Manggo Yougurt')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 3.0, 'pck', 93240, '2026-08-06'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-06'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 3.0, 279720,
      'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Peinapple juivce')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 4.0, 'btl', 18315, '2026-08-06'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-06'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 4.0, 73260,
      'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Kelapa Batok Umatis')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 20.0, 'pcs', 11500, '2026-08-07'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-07'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 20.0, 230000,
      'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dging kelapa')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 3.0, 'kg', 55000, '2026-08-07'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-07'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 3.0, 165000,
      'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('air kelapa 1 L')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 7.0, 'pck', 14500, '2026-08-07'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-07'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 7.0, 101500,
      'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-07'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-07'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Milk')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Greenfields Indonesia')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 3.0, 'Carton', 236868, '2026-08-07'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'PT. Greenfields Indonesia' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-07'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 3.0, 710604,
      'Histori Pembelian Agustus 2026 (' || 'PT. Greenfields Indonesia' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-08'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-08'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Strawberry')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'kg', 15000, '2026-08-08'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-08'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 30000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Sereh')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'pck', 5000, '2026-08-08'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-08'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 10000,
      'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Lemon import')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'kg', 55000, '2026-08-08'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-08'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 110000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Peach syrup')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'all', 6372975, '2026-08-09'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Dripp Official (PT. Dripp Indonesia)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-09'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 6372975,
      'Histori Pembelian Agustus 2026 (' || 'Dripp Official (PT. Dripp Indonesia)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Blue caraco syrup')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dripp Official (PT. Dripp Indonesia)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'all', 632700, '2026-08-09'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Dripp Official (PT. Dripp Indonesia)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-09'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 632700,
      'Histori Pembelian Agustus 2026 (' || 'Dripp Official (PT. Dripp Indonesia)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Avocado Bubuqu')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Suplai Garage (Distributor Denali & Bubuqu)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'all', 200000, '2026-08-09'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Suplai Garage (Distributor Denali & Bubuqu)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-09'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 200000,
      'Histori Pembelian Agustus 2026 (' || 'Suplai Garage (Distributor Denali & Bubuqu)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Mint')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('AEON Supermarket BSD City')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'pck', 10000, '2026-08-09'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'AEON Supermarket BSD City' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-09'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 50000,
      'Histori Pembelian Agustus 2026 (' || 'AEON Supermarket BSD City' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Lime')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'kg', 25000, '2026-08-09'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-09'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 25000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-09'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-09'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-10'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-10'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Kelapa Batok Umatis')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 30.0, 'pcs', 11500, '2026-08-10'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-10'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 30.0, 345000,
      'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dging kelapa')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'kg', 55000, '2026-08-10'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-10'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 110000,
      'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('air kelapa 1 L')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 7.0, 'pck', 14500, '2026-08-10'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-10'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 7.0, 101500,
      'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Sereh')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'pck', 5000, '2026-08-10'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-10'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 10000,
      'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Pandan')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 3.0, 'pck', 5000, '2026-08-10'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-10'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 3.0, 15000,
      'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Orange Sunkist')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'kg', 55000, '2026-08-10'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-10'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 110000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Kale')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'kg', 60000, '2026-08-10'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-10'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 60000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Cincau Hijau')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Cincau Fresh Pasar Umum')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 10.0, 'pck', 15000, '2026-08-10'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Cincau Fresh Pasar Umum' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-10'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 10.0, 150000,
      'Histori Pembelian Agustus 2026 (' || 'Cincau Fresh Pasar Umum' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Matcha')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Suplai Garage (Distributor Denali & Bubuqu)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'all', 1361000, '2026-08-10'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Suplai Garage (Distributor Denali & Bubuqu)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-10'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 1361000,
      'Histori Pembelian Agustus 2026 (' || 'Suplai Garage (Distributor Denali & Bubuqu)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-11'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-11'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Strawberry')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'kg', 15000, '2026-08-11'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-11'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 30000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Teh Naga Malang')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Tokopedia Official Marketplace')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'all', 624910, '2026-08-11'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Tokopedia Official Marketplace' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-11'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 624910,
      'Histori Pembelian Agustus 2026 (' || 'Tokopedia Official Marketplace' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Mint')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('AEON Supermarket BSD City')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'pck', 10000, '2026-08-12'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'AEON Supermarket BSD City' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-12'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 50000,
      'Histori Pembelian Agustus 2026 (' || 'AEON Supermarket BSD City' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-12'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-12'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Whipping Milk')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Milak Gold Dairy')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'pcs', 75000, '2026-08-12'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Milak Gold Dairy' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-12'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 150000,
      'Histori Pembelian Agustus 2026 (' || 'Milak Gold Dairy' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Sereh')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'pck', 5000, '2026-08-13'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-13'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 10000,
      'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Mint')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('AEON Supermarket BSD City')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 7.0, 'pck', 10000, '2026-08-13'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'AEON Supermarket BSD City' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-13'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 7.0, 70000,
      'Histori Pembelian Agustus 2026 (' || 'AEON Supermarket BSD City' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Berry Much')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 4.0, 'pck', 93240, '2026-08-13'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-13'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 4.0, 372960,
      'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Tropical')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 3.0, 'pck', 93240, '2026-08-13'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-13'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 3.0, 279720,
      'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Manggo Yougurt')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 3.0, 'pck', 93240, '2026-08-13'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-13'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 3.0, 279720,
      'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Lemon Juice')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 3.0, 'btl', 18315, '2026-08-13'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-13'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 3.0, 54945,
      'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Peinapple juivce')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 4.0, 'btl', 18315, '2026-08-13'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-13'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 4.0, 73260,
      'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Orange juice premium')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'btl', 18315, '2026-08-13'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-13'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 36630,
      'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Gula Pasir')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Food Station Tjipinang Jaya')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 6.0, 'pck', 17500, '2026-08-13'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'PT. Food Station Tjipinang Jaya' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-13'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 6.0, 105000,
      'Histori Pembelian Agustus 2026 (' || 'PT. Food Station Tjipinang Jaya' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Mineral water 400 ml')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Ramasurya (Distributor Pristine)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 30.0, 'pck', 58000, '2026-08-13'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'PT. Ramasurya (Distributor Pristine)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-13'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 30.0, 1740000,
      'Histori Pembelian Agustus 2026 (' || 'PT. Ramasurya (Distributor Pristine)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Kelapa Batok Umatis')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 20.0, 'pcs', 11500, '2026-08-14'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-14'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 20.0, 230000,
      'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dging kelapa')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'kg', 55000, '2026-08-14'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-14'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 110000,
      'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('air kelapa 1 L')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 7.0, 'pck', 14500, '2026-08-14'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-14'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 7.0, 101500,
      'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Cherry')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Elisa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'all', 60000, '2026-08-14'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Toko Elisa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-14'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 120000,
      'Histori Pembelian Agustus 2026 (' || 'Toko Elisa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Chocolate Souce')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Elisa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'btl', 40000, '2026-08-14'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Toko Elisa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-14'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 80000,
      'Histori Pembelian Agustus 2026 (' || 'Toko Elisa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-14'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-14'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Strawberry')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'kg', 15000, '2026-08-14'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-14'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 30000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coffee Bean 50:50')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Titik Temu Roastery')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 10.0, 'pck', 220000, '2026-08-15'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Titik Temu Roastery' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-15'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 10.0, 2200000,
      'Histori Pembelian Agustus 2026 (' || 'Titik Temu Roastery' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-15'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-15'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Lemon import')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'kg', 55000, '2026-08-15'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-15'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 110000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Bengkoang')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'kg', 20000, '2026-08-15'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-15'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 20000,
      'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Berry Much')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 3.0, 'pck', 93240, '2026-08-15'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-15'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 3.0, 279720,
      'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Tropical')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 3.0, 'pck', 93240, '2026-08-15'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-15'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 3.0, 279720,
      'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Manggo Yougurt')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 3.0, 'pck', 93240, '2026-08-15'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-15'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 3.0, 279720,
      'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Pandan')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'pck', 5000, '2026-08-16'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-16'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 10000,
      'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-17'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-17'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Kale')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'kg', 60000, '2026-08-17'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-17'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 120000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Buah Naga')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'kg', 28000, '2026-08-17'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-17'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 28000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Cincau Hijau')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Cincau Fresh Pasar Umum')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 10.0, 'pck', 15000, '2026-08-17'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Cincau Fresh Pasar Umum' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-17'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 10.0, 150000,
      'Histori Pembelian Agustus 2026 (' || 'Cincau Fresh Pasar Umum' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-18'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-18'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Milk')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Greenfields Indonesia')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 3.0, 'Carton', 236868, '2026-08-18'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'PT. Greenfields Indonesia' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-18'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 3.0, 710604,
      'Histori Pembelian Agustus 2026 (' || 'PT. Greenfields Indonesia' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Gula Pasir')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Food Station Tjipinang Jaya')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 4.0, 'pck', 17500, '2026-08-19'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'PT. Food Station Tjipinang Jaya' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-19'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 4.0, 70000,
      'Histori Pembelian Agustus 2026 (' || 'PT. Food Station Tjipinang Jaya' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-20'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-20'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Strawberry')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'kg', 15000, '2026-08-20'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-20'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 30000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Kelapa Batok Umatis')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 30.0, 'pcs', 11500, '2026-08-20'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-20'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 30.0, 345000,
      'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dging kelapa')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'kg', 55000, '2026-08-20'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-20'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 55000,
      'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('air kelapa 1 L')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 7.0, 'pck', 14500, '2026-08-20'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-20'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 7.0, 101500,
      'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Sereh')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'pck', 5000, '2026-08-20'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-20'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 10000,
      'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Beet root')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'Kg', 25000, '2026-08-20'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-20'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 25000,
      'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Lotus Crumble')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Tokopedia Official Marketplace')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'pck', 150000, '2026-08-20'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Tokopedia Official Marketplace' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-20'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 150000,
      'Histori Pembelian Agustus 2026 (' || 'Tokopedia Official Marketplace' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Sereh')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'pck', 5000, '2026-08-21'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-21'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 10000,
      'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Pandan')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 3.0, 'pck', 5000, '2026-08-21'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-21'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 3.0, 15000,
      'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Lemon import')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 3.0, 'kg', 55000, '2026-08-21'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-21'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 3.0, 165000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-22'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-22'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Skm')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Toko Elisa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 4.0, 'pck', 11500, '2026-08-22'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Toko Elisa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-22'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 4.0, 46000,
      'Histori Pembelian Agustus 2026 (' || 'Toko Elisa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Gula Pasir')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Food Station Tjipinang Jaya')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 4.0, 'pck', 17500, '2026-08-22'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'PT. Food Station Tjipinang Jaya' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-22'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 4.0, 70000,
      'Histori Pembelian Agustus 2026 (' || 'PT. Food Station Tjipinang Jaya' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Alpukat')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Sunway Juice Frozen')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'pck', 105000, '2026-08-23'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Sunway Juice Frozen' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-23'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 525000,
      'Histori Pembelian Agustus 2026 (' || 'Sunway Juice Frozen' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Sirsak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Sunway Juice Frozen')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'pck', 105000, '2026-08-23'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Sunway Juice Frozen' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-23'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 105000,
      'Histori Pembelian Agustus 2026 (' || 'Sunway Juice Frozen' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jambu')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Sunway Juice Frozen')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'pck', 105000, '2026-08-23'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Sunway Juice Frozen' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-23'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 105000,
      'Histori Pembelian Agustus 2026 (' || 'Sunway Juice Frozen' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Mangga')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Sunway Juice Frozen')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'pck', 105000, '2026-08-23'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Sunway Juice Frozen' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-23'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 105000,
      'Histori Pembelian Agustus 2026 (' || 'Sunway Juice Frozen' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Mint')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('AEON Supermarket BSD City')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'pck', 10000, '2026-08-24'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'AEON Supermarket BSD City' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-24'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 50000,
      'Histori Pembelian Agustus 2026 (' || 'AEON Supermarket BSD City' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Alpukat')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Sunway Juice Frozen')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'pck', 105000, '2026-08-24'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Sunway Juice Frozen' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-24'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 105000,
      'Histori Pembelian Agustus 2026 (' || 'Sunway Juice Frozen' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Sirsak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Sunway Juice Frozen')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'pck', 105000, '2026-08-24'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Sunway Juice Frozen' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-24'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 105000,
      'Histori Pembelian Agustus 2026 (' || 'Sunway Juice Frozen' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jambu')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Sunway Juice Frozen')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'pck', 105000, '2026-08-24'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Sunway Juice Frozen' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-24'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 105000,
      'Histori Pembelian Agustus 2026 (' || 'Sunway Juice Frozen' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Mangga')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Sunway Juice Frozen')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'pck', 105000, '2026-08-24'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Sunway Juice Frozen' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-24'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 105000,
      'Histori Pembelian Agustus 2026 (' || 'Sunway Juice Frozen' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Cincau Hijau')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Cincau Fresh Pasar Umum')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 10.0, 'pck', 15000, '2026-08-24'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Cincau Fresh Pasar Umum' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-24'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 10.0, 150000,
      'Histori Pembelian Agustus 2026 (' || 'Cincau Fresh Pasar Umum' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-25'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-25'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Gula Pasir')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Food Station Tjipinang Jaya')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 6.0, 'pck', 17500, '2026-08-25'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'PT. Food Station Tjipinang Jaya' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-25'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 6.0, 105000,
      'Histori Pembelian Agustus 2026 (' || 'PT. Food Station Tjipinang Jaya' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Sereh')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'pck', 5000, '2026-08-26'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-26'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 10000,
      'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Pandan')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'pck', 5000, '2026-08-26'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-26'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 10000,
      'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-27'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-27'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Lemon import')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'kg', 55000, '2026-08-27'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-27'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 110000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Kelapa Batok Umatis')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 40.0, 'pcs', 11500, '2026-08-27'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-27'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 40.0, 460000,
      'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Dging kelapa')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 1.0, 'kg', 55000, '2026-08-27'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-27'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 1.0, 55000,
      'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('air kelapa 1 L')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Coco Fresh Supplier Kelapa')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 7.0, 'pck', 14500, '2026-08-27'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-27'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 7.0, 101500,
      'Histori Pembelian Agustus 2026 (' || 'Coco Fresh Supplier Kelapa' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Lime')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'kg', 25000, '2026-08-27'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-27'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 50000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Strawberry')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'kg', 15000, '2026-08-27'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-27'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 30000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Milk Urgent (Astro)')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Astro Quick Commerce')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 6.0, 'PCS', 33000, '2026-08-27'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Astro Quick Commerce' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-27'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 6.0, 198000,
      'Histori Pembelian Agustus 2026 (' || 'Astro Quick Commerce' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-28'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-28'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Amidis')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Amidis Tirta Mulia')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 6.0, 'pcs', 19500, '2026-08-28'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'PT. Amidis Tirta Mulia' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-28'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 6.0, 117000,
      'Histori Pembelian Agustus 2026 (' || 'PT. Amidis Tirta Mulia' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-29'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-29'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Sereh')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Pak Toyib (Supplier Sayur & Rempah Pasar)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'pck', 5000, '2026-08-30'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-30'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 10000,
      'Histori Pembelian Agustus 2026 (' || 'Pak Toyib (Supplier Sayur & Rempah Pasar)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Daun Mint')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('AEON Supermarket BSD City')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 7.0, 'pck', 10000, '2026-08-30'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'AEON Supermarket BSD City' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-30'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 7.0, 70000,
      'Histori Pembelian Agustus 2026 (' || 'AEON Supermarket BSD City' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-30'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-30'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Strawberry')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'kg', 15000, '2026-08-30'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-30'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 30000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Teh Blue Tea')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Tokopedia Official Marketplace')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'pck', 29350, '2026-08-30'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Tokopedia Official Marketplace' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-30'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 58700,
      'Histori Pembelian Agustus 2026 (' || 'Tokopedia Official Marketplace' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Cincau Hijau')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Cincau Fresh Pasar Umum')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 10.0, 'pck', 15000, '2026-08-31'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Cincau Fresh Pasar Umum' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-31'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 10.0, 150000,
      'Histori Pembelian Agustus 2026 (' || 'Cincau Fresh Pasar Umum' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Jeruk Pontianak')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fresh Mandiri Fruit & Veggie')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'kg', 23000, '2026-08-31'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-31'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 115000,
      'Histori Pembelian Agustus 2026 (' || 'Fresh Mandiri Fruit & Veggie' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Es Batu')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Fatur Es Batu Kristal')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 240.0, 'pck', 18000, '2026-08-31'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Fatur Es Batu Kristal' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-31'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 240.0, 4320000,
      'Histori Pembelian Agustus 2026 (' || 'Fatur Es Batu Kristal' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Berry Much')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'pck', 93240, '2026-08-31'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-31'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 186480,
      'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Manggo Yougurt')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'pck', 93240, '2026-08-31'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-31'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 186480,
      'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Lemon Juice')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 2.0, 'btl', 18315, '2026-08-31'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-31'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 2.0, 36630,
      'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Peinapple juivce')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 5.0, 'btl', 18315, '2026-08-31'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-31'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 5.0, 91575,
      'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Orange juice premium')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Squeeze Indonesia (Juice & Smoothies)')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 3.0, 'btl', 18315, '2026-08-31'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-31'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 3.0, 54945,
      'Histori Pembelian Agustus 2026 (' || 'Squeeze Indonesia (Juice & Smoothies)' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('Gula Pasir')) LIMIT 1;
  SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND lower(trim(name)) = lower(trim('PT. Food Station Tjipinang Jaya')) LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.purchase_entries (
      tenant_id, branch_id, material_id, supplier_id, qty, unit, unit_price, date,
      input_by, notes, delivery_notes, destination_location, is_cancelled
    ) VALUES (
      v_tenant_id, v_bsd_id, v_mat_id, v_sup_id, 6.0, 'pck', 17500, '2026-08-31'::date,
      v_owner_uid, 'Histori Pembelian Agustus 2026 (' || 'PT. Food Station Tjipinang Jaya' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', 'RESTO', false
    );
    INSERT INTO public.transactions (
      tenant_id, branch_id, date, material_id, type, location, qty, amount, notes, delivery_notes, created_by, source_module, is_reversed
    ) VALUES (
      v_tenant_id, v_bsd_id, '2026-08-31'::date, v_mat_id, 'PURCHASE_IN', 'RESTO', 6.0, 105000,
      'Histori Pembelian Agustus 2026 (' || 'PT. Food Station Tjipinang Jaya' || ')', 'Data Riil Sheet Pembelian Harian Agustus 2026', v_owner_uid, 'HISTORY_AUG2026_PURCHASE', false
    );
  END IF;

  -- 10. CATAT HISTORI REKAP INVENTARIS HARIAN / EOD 31 AGUSTUS 2026 (118 ITEM SO BAR RESTO, STATUS 'closed')
  INSERT INTO public.daily_inventories (
    tenant_id, branch_id, date, checked_by, status, notes, location, created_at, updated_at
  ) VALUES (
    v_tenant_id, v_bsd_id, '2026-08-31', v_owner_uid, 'closed',
    'Rekapitulasi Akhir Bulan Barista Umatis Agustus 2026 (118 Item SO BAR RESTO — Saldo Akhir Menjadi Saldo Awal Periode Berikutnya)',
    'RESTO', '2026-08-31 23:00:00+07'::timestamptz, '2026-08-31 23:00:00+07'::timestamptz
  ) RETURNING id INTO v_di_id;

  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      10.0, 10.0, 0,
      10.0, 0, '[]'::jsonb,
      12.0, 12.0, 'pck', true,
      0,
      7.0, 0.0, 'pck', true,
      7.0, 7.0, 0,
      true, 220000, 2640000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-004' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      51.0, 51.0, 0,
      0.0, 0, '[]'::jsonb,
      53.0, 53.0, 'pck', true,
      0,
      50.0, 0.0, 'pck', true,
      50.0, 50.0, 0,
      true, 3750, 198750, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-005' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      70.0, 70.0, 0,
      1.0, 0, '[]'::jsonb,
      230.0, 230.0, 'pck', true,
      0,
      100.0, 0.0, 'pck', true,
      100.0, 100.0, 0,
      true, 1400, 322000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-006' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.5, 0.5, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'pck', true,
      0,
      0.0, 0.5, 'pck', true,
      0.5, 0.5, 0,
      true, 188000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-007' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.3, 0.3, 0,
      2.0, 0, '[]'::jsonb,
      0.0, 0.0, 'pck', true,
      0,
      0.0, 0.0, 'pck', true,
      0.0, 0.0, 0,
      true, 68800, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-015' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.0, 2.0, 0,
      12.0, 0, '[]'::jsonb,
      13.0, 13.0, 'pcs', true,
      0,
      4.0, 0.0, 'pcs', true,
      4.0, 4.0, 0,
      true, 19500, 253500, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-032' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'pck', true,
      0,
      0.0, 0.5, 'pck', true,
      0.5, 0.5, 0,
      true, 156000, 156000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-033' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.0, 2.0, 0,
      0.0, 0, '[]'::jsonb,
      2.0, 2.0, 'pck', true,
      0,
      1.0, 0.0, 'pck', true,
      1.0, 1.0, 0,
      true, 180000, 360000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-034' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      4.0, 4.0, 0,
      0.0, 0, '[]'::jsonb,
      6.0, 6.0, 'pck', true,
      0,
      8.0, 0.0, 'pck', true,
      8.0, 8.0, 0,
      true, 93000, 558000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-035' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      5.0, 5.0, 0,
      0.0, 0, '[]'::jsonb,
      9.0, 9.0, 'pck', true,
      0,
      4.0, 0.0, 'pck', true,
      4.0, 4.0, 0,
      true, 40191, 361719, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-036' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      7.0, 7.0, 0,
      0.0, 0, '[]'::jsonb,
      5.0, 5.0, 'pck', true,
      0,
      9.0, 0.0, 'pck', true,
      9.0, 9.0, 0,
      true, 40191, 200955, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-037' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.0, 2.0, 0,
      0.0, 0, '[]'::jsonb,
      2.0, 2.0, 'pck', true,
      0,
      1.0, 0.0, 'pck', true,
      1.0, 1.0, 0,
      true, 104880, 209760, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-038' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'pck', true,
      0,
      1.0, 0.0, 'pck', true,
      1.0, 1.0, 0,
      true, 62000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-039' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.5, 1.5, 0,
      0.0, 0, '[]'::jsonb,
      2.5, 2.5, 'pck', true,
      0,
      1.0, 0.0, 'pck', true,
      1.0, 1.0, 0,
      true, 62000, 155000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-040' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.0, 2.0, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'pck', true,
      0,
      1.0, 0.5, 'pck', true,
      1.5, 1.5, 0,
      true, 255000, 255000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-109' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.2, 0.2, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'pck', true,
      0,
      0.0, 0.2, 'pck', true,
      0.2, 0.2, 0,
      true, 284000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-110' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.7, 0.7, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'pck', true,
      0,
      0.0, 0.6, 'pck', true,
      0.6, 0.6, 0,
      true, 200000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-111' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.1, 0.1, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'pck', true,
      0,
      0.0, 0.0, 'pck', true,
      0.0, 0.0, 0,
      true, 360000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      36.0, 36.0, 0,
      72.0, 0, '[]'::jsonb,
      127.0, 127.0, 'pck', true,
      0,
      30.0, 0.0, 'pck', true,
      30.0, 30.0, 0,
      true, 19739, 2506853, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-041' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.5, 1.5, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'pck', true,
      0,
      1.0, 0.0, 'pck', true,
      1.0, 1.0, 0,
      true, 55000, 55000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-022' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.4583, 1.4583, 0,
      30.0, 0, '[]'::jsonb,
      55.75, 55.75, 'Crtn', true,
      0,
      0.0, 0.375, 'Crtn', true,
      0.375, 0.375, 0,
      true, 58000, 3233500, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-020' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      7.0, 7.0, 0,
      4.0, 0, '[]'::jsonb,
      4.0, 4.0, 'kaleng', true,
      0,
      11.0, 0.0, 'kaleng', true,
      11.0, 11.0, 0,
      true, 11500, 46000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-021' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      16.0, 16.0, 0,
      10.0, 0, '[]'::jsonb,
      11.0, 11.0, 'pcs', true,
      0,
      11.0, 0.0, 'pcs', true,
      11.0, 11.0, 0,
      true, 14000, 154000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-042' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.0, 0.0, 0,
      0.0, 0, '[]'::jsonb,
      3.0, 3.0, 'Btl', true,
      0,
      2.0, 0.0, 'Btl', true,
      2.0, 2.0, 0,
      true, 166500, 499500, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-043' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.0, 2.0, 0,
      0.0, 0, '[]'::jsonb,
      2.0, 2.0, 'Btl', true,
      0,
      1.0, 0.0, 'Btl', true,
      1.0, 1.0, 0,
      true, 166500, 333000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-044' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.0, 2.0, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'Btl', true,
      0,
      2.0, 0.0, 'Btl', true,
      2.0, 2.0, 0,
      true, 166500, 166500, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-045' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'Btl', true,
      0,
      1.0, 0.0, 'Btl', true,
      1.0, 1.0, 0,
      true, 111000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-046' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      0.0, 0, '[]'::jsonb,
      3.0, 3.0, 'Btl', true,
      0,
      1.0, 0.0, 'Btl', true,
      1.0, 1.0, 0,
      true, 111000, 333000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-047' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'Btl', true,
      0,
      2.0, 0.0, 'Btl', true,
      2.0, 2.0, 0,
      true, 111000, 111000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-048' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'Btl', true,
      0,
      1.0, 0.0, 'Btl', true,
      1.0, 1.0, 0,
      true, 111000, 111000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-049' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      0.0, 0, '[]'::jsonb,
      2.0, 2.0, 'Btl', true,
      0,
      1.0, 0.0, 'Btl', true,
      1.0, 1.0, 0,
      true, 111000, 222000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-050' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'Btl', true,
      0,
      1.0, 0.0, 'Btl', true,
      1.0, 1.0, 0,
      true, 111000, 111000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-051' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      0.0, 0, '[]'::jsonb,
      3.0, 3.0, 'Btl', true,
      0,
      1.0, 0.0, 'Btl', true,
      1.0, 1.0, 0,
      true, 111000, 333000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-052' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      5.0, 5.0, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'Btl', true,
      0,
      4.0, 0.0, 'Btl', true,
      4.0, 4.0, 0,
      true, 111000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-054' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      3.0, 3.0, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'Btl', true,
      0,
      2.0, 0.0, 'Btl', true,
      2.0, 2.0, 0,
      true, 111000, 111000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-053' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'Btl', true,
      0,
      1.0, 0.0, 'Btl', true,
      1.0, 1.0, 0,
      true, 111000, 111000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-055' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'Btl', true,
      0,
      2.0, 0.0, 'Btl', true,
      2.0, 2.0, 0,
      true, 111000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-056' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.0, 2.0, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'Btl', true,
      0,
      2.0, 0.0, 'Btl', true,
      2.0, 2.0, 0,
      true, 111000, 111000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-057' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      0.0, 0, '[]'::jsonb,
      3.0, 3.0, 'Btl', true,
      0,
      0.0, 0.0, 'Btl', true,
      0.0, 0.0, 0,
      true, 111000, 333000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-058' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.0, 0.0, 0,
      0.0, 0, '[]'::jsonb,
      5.0, 5.0, 'Btl', true,
      0,
      1.0, 0.0, 'Btl', true,
      1.0, 1.0, 0,
      true, 111000, 555000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-059' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.0, 0.0, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'Btl', true,
      0,
      1.0, 0.0, 'Btl', true,
      1.0, 1.0, 0,
      true, 111000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-060' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      0.0, 0, '[]'::jsonb,
      2.0, 2.0, 'Btl', true,
      0,
      2.0, 0.0, 'Btl', true,
      2.0, 2.0, 0,
      true, 100000, 200000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-061' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.0, 2.0, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'Btl', true,
      0,
      1.0, 0.0, 'Btl', true,
      1.0, 1.0, 0,
      true, 100000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-062' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.0, 2.0, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'Btl', true,
      0,
      1.0, 0.0, 'Btl', true,
      1.0, 1.0, 0,
      true, 100000, 100000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-063' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.0, 2.0, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'Btl', true,
      0,
      1.0, 0.0, 'Btl', true,
      1.0, 1.0, 0,
      true, 156000, 156000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-064' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.0, 2.0, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'Btl', true,
      0,
      1.0, 0.0, 'Btl', true,
      1.0, 1.0, 0,
      true, 80000, 80000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-065' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      13.0, 0, '[]'::jsonb,
      10.0, 10.0, 'Btl', true,
      0,
      5.0, 0.0, 'Btl', true,
      5.0, 5.0, 0,
      true, 16095, 160950, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-066' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      3.0, 3.0, 0,
      5.0, 0, '[]'::jsonb,
      5.0, 5.0, 'Btl', true,
      0,
      3.0, 0.0, 'Btl', true,
      3.0, 3.0, 0,
      true, 18315, 91575, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-067' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      3.0, 3.0, 0,
      5.0, 0, '[]'::jsonb,
      2.0, 2.0, 'Btl', true,
      0,
      5.0, 0.0, 'Btl', true,
      5.0, 5.0, 0,
      true, 18315, 36630, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-069' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.4, 2.4, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'kg', true,
      0,
      0.0, 0.3, 'kg', true,
      0.3, 0.3, 0,
      true, 92000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-070' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.0, 0.0, 0,
      120.0, 0, '[]'::jsonb,
      125.0, 125.0, 'kg', true,
      0,
      5.0, 0.0, 'kg', true,
      5.0, 5.0, 0,
      true, 23000, 2875000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-071' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      18.0, 18.0, 0,
      180.0, 0, '[]'::jsonb,
      214.0, 214.0, 'pcs', true,
      0,
      6.0, 0.0, 'pcs', true,
      6.0, 6.0, 0,
      true, 11500, 2461000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-072' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.0, 2.0, 0,
      11.0, 0, '[]'::jsonb,
      10.0, 10.0, 'kg', true,
      0,
      0.0, 0.0, 'kg', true,
      0.0, 0.0, 0,
      true, 55000, 550000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-073' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      43.0, 0, '[]'::jsonb,
      43.0, 43.0, 'pck', true,
      0,
      1.0, 0.0, 'pck', true,
      1.0, 1.0, 0,
      true, 14500, 623500, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-074' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      5.0, 5.0, 0,
      50.0, 0, '[]'::jsonb,
      49.0, 49.0, 'pck', true,
      0,
      10.0, 0.0, 'pck', true,
      10.0, 10.0, 0,
      true, 15000, 735000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-075' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      3.6, 3.6, 0,
      11.0, 0, '[]'::jsonb,
      6.9, 6.9, 'kg', true,
      0,
      2.0, 0.7, 'kg', true,
      2.7, 2.7, 0,
      true, 55000, 379500, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-076' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.3, 0.3, 0,
      14.0, 0, '[]'::jsonb,
      1.5, 1.5, 'kg', true,
      0,
      0.0, 0.4, 'kg', true,
      0.4, 0.4, 0,
      true, 15000, 22500, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-077' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      6.0, 6.0, 0,
      0.0, 0, '[]'::jsonb,
      8.0, 8.0, 'kg', true,
      0,
      3.0, 0.0, 'kg', true,
      3.0, 3.0, 0,
      true, 27000, 216000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-084' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.5, 1.5, 0,
      2.0, 0, '[]'::jsonb,
      1.5, 1.5, 'kg', true,
      0,
      2.0, 0.0, 'kg', true,
      2.0, 2.0, 0,
      true, 69000, 103500, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-083' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.9, 0.9, 0,
      3.0, 0, '[]'::jsonb,
      0.8, 0.8, 'kg', true,
      0,
      1.0, 0.7, 'kg', true,
      1.7, 1.7, 0,
      true, 25000, 20000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-086' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      5.0, 5.0, 0,
      34.0, 0, '[]'::jsonb,
      30.0, 30.0, 'pck', true,
      0,
      5.0, 0.0, 'pck', true,
      5.0, 5.0, 0,
      true, 10000, 300000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-087' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      13.0, 0, '[]'::jsonb,
      9.0, 9.0, 'pck', true,
      0,
      2.0, 0.0, 'pck', true,
      2.0, 2.0, 0,
      true, 3000, 27000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-088' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      18.0, 0, '[]'::jsonb,
      8.0, 8.0, 'pck', true,
      0,
      0.0, 0.5, 'pck', true,
      0.5, 0.5, 0,
      true, 5000, 40000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-099' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      12.0, 12.0, 0,
      42.0, 0, '[]'::jsonb,
      35.0, 35.0, 'pck', true,
      0,
      11.0, 0.0, 'pck', true,
      11.0, 11.0, 0,
      true, 17500, 612500, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-100' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.1333, 0.1333, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'pck', true,
      0,
      1.0, 0.3333, 'pck', true,
      1.3333, 1.3333, 0,
      true, 70000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-102' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      3.3, 3.3, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'pck', true,
      0,
      3.0, 0.0, 'pck', true,
      3.0, 3.0, 0,
      true, 100000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-103' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      5.0, 5.0, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'pck', true,
      0,
      5.0, 0.0, 'pck', true,
      5.0, 5.0, 0,
      true, 200000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-112' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      4.0, 4.0, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'pck', true,
      0,
      3.0, 0.0, 'pck', true,
      3.0, 3.0, 0,
      true, 11000, 11000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-129' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      10.0, 10.0, 0,
      0.0, 0, '[]'::jsonb,
      4.0, 4.0, 'pck', true,
      0,
      16.0, 0.0, 'pck', true,
      16.0, 16.0, 0,
      true, 5600, 22400, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-130' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.5, 0.5, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'pck', true,
      0,
      0.0, 0.0, 'pck', true,
      0.0, 0.0, 0,
      true, 25000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-107' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.5, 0.5, 0,
      0.0, 0, '[]'::jsonb,
      2.0, 2.0, 'pck', true,
      0,
      0.0, 0.3, 'pck', true,
      0.3, 0.3, 0,
      true, 200000, 400000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-108' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.7, 0.7, 0,
      1.0, 0, '[]'::jsonb,
      2.0, 2.0, 'pck', true,
      0,
      0.0, 0.5, 'pck', true,
      0.5, 0.5, 0,
      true, 150000, 300000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-106' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      3.0, 3.0, 0,
      0.0, 0, '[]'::jsonb,
      5.0, 5.0, 'pck', true,
      0,
      12.0, 0.0, 'pck', true,
      12.0, 12.0, 0,
      true, 17666, 88330, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-105' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      7.0, 7.0, 0,
      2.0, 0, '[]'::jsonb,
      0.0, 0.0, 'pck', true,
      0,
      4.0, 0.0, 'pck', true,
      4.0, 4.0, 0,
      true, 24000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-113' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      4.0, 4.0, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'pck', true,
      0,
      4.0, 0.0, 'pck', true,
      4.0, 4.0, 0,
      true, 31500, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-114' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      4.0, 4.0, 0,
      0.0, 0, '[]'::jsonb,
      5.0, 5.0, 'pck', true,
      0,
      2.0, 0.0, 'pck', true,
      2.0, 2.0, 0,
      true, 50000, 250000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-115' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.0, 2.0, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'pcs', true,
      0,
      2.0, 0.0, 'pcs', true,
      2.0, 2.0, 0,
      true, 41000, 41000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-116' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.5, 0.5, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'pck', true,
      0,
      4.0, 0.0, 'pck', true,
      4.0, 4.0, 0,
      true, 70000, 70000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-117' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      3.2, 3.2, 0,
      0.0, 0, '[]'::jsonb,
      3.1, 3.1, 'pck', true,
      0,
      27.0, 0.0, 'pck', true,
      27.0, 27.0, 0,
      true, 70000, 217000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-089' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      32.0, 32.0, 0,
      0.0, 0, '[]'::jsonb,
      21.0, 21.0, 'pck', true,
      0,
      14.0, 0.0, 'pck', true,
      14.0, 14.0, 0,
      true, 9049, 190029, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-090' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      9.0, 9.0, 0,
      0.0, 0, '[]'::jsonb,
      21.0, 21.0, 'pck', true,
      0,
      10.0, 0.0, 'pck', true,
      10.0, 10.0, 0,
      true, 10100, 212100, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-091' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      18.0, 18.0, 0,
      0.0, 0, '[]'::jsonb,
      13.0, 13.0, 'pck', true,
      0,
      3.0, 0.0, 'pck', true,
      3.0, 3.0, 0,
      true, 10100, 131300, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-092' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      7.5, 7.5, 0,
      12.0, 0, '[]'::jsonb,
      11.1667, 11.1667, 'pck', true,
      0,
      5.0, 0.6667, 'pck', true,
      5.6667, 5.6667, 0,
      true, 93240, 1041183, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-093' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      9.5, 9.5, 0,
      8.0, 0, '[]'::jsonb,
      5.8333, 5.8333, 'pck', true,
      0,
      8.0, 0.3333, 'pck', true,
      8.3333, 8.3333, 0,
      true, 93240, 543897, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-094' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      6.8333, 6.8333, 0,
      14.6667, 0, '[]'::jsonb,
      12.0, 12.0, 'pck', true,
      0,
      5.0, 0.8333, 'pck', true,
      5.8333, 5.8333, 0,
      true, 93240, 1118880, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-095' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.3, 0.3, 0,
      6.0, 0, '[]'::jsonb,
      0.2, 0.2, 'pck', true,
      0,
      0.0, 0.1, 'pck', true,
      0.1, 0.1, 0,
      true, 105000, 21000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-096' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.1, 2.1, 0,
      2.0, 0, '[]'::jsonb,
      1.6, 1.6, 'pck', true,
      0,
      1.0, 0.5, 'pck', true,
      1.5, 1.5, 0,
      true, 105000, 168000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-097' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.8, 2.8, 0,
      2.0, 0, '[]'::jsonb,
      1.3, 1.3, 'pck', true,
      0,
      2.0, 0.8, 'pck', true,
      2.8, 2.8, 0,
      true, 105000, 136500, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-098' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.5, 2.5, 0,
      2.0, 0, '[]'::jsonb,
      2.6, 2.6, 'pck', true,
      0,
      1.0, 0.0, 'pck', true,
      1.0, 1.0, 0,
      true, 105000, 273000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.0, 2.0, 0,
      240.0, 0, '[]'::jsonb,
      236.0, 236.0, 'pck', true,
      0,
      0.0, 0.0, 'pck', true,
      0.0, 0.0, 0,
      true, 18000, 4248000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-118' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      3.0, 3.0, 0,
      0.0, 0, '[]'::jsonb,
      5.0, 5.0, 'pck', true,
      0,
      6.0, 0.0, 'pck', true,
      6.0, 6.0, 0,
      true, 20000, 100000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-119' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'pck', true,
      0,
      1.0, 0.0, 'pck', true,
      1.0, 1.0, 0,
      true, 6000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-120' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      3.0, 3.0, 0,
      0.0, 0, '[]'::jsonb,
      3.0, 3.0, 'pcs', true,
      0,
      7.0, 0.0, 'pcs', true,
      7.0, 7.0, 0,
      true, 730, 2190, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-121' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      5.0, 5.0, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'pcs', true,
      0,
      6.0, 0.0, 'pcs', true,
      6.0, 6.0, 0,
      true, 836, 836, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-122' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      6.0, 6.0, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'pcs', true,
      0,
      8.0, 0.0, 'pcs', true,
      8.0, 8.0, 0,
      true, 258, 258, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-123' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      9.0, 9.0, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'pcs', true,
      0,
      9.0, 0.0, 'pcs', true,
      9.0, 9.0, 0,
      true, 258, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-125' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.5, 1.5, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'pck', true,
      0,
      1.0, 0.0, 'pck', true,
      1.0, 1.0, 0,
      true, 14000, 14000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-128' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      2.0, 2.0, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'Crtn', true,
      0,
      0.0, 0.0, 'Crtn', true,
      0.0, 0.0, 0,
      true, 192000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-127' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      3.0, 3.0, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'pcs', true,
      0,
      0.0, 0.0, 'pcs', true,
      0.0, 0.0, 0,
      true, 9200, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-002' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.0, 1.0, 0,
      0.0, 0, '[]'::jsonb,
      0.2, 0.2, 'pck', true,
      0,
      0.0, 0.4, 'pck', true,
      0.4, 0.4, 0,
      true, 150000, 30000, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-018' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      4.0, 4.0, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'pcs', true,
      0,
      3.0, 0.0, 'pcs', true,
      3.0, 3.0, 0,
      true, 11500, 11500, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-019' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      5.0, 5.0, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'pcs', true,
      0,
      5.0, 0.0, 'pcs', true,
      5.0, 5.0, 0,
      true, 14000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-008' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      4.0, 4.0, 0,
      0.0, 0, '[]'::jsonb,
      1.0, 1.0, 'pck', true,
      0,
      15.0, 0.0, 'pck', true,
      15.0, 15.0, 0,
      true, 5536, 5536, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-009' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      10.0, 10.0, 0,
      0.0, 0, '[]'::jsonb,
      2.0, 2.0, 'pck', true,
      0,
      50.0, 0.0, 'pck', true,
      50.0, 50.0, 0,
      true, 5536, 11072, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-010' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      3.0, 3.0, 0,
      0.0, 0, '[]'::jsonb,
      2.0, 2.0, 'pck', true,
      0,
      15.0, 0.0, 'pck', true,
      15.0, 15.0, 0,
      true, 5536, 11072, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-011' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.0, 0.0, 0,
      0.0, 0, '[]'::jsonb,
      9.0, 9.0, 'pck', true,
      0,
      5.0, 0.0, 'pck', true,
      5.0, 5.0, 0,
      true, 5536, 49824, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-012' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      5.0, 5.0, 0,
      0.0, 0, '[]'::jsonb,
      3.0, 3.0, 'pck', true,
      0,
      10.0, 0.0, 'pck', true,
      10.0, 10.0, 0,
      true, 5536, 16608, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-013' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      43.0, 43.0, 0,
      0.0, 0, '[]'::jsonb,
      13.0, 13.0, 'pck', true,
      0,
      31.0, 0.0, 'pck', true,
      31.0, 31.0, 0,
      true, 5536, 71968, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-014' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      9.0, 9.0, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'pck', true,
      0,
      15.0, 0.0, 'pck', true,
      15.0, 15.0, 0,
      true, 5536, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-027' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.9167, 0.9167, 0,
      0.0, 0, '[]'::jsonb,
      0.0833, 0.0833, 'Crtn', true,
      0,
      0.0, 0.9167, 'Crtn', true,
      0.9167, 0.9167, 0,
      true, 524200, 43666, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-023' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.4167, 1.4167, 0,
      0.0, 0, '[]'::jsonb,
      0.9167, 0.9167, 'Crtn', true,
      0,
      1.0, 0.4167, 'Crtn', true,
      1.4167, 1.4167, 0,
      true, 515200, 472284, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-024' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.6667, 0.6667, 0,
      0.0, 0, '[]'::jsonb,
      0.7083, 0.7083, 'Crtn', true,
      0,
      0.0, 0.6667, 'Crtn', true,
      0.6667, 0.6667, 0,
      true, 495000, 350608, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-025' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.875, 0.875, 0,
      0.0, 0, '[]'::jsonb,
      0.0417, 0.0417, 'Crtn', true,
      0,
      0.0, 0.875, 'Crtn', true,
      0.875, 0.875, 0,
      true, 539200, 22485, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-026' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.4583, 0.4583, 0,
      0.0, 0, '[]'::jsonb,
      1.125, 1.125, 'Crtn', true,
      0,
      0.0, 0.4583, 'Crtn', true,
      0.4583, 0.4583, 0,
      true, 602200, 677475, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-028' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.9167, 0.9167, 0,
      0.0, 0, '[]'::jsonb,
      0.3333, 0.3333, 'Crtn', true,
      0,
      0.0, 0.9167, 'Crtn', true,
      0.9167, 0.9167, 0,
      true, 495000, 164984, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-029' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.875, 0.875, 0,
      0.0, 0, '[]'::jsonb,
      0.0, 0.0, 'Crtn', true,
      0,
      0.0, 0.875, 'Crtn', true,
      0.875, 0.875, 0,
      true, 351000, 0, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-030' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      1.4167, 1.4167, 0,
      0.0, 0, '[]'::jsonb,
      0.1667, 0.1667, 'Crtn', true,
      0,
      1.0, 0.4167, 'Crtn', true,
      1.4167, 1.4167, 0,
      true, 641700, 106971, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-031' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.daily_inventory_items (
      inventory_id, tenant_id, branch_id, material_id,
      prev_full_qty, opening_full_qty, opening_broken_qty,
      in_qty, manual_in_qty, manual_in_lots,
      out_qty, out_qty_input, out_unit, out_confirmed,
      waste_qty,
      full_qty, broken_qty, broken_unit, broken_confirmed,
      closing_qty, system_qty, variance,
      is_counted, unit_cost_snapshot, usage_value, production_usage_qty,
      zero_activity_confirmed, reconciliation_status
    ) VALUES (
      v_di_id, v_tenant_id, v_bsd_id, v_mat_id,
      0.8333, 0.8333, 0,
      0.0, 0, '[]'::jsonb,
      0.0833, 0.0833, 'Crtn', true,
      0,
      0.0, 0.8333, 'Crtn', true,
      0.8333, 0.8333, 0,
      true, 585900, 48805, 0,
      true, 'OK'
    ) ON CONFLICT (inventory_id, material_id) DO NOTHING;
  END IF;

  -- 11. CATAT HISTORI STOCK OPNAME AKHIR AGUSTUS 2026 (RESTO & CENTRAL)
  INSERT INTO public.stock_opnames (
    tenant_id, branch_id, period_month, period_year, location, status, created_by, created_at, updated_at
  ) VALUES (
    v_tenant_id, v_bsd_id, 8, 2026, 'RESTO', 'APPROVED', v_owner_uid, '2026-08-31 23:30:00+07'::timestamptz, '2026-08-31 23:30:00+07'::timestamptz
  ) RETURNING id INTO v_opname_resto_id;

  INSERT INTO public.stock_opnames (
    tenant_id, branch_id, period_month, period_year, location, status, created_by, created_at, updated_at
  ) VALUES (
    v_tenant_id, v_bsd_id, 8, 2026, 'CENTRAL', 'APPROVED', v_owner_uid, '2026-08-31 23:30:00+07'::timestamptz, '2026-08-31 23:30:00+07'::timestamptz
  ) RETURNING id INTO v_opname_central_id;

  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-001' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 7.0, 7.0, 'Stok Awal 1 Agu: 10.0 | Masuk: 10.0 | Keluar: 12.0 | Stok Akhir 31 Agu: 7.0', 220000, 1540000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-002' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.4, 0.4, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 0.2 | Stok Akhir 31 Agu: 0.4', 150000, 60000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-003' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 150000, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-004' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 50.0, 50.0, 'Stok Awal 1 Agu: 51.0 | Masuk: 0.0 | Keluar: 53.0 | Stok Akhir 31 Agu: 50.0', 3750, 187500.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-004' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 100.0, 100.0, 'SO BAR CENTRAL 31 Agustus 2026', 3750, 375000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-005' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 100.0, 100.0, 'Stok Awal 1 Agu: 70.0 | Masuk: 1.0 | Keluar: 230.0 | Stok Akhir 31 Agu: 100.0', 1400, 140000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-005' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 800.0, 800.0, 'SO BAR CENTRAL 31 Agustus 2026', 1400, 1120000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-006' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.5, 0.5, 'Stok Awal 1 Agu: 0.5 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.5', 188000, 94000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-006' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 5.0, 5.0, 'SO BAR CENTRAL 31 Agustus 2026', 188000, 940000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-007' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 0.3 | Masuk: 2.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 68800, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-008' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 15.0, 15.0, 'Stok Awal 1 Agu: 4.0 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 15.0', 5536, 83040.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-009' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 50.0, 50.0, 'Stok Awal 1 Agu: 10.0 | Masuk: 0.0 | Keluar: 2.0 | Stok Akhir 31 Agu: 50.0', 5536, 276800.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-010' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 15.0, 15.0, 'Stok Awal 1 Agu: 3.0 | Masuk: 0.0 | Keluar: 2.0 | Stok Akhir 31 Agu: 15.0', 5536, 83040.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-011' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 5.0, 5.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 0.0 | Keluar: 9.0 | Stok Akhir 31 Agu: 5.0', 5536, 27680.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-012' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 10.0, 10.0, 'Stok Awal 1 Agu: 5.0 | Masuk: 0.0 | Keluar: 3.0 | Stok Akhir 31 Agu: 10.0', 5536, 55360.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-013' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 31.0, 31.0, 'Stok Awal 1 Agu: 43.0 | Masuk: 0.0 | Keluar: 13.0 | Stok Akhir 31 Agu: 31.0', 5536, 171616.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-014' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 15.0, 15.0, 'Stok Awal 1 Agu: 9.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 15.0', 5536, 83040.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-015' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 4.0, 4.0, 'Stok Awal 1 Agu: 2.0 | Masuk: 12.0 | Keluar: 13.0 | Stok Akhir 31 Agu: 4.0', 19500, 78000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-016' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 30.0, 30.0, 'Stok Awal 1 Agu: 36.0 | Masuk: 72.0 | Keluar: 127.0 | Stok Akhir 31 Agu: 30.0', 19739, 592170.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-017' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 75000, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-018' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 3.0, 3.0, 'Stok Awal 1 Agu: 4.0 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 3.0', 11500, 34500.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-019' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 5.0, 5.0, 'Stok Awal 1 Agu: 5.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 5.0', 14000, 70000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-020' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 11.0, 11.0, 'Stok Awal 1 Agu: 7.0 | Masuk: 4.0 | Keluar: 4.0 | Stok Akhir 31 Agu: 11.0', 11500, 126500.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-021' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 11.0, 11.0, 'Stok Awal 1 Agu: 16.0 | Masuk: 10.0 | Keluar: 11.0 | Stok Akhir 31 Agu: 11.0', 14000, 154000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-022' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.375, 0.375, 'Stok Awal 1 Agu: 1.4583 | Masuk: 30.0 | Keluar: 55.75 | Stok Akhir 31 Agu: 0.375', 58000, 21750.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-023' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.4167, 1.4167, 'Stok Awal 1 Agu: 1.4167 | Masuk: 0.0 | Keluar: 0.9167 | Stok Akhir 31 Agu: 1.4167', 515200, 729883.84, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-024' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.6667, 0.6667, 'Stok Awal 1 Agu: 0.6667 | Masuk: 0.0 | Keluar: 0.7083 | Stok Akhir 31 Agu: 0.6667', 495000, 330016.5, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-025' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.875, 0.875, 'Stok Awal 1 Agu: 0.875 | Masuk: 0.0 | Keluar: 0.0417 | Stok Akhir 31 Agu: 0.875', 539200, 471800.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-026' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.4583, 0.4583, 'Stok Awal 1 Agu: 0.4583 | Masuk: 0.0 | Keluar: 1.125 | Stok Akhir 31 Agu: 0.4583', 602200, 275988.26, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-027' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.9167, 0.9167, 'Stok Awal 1 Agu: 0.9167 | Masuk: 0.0 | Keluar: 0.0833 | Stok Akhir 31 Agu: 0.9167', 524200, 480534.14, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-028' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.9167, 0.9167, 'Stok Awal 1 Agu: 0.9167 | Masuk: 0.0 | Keluar: 0.3333 | Stok Akhir 31 Agu: 0.9167', 495000, 453766.5, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-029' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.875, 0.875, 'Stok Awal 1 Agu: 0.875 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.875', 351000, 307125.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-030' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.4167, 1.4167, 'Stok Awal 1 Agu: 1.4167 | Masuk: 0.0 | Keluar: 0.1667 | Stok Akhir 31 Agu: 1.4167', 641700, 909096.39, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-031' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.8333, 0.8333, 'Stok Awal 1 Agu: 0.8333 | Masuk: 0.0 | Keluar: 0.0833 | Stok Akhir 31 Agu: 0.8333', 585900, 488230.47, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-032' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.5, 0.5, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 0.5', 156000, 78000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-032' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 6.0, 6.0, 'SO BAR CENTRAL 31 Agustus 2026', 156000, 936000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-033' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 2.0 | Masuk: 0.0 | Keluar: 2.0 | Stok Akhir 31 Agu: 1.0', 180000, 180000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-033' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 5.0, 5.0, 'SO BAR CENTRAL 31 Agustus 2026', 180000, 900000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-034' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 8.0, 8.0, 'Stok Awal 1 Agu: 4.0 | Masuk: 0.0 | Keluar: 6.0 | Stok Akhir 31 Agu: 8.0', 93000, 744000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-034' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 10.0, 10.0, 'SO BAR CENTRAL 31 Agustus 2026', 93000, 930000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-035' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 4.0, 4.0, 'Stok Awal 1 Agu: 5.0 | Masuk: 0.0 | Keluar: 9.0 | Stok Akhir 31 Agu: 4.0', 40191, 160764.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-035' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 13.0, 13.0, 'SO BAR CENTRAL 31 Agustus 2026', 40191, 522483.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-036' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 9.0, 9.0, 'Stok Awal 1 Agu: 7.0 | Masuk: 0.0 | Keluar: 5.0 | Stok Akhir 31 Agu: 9.0', 40191, 361719.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-036' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 23.0, 23.0, 'SO BAR CENTRAL 31 Agustus 2026', 40191, 924393.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-037' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 2.0 | Masuk: 0.0 | Keluar: 2.0 | Stok Akhir 31 Agu: 1.0', 104880, 104880.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-037' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 6.0, 6.0, 'SO BAR CENTRAL 31 Agustus 2026', 104880, 629280.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-038' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 1.0', 62000, 62000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-038' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 7.0, 7.0, 'SO BAR CENTRAL 31 Agustus 2026', 62000, 434000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-039' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.5 | Masuk: 0.0 | Keluar: 2.5 | Stok Akhir 31 Agu: 1.0', 62000, 62000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-039' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'SO BAR CENTRAL 31 Agustus 2026', 62000, 124000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-040' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.5, 1.5, 'Stok Awal 1 Agu: 2.0 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 1.5', 255000, 382500.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-040' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 3.0, 3.0, 'SO BAR CENTRAL 31 Agustus 2026', 255000, 765000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-041' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.5 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 1.0', 55000, 55000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-041' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'SO BAR CENTRAL 31 Agustus 2026', 55000, 110000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-042' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 0.0 | Keluar: 3.0 | Stok Akhir 31 Agu: 2.0', 166500, 333000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-042' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'SO BAR CENTRAL 31 Agustus 2026', 166500, 333000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-043' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 2.0 | Masuk: 0.0 | Keluar: 2.0 | Stok Akhir 31 Agu: 1.0', 166500, 166500.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-043' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 3.0, 3.0, 'SO BAR CENTRAL 31 Agustus 2026', 166500, 499500.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-044' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'Stok Awal 1 Agu: 2.0 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 2.0', 166500, 333000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-044' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'SO BAR CENTRAL 31 Agustus 2026', 166500, 333000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-045' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 1.0', 111000, 111000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-045' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 3.0, 3.0, 'SO BAR CENTRAL 31 Agustus 2026', 111000, 333000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-046' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 3.0 | Stok Akhir 31 Agu: 1.0', 111000, 111000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-046' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 9.0, 9.0, 'SO BAR CENTRAL 31 Agustus 2026', 111000, 999000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-047' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 2.0', 111000, 222000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-047' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'SO BAR CENTRAL 31 Agustus 2026', 111000, 222000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-048' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 1.0', 111000, 111000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-048' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'SO BAR CENTRAL 31 Agustus 2026', 111000, 222000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-049' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 2.0 | Stok Akhir 31 Agu: 1.0', 111000, 111000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-049' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 3.0, 3.0, 'SO BAR CENTRAL 31 Agustus 2026', 111000, 333000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-050' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 1.0', 111000, 111000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-050' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 4.0, 4.0, 'SO BAR CENTRAL 31 Agustus 2026', 111000, 444000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-051' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 3.0 | Stok Akhir 31 Agu: 1.0', 111000, 111000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-051' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'SO BAR CENTRAL 31 Agustus 2026', 111000, 222000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-052' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 4.0, 4.0, 'Stok Awal 1 Agu: 5.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 4.0', 111000, 444000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-052' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 3.0, 3.0, 'SO BAR CENTRAL 31 Agustus 2026', 111000, 333000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-053' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 1.0', 111000, 111000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-053' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 3.0, 3.0, 'SO BAR CENTRAL 31 Agustus 2026', 111000, 333000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-054' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'Stok Awal 1 Agu: 3.0 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 2.0', 111000, 222000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-054' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'SO BAR CENTRAL 31 Agustus 2026', 111000, 111000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-055' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 2.0', 111000, 222000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-056' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'Stok Awal 1 Agu: 2.0 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 2.0', 111000, 222000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-057' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 3.0 | Stok Akhir 31 Agu: 0.0', 111000, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-058' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 0.0 | Keluar: 5.0 | Stok Akhir 31 Agu: 1.0', 111000, 111000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-058' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 4.0, 4.0, 'SO BAR CENTRAL 31 Agustus 2026', 111000, 444000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-059' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 1.0', 111000, 111000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-060' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 2.0 | Stok Akhir 31 Agu: 2.0', 100000, 200000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-061' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 2.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 1.0', 100000, 100000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-062' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 2.0 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 1.0', 100000, 100000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-062' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'SO BAR CENTRAL 31 Agustus 2026', 100000, 200000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-063' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 2.0 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 1.0', 156000, 156000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-063' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'SO BAR CENTRAL 31 Agustus 2026', 156000, 312000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-064' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 2.0 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 1.0', 80000, 80000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-065' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 5.0, 5.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 13.0 | Keluar: 10.0 | Stok Akhir 31 Agu: 5.0', 16095, 80475.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-066' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 3.0, 3.0, 'Stok Awal 1 Agu: 3.0 | Masuk: 5.0 | Keluar: 5.0 | Stok Akhir 31 Agu: 3.0', 18315, 54945.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-067' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 5.0, 5.0, 'Stok Awal 1 Agu: 3.0 | Masuk: 5.0 | Keluar: 2.0 | Stok Akhir 31 Agu: 5.0', 18315, 91575.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-068' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 2.0 | Masuk: 240.0 | Keluar: 236.0 | Stok Akhir 31 Agu: 0.0', 18000, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-069' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.3, 0.3, 'Stok Awal 1 Agu: 2.4 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.3', 92000, 27600.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-070' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 5.0, 5.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 120.0 | Keluar: 125.0 | Stok Akhir 31 Agu: 5.0', 23000, 115000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-071' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 6.0, 6.0, 'Stok Awal 1 Agu: 18.0 | Masuk: 180.0 | Keluar: 214.0 | Stok Akhir 31 Agu: 6.0', 11500, 69000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-072' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 2.0 | Masuk: 11.0 | Keluar: 10.0 | Stok Akhir 31 Agu: 0.0', 55000, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-073' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 43.0 | Keluar: 43.0 | Stok Akhir 31 Agu: 1.0', 14500, 14500.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-074' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 10.0, 10.0, 'Stok Awal 1 Agu: 5.0 | Masuk: 50.0 | Keluar: 49.0 | Stok Akhir 31 Agu: 10.0', 15000, 150000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-075' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 2.7, 2.7, 'Stok Awal 1 Agu: 3.6 | Masuk: 11.0 | Keluar: 6.9 | Stok Akhir 31 Agu: 2.7', 55000, 148500.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-076' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.4, 0.4, 'Stok Awal 1 Agu: 0.3 | Masuk: 14.0 | Keluar: 1.5 | Stok Akhir 31 Agu: 0.4', 15000, 6000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-077' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 3.0, 3.0, 'Stok Awal 1 Agu: 6.0 | Masuk: 0.0 | Keluar: 8.0 | Stok Akhir 31 Agu: 3.0', 27000, 81000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-077' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 31.0, 31.0, 'SO BAR CENTRAL 31 Agustus 2026', 27000, 837000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-078' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 60000, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-079' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 38000, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-080' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 28000, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-081' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 20000, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-082' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 25000, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-083' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.7, 1.7, 'Stok Awal 1 Agu: 0.9 | Masuk: 3.0 | Keluar: 0.8 | Stok Akhir 31 Agu: 1.7', 25000, 42500.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-084' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'Stok Awal 1 Agu: 1.5 | Masuk: 2.0 | Keluar: 1.5 | Stok Akhir 31 Agu: 2.0', 69000, 138000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-085' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 20000, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-086' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 5.0, 5.0, 'Stok Awal 1 Agu: 5.0 | Masuk: 34.0 | Keluar: 30.0 | Stok Akhir 31 Agu: 5.0', 10000, 50000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-087' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 13.0 | Keluar: 9.0 | Stok Akhir 31 Agu: 2.0', 3000, 6000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-088' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.5, 0.5, 'Stok Awal 1 Agu: 1.0 | Masuk: 18.0 | Keluar: 8.0 | Stok Akhir 31 Agu: 0.5', 5000, 2500.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-089' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 14.0, 14.0, 'Stok Awal 1 Agu: 32.0 | Masuk: 0.0 | Keluar: 21.0 | Stok Akhir 31 Agu: 14.0', 9049, 126686.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-090' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 10.0, 10.0, 'Stok Awal 1 Agu: 9.0 | Masuk: 0.0 | Keluar: 21.0 | Stok Akhir 31 Agu: 10.0', 10100, 101000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-091' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 3.0, 3.0, 'Stok Awal 1 Agu: 18.0 | Masuk: 0.0 | Keluar: 13.0 | Stok Akhir 31 Agu: 3.0', 10100, 30300.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-092' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 5.6667, 5.6667, 'Stok Awal 1 Agu: 7.5 | Masuk: 12.0 | Keluar: 11.1667 | Stok Akhir 31 Agu: 5.6667', 93240, 528363.11, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-093' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 8.3333, 8.3333, 'Stok Awal 1 Agu: 9.5 | Masuk: 8.0 | Keluar: 5.8333 | Stok Akhir 31 Agu: 8.3333', 93240, 776996.89, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-094' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 5.8333, 5.8333, 'Stok Awal 1 Agu: 6.8333 | Masuk: 14.6667 | Keluar: 12.0 | Stok Akhir 31 Agu: 5.8333', 93240, 543896.89, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-095' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.1, 0.1, 'Stok Awal 1 Agu: 0.3 | Masuk: 6.0 | Keluar: 0.2 | Stok Akhir 31 Agu: 0.1', 105000, 10500.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-096' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.5, 1.5, 'Stok Awal 1 Agu: 2.1 | Masuk: 2.0 | Keluar: 1.6 | Stok Akhir 31 Agu: 1.5', 105000, 157500.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-097' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 2.8, 2.8, 'Stok Awal 1 Agu: 2.8 | Masuk: 2.0 | Keluar: 1.3 | Stok Akhir 31 Agu: 2.8', 105000, 294000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-098' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 2.5 | Masuk: 2.0 | Keluar: 2.6 | Stok Akhir 31 Agu: 1.0', 105000, 105000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-099' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 11.0, 11.0, 'Stok Awal 1 Agu: 12.0 | Masuk: 42.0 | Keluar: 35.0 | Stok Akhir 31 Agu: 11.0', 17500, 192500.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-100' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.3333, 1.3333, 'Stok Awal 1 Agu: 0.1333 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 1.3333', 70000, 93331.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-101' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 283050, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-102' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 3.0, 3.0, 'Stok Awal 1 Agu: 3.3 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 3.0', 100000, 300000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-103' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 5.0, 5.0, 'Stok Awal 1 Agu: 5.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 5.0', 200000, 1000000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-103' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 5.0, 5.0, 'SO BAR CENTRAL 31 Agustus 2026', 200000, 1000000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-104' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 6500, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-105' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 4.0, 4.0, 'Stok Awal 1 Agu: 7.0 | Masuk: 2.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 4.0', 24000, 96000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-106' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 12.0, 12.0, 'Stok Awal 1 Agu: 3.0 | Masuk: 0.0 | Keluar: 5.0 | Stok Akhir 31 Agu: 12.0', 17666, 211992.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-107' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.3, 0.3, 'Stok Awal 1 Agu: 0.5 | Masuk: 0.0 | Keluar: 2.0 | Stok Akhir 31 Agu: 0.3', 200000, 60000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-108' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.5, 0.5, 'Stok Awal 1 Agu: 0.7 | Masuk: 1.0 | Keluar: 2.0 | Stok Akhir 31 Agu: 0.5', 150000, 75000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-109' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.2, 0.2, 'Stok Awal 1 Agu: 0.2 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.2', 284000, 56800.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-110' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.6, 0.6, 'Stok Awal 1 Agu: 0.7 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.6', 200000, 120000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-111' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 0.1 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 360000, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-112' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 3.0, 3.0, 'Stok Awal 1 Agu: 4.0 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 3.0', 11000, 33000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-113' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 4.0, 4.0, 'Stok Awal 1 Agu: 4.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 4.0', 31500, 126000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-113' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 23.0, 23.0, 'SO BAR CENTRAL 31 Agustus 2026', 31500, 724500.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-114' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'Stok Awal 1 Agu: 4.0 | Masuk: 0.0 | Keluar: 5.0 | Stok Akhir 31 Agu: 2.0', 50000, 100000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-114' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 17.0, 17.0, 'SO BAR CENTRAL 31 Agustus 2026', 50000, 850000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-115' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'Stok Awal 1 Agu: 2.0 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 2.0', 41000, 82000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-116' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 4.0, 4.0, 'Stok Awal 1 Agu: 0.5 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 4.0', 70000, 280000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-117' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 27.0, 27.0, 'Stok Awal 1 Agu: 3.2 | Masuk: 0.0 | Keluar: 3.1 | Stok Akhir 31 Agu: 27.0', 70000, 1890000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-118' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 6.0, 6.0, 'Stok Awal 1 Agu: 3.0 | Masuk: 0.0 | Keluar: 5.0 | Stok Akhir 31 Agu: 6.0', 20000, 120000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-118' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 9.0, 9.0, 'SO BAR CENTRAL 31 Agustus 2026', 20000, 180000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-119' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 1.0', 6000, 6000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-119' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 7.0, 7.0, 'SO BAR CENTRAL 31 Agustus 2026', 6000, 42000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-120' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 7.0, 7.0, 'Stok Awal 1 Agu: 3.0 | Masuk: 0.0 | Keluar: 3.0 | Stok Akhir 31 Agu: 7.0', 730, 5110.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-120' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 122.0, 122.0, 'SO BAR CENTRAL 31 Agustus 2026', 730, 89060.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-121' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 6.0, 6.0, 'Stok Awal 1 Agu: 5.0 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 6.0', 836, 5016.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-121' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 38.0, 38.0, 'SO BAR CENTRAL 31 Agustus 2026', 836, 31768.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-122' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 8.0, 8.0, 'Stok Awal 1 Agu: 6.0 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 8.0', 258, 2064.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-122' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 136.0, 136.0, 'SO BAR CENTRAL 31 Agustus 2026', 258, 35088.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-123' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 9.0, 9.0, 'Stok Awal 1 Agu: 9.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 9.0', 258, 2322.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-123' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 19.0, 19.0, 'SO BAR CENTRAL 31 Agustus 2026', 258, 4902.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-124' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 14000, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-125' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.5 | Masuk: 0.0 | Keluar: 1.0 | Stok Akhir 31 Agu: 1.0', 14000, 14000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-125' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_central_id, v_tenant_id, v_bsd_id, v_mat_id, 5.0, 5.0, 'SO BAR CENTRAL 31 Agustus 2026', 14000, 70000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-126' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 111000, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-127' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 3.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 9200, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-128' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 2.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 192000, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-129' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 16.0, 16.0, 'Stok Awal 1 Agu: 10.0 | Masuk: 0.0 | Keluar: 4.0 | Stok Akhir 31 Agu: 16.0', 5600, 89600.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-130' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 0.5 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 25000, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-131' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 1.0', 12000, 12000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-132' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 55000, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-133' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 0.0, 0.0, 'Stok Awal 1 Agu: 0.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 0.0', 33000, 0.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-134' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 1.0', 130000, 130000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-135' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 1.0', 10750, 10750.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-136' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 1.0', 3440, 3440.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-137' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 1.0', 3133, 3133.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-138' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'Stok Awal 1 Agu: 2.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 2.0', 17500, 35000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-139' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 2.0, 2.0, 'Stok Awal 1 Agu: 2.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 2.0', 7000, 14000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-140' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 1.0', 115000, 115000.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-141' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 1.0', 30657, 30657.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;
  SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND branch_id = v_bsd_id AND sku = 'SKU-UMT-142' LIMIT 1;
  IF v_mat_id IS NOT NULL THEN
    INSERT INTO public.stock_opname_items (
      opname_id, tenant_id, branch_id, material_id, book_qty, physical_qty, notes, unit_cost_snapshot, valuation_snapshot, valuation_is_estimated
    ) VALUES (
      v_opname_resto_id, v_tenant_id, v_bsd_id, v_mat_id, 1.0, 1.0, 'Stok Awal 1 Agu: 1.0 | Masuk: 0.0 | Keluar: 0.0 | Stok Akhir 31 Agu: 1.0', 88557, 88557.0, false
    ) ON CONFLICT (opname_id, material_id) DO NOTHING;
  END IF;

  -- 12. UPDATE AREA ROLE MAPPINGS AGAR ROLE BARISTA MELIHAT SELURUH KATEGORI UMATIS
  INSERT INTO public.area_role_mappings (tenant_id, branch_id, area_code, area_name, role_classification, allowed_categories, is_system)
  VALUES
    (v_tenant_id, v_bsd_id, 'CENTRAL', 'Central Warehouse', 'Central', ARRAY[]::text[], true),
    (v_tenant_id, v_bsd_id, 'RESTO', 'Resto / Bar', 'Bar', ARRAY['Coffee', 'Coffee & Tea', 'Dairy', 'Milk', 'Milk & Dairy', 'Sweetener', 'Syrup', 'Syrup & Sauce', 'Beverage Base', 'Ready to Drink', 'Drink & Beer', 'Powder', 'Powder & Topping', 'Juice', 'Fresh', 'Fresh Fruit', 'Dry Goods', 'Fruit & Produce', 'Fresh & Fruit', 'Garnish', 'Plastic & Paper', 'Others', 'Operational & Prep', 'Batch Prep Barista', 'Prep / Bahan Olahan', 'Bahan Olahan / Prep'], true),
    (v_tenant_id, v_bsd_id, 'KITCHEN', 'Kitchen (Dapur)', 'Kitchen', ARRAY['Kitchen & Cooking', 'Meat & Poultry', 'Fruit & Produce', 'Fresh & Fruit', 'Prep / Bahan Olahan', 'Bahan Olahan / Prep', 'Bahan Baku Dasar', 'Dairy & Cooking', 'Spices & Seasoning'], true),
    (v_tenant_id, v_bsd_id, 'SERVICE', 'Service / Floor', 'Service', ARRAY['Packaging', 'Amenities', 'Consumables', 'Tissue & Cleaning', 'Ready to Drink', 'Plastic & Paper'], true)
  ON CONFLICT (tenant_id, branch_id, area_code) DO UPDATE
    SET role_classification = EXCLUDED.role_classification,
        allowed_categories = EXCLUDED.allowed_categories,
        updated_at = now();

  RETURN jsonb_build_object(
    'status', 'success',
    'tenant_id', v_tenant_id,
    'company_name', 'Resto Umatis',
    'bsd_branch_id', v_bsd_id,
    'kasuna_branch_id', v_kasuna_id,
    'materials_seeded', 142,
    'suppliers_seeded', 30,
    'recipes_seeded', 68,
    'purchases_history_seeded', 84,
    'active_stock_period', '2026-08-31 (Stok Akhir 31 Agustus 2026)',
    'seeded_at', now()
  );
END;
$$;
  $bv_fn_ddl$;
BEGIN
  EXECUTE v_ddl;
EXCEPTION WHEN SQLSTATE '42P13' THEN
  BEGIN
    DROP FUNCTION IF EXISTS public.seed_beta_testing_dummy_data_v13();
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Pertahankan definisi fungsi eksisting public.seed_beta_testing_dummy_data_v13(): %', SQLERRM;
  END;
END $bv_fn_wrap$;

GRANT EXECUTE ON FUNCTION public.seed_beta_testing_dummy_data_v13() TO anon, authenticated, service_role;

-- Eksekusi langsung agar database bersih dari data demo dan terisi penuh data Umatis Agustus 2026
SELECT public.seed_beta_testing_dummy_data_v13();

NOTIFY pgrst, 'reload schema';

COMMIT;
