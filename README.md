# Barventis - ERP & POS SaaS Platform 🚀

**Barventis** adalah platform SaaS (Software as a Service) modern yang dirancang untuk mengelola operasional *Food & Beverage* (F&B) seperti Restoran, Cafe, dan Bar. Sistem ini menyediakan fitur pengendalian biaya (Cost Control), manajemen inventaris, dan Terminal POS (Point of Sales) terintegrasi.

## ✨ Fitur Utama

### 🏢 Multi-Tenant (SaaS)
*   **Super Admin Dashboard**: Pantau performa semua klien (Tenant) dan tagih biaya langganan bulanan.
*   **Owner/Staff Dashboard**: Ruang kerja terpisah dan terenkripsi untuk tiap restoran dengan hak akses berlapis.

### 📦 Manajemen Inventaris & Resep (Cost Control)
*   **Database Bahan Baku**: Pantau pergerakan bahan baku dari Gudang Pusat hingga Dapur Restoran. Mendukung konversi satuan dinamis (Contoh: Beli per Kg, resep per Gram).
*   **Invoicing & Pembelian**: Catat faktur pembelian, hitung ulang *Moving Average Price* (HPP), dan pantau pembuangan (Spoilage/Waste).
*   **Resep (Bill of Materials)**: Daftarkan komposisi setiap menu. Stok akan otomatis berkurang secara presisi setiap ada penjualan.
*   **Stock Opname Otomatis**: Audit selisih fisik gudang di akhir bulan secara digital dan *paperless*. Laporan HPP/COGS otomatis ter-update.

### 💳 POS Terminal (Kasir Native)
*   **Responsif & Mobile-Friendly**: Antarmuka kasir yang ringan, bersih (clean white theme), dan nyaman dioperasikan lewat iPad, Tablet, maupun Smartphone.
*   **Pemotongan Stok *Real-Time***: Saat pembayaran berhasil, sistem menggunakan eksekusi RPC atomik PostgreSQL untuk mengurangi stok gudang secara otomatis tanpa bentrokan data (*race condition*).
*   **Dukungan *Offline Cache***: Keranjang belanja terlindungi oleh *Local Storage* agar data tidak hilang bila ter-refresh.
*   *(Opsional)* **POS Upload**: Dukungan impor file Excel penjualan dari Kasir Pihak Ketiga (Moka, Pawoon, dll) jika klien belum ingin menggunakan Native POS Barventis.

## 🛠️ Stack Teknologi

Sistem ini dirancang tanpa server perantara, memanfaatkan teknologi modern *BaaS* untuk performa maksimal:
*   **Frontend**: React 19 + Vite + React Router DOM
*   **Desain**: Pure CSS3 Glassmorphism UI (Tanpa framework CSS yang berat) + Lucide Icons
*   **Backend & Database**: Supabase (PostgreSQL 15 + Edge Functions)
*   **Keamanan**: Row Level Security (RLS) PostgreSQL & JWT Authentication
*   **Build System**: NPM Workspace & Vite Bundler

## 📖 Dokumentasi Arsitektur
Untuk mendalami alur data, metode pengamanan RLS, dan rancangan integrasi Midtrans, silakan baca file **[SISTEM_ARSITEKTUR.md](./SISTEM_ARSITEKTUR.md)**.

---

## 🚀 Panduan Instalasi Lokal

1. **Clone & Install Dependensi**
   ```bash
   git clone https://github.com/yourusername/barventis.git
   cd barventis
   npm install
   ```

2. **Pengaturan Environment**
   Buat file `.env` di root folder dan isi kredensial Supabase Anda:
   ```env
   VITE_SUPABASE_URL=https://[PROYEK-ID].supabase.co
   VITE_SUPABASE_ANON_KEY=ey...
   ```

3. **Inisialisasi Database**
   Buka *Supabase SQL Editor* di *dashboard* proyek Anda, lalu *Copy & Paste* isi file:
   - `database/supabase_schema_complete.sql` (Schema Induk Utama)
   
   Jalankan (*Run*) script tersebut untuk membuat semua tabel, kebijakan RLS, dan fungsi RPC secara otomatis.

4. **Jalankan Aplikasi**
   ```bash
   npm run dev
   ```
   Buka browser di `http://localhost:5173`.

---
*Dibuat khusus untuk efisiensi operasional manajemen restoran.*
