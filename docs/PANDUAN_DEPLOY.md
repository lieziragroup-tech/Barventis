# Panduan Deploy

## 1. Environment (lihat `.env.example`)
Wajib di produksi: `DATABASE_URL` (role `postgres`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, dan **salah satu** dari
`SUPABASE_JWT_SECRET` (proyek HS256) / JWKS otomatis dari `SUPABASE_URL` (signing keys ES256), `CRON_SECRET`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Disarankan: `DB_SSL_CA` agar sertifikat database diverifikasi.
Tanpa konfigurasi autentikasi, **semua request API ditolak** (tidak ada rahasia bawaan).

## 2. Menerapkan migrasi pada database LIVE
> Lakukan di **staging/salinan** dulu. Cadangkan database sebelum menerapkan.

1. Pastikan PostgreSQL ≥ 15 (view `security_invoker`).
2. `npm run db:migrate` — mendeteksi tabel `users` yang sudah ada, menandai `00`/`01` selesai, menerapkan `02`–`04` (masing-masing dalam satu transaksi; gagal = tidak ada perubahan).
3. `04_rls_policies.sql` **mengganti semua policy lama** pada tabel yang dikelola dan mengaktifkan RLS. Pastikan `DATABASE_URL` memakai role `postgres` (BYPASSRLS) — jika tidak, backend akan kehilangan akses.
4. Jalankan uji: `psql -d <db> -f supabase/tests/rls_test.sql` (pada **salinan** — skrip ini mengosongkan data uji!). Jangan jalankan terhadap produksi.
5. Verifikasi manual: login tiap role; Admin A tidak melihat data perusahaan B; teknisi dapat check-in; admin dapat menyimpan template.

## 3. Hal yang berubah bagi pengguna
- Login sepenuhnya Supabase Auth. Endpoint Express `/auth/login|signup|reset-password|invite` **dihapus**.
- Pengguna lama harus punya akun Supabase Auth dengan `users.id` = id akun tersebut.
- Pembuatan user oleh admin kini lewat server (butuh `SUPABASE_SERVICE_ROLE_KEY`).
- Penomoran surat kini oleh server; format `PREFIX-KATEGORI/TIPE/YYYY/MM/NNNN` dengan prefix dari Pengaturan (kosong = inisial perusahaan). **Bila perusahaan Anda memakai prefix lama `GP`, isi "Prefix nomor surat" = `GP` di Template & Pengaturan agar urutan tidak berubah.**

## 4. Rollback
Migrasi bersifat additive kecuali: (a) kebijakan RLS (dapat dihapus: `drop policy ...` / `alter table ... disable row level security`), (b) fungsi RPC (`create or replace`, versi lama ada di `01_atomic_transactions.sql`). Pulihkan dari cadangan bila diperlukan.

## 5. Dependensi yang perlu diperhatikan
`xlsx@0.18.5` (npm) memiliki advisori keamanan (prototype pollution/ReDoS) yang diperbaiki pada rilis SheetJS dari CDN resmi.
Impor Excel di halaman Gudang sudah dibatasi (2 MB, 500 baris, validasi baris), tetapi disarankan memutakhirkan:
`npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (tidak dapat dilakukan dari lingkungan audit ini).
