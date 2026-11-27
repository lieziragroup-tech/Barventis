# Guci-App Fieldwork — 2-Role Edition (Admin & Teknisi Lapangan)

Sistem manajemen operasional lapangan B2B **PT Guci Emas Pratama** yang difokuskan secara presisi pada **2 Peran Utama (`ADMIN` & `TEKNISI_LAPANGAN`)**, **Validasi Geolocation Haversine**, dan **Digital Report (`Laporan Hasil Pekerjaan`)**.

## Fitur Utama

1. **Pemisahan Tegas 2 Peran (`ADMIN` & `TEKNISI_LAPANGAN`)**
   - **Teknisi Lapangan (`TEKNISI_LAPANGAN`)**: Mobile-first PWA dengan **Floating Bottom Pill** (`Beranda`, `Tugas`, `Riwayat`, `Profil`), pemisahan tugas otomatis berdasarkan tanggal (`Kemarin`, `Hari Ini`, `Besok`, `Arsip < Kemarin`) + Filter Tanggal, alur 6 langkah eksekusi lapangan, presensi GPS Haversine, dokumentasi foto ber-watermark, tanda tangan & **Evaluasi PIC Rahasia (Strict Blind Evaluation)**, pratinjau PDF Laporan Hasil Pekerjaan (LHP), dan pengiriman salinan via WhatsApp.
   - **Admin Operasional (`ADMIN`)**: Desktop & tablet Operation Center dengan pemantauan antrean kendala lapangan (`Perlu Tindakan`), peta interaktif **Geolocation Haversine & Live Map**, tabel **Verifikasi Digital Report (LHP)**, dekripsi **Evaluasi Rahasia PIC**, pengelolaan titik geofence pelanggan, dan aturan skor risiko Haversine.

2. **100% Terikat ke Database (Tanpa Fitur Palsu)**
   - Seluruh data proyek (`public.projects`), laporan kerja (`public.work_reports`), foto bukti (`public.documentation_photos`), catatan treatment (`public.treatment_records`), eskalasi kendala lapangan (`public.risk_events`), dan telemetri GPS (`public.user_locations`) terhubung langsung ke lapisan database Supabase disertai **Hydrated Realistic Seed PT Guci Emas Pratama**.
   - Fitur non-database seperti pembersihan cache foto statis telah dihapus dan digantikan oleh sinkronisasi database riil.

3. **Dukungan Penuh Mode Terang & Mode Gelap (`Light` / `Dark` Theme)**
   - Token warna terstandarisasi (`#1A5C38` brand green di mode terang dan `#4B9B70` di mode gelap, permukaan `#101613` / `#1A211D` / `#222C26`, teks `#F0F4F1`) bekerja konsisten di seluruh layar Login, Teknisi Lapangan, Floating Bottom Pill, Modal, dan Dashboard Admin.

## Cara Menjalankan di Lokal & Deploy ke GitHub / Vercel

### 1. Instalasi & Menjalankan Lokal
```bash
npm install
cp .env.example .env
npm run dev
```
> **Catatan**: Sebelum Anda mengisi kredensial Supabase di `.env`, aplikasi dapat langsung dijalankan dan diuji menggunakan **Akun Akses Cepat 1-Klik PT Guci Emas Pratama** (`admin@gucimaspratama.co.id` dan `teknisi@gucimaspratama.co.id`, kata sandi: `GuciEmas123!`) dengan data realistis yang telah terdistribusi di tab **Hari Ini (3 tugas)**, **Besok (2 tugas)**, **Kemarin (2 tugas)**, dan **Arsip (2 tugas)**.

### 2. Setup Database Supabase (Opsional untuk Produksi)
1. Buka **Supabase Dashboard → SQL Editor**.
2. Jalankan isi file `supabase/guci_emas_2role_database_setup.sql`.
3. Masukkan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` ke dalam file `.env` (atau Environment Variables di Vercel / Netlify).

### 3. Build Produksi
```bash
npm run build
```