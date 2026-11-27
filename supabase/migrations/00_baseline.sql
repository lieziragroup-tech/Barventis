-- ============================================================================
-- 00_baseline.sql — skema dasar multi-tenant untuk lingkungan BARU (dev/test/staging kosong).
--
-- JANGAN dijalankan pada database live: tabelnya sudah ada. Untuk DB live mulai dari 02_*.sql.
-- (backend-src/db/migrate.ts mendeteksi DB yang sudah berisi tabel `users` dan otomatis menandai
--  00 & 01 sebagai sudah diterapkan.)
--
-- Direkonstruksi dari dokumentasi skema live: tipe kolom, PK, UNIQUE, NULL/NOT NULL adalah FAKTA;
-- DEFAULT dan FOREIGN KEY adalah ASUMSI wajar — cocokkan dengan produksi bila perlu.
-- ============================================================================

-- Kompatibilitas Supabase untuk Postgres biasa (dev/CI). Di Supabase blok ini tidak melakukan apa-apa.
do $$
begin
  if to_regprocedure('auth.uid()') is null then
    create schema if not exists auth;
    if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role nologin bypassrls; end if;
    create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as $f$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $f$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  end if;
end $$;

create extension if not exists pgcrypto;

create type user_role as enum ('SUPERADMIN','ADMIN','MARKETING','INVENTORY','TEKNISI_LAPANGAN');
create type company_status as enum ('TRIAL','ACTIVE','SUSPENDED','EXPIRED');
create type work_report_status as enum ('DRAFT','READY','WORKING','COMPLETED','FLAGGED','REVIEWED');
create type risk_level as enum ('NORMAL','LOW_RISK','REVIEW','HIGH_RISK','CRITICAL');
create type photo_type as enum ('CHECK_IN','PROGRESS','CHECK_OUT');
create type service_type as enum ('GENERAL_PEST_CONTROL','TERMITE_CONTROL','FUMIGATION','RODENT_CONTROL','MOSQUITO_CONTROL','BIRD_CONTROL','BED_BUG_CONTROL','DISINFECTION');
create type application_method as enum ('SPRAYING','BAITING','DRILLING','TRENCHING','FOGGING','MISTING','DUSTING','GEL_INJECTION');
create type contract_type as enum ('ONE_TIME','RECURRING');

create table companies (
  id uuid primary key default gen_random_uuid(),
  company_name varchar not null,
  company_slug varchar not null unique,
  status company_status not null default 'TRIAL',
  subscription_plan varchar not null default 'BASIC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  name varchar not null,
  email varchar not null unique,
  nip varchar unique,
  password_hash text not null,
  role user_role not null,
  phone varchar,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table user_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  latitude float8 not null, longitude float8 not null, accuracy float8 not null,
  tracked_at timestamptz not null default now()
);
create table projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  project_name varchar not null, client_name varchar not null default '', address text not null,
  latitude float8 not null, longitude float8 not null, radius int4 not null default 100,
  work_date date not null, work_type varchar not null default '',
  service_type service_type not null default 'GENERAL_PEST_CONTROL',
  focus_target varchar, target_focus jsonb not null default '[]'::jsonb,
  building_area_sqm numeric, contract_type contract_type not null default 'ONE_TIME',
  warranty_months int4 not null default 0, next_service_date date,
  scheduled_start_time time not null default '08:00', notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  locked_at timestamptz
);
create table work_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  project_id uuid not null unique references projects(id) on delete cascade,
  executor_id uuid references users(id) on delete set null,
  status work_report_status not null default 'READY',
  check_in_at timestamptz, check_in_latitude float8, check_in_longitude float8, check_in_accuracy float8, check_in_distance float8, check_in_valid bool,
  check_out_at timestamptz, check_out_latitude float8, check_out_longitude float8, check_out_accuracy float8, check_out_distance float8, check_out_valid bool,
  duration_seconds int4, risk_score int4 not null default 0, risk_level risk_level not null default 'NORMAL',
  reviewed_by uuid references users(id), reviewed_at timestamptz, review_notes text,
  customer_name varchar, customer_phone varchar, customer_feedback text, customer_signature text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table treatment_records (
  id uuid primary key default gen_random_uuid(),
  work_report_id uuid not null unique references work_reports(id) on delete cascade,
  application_method application_method not null, chemical_name varchar not null, active_ingredient varchar, dosage varchar not null,
  treatment_area_sqm numeric, drilling_points_count int4, fumigant_type varchar, gas_concentration_ppm numeric,
  sealing_started_at timestamptz, aeration_completed_at timestamptz, safety_notes text, technician_notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table documentation_photos (
  id uuid primary key default gen_random_uuid(),
  work_report_id uuid not null references work_reports(id) on delete cascade,
  photo_type photo_type not null, photo_tag varchar, storage_path text not null, thumbnail_path text,
  latitude float8 not null, longitude float8 not null, accuracy float8 not null, distance_to_project float8 not null,
  is_within_radius bool not null, captured_at timestamptz not null, uploaded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table risk_events (
  id uuid primary key default gen_random_uuid(),
  work_report_id uuid not null references work_reports(id) on delete cascade,
  event_type varchar not null, points int4 not null, severity varchar not null, title varchar not null, description text not null,
  expected_value varchar, actual_value varchar, created_at timestamptz not null default now()
);
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  user_name varchar not null, user_role user_role not null, action varchar not null, entity_type varchar not null,
  entity_id text, details text not null, metadata jsonb, created_at timestamptz not null default now()
);
create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  nama varchar not null, kategori varchar not null, satuan varchar not null,
  stok numeric not null default 0, min_alert numeric not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table inventory_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  item_id uuid not null references inventory_items(id) on delete cascade,
  tanggal date not null default current_date,
  qty_masuk numeric not null default 0, qty_keluar numeric not null default 0, sisa_stok numeric not null default 0,
  proyek varchar, keterangan text, created_at timestamptz not null default now()
);
create table quotations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  marketing_uid uuid references users(id), status varchar not null default 'DRAFT',
  created_at timestamptz not null default now(), payload jsonb not null default '{}'::jsonb
);
create table spk (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  technician_id uuid references users(id), status varchar not null default 'DRAFT',
  schedule_date timestamptz not null, created_at timestamptz not null default now(), payload jsonb not null default '{}'::jsonb
);

-- ── risk_config: satu baris GLOBAL berisi nilai bawaan. Penyesuaian per-perusahaan disimpan di
--    company_settings.settings.riskConfig (lihat riskConfigRepository) sehingga admin satu perusahaan
--    tidak bisa mengubah aturan perusahaan lain.
create table risk_config (
  id smallint primary key default 1 check (id = 1),
  late_checkin_threshold_minutes integer not null default 15,
  late_checkin_points integer not null default 10,
  outside_radius_points integer not null default 30,
  short_duration_critical_minutes integer not null default 30,
  short_duration_critical_points integer not null default 20,
  short_duration_warning_minutes integer not null default 60,
  short_duration_warning_points integer not null default 10,
  min_total_photos integer not null default 3,
  min_total_photos_points integer not null default 10,
  require_progress_photo boolean not null default true,
  no_progress_photo_points integer not null default 15,
  location_drift_threshold_meters integer not null default 300,
  location_drift_points integer not null default 15,
  missing_treatment_record_points integer not null default 20,
  fumigation_missing_aeration_points integer not null default 40,
  review_threshold integer not null default 40,
  high_risk_threshold integer not null default 60,
  critical_threshold integer not null default 80,
  low_risk_threshold integer not null default 20,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into risk_config (id) values (1) on conflict (id) do nothing;

-- ── Indeks
create index idx_work_reports_status on work_reports(status);
create index idx_work_reports_executor on work_reports(executor_id);
create index idx_work_reports_company on work_reports(company_id, created_at desc);
create index idx_work_reports_checkin_at on work_reports(check_in_at);
create index idx_work_reports_risk_level on work_reports(risk_level);
create index idx_projects_company on projects(company_id);
create index idx_photos_work_report on documentation_photos(work_report_id);
create index idx_risk_events_work_report on risk_events(work_report_id);
create index idx_audit_logs_created_at on audit_logs(created_at desc);
create index idx_users_company on users(company_id);
create index idx_user_locations_user_tracked on user_locations(user_id, tracked_at desc);
create index idx_quotations_company on quotations(company_id, created_at desc);
create index idx_spk_company on spk(company_id, schedule_date desc);
create index idx_inventory_items_company on inventory_items(company_id);

-- ── Trigger: kunci proyek setelah check-in pertama (PRD Section 9) + updated_at
create or replace function fn_prevent_locked_project_edit() returns trigger as $$
begin
  if old.locked_at is not null then
    if new.project_name is distinct from old.project_name
      or new.latitude is distinct from old.latitude
      or new.longitude is distinct from old.longitude
      or new.radius is distinct from old.radius
      or new.work_date is distinct from old.work_date
    then
      raise exception 'PROJECT_LOCKED: critical fields cannot change after check-in';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
create trigger trg_project_lock before update on projects for each row execute function fn_prevent_locked_project_edit();

create or replace function fn_touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
create trigger trg_work_report_touch before update on work_reports for each row execute function fn_touch_updated_at();
create trigger trg_treatment_record_touch before update on treatment_records for each row execute function fn_touch_updated_at();
