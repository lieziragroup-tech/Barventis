-- Uji isolasi tenant, RLS, hak kolom, dan RPC. Jalankan pada DB hasil migrasi 00..04 sebagai superuser:
--   psql -d <db> -v ON_ERROR_STOP=0 -f supabase/tests/rls_test.sql | grep -E "^(PASS|FAIL)"
\set QUIET on
\pset tuples_only on
\pset format unaligned
set client_min_messages = warning;

create or replace function public.t_check(name text, ok boolean, info text default '') returns void language plpgsql as
$$ begin raise warning '%', (case when ok then 'PASS ' else 'FAIL ' end) || name || case when info <> '' then '  — ' || info else '' end; end $$;
grant execute on function public.t_check(text, boolean, text) to anon, authenticated;
-- jalankan ekspresi di bawah role saat ini & tangkap error → true bila DITOLAK
create or replace function public.t_denied(sql text) returns boolean language plpgsql as
$$ declare n int; begin execute sql; get diagnostics n = row_count; return n = 0; exception when others then return true; end $$;
grant execute on function public.t_denied(text) to anon, authenticated;
create or replace function public.t_rows(sql text) returns int language plpgsql as
$$ declare n int; begin execute sql; get diagnostics n = row_count; return n; exception when others then return -1; end $$;
grant execute on function public.t_rows(text) to anon, authenticated;

-- ── data uji ──
truncate companies cascade; truncate auth.users;
insert into companies (id, company_name, company_slug, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001','PT Guci Emas Pratama','guci','ACTIVE'),
  ('bbbbbbbb-0000-0000-0000-000000000002','PT Sarana Bumi Indonesia','sbi','ACTIVE');
insert into users (id, company_id, name, email, password_hash, role) values
  ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','Admin A','adminA@x.id','h','ADMIN'),
  ('a0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000001','Mkt A','mktA@x.id','h','MARKETING'),
  ('a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001','Tech A','techA@x.id','h','TEKNISI_LAPANGAN'),
  ('a0000000-0000-0000-0000-00000000000d','aaaaaaaa-0000-0000-0000-000000000001','Inv A','invA@x.id','h','INVENTORY'),
  ('b0000000-0000-0000-0000-00000000000a','bbbbbbbb-0000-0000-0000-000000000002','Admin B','adminB@x.id','h','ADMIN'),
  ('c0000000-0000-0000-0000-00000000000a',null,'Super','super@x.id','h','SUPERADMIN');
insert into auth.users (id, email) values ('d0000000-0000-0000-0000-00000000000e','newbie@x.id'), ('d0000000-0000-0000-0000-00000000000f','newbie2@x.id');
insert into quotations (id, company_id, marketing_uid, payload) values
  ('11111111-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000b','{"noSurat":"A-1","pdfBase64":"AAAA","signedPdfBase64":"BBBB","surveyPhotos":[{"base64":"CCCC"}],"total":100}'),
  ('11111111-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002',null,'{"noSurat":"B-1"}');
insert into inventory_items (id, company_id, nama, kategori, satuan, stok) values ('22222222-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','Cypermethrin','Chemical','Liter',10);
insert into projects (id, company_id, project_name, address, latitude, longitude, work_date) values ('33333333-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','P','Jl',1,1,current_date);
insert into work_reports (id, company_id, project_id, status) values ('44444444-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','33333333-0000-0000-0000-00000000000a','COMPLETED');
insert into company_settings (company_id, settings) values ('aaaaaaaa-0000-0000-0000-000000000001','{"nomorPrefix":"GP"}');
insert into invites (id, company_id, payload) values
  ('tok-ok','aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_object('companyName','PT Guci Emas Pratama','role','TEKNISI_LAPANGAN','used',false,'expiresAt',(now()+interval '7 day')::text)),
  ('tok-ok2','aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_object('companyName','PT Guci Emas Pratama','role','ADMIN','used',false,'expiresAt',(now()+interval '7 day')::text)),
  ('tok-used','aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_object('role','ADMIN','used',true,'expiresAt',(now()+interval '7 day')::text)),
  ('tok-old','aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_object('role','ADMIN','used',false,'expiresAt',(now()-interval '1 day')::text));
grant all on all tables in schema public to authenticated, anon;   -- seperti default Supabase; RLS yang membatasi
revoke all on public.users from anon, authenticated;
grant select (id, company_id, name, email, nip, role, phone, is_active, created_at, updated_at) on public.users to authenticated;
grant update (name, phone) on public.users to authenticated;

-- ── ADMIN A ──
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-00000000000a',false); set role authenticated;
select t_check('01 ADMIN A hanya melihat penawaran perusahaannya', (select count(*) = 1 and bool_and(company_id = 'aaaaaaaa-0000-0000-0000-000000000001') from quotations));
select t_check('02 ADMIN A hanya melihat user perusahaannya', (select count(*) = 4 from users));
select t_check('03 kolom password_hash TIDAK bisa dibaca', t_denied('select password_hash from users'));
select t_check('04 select * dari users ditolak (hak kolom)', t_denied('select * from users'));
select t_check('05 ADMIN A tidak bisa menulis ke penawaran perusahaan B', t_denied($$update quotations set status='X' where id='11111111-0000-0000-0000-00000000000b'$$));
select t_check('06 ADMIN A tidak bisa membuat user langsung (hanya RPC/backend)', t_denied($$insert into users(id,company_id,name,email,password_hash,role) values (gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','X','x@x','h','ADMIN')$$));
select t_check('07 ADMIN A tidak bisa mengganti role dirinya (hak kolom)', t_denied($$update users set role='SUPERADMIN' where id='a0000000-0000-0000-0000-00000000000a'$$));
select t_check('08 ADMIN A TIDAK boleh menyimpan template perusahaan B (RPC)', t_denied($$select company_settings_patch('bbbbbbbb-0000-0000-0000-000000000002','{"hack":1}')$$));
select t_check('08b tulis langsung ke company_settings ditutup walau untuk admin sendiri', t_denied($$update company_settings set settings='{"x":1}' where company_id='aaaaaaaa-0000-0000-0000-000000000001'$$) and t_denied($$insert into company_settings(company_id, settings) values ('bbbbbbbb-0000-0000-0000-000000000002','{}')$$));
select t_check('09 ADMIN A menyimpan template perusahaannya; kunci lain & riskConfig tidak terhapus', (company_settings_patch('aaaaaaaa-0000-0000-0000-000000000001','{"documents":{"x":1},"riskConfig":{"hack":1}}'::jsonb) -> 'documents' ->> 'x') = '1' and (select settings ? 'nomorPrefix' and not (settings ? 'riskConfig') from public.company_settings where company_id='aaaaaaaa-0000-0000-0000-000000000001'));
select t_check('10 laporan kerja (tabel backend) tertutup untuk browser', (select count(*) = 0 from work_reports));
select t_check('11 quotations_light menghilangkan PDF base64 & RLS berlaku', (select count(*) = 1 and bool_and(not (payload ? 'pdfBase64') and not (payload ? 'signedPdfBase64') and not (payload ? 'surveyPhotos') and payload ? 'total' and has_pdf and has_signed_pdf) from quotations_light));
select t_check('12 ADMIN A meninjau laporan perusahaannya (RPC)', (process_status_approval('44444444-0000-0000-0000-00000000000a','REVIEWED','ok') ->> 'success') = 'true');
select t_check('14 ADMIN A membuat undangan ADMIN', not t_denied($$insert into invites(id, company_id, payload) values ('tok-new','aaaaaaaa-0000-0000-0000-000000000001','{"role":"ADMIN","used":false}')$$));
select t_check('15 undangan role SUPERADMIN ditolak', t_denied($$insert into invites(id, company_id, payload) values ('tok-evil','aaaaaaaa-0000-0000-0000-000000000001','{"role":"SUPERADMIN"}')$$));
reset role;
select t_check('13 reviewed_by terisi auth.uid() penanda tangan', (select reviewed_by = 'a0000000-0000-0000-0000-00000000000a' and status = 'REVIEWED' from work_reports where id = '44444444-0000-0000-0000-00000000000a'));

-- ── MARKETING A ──
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-00000000000b',false); set role authenticated;
select t_check('16 MARKETING boleh membuat penawaran perusahaannya', not t_denied($$insert into quotations(company_id, marketing_uid) values ('aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000b')$$));
select t_check('17 MARKETING TIDAK boleh membuat penawaran untuk perusahaan lain', t_denied($$insert into quotations(company_id) values ('bbbbbbbb-0000-0000-0000-000000000002')$$));
select t_check('18 MARKETING TIDAK boleh mengubah template perusahaan', t_denied($$select company_settings_patch('aaaaaaaa-0000-0000-0000-000000000001','{"x":1}')$$));
select t_check('19 MARKETING boleh MEMBACA template perusahaan', (select count(*) = 1 from company_settings));
select quotation_patch('11111111-0000-0000-0000-00000000000a','approved','{"approvedAt":"2026-01-01"}') as hasil_patch \gset
select t_check('20 quotation_patch menggabungkan payload & mempertahankan kunci lain', (select status = 'approved' and payload ? 'noSurat' and payload ? 'approvedAt' and payload ->> 'status' = 'approved' and payload ? 'pdfBase64' from public.quotations where id='11111111-0000-0000-0000-00000000000a'));
select t_check('21 quotation_patch pada penawaran perusahaan lain ditolak', t_denied($$select quotation_patch('11111111-0000-0000-0000-00000000000b','approved','{}')$$));
select t_check('22 nomor surat #1 memakai prefix pengaturan (GP)', (generate_nomor_surat('PCO','PH','Penawaran','Klien','Mkt') ->> 'noSurat') ~ '^GP-PCO/PH/\d{4}/\d{2}/0001$');
select t_check('23 nomor surat #2 berurutan', (generate_nomor_surat('PCO','PH','Penawaran','Klien','Mkt') ->> 'noSurat') ~ '/0002$');
select t_check('24 dry-run tidak menyimpan & menampilkan nomor berikutnya', (generate_nomor_surat('PCO','PH',null,null,null,true) ->> 'noSurat') ~ '/0003$' and (select count(*) = 2 from nomor_surat_logs));
reset role;

-- ── TEKNISI A ──
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-00000000000c',false); set role authenticated;
select t_check('25 TEKNISI TIDAK boleh membuat penawaran', t_denied($$insert into quotations(company_id) values ('aaaaaaaa-0000-0000-0000-000000000001')$$));
select t_check('26 TEKNISI TIDAK boleh mengubah stok (RPC)', t_denied($$select process_inventory_mutation('22222222-0000-0000-0000-00000000000a', 1, 'IN')$$));
select t_check('27 TEKNISI TIDAK boleh membuat nomor surat', t_denied($$select generate_nomor_surat('PCO','PH')$$));
select t_check('28 TEKNISI boleh mengubah nomor telepon sendiri', not t_denied($$update users set phone='0812' where id='a0000000-0000-0000-0000-00000000000c'$$));
select t_check('29 TEKNISI TIDAK bisa mengubah profil orang lain', t_denied($$update users set phone='0' where id='a0000000-0000-0000-0000-00000000000a'$$));
reset role;

-- ── INVENTORY A ──
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-00000000000d',false); set role authenticated;
select t_check('30 INVENTORY menambah stok 2,5 L (desimal) lewat RPC', (process_inventory_mutation('22222222-0000-0000-0000-00000000000a', 2.5, 'IN','tes') ->> 'new_stock')::numeric = 12.5);
select t_check('31 stok tidak boleh negatif', t_denied($$select process_inventory_mutation('22222222-0000-0000-0000-00000000000a', 999, 'OUT')$$));
select t_check('32 INVENTORY TIDAK bisa menulis log stok langsung', t_denied($$insert into inventory_logs(company_id,item_id) values ('aaaaaaaa-0000-0000-0000-000000000001','22222222-0000-0000-0000-00000000000a')$$));
reset role;

-- ── ADMIN B ──
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-00000000000a',false); set role authenticated;
select t_check('33 ADMIN B tidak melihat penawaran/user/nomor surat perusahaan A', (select count(*) = 1 from quotations) and (select count(*) = 1 from users) and (select count(*) = 0 from nomor_surat_logs) and (select count(*) = 0 from inventory_items));
select t_check('34 ADMIN B TIDAK bisa mengubah stok perusahaan A', t_denied($$select process_inventory_mutation('22222222-0000-0000-0000-00000000000a', 1, 'IN')$$));
select t_check('35 ADMIN B TIDAK bisa meninjau laporan perusahaan A', t_denied($$select process_status_approval('44444444-0000-0000-0000-00000000000a','REVIEWED','x')$$));
select t_check('36 ADMIN B TIDAK bisa membuat undangan untuk perusahaan A', t_denied($$insert into invites(id, company_id, payload) values ('tok-x','aaaaaaaa-0000-0000-0000-000000000001','{"role":"ADMIN"}')$$));
select t_check('37 nomor surat perusahaan B memakai inisial nama (SBI)', (generate_nomor_surat('PCO','PH') ->> 'noSurat') ~ '^SBI-PCO/PH/');
reset role;

-- ── SUPERADMIN ──
select set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-00000000000a',false); set role authenticated;
select t_check('38 SUPERADMIN melihat semua perusahaan', (select count(*) = 2 from companies));
select t_check('39 SUPERADMIN boleh mengubah template perusahaan mana pun', (company_settings_patch('aaaaaaaa-0000-0000-0000-000000000001','{"by":"super"}') ->> 'by') = 'super');
reset role;

-- ── ANON ──
set role anon;
select t_check('40 anon TIDAK bisa membaca penawaran/users/companies/invites/settings', (select count(*) = 0 from quotations) and t_denied('select id from users') and (select count(*) = 0 from companies) and (select count(*) = 0 from invites) and (select count(*) = 0 from company_settings));
select t_check('41 anon bisa memvalidasi token undangan sah', (get_invite_public('tok-ok') ->> 'role') = 'TEKNISI_LAPANGAN');
select t_check('42 token terpakai / kedaluwarsa / tidak ada → null', get_invite_public('tok-used') is null and get_invite_public('tok-old') is null and get_invite_public('nope') is null);
select t_check('43 anon TIDAK bisa memanggil RPC sensitif', t_denied($$select process_inventory_mutation('22222222-0000-0000-0000-00000000000a', 1, 'IN')$$) and t_denied($$select accept_invite('tok-ok','x')$$) and t_denied($$select generate_nomor_surat('PCO','PH')$$) and t_denied($$select company_settings_patch('aaaaaaaa-0000-0000-0000-000000000001','{}')$$));
reset role;

-- ── penerimaan undangan ──
select set_config('request.jwt.claim.sub','d0000000-0000-0000-0000-00000000000e',false); set role authenticated;
select t_check('44 accept_invite membuat user dengan company & role DARI UNDANGAN', (accept_invite('tok-ok','Si Baru','0811') ->> 'role') = 'TEKNISI_LAPANGAN');
select t_check('45 undangan hanya bisa dipakai sekali', t_denied($$select accept_invite('tok-ok','Lagi')$$));
reset role;
select t_check('46 user baru: company A, role TEKNISI, email dari auth.users', (select company_id = 'aaaaaaaa-0000-0000-0000-000000000001' and role = 'TEKNISI_LAPANGAN' and email = 'newbie@x.id' from users where id = 'd0000000-0000-0000-0000-00000000000e'));
select set_config('request.jwt.claim.sub','d0000000-0000-0000-0000-00000000000f',false); set role authenticated;
select t_check('47 undangan kedaluwarsa / terpakai ditolak', t_denied($$select accept_invite('tok-old','X')$$) and t_denied($$select accept_invite('tok-used','X')$$));
reset role;
