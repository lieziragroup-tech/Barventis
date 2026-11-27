-- ============================================================================
-- 03_tenant_hardening.sql — idempoten.
-- Isi: fungsi bantu tenant/role · tabel yang dirujuk kode tetapi belum ada · view daftar penawaran ringan ·
--      RPC DENGAN otorisasi (stok, persetujuan laporan, patch penawaran) · penomoran surat ATOMIK ·
--      undangan pengguna yang aman (anon hanya bisa memvalidasi token, bukan membaca tabel).
-- Prasyarat: Supabase (auth.uid()) — atau 00_baseline.sql pada Postgres biasa. PostgreSQL ≥ 15 (security_invoker).
-- ============================================================================

create extension if not exists pgcrypto;

-- ── 1. Fungsi bantu (SECURITY DEFINER agar tidak terkena rekursi RLS pada tabel users) ──────────────
create or replace function public.current_company_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select u.company_id from public.users u where u.id = auth.uid() and u.is_active
$$;

create or replace function public.current_app_role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select u.role::text from public.users u where u.id = auth.uid() and u.is_active
$$;

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select u.role::text = 'SUPERADMIN' from public.users u where u.id = auth.uid() and u.is_active), false)
$$;

-- SUPERADMIN, atau ADMIN milik perusahaan tersebut.
create or replace function public.is_company_admin(p_company uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_active
      and (u.role::text = 'SUPERADMIN' or (u.role::text = 'ADMIN' and u.company_id = p_company))
  )
$$;

-- SUPERADMIN, atau anggota perusahaan tersebut dengan salah satu role yang disebut.
create or replace function public.has_company_role(p_company uuid, variadic p_roles text[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_active
      and (u.role::text = 'SUPERADMIN' or (u.company_id = p_company and u.role::text = any (p_roles)))
  )
$$;

-- ── 2. Kolom & tabel ───────────────────────────────────────────────────────────────────────────────
-- audit_logs per perusahaan (sebelumnya tak ada company_id → log satu tenant terlihat tenant lain)
alter table public.audit_logs add column if not exists company_id uuid references public.companies(id) on delete set null;
create index if not exists idx_audit_logs_company_created on public.audit_logs(company_id, created_at desc);
update public.audit_logs a set company_id = u.company_id
  from public.users u where a.user_id = u.id and a.company_id is null;

-- Pengaturan perusahaan (identitas, kop, TEMPLATE DOKUMEN). Satu baris per perusahaan.
create table if not exists public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.company_settings add column if not exists updated_at timestamptz not null default now();
alter table public.company_settings add column if not exists updated_by uuid;
do $$ begin
  alter table public.company_settings add constraint chk_company_settings_size check (pg_column_size(settings) < 3145728);
exception when duplicate_object then null; end $$;

-- Log nomor surat. Kolom camelCase DIPERTAHANKAN: service frontend membaca/menulis dengan nama itu.
create table if not exists public.nomor_surat_logs (
  id uuid primary key default gen_random_uuid(),
  "noSurat" text not null,
  kategori text, tipe text, "tipeLabel" text, kepada text,
  "byUid" uuid, "byName" text,
  dibuat timestamptz not null default now(),
  status text not null default 'draft',
  "quoId" uuid,
  "companyId" uuid not null references public.companies(id) on delete cascade,
  "isManual" boolean not null default false,
  "keteranganManual" text not null default ''
);
do $$ begin
  create unique index if not exists uq_nomor_surat_company_no on public.nomor_surat_logs ("companyId", "noSurat");
exception when unique_violation then
  raise notice 'nomor_surat_logs sudah berisi nomor ganda — bersihkan lalu jalankan ulang untuk membuat indeks unik uq_nomor_surat_company_no';
end $$;

create table if not exists public.order_tracking (
  id uuid primary key,                       -- = id penawaran
  company_id uuid not null references public.companies(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb
);
create index if not exists idx_order_tracking_company on public.order_tracking(company_id);

-- Koleksi gaya Firestore → tabel payload (id teks).
create table if not exists public.performa_targets (
  id text primary key, company_id uuid not null references public.companies(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists public.customer_checklists (
  id text primary key, company_id uuid not null references public.companies(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists public.invites (
  id text primary key default gen_random_uuid()::text,   -- = token undangan
  company_id uuid not null references public.companies(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index if not exists idx_performa_targets_company on public.performa_targets(company_id);
create index if not exists idx_customer_checklists_company on public.customer_checklists(company_id);
create index if not exists idx_invites_company on public.invites(company_id);

-- ── 3. Daftar penawaran ringan: tanpa PDF base64 (yang bisa puluhan MB per baris) ───────────────────
-- security_invoker = RLS tabel dasar tetap berlaku untuk pemanggil.
-- Foto survei (base64) juga dibuang: hanya dibutuhkan saat membuat ulang PDF (diambil per-penawaran lewat getQuotationById).
create or replace view public.quotations_light with (security_invoker = true) as
  select id, company_id, marketing_uid, status, created_at,
         payload - 'pdfBase64' - 'signedPdfBase64' - 'surveyPhotos' as payload,
         (payload ? 'pdfBase64') as has_pdf,
         (payload ? 'signedPdfBase64') as has_signed_pdf
  from public.quotations;

-- ── 4. RPC dengan otorisasi ─────────────────────────────────────────────────────────────────────────
create or replace function public.process_inventory_mutation(
  p_item_id uuid, p_quantity numeric, p_type text,
  p_notes text default null, p_pencatat_id uuid default null, p_proyek text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_current numeric; v_new numeric; v_company uuid; v_log_id uuid;
begin
  if auth.uid() is null then raise exception 'Belum login' using errcode = '28000'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than 0'; end if;
  if p_type not in ('IN', 'OUT') then raise exception 'Type must be IN or OUT'; end if;

  select stok, company_id into v_current, v_company from inventory_items where id = p_item_id for update;
  if not found then raise exception 'Item not found'; end if;
  -- Otorisasi: ADMIN/INVENTORY milik perusahaan item (atau SUPERADMIN)
  if not has_company_role(v_company, 'ADMIN', 'INVENTORY') then
    raise exception 'Tidak berwenang mengubah stok perusahaan ini' using errcode = '42501';
  end if;

  if p_type = 'IN' then v_new := v_current + p_quantity;
  else
    v_new := v_current - p_quantity;
    if v_new < 0 then raise exception 'Insufficient stock'; end if;
  end if;

  update inventory_items set stok = v_new, updated_at = now() where id = p_item_id;
  insert into inventory_logs (item_id, company_id, tanggal, qty_masuk, qty_keluar, sisa_stok, proyek, keterangan, created_at)
  values (p_item_id, v_company, current_date,
          case when p_type = 'IN'  then p_quantity else 0 end,
          case when p_type = 'OUT' then p_quantity else 0 end,
          v_new, p_proyek, p_notes, now())
  returning id into v_log_id;
  return jsonb_build_object('success', true, 'log_id', v_log_id, 'new_stock', v_new);
end $$;

create or replace function public.process_status_approval(p_report_id uuid, p_status text, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_new work_report_status; v_current work_report_status; v_company uuid;
begin
  if auth.uid() is null then raise exception 'Belum login' using errcode = '28000'; end if;
  begin v_new := p_status::work_report_status;
  exception when invalid_text_representation then raise exception 'Status tidak valid: %', p_status; end;

  select status, company_id into v_current, v_company from work_reports where id = p_report_id for update;
  if not found then raise exception 'Laporan tidak ditemukan'; end if;
  if not is_company_admin(v_company) then
    raise exception 'Tidak berwenang meninjau laporan perusahaan ini' using errcode = '42501';
  end if;
  if v_new <> 'REVIEWED' or v_current not in ('COMPLETED', 'FLAGGED') then
    raise exception 'Transisi status % -> % tidak diizinkan', v_current, v_new;
  end if;

  update work_reports
     set status = v_new, review_notes = p_notes, reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
   where id = p_report_id;
  return jsonb_build_object('success', true, 'status', v_new);
end $$;

-- Patch penawaran ATOMIK (status + merge payload dalam satu UPDATE). Menggantikan read-modify-write
-- dari klien, yang bisa saling menimpa saat dua orang mengubah penawaran yang sama.
create or replace function public.quotation_patch(p_id uuid, p_status text default null, p_patch jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_company uuid;
begin
  select company_id into v_company from quotations where id = p_id for update;
  if not found then raise exception 'Penawaran tidak ditemukan'; end if;
  if not has_company_role(v_company, 'ADMIN', 'MARKETING') then
    raise exception 'Tidak berwenang mengubah penawaran ini' using errcode = '42501';
  end if;
  update quotations
     set status  = coalesce(p_status, status),
         payload = payload || coalesce(p_patch, '{}'::jsonb)
                   || case when p_status is not null then jsonb_build_object('status', p_status) else '{}'::jsonb end
   where id = p_id;
  return jsonb_build_object('id', p_id, 'status', coalesce(p_status, (select status from quotations where id = p_id)));
end $$;

-- ── 4b. Simpan pengaturan perusahaan (identitas, kop, TEMPLATE DOKUMEN) ────────────────────────────
-- Satu-satunya jalur tulis dari browser. Menggabungkan (||) per kunci tingkat-atas secara atomik, sehingga menyimpan
-- "identitas" tidak menghapus "dokumen" atau "riskConfig" (upsert biasa mengganti seluruh kolom). Hanya ADMIN
-- perusahaan tersebut (atau SUPERADMIN). `riskConfig` DIBUANG dari patch: aturan risiko hanya boleh lewat endpoint
-- backend yang memvalidasinya.
create or replace function public.company_settings_patch(p_company uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_clean jsonb := coalesce(p_patch, '{}'::jsonb) - 'riskConfig';
begin
  if auth.uid() is null then raise exception 'Belum login' using errcode = '28000'; end if;
  if jsonb_typeof(v_clean) <> 'object' then raise exception 'Patch harus berupa objek JSON'; end if;
  if not is_company_admin(p_company) then
    raise exception 'Hanya admin perusahaan yang dapat mengubah pengaturan & template' using errcode = '42501';
  end if;
  insert into company_settings (company_id, settings, updated_by, updated_at)
  values (p_company, v_clean, auth.uid(), now())
  on conflict (company_id) do update
    set settings = company_settings.settings || v_clean, updated_by = auth.uid(), updated_at = now();
  return (select settings from company_settings where company_id = p_company);
end $$;

-- ── 5. Penomoran surat ATOMIK ───────────────────────────────────────────────────────────────────────
-- Format: <PREFIX>-<KATEGORI>/<TIPE>/<YYYY>/<MM>/<0001>. PREFIX dari company_settings.nomorPrefix; bila
-- kosong → inisial nama perusahaan (mis. "PT Sarana Bumi Indonesia" → "SBI"). Lock advisory per
-- (perusahaan, prefix, kategori, tipe, bulan) mencegah dua pengguna mendapat nomor yang sama.
create or replace function public.generate_nomor_surat(
  p_kategori text, p_tipe text, p_tipe_label text default null, p_kepada text default null,
  p_by_name text default null, p_dry_run boolean default false, p_tz text default 'Asia/Jakarta'
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company uuid := current_company_id();
  v_prefix text; v_year text; v_month text; v_stem text; v_next int; v_no text; v_by_name text; v_row public.nomor_surat_logs;
begin
  if v_company is null then raise exception 'Tidak berwenang' using errcode = '42501'; end if;
  if not has_company_role(v_company, 'ADMIN', 'MARKETING') then
    raise exception 'Tidak berwenang membuat nomor surat' using errcode = '42501';
  end if;
  -- Kategori & tipe masuk ke teks nomor surat: hanya huruf besar/angka (cegah karakter aneh & manipulasi format).
  if p_kategori !~ '^[A-Z0-9]{1,10}$' or p_tipe !~ '^[A-Z0-9]{1,10}$' then
    raise exception 'Kategori/tipe nomor surat tidak valid';
  end if;
  -- Nama pembuat SELALU dari database (parameter p_by_name hanya dipertahankan demi kompatibilitas).
  select name into v_by_name from users where id = auth.uid();

  select nullif(btrim(settings ->> 'nomorPrefix'), '') into v_prefix from company_settings where company_id = v_company;
  if v_prefix is null then
    select left(string_agg(left(w, 1), ''), 4) into v_prefix
    from regexp_split_to_table(upper((select company_name from companies where id = v_company)), '\s+') w
    where w <> '' and w !~ '^(PT|CV|UD|PD|TBK)\.?$';
  end if;
  v_prefix := upper(coalesce(nullif(v_prefix, ''), 'DOC'));

  v_year  := to_char(now() at time zone p_tz, 'YYYY');
  v_month := to_char(now() at time zone p_tz, 'MM');
  v_stem  := v_prefix || '-' || p_kategori || '/' || p_tipe || '/' || v_year || '/' || v_month || '/';

  perform pg_advisory_xact_lock(hashtextextended(v_company::text || '|' || v_stem, 0));

  select coalesce(max((regexp_replace("noSurat", '^.*/', ''))::int), 0) + 1 into v_next
  from nomor_surat_logs
  where "companyId" = v_company and starts_with("noSurat", v_stem) and regexp_replace("noSurat", '^.*/', '') ~ '^\d+$';
  v_no := v_stem || lpad(v_next::text, 4, '0');

  if p_dry_run then
    return jsonb_build_object('id', 'preview', 'noSurat', v_no, 'kategori', p_kategori, 'tipe', p_tipe,
      'tipeLabel', p_tipe_label, 'kepada', p_kepada, 'byUid', auth.uid(), 'byName', v_by_name,
      'dibuat', now(), 'status', 'draft', 'quoId', null, 'companyId', v_company, 'isManual', false, 'keteranganManual', '');
  end if;

  insert into nomor_surat_logs ("noSurat", kategori, tipe, "tipeLabel", kepada, "byUid", "byName", dibuat, status, "quoId", "companyId", "isManual", "keteranganManual")
  values (v_no, p_kategori, p_tipe, p_tipe_label, p_kepada, auth.uid(), v_by_name, now(), 'draft', null, v_company, false, '')
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

-- ── 6. Undangan pengguna ────────────────────────────────────────────────────────────────────────────
-- Anon hanya boleh MEMVALIDASI satu token (mengembalikan nama perusahaan & role) — tidak bisa membaca/enumerasi tabel.
create or replace function public.get_invite_public(p_token text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('token', i.id, 'companyId', i.company_id,
                            'companyName', i.payload ->> 'companyName', 'role', i.payload ->> 'role',
                            'expiresAt', i.payload ->> 'expiresAt')
  from public.invites i
  where i.id = p_token
    and coalesce((i.payload ->> 'used')::boolean, false) = false
    and (i.payload ->> 'expiresAt')::timestamptz > now()
$$;

-- Membuat baris users untuk pengguna yang SEDANG login, berdasarkan undangan sah. Atomik & sekali pakai.
-- company_id/role diambil dari undangan di server — bukan dari klien — sehingga tak ada eskalasi hak.
create or replace function public.accept_invite(p_token text, p_name text, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_inv public.invites; v_uid uuid := auth.uid(); v_email text; v_role text;
begin
  if v_uid is null then raise exception 'Belum login' using errcode = '28000'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Nama wajib diisi'; end if;

  select * into v_inv from public.invites where id = p_token for update;
  if not found
     or coalesce((v_inv.payload ->> 'used')::boolean, false)
     or (v_inv.payload ->> 'expiresAt')::timestamptz <= now() then
    raise exception 'Undangan tidak valid, sudah dipakai, atau kedaluwarsa';
  end if;
  v_role := v_inv.payload ->> 'role';
  if v_role not in ('ADMIN', 'MARKETING', 'INVENTORY', 'TEKNISI_LAPANGAN') then
    raise exception 'Role undangan tidak diizinkan';
  end if;
  if exists (select 1 from public.users where id = v_uid) then raise exception 'Akun sudah terdaftar'; end if;

  select email into v_email from auth.users where id = v_uid;
  insert into public.users (id, company_id, name, email, password_hash, role, phone, is_active)
  values (v_uid, v_inv.company_id, btrim(p_name), v_email, 'managed-by-supabase-auth', v_role::user_role, nullif(btrim(p_phone), ''), true);

  update public.invites set payload = payload || jsonb_build_object('used', true, 'usedBy', v_uid) where id = p_token;
  return jsonb_build_object('companyId', v_inv.company_id, 'role', v_role);
end $$;

-- ── 7. Hak eksekusi: cabut dari PUBLIC/anon, beri ke authenticated (get_invite_public juga ke anon) ──
revoke execute on function public.process_inventory_mutation(uuid, numeric, text, text, uuid, text) from public, anon;
revoke execute on function public.process_status_approval(uuid, text, text) from public, anon;
revoke execute on function public.quotation_patch(uuid, text, jsonb) from public, anon;
revoke execute on function public.generate_nomor_surat(text, text, text, text, text, boolean, text) from public, anon;
revoke execute on function public.accept_invite(text, text, text) from public, anon;
revoke execute on function public.company_settings_patch(uuid, jsonb) from public, anon;
grant  execute on function public.process_inventory_mutation(uuid, numeric, text, text, uuid, text) to authenticated;
grant  execute on function public.process_status_approval(uuid, text, text) to authenticated;
grant  execute on function public.quotation_patch(uuid, text, jsonb) to authenticated;
grant  execute on function public.generate_nomor_surat(text, text, text, text, text, boolean, text) to authenticated;
grant  execute on function public.accept_invite(text, text, text) to authenticated;
grant  execute on function public.company_settings_patch(uuid, jsonb) to authenticated;
grant  execute on function public.get_invite_public(text) to anon, authenticated;
