-- ============================================================================
-- 02_fix_drift_and_rpc.sql  — idempotent (aman dijalankan berulang)
-- Memperbaiki: (1) kolom purged_at yang dipakai kode tetapi tidak ada di skema,
--              (2) indeks pencarian yang gagal karena pg_trgm belum aktif,
--              (3) bug pada RPC process_inventory_mutation & process_status_approval.
-- Jalankan lewat Supabase SQL editor / `supabase db push`. TIDAK memakai CONCURRENTLY
-- (migrasi berjalan dalam transaksi).
-- ============================================================================

create extension if not exists pg_trgm;

-- (1) Retensi foto: dipakai photoRoutes.ts, retention.ts, reportMapper.ts
alter table documentation_photos add column if not exists purged_at timestamptz;

-- (2) Indeks untuk filter/sort dashboard admin & retensi
create index if not exists idx_wr_executor_created on work_reports(executor_id, created_at desc);
create index if not exists idx_wr_status_created   on work_reports(status, created_at desc);
create index if not exists idx_wr_risk_created     on work_reports(risk_level, created_at desc);
create index if not exists idx_projects_name_trgm  on projects using gin (project_name gin_trgm_ops);
create index if not exists idx_photos_pending_purge on documentation_photos(captured_at) where purged_at is null;
create index if not exists idx_user_locations_user_tracked on user_locations(user_id, tracked_at desc);
create index if not exists idx_inventory_logs_item_created on inventory_logs(item_id, created_at desc);

-- (3a) Mutasi stok atomik.
-- Perbaikan: qty memakai numeric (kolom stok numeric — INT memotong 2,5 liter jadi 2);
-- search_path dikunci (SECURITY DEFINER tanpa search_path rawan pembajakan skema);
-- kolom `proyek` kini dapat diisi; stok tidak boleh negatif tetap dijaga.
drop function if exists process_inventory_mutation(uuid, int, text, text, uuid);
drop function if exists process_inventory_mutation(uuid, numeric, text, text, uuid, text);

create or replace function process_inventory_mutation(
  p_item_id uuid,
  p_quantity numeric,
  p_type text,
  p_notes text default null,
  p_pencatat_id uuid default null,   -- dipertahankan demi kompatibilitas pemanggil; belum ada kolom penyimpanannya
  p_proyek text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current numeric;
  v_new numeric;
  v_company uuid;
  v_log_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than 0';
  end if;
  if p_type not in ('IN', 'OUT') then
    raise exception 'Type must be IN or OUT';
  end if;

  select stok, company_id into v_current, v_company
  from inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found';
  end if;

  if p_type = 'IN' then
    v_new := v_current + p_quantity;
  else
    v_new := v_current - p_quantity;
    if v_new < 0 then
      raise exception 'Insufficient stock';
    end if;
  end if;

  update inventory_items set stok = v_new, updated_at = now() where id = p_item_id;

  insert into inventory_logs (item_id, company_id, tanggal, qty_masuk, qty_keluar, sisa_stok, proyek, keterangan, created_at)
  values (
    p_item_id, v_company, current_date,
    case when p_type = 'IN'  then p_quantity else 0 end,
    case when p_type = 'OUT' then p_quantity else 0 end,
    v_new, p_proyek, p_notes, now()
  )
  returning id into v_log_id;

  return jsonb_build_object('success', true, 'log_id', v_log_id, 'new_stock', v_new);
end;
$$;

-- (3b) Persetujuan/peninjauan laporan.
-- Perbaikan: versi lama GAGAL total ("column status is of type work_report_status but expression
-- is of type character varying"); tidak memeriksa laporan ada; dan mengizinkan status apa saja
-- (melompati risk engine). Kini: status divalidasi sebagai enum, laporan harus ada, dan transisi
-- dibatasi COMPLETED/FLAGGED → REVIEWED (selaras dengan POST /api/work-reports/:id/review).
create or replace function process_status_approval(
  p_report_id uuid,
  p_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new work_report_status;
  v_current work_report_status;
begin
  begin
    v_new := p_status::work_report_status;
  exception when invalid_text_representation then
    raise exception 'Status tidak valid: %', p_status;
  end;

  select status into v_current from work_reports where id = p_report_id for update;
  if not found then
    raise exception 'Laporan tidak ditemukan';
  end if;

  if v_new <> 'REVIEWED' or v_current not in ('COMPLETED', 'FLAGGED') then
    raise exception 'Transisi status % -> % tidak diizinkan', v_current, v_new;
  end if;

  update work_reports
     set status = v_new, review_notes = p_notes, reviewed_at = now(), updated_at = now()
   where id = p_report_id;

  return jsonb_build_object('success', true, 'status', v_new);
end;
$$;
