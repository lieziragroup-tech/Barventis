# WBS Upgrade & Stabilisasi Barventis ERP V2

## Status Proyek: 100% Selesai (Tahap Development)

> **Update 24 September 2026**: 
> - Semua backlog "Sedang Berjalan" (Fase 2) telah diimplementasikan (ESB Upload dihapus, UsageRecap dibuat, tombol "Kirim Marketlist ke PO" ditambahkan, UI dibersihkan).
> - Arsitektur dipertahankan stabil dengan pendekatan incremental (kode baru di modul terpisah).
> - Seluruh 6 Modul Pendukung (Fase 4: FEFO, Vendor, Par-Stock, Audit Selisih, Pemeliharaan, Menu Engineering) telah dibuat beserta antarmuka UI-nya dan diintegrasikan ke Hub pages.
> - Migrasi database SQL `20260924000000_upgrade_modules.sql` sudah disiapkan.
> - Unit testing berjalan 100% pass (42 tests).
> - Aplikasi berhasil di-build tanpa error.
>
> Proyek siap masuk Fase 6 (Deployment ke Vercel dan Pelaksanaan Training).

---

## Temuan Audit Codebase vs Dokumen WBS

### Item "Sedang Berjalan" yang Sudah Selesai di Codebase
- Routing Laporan — `CostControlReportHub.jsx` sudah di sidebar
- Tabs Container — `TabContainer.jsx` shared component, dipakai semua Hub
- Dialog Stock Opname Full/Broken — `DailyInventory.jsx:843-846`

### Fondasi Parsial yang Sudah Ada untuk Modul 5.0
| Modul | Fondasi | Gap |
|---|---|---|
| 5.1 FEFO | Input `expiry_date` di `DailyInventory.jsx` | Disimpan di `materials.brand` (hack), perlu kolom DB |
| 5.2 Vendor | Tabel `suppliers`, CRUD di `Purchasing.jsx` | Belum ada flag harga naik |
| 5.3 Par-Stock | Kolom `par_stock` di DB, auto-populate di `Marketlist.jsx` | Statis, belum dinamis |
| 5.5 Kalibrasi | `GrinderCalibration.jsx` dengan `dose_in`/`yield_out` | Belum terhubung ke `assets` |
| 5.4 Audit Selisih | `varianceCalculator.js`, variance di `StockOpname.jsx` | Belum ada input alasan & approval |
| 5.6 Menu Engineering | `MenuPricing.jsx`, `v_recipe_cost_alerts` view | Belum ada sort margin*qty |

### Masalah Arsitektur
1. `api.js` = 4,983 baris — monolith, harus dipecah sebelum tambah fitur
2. `expiry_date` hack di `materials.brand` — migrasi ke kolom proper
3. `DashboardLayout.jsx` legacy masih di disk
4. Test coverage minimal (hanya `costUtils.test.js`)

---

## WBS 4 Level — Rencana Eksekusi

```
1.0 UPGRADE & STABILISASI BARVENTIS ERP V2
│
├── 2.0 FASE 1: PENYELESAIAN BACKLOG (Sprint 1-2, ~2 minggu)
│   │
│   ├── 2.1 Stabilisasi Modul Penjualan POS (4.1)
│   │   ├── 2.1.1 Validasi konsolidasi BeverageSalesHub fungsional penuh
│   │   ├── 2.1.2 Hapus ESBUpload.jsx deprecated stub
│   │   └── 2.1.3 Test integrasi upload POS → dashboard metrik
│   │
│   ├── 2.2 Stabilisasi Modul Daily Inventory & Waste (4.2)
│   │   ├── 2.2.1 Finalisasi tab pemisahan inventaris Beer
│   │   ├── 2.2.2 Finalisasi tab rekapitulasi Usage berjalan
│   │   └── 2.2.3 Implementasi navigasi keyboard cepat (Enter/Tab) form input
│   │
│   ├── 2.3 Stabilisasi Modul Procurement (4.3)
│   │   ├── 2.3.1 Implementasi tombol aksi "Kirim Marketlist ke PO"
│   │   └── 2.3.2 Test flow: Marketlist → PO → GRN → Invoice
│   │
│   ├── 2.4 Stabilisasi Modul Pricing & COGS (4.4)
│   │   ├── 2.4.1 Finalisasi katalog harga modal Beer botolan
│   │   └── 2.4.2 Validasi PricingCogsHub tab switching
│   │
│   ├── 2.5 Stabilisasi Stock Opname (4.5)
│   │   ├── 2.5.1 Migrasi input Full/Broken dari hack ke proper schema
│   │   └── 2.5.2 Test wizard hitung fisik multi-cabang
│   │
│   ├── 2.6 Finalisasi Navigasi & Layout (4.7-4.8)
│   │   ├── 2.6.1 Validasi link navigasi Laporan 13 sheet di sidebar
│   │   ├── 2.6.2 Validasi sidebar 7+1 menu
│   │   └── 2.6.3 Hapus DashboardLayout.jsx legacy
│   │
│   └── 2.7 Deployment Pipeline (6.2)
│       ├── 2.7.1 Penerapan backward compatibility URL routing
│       ├── 2.7.2 Setup pipeline CI/CD staging
│       └── 2.7.3 Uji performa input jam sibuk
│
├── 3.0 FASE 2: REFACTORING ARSITEKTUR (Sprint 3, ~1 minggu)
│   │
│   ├── 3.1 Pemecahan api.js Monolith (4,983 baris → modul terpisah)
│   │   ├── 3.1.1 Ekstrak materialApi.js (CRUD materials, categories)
│   │   ├── 3.1.2 Ekstrak inventoryApi.js (daily inventory, stock counts, EOD)
│   │   ├── 3.1.3 Ekstrak procurementApi.js (PO, GRN, invoice, suppliers)
│   │   └── 3.1.4 Ekstrak reportApi.js (export, laporan, aggregasi)
│   │
│   ├── 3.2 Migrasi Data Hack → Proper Schema
│   │   ├── 3.2.1 DDL: kolom expiry_date pada daily_inventory_items
│   │   ├── 3.2.2 Migrasi data dari materials.brand → kolom baru
│   │   ├── 3.2.3 Update semua query referensi hack lama
│   │   └── 3.2.4 DDL: kolom batch_number pada inventory items
│   │
│   └── 3.3 Peningkatan Test Coverage
│       ├── 3.3.1 Unit test varianceCalculator.js
│       ├── 3.3.2 Unit test reportGenerator.js
│       └── 3.3.3 Integration test: POS → COGS → Laporan
│
├── 4.0 FASE 3: MODUL PENDUKUNG / UPGRADE (Sprint 4-7, ~4 minggu)
│   │
│   ├── 4.1 Manajemen Kedaluwarsa & FEFO (WBS 5.1) — PRIORITAS TINGGI
│   │   ├── 4.1.1 DDL: tabel material_batches (batch_no, expiry_date, qty, location)
│   │   ├── 4.1.2 Backend: RPC/query FEFO sort (First-Expired-First-Out)
│   │   ├── 4.1.3 UI: Kolom expiry + badge warna (hijau/kuning H-3/merah expired)
│   │   └── 4.1.4 UI: Notifikasi banner Dashboard untuk bahan mendekati expired
│   │
│   ├── 4.2 Kalibrasi & Pemeliharaan Alat (WBS 5.5) — PRIORITAS TINGGI
│   │   ├── 4.2.1 Link GrinderCalibration ke tabel assets (relasi equipment)
│   │   ├── 4.2.2 UI: Jadwal pemeliharaan preventif (tabel + due date)
│   │   └── 4.2.3 UI: Riwayat servis & penggantian suku cadang per aset
│   │
│   ├── 4.3 Audit Investigasi Selisih Stok (WBS 5.4) — PRIORITAS TINGGI
│   │   ├── 4.3.1 UI: Input teks alasan variansi > 2% pada StockOpname
│   │   ├── 4.3.2 DDL: tabel stock_adjustments (reason, approved_by, status)
│   │   └── 4.3.3 UI: Tombol approve adjustment oleh Store Manager
│   │
│   ├── 4.4 Par-Stock Optimizer (WBS 5.3) — PRIORITAS SEDANG
│   │   ├── 4.4.1 Backend: Query avg consumption 30 hari dari POS data
│   │   ├── 4.4.2 Backend: Kalkulasi ROP & Safety Stock dinamis
│   │   └── 4.4.3 UI: Rekomendasi qty reorder otomatis di Marketlist
│   │
│   ├── 4.5 Evaluasi Vendor & Harga (WBS 5.2) — PRIORITAS SEDANG
│   │   ├── 4.5.1 Backend: Query perbandingan harga invoice terakhir vs sebelumnya
│   │   ├── 4.5.2 UI: Label merah pada item harga naik di Purchasing
│   │   └── 4.5.3 UI: Tabel scorecard vendor (OTIF, rejection rate)
│   │
│   └── 4.6 Menu Engineering Matrix (WBS 5.6) — PRIORITAS RENDAH
│       ├── 4.6.1 Backend: Query gabungan margin × qty_sold dari POS + recipes
│       ├── 4.6.2 UI: Tabel menu sorted by contribution margin
│       └── 4.6.3 UI: Klasifikasi Stars/Plowhorses/Puzzles/Dogs dengan badge
│
├── 5.0 FASE 4: PENGUJIAN & QA (Sprint 8, ~1 minggu)
│   │
│   ├── 5.1 Pengujian Fungsional End-to-End
│   │   ├── 5.1.1 Test skenario harian barista: input → EOD → laporan
│   │   ├── 5.1.2 Test skenario bulanan: Stock Opname → variance → adjustment
│   │   ├── 5.1.3 Test multi-cabang: transfer, laporan konsolidasi
│   │   └── 5.1.4 Test edge cases: stok negatif, batch expired, PO duplikat
│   │
│   ├── 5.2 Pengujian Performa & Keamanan
│   │   ├── 5.2.1 Load test input simultan 5+ barista concurrent
│   │   ├── 5.2.2 Validasi RLS multi-tenant isolation
│   │   └── 5.2.3 Audit keamanan: rate limiting, injection, file upload
│   │
│   └── 5.3 Rekonsiliasi Data
│       ├── 5.3.1 Cross-check angka sistem vs Excel SO Barista manual
│       ├── 5.3.2 Validasi ekspor 13 sheet Excel match data DB
│       └── 5.3.3 Validasi PDF laporan ringkasan format resmi
│
└── 6.0 FASE 5: DEPLOYMENT & PELATIHAN (Sprint 9-10, ~2 minggu)
    │
    ├── 6.1 Deployment Produksi
    │   ├── 6.1.1 Migrasi schema upgrade ke Supabase produksi
    │   ├── 6.1.2 Deploy frontend ke Vercel production
    │   ├── 6.1.3 Smoke test produksi: semua modul operasional
    │   └── 6.1.4 Konfigurasi Sentry monitoring & alerting
    │
    ├── 6.2 Sosialisasi & Pelatihan
    │   ├── 6.2.1 Pelatihan barista: input harian, EOD, waste log
    │   ├── 6.2.2 Pelatihan Store Manager: audit laporan, variance, approval
    │   ├── 6.2.3 Pelatihan Finance/Owner: cost control, ekspor laporan
    │   └── 6.2.4 Pembuatan video panduan singkat per modul
    │
    └── 6.3 Hypercare Pasca-Deploy
        ├── 6.3.1 Pendampingan operasional 2 minggu pertama
        ├── 6.3.2 Bug fixing prioritas dari feedback pengguna
        └── 6.3.3 Evaluasi KPI: adoption rate, error rate, waktu input
```

---

## Timeline

| Fase | Durasi | Sprint | Deliverable |
|---|---|---|---|
| 2.0 Penyelesaian Backlog | 2 minggu | 1-2 | Semua "Sedang Berjalan" → Selesai |
| 3.0 Refactoring | 1 minggu | 3 | api.js dipecah, hack migrasi, test naik |
| 4.0 Modul Pendukung | 4 minggu | 4-7 | 6 modul upgrade fungsional |
| 5.0 QA & Testing | 1 minggu | 8 | Seluruh modul teruji |
| 6.0 Deploy & Pelatihan | 2 minggu | 9-10 | Live produksi + tim terlatih |
| **Total** | **~10 minggu** | | **100% WBS Complete** |

## Keputusan Arsitektur
- **Refactor sebelum fitur baru** — api.js dipecah dulu agar modul pendukung masuk ke file terpisah
- **YAGNI pada modul pendukung** — implementasi MVP dulu, fitur lanjutan ditandai `ponytail:`
