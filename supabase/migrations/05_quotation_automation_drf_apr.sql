-- ============================================================================
-- 05_quotation_automation_drf_apr.sql — idempoten.
-- Mendukung penomoran surat 2 tahap (Dual-Stage Numbering):
--   1. Fase Draft (Surveyor/Marketing submit): <PREFIX>-DRF/<KATEGORI>/<TIPE>/<YYYY>/<MM>/<0001>
--      Contoh Anti Rayap (AR):    GP-DRF/AR/PH/2026/10/0001
--      Contoh Pest Control (PCO): GP-DRF/PCO/PH/2026/10/0001
--   2. Fase Approved / Resmi (Admin menyetujui): Langsung <PREFIX>/<KATEGORI>/<TIPE>/<YYYY>/<MM>/<0001> (tanpa APR)
--      Contoh Anti Rayap (AR):    GP/AR/PH/2026/10/0001
--      Contoh Pest Control (PCO): GP/PCO/PH/2026/10/0001
--
-- Kompatibilitas mundur: pemanggilan 7 argumen (tanpa p_stage) tetap berjalan dan
-- otomatis memakai p_stage = 'DRF' atau sesuai status.
-- ============================================================================

alter table public.nomor_surat_logs add column if not exists stage text not null default 'DRF';
alter table public.nomor_surat_logs add column if not exists "draftNoSurat" text;

-- Ganti fungsi 7-argumen lama dengan fungsi 8-argumen (p_stage default 'DRF')
drop function if exists public.generate_nomor_surat(text, text, text, text, text, boolean, text);

create or replace function public.generate_nomor_surat(
  p_kategori text,
  p_tipe text,
  p_tipe_label text default null,
  p_kepada text default null,
  p_by_name text default null,
  p_dry_run boolean default false,
  p_tz text default 'Asia/Jakarta',
  p_stage text default 'DRF'
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company uuid := current_company_id();
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
begin
  if v_company is null then
    raise exception 'Tidak berwenang' using errcode = '42501';
  end if;
  if not has_company_role(v_company, 'ADMIN', 'MARKETING') then
    raise exception 'Tidak berwenang membuat nomor surat' using errcode = '42501';
  end if;
  if (v_stage = 'APR' or v_stage = 'OFFICIAL') and not is_company_admin(v_company) then
    raise exception 'Hanya Admin yang berwenang menerbitkan nomor surat resmi' using errcode = '42501';
  end if;
  if v_stage not in ('DRF', 'APR', 'OFFICIAL', 'LEGACY') then
    raise exception 'Stage nomor surat tidak valid (gunakan DRF atau OFFICIAL)';
  end if;
  if p_kategori !~ '^[A-Z0-9]{1,10}$' or p_tipe !~ '^[A-Z0-9]{1,10}$' then
    raise exception 'Kategori/tipe nomor surat tidak valid';
  end if;

  select name into v_by_name from users where id = auth.uid();

  select nullif(btrim(settings ->> 'nomorPrefix'), '') into v_prefix
  from company_settings where company_id = v_company;

  if v_prefix is null then
    select left(string_agg(left(w, 1), ''), 4) into v_prefix
    from regexp_split_to_table(upper((select company_name from companies where id = v_company)), '\s+') w
    where w <> '' and w !~ '^(PT|CV|UD|PD|TBK)\.?$';
  end if;
  v_prefix := upper(coalesce(nullif(v_prefix, ''), 'GP'));

  v_year  := to_char(now() at time zone p_tz, 'YYYY');
  v_month := to_char(now() at time zone p_tz, 'MM');

  if v_stage = 'DRF' then
    -- Saat masih Draft memakai kode -DRF (contoh: GP-DRF/AR/PH/2026/10/0001)
    v_stem := v_prefix || '-DRF/' || p_kategori || '/' || p_tipe || '/' || v_year || '/' || v_month || '/';
  elsif v_stage = 'LEGACY' then
    v_stem := v_prefix || '-' || p_kategori || '/' || p_tipe || '/' || v_year || '/' || v_month || '/';
  else
    -- Saat Approved (Resmi / OFFICIAL / APR), kode DRF hilang langsung format kategori AR / PCO (contoh: GP/AR/PH/2026/10/0001)
    v_stem := v_prefix || '/' || p_kategori || '/' || p_tipe || '/' || v_year || '/' || v_month || '/';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_company::text || '|' || v_stem, 0));

  select coalesce(max((regexp_replace("noSurat", '^.*/', ''))::int), 0) + 1 into v_next
  from nomor_surat_logs
  where "companyId" = v_company
    and starts_with("noSurat", v_stem)
    and regexp_replace("noSurat", '^.*/', '') ~ '^\d+$';

  v_no := v_stem || lpad(v_next::text, 4, '0');
  v_status := case when (v_stage = 'APR' or v_stage = 'OFFICIAL') then 'approved' else 'pending' end;

  if p_dry_run then
    return jsonb_build_object(
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
      'quoId', null,
      'companyId', v_company,
      'isManual', false,
      'keteranganManual', ''
    );
  end if;

  insert into nomor_surat_logs (
    "noSurat", stage, kategori, tipe, "tipeLabel", kepada,
    "byUid", "byName", dibuat, status, "quoId", "companyId", "isManual", "keteranganManual"
  )
  values (
    v_no, v_stage, p_kategori, p_tipe, p_tipe_label, p_kepada,
    auth.uid(), v_by_name, now(), v_status, null, v_company, false, ''
  )
  returning * into v_row;

  return to_jsonb(v_row);
end $$;

revoke execute on function public.generate_nomor_surat(text, text, text, text, text, boolean, text, text) from public, anon;
grant  execute on function public.generate_nomor_surat(text, text, text, text, text, boolean, text, text) to authenticated;
