# Blueprint Optimalisasi Infrastruktur (Hardening V2)
**Status:** Perencanaan (Draft)
**Objektif:** Zero Calculation Defect, Zero UI Lag, dan Offline-Resilience.

## 1. Tantangan Saat Ini (As-Is)
- **UI Lag:** Me-render 1.500+ baris bahan baku harian (*Daily Inventory EOD*) secara bersamaan membebani memori DOM (khususnya di tablet/POS kasir berspesifikasi rendah).
- **Kalkulasi Client-Side:** Perhitungan *Variance*, Harga Pokok Penjualan (HPP), dan Kerugian masih sebagian mengandalkan Javascript di *browser*. Jika koneksi terputus saat request dikirim, dapat terjadi *data corruption*.
- **Ketahanan Jaringan:** Input panjang saat EOD rentan hilang jika koneksi internet terputus di tengah jalan.
- **N+1 Query:** Pengambilan relasi data membebani jumlah request API.

## 2. Arsitektur Target (To-Be)

### A. Backend: Kalkulasi Database Mutlak (Database-Driven Math)
**Prinsip:** *Browser dilarang melakukan perhitungan finansial.*
- **Materialized Views:** Laporan bulanan (Cost Control, HPP) tidak dihitung berulang dari nol saat halaman dibuka. Gunakan `MATERIALIZED VIEW` PostgreSQL yang di-*refresh* tiap tengah malam atau lewat *Cron Trigger*.
- **Database Triggers:** Setiap `INSERT` pada tabel fisik (seperti `stock_adjustments` atau `daily_inventory_items`) secara otomatis akan memicu *trigger* yang menghitung *variance_qty*, nilai kerugian, dan langsung memotong tabel `materials`.

### B. Frontend: Virtualization & Offline-First
**Prinsip:** *Aplikasi tidak boleh membeku (freeze) dan data ketikan tidak boleh hilang.*
- **DOM Virtualization:** Menggunakan teknik *windowing* (hanya me-render komponen yang masuk layar/viewport) untuk tabel EOD dan Master Data.
- **Local Cache (IndexedDB):** Mengimplementasikan sistem penyimpanan draf *auto-save* berbasis *IndexedDB*. Jika API Supabase gagal dihubungi (karena WiFi putus), data dikunci di perangkat lokal dan di-sinkronisasi di latar belakang (Background Sync) ketika *online*.

### C. Keamanan & Efisiensi Jaringan (Row Level Security & RPC)
- **Strict RLS:** Pengetatan hak akses *Row Level Security* (RLS). Barista hanya memiliki akses `SELECT` (baca) master data dan hak `INSERT` data hariannya sendiri. Akses manipulasi (Update/Delete) mutlak dihalangi di level *database*.
- **Bulk Insert RPC:** Penyimpanan data EOD (ribuan baris) tidak dikirim menggunakan *looping API call*, melainkan digabungkan dalam satu *array JSON* dan ditembak melalui satu *Remote Procedure Call* (RPC) atomik ke Supabase.

## 3. Matrik Kesuksesan (Success Criteria)
1. **Performa Render:** *Time to Interactive* (TTI) halaman Daily EOD < 1 detik (walau dengan 2.000 item).
2. **Integritas Data:** Total nilai persediaan akhir di laporan = total saldo awal + total masuk - total keluar/limbah (konsisten di tingkat kueri SQL, tanpa *floating-point error* dari Javascript).
3. **Resiliensi:** Ketikan data fisik di *form* EOD aman dari insiden cabut kabel internet (*offline-proof*).
