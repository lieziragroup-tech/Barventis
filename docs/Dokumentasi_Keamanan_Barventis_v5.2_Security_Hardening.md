# Dokumentasi Keamanan Barventis v5.2 (Security Hardening)

**Tanggal Rilis:** 26 November 2026  
**Cakupan:** Penguatan Keamanan Defensif (OWASP Top 10) untuk Frontend, Deployment Vercel, dan Database Supabase

## 1. Ringkasan Penguatan Keamanan v5.2

| Celah yang Ditutup | Perbaikan yang Diterapkan | Berkas Terkait |
| :--- | :--- | :--- |
| **HTTP Security Headers (A05)** | Menambahkan `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (tetap mengizinkan `camera=(self)` untuk foto penerimaan barang), dan `Content-Security-Policy` khusus SPA + Supabase + Sentry. | `vercel.json` |
| **RLS PO Lintas Lokasi di Database (A01)** | Menambahkan kebijakan RLS `bv52_invoices_role_boundary_select` pada `public.invoices` agar role `Central` dikunci ke `location = 'CENTRAL'` di level database (bukan hanya frontend), serta membuat view `public.v_invoices_operational_safe` (`security_invoker = true`) tanpa kolom nilai finansial `total`. | `supabase/migrations/20261126000001_v52_security_hardening_rls_and_search_path.sql` |
| **Fungsi `SECURITY DEFINER` Tanpa `search_path` (A05)** | Mengunci `SET search_path = public, pg_temp` secara otomatis pada seluruh fungsi `SECURITY DEFINER` di skema `public`. | `supabase/migrations/20261126000001_v52_security_hardening_rls_and_search_path.sql` |
| **RPC Beta/Trial Berakses `TO anon` (A01)** | Menyediakan skrip lockdown khusus *go-live* untuk menjalankan `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` dan `DROP FUNCTION` pada 5 RPC uji coba setelah masa trial selesai. | `supabase/migrations/20261126000002_v52_golive_revoke_beta_anon_rpcs.sql` |
| **Penghapusan `dangerouslySetInnerHTML` (A03 XSS)** | Mengganti render HTML mentah pada judul utama landing page menjadi render elemen JSX React murni (`<em>`) sehingga nol penggunaan `dangerouslySetInnerHTML` di seluruh `src/`. | `src/pages/landing/LandingHero.jsx` |
| **Mitigasi Upload Berkas Excel (A06)** | Menambahkan validasi ukuran maksimal **5 MB** dan daftar ekstensi resmi (`.xlsx`, `.xls`, `.csv`) sebelum pemrosesan `XLSX.read()` di modul *Bulk Import*. | `src/components/BulkImport.jsx` |
| **Isolasi Cache `localStorage` Per Cabang (A01)** | Mengisolasi kunci `bv_po_reminders_v5_<branchId>`, perbandingan harga supplier, dan penyesuaian *Cost Control* (`bv_cc_adj_<branchId>_<period>`) agar data lokal tidak pernah bercampur antar-cabang pada satu perangkat. | `src/components/modals/ComparePriceModal.jsx`, `src/components/shared/CostControlDualComparison.jsx` |

## 2. Langkah Penerapan di Produksi

1. **Deploy Kode v5.2 ke Vercel:** Ekstrak `Barventis-main-v5.2-deployment-ready.zip` dan push ke GitHub agar `vercel.json` dan perbaikan frontend langsung aktif.
2. **Jalankan Migrasi Aman Sekarang:** Buka **Supabase -> SQL Editor**, jalankan isi berkas `Barventis_v5.2_Security_Hardening_RLS.sql` (aman dijalankan selama masa trial berlangsung tanpa mengganggu Shortcut Beta).
3. **Jalankan Lockdown Saat Go-Live:** Setelah semua staf memakai akun asli dan `VITE_ENABLE_TRIAL_SHORTCUT=false` dipasang di Vercel, jalankan isi `Barventis_v5.2_GoLive_Lockdown.sql` di Supabase SQL Editor untuk mencabut seluruh akses `anon` pada RPC uji coba.
