-- ====================================================================================================
-- FILE SQL FINAL TERKONSOLIDASI (1 FILE PENUH — SIAP PAKAI UNTUK DATABASE BARU / KOSONG)
-- Sistem CMS & Fieldwork — Automation Quotation PT Guci Emas Pratama (Production-Ready)
-- Target Database : Supabase PostgreSQL / PostgreSQL >= 15
-- Mencakup        : 00_baseline + 01_atomic_transactions + 02_fix_drift_and_rpc +
--                   03_tenant_hardening + 04_rls_policies + 05_quotation_automation_drf_apr +
--                   Auto-Provisioning Storage Bucket (`evidence-photos`) + Fungsi Retensi Otomatis +
--                   Seed Identitas Resmi PT Guci Emas Pratama + 5 AKUN DEMO SIAP LOGIN + DATA DEMO LENGKAP
-- Sifat Skrip     : 100% Idempoten (Aman dijalankan langsung di Supabase SQL Editor)
-- ====================================================================================================

BEGIN;

-- ====================================================================================================
-- BAGIAN 0: EKSTENSI & KOMPATIBILITAS SUPABASE AUTH (UNTUK POSTGRES STANDALONE / DEV)
-- ====================================================================================================
-- Di Supabase Cloud, schema `auth` dan fungsi `auth.uid()` sudah tersedia secara bawaan sehingga blok
-- di bawah ini otomatis dilewati (no-op). Pada PostgreSQL biasa (lokal/CI), blok ini membuat stub `auth`.
DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NULL THEN
    CREATE SCHEMA IF NOT EXISTS auth;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text,
      raw_user_meta_data jsonb DEFAULT '{}'::jsonb
    );
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
      SELECT coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      )::uuid
    $f$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ====================================================================================================
-- BAGIAN 1: PELACAKAN MIGRASI (schema_migrations)
-- ====================================================================================================
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.schema_migrations (name) VALUES
  ('00_baseline.sql'),
  ('01_atomic_transactions.sql'),
  ('02_fix_drift_and_rpc.sql'),
  ('03_tenant_hardening.sql'),
  ('04_rls_policies.sql'),
  ('05_quotation_automation_drf_apr.sql')
ON CONFLICT (name) DO NOTHING;

-- ====================================================================================================
-- BAGIAN 2: TIPE ENUMERASI (ENUM TYPES)
-- ====================================================================================================
-- Migrasi Tipe Enum `public.user_role` Tanpa `ALTER TYPE ... ADD VALUE`
-- Menghindari error PostgreSQL 55P04 ("unsafe use of new value MASTER_SUPER_ADMIN of enum type user_role")
-- saat dijalankan sekaligus dalam satu transaksi di Supabase SQL Editor.
DO $$
DECLARE
  r record;
  t text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type typ
    JOIN pg_namespace nsp ON nsp.oid = typ.typnamespace
    WHERE nsp.nspname = 'public' AND typ.typname = 'user_role'
  ) THEN
    CREATE TYPE public.user_role AS ENUM (
      'MASTER_SUPER_ADMIN',
      'SUPERADMIN',
      'ADMIN',
      'MARKETING',
      'INVENTORY',
      'TEKNISI_LAPANGAN'
    );
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type typ ON typ.oid = e.enumtypid
    JOIN pg_namespace nsp ON nsp.oid = typ.typnamespace
    WHERE nsp.nspname = 'public'
      AND typ.typname = 'user_role'
      AND e.enumlabel = 'MASTER_SUPER_ADMIN'
  ) THEN
    FOREACH t IN ARRAY ARRAY[
      'companies','users','quotations','spk','inventory_items','inventory_logs','company_settings',
      'nomor_surat_logs','order_tracking','performa_targets','customer_checklists','invites',
      'projects','work_reports','treatment_records','documentation_photos','risk_events','risk_config','audit_logs','user_locations'
    ] LOOP
      IF to_regclass('public.' || t) IS NOT NULL THEN
        FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
          EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
        END LOOP;
      END IF;
    END LOOP;

    DROP FUNCTION IF EXISTS public.register_guci_emas_user(text, text, public.user_role, text, text);
    DROP FUNCTION IF EXISTS public.upsert_demo_account_guci_emas(uuid, text, text, text, public.user_role, text, text);
    DROP TYPE IF EXISTS public.user_role_v2;

    CREATE TYPE public.user_role_v2 AS ENUM (
      'MASTER_SUPER_ADMIN',
      'SUPERADMIN',
      'ADMIN',
      'MARKETING',
      'INVENTORY',
      'TEKNISI_LAPANGAN'
    );

    IF to_regclass('public.users') IS NOT NULL THEN
      ALTER TABLE public.users ALTER COLUMN role DROP DEFAULT;
      ALTER TABLE public.users
        ALTER COLUMN role TYPE public.user_role_v2
        USING (role::text::public.user_role_v2);
    END IF;

    IF to_regclass('public.audit_logs') IS NOT NULL THEN
      ALTER TABLE public.audit_logs ALTER COLUMN user_role DROP DEFAULT;
      ALTER TABLE public.audit_logs
        ALTER COLUMN user_role TYPE public.user_role_v2
        USING (user_role::text::public.user_role_v2);
    END IF;

    DROP TYPE public.user_role CASCADE;
    ALTER TYPE public.user_role_v2 RENAME TO user_role;
  END IF;
END $$;

DO $$ BEGIN
  CREATE TYPE public.company_status AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.work_report_status AS ENUM ('DRAFT', 'READY', 'WORKING', 'COMPLETED', 'FLAGGED', 'REVIEWED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.risk_level AS ENUM ('NORMAL', 'LOW_RISK', 'REVIEW', 'HIGH_RISK', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.photo_type AS ENUM ('CHECK_IN', 'PROGRESS', 'CHECK_OUT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.service_type AS ENUM (
    'GENERAL_PEST_CONTROL',
    'TERMITE_CONTROL',
    'FUMIGATION',
    'RODENT_CONTROL',
    'MOSQUITO_CONTROL',
    'BIRD_CONTROL',
    'BED_BUG_CONTROL',
    'DISINFECTION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.application_method AS ENUM (
    'SPRAYING',
    'BAITING',
    'DRILLING',
    'TRENCHING',
    'FOGGING',
    'MISTING',
    'DUSTING',
    'GEL_INJECTION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.contract_type AS ENUM ('ONE_TIME', 'RECURRING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ====================================================================================================
-- BAGIAN 3: TABEL UTAMA (MERGED FINAL SCHEMA)
-- ====================================================================================================

-- 3.1. Tabel Perusahaan (Multi-Tenant)
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name varchar NOT NULL,
  company_slug varchar NOT NULL UNIQUE,
  status public.company_status NOT NULL DEFAULT 'TRIAL',
  subscription_plan varchar NOT NULL DEFAULT 'BASIC',
  max_technicians int4 NOT NULL DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS max_technicians int4 NOT NULL DEFAULT 20;

-- 3.2. Tabel Pengguna (Surveyor/Marketing = 'MARKETING', Admin = 'ADMIN', Teknisi = 'TEKNISI_LAPANGAN')
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id),
  name varchar NOT NULL,
  email varchar NOT NULL UNIQUE,
  nip varchar UNIQUE,
  password_hash text NOT NULL DEFAULT 'managed-by-supabase-auth',
  role public.user_role NOT NULL,
  phone varchar,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.3. Tabel Pelacakan Lokasi GPS Teknisi/User
CREATE TABLE IF NOT EXISTS public.user_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  latitude float8 NOT NULL,
  longitude float8 NOT NULL,
  accuracy float8 NOT NULL,
  tracked_at timestamptz NOT NULL DEFAULT now()
);

-- 3.4. Tabel Proyek / Lokasi Pekerjaan Lapangan
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  project_name varchar NOT NULL,
  client_name varchar NOT NULL DEFAULT '',
  address text NOT NULL,
  latitude float8 NOT NULL,
  longitude float8 NOT NULL,
  radius int4 NOT NULL DEFAULT 100,
  work_date date NOT NULL,
  work_type varchar NOT NULL DEFAULT '',
  service_type public.service_type NOT NULL DEFAULT 'GENERAL_PEST_CONTROL',
  focus_target varchar,
  target_focus jsonb NOT NULL DEFAULT '[]'::jsonb,
  building_area_sqm numeric,
  contract_type public.contract_type NOT NULL DEFAULT 'ONE_TIME',
  warranty_months int4 NOT NULL DEFAULT 0,
  next_service_date date,
  scheduled_start_time time NOT NULL DEFAULT '08:00',
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  contract_value numeric NOT NULL DEFAULT 0,
  quotation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz
);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS contract_value numeric NOT NULL DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS quotation_id uuid;

-- 3.5. Tabel Laporan Kerja Lapangan (Work Reports)
CREATE TABLE IF NOT EXISTS public.work_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  executor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status public.work_report_status NOT NULL DEFAULT 'READY',
  check_in_at timestamptz,
  check_in_latitude float8,
  check_in_longitude float8,
  check_in_accuracy float8,
  check_in_distance float8,
  check_in_valid bool,
  check_out_at timestamptz,
  check_out_latitude float8,
  check_out_longitude float8,
  check_out_accuracy float8,
  check_out_distance float8,
  check_out_valid bool,
  duration_seconds int4,
  risk_score int4 NOT NULL DEFAULT 0,
  risk_level public.risk_level NOT NULL DEFAULT 'NORMAL',
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamptz,
  review_notes text,
  customer_name varchar,
  customer_phone varchar,
  customer_feedback text,
  customer_signature text,
  technician_signature text,
  technician_signed_at timestamptz,
  notes text,
  team_members jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.work_reports ADD COLUMN IF NOT EXISTS team_members jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.work_reports ADD COLUMN IF NOT EXISTS technician_signature text;
ALTER TABLE public.work_reports ADD COLUMN IF NOT EXISTS technician_signed_at timestamptz;

-- 3.6. Tabel Catatan Penggunaan Chemical & Metode Treatment
CREATE TABLE IF NOT EXISTS public.treatment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_report_id uuid NOT NULL UNIQUE REFERENCES public.work_reports(id) ON DELETE CASCADE,
  application_method public.application_method NOT NULL,
  chemical_name varchar NOT NULL,
  active_ingredient varchar,
  dosage varchar NOT NULL,
  treatment_area_sqm numeric,
  drilling_points_count int4,
  fumigant_type varchar,
  gas_concentration_ppm numeric,
  sealing_started_at timestamptz,
  aeration_completed_at timestamptz,
  safety_notes text,
  technician_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.7. Tabel Dokumentasi Foto Lapangan (Termasuk Kolom Retensi `purged_at`)
CREATE TABLE IF NOT EXISTS public.documentation_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_report_id uuid NOT NULL REFERENCES public.work_reports(id) ON DELETE CASCADE,
  photo_type public.photo_type NOT NULL,
  photo_tag varchar,
  storage_path text NOT NULL,
  thumbnail_path text,
  latitude float8 NOT NULL,
  longitude float8 NOT NULL,
  accuracy float8 NOT NULL,
  distance_to_project float8 NOT NULL,
  is_within_radius bool NOT NULL,
  captured_at timestamptz NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  purged_at timestamptz
);
ALTER TABLE public.documentation_photos ADD COLUMN IF NOT EXISTS purged_at timestamptz;

-- 3.8. Tabel Risk Events (Kepatuhan & Fraud Detection Lapangan)
CREATE TABLE IF NOT EXISTS public.risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_report_id uuid NOT NULL REFERENCES public.work_reports(id) ON DELETE CASCADE,
  event_type varchar NOT NULL,
  points int4 NOT NULL,
  severity varchar NOT NULL,
  title varchar NOT NULL,
  description text NOT NULL,
  expected_value varchar,
  actual_value varchar,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.9. Tabel Audit Logs (Termasuk `company_id` untuk Isolasi Tenant)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  user_name varchar NOT NULL,
  user_role public.user_role NOT NULL,
  action varchar NOT NULL,
  entity_type varchar NOT NULL,
  entity_id text,
  details text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

-- 3.10. Tabel Inventaris & Log Mutasi Stok
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  nama varchar NOT NULL,
  kategori varchar NOT NULL,
  satuan varchar NOT NULL,
  stok numeric NOT NULL DEFAULT 0,
  min_alert numeric NOT NULL DEFAULT 0,
  harga_satuan numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS harga_satuan numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.inventory_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  tanggal date NOT NULL DEFAULT current_date,
  qty_masuk numeric NOT NULL DEFAULT 0,
  qty_keluar numeric NOT NULL DEFAULT 0,
  sisa_stok numeric NOT NULL DEFAULT 0,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  proyek varchar,
  tipe_catatan varchar NOT NULL DEFAULT 'REALISASI',
  biaya_total numeric NOT NULL DEFAULT 0,
  keterangan text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS tipe_catatan varchar NOT NULL DEFAULT 'REALISASI';
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS biaya_total numeric NOT NULL DEFAULT 0;

-- 3.11. Tabel Quotations (Automation Quotation Engine: GP-DRF -> Nomor Resmi, AR & PCO, Garansi Bulan/Tahun)
CREATE TABLE IF NOT EXISTS public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  marketing_uid uuid REFERENCES public.users(id),
  status varchar NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 3.12. Tabel SPK (Surat Perintah Kerja Teknisi)
CREATE TABLE IF NOT EXISTS public.spk (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  technician_id uuid REFERENCES public.users(id),
  status varchar NOT NULL DEFAULT 'DRAFT',
  schedule_date timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 3.13. Tabel Konfigurasi Risiko Default Global
CREATE TABLE IF NOT EXISTS public.risk_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  late_checkin_threshold_minutes integer NOT NULL DEFAULT 15,
  late_checkin_points integer NOT NULL DEFAULT 10,
  outside_radius_points integer NOT NULL DEFAULT 30,
  short_duration_critical_minutes integer NOT NULL DEFAULT 30,
  short_duration_critical_points integer NOT NULL DEFAULT 20,
  short_duration_warning_minutes integer NOT NULL DEFAULT 60,
  short_duration_warning_points integer NOT NULL DEFAULT 10,
  min_total_photos integer NOT NULL DEFAULT 3,
  min_total_photos_points integer NOT NULL DEFAULT 10,
  require_progress_photo boolean NOT NULL DEFAULT true,
  no_progress_photo_points integer NOT NULL DEFAULT 15,
  location_drift_threshold_meters integer NOT NULL DEFAULT 300,
  location_drift_points integer NOT NULL DEFAULT 15,
  missing_treatment_record_points integer NOT NULL DEFAULT 20,
  fumigation_missing_aeration_points integer NOT NULL DEFAULT 40,
  review_threshold integer NOT NULL DEFAULT 40,
  high_risk_threshold integer NOT NULL DEFAULT 60,
  critical_threshold integer NOT NULL DEFAULT 80,
  low_risk_threshold integer NOT NULL DEFAULT 20,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.14. Tabel Pengaturan Perusahaan (Identitas Kop, Prefix Nomor Surat, Template Dokumen)
CREATE TABLE IF NOT EXISTS public.company_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
DO $$ BEGIN
  ALTER TABLE public.company_settings ADD CONSTRAINT chk_company_settings_size CHECK (pg_column_size(settings) < 3145728);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3.15. Tabel Register & Log Nomor Surat (Mendukung Dual-Stage `DRF` & `APR` + Jejak `draftNoSurat`)
CREATE TABLE IF NOT EXISTS public.nomor_surat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "noSurat" text NOT NULL,
  stage text NOT NULL DEFAULT 'DRF',
  "draftNoSurat" text,
  kategori text,
  tipe text,
  "tipeLabel" text,
  kepada text,
  "byUid" uuid,
  "byName" text,
  dibuat timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'draft',
  "quoId" uuid,
  "companyId" uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  "isManual" boolean NOT NULL DEFAULT false,
  "keteranganManual" text NOT NULL DEFAULT ''
);
ALTER TABLE public.nomor_surat_logs ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'DRF';
ALTER TABLE public.nomor_surat_logs ADD COLUMN IF NOT EXISTS "draftNoSurat" text;

-- 3.16. Tabel Pendukung CRM & Operasional (Order Tracking, Performa Target, Checklist Rayap, Invites)
CREATE TABLE IF NOT EXISTS public.order_tracking (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.performa_targets (
  id text PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_checklists (
  id text PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invites (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ====================================================================================================
-- BAGIAN 4: INDEKS PERFORMA & KEUNIKAN
-- ====================================================================================================
CREATE INDEX IF NOT EXISTS idx_work_reports_status          ON public.work_reports(status);
CREATE INDEX IF NOT EXISTS idx_work_reports_executor        ON public.work_reports(executor_id);
CREATE INDEX IF NOT EXISTS idx_work_reports_company         ON public.work_reports(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_reports_checkin_at      ON public.work_reports(check_in_at);
CREATE INDEX IF NOT EXISTS idx_work_reports_risk_level      ON public.work_reports(risk_level);
CREATE INDEX IF NOT EXISTS idx_wr_executor_created          ON public.work_reports(executor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wr_status_created            ON public.work_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wr_risk_created              ON public.work_reports(risk_level, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_projects_company             ON public.projects(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_name_trgm           ON public.projects USING gin (project_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_photos_work_report           ON public.documentation_photos(work_report_id);
CREATE INDEX IF NOT EXISTS idx_photos_pending_purge         ON public.documentation_photos(captured_at) WHERE purged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_risk_events_work_report      ON public.risk_events(work_report_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at        ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created   ON public.audit_logs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_company                ON public.users(company_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_user_tracked  ON public.user_locations(user_id, tracked_at DESC);

CREATE INDEX IF NOT EXISTS idx_quotations_company           ON public.quotations(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spk_company                  ON public.spk(company_id, schedule_date DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_items_company      ON public.inventory_items(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_item_created  ON public.inventory_logs(item_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_nomor_surat_company_no ON public.nomor_surat_logs("companyId", "noSurat");
CREATE INDEX IF NOT EXISTS idx_order_tracking_company       ON public.order_tracking(company_id);
CREATE INDEX IF NOT EXISTS idx_performa_targets_company     ON public.performa_targets(company_id);
CREATE INDEX IF NOT EXISTS idx_customer_checklists_company  ON public.customer_checklists(company_id);
CREATE INDEX IF NOT EXISTS idx_invites_company              ON public.invites(company_id);

-- ====================================================================================================
-- BAGIAN 5: TRIGGER INTEGRITAS PROYEK & UPDATED_AT
-- ====================================================================================================
CREATE OR REPLACE FUNCTION public.fn_prevent_locked_project_edit() RETURNS trigger AS $$
BEGIN
  IF old.locked_at IS NOT NULL THEN
    IF new.project_name IS DISTINCT FROM old.project_name
      OR new.latitude IS DISTINCT FROM old.latitude
      OR new.longitude IS DISTINCT FROM old.longitude
      OR new.radius IS DISTINCT FROM old.radius
      OR new.work_date IS DISTINCT FROM old.work_date
    THEN
      RAISE EXCEPTION 'PROJECT_LOCKED: critical fields cannot change after check-in';
    END IF;
  END IF;
  new.updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_lock ON public.projects;
CREATE TRIGGER trg_project_lock
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_locked_project_edit();

CREATE OR REPLACE FUNCTION public.fn_touch_updated_at() RETURNS trigger AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_work_report_touch ON public.work_reports;
CREATE TRIGGER trg_work_report_touch
  BEFORE UPDATE ON public.work_reports
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_treatment_record_touch ON public.treatment_records;
CREATE TRIGGER trg_treatment_record_touch
  BEFORE UPDATE ON public.treatment_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- ====================================================================================================
-- BAGIAN 6: VIEW DAFTAR PENAWARAN RINGAN (`quotations_light`)
-- ====================================================================================================
CREATE OR REPLACE VIEW public.quotations_light WITH (security_invoker = true) AS
  SELECT
    id,
    company_id,
    marketing_uid,
    status,
    created_at,
    payload - 'pdfBase64' - 'signedPdfBase64' - 'surveyPhotos' AS payload,
    (payload ? 'pdfBase64') AS has_pdf,
    (payload ? 'signedPdfBase64') AS has_signed_pdf
  FROM public.quotations;

-- ====================================================================================================
-- BAGIAN 7: FUNGSI BANTU OTORISASI TENANT & ROLE (SECURITY DEFINER)
-- ====================================================================================================
CREATE OR REPLACE FUNCTION public.current_company_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.company_id FROM public.users u WHERE u.id = auth.uid() AND u.is_active
$$;

CREATE OR REPLACE FUNCTION public.current_app_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.role::text FROM public.users u WHERE u.id = auth.uid() AND u.is_active
$$;

CREATE OR REPLACE FUNCTION public.is_master_superadmin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT u.role::text = 'MASTER_SUPER_ADMIN' FROM public.users u WHERE u.id = auth.uid() AND u.is_active), false)
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT u.role::text = 'SUPERADMIN' FROM public.users u WHERE u.id = auth.uid() AND u.is_active), false)
$$;

CREATE OR REPLACE FUNCTION public.is_company_admin(p_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.is_active
      AND u.role::text IN ('SUPERADMIN', 'ADMIN')
      AND u.company_id = p_company
  )
$$;

CREATE OR REPLACE FUNCTION public.has_company_role(p_company uuid, VARIADIC p_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.is_active
      AND u.company_id = p_company
      AND (u.role::text = 'SUPERADMIN' OR u.role::text = ANY (p_roles))
  )
$$;

-- ====================================================================================================
-- BAGIAN 8: RPC TRANSAKSI ATOMIK & PENOMORAN 2 TAHAP (`GP-DRF` -> Nomor Resmi)
-- ====================================================================================================

-- 8.1. RPC Mutasi Stok Gudang Atomik
DROP FUNCTION IF EXISTS public.process_inventory_mutation(uuid, int, text, text, uuid);
DROP FUNCTION IF EXISTS public.process_inventory_mutation(uuid, numeric, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.process_inventory_mutation(
  p_item_id uuid,
  p_quantity numeric,
  p_type text,
  p_notes text DEFAULT NULL,
  p_pencatat_id uuid DEFAULT NULL,
  p_proyek text DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_tipe_catatan text DEFAULT 'REALISASI'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_current numeric;
  v_new numeric;
  v_harga numeric := 0;
  v_company uuid;
  v_log_id uuid;
  v_catatan text := upper(coalesce(nullif(btrim(p_tipe_catatan), ''), 'REALISASI'));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Belum login' USING ERRCODE = '28000'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than 0'; END IF;
  IF p_type NOT IN ('IN', 'OUT') THEN RAISE EXCEPTION 'Type must be IN or OUT'; END IF;

  SELECT stok, company_id, coalesce(harga_satuan, 0) INTO v_current, v_company, v_harga
  FROM public.inventory_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;

  IF NOT public.has_company_role(v_company, 'ADMIN', 'INVENTORY') THEN
    RAISE EXCEPTION 'Tidak berwenang mengubah stok perusahaan ini' USING ERRCODE = '42501';
  END IF;

  IF v_catatan = 'ESTIMASI' THEN
    -- Catatan estimasi gudang untuk ID Proyek tidak memotong stok fisik secara langsung sebelum realisasi
    v_new := v_current;
  ELSIF p_type = 'IN' THEN
    v_new := v_current + p_quantity;
    UPDATE public.inventory_items SET stok = v_new, updated_at = now() WHERE id = p_item_id;
  ELSE
    v_new := v_current - p_quantity;
    IF v_new < 0 THEN RAISE EXCEPTION 'Insufficient stock'; END IF;
    UPDATE public.inventory_items SET stok = v_new, updated_at = now() WHERE id = p_item_id;
  END IF;

  INSERT INTO public.inventory_logs (
    item_id, company_id, tanggal, qty_masuk, qty_keluar, sisa_stok,
    project_id, proyek, tipe_catatan, biaya_total, keterangan, created_at
  )
  VALUES (
    p_item_id, v_company, current_date,
    CASE WHEN p_type = 'IN'  THEN p_quantity ELSE 0 END,
    CASE WHEN p_type = 'OUT' THEN p_quantity ELSE 0 END,
    v_new, p_project_id, p_proyek, v_catatan, (p_quantity * v_harga), p_notes, now()
  )
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object('success', true, 'log_id', v_log_id, 'new_stock', v_new, 'biaya_total', (p_quantity * v_harga));
END $$;

-- 8.2. RPC Persetujuan / Review Laporan Kerja Lapangan
CREATE OR REPLACE FUNCTION public.process_status_approval(
  p_report_id uuid,
  p_status text,
  p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_new public.work_report_status;
  v_current public.work_report_status;
  v_company uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Belum login' USING ERRCODE = '28000'; END IF;
  BEGIN
    v_new := p_status::public.work_report_status;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Status tidak valid: %', p_status;
  END;

  SELECT status, company_id INTO v_current, v_company FROM public.work_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Laporan tidak ditemukan'; END IF;
  IF NOT public.is_company_admin(v_company) THEN
    RAISE EXCEPTION 'Tidak berwenang meninjau laporan perusahaan ini' USING ERRCODE = '42501';
  END IF;
  IF v_new <> 'REVIEWED' OR v_current NOT IN ('COMPLETED', 'FLAGGED') THEN
    RAISE EXCEPTION 'Transisi status % -> % tidak diizinkan', v_current, v_new;
  END IF;

  UPDATE public.work_reports
     SET status = v_new, review_notes = p_notes, reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
   WHERE id = p_report_id;

  RETURN jsonb_build_object('success', true, 'status', v_new);
END $$;

-- 8.3. RPC Patch Penawaran Atomik (Digunakan saat Re-Save Revisi Draft GP-DRF, Negosiasi Garansi, & Approve GP-APR)
CREATE OR REPLACE FUNCTION public.quotation_patch(
  p_id uuid,
  p_status text DEFAULT NULL,
  p_patch jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.quotations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Penawaran tidak ditemukan'; END IF;
  IF NOT public.has_company_role(v_company, 'ADMIN', 'MARKETING') THEN
    RAISE EXCEPTION 'Tidak berwenang mengubah penawaran ini' USING ERRCODE = '42501';
  END IF;

  UPDATE public.quotations
     SET status  = coalesce(p_status, status),
         payload = payload || coalesce(p_patch, '{}'::jsonb)
                   || CASE WHEN p_status IS NOT NULL THEN jsonb_build_object('status', p_status) ELSE '{}'::jsonb END
   WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'status', coalesce(p_status, (SELECT status FROM public.quotations WHERE id = p_id)));
END $$;

-- 8.4. RPC Simpan Pengaturan Perusahaan & Template Dokumen Atomik
CREATE OR REPLACE FUNCTION public.company_settings_patch(p_company uuid, p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_clean jsonb := coalesce(p_patch, '{}'::jsonb) - 'riskConfig';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Belum login' USING ERRCODE = '28000'; END IF;
  IF jsonb_typeof(v_clean) <> 'object' THEN RAISE EXCEPTION 'Patch harus berupa objek JSON'; END IF;
  IF NOT public.is_company_admin(p_company) THEN
    RAISE EXCEPTION 'Hanya admin perusahaan yang dapat mengubah pengaturan & template' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.company_settings (company_id, settings, updated_by, updated_at)
  VALUES (p_company, v_clean, auth.uid(), now())
  ON CONFLICT (company_id) DO UPDATE
    SET settings = public.company_settings.settings || v_clean,
        updated_by = auth.uid(),
        updated_at = now();

  RETURN (SELECT settings FROM public.company_settings WHERE company_id = p_company);
END $$;

-- 8.5. RPC Penomoran Surat Atomik 2 Tahap (`GP-DRF` -> Nomor Resmi) & Kategori (`AR` vs `PCO`)
DROP FUNCTION IF EXISTS public.generate_nomor_surat(text, text, text, text, text, boolean, text);
DROP FUNCTION IF EXISTS public.generate_nomor_surat(text, text, text, text, text, boolean, text, text);

CREATE OR REPLACE FUNCTION public.generate_nomor_surat(
  p_kategori text,
  p_tipe text,
  p_tipe_label text DEFAULT NULL,
  p_kepada text DEFAULT NULL,
  p_by_name text DEFAULT NULL,
  p_dry_run boolean DEFAULT false,
  p_tz text DEFAULT 'Asia/Jakarta',
  p_stage text DEFAULT 'DRF'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_prefix text;
  v_stage text := upper(coalesce(nullif(btrim(p_stage), ''), 'DRF'));
  v_year text;
  v_month text;
  v_stem text;
  v_next int;
  v_no text;
  v_by_name text;
  v_status text;
  v_row public.nomor_surat_logs;
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Tidak berwenang' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_role(v_company, 'ADMIN', 'MARKETING') THEN
    RAISE EXCEPTION 'Tidak berwenang membuat nomor surat' USING ERRCODE = '42501';
  END IF;
  IF v_stage = 'APR' AND NOT public.is_company_admin(v_company) THEN
    RAISE EXCEPTION 'Hanya Admin yang berwenang menerbitkan nomor surat Approved (APR)' USING ERRCODE = '42501';
  END IF;
  IF v_stage NOT IN ('DRF', 'APR', 'LEGACY') THEN
    RAISE EXCEPTION 'Stage nomor surat tidak valid (gunakan DRF atau APR)';
  END IF;
  IF p_kategori !~ '^[A-Z0-9]{1,10}$' OR p_tipe !~ '^[A-Z0-9]{1,10}$' THEN
    RAISE EXCEPTION 'Kategori/tipe nomor surat tidak valid';
  END IF;

  SELECT name INTO v_by_name FROM public.users WHERE id = auth.uid();

  SELECT nullif(btrim(settings ->> 'nomorPrefix'), '') INTO v_prefix
  FROM public.company_settings WHERE company_id = v_company;

  IF v_prefix IS NULL THEN
    SELECT left(string_agg(left(w, 1), ''), 4) INTO v_prefix
    FROM regexp_split_to_table(upper((SELECT company_name FROM public.companies WHERE id = v_company)), '\s+') w
    WHERE w <> '' AND w !~ '^(PT|CV|UD|PD|TBK)\.?$';
  END IF;
  v_prefix := upper(coalesce(nullif(v_prefix, ''), 'GP'));

  v_year  := to_char(now() AT TIME ZONE p_tz, 'YYYY');
  v_month := to_char(now() AT TIME ZONE p_tz, 'MM');

  IF v_stage = 'DRF' THEN
    -- Saat masih Draft memakai kode -DRF (contoh: GP-DRF/AR/PH/2026/10/0001)
    v_stem := v_prefix || '-DRF/' || p_kategori || '/' || p_tipe || '/' || v_year || '/' || v_month || '/';
  ELSE
    -- Saat Approved (APR), kode DRF hilang tanpa tambahan APR (contoh: GP/AR/PH/2026/10/0001)
    v_stem := v_prefix || '/' || p_kategori || '/' || p_tipe || '/' || v_year || '/' || v_month || '/';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_company::text || '|' || v_stem, 0));

  SELECT coalesce(max((regexp_replace("noSurat", '^.*/', ''))::int), 0) + 1 INTO v_next
  FROM public.nomor_surat_logs
  WHERE "companyId" = v_company
    AND starts_with("noSurat", v_stem)
    AND regexp_replace("noSurat", '^.*/', '') ~ '^\d+$';

  v_no := v_stem || lpad(v_next::text, 4, '0');
  v_status := CASE WHEN v_stage = 'APR' THEN 'approved' ELSE 'pending' END;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'id', 'preview',
      'noSurat', v_no,
      'stage', v_stage,
      'kategori', p_kategori,
      'tipe', p_tipe,
      'tipeLabel', p_tipe_label,
      'kepada', p_kepada,
      'byUid', auth.uid(),
      'byName', v_by_name,
      'dibuat', now(),
      'status', v_status,
      'quoId', NULL,
      'companyId', v_company,
      'isManual', false,
      'keteranganManual', ''
    );
  END IF;

  INSERT INTO public.nomor_surat_logs (
    "noSurat", stage, kategori, tipe, "tipeLabel", kepada,
    "byUid", "byName", dibuat, status, "quoId", "companyId", "isManual", "keteranganManual"
  )
  VALUES (
    v_no, v_stage, p_kategori, p_tipe, p_tipe_label, p_kepada,
    auth.uid(), v_by_name, now(), v_status, NULL, v_company, false, ''
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END $$;

-- 8.6. RPC Undangan Pengguna (Token Validation & Accept Invite)
CREATE OR REPLACE FUNCTION public.get_invite_public(p_token text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'token', i.id,
    'companyId', i.company_id,
    'companyName', i.payload ->> 'companyName',
    'role', i.payload ->> 'role',
    'expiresAt', i.payload ->> 'expiresAt'
  )
  FROM public.invites i
  WHERE i.id = p_token
    AND coalesce((i.payload ->> 'used')::boolean, false) = false
    AND (i.payload ->> 'expiresAt')::timestamptz > now()
$$;

CREATE OR REPLACE FUNCTION public.accept_invite(p_token text, p_name text, p_phone text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_inv public.invites;
  v_uid uuid := auth.uid();
  v_email text;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Belum login' USING ERRCODE = '28000'; END IF;
  IF coalesce(btrim(p_name), '') = '' THEN RAISE EXCEPTION 'Nama wajib diisi'; END IF;

  SELECT * INTO v_inv FROM public.invites WHERE id = p_token FOR UPDATE;
  IF NOT FOUND
     OR coalesce((v_inv.payload ->> 'used')::boolean, false)
     OR (v_inv.payload ->> 'expiresAt')::timestamptz <= now() THEN
    RAISE EXCEPTION 'Undangan tidak valid, sudah dipakai, atau kedaluwarsa';
  END IF;

  v_role := v_inv.payload ->> 'role';
  IF v_role NOT IN ('SUPERADMIN', 'ADMIN', 'MARKETING', 'INVENTORY', 'TEKNISI_LAPANGAN') THEN
    RAISE EXCEPTION 'Role undangan tidak diizinkan';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  INSERT INTO public.users (id, company_id, name, email, password_hash, role, phone, is_active)
  VALUES (v_uid, v_inv.company_id, btrim(p_name), lower(btrim(v_email)), 'managed-by-supabase-auth', v_role::public.user_role, nullif(btrim(p_phone), ''), true)
  ON CONFLICT (id) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        name       = EXCLUDED.name,
        role       = EXCLUDED.role,
        phone      = coalesce(EXCLUDED.phone, public.users.phone),
        is_active  = true,
        updated_at = now();

  UPDATE public.invites SET payload = payload || jsonb_build_object('used', true, 'usedBy', v_uid) WHERE id = p_token;
  RETURN jsonb_build_object('companyId', v_inv.company_id, 'role', v_role);
END $$;

-- 8.7. Hak Eksekusi RPC
REVOKE EXECUTE ON FUNCTION public.process_inventory_mutation(uuid, numeric, text, text, uuid, text, uuid, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.process_status_approval(uuid, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.quotation_patch(uuid, text, jsonb) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.generate_nomor_surat(text, text, text, text, text, boolean, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.accept_invite(text, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.company_settings_patch(uuid, jsonb) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.process_inventory_mutation(uuid, numeric, text, text, uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_status_approval(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quotation_patch(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_nomor_surat(text, text, text, text, text, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_settings_patch(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invite_public(text) TO anon, authenticated;

-- ====================================================================================================
-- BAGIAN 9: ROW-LEVEL SECURITY (RLS) POLICIES & HAK KOLOM
-- ====================================================================================================
DO $$
DECLARE
  r record;
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies','users','quotations','spk','inventory_items','inventory_logs','company_settings',
    'nomor_surat_logs','order_tracking','performa_targets','customer_checklists','invites',
    'projects','work_reports','treatment_records','documentation_photos','risk_events','risk_config','audit_logs','user_locations'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
        EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, t);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- 9.1. companies (MASTER_SUPER_ADMIN mengelola seluruh perusahaan tenant; user biasa hanya melihat perusahaannya sendiri)
CREATE POLICY companies_select ON public.companies FOR SELECT TO authenticated
  USING (id = public.current_company_id() OR public.is_master_superadmin());
CREATE POLICY companies_write ON public.companies FOR ALL TO authenticated
  USING (public.is_master_superadmin()) WITH CHECK (public.is_master_superadmin());

-- 9.2. users (MASTER_SUPER_ADMIN hanya melihat akun SUPERADMIN perusahaan terkait & dirinya sendiri)
CREATE POLICY users_select ON public.users FOR SELECT TO authenticated
  USING (id = auth.uid() OR company_id = public.current_company_id() OR (public.is_master_superadmin() AND role = 'SUPERADMIN'));
CREATE POLICY users_update_self ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

REVOKE ALL ON public.users FROM anon, authenticated;
GRANT SELECT (id, company_id, name, email, nip, role, phone, is_active, created_at, updated_at) ON public.users TO authenticated;
GRANT UPDATE (name, phone) ON public.users TO authenticated;

-- 9.3. quotations
CREATE POLICY quotations_select ON public.quotations FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY quotations_insert ON public.quotations FOR INSERT TO authenticated
  WITH CHECK (public.has_company_role(company_id, 'ADMIN', 'MARKETING'));
CREATE POLICY quotations_update ON public.quotations FOR UPDATE TO authenticated
  USING (public.has_company_role(company_id, 'ADMIN', 'MARKETING'))
  WITH CHECK (public.has_company_role(company_id, 'ADMIN', 'MARKETING'));
CREATE POLICY quotations_delete ON public.quotations FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id));

-- 9.4. spk
CREATE POLICY spk_select ON public.spk FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY spk_insert ON public.spk FOR INSERT TO authenticated
  WITH CHECK (public.has_company_role(company_id, 'ADMIN', 'MARKETING'));
CREATE POLICY spk_update ON public.spk FOR UPDATE TO authenticated
  USING (public.has_company_role(company_id, 'ADMIN', 'MARKETING')
         OR (technician_id = auth.uid() AND company_id = public.current_company_id()))
  WITH CHECK (public.has_company_role(company_id, 'ADMIN', 'MARKETING')
         OR (technician_id = auth.uid() AND company_id = public.current_company_id()));
CREATE POLICY spk_delete ON public.spk FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id));

-- 9.5. inventory_items & inventory_logs
CREATE POLICY inv_items_select ON public.inventory_items FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY inv_items_insert ON public.inventory_items FOR INSERT TO authenticated
  WITH CHECK (public.has_company_role(company_id, 'ADMIN', 'INVENTORY'));
CREATE POLICY inv_items_update ON public.inventory_items FOR UPDATE TO authenticated
  USING (public.has_company_role(company_id, 'ADMIN', 'INVENTORY'))
  WITH CHECK (public.has_company_role(company_id, 'ADMIN', 'INVENTORY'));
CREATE POLICY inv_items_delete ON public.inventory_items FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id));
CREATE POLICY inv_logs_select ON public.inventory_logs FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_superadmin());

-- 9.6. company_settings
CREATE POLICY company_settings_select ON public.company_settings FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY company_settings_delete ON public.company_settings FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- 9.7. nomor_surat_logs
CREATE POLICY nomor_select ON public.nomor_surat_logs FOR SELECT TO authenticated
  USING ("companyId" = public.current_company_id() OR public.is_superadmin());
CREATE POLICY nomor_insert ON public.nomor_surat_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_company_role("companyId", 'ADMIN', 'MARKETING'));
CREATE POLICY nomor_update ON public.nomor_surat_logs FOR UPDATE TO authenticated
  USING (public.has_company_role("companyId", 'ADMIN', 'MARKETING'))
  WITH CHECK (public.has_company_role("companyId", 'ADMIN', 'MARKETING'));
CREATE POLICY nomor_delete ON public.nomor_surat_logs FOR DELETE TO authenticated
  USING (public.is_company_admin("companyId"));

-- 9.8. order_tracking, performa_targets, customer_checklists, invites
CREATE POLICY tracking_select ON public.order_tracking FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY tracking_insert ON public.order_tracking FOR INSERT TO authenticated
  WITH CHECK (public.has_company_role(company_id, 'ADMIN', 'MARKETING', 'TEKNISI_LAPANGAN'));
CREATE POLICY tracking_update ON public.order_tracking FOR UPDATE TO authenticated
  USING (public.has_company_role(company_id, 'ADMIN', 'MARKETING', 'TEKNISI_LAPANGAN'))
  WITH CHECK (public.has_company_role(company_id, 'ADMIN', 'MARKETING', 'TEKNISI_LAPANGAN'));
CREATE POLICY tracking_delete ON public.order_tracking FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id));

CREATE POLICY performa_select ON public.performa_targets FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY performa_write ON public.performa_targets FOR ALL TO authenticated
  USING (public.has_company_role(company_id, 'ADMIN', 'MARKETING'))
  WITH CHECK (public.has_company_role(company_id, 'ADMIN', 'MARKETING'));

CREATE POLICY checklist_select ON public.customer_checklists FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY checklist_write ON public.customer_checklists FOR ALL TO authenticated
  USING (public.has_company_role(company_id, 'ADMIN', 'MARKETING'))
  WITH CHECK (public.has_company_role(company_id, 'ADMIN', 'MARKETING'));

CREATE POLICY invites_select ON public.invites FOR SELECT TO authenticated
  USING (public.is_master_superadmin() OR public.is_company_admin(company_id));
CREATE POLICY invites_insert ON public.invites FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_master_superadmin() AND (payload ->> 'role') = 'SUPERADMIN')
    OR (public.is_company_admin(company_id) AND (payload ->> 'role') IN ('ADMIN', 'MARKETING', 'INVENTORY', 'TEKNISI_LAPANGAN'))
  );
CREATE POLICY invites_update ON public.invites FOR UPDATE TO authenticated
  USING (public.is_master_superadmin() OR public.is_company_admin(company_id))
  WITH CHECK (public.is_master_superadmin() OR public.is_company_admin(company_id));
CREATE POLICY invites_delete ON public.invites FOR DELETE TO authenticated
  USING (public.is_master_superadmin() OR public.is_company_admin(company_id));

-- 9.9. RLS Policies untuk Modul Fieldwork & Admin (projects, work_reports, treatment_records, documentation_photos, risk_events, risk_config, audit_logs, user_locations)
-- Mendukung akses langsung via Supabase PostgREST (@supabase/supabase-js) tanpa bergantung pada koneksi TCP backend.
CREATE POLICY projects_select ON public.projects FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY projects_insert ON public.projects FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY projects_update ON public.projects FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() OR public.is_superadmin())
  WITH CHECK (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY projects_delete ON public.projects FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id));

CREATE POLICY work_reports_select ON public.work_reports FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY work_reports_insert ON public.work_reports FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY work_reports_update ON public.work_reports FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() OR public.is_superadmin())
  WITH CHECK (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY work_reports_delete ON public.work_reports FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id));

CREATE POLICY treatment_records_all ON public.treatment_records FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.work_reports wr
    WHERE wr.id = treatment_records.work_report_id
      AND (wr.company_id = public.current_company_id() OR public.is_superadmin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.work_reports wr
    WHERE wr.id = treatment_records.work_report_id
      AND (wr.company_id = public.current_company_id() OR public.is_superadmin())
  ));

CREATE POLICY documentation_photos_all ON public.documentation_photos FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.work_reports wr
    WHERE wr.id = documentation_photos.work_report_id
      AND (wr.company_id = public.current_company_id() OR public.is_superadmin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.work_reports wr
    WHERE wr.id = documentation_photos.work_report_id
      AND (wr.company_id = public.current_company_id() OR public.is_superadmin())
  ));

CREATE POLICY risk_events_all ON public.risk_events FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.work_reports wr
    WHERE wr.id = risk_events.work_report_id
      AND (wr.company_id = public.current_company_id() OR public.is_superadmin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.work_reports wr
    WHERE wr.id = risk_events.work_report_id
      AND (wr.company_id = public.current_company_id() OR public.is_superadmin())
  ));

CREATE POLICY risk_config_select ON public.risk_config FOR SELECT TO authenticated
  USING (true);
CREATE POLICY risk_config_write ON public.risk_config FOR ALL TO authenticated
  USING (public.current_app_role() IN ('MASTER_SUPER_ADMIN', 'SUPERADMIN', 'ADMIN'))
  WITH CHECK (public.current_app_role() IN ('MASTER_SUPER_ADMIN', 'SUPERADMIN', 'ADMIN'));

CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() OR public.is_superadmin());

CREATE POLICY user_locations_select ON public.user_locations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = user_locations.user_id
      AND (u.company_id = public.current_company_id() OR public.is_superadmin())
  ));
CREATE POLICY user_locations_insert ON public.user_locations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.current_app_role() IN ('MASTER_SUPER_ADMIN', 'SUPERADMIN', 'ADMIN'));

-- 9.10. RPC Manajemen Pengguna via Admin (Mendukung Buat, Aktif/Suspend, & Hapus User Langsung dari Frontend)
CREATE OR REPLACE FUNCTION public.admin_upsert_company_user(
  p_email text,
  p_password text,
  p_name text,
  p_role text,
  p_phone text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth, pg_temp AS $$
DECLARE
  v_co_id uuid := public.current_company_id();
  v_uid uuid := gen_random_uuid();
  v_role public.user_role;
BEGIN
  IF NOT public.is_company_admin(v_co_id) THEN
    RAISE EXCEPTION 'Hanya Admin yang dapat membuat akun pengguna' USING ERRCODE = '42501';
  END IF;
  v_role := upper(btrim(p_role))::public.user_role;
  PERFORM public.upsert_demo_account_guci_emas(v_uid, p_email, p_password, p_name, v_role, p_phone, NULL);
  RETURN (
    SELECT jsonb_build_object(
      'id', u.id, 'name', u.name, 'email', u.email,
      'role', u.role, 'phone', u.phone, 'is_active', u.is_active, 'created_at', u.created_at
    )
    FROM public.users u WHERE lower(u.email) = lower(btrim(p_email)) LIMIT 1
  );
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_user_active(p_user_id uuid, p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_co_id uuid;
  v_email text;
  v_target_role public.user_role;
BEGIN
  SELECT company_id, lower(email), role INTO v_co_id, v_email, v_target_role FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User tidak ditemukan'; END IF;
  IF v_email = 'lieziragroup@gmail.com' OR v_target_role = 'MASTER_SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Akun ini dilindungi dan tidak dapat dinonaktifkan' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_company_admin(v_co_id) OR (public.is_master_superadmin() AND v_target_role = 'SUPERADMIN')) THEN
    RAISE EXCEPTION 'Tidak berwenang mengubah status user ini' USING ERRCODE = '42501';
  END IF;
  UPDATE public.users SET is_active = p_active, updated_at = now() WHERE id = p_user_id;
  RETURN jsonb_build_object('id', p_user_id, 'is_active', p_active);
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_company_user(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_co_id uuid;
  v_email text;
  v_target_role public.user_role;
BEGIN
  SELECT company_id, lower(email), role INTO v_co_id, v_email, v_target_role FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User tidak ditemukan'; END IF;
  IF v_email = 'lieziragroup@gmail.com' OR v_target_role = 'MASTER_SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Akun ini dilindungi dan tidak dapat dihapus' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_company_admin(v_co_id) OR (public.is_master_superadmin() AND v_target_role = 'SUPERADMIN')) THEN
    RAISE EXCEPTION 'Tidak berwenang menghapus user ini' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.users WHERE id = p_user_id;
  RETURN jsonb_build_object('deleted', true, 'id', p_user_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_upsert_company_user(text, text, text, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_active(uuid, boolean) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_company_user(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_company_user(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_company_user(uuid) TO authenticated;

-- ====================================================================================================
-- BAGIAN 10: PENYEDERHANAAN ENV DI DATABASE (STORAGE BUCKET, FUNGSI RETENSI, & SEED PT GUCI EMAS PRATAMA)
-- ====================================================================================================

-- 10.1. Auto-Provisioning Supabase Storage Bucket (`evidence-photos`)
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'evidence-photos',
      'evidence-photos',
      false,
      8388608,
      ARRAY['image/jpeg', 'image/png', 'image/webp']
    )
    ON CONFLICT (id) DO UPDATE
      SET file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
EXCEPTION WHEN insufficient_privilege OR undefined_column THEN
  RAISE NOTICE 'Pembuatan otomatis storage.buckets dilewati.';
END $$;

-- 10.2. Fungsi Database Pembersihan Retensi Otomatis (`public.cleanup_old_telemetry`)
CREATE OR REPLACE FUNCTION public.cleanup_old_telemetry(
  p_location_days int DEFAULT 30,
  p_photo_months int DEFAULT 2
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_deleted_locations int := 0;
  v_marked_photos int := 0;
BEGIN
  WITH d AS (
    DELETE FROM public.user_locations
    WHERE tracked_at < now() - make_interval(days => p_location_days)
    RETURNING 1
  )
  SELECT count(*)::int INTO v_deleted_locations FROM d;

  WITH p AS (
    UPDATE public.documentation_photos
       SET purged_at = now()
     WHERE purged_at IS NULL
       AND captured_at < now() - make_interval(months => p_photo_months)
    RETURNING 1
  )
  SELECT count(*)::int INTO v_marked_photos FROM p;

  RETURN jsonb_build_object(
    'locations_deleted', v_deleted_locations,
    'photos_marked_purged', v_marked_photos,
    'executed_at', now()
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_telemetry(int, int) FROM public, anon, authenticated;

-- 10.3. Konfigurasi Risiko Default Global
INSERT INTO public.risk_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 10.4. Buat Entitas Tenant Utama: PT Guci Emas Pratama
INSERT INTO public.companies (id, company_name, company_slug, status, subscription_plan)
VALUES (
  '00000000-0000-4000-a000-000000000001'::uuid,
  'PT Guci Emas Pratama',
  'guci-emas-pratama',
  'ACTIVE',
  'PRO'
)
ON CONFLICT (company_slug) DO UPDATE
  SET company_name = EXCLUDED.company_name,
      status = 'ACTIVE',
      subscription_plan = 'PRO',
      updated_at = now();

-- 10.5. Pengaturan Kop Surat, Prefix Nomor (`GP`), Identitas Resmi, & System Config PT Guci Emas Pratama
INSERT INTO public.company_settings (company_id, settings, updated_at)
SELECT
  c.id,
  jsonb_build_object(
    'companyName', 'PT GUCI EMAS PRATAMA',
    'companyTagline', 'Termite Control • Pest Control • Rodent Control • Fumigation',
    'headOffice', 'Jln. Ganda Sasmita No.1 Serua, Ciputat - Tangerang Selatan 15414',
    'branchOffice', 'Pondok Trosobo Indah Blok I No.3, Sidoarjo - Jawa Timur. Telp : (031) 70235866',
    'telp', '(021) 74637054',
    'wa', '0817 0795 959',
    'email', 'info@gucimaspratama.co.id',
    'website', 'www.gucimaspratama.co.id',
    'nomorPrefix', 'GP',
    'kota', 'Tangerang Selatan',
    'ttdNama', 'H. Fakhrurrazi, S.E.',
    'ttdJabatan', 'Direktur Utama',
    'systemConfig', jsonb_build_object(
      'appTimezone', 'Asia/Jakarta',
      'storageBucket', 'evidence-photos',
      'maxPhotoSizeMb', 8,
      'offlineMaxAgeHours', 24,
      'photoRetentionMonths', 2,
      'locationRetentionDays', 30
    ),
    'template', jsonb_build_object(
      'primaryColor', '#1a5c38',
      'logoBase64', '',
      'logoWidthMm', 40,
      'logoHeightMm', 15,
      'logoPosition', 'right',
      'showTagline', true,
      'showBranch', true,
      'showPageNumber', true,
      'customTaglineText', 'Termite Control • Pest Control • Rodent Control • Fumigation'
    )
  ),
  now()
FROM public.companies c
WHERE c.company_slug = 'guci-emas-pratama'
ON CONFLICT (company_id) DO NOTHING;

-- 10.6. Katalog Awal Gudang Chemical & Material PT Guci Emas Pratama (Idempoten)
DO $$
DECLARE
  v_co_id uuid;
BEGIN
  SELECT id INTO v_co_id FROM public.companies WHERE company_slug = 'guci-emas-pratama';
  IF v_co_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE company_id = v_co_id) THEN
    INSERT INTO public.inventory_items (company_id, nama, kategori, satuan, stok, min_alert, harga_satuan) VALUES
      (v_co_id, 'Cypergard 100 EC (Cypermethrin)', 'Termitisida / Insektisida', 'Botol 500ml', 40, 10, 185000),
      (v_co_id, 'Safe 1 200 SL (Imidakloprid)', 'Termitisida Anti Rayap', 'Botol 500ml', 35, 10, 210000),
      (v_co_id, 'Demand CS (Lambda Cyhalothrin)', 'Insektisida Residual PCO', 'Liter', 20, 5, 650000),
      (v_co_id, 'Klerat Wax Block (Brodifacum)', 'Rodentisida Umpan Tikus', 'Kg', 50, 10, 145000),
      (v_co_id, 'Lem Tikus / Glue Trap Board', 'Peralatan Rodent Control', 'Pcs', 120, 30, 15000),
      (v_co_id, 'Pipa PVC AW Ø 1/2 Inch (Jalur Pipanisasi)', 'Material Pipanisasi Rayap', 'Batang (4m)', 80, 20, 42000);
  END IF;
END $$;

-- 10.7. Fungsi Helper & Trigger Auto-Bootstrap Pengguna Supabase Auth -> `public.users`
CREATE OR REPLACE FUNCTION public.register_guci_emas_user(
  p_email text,
  p_name text,
  p_role public.user_role DEFAULT 'ADMIN',
  p_phone text DEFAULT NULL,
  p_nip text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE
  v_auth_id uuid;
  v_co_id uuid;
  v_user_id uuid;
BEGIN
  SELECT id INTO v_co_id FROM public.companies WHERE company_slug = 'guci-emas-pratama' LIMIT 1;
  IF v_co_id IS NULL THEN
    RAISE EXCEPTION 'Perusahaan PT Guci Emas Pratama belum ada di tabel companies';
  END IF;

  SELECT id INTO v_auth_id FROM auth.users WHERE lower(email) = lower(btrim(p_email)) LIMIT 1;

  v_user_id := coalesce(
    v_auth_id,
    (SELECT id FROM public.users WHERE lower(email) = lower(btrim(p_email)) LIMIT 1),
    gen_random_uuid()
  );
  DELETE FROM public.users WHERE lower(email) = lower(btrim(p_email)) AND id <> v_user_id;

  INSERT INTO public.users (id, company_id, name, email, nip, password_hash, role, phone, is_active)
  VALUES (
    v_user_id,
    v_co_id,
    btrim(p_name),
    lower(btrim(p_email)),
    nullif(btrim(p_nip), ''),
    'managed-by-supabase-auth',
    p_role,
    nullif(btrim(p_phone), ''),
    true
  )
  ON CONFLICT (id) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        name       = EXCLUDED.name,
        email      = EXCLUDED.email,
        role       = EXCLUDED.role,
        phone      = coalesce(EXCLUDED.phone, public.users.phone),
        nip        = coalesce(EXCLUDED.nip, public.users.nip),
        is_active  = true,
        updated_at = now();

  RETURN jsonb_build_object(
    'user_id', v_user_id,
    'linked_to_supabase_auth', (v_auth_id IS NOT NULL),
    'email', lower(btrim(p_email)),
    'role', p_role,
    'company_id', v_co_id
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.register_guci_emas_user(text, text, public.user_role, text, text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_sync_auth_user_to_public_users()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_co_id uuid;
  v_is_first_user boolean;
  v_meta_role text;
  v_meta_name text;
  v_role public.user_role;
BEGIN
  SELECT id INTO v_co_id FROM public.companies WHERE company_slug = 'guci-emas-pratama' LIMIT 1;
  IF v_co_id IS NULL THEN
    RETURN new;
  END IF;

  IF EXISTS (SELECT 1 FROM public.users WHERE lower(email) = lower(new.email)) THEN
    UPDATE public.users
       SET id = new.id,
           updated_at = now()
     WHERE lower(email) = lower(new.email) AND id <> new.id;
    RETURN new;
  END IF;

  SELECT NOT EXISTS (SELECT 1 FROM public.users) INTO v_is_first_user;
  v_meta_role := upper(coalesce(new.raw_user_meta_data ->> 'role', ''));
  v_meta_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    initcap(split_part(coalesce(new.email, 'User'), '@', 1))
  );

  IF v_is_first_user THEN
    v_role := 'ADMIN';
  ELSIF v_meta_role IN ('MASTER_SUPER_ADMIN', 'SUPERADMIN', 'ADMIN', 'MARKETING', 'INVENTORY', 'TEKNISI_LAPANGAN') THEN
    v_role := v_meta_role::public.user_role;
  ELSE
    RETURN new;
  END IF;

  INSERT INTO public.users (id, company_id, name, email, password_hash, role, phone, is_active)
  VALUES (
    new.id,
    v_co_id,
    v_meta_name,
    lower(new.email),
    'managed-by-supabase-auth',
    v_role,
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''),
    true
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END $$;

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_sync_auth_user_guci_emas ON auth.users';
    EXECUTE 'CREATE TRIGGER trg_sync_auth_user_guci_emas AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.fn_sync_auth_user_to_public_users()';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Trigger pada auth.users dilewati (gunakan SELECT public.register_guci_emas_user(...) untuk mendaftarkan user).';
END $$;

-- ====================================================================================================
-- BAGIAN 11: SEED 5 AKUN DEMO SIAP LOGIN (`auth.users` + `auth.identities` + `public.users`)
--            DAN DATA DEMO OPERASIONAL PT GUCI EMAS PRATAMA (QUOTATION `GP-DRF`/`GP-APR`, SPK, PROYEK)
-- ====================================================================================================
-- Semua akun demo di bawah ini otomatis dibuat di Supabase Auth (`auth.users` & `auth.identities`)
-- sekaligus di `public.users` dengan password seragam:
--
--   Password Semua Akun Demo : GuciEmas123!
--
--   1. ADMIN (Approve GP-APR & Negosiasi) : admin@gucimaspratama.co.id
--   2. SURVEYOR / MARKETING (Input GP-DRF): surveyor@gucimaspratama.co.id
--   3. TEKNISI LAPANGAN (SPK & Check-In)  : teknisi@gucimaspratama.co.id
--   4. ADMIN GUDANG (Inventaris Chemical) : gudang@gucimaspratama.co.id
--   5. SUPERADMIN (Multi-Tenant Control)  : superadmin@gucimaspratama.co.id
-- ====================================================================================================

CREATE OR REPLACE FUNCTION public.upsert_demo_account_guci_emas(
  p_uid uuid,
  p_email text,
  p_password text,
  p_name text,
  p_role public.user_role,
  p_phone text,
  p_nip text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth, pg_temp AS $$
DECLARE
  v_co_id uuid;
  v_actual_uid uuid := p_uid;
  v_clean_email text := lower(btrim(p_email));
  v_has_full_auth boolean;
  v_has_provider_id boolean;
BEGIN
  IF p_role = 'MASTER_SUPER_ADMIN' OR v_clean_email = 'lieziragroup@gmail.com' THEN
    v_co_id := NULL;
  ELSE
    SELECT id INTO v_co_id FROM public.companies WHERE company_slug = 'guci-emas-pratama' LIMIT 1;
    IF v_co_id IS NULL THEN
      RAISE EXCEPTION 'Perusahaan PT Guci Emas Pratama belum ada';
    END IF;
  END IF;

  -- 1. Cek apakah email sudah ada di auth.users; jika belum, gunakan p_uid
  SELECT id INTO v_actual_uid FROM auth.users WHERE lower(email) = v_clean_email LIMIT 1;
  v_actual_uid := coalesce(v_actual_uid, p_uid);

  -- Bersihkan potensi duplikat email pada id berbeda di auth.users & public.users
  DELETE FROM public.users WHERE lower(email) = v_clean_email AND id <> v_actual_uid;
  DELETE FROM auth.users   WHERE lower(email) = v_clean_email AND id <> v_actual_uid;

  -- Deteksi apakah ini tabel `auth.users` penuh milik Supabase Cloud (memiliki kolom encrypted_password)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'encrypted_password'
  ) INTO v_has_full_auth;

  IF v_has_full_auth THEN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_actual_uid) THEN
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000'::uuid,
        v_actual_uid,
        'authenticated',
        'authenticated',
        v_clean_email,
        crypt(p_password, gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object(
          'sub', v_actual_uid::text,
          'email', v_clean_email,
          'name', p_name,
          'role', p_role::text,
          'phone', p_phone,
          'email_verified', true,
          'phone_verified', false
        ),
        now(),
        now(),
        '', '', '', ''
      );
    ELSE
      UPDATE auth.users
         SET email                  = v_clean_email,
             encrypted_password     = crypt(p_password, gen_salt('bf')),
             email_confirmed_at     = coalesce(email_confirmed_at, now()),
             raw_app_meta_data      = '{"provider":"email","providers":["email"]}'::jsonb,
             raw_user_meta_data     = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
               'sub', v_actual_uid::text,
               'email', v_clean_email,
               'name', p_name,
               'role', p_role::text,
               'email_verified', true
             ),
             confirmation_token     = coalesce(confirmation_token, ''),
             email_change           = coalesce(email_change, ''),
             email_change_token_new = coalesce(email_change_token_new, ''),
             recovery_token         = coalesce(recovery_token, ''),
             updated_at             = now()
       WHERE id = v_actual_uid;
    END IF;

    -- Pastikan kolom string GoTrue lainnya tidak NULL jika ada di versi Supabase tersebut
    BEGIN
      EXECUTE 'UPDATE auth.users SET email_change_token_current = coalesce(email_change_token_current, ''''), phone_change = coalesce(phone_change, ''''), phone_change_token = coalesce(phone_change_token, ''''), reauthentication_token = coalesce(reauthentication_token, '''') WHERE id = $1'
      USING v_actual_uid;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;

    -- Isi atau perbarui auth.identities apabila tabelnya tersedia di Supabase
    IF to_regclass('auth.identities') IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
      ) INTO v_has_provider_id;

      IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_actual_uid AND provider = 'email') THEN
        IF v_has_provider_id THEN
          INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
          VALUES (
            gen_random_uuid(),
            v_actual_uid,
            v_actual_uid::text,
            jsonb_build_object('sub', v_actual_uid::text, 'email', v_clean_email, 'email_verified', true, 'phone_verified', false),
            'email',
            now(), now(), now()
          );
        ELSE
          INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
          VALUES (
            v_actual_uid::text,
            v_actual_uid,
            jsonb_build_object('sub', v_actual_uid::text, 'email', v_clean_email, 'email_verified', true, 'phone_verified', false),
            'email',
            now(), now(), now()
          );
        END IF;
      ELSE
        UPDATE auth.identities
           SET identity_data = jsonb_build_object('sub', v_actual_uid::text, 'email', v_clean_email, 'email_verified', true, 'phone_verified', false),
               updated_at    = now()
         WHERE user_id = v_actual_uid AND provider = 'email';
      END IF;
    END IF;
  ELSE
    -- Lingkungan Postgres lokal / stub auth.users
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES (
      v_actual_uid,
      v_clean_email,
      jsonb_build_object('name', p_name, 'role', p_role::text)
    )
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          raw_user_meta_data = EXCLUDED.raw_user_meta_data;
  END IF;

  -- Bebaskan kemungkinan konflik NIP pada baris lain di public.users
  IF p_nip IS NOT NULL THEN
    UPDATE public.users
       SET nip = NULL
     WHERE nip = p_nip
       AND id <> v_actual_uid
       AND lower(email) <> v_clean_email;
  END IF;

  -- Upsert aman ke public.users (menangani baik konflik `id` maupun konflik `email` tanpa error 23505)
  IF EXISTS (SELECT 1 FROM public.users WHERE id = v_actual_uid) THEN
    UPDATE public.users
       SET company_id = v_co_id,
           name       = p_name,
           email      = v_clean_email,
           nip        = p_nip,
           role       = p_role,
           phone      = p_phone,
           is_active  = true,
           updated_at = now()
     WHERE id = v_actual_uid;
  ELSIF EXISTS (SELECT 1 FROM public.users WHERE lower(email) = v_clean_email) THEN
    UPDATE public.users
       SET id         = v_actual_uid,
           company_id = v_co_id,
           name       = p_name,
           nip        = p_nip,
           role       = p_role,
           phone      = p_phone,
           is_active  = true,
           updated_at = now()
     WHERE lower(email) = v_clean_email;
  ELSE
    INSERT INTO public.users (id, company_id, name, email, nip, password_hash, role, phone, is_active)
    VALUES (
      v_actual_uid,
      v_co_id,
      p_name,
      v_clean_email,
      p_nip,
      'managed-by-supabase-auth',
      p_role,
      p_phone,
      true
    );
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.upsert_demo_account_guci_emas(uuid, text, text, text, public.user_role, text, text) FROM public, anon, authenticated;

DROP FUNCTION IF EXISTS public.switch_my_role(text);

-- 11.0. AKUN MASTER SUPER ADMIN EKSKLUSIF PEMILIK SAAS: lieziragroup@gmail.com (Password: Rafi0502!)
SELECT public.upsert_demo_account_guci_emas(
  '00000000-0000-4000-b000-000000000000'::uuid,
  'lieziragroup@gmail.com',
  'Rafi0502!',
  'Rafi (Master Super Admin - FieldWork)',
  'MASTER_SUPER_ADMIN',
  '0817 0795 959',
  'FW-MSA-000'
);

-- 11.1. Eksekusi Pembuatan 5 Akun Peran Perusahaan PT Guci Emas Pratama (Password: GuciEmas123!)
-- 1) SUPERADMIN (Direktur Perusahaan)
SELECT public.upsert_demo_account_guci_emas(
  '00000000-0000-4000-b000-000000000005'::uuid,
  'direktur@gucimaspratama.co.id',
  'GuciEmas123!',
  'H. Fakhrurrazi, S.E. (Direktur / Superadmin)',
  'SUPERADMIN',
  '0817 0795 959',
  'GEP-DIR-001'
);

-- 2) ADMIN (Staf Admin Operasional Perusahaan)
SELECT public.upsert_demo_account_guci_emas(
  '00000000-0000-4000-b000-000000000001'::uuid,
  'admin@gucimaspratama.co.id',
  'GuciEmas123!',
  'Nadya Putri (Admin Operasional)',
  'ADMIN',
  '0817 0795 958',
  'GEP-ADM-001'
);

-- 3) MARKETING / SURVEYOR
SELECT public.upsert_demo_account_guci_emas(
  '00000000-0000-4000-b000-000000000002'::uuid,
  'surveyor@gucimaspratama.co.id',
  'GuciEmas123!',
  'Rizky Pratama (Surveyor / Marketing)',
  'MARKETING',
  '0812 8899 7766',
  'GEP-SRV-002'
);

-- 4) TEKNISI LAPANGAN
SELECT public.upsert_demo_account_guci_emas(
  '00000000-0000-4000-b000-000000000003'::uuid,
  'teknisi@gucimaspratama.co.id',
  'GuciEmas123!',
  'Budi Santoso (Teknisi Lapangan)',
  'TEKNISI_LAPANGAN',
  '0813 2000 3014',
  'GEP-TEK-003'
);

-- 5) INVENTORY (Gudang)
SELECT public.upsert_demo_account_guci_emas(
  '00000000-0000-4000-b000-000000000004'::uuid,
  'gudang@gucimaspratama.co.id',
  'GuciEmas123!',
  'Hendra Wijaya (Admin Gudang)',
  'INVENTORY',
  '0815 4000 5042',
  'GEP-INV-004'
);

-- Pastikan hanya lieziragroup@gmail.com yang memegang role MASTER_SUPER_ADMIN dan BERDIRI SENDIRI (company_id = NULL)
DELETE FROM public.users WHERE lower(email) = 'superadmin@gucimaspratama.co.id';
UPDATE public.users SET role = 'SUPERADMIN' WHERE role = 'MASTER_SUPER_ADMIN' AND lower(email) <> 'lieziragroup@gmail.com';
UPDATE public.users SET company_id = NULL WHERE role = 'MASTER_SUPER_ADMIN' OR lower(email) = 'lieziragroup@gmail.com';

-- Bersihkan keterlibatan akun Master Super Admin dari data penawaran/proyek perusahaan apabila pernah terpakai saat uji coba
UPDATE public.quotations
   SET marketing_uid = '00000000-0000-4000-b000-000000000002'::uuid,
       payload = payload || jsonb_build_object(
         'marketingUid', '00000000-0000-4000-b000-000000000002',
         'marketingNama', 'Rizky Pratama (Surveyor / Marketing)',
         'surveyor', 'Rizky Pratama (Surveyor / Marketing)'
       )
 WHERE marketing_uid = '00000000-0000-4000-b000-000000000000'::uuid
    OR (payload ->> 'marketingNama') ILIKE '%Master%'
    OR (payload ->> 'marketingNama') ILIKE '%Rafi%'
    OR (payload ->> 'surveyor') ILIKE '%Master%'
    OR (payload ->> 'surveyor') ILIKE '%Rafi%';

UPDATE public.work_reports
   SET executor_id = '00000000-0000-4000-b000-000000000003'::uuid
 WHERE executor_id = '00000000-0000-4000-b000-000000000000'::uuid;

-- 11.2. Seed Data Demo Quotation (`GP-DRF` & `GP-APR`), Proyek, SPK, & Laporan Kerja Lapangan
DO $$
DECLARE
  v_co_id uuid := '00000000-0000-4000-a000-000000000001'::uuid;
  v_admin_id uuid;
  v_surveyor_id uuid;
  v_teknisi_id uuid;
  v_q1_id uuid := '00000000-0000-4000-c000-000000000001'::uuid;
  v_q2_id uuid := '00000000-0000-4000-c000-000000000002'::uuid;
  v_q3_id uuid := '00000000-0000-4000-c000-000000000003'::uuid;
  v_proj1_id uuid := '00000000-0000-4000-d000-000000000001'::uuid;
  v_proj2_id uuid := '00000000-0000-4000-d000-000000000002'::uuid;
  v_wr1_id uuid := '00000000-0000-4000-e000-000000000001'::uuid;
  v_wr2_id uuid := '00000000-0000-4000-e000-000000000002'::uuid;
  v_spk1_id uuid := '00000000-0000-4000-f000-000000000001'::uuid;
BEGIN
  SELECT id INTO v_admin_id FROM public.users WHERE email = 'admin@gucimaspratama.co.id' LIMIT 1;
  SELECT id INTO v_surveyor_id FROM public.users WHERE email = 'surveyor@gucimaspratama.co.id' LIMIT 1;
  SELECT id INTO v_teknisi_id FROM public.users WHERE email = 'teknisi@gucimaspratama.co.id' LIMIT 1;

  -- (A) DEMO QUOTATION 1: Draft Anti Rayap Pasca-Konstruksi / Retreatment (Siap Dicoba Negosiasi Garansi & Approve!)
  --     Mengikuti contoh nyata PDF 0022 (Bank Victoria Cabang Fatmawati) dengan rumus volume & upah peralatan
  INSERT INTO public.quotations (id, company_id, marketing_uid, status, created_at, payload)
  VALUES (
    v_q1_id,
    v_co_id,
    v_surveyor_id,
    'pending',
    now() - interval '2 hours',
    jsonb_build_object(
      'id', v_q1_id::text,
      'noSurat', 'GP-DRF/AR/PH/2026/10/0001',
      'draftNoSurat', 'GP-DRF/AR/PH/2026/10/0001',
      'stage', 'DRF',
      'kategoriProyek', 'Korporat',
      'kategori', 'AR',
      'tipeKontrak', 'PH',
      'jenisLayanan', 'anti_rayap_injeksi',
      'pdfVariant', 'ar_pasca_standar_4p',
      'kondisiBangunan', 'pasca_konstruksi',
      'perihal', 'Penawaran Harga Anti Rayap (Retreatment)',
      'kepadaNama', 'PT Bank Victoria International Tbk',
      'kepadaAlamatLines', jsonb_build_array('Gedung Graha BIP Lt. 10', 'Jl. Jend. Gatot Subroto Kav. 23, Jakarta Selatan'),
      'kepadaUp', 'Bpk. Hendra Kusuma (Building Management)',
      'kepadaWa', '08119988776',
      'objekPekerjaan', 'bangunan gedung kantor Bank Victoria Cabang Fatmawati',
      'lokasiPekerjaan', 'Jl. RS. Fatmawati Raya No. 39, Cilandak, Jakarta Selatan',
      'tanggal', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'surveyor', 'Rizky Pratama (Surveyor / Marketing)',
      'tanggalSurvey', to_char(current_date - 1, 'YYYY-MM-DD'),
      'hasilSurvey', 'Ditemukan jalur kembara rayap tanah (Coptotermes curvignathus) pada area kusen arsip lantai 1 dan partisi ruang operasional.',
      'items', jsonb_build_array(
        jsonb_build_object('presetCode', 'ar_pondasi_1_sisi', 'desc', 'Pondasi 1 sisi', 'volumeFormula', '37+37+5,5+9+6+5', 'qty', 99.5, 'unit', 'm¹', 'harga', 19000),
        jsonb_build_object('presetCode', 'ar_pondasi_2_sisi', 'desc', 'Pondasi 2 sisi', 'volumeFormula', '9+12+7,5+6', 'qty', 34.5, 'unit', 'm¹', 'harga', 38000),
        jsonb_build_object('presetCode', 'ar_plafon', 'desc', 'Plafon Lt 1 s.d. 4', 'volumeFormula', '37 x 9 x 4', 'qty', 1332, 'unit', 'm²', 'harga', 9100),
        jsonb_build_object('presetCode', 'ar_partisi', 'desc', 'Partisi', 'volumeFormula', '(37+37+9+9+12+10) x 5,5', 'qty', 627, 'unit', 'm²', 'harga', 13000)
      ),
      'biayaTambahan', '[]'::jsonb,
      'upahPeralatanPct', 25,
      'diskonUpahPct', 15,
      'upahPeralatanRp', 5868550,
      'diskonUpahRp', 3521130,
      'diskonPct', 0,
      'ppn', false,
      'garansiTahun', 3,
      'garansiNilai', 3,
      'garansiUnit', 'tahun',
      'tampilkanPengontrolan', true,
      'estimasiHari', 5,
      'subtotal', 23474200,
      'diskonRp', 0,
      'ppnRp', 0,
      'total', 25821620,
      'marketingUid', v_surveyor_id::text,
      'marketingNama', 'Rizky Pratama (Surveyor / Marketing)',
      'marketingWa', '0812 8899 7766',
      'status', 'pending',
      'companyId', v_co_id::text,
      'notesMarketing', 'Customer sedang negosiasi minta opsi harga garansi 2 tahun atau 1 tahun. Mohon Admin review di panel Adjust.'
    )
  )
  ON CONFLICT (id) DO NOTHING;

  -- (B) DEMO QUOTATION 2: Draft Anti Rayap Pra-Konstruksi + Pemipaan (Mengikuti PDF 0005 - PT Oreka Solusi Kreatif)
  INSERT INTO public.quotations (id, company_id, marketing_uid, status, created_at, payload)
  VALUES (
    v_q2_id,
    v_co_id,
    v_surveyor_id,
    'pending',
    now() - interval '1 day',
    jsonb_build_object(
      'id', v_q2_id::text,
      'noSurat', 'GP-DRF/AR/PH/2026/10/0002',
      'draftNoSurat', 'GP-DRF/AR/PH/2026/10/0002',
      'stage', 'DRF',
      'kategoriProyek', 'Komersial',
      'kategori', 'AR',
      'tipeKontrak', 'PH',
      'jenisLayanan', 'anti_rayap_pipanisasi',
      'pdfVariant', 'ar_pra_profile_8p',
      'kondisiBangunan', 'pra_konstruksi',
      'perihal', 'Penawaran Harga Anti Rayap (Pra Konstruksi & Sistem Pemipaan)',
      'kepadaNama', 'PT Oreka Solusi Kreatif',
      'kepadaAlamatLines', jsonb_build_array('Jl. RC. Veteran Raya No. 9, RT.001/RW.003', 'Bintaro, Kec. Pesanggrahan, Jakarta Selatan'),
      'kepadaUp', 'Ibu Clarissa (Project Manager)',
      'kepadaWa', '081234567890',
      'objekPekerjaan', 'bangunan rumah tinggal pra konstruksi',
      'lokasiPekerjaan', 'Jl. RC. Veteran Raya No. 9, Bintaro, Jakarta Selatan',
      'tanggal', to_char(now() - interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'surveyor', 'Rizky Pratama (Surveyor / Marketing)',
      'tanggalSurvey', to_char(current_date - 2, 'YYYY-MM-DD'),
      'hasilSurvey', 'Kondisi tapak bangunan siap pasang jalur pipa PVC AW Ø 1/2 inch sebelum pengecoran lantai kerja.',
      'items', jsonb_build_array(
        jsonb_build_object('presetCode', 'ar_luas_permukaan_soil', 'desc', 'Luas Permukaan', 'volumeFormula', '20 x 11', 'qty', 220, 'unit', 'm²', 'harga', 30000),
        jsonb_build_object('presetCode', 'ar_pemipaan_instalasi', 'desc', 'Pemipaan', 'volumeFormula', '155 + 77,5', 'qty', 232.5, 'unit', 'm¹', 'harga', 35000)
      ),
      'biayaTambahan', '[]'::jsonb,
      'upahPeralatanPct', 0,
      'diskonUpahPct', 0,
      'diskonPct', 5,
      'ppn', false,
      'garansiTahun', 5,
      'garansiNilai', 5,
      'garansiUnit', 'tahun',
      'tampilkanPengontrolan', true,
      'estimasiHari', 4,
      'subtotal', 14737500,
      'diskonRp', 736875,
      'ppnRp', 0,
      'total', 14000625,
      'marketingUid', v_surveyor_id::text,
      'marketingNama', 'Rizky Pratama (Surveyor / Marketing)',
      'marketingWa', '0812 8899 7766',
      'status', 'pending',
      'companyId', v_co_id::text,
      'notesMarketing', 'Paket Pra-Konstruksi Garansi 5 Tahun + Instalasi Pipa.'
    )
  )
  ON CONFLICT (id) DO NOTHING;

  -- (C) DEMO QUOTATION 3: Penawaran Pest Control Approved (`GP/PCO/PH/2026/10/0001` dari `GP-DRF/PCO/PH/2026/10/0001`)
  --     Mengikuti contoh nyata PDF 0003 (PLN UP3 Bulungan) dengan PPN DPP 11/12
  INSERT INTO public.quotations (id, company_id, marketing_uid, status, created_at, payload)
  VALUES (
    v_q3_id,
    v_co_id,
    v_surveyor_id,
    'approved',
    now() - interval '3 days',
    jsonb_build_object(
      'id', v_q3_id::text,
      'noSurat', 'GP/PCO/PH/2026/10/0001',
      'draftNoSurat', 'GP-DRF/PCO/PH/2026/10/0001',
      'approvedNoSurat', 'GP/PCO/PH/2026/10/0001',
      'stage', 'APR',
      'kategoriProyek', 'Instansi',
      'kategori', 'PCO',
      'tipeKontrak', 'K',
      'jenisLayanan', 'pest_umum',
      'pdfVariant', 'pco_korporat_boq_3p',
      'kondisiBangunan', 'pasca_konstruksi',
      'perihal', 'Penawaran Pest Control & Rodent Control',
      'kepadaNama', 'PT PLN (Persero) UP3 Bulungan',
      'kepadaAlamatLines', jsonb_build_array('Jl. Sisingamangaraja No. 1, Kebayoran Baru', 'Jakarta Selatan'),
      'kepadaUp', 'Bagian K3L & Umum',
      'kepadaWa', '081122334455',
      'objekPekerjaan', 'Gedung Kantor PT PLN (Persero) UP3 Bulungan',
      'lokasiPekerjaan', 'Jl. Sisingamangaraja No. 1, Kebayoran Baru, Jakarta Selatan',
      'tanggal', to_char(now() - interval '3 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'surveyor', 'Rizky Pratama (Surveyor / Marketing)',
      'tanggalSurvey', to_char(current_date - 4, 'YYYY-MM-DD'),
      'hasilSurvey', 'Pengendalian terpadu nyamuk, kecoa, semut, dan tikus pada area kantor pelayanan, ruang server, dan gudang arsip.',
      'items', jsonb_build_array(
        jsonb_build_object('presetCode', 'pco_pest_control_kali', 'desc', 'Pest Control', 'volumeFormula', '3', 'qty', 3, 'unit', 'Kali', 'harga', 4900000),
        jsonb_build_object('presetCode', 'pco_rodent_lot_8x', 'desc', 'Rodent Control (8x kunjungan)', 'volumeFormula', '1', 'qty', 1, 'unit', 'Lot', 'harga', 4500000)
      ),
      'biayaTambahan', '[]'::jsonb,
      'diskonPct', 0,
      'ppn', true,
      'ppnDppFaktor', 0.9166666667,
      'garansiTahun', 0,
      'garansiNilai', 6,
      'garansiUnit', 'bulan',
      'estimasiHari', 30,
      'subtotal', 19200000,
      'diskonRp', 0,
      'ppnRp', 2112000,
      'total', 21312000,
      'marketingUid', v_surveyor_id::text,
      'marketingNama', 'Rizky Pratama (Surveyor / Marketing)',
      'marketingWa', '0812 8899 7766',
      'status', 'approved',
      'approvedBy', 'H. Fakhrurrazi, S.E. (Admin)',
      'approvedAt', to_char(now() - interval '2 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'companyId', v_co_id::text
    )
  )
  ON CONFLICT (id) DO NOTHING;

  -- (D) Log Register Nomor Surat (`GP-DRF` & `GP-APR`)
  INSERT INTO public.nomor_surat_logs ("noSurat", stage, "draftNoSurat", kategori, tipe, "tipeLabel", kepada, "byUid", "byName", dibuat, status, "quoId", "companyId", "isManual", "keteranganManual")
  VALUES
    ('GP-DRF/AR/PH/2026/10/0001',  'DRF', NULL,                        'AR',  'PH', 'Penawaran Harga', 'PT Bank Victoria International Tbk', v_surveyor_id, 'Rizky Pratama (Surveyor / Marketing)', now() - interval '2 hours', 'pending',  v_q1_id, v_co_id, false, ''),
    ('GP-DRF/AR/PH/2026/10/0002',  'DRF', NULL,                        'AR',  'PH', 'Penawaran Harga', 'PT Oreka Solusi Kreatif',              v_surveyor_id, 'Rizky Pratama (Surveyor / Marketing)', now() - interval '1 day',   'pending',  v_q2_id, v_co_id, false, ''),
    ('GP-DRF/PCO/PH/2026/10/0001', 'DRF', NULL,                        'PCO', 'K',  'Kontrak',         'PT PLN (Persero) UP3 Bulungan',        v_surveyor_id, 'Rizky Pratama (Surveyor / Marketing)', now() - interval '3 days',  'approved', v_q3_id, v_co_id, false, ''),
    ('GP/PCO/PH/2026/10/0001', 'APR', 'GP-DRF/PCO/PH/2026/10/0001','PCO', 'K',  'Kontrak',         'PT PLN (Persero) UP3 Bulungan',        v_admin_id,    'H. Fakhrurrazi, S.E. (Admin)',         now() - interval '2 days',  'approved', v_q3_id, v_co_id, false, 'Approved dari GP-DRF/PCO/PH/2026/10/0001')
  ON CONFLICT ("companyId", "noSurat") DO NOTHING;

  -- (E) Seed Proyek Lapangan, Work Reports, & SPK untuk Teknisi Lapangan
  INSERT INTO public.projects (
    id, company_id, project_name, client_name, address, latitude, longitude, radius,
    work_date, work_type, service_type, focus_target, building_area_sqm, contract_type,
    warranty_months, next_service_date, scheduled_start_time, created_by
  ) VALUES
    (
      v_proj1_id, v_co_id,
      'Bank Victoria Cabang Fatmawati — Anti Rayap',
      'PT Bank Victoria International Tbk',
      'Jl. RS. Fatmawati Raya No. 39, Cilandak, Jakarta Selatan',
      -6.283812, 106.796641, 100,
      current_date,
      'Injeksi Pondasi & Penyemprotan Plafon/Partisi Anti Rayap',
      'TERMITE_CONTROL',
      'Rayap Tanah (Coptotermes curvignathus)',
      1332, 'ONE_TIME', 36, current_date + interval '6 months', '08:30', v_admin_id
    ),
    (
      v_proj2_id, v_co_id,
      'PT PLN (Persero) UP3 Bulungan — Pest & Rodent Control',
      'PT PLN (Persero) UP3 Bulungan',
      'Jl. Sisingamangaraja No. 1, Kebayoran Baru, Jakarta Selatan',
      -6.241520, 106.797890, 120,
      current_date,
      'Fogging Outdoor, Spraying B&G, ULV Indoor & Umpan Tikus',
      'GENERAL_PEST_CONTROL',
      'Nyamuk, Kecoa, Semut, Lalat & Rodentia (Tikus)',
      1800, 'RECURRING', 6, current_date + interval '1 month', '09:00', v_admin_id
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.work_reports (
    id, company_id, project_id, executor_id, status,
    check_in_at, check_in_latitude, check_in_longitude, check_in_accuracy, check_in_distance, check_in_valid,
    check_out_at, check_out_latitude, check_out_longitude, check_out_accuracy, check_out_distance, check_out_valid,
    duration_seconds, risk_score, risk_level, customer_name, customer_phone, notes, team_members
  )
  VALUES
    (
      v_wr1_id, v_co_id, v_proj1_id, v_teknisi_id, 'COMPLETED',
      now() - interval '3 hours', -6.283820, 106.796650, 12.5, 8.2, true,
      now() - interval '1 hour', -6.283825, 106.796655, 11.0, 9.1, true,
      7200, 0, 'NORMAL',
      'Bpk. Hendra Kusuma', '08119988776',
      'Pengeboran & injeksi termitisida Cypergard 100 EC pada jalur pondasi dan partisi selesai dilaksanakan.',
      jsonb_build_array(
        jsonb_build_object('name', 'Budi Santoso (Teknisi Lapangan)', 'role', 'Ketua Tim', 'isManual', false),
        jsonb_build_object('name', 'Agus Setiawan', 'role', 'Anggota Tim', 'isManual', true)
      )
    ),
    (
      v_wr2_id, v_co_id, v_proj2_id, v_teknisi_id, 'WORKING',
      now() - interval '45 minutes', -6.241525, 106.797895, 14.0, 6.5, true,
      NULL, NULL, NULL, NULL, NULL, NULL,
      NULL, 0, 'NORMAL',
      'Bagian K3L PLN Bulungan', '081122334455',
      'Sedang melaksanakan Fogging Outdoor, Spraying B&G, dan inspeksi Bait Station Tikus.',
      jsonb_build_array(
        jsonb_build_object('name', 'Budi Santoso (Teknisi Lapangan)', 'role', 'Ketua Tim', 'isManual', false)
      )
    )
  ON CONFLICT (id) DO UPDATE
    SET status = EXCLUDED.status,
        check_in_at = coalesce(public.work_reports.check_in_at, EXCLUDED.check_in_at),
        check_in_latitude = coalesce(public.work_reports.check_in_latitude, EXCLUDED.check_in_latitude),
        check_in_longitude = coalesce(public.work_reports.check_in_longitude, EXCLUDED.check_in_longitude),
        check_in_accuracy = coalesce(public.work_reports.check_in_accuracy, EXCLUDED.check_in_accuracy),
        check_in_distance = coalesce(public.work_reports.check_in_distance, EXCLUDED.check_in_distance),
        check_in_valid = coalesce(public.work_reports.check_in_valid, EXCLUDED.check_in_valid),
        check_out_at = coalesce(public.work_reports.check_out_at, EXCLUDED.check_out_at),
        check_out_latitude = coalesce(public.work_reports.check_out_latitude, EXCLUDED.check_out_latitude),
        check_out_longitude = coalesce(public.work_reports.check_out_longitude, EXCLUDED.check_out_longitude),
        check_out_accuracy = coalesce(public.work_reports.check_out_accuracy, EXCLUDED.check_out_accuracy),
        check_out_distance = coalesce(public.work_reports.check_out_distance, EXCLUDED.check_out_distance),
        check_out_valid = coalesce(public.work_reports.check_out_valid, EXCLUDED.check_out_valid),
        duration_seconds = coalesce(public.work_reports.duration_seconds, EXCLUDED.duration_seconds),
        team_members = EXCLUDED.team_members;

  INSERT INTO public.treatment_records (
    work_report_id, application_method, chemical_name, active_ingredient, dosage,
    treatment_area_sqm, drilling_points_count, safety_notes, technician_notes
  )
  VALUES (
    v_wr1_id, 'DRILLING', 'Cypergard 100 EC (Cypermethrin)', 'Cypermethrin 100 g/l', '2.5 Liter Larutan / Titik Injeksi',
    1332, 180, 'APD lengkap digunakan, area kerja steril.', 'Seluruh titik pondasi 1 sisi & 2 sisi telah diinjeksi.'
  )
  ON CONFLICT (work_report_id) DO NOTHING;

  INSERT INTO public.spk (id, company_id, technician_id, status, schedule_date, payload)
  VALUES (
    v_spk1_id,
    v_co_id,
    v_teknisi_id,
    'assigned',
    now(),
    jsonb_build_object(
      'id', v_spk1_id::text,
      'quotationId', v_q3_id::text,
      'quotationNoSurat', 'GP/PCO/PH/2026/10/0001',
      'customerId', 'cust-pln-bulungan',
      'customerName', 'PT PLN (Persero) UP3 Bulungan',
      'technicianId', v_teknisi_id::text,
      'technicianName', 'Budi Santoso (Teknisi Lapangan)',
      'scheduleDate', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'status', 'assigned',
      'serviceType', 'GENERAL_PEST_CONTROL',
      'perihal', 'Pelaksanaan Pest Control & Rodent Control Kunjungan #1',
      'lokasi', 'Jl. Sisingamangaraja No. 1, Kebayoran Baru, Jakarta Selatan',
      'notes', 'Bawa Thermal Fogging, B&G Sprayer, ULV Cold Fogger, Cypergard 100 EC, Demand CS, dan Klerat.',
      'alatPekerjaan', jsonb_build_array('Thermal Fogging', 'B&G Sprayer', 'ULV Cold Fogger', 'Bait Station Tikus'),
      'companyId', v_co_id::text,
      'createdBy', v_admin_id::text,
      'createdByName', 'H. Fakhrurrazi, S.E. (Admin)'
    )
  )
  ON CONFLICT (id) DO NOTHING;
END $$;


-- ====================================================================================================
-- BAGIAN 13: AUTO-CONFIRM INVITE REGISTRATION & AUTO-REPAIR PENDING AUTH USERS
-- ====================================================================================================
-- ====================================================================================================
-- MIGRASI 06: PERBAIKAN REGISTRASI UNDANGAN (AUTO-CONFIRM EMAIL), LOGIN 400, & AUTO-REPAIR AKUN NYANGKUT
-- Jalankan script ini di Supabase SQL Editor untuk menuntaskan masalah:
-- 1. Error 400 (grant_type=password / Email not confirmed) saat daftar & login via link undangan
-- 2. Akun auth.users yang sudah terbuat sebagian namun belum masuk ke public.users
-- ====================================================================================================



-- 1. Trigger otomatis pada auth.users:
--    Jika user mendaftar (INSERT ke auth.users) dengan metadata invite_token yang valid di public.invites,
--    atau jika email-nya diundang, langsung konfirmasi email_confirmed_at = now() agar tidak terkena blokir OTP/Confirm Email.
CREATE OR REPLACE FUNCTION public.fn_auto_confirm_invited_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_token text;
  v_inv public.invites;
BEGIN
  v_token := btrim(coalesce(new.raw_user_meta_data ->> 'invite_token', ''));

  IF v_token <> '' THEN
    SELECT * INTO v_inv
    FROM public.invites
    WHERE id = v_token
      AND coalesce((payload ->> 'used')::boolean, false) = false
    LIMIT 1;

    IF FOUND THEN
      new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
      new.confirmed_at := coalesce(new.confirmed_at, now());
    END IF;
  END IF;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Jangan pernah menggagalkan INSERT auth.users jika terjadi perbedaan kolom internal Supabase
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_confirm_invited_auth_user ON auth.users;
CREATE TRIGGER trg_auto_confirm_invited_auth_user
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_confirm_invited_auth_user();


-- 2. Fungsi RPC SECURITY DEFINER: public.complete_invite_registration
--    Dapat dipanggil langsung dari client (anon / authenticated) segera setelah supabase.auth.signUp()
--    untuk mengonfirmasi email di auth.users, membuat profil di public.users, dan menandai invite used = true.
CREATE OR REPLACE FUNCTION public.complete_invite_registration(
  p_token text,
  p_email text,
  p_name text,
  p_nip text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_inv public.invites;
  v_uid uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_role text;
  v_used_by text;
BEGIN
  IF coalesce(btrim(p_token), '') = '' THEN
    RAISE EXCEPTION 'Token undangan wajib diisi.';
  END IF;
  IF v_email = '' THEN
    RAISE EXCEPTION 'Email wajib diisi.';
  END IF;
  IF v_name = '' THEN
    v_name := split_part(v_email, '@', 1);
  END IF;

  -- Cari user di auth.users berdasarkan email (atau auth.uid() jika sudah memiliki sesi)
  SELECT id INTO v_uid
  FROM auth.users
  WHERE lower(email) = v_email
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_uid IS NULL AND auth.uid() IS NOT NULL THEN
    v_uid := auth.uid();
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Akun autentikasi untuk email % belum ditemukan. Silakan ulangi pendaftaran.', v_email;
  END IF;

  -- Kunci baris invite
  SELECT * INTO v_inv
  FROM public.invites
  WHERE id = btrim(p_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token undangan tidak ditemukan.';
  END IF;

  v_used_by := coalesce(v_inv.payload ->> 'usedBy', '');
  IF coalesce((v_inv.payload ->> 'used')::boolean, false) AND v_used_by <> '' AND v_used_by <> v_uid::text THEN
    RAISE EXCEPTION 'Token undangan ini sudah pernah digunakan oleh pengguna lain.';
  END IF;

  IF (v_inv.payload ->> 'expiresAt') IS NOT NULL
     AND (v_inv.payload ->> 'expiresAt')::timestamptz <= now()
     AND NOT coalesce((v_inv.payload ->> 'used')::boolean, false) THEN
    RAISE EXCEPTION 'Token undangan ini sudah kedaluwarsa.';
  END IF;

  v_role := coalesce(nullif(btrim(v_inv.payload ->> 'role'), ''), 'TEKNISI_LAPANGAN');
  IF v_role NOT IN ('SUPERADMIN', 'ADMIN', 'MARKETING', 'INVENTORY', 'TEKNISI_LAPANGAN') THEN
    v_role := 'TEKNISI_LAPANGAN';
  END IF;

  -- Auto-confirm email di auth.users agar signInWithPassword tidak ditolak dengan HTTP 400
  UPDATE auth.users
  SET email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'full_name', v_name,
        'company_id', v_inv.company_id::text,
        'role', v_role,
        'invite_token', btrim(p_token)
      ),
      updated_at = now()
  WHERE id = v_uid;

  -- Upsert ke public.users
  INSERT INTO public.users (
    id, company_id, name, email, nip, password_hash, role, phone, is_active, created_at, updated_at
  )
  VALUES (
    v_uid,
    v_inv.company_id,
    v_name,
    v_email,
    nullif(btrim(coalesce(p_nip, '')), ''),
    'managed-by-supabase-auth',
    v_role::public.user_role,
    nullif(btrim(coalesce(p_phone, '')), ''),
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    name       = EXCLUDED.name,
    email      = EXCLUDED.email,
    nip        = coalesce(EXCLUDED.nip, public.users.nip),
    role       = EXCLUDED.role,
    phone      = coalesce(EXCLUDED.phone, public.users.phone),
    is_active  = true,
    updated_at = now();

  -- Tandai token undangan sebagai used = true
  UPDATE public.invites
  SET payload = v_inv.payload || jsonb_build_object(
    'used', true,
    'usedBy', v_uid::text,
    'usedByEmail', v_email,
    'usedByName', v_name,
    'usedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
  WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'ok', true,
    'userId', v_uid,
    'companyId', v_inv.company_id,
    'role', v_role,
    'email', v_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_invite_registration(text, text, text, text, text) TO anon, authenticated;


-- 3. Fungsi RPC SECURITY DEFINER: public.repair_pending_invite_user
--    Memperbaiki akun yang sempat "nyangkut" (sudah masuk auth.users saat pendaftaran sebelumnya,
--    namun email_confirmed_at masih NULL atau belum memiliki profil di public.users).
CREATE OR REPLACE FUNCTION public.repair_pending_invite_user(
  p_email text,
  p_token text DEFAULT NULL,
  p_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_auth record;
  v_existing_user public.users;
  v_inv public.invites;
  v_token text := nullif(btrim(coalesce(p_token, '')), '');
  v_name text;
  v_role text;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'empty_email');
  END IF;

  SELECT id, email, email_confirmed_at, raw_user_meta_data
  INTO v_auth
  FROM auth.users
  WHERE lower(email) = v_email
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_auth.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_user_not_found');
  END IF;

  -- Pastikan email_confirmed_at terisi
  IF v_auth.email_confirmed_at IS NULL THEN
    UPDATE auth.users
    SET email_confirmed_at = now(),
        updated_at = now()
    WHERE id = v_auth.id;
  END IF;

  -- Cek apakah sudah ada di public.users
  SELECT * INTO v_existing_user FROM public.users WHERE id = v_auth.id;
  IF FOUND AND v_existing_user.company_id IS NOT NULL THEN
    IF NOT v_existing_user.is_active THEN
      UPDATE public.users SET is_active = true, updated_at = now() WHERE id = v_auth.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'repaired', true,
      'userId', v_auth.id,
      'companyId', v_existing_user.company_id,
      'role', v_existing_user.role::text
    );
  END IF;

  -- Jika belum ada di public.users, cari token invite dari parameter, metadata, atau invite aktif terbaru
  IF v_token IS NULL THEN
    v_token := nullif(btrim(coalesce(v_auth.raw_user_meta_data ->> 'invite_token', '')), '');
  END IF;

  IF v_token IS NOT NULL THEN
    SELECT * INTO v_inv FROM public.invites WHERE id = v_token FOR UPDATE;
  END IF;

  IF v_inv.id IS NULL THEN
    SELECT * INTO v_inv
    FROM public.invites
    WHERE coalesce((payload ->> 'used')::boolean, false) = false
      AND ((payload ->> 'expiresAt') IS NULL OR (payload ->> 'expiresAt')::timestamptz > now())
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_matching_invite');
  END IF;

  v_name := coalesce(
    nullif(btrim(coalesce(p_name, '')), ''),
    nullif(btrim(coalesce(v_auth.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(btrim(coalesce(v_auth.raw_user_meta_data ->> 'name', '')), ''),
    split_part(v_email, '@', 1)
  );

  v_role := coalesce(nullif(btrim(v_inv.payload ->> 'role'), ''), 'TEKNISI_LAPANGAN');
  IF v_role NOT IN ('SUPERADMIN', 'ADMIN', 'MARKETING', 'INVENTORY', 'TEKNISI_LAPANGAN') THEN
    v_role := 'TEKNISI_LAPANGAN';
  END IF;

  INSERT INTO public.users (
    id, company_id, name, email, password_hash, role, is_active, created_at, updated_at
  )
  VALUES (
    v_auth.id,
    v_inv.company_id,
    v_name,
    v_email,
    'managed-by-supabase-auth',
    v_role::public.user_role,
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    name       = EXCLUDED.name,
    email      = EXCLUDED.email,
    role       = EXCLUDED.role,
    is_active  = true,
    updated_at = now();

  UPDATE public.invites
  SET payload = v_inv.payload || jsonb_build_object(
    'used', true,
    'usedBy', v_auth.id::text,
    'usedByEmail', v_email,
    'usedByName', v_name
  )
  WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'ok', true,
    'repaired', true,
    'userId', v_auth.id,
    'companyId', v_inv.company_id,
    'role', v_role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.repair_pending_invite_user(text, text, text) TO anon, authenticated;


-- 4. Perbaikan langsung (One-Time Auto-Heal) untuk seluruh akun di auth.users yang belum terkonfirmasi
--    atau belum masuk ke public.users akibat kendala pendaftaran sebelumnya:
DO $$
DECLARE
  r record;
  v_res jsonb;
BEGIN
  -- Konfirmasi seluruh akun di auth.users yang masih belum terkonfirmasi
  UPDATE auth.users
  SET email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  WHERE email_confirmed_at IS NULL;

  -- Hubungkan akun auth.users yang belum memiliki baris di public.users dengan invite aktif jika ada
  FOR r IN
    SELECT au.id, au.email
    FROM auth.users au
    LEFT JOIN public.users pu ON pu.id = au.id
    WHERE pu.id IS NULL AND au.email IS NOT NULL
    ORDER BY au.created_at DESC
  LOOP
    BEGIN
      v_res := public.repair_pending_invite_user(r.email, NULL, NULL);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END;
$$;

COMMIT;
