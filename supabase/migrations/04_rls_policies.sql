-- ============================================================================
-- 04_rls_policies.sql — idempoten. Isolasi data antar-perusahaan (RLS) + hak kolom.
--
-- PERHATIAN (baca sebelum menjalankan di produksi):
--  * Skrip ini MENGHAPUS semua policy lama pada tabel di bawah lalu membuat policy baru yang terdefinisi jelas.
--    Policy lama yang Anda buat manual tidak dipertahankan. Uji di staging dulu.
--  * Backend Express harus terhubung sebagai role `postgres` (DATABASE_URL bawaan Supabase) — role itu BYPASSRLS.
--    Tabel khusus backend (projects, work_reports, ... audit_logs) di-RLS TANPA policy: browser dengan anon key
--    tidak bisa menyentuhnya sama sekali; hanya backend (yang memfilter company_id di kode) yang bisa.
-- ============================================================================

-- Hapus policy lama pada tabel target (agar tidak ada policy longgar yang tersisa).
do $$
declare r record; t text;
begin
  foreach t in array array[
    'companies','users','quotations','spk','inventory_items','inventory_logs','company_settings',
    'nomor_surat_logs','order_tracking','performa_targets','customer_checklists','invites',
    'projects','work_reports','treatment_records','documentation_photos','risk_events','risk_config','audit_logs','user_locations'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy %I on public.%I', r.policyname, t);
      end loop;
    end if;
  end loop;
end $$;

-- ── companies ─────────────────────────────────────────────────────────────────────────────────────
create policy companies_select on public.companies for select to authenticated
  using (id = public.current_company_id() or public.is_superadmin());
create policy companies_write on public.companies for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- ── users ─────────────────────────────────────────────────────────────────────────────────────────
-- Baca: sesama perusahaan (+ diri sendiri, agar akun nonaktif tetap bisa melihat pesannya). Tulis langsung:
-- hanya diri sendiri & hanya kolom name/phone (lihat grant di bawah). Membuat user, mengganti role, menonaktifkan,
-- dan menghapus dilakukan backend (service role) atau RPC accept_invite.
create policy users_select on public.users for select to authenticated
  using (company_id = public.current_company_id() or public.is_superadmin() or id = auth.uid());
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

revoke all on public.users from anon, authenticated;
grant select (id, company_id, name, email, nip, role, phone, is_active, created_at, updated_at) on public.users to authenticated;
grant update (name, phone) on public.users to authenticated;

-- ── quotations ────────────────────────────────────────────────────────────────────────────────────
create policy quotations_select on public.quotations for select to authenticated
  using (company_id = public.current_company_id() or public.is_superadmin());
create policy quotations_insert on public.quotations for insert to authenticated
  with check (public.has_company_role(company_id, 'ADMIN', 'MARKETING'));
create policy quotations_update on public.quotations for update to authenticated
  using (public.has_company_role(company_id, 'ADMIN', 'MARKETING'))
  with check (public.has_company_role(company_id, 'ADMIN', 'MARKETING'));
create policy quotations_delete on public.quotations for delete to authenticated
  using (public.is_company_admin(company_id));

-- ── spk ───────────────────────────────────────────────────────────────────────────────────────────
create policy spk_select on public.spk for select to authenticated
  using (company_id = public.current_company_id() or public.is_superadmin());
create policy spk_insert on public.spk for insert to authenticated
  with check (public.has_company_role(company_id, 'ADMIN', 'MARKETING'));
create policy spk_update on public.spk for update to authenticated
  using (public.has_company_role(company_id, 'ADMIN', 'MARKETING')
         or (technician_id = auth.uid() and company_id = public.current_company_id()))
  with check (public.has_company_role(company_id, 'ADMIN', 'MARKETING')
         or (technician_id = auth.uid() and company_id = public.current_company_id()));
create policy spk_delete on public.spk for delete to authenticated
  using (public.is_company_admin(company_id));

-- ── inventaris (mutasi stok HANYA lewat RPC process_inventory_mutation) ───────────────────────────
create policy inv_items_select on public.inventory_items for select to authenticated
  using (company_id = public.current_company_id() or public.is_superadmin());
create policy inv_items_insert on public.inventory_items for insert to authenticated
  with check (public.has_company_role(company_id, 'ADMIN', 'INVENTORY'));
create policy inv_items_update on public.inventory_items for update to authenticated
  using (public.has_company_role(company_id, 'ADMIN', 'INVENTORY'))
  with check (public.has_company_role(company_id, 'ADMIN', 'INVENTORY'));
create policy inv_items_delete on public.inventory_items for delete to authenticated
  using (public.is_company_admin(company_id));
create policy inv_logs_select on public.inventory_logs for select to authenticated
  using (company_id = public.current_company_id() or public.is_superadmin());

-- ── company_settings: identitas, kop & TEMPLATE DOKUMEN ──────────────────────────────────────────────
-- Baca: anggota perusahaan. TULIS: tidak ada policy tulis — satu-satunya jalur adalah RPC company_settings_patch
-- (hanya ADMIN perusahaan itu / SUPERADMIN; riskConfig tidak bisa ditimpa). Hapus baris: SUPERADMIN.
create policy company_settings_select on public.company_settings for select to authenticated
  using (company_id = public.current_company_id() or public.is_superadmin());
create policy company_settings_delete on public.company_settings for delete to authenticated
  using (public.is_superadmin());

-- ── nomor_surat_logs (kolom camelCase) ────────────────────────────────────────────────────────────
create policy nomor_select on public.nomor_surat_logs for select to authenticated
  using ("companyId" = public.current_company_id() or public.is_superadmin());
create policy nomor_insert on public.nomor_surat_logs for insert to authenticated
  with check (public.has_company_role("companyId", 'ADMIN', 'MARKETING'));
create policy nomor_update on public.nomor_surat_logs for update to authenticated
  using (public.has_company_role("companyId", 'ADMIN', 'MARKETING'))
  with check (public.has_company_role("companyId", 'ADMIN', 'MARKETING'));
create policy nomor_delete on public.nomor_surat_logs for delete to authenticated
  using (public.is_company_admin("companyId"));

-- ── tracking, performa, checklist ─────────────────────────────────────────────────────────────────
create policy tracking_select on public.order_tracking for select to authenticated
  using (company_id = public.current_company_id() or public.is_superadmin());
create policy tracking_insert on public.order_tracking for insert to authenticated
  with check (public.has_company_role(company_id, 'ADMIN', 'MARKETING', 'TEKNISI_LAPANGAN'));
create policy tracking_update on public.order_tracking for update to authenticated
  using (public.has_company_role(company_id, 'ADMIN', 'MARKETING', 'TEKNISI_LAPANGAN'))
  with check (public.has_company_role(company_id, 'ADMIN', 'MARKETING', 'TEKNISI_LAPANGAN'));
create policy tracking_delete on public.order_tracking for delete to authenticated
  using (public.is_company_admin(company_id));

create policy performa_select on public.performa_targets for select to authenticated
  using (company_id = public.current_company_id() or public.is_superadmin());
create policy performa_write on public.performa_targets for all to authenticated
  using (public.has_company_role(company_id, 'ADMIN', 'MARKETING'))
  with check (public.has_company_role(company_id, 'ADMIN', 'MARKETING'));

create policy checklist_select on public.customer_checklists for select to authenticated
  using (company_id = public.current_company_id() or public.is_superadmin());
create policy checklist_write on public.customer_checklists for all to authenticated
  using (public.has_company_role(company_id, 'ADMIN', 'MARKETING'))
  with check (public.has_company_role(company_id, 'ADMIN', 'MARKETING'));

-- ── invites: hanya admin perusahaan; role undangan tidak boleh SUPERADMIN ─────────────────────────
create policy invites_select on public.invites for select to authenticated
  using (public.is_company_admin(company_id));
create policy invites_insert on public.invites for insert to authenticated
  with check (public.is_company_admin(company_id)
              and (payload ->> 'role') in ('ADMIN', 'MARKETING', 'INVENTORY', 'TEKNISI_LAPANGAN'));
create policy invites_update on public.invites for update to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
create policy invites_delete on public.invites for delete to authenticated
  using (public.is_company_admin(company_id));

-- Tabel khusus backend (projects, work_reports, treatment_records, documentation_photos, risk_events,
-- risk_config, audit_logs, user_locations): RLS aktif, SENGAJA tanpa policy → tertutup untuk anon/authenticated.
