-- =============================================================================
-- BARVENTIS V2 — CORE MIGRATION  (revisi: ADITIF, ADAPTIF TIPE, MULTI-TENANT)
--
-- Kenapa script sebelumnya gagal:
--   `CREATE TABLE IF NOT EXISTS materials (id UUID ...)` DILEWATI karena tabel
--   `materials` V1 sudah ada dengan id BIGINT. Semua FK UUID -> materials(id)
--   lalu ditolak Postgres (42804).
--
-- Prinsip script ini:
--   1. TIDAK PERNAH drop / mengubah tipe kolom tabel V1. Tabel V1 hanya
--      ditambah kolom (ADD COLUMN IF NOT EXISTS).
--   2. Tipe FK (materials.id, branches.id, tenants.id) DIBACA dari database,
--      bukan diasumsikan -> aman untuk bigint maupun uuid.
--   3. Semua tabel baru punya tenant_id + RLS (aplikasi V1 memfilter tenant_id
--      di hampir semua query).
--   4. Nama objek V2 dibuat tidak bentrok dengan V1
--      (mis. daily_stock_counts, close_daily_stock_eod) sehingga
--      close_daily_inventory_eod(p_date, p_user_id) milik halaman
--      DailyInventory.jsx yang sekarang TIDAK disentuh.
--   5. Idempoten: aman dijalankan berulang kali.
--
-- Asumsi lingkungan: Supabase (schema `auth`, fungsi auth.uid(), role
-- `authenticated` / `service_role`, PostgreSQL 15+).
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. HELPER MIGRASI (dihapus di akhir script)
-- =============================================================================

-- Tipe kolom sebagai teks siap-pakai untuk DDL ('bigint', 'uuid', ...).
CREATE OR REPLACE FUNCTION public.bv2_col_type(p_table text, p_col text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format_type(a.atttypid, a.atttypmod)
  FROM pg_attribute a
  WHERE a.attrelid = to_regclass(format('public.%I', p_table))
    AND a.attname  = p_col
    AND a.attnum   > 0
    AND NOT a.attisdropped
$$;

CREATE OR REPLACE FUNCTION public.bv2_has_col(p_table text, p_col text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.bv2_col_type(p_table, p_col) IS NOT NULL
$$;

-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS, aman kalau tabelnya tidak ada.
CREATE OR REPLACE FUNCTION public.bv2_add_col(p_table text, p_col text, p_ddl text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass(format('public.%I', p_table)) IS NULL THEN
    RAISE NOTICE 'bv2: tabel % tidak ada -> kolom % dilewati', p_table, p_col;
    RETURN;
  END IF;
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I %s', p_table, p_col, p_ddl);
END $$;

-- FK opsional untuk kolom yang baru ditambahkan ke tabel V1. Gagal = NOTICE
-- (tidak menggagalkan migrasi) karena tabel V1 bisa punya data / tipe tak terduga.
CREATE OR REPLACE FUNCTION public.bv2_add_fk(
  p_table text, p_col text, p_ref_table text, p_on_delete text DEFAULT 'SET NULL')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_name text := left(p_table || '_' || p_col || '_fkey', 63);
BEGIN
  IF to_regclass(format('public.%I', p_table)) IS NULL
     OR to_regclass(format('public.%I', p_ref_table)) IS NULL
     OR NOT public.bv2_has_col(p_table, p_col) THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = v_name AND conrelid = to_regclass(format('public.%I', p_table))) THEN
    RETURN;
  END IF;
  EXECUTE format(
    'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE %s',
    p_table, v_name, p_col, p_ref_table, p_on_delete);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'bv2: FK %.% -> %.id dilewati (%)', p_table, p_col, p_ref_table, SQLERRM;
END $$;

-- Eksekusi DDL dengan token tipe yang diisi dari kondisi database sebenarnya:
--   @TENANT_T@  tipe tenants.id            @TENANT_COL@ definisi kolom tenant_id lengkap
--   @BRANCH_T@  tipe branches.id           @MATERIAL_T@ tipe materials.id
--   @PRICE@     ekspresi harga per-pack (new_price > 0 ? new_price : price, alias m)
CREATE OR REPLACE FUNCTION public.bv2_exec(p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_t  text := COALESCE(public.bv2_col_type('tenants','id'),
                        public.bv2_col_type('users','tenant_id'), 'uuid');
  v_b  text := COALESCE(public.bv2_col_type('branches','id'), 'uuid');
  v_m  text := public.bv2_col_type('materials','id');
  v_fk text := CASE WHEN to_regclass('public.tenants') IS NOT NULL
                    THEN ' REFERENCES public.tenants(id) ON DELETE CASCADE' ELSE '' END;
  v_px text := CASE WHEN public.bv2_has_col('materials','new_price')
                    THEN 'COALESCE(NULLIF(m.new_price,0), m.price)' ELSE 'm.price' END;
BEGIN
  EXECUTE replace(replace(replace(replace(replace(p_sql,
    '@TENANT_COL@', 'tenant_id ' || v_t || ' NOT NULL DEFAULT public.bv2_auth_tenant_id()' || v_fk),
    '@TENANT_T@',   v_t),
    '@BRANCH_T@',   v_b),
    '@MATERIAL_T@', v_m),
    '@PRICE@',      v_px);
END $$;

-- RLS standar untuk tabel V2 baru.
--   p_scope_expr       : ekspresi pembatas cabang untuk Staff (Owner/Admin bebas
--                        dalam tenant-nya). NULL = tidak dibatasi cabang.
--   p_admin_write_only : true = tulis hanya Owner/Admin (mis. tabel branches).
-- SuperAdmin: read-only lintas tenant. DELETE: hanya Owner/Admin.
CREATE OR REPLACE FUNCTION public.bv2_apply_rls(
  p_table text, p_scope_expr text DEFAULT NULL, p_admin_write_only boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_tenant text := 'tenant_id = (SELECT public.bv2_auth_tenant_id())';
  v_admin  text := '(SELECT public.bv2_is_admin())';
  v_branch text := CASE WHEN p_scope_expr IS NULL THEN 'true'
                        ELSE format('(%s OR (%s))', v_admin, p_scope_expr) END;
  v_write  text := CASE WHEN p_admin_write_only THEN v_admin ELSE v_branch END;
BEGIN
  IF NOT public.bv2_has_col(p_table, 'tenant_id') THEN
    RAISE EXCEPTION 'Tabel % sudah ada tetapi tidak punya kolom tenant_id (sisa percobaan migrasi lama?). Periksa / rename tabel tersebut lalu jalankan ulang.', p_table;
  END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS bv2_select ON public.%I', p_table);
  EXECUTE format('DROP POLICY IF EXISTS bv2_insert ON public.%I', p_table);
  EXECUTE format('DROP POLICY IF EXISTS bv2_update ON public.%I', p_table);
  EXECUTE format('DROP POLICY IF EXISTS bv2_delete ON public.%I', p_table);
  EXECUTE format('CREATE POLICY bv2_select ON public.%I FOR SELECT TO authenticated USING ((%s AND %s) OR (SELECT public.bv2_is_superadmin()))',
                 p_table, v_tenant, v_branch);
  EXECUTE format('CREATE POLICY bv2_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s AND %s)',
                 p_table, v_tenant, v_write);
  EXECUTE format('CREATE POLICY bv2_update ON public.%I FOR UPDATE TO authenticated USING (%s AND %s) WITH CHECK (%s AND %s)',
                 p_table, v_tenant, v_write, v_tenant, v_write);
  EXECUTE format('CREATE POLICY bv2_delete ON public.%I FOR DELETE TO authenticated USING (%s AND %s)',
                 p_table, v_tenant, v_admin);
END $$;

-- Cermin persis parsePackSize() di src/services/costUtils.js (single source of
-- truth ukuran pack). Mengembalikan 0 kalau tidak bisa diparse — sama seperti JS.
CREATE OR REPLACE FUNCTION public.bv2_parse_pack_size(p_full_pack text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  s text; rhs text; n text;
BEGIN
  IF p_full_pack IS NULL OR btrim(p_full_pack) = '' THEN RETURN 0; END IF;
  s := lower(btrim(p_full_pack));

  -- 1. Format terstruktur: "Carton = 24 pcs"
  IF position('=' IN s) > 0 THEN
    rhs := btrim(split_part(s, '=', 2));
    n := substring(rhs FROM '^(\d*\.?\d+)');
    IF n IS NOT NULL AND n::numeric > 0 THEN RETURN n::numeric; END IF;
  END IF;

  -- 2. Format bebas (urutan sama dengan JS)
  n := substring(s FROM '(\d+(?:\.\d+)?)\s*(?:gr|grm|gram)\y');
  IF n IS NOT NULL THEN RETURN n::numeric; END IF;
  n := substring(s FROM '(\d+(?:\.\d+)?)\s*ml\y');
  IF n IS NOT NULL THEN RETURN n::numeric; END IF;
  n := substring(s FROM '(\d+(?:\.\d+)?)\s*(?:l|ltr|liter|litre)\y');
  IF n IS NOT NULL THEN RETURN n::numeric * 1000; END IF;
  n := substring(s FROM '(\d+(?:\.\d+)?)\s*kg\y');
  IF n IS NOT NULL THEN RETURN n::numeric * 1000; END IF;
  n := substring(s FROM '(\d+(?:\.\d+)?)\s*(?:pcs|pck|pack|btl|dus|carton|karton|ctn|drigen|jerigen|can|kaleng)\y');
  IF n IS NOT NULL THEN RETURN n::numeric; END IF;
  RETURN 0;
END $$;

-- =============================================================================
-- 2. PREFLIGHT — pastikan ini memang database V1 Barventis
-- =============================================================================
DO $bv$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.users') IS NULL OR to_regclass('public.materials') IS NULL THEN
    RAISE EXCEPTION 'Preflight gagal: tabel users / materials (V1) tidak ditemukan. Jalankan schema induk (database/supabase_schema_complete.sql) terlebih dahulu.';
  END IF;

  FOR r IN SELECT * FROM (VALUES
      ('users','tenant_id'), ('users','role'),
      ('materials','tenant_id'), ('materials','price'), ('materials','full_pack')
    ) AS v(t, c)
  LOOP
    IF NOT public.bv2_has_col(r.t, r.c) THEN
      RAISE EXCEPTION 'Preflight gagal: kolom %.% tidak ditemukan — struktur V1 tidak sesuai dugaan.', r.t, r.c;
    END IF;
  END LOOP;

  RAISE NOTICE 'bv2 preflight: materials.id=%  tenants.id=%  users.tenant_id=%  branches.id=%',
    public.bv2_col_type('materials','id'),
    COALESCE(public.bv2_col_type('tenants','id'), '(tabel tenants tidak ada)'),
    public.bv2_col_type('users','tenant_id'),
    COALESCE(public.bv2_col_type('branches','id'), '(akan dibuat)');
END $bv$;

-- =============================================================================
-- 3. ENUM
-- =============================================================================
DO $$ BEGIN
  CREATE TYPE public.condition_status_enum AS ENUM ('Baik', 'Rusak Ringan', 'Rusak Berat');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.trimming_yield_enum AS ENUM ('GOOD', 'BAD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.transfer_status_enum AS ENUM ('DRAFT', 'DISPATCHED', 'RECEIVED', 'VARIANCE_FLAGGED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- 4. FUNGSI KONTEKS AUTH (dipakai RLS & default kolom tenant_id)
--    SECURITY DEFINER agar tidak terkena RLS tabel users (hindari rekursi).
-- =============================================================================
SELECT public.bv2_exec($ddl$
  CREATE OR REPLACE FUNCTION public.bv2_auth_tenant_id() RETURNS @TENANT_T@
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
    SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()
  $f$
$ddl$);

CREATE OR REPLACE FUNCTION public.bv2_auth_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.role::text FROM public.users u WHERE u.id = auth.uid()
$$;

-- Role di aplikasi: 'SuperAdmin' | 'Owner' | 'Admin' | 'Staff' (case-insensitive)
CREATE OR REPLACE FUNCTION public.bv2_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(lower(public.bv2_auth_role()) IN ('owner', 'admin'), false)
$$;

CREATE OR REPLACE FUNCTION public.bv2_is_superadmin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(lower(public.bv2_auth_role()) IN ('superadmin', 'super_admin'), false)
$$;

-- =============================================================================
-- 5. CABANG (QA #3 & #15)
--    V1 multi-cabang (plan_multi_cabang.txt) mungkin sudah membuat `branches`.
--    Ada  -> hanya ditambah kolom.   Belum -> dibuat lengkap + RLS.
-- =============================================================================
DO $bv$
BEGIN
  IF to_regclass('public.branches') IS NULL THEN
    PERFORM public.bv2_exec($ddl$
      CREATE TABLE public.branches (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        @TENANT_COL@,
        code       VARCHAR(20),
        name       VARCHAR(100) NOT NULL,
        address    TEXT,
        is_central BOOLEAN NOT NULL DEFAULT false,
        is_active  BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    $ddl$);
    PERFORM public.bv2_apply_rls('branches', NULL, true);
    RAISE NOTICE 'bv2: tabel branches dibuat baru (RLS aktif).';
  ELSE
    PERFORM public.bv2_add_col('branches', 'code',       'VARCHAR(20)');
    PERFORM public.bv2_add_col('branches', 'address',    'TEXT');
    PERFORM public.bv2_add_col('branches', 'is_central', 'BOOLEAN NOT NULL DEFAULT false');
    PERFORM public.bv2_add_col('branches', 'is_active',  'BOOLEAN NOT NULL DEFAULT true');
    RAISE NOTICE 'bv2: tabel branches sudah ada -> hanya ditambah kolom (RLS lama tidak diubah).';
  END IF;

  IF public.bv2_has_col('branches', 'tenant_id') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS branches_tenant_code_key
      ON public.branches (tenant_id, code) WHERE code IS NOT NULL;
  END IF;
END $bv$;

-- users.branch_id (dipakai api.js: select('tenant_id, branch_id'))
DO $bv$
BEGIN
  PERFORM public.bv2_add_col('users', 'branch_id', public.bv2_col_type('branches', 'id'));
  PERFORM public.bv2_add_fk('users', 'branch_id', 'branches', 'SET NULL');
END $bv$;

SELECT public.bv2_exec($ddl$
  CREATE OR REPLACE FUNCTION public.bv2_auth_branch_id() RETURNS @BRANCH_T@
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
    SELECT u.branch_id FROM public.users u WHERE u.id = auth.uid()
  $f$
$ddl$);

-- Fungsi konteks auth: hanya untuk user login (Supabase memberi EXECUTE ke anon
-- secara default, jadi anon dicabut eksplisit).
REVOKE ALL ON FUNCTION public.bv2_auth_tenant_id(), public.bv2_auth_role(),
  public.bv2_auth_branch_id(), public.bv2_is_admin(), public.bv2_is_superadmin()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bv2_auth_tenant_id(), public.bv2_auth_role(),
  public.bv2_auth_branch_id(), public.bv2_is_admin(), public.bv2_is_superadmin()
  TO authenticated, service_role;

-- =============================================================================
-- 6. LOKASI PENYIMPANAN per cabang (BAR_MAIN, KITCHEN, SERVICE, CENTRAL_STORAGE)
-- =============================================================================
SELECT public.bv2_exec($ddl$
  CREATE TABLE IF NOT EXISTS public.storage_locations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    @TENANT_COL@,
    branch_id  @BRANCH_T@ NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    code       VARCHAR(20) NOT NULL,
    name       VARCHAR(100) NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT storage_locations_branch_code_key UNIQUE (branch_id, code)
  )
$ddl$);
SELECT public.bv2_apply_rls('storage_locations', 'branch_id = (SELECT public.bv2_auth_branch_id())');

-- =============================================================================
-- 7. MASTER MATERIALS & RESEP — hanya tambah kolom (master level tenant)
--    price/full_pack/unit V1 tetap sumber kebenaran; pack_factor & HPP per satuan
--    dasar TIDAK disimpan (bisa selisih dengan costUtils.js) melainkan lewat view.
-- =============================================================================
DO $bv$
BEGIN
  PERFORM public.bv2_add_col('materials', 'item_code',     'VARCHAR(50)');
  PERFORM public.bv2_add_col('materials', 'min_stock',     'NUMERIC(12,2) NOT NULL DEFAULT 0');
  PERFORM public.bv2_add_col('materials', 'par_stock',     'NUMERIC(12,2) NOT NULL DEFAULT 0');
  PERFORM public.bv2_add_col('materials', 'is_preparable', 'BOOLEAN NOT NULL DEFAULT false');

  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS materials_tenant_item_code_key
      ON public.materials (tenant_id, item_code) WHERE item_code IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'bv2: unique index materials.item_code dilewati (%)', SQLERRM;
  END;

  -- QA #7: threshold food cost 27% per menu.
  PERFORM public.bv2_add_col('recipes', 'target_cost_percent', 'NUMERIC(5,2) NOT NULL DEFAULT 27.0');
END $bv$;

-- HPP per satuan dasar (pengganti cost_per_base_unit GENERATED di script lama).
DO $bv$
BEGIN
  PERFORM public.bv2_exec($ddl$
    CREATE OR REPLACE VIEW public.v_materials_costing WITH (security_invoker = true) AS
    SELECT m.id, m.tenant_id, m.name, m.unit, m.full_pack,
           m.price                                   AS price_per_pack,
           public.bv2_parse_pack_size(m.full_pack)   AS pack_factor,
           (@PRICE@ / NULLIF(public.bv2_parse_pack_size(m.full_pack), 0)) AS cost_per_base_unit
    FROM public.materials m
  $ddl$);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'bv2: view v_materials_costing dilewati (%)', SQLERRM;
END $bv$;

-- Peringatan menu yang food cost-nya melewati target.
DO $bv$
BEGIN
  CREATE OR REPLACE VIEW public.v_recipe_cost_alerts WITH (security_invoker = true) AS
  SELECT r.id, r.tenant_id, r.menu_name, r.category, r.selling_price, r.basic_cost,
         r.target_cost_percent,
         round(r.basic_cost / NULLIF(r.selling_price, 0) * 100, 2) AS cost_percent,
         (r.basic_cost / NULLIF(r.selling_price, 0) * 100) > r.target_cost_percent AS over_target
  FROM public.recipes r;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'bv2: view v_recipe_cost_alerts dilewati (%)', SQLERRM;
END $bv$;

-- =============================================================================
-- 8. STOK HARIAN PER LOKASI + EOD LOCK (QA #4)
--    Tabel baru `daily_stock_counts` (V1 `daily_inventories` / `daily_inventory`
--    dibiarkan utuh).
--    usage = (opening + in) - (closing + waste)  -> sama dengan rumus di
--    DailyInventory.jsx. (Script lama MENAMBAH waste sehingga usage terlalu besar.)
-- =============================================================================
SELECT public.bv2_exec($ddl$
  CREATE TABLE IF NOT EXISTS public.daily_stock_counts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    @TENANT_COL@,
    branch_id       @BRANCH_T@ NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    location_id     UUID NOT NULL REFERENCES public.storage_locations(id) ON DELETE RESTRICT,
    material_id     @MATERIAL_T@ NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
    date            DATE NOT NULL,
    opening_stock   NUMERIC(12,2) NOT NULL DEFAULT 0,
    in_qty          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (in_qty >= 0),
    out_qty         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (out_qty >= 0),
    full_units      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (full_units >= 0),
    broken_fraction NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (broken_fraction >= 0),
    waste_qty       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (waste_qty >= 0),
    closing_stock   NUMERIC(12,2) GENERATED ALWAYS AS (full_units + broken_fraction) STORED,
    usage_qty       NUMERIC(12,2) GENERATED ALWAYS AS
                      ((opening_stock + in_qty) - (full_units + broken_fraction + waste_qty)) STORED,
    is_eod_locked   BOOLEAN NOT NULL DEFAULT false,
    eod_submitted_at TIMESTAMPTZ,
    submitted_by    UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT daily_stock_counts_loc_mat_date_key UNIQUE (location_id, material_id, date)
  )
$ddl$);
CREATE INDEX IF NOT EXISTS daily_stock_counts_branch_date_idx ON public.daily_stock_counts (branch_id, date);
CREATE INDEX IF NOT EXISTS daily_stock_counts_material_idx    ON public.daily_stock_counts (material_id);
SELECT public.bv2_apply_rls('daily_stock_counts', 'branch_id = (SELECT public.bv2_auth_branch_id())');

-- Hari yang sudah di-EOD tidak boleh diubah / dihapus (kecuali dibuka Owner/Admin
-- lewat reopen_daily_stock_eod).
CREATE OR REPLACE FUNCTION public.bv2_guard_eod_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_eod_locked
     AND COALESCE(current_setting('bv2.allow_unlock', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'Stok tanggal % sudah di-EOD dan terkunci. Minta Owner/Admin membuka kembali.', OLD.date
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bv2_eod_lock_guard ON public.daily_stock_counts;
CREATE TRIGGER bv2_eod_lock_guard
  BEFORE UPDATE OR DELETE ON public.daily_stock_counts
  FOR EACH ROW EXECUTE FUNCTION public.bv2_guard_eod_lock();

SELECT public.bv2_exec($ddl$
  CREATE OR REPLACE FUNCTION public.close_daily_stock_eod(
    p_branch_id @BRANCH_T@, p_date DATE, p_user_id UUID DEFAULT NULL)
  RETURNS jsonb LANGUAGE plpgsql AS $f$
  DECLARE
    v_uid     UUID := COALESCE(auth.uid(), p_user_id);
    v_locked  INT;
    v_carried INT;
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.daily_stock_counts
                   WHERE branch_id = p_branch_id AND date = p_date) THEN
      RETURN jsonb_build_object('success', false, 'error', 'NO_DATA',
                                'message', 'Tidak ada data stok pada tanggal tersebut');
    END IF;

    UPDATE public.daily_stock_counts
       SET is_eod_locked = true, eod_submitted_at = now(), submitted_by = v_uid
     WHERE branch_id = p_branch_id AND date = p_date AND NOT is_eod_locked;
    GET DIAGNOSTICS v_locked = ROW_COUNT;

    -- closing hari ini -> opening besok. Hari besok yang sudah terkunci tidak ditimpa.
    INSERT INTO public.daily_stock_counts (tenant_id, branch_id, location_id, material_id, date, opening_stock)
    SELECT tenant_id, branch_id, location_id, material_id, p_date + 1, closing_stock
      FROM public.daily_stock_counts
     WHERE branch_id = p_branch_id AND date = p_date
    ON CONFLICT (location_id, material_id, date) DO UPDATE
      SET opening_stock = EXCLUDED.opening_stock
      WHERE NOT public.daily_stock_counts.is_eod_locked;
    GET DIAGNOSTICS v_carried = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'records_locked', v_locked,
                              'records_carried_forward', v_carried);
  END $f$;

  CREATE OR REPLACE FUNCTION public.reopen_daily_stock_eod(p_branch_id @BRANCH_T@, p_date DATE)
  RETURNS jsonb LANGUAGE plpgsql AS $f$
  DECLARE v_n INT;
  BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.bv2_is_admin() THEN
      RAISE EXCEPTION 'Hanya Owner/Admin yang dapat membuka kembali EOD';
    END IF;
    PERFORM set_config('bv2.allow_unlock', 'on', true);
    UPDATE public.daily_stock_counts
       SET is_eod_locked = false, eod_submitted_at = NULL, submitted_by = NULL
     WHERE branch_id = p_branch_id AND date = p_date AND is_eod_locked;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM set_config('bv2.allow_unlock', 'off', true);
    RETURN jsonb_build_object('success', true, 'records_unlocked', v_n);
  END $f$;

  REVOKE ALL ON FUNCTION public.close_daily_stock_eod(@BRANCH_T@, DATE, UUID),
                         public.reopen_daily_stock_eod(@BRANCH_T@, DATE) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.close_daily_stock_eod(@BRANCH_T@, DATE, UUID),
                            public.reopen_daily_stock_eod(@BRANCH_T@, DATE)
    TO authenticated, service_role;
$ddl$);

-- =============================================================================
-- 9. TRIMMING 2 LANGKAH (QA #5) + WASTE TERPADU (QA #11)
-- =============================================================================
SELECT public.bv2_exec($ddl$
  CREATE TABLE IF NOT EXISTS public.production_trimming_batches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    @TENANT_COL@,
    branch_id           @BRANCH_T@ NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    material_id         @MATERIAL_T@ NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
    batch_number        VARCHAR(50) NOT NULL,
    -- Langkah 1: berat kotor (foto live-camera + watermark waktu/lokasi)
    gross_weight        NUMERIC(10,2) NOT NULL CHECK (gross_weight > 0),
    gross_photo_url     TEXT NOT NULL,
    gross_timestamp     TIMESTAMPTZ NOT NULL,
    gross_latitude      NUMERIC(10,7),
    gross_longitude     NUMERIC(10,7),
    -- Langkah 2: bersih & sisa
    clean_weight        NUMERIC(10,2) CHECK (clean_weight >= 0),
    waste_weight        NUMERIC(10,2) CHECK (waste_weight >= 0),
    clean_photo_url     TEXT,
    waste_photo_url     TEXT,
    clean_timestamp     TIMESTAMPTZ,
    shrinkage_percent   NUMERIC(5,2),
    yield_status        public.trimming_yield_enum,
    portion_pack_output INTEGER NOT NULL DEFAULT 0 CHECK (portion_pack_output >= 0),
    status              VARCHAR(30) NOT NULL DEFAULT 'STEP1_GROSS_COMPLETED'
                        CHECK (status IN ('STEP1_GROSS_COMPLETED', 'STEP2_COMPLETED')),
    created_by          UUID DEFAULT auth.uid(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ptb_tenant_batch_key UNIQUE (tenant_id, batch_number),
    CONSTRAINT ptb_step2_all_or_nothing CHECK (
      (clean_weight IS NULL AND waste_weight IS NULL AND clean_photo_url IS NULL
         AND waste_photo_url IS NULL AND clean_timestamp IS NULL)
      OR
      (clean_weight IS NOT NULL AND waste_weight IS NOT NULL AND clean_photo_url IS NOT NULL
         AND waste_photo_url IS NOT NULL AND clean_timestamp IS NOT NULL)),
    CONSTRAINT ptb_weights_le_gross CHECK (
      COALESCE(clean_weight, 0) <= gross_weight AND COALESCE(waste_weight, 0) <= gross_weight)
  )
$ddl$);
CREATE INDEX IF NOT EXISTS ptb_tenant_created_idx ON public.production_trimming_batches (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ptb_material_idx       ON public.production_trimming_batches (material_id);
SELECT public.bv2_apply_rls('production_trimming_batches', 'branch_id = (SELECT public.bv2_auth_branch_id())');

SELECT public.bv2_exec($ddl$
  CREATE TABLE IF NOT EXISTS public.waste_logs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    @TENANT_COL@,
    branch_id          @BRANCH_T@ NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    material_id        @MATERIAL_T@ NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
    quantity           NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
    cost_loss          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cost_loss >= 0),
    source_type        VARCHAR(20) NOT NULL
                       CHECK (source_type IN ('TRIMMING', 'MANUAL_BAR', 'EXPIRED', 'SPOILAGE')),
    reason             TEXT,
    photo_evidence_url TEXT,
    trimming_batch_id  UUID REFERENCES public.production_trimming_batches(id) ON DELETE RESTRICT,
    created_by         UUID DEFAULT auth.uid(),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT waste_logs_trimming_needs_batch
      CHECK (source_type <> 'TRIMMING' OR trimming_batch_id IS NOT NULL)
  )
$ddl$);
-- Satu batch trimming hanya boleh menghasilkan satu waste log otomatis.
CREATE UNIQUE INDEX IF NOT EXISTS waste_logs_one_per_trimming
  ON public.waste_logs (trimming_batch_id) WHERE source_type = 'TRIMMING';
CREATE INDEX IF NOT EXISTS waste_logs_tenant_created_idx ON public.waste_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS waste_logs_material_idx       ON public.waste_logs (material_id);
SELECT public.bv2_apply_rls('waste_logs', 'branch_id = (SELECT public.bv2_auth_branch_id())');

-- Step-guard: Langkah 1 tidak bisa diubah setelah tersimpan; batch yang sudah
-- selesai tidak bisa diubah; status & shrinkage dihitung server, bukan klien.
CREATE OR REPLACE FUNCTION public.bv2_trimming_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.material_id     IS DISTINCT FROM OLD.material_id
       OR NEW.branch_id    IS DISTINCT FROM OLD.branch_id
       OR NEW.batch_number IS DISTINCT FROM OLD.batch_number
       OR NEW.gross_weight    IS DISTINCT FROM OLD.gross_weight
       OR NEW.gross_photo_url IS DISTINCT FROM OLD.gross_photo_url
       OR NEW.gross_timestamp IS DISTINCT FROM OLD.gross_timestamp
       OR NEW.gross_latitude  IS DISTINCT FROM OLD.gross_latitude
       OR NEW.gross_longitude IS DISTINCT FROM OLD.gross_longitude THEN
      RAISE EXCEPTION 'Data Langkah 1 (berat kotor) batch % tidak dapat diubah', OLD.batch_number
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status = 'STEP2_COMPLETED' AND (
         NEW.clean_weight     IS DISTINCT FROM OLD.clean_weight
      OR NEW.waste_weight     IS DISTINCT FROM OLD.waste_weight
      OR NEW.clean_photo_url  IS DISTINCT FROM OLD.clean_photo_url
      OR NEW.waste_photo_url  IS DISTINCT FROM OLD.waste_photo_url
      OR NEW.clean_timestamp  IS DISTINCT FROM OLD.clean_timestamp) THEN
      RAISE EXCEPTION 'Batch % sudah selesai (Langkah 2) dan tidak dapat diubah', OLD.batch_number
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.clean_weight IS NOT NULL THEN
    NEW.status := 'STEP2_COMPLETED';
    NEW.shrinkage_percent := round((NEW.gross_weight - NEW.clean_weight) / NEW.gross_weight * 100, 2);
  ELSE
    NEW.status := 'STEP1_GROSS_COMPLETED';
    NEW.shrinkage_percent := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bv2_trimming_guard ON public.production_trimming_batches;
CREATE TRIGGER bv2_trimming_guard
  BEFORE INSERT OR UPDATE ON public.production_trimming_batches
  FOR EACH ROW EXECUTE FUNCTION public.bv2_trimming_guard();

-- Auto-log waste saat Langkah 2 selesai. Biaya = berat sisa x harga per satuan dasar
-- (harga per-pack / ukuran pack, aturan sama dengan costUtils.js).
SELECT public.bv2_exec($ddl$
  CREATE OR REPLACE FUNCTION public.bv2_trimming_autolog_waste() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
  BEGIN
    IF NEW.status = 'STEP2_COMPLETED' AND COALESCE(NEW.waste_weight, 0) > 0
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'STEP2_COMPLETED') THEN
      INSERT INTO public.waste_logs
        (tenant_id, branch_id, material_id, quantity, cost_loss, source_type,
         reason, photo_evidence_url, trimming_batch_id, created_by)
      SELECT NEW.tenant_id, NEW.branch_id, NEW.material_id, NEW.waste_weight,
             COALESCE(round(NEW.waste_weight * @PRICE@
                            / NULLIF(public.bv2_parse_pack_size(m.full_pack), 0), 2), 0),
             'TRIMMING', 'Auto-log trimming batch ' || NEW.batch_number,
             NEW.waste_photo_url, NEW.id, NEW.created_by
        FROM public.materials m
       WHERE m.id = NEW.material_id
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN NULL;
  END $f$
$ddl$);

DROP TRIGGER IF EXISTS bv2_trimming_autolog ON public.production_trimming_batches;
CREATE TRIGGER bv2_trimming_autolog
  AFTER INSERT OR UPDATE ON public.production_trimming_batches
  FOR EACH ROW EXECUTE FUNCTION public.bv2_trimming_autolog_waste();

-- =============================================================================
-- 10. MARKETLIST (QA #8) — tabel V1 sudah ada, hanya tambah kolom form Excel
-- =============================================================================
DO $bv$
BEGIN
  PERFORM public.bv2_add_col('market_lists', 'branch_id',   public.bv2_col_type('branches', 'id'));
  PERFORM public.bv2_add_col('market_lists', 'order_date',  'DATE');
  PERFORM public.bv2_add_col('market_lists', 'approved_by', 'UUID');
  PERFORM public.bv2_add_fk('market_lists', 'branch_id', 'branches', 'SET NULL');

  PERFORM public.bv2_add_col('market_list_items', 'unit',            'VARCHAR(20)');
  PERFORM public.bv2_add_col('market_list_items', 'current_stock',   'NUMERIC(10,2)');
  PERFORM public.bv2_add_col('market_list_items', 'min_stock',       'NUMERIC(10,2)');
  PERFORM public.bv2_add_col('market_list_items', 'par_stock',       'NUMERIC(10,2)');
  PERFORM public.bv2_add_col('market_list_items', 'request_qty',     'NUMERIC(10,2)');
  PERFORM public.bv2_add_col('market_list_items', 'approved_qty',    'NUMERIC(10,2)');
  PERFORM public.bv2_add_col('market_list_items', 'estimated_price', 'NUMERIC(12,2)');
  PERFORM public.bv2_add_col('market_list_items', 'is_urgent',       'BOOLEAN NOT NULL DEFAULT false');
  PERFORM public.bv2_add_col('market_list_items', 'remarks',         'TEXT');
END $bv$;

-- =============================================================================
-- 11. ASET & PERALATAN (QA #12)
-- =============================================================================
SELECT public.bv2_exec($ddl$
  CREATE TABLE IF NOT EXISTS public.assets (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    @TENANT_COL@,
    branch_id          @BRANCH_T@ NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    asset_code         VARCHAR(50) NOT NULL,
    asset_name         VARCHAR(150) NOT NULL,
    brand_model        VARCHAR(100),
    location_id        UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL,
    quantity           INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    condition          public.condition_status_enum NOT NULL DEFAULT 'Baik',
    acquisition_date   DATE,
    acquisition_value  NUMERIC(14,2) CHECK (acquisition_value >= 0),
    pic_name           VARCHAR(100),
    last_serviced_at   DATE,
    next_servicing_due DATE,
    notes              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT assets_tenant_code_key UNIQUE (tenant_id, asset_code)
  )
$ddl$);
CREATE INDEX IF NOT EXISTS assets_tenant_branch_idx ON public.assets (tenant_id, branch_id);
SELECT public.bv2_apply_rls('assets', 'branch_id = (SELECT public.bv2_auth_branch_id())');

-- =============================================================================
-- 12. TRANSFER ANTAR CABANG (QA #15)
--     Alur: DRAFT -> DISPATCHED -> RECEIVED | VARIANCE_FLAGGED.
--     Transisi & status akhir dihitung oleh trigger; klien cukup
--     UPDATE ... SET status = 'DISPATCHED' / 'RECEIVED'.
-- =============================================================================
SELECT public.bv2_exec($ddl$
  CREATE TABLE IF NOT EXISTS public.inter_branch_transfers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    @TENANT_COL@,
    transfer_number VARCHAR(50) NOT NULL,
    from_branch_id  @BRANCH_T@ NOT NULL REFERENCES public.branches(id),
    to_branch_id    @BRANCH_T@ NOT NULL REFERENCES public.branches(id),
    status          public.transfer_status_enum NOT NULL DEFAULT 'DRAFT',
    dispatched_at   TIMESTAMPTZ,
    received_at     TIMESTAMPTZ,
    dispatcher_id   UUID,
    receiver_id     UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ibt_tenant_number_key UNIQUE (tenant_id, transfer_number),
    CONSTRAINT ibt_different_branches CHECK (from_branch_id <> to_branch_id)
  )
$ddl$);

SELECT public.bv2_exec($ddl$
  CREATE TABLE IF NOT EXISTS public.inter_branch_transfer_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    @TENANT_COL@,
    transfer_id    UUID NOT NULL REFERENCES public.inter_branch_transfers(id) ON DELETE CASCADE,
    material_id    @MATERIAL_T@ NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
    qty_dispatched NUMERIC(12,2) NOT NULL CHECK (qty_dispatched > 0),
    qty_received   NUMERIC(12,2) CHECK (qty_received >= 0),
    -- NULL sampai barang diterima (script lama menampilkan -qty_dispatched)
    variance       NUMERIC(12,2) GENERATED ALWAYS AS
                     (CASE WHEN qty_received IS NULL THEN NULL ELSE qty_received - qty_dispatched END) STORED,
    remarks        TEXT,
    CONSTRAINT ibti_transfer_material_key UNIQUE (transfer_id, material_id)
  )
$ddl$);
CREATE INDEX IF NOT EXISTS ibt_tenant_status_idx ON public.inter_branch_transfers (tenant_id, status);
CREATE INDEX IF NOT EXISTS ibti_material_idx     ON public.inter_branch_transfer_items (material_id);

SELECT public.bv2_apply_rls('inter_branch_transfers',
  'from_branch_id = (SELECT public.bv2_auth_branch_id()) OR to_branch_id = (SELECT public.bv2_auth_branch_id())');
-- Item mengikuti visibilitas header (subquery ikut terkena RLS header).
SELECT public.bv2_apply_rls('inter_branch_transfer_items',
  'EXISTS (SELECT 1 FROM public.inter_branch_transfers t WHERE t.id = transfer_id)');

CREATE OR REPLACE FUNCTION public.bv2_transfer_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_privileged BOOLEAN := (v_uid IS NULL) OR public.bv2_is_admin();
  v_my_branch  TEXT;
  v_open       INT;
  v_var        BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Transfer baru harus berstatus DRAFT';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'DRAFT' AND (NEW.from_branch_id IS DISTINCT FROM OLD.from_branch_id
                                  OR NEW.to_branch_id IS DISTINCT FROM OLD.to_branch_id
                                  OR NEW.transfer_number IS DISTINCT FROM OLD.transfer_number) THEN
      RAISE EXCEPTION 'Cabang / nomor transfer tidak dapat diubah setelah DISPATCHED';
    END IF;
    RETURN NEW;
  END IF;

  v_my_branch := public.bv2_auth_branch_id()::text;

  IF OLD.status = 'DRAFT' AND NEW.status = 'DISPATCHED' THEN
    IF NOT v_privileged AND NEW.from_branch_id::text IS DISTINCT FROM v_my_branch THEN
      RAISE EXCEPTION 'Hanya cabang pengirim yang dapat melakukan dispatch';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.inter_branch_transfer_items WHERE transfer_id = OLD.id) THEN
      RAISE EXCEPTION 'Transfer tanpa item tidak dapat di-dispatch';
    END IF;
    NEW.dispatched_at := now();
    NEW.dispatcher_id := COALESCE(v_uid, NEW.dispatcher_id);

  ELSIF OLD.status = 'DISPATCHED' AND NEW.status IN ('RECEIVED', 'VARIANCE_FLAGGED') THEN
    IF NOT v_privileged AND NEW.to_branch_id::text IS DISTINCT FROM v_my_branch THEN
      RAISE EXCEPTION 'Hanya cabang penerima yang dapat mengonfirmasi penerimaan';
    END IF;
    SELECT count(*) INTO v_open FROM public.inter_branch_transfer_items
     WHERE transfer_id = OLD.id AND qty_received IS NULL;
    IF v_open > 0 THEN
      RAISE EXCEPTION '% item belum diisi qty_received', v_open;
    END IF;
    SELECT EXISTS (SELECT 1 FROM public.inter_branch_transfer_items
                    WHERE transfer_id = OLD.id AND variance <> 0) INTO v_var;
    NEW.status      := CASE WHEN v_var THEN 'VARIANCE_FLAGGED' ELSE 'RECEIVED' END;
    NEW.received_at := now();
    NEW.receiver_id := COALESCE(v_uid, NEW.receiver_id);

  ELSE
    RAISE EXCEPTION 'Transisi status % -> % tidak valid', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bv2_transfer_guard ON public.inter_branch_transfers;
CREATE TRIGGER bv2_transfer_guard
  BEFORE INSERT OR UPDATE ON public.inter_branch_transfers
  FOR EACH ROW EXECUTE FUNCTION public.bv2_transfer_guard();

CREATE OR REPLACE FUNCTION public.bv2_transfer_items_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_tid    UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.transfer_id ELSE NEW.transfer_id END;
  v_status public.transfer_status_enum;
BEGIN
  SELECT status INTO v_status FROM public.inter_branch_transfers WHERE id = v_tid;
  IF v_status IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;   -- header sedang dihapus (cascade)
    RAISE EXCEPTION 'Transfer % tidak ditemukan / tidak dapat diakses', v_tid;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Item hanya dapat ditambah saat transfer berstatus DRAFT';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF v_status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Item hanya dapat dihapus saat transfer berstatus DRAFT';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF NEW.transfer_id IS DISTINCT FROM OLD.transfer_id
     OR NEW.material_id IS DISTINCT FROM OLD.material_id THEN
    RAISE EXCEPTION 'transfer_id / material_id item tidak dapat diubah';
  END IF;
  IF NEW.qty_dispatched IS DISTINCT FROM OLD.qty_dispatched AND v_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'qty_dispatched hanya dapat diubah saat DRAFT';
  END IF;
  IF NEW.qty_received IS DISTINCT FROM OLD.qty_received AND v_status <> 'DISPATCHED' THEN
    RAISE EXCEPTION 'qty_received hanya dapat diisi saat transfer berstatus DISPATCHED';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bv2_transfer_items_guard ON public.inter_branch_transfer_items;
CREATE TRIGGER bv2_transfer_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.inter_branch_transfer_items
  FOR EACH ROW EXECUTE FUNCTION public.bv2_transfer_items_guard();

-- =============================================================================
-- 13. AUDIT LOG BERSIH (QA #14) — tabel V1 dipakai, ditambah kolom + view
-- =============================================================================
DO $bv$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL THEN
    PERFORM public.bv2_exec($ddl$
      CREATE TABLE public.audit_logs (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        @TENANT_COL@,
        user_id     UUID,
        action      VARCHAR(100) NOT NULL,
        description TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    $ddl$);
    PERFORM public.bv2_apply_rls('audit_logs');
  END IF;

  PERFORM public.bv2_add_col('audit_logs', 'actor_name',    'VARCHAR(100)');
  PERFORM public.bv2_add_col('audit_logs', 'target_entity', 'VARCHAR(50)');
  PERFORM public.bv2_add_col('audit_logs', 'target_id',     'TEXT');     -- TEXT: netral thd bigint/uuid
  PERFORM public.bv2_add_col('audit_logs', 'details',       'JSONB');
  PERFORM public.bv2_add_col('audit_logs', 'is_system',     'BOOLEAN NOT NULL DEFAULT false');

  BEGIN
    CREATE OR REPLACE VIEW public.v_audit_logs_human WITH (security_invoker = true) AS
    SELECT * FROM public.audit_logs
     WHERE NOT is_system AND user_id IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'bv2: view v_audit_logs_human dilewati (%)', SQLERRM;
  END;
END $bv$;

-- =============================================================================
-- 14. BERSIH-BERSIH HELPER MIGRASI & RELOAD SCHEMA CACHE POSTGREST (QA #4)
-- =============================================================================
DROP FUNCTION IF EXISTS public.bv2_exec(text);
DROP FUNCTION IF EXISTS public.bv2_apply_rls(text, text, boolean);
DROP FUNCTION IF EXISTS public.bv2_add_fk(text, text, text, text);
DROP FUNCTION IF EXISTS public.bv2_add_col(text, text, text);
DROP FUNCTION IF EXISTS public.bv2_has_col(text, text);
DROP FUNCTION IF EXISTS public.bv2_col_type(text, text);

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- CONTOH SEED (opsional, jalankan manual, ganti <TENANT_ID>):
--
--   INSERT INTO public.branches (tenant_id, code, name, is_central) VALUES
--     ('<TENANT_ID>', 'RESTO_BSD',  'Resto Bar BSD',            false),
--     ('<TENANT_ID>', 'CENTRAL_WH', 'Central Warehouse/Kitchen', true)
--   ON CONFLICT DO NOTHING;
--
--   INSERT INTO public.storage_locations (tenant_id, branch_id, code, name)
--   SELECT b.tenant_id, b.id, l.code, l.name
--     FROM public.branches b
--     JOIN (VALUES ('RESTO_BSD','BAR_MAIN','Bar Utama'), ('RESTO_BSD','KITCHEN','Dapur'),
--                  ('RESTO_BSD','SERVICE','Service'),    ('CENTRAL_WH','CENTRAL_STORAGE','Gudang Pusat'))
--          AS l(branch_code, code, name) ON l.branch_code = b.code
--   ON CONFLICT DO NOTHING;
-- =============================================================================