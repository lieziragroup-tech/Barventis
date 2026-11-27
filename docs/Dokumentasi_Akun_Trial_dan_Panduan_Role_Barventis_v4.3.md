# Dokumentasi Akun Trial Internal, Panduan Spotlight per Role & Checklist Cleaning Pra-Produksi — Barventis v4.3

**Proyek:** Barventis (Resto Umatis — BSD, Kasuna & Central)  
**Tanggal:** 23 November 2026  
**Disusun oleh:** Ayling (System Architect & Executor)

---

## 1. Ringkasan Perubahan Utama (v4.3)

1. **7 Akun Trial Inti Benar-Benar Terpisah (Real Supabase Auth & RLS):**
   - Mekanisme spoofing lama (`bv_beta_role_override` di `sessionStorage` dan email kembar `barista.bsd@umatis.id` / `purchasing.bsd@umatis.id`) sudah **dihapus total**.
   - Setiap akun kini memiliki **UUID (`auth.uid()`) unik**, **email unik**, **baris `public.users` asli**, **`role` & `sub_role` asli**, serta **`branch_id` asli** sehingga isolasi RLS per cabang, audit log (`created_by`), dan pengujian lintas role berjalan 100% nyata.
   - Tombol **Shortcut Beta** di header tetap tersedia sebagai **One-Click Login** untuk mempercepat pengujian fitur sampai tahap deployment, lalu dibersihkan sebelum go-live produksi.
2. **Auto-Open Panduan Spotlight Interaktif per Akun (`RoleSpotlightGuide.jsx`):**
   - Setiap kali user baru pertama kali login (dilacak per `activeUser.id` via `localStorage`), **Panduan Spotlight** otomatis terbuka sesuai role akun yang sedang masuk.
   - Modal `Onboarding` lama tidak lagi muncul otomatis agar tidak tumpang tindih dengan Spotlight Guide.
   - Panduan tetap bisa dibuka ulang kapan saja lewat tombol **Panduan** di pojok kanan atas.

---

## 2. Daftar Akun Trial Internal Resto Umatis (One-Click Shortcut Beta & Login Manual)

Password standar seluruh akun trial internal: **`UmatisTrial2026!`**

| No | Preset Key | Nama Tampilan | Email Unik (`auth.users`) | Role DB | `sub_role` | Cabang (`branch_id`) | Fokus Pengujian |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `OWNER_UMATIS` | Owner Resto Umatis | `owner.umatis@umatis.id` | `Owner` | `OWNER` | BSD (Multi-Cabang) | Dashboard HPP, pindah cabang BSD/Kasuna/Central, Cost Control, Setelan Owner & Foto Validasi PDF Umatis |
| 2 | `CENTRAL_UMATIS` | Gudang Central Umatis | `central.umatis@umatis.id` | `Central` | `CENTRAL` | CENTRAL (`is_central=true`) | Dashboard Central, Mutasi stok ke BSD/Kasuna (Rp 0), PO Central, Buku Stok & Barcode Lot |
| 3 | `PURCHASING_UMATIS` | Purchasing & PO Umatis | `purchasing.umatis@umatis.id` | `Purchasing` | `PURCHASING` | BSD (Multi-PO) | Buat PO (Pilih Bahan dulu + Komparasi Supplier + Kalender H+N), Proses PO 1-baris, Matriks Tgl 1–31 & Petty Cash |
| 4 | `HEAD_BAR_BSD` | Irpan (Head Bar BSD) | `headbar.bsd@umatis.id` | `Bar` | `HEAD_BAR` | BSD | Daily Inventory (Bahan & Beer), Stock Opname (Resto/Central/Glass), Proses Produksi & Split 0%, ACC Order Central, Cost Control, Berita Acara |
| 5 | `BAR_BSD` | Ayat (Bar BSD) | `bar.bsd@umatis.id` | `Bar` | `REKAN_BAR` | BSD | Daily Inventory (Bahan & Beer), Proses Produksi, Permintaan PO Bar, Minta Barang Central (Rp 0) tanpa akses keuangan/ACC |
| 6 | `HEAD_BAR_KASUNA` | Head Bar Kasuna | `headbar.kasuna@umatis.id` | `Bar` | `HEAD_BAR` | KASUNA | Alur lengkap Head Bar khusus data terisolasi cabang **Kasuna** |
| 7 | `BAR_KASUNA` | Bar Kasuna | `bar.kasuna@umatis.id` | `Bar` | `REKAN_BAR` | KASUNA | Operasional harian Bar khusus data terisolasi cabang **Kasuna** |

---

## 3. Langkah Eksekusi (Siap Jalankan Langsung)

1. **Jalankan Skrip SQL di Supabase SQL Editor:**
   - Buka Supabase SQL Editor, lalu jalankan isi file **`Barventis_v4.3_Trial_Accounts_RPC.sql`** (sudah disertakan juga di dalam zip pada folder `supabase/migrations/`).
   - Skrip ini bersifat idempoten (`CREATE OR REPLACE FUNCTION`) dan membuat dua RPC aman:
     - `public.prepare_trial_signup_v19(p_email text)` — hanya mengizinkan reset akun trial `@umatis.id`.
     - `public.bind_trial_user_profile_v19(p_user_id uuid, p_preset_key text, p_email text, p_name text)` — mengikat user ke tenant Resto Umatis, cabang asli (`BSD`, `KASUNA`, atau `CENTRAL`), `role`, dan `sub_role`, serta mengonfirmasi email secara otomatis.
2. **Deploy Frontend Terbaru (`Barventis-main-v4-deployment-ready.zip`):**
   - Ekstrak dan push ke repository GitHub untuk auto-deploy Vercel.
3. **Uji Coba Lintas Role (End-to-End):**
   - Klik **Shortcut Beta** di kanan atas, pilih **`Bar BSD (Ayat)`** $\rightarrow$ Panduan Spotlight otomatis muncul $\rightarrow$ ajukan PO Resto.
   - Pindah ke **`Purchasing`** $\rightarrow$ Panduan Spotlight Purchasing otomatis muncul $\rightarrow$ klik **Proses PO** (1 baris rapi), bandingkan harga supplier, lalu **Simpan & Pesan**.
   - Pindah ke **`Central`** $\rightarrow$ buat PO Central atau kirim Mutasi Stok (Rp 0) ke BSD/Kasuna.
   - Pindah ke **`Head Bar BSD (Irpan)`** $\rightarrow$ lakukan **ACC Head Bar** pada PO Central, cek **Cost Control**, dan simpan **Berita Acara** (data 100% live Supabase).
   - Pindah ke **`Head Bar Kasuna`** / **`Bar Kasuna`** $\rightarrow$ pastikan data cabang Kasuna terisolasi rapi oleh RLS `strict_branch_*`.
   - Pindah ke **`Owner`** $\rightarrow$ cek seluruh cabang, upload **Foto Validasi Umatis** di **Pengaturan Resto > Profil Resto**, lalu unduh PDF PO untuk verifikasi stempel resmi.

---

## 4. Checklist Pre-Production Cleaning (Sebelum Go-Live Resmi)

Setelah seluruh pengujian fitur selesai dan sistem siap diserahkan penuh ke operasional resmi Umatis, lakukan 3 langkah pembersihan berikut:

1. **Hapus Tombol Shortcut Beta di Frontend:**
   - Di `src/services/api.js`, ubah `getBetaTestingPresets: () => []` (tombol **Shortcut Beta** di `AppLayout.jsx` otomatis hilang total karena terikat kondisi `betaPresets.length > 0`).
2. **Cabut RPC Trial di Supabase SQL Editor:**
   ```sql
   DROP FUNCTION IF EXISTS public.prepare_trial_signup_v19(text);
   DROP FUNCTION IF EXISTS public.bind_trial_user_profile_v19(uuid, text, text, text);
   ```
3. **Hapus Akun Trial Internal `@umatis.id` (Opsional jika staf memakai email asli masing-masing):**
   ```sql
   DELETE FROM public.users WHERE lower(email) LIKE '%@umatis.id';
   DELETE FROM auth.users WHERE lower(email) LIKE '%@umatis.id';
   ```
   Setelah itu, Owner cukup mengundang staf asli melalui menu **Pengaturan Resto > Undangan Staf**.
