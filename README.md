# Barventis ERP

Platform ERP, manajemen inventori harian, dan *Cost Control* khusus bisnis F&B (*Restoran, Kafe, Bar, & Central Kitchen*). Dirancang berbasis alur operasional nyata menggunakan sistem **Draft & Lock EOD**, pencatatan **Olah Bahan / Trimming**, kontrol kedaluwarsa **FEFO**, rekonsiliasi **POS ESB**, serta dukungan **Multi-Cabang dengan Isolasi Data Ketat**.

---

## Fitur & Arsitektur Utama

- **Daily Inventory (FULL Inferred & BROKEN Weighed):** Form input EOD dengan mode *Draft* dan *Lock* idempoten. Saldo kemasan utuh (*FULL*) dihitung otomatis dari saldo buku, sementara sisa terbuka (*BROKEN*) ditimbang dalam satuan isi resep.
- **Konversi 2-Satuan (*Two-Tier Conversion*):** Mendukung satuan master kemasan (*pack/btl/carton*) yang terhubung otomatis ke satuan isi resep (*gr/ml/pcs*) melalui format `full_pack` (contoh: `pck = 1000 gr`).
- **Olah Bahan (*SimplePrep / Trimming*):** Mencatat konversi bahan mentah (*gross weight*) menjadi bahan siap pakai (*edible portion*) dan memperbarui HPP bahan olahan secara otomatis.
- **Pengadaan & Bukti Limbah (*Waste*):** Pencatatan *Marketlist*, pembelian harian (tujuan *Central* atau *Resto*), acuan kuota bulanan, *Invoicing*, serta pelaporan limbah dengan bukti foto WebP terkompresi.
- **POS ESB & Cost Control:** Pemotongan stok teoritis berbasis resep (BOM), rekonsiliasi selisih pemakaian aktual Barista vs teoritis POS ESB, serta analisis kuadran *Menu Engineering*.
- **Multi-Cabang & Isolasi Data Ketat (v11–v12):**
  - Katalog bahan, supplier, resep, pengadaan, dan stok terpisah total per `branch_id`.
  - Fitur **Tarik Menu/Bahan Antar Cabang** dan **Mutasi Kirim-Terima Antar Cabang** (`DISPATCH → RECEIVE`).
  - Staf operasional terkunci pada 1 cabang (*fail-closed* pada API, interceptor klien, & RLS PostgreSQL); **Owner / Admin** dapat berpindah cabang aktif dan memantau ringkasan lintas cabang.

---

## Tech Stack

- **Frontend:** React 19, Vite 8, Tailwind CSS v4, Framer Motion, React Router DOM 7, Lucide Icons, Recharts
- **Backend & Database:** Supabase (PostgreSQL, Row Level Security, Auth, Storage) + server proxy Express (`server.ts`)
- **Ekspor & Utilitas:** SheetJS (`xlsx`), jsPDF + AutoTable, JSZip, LocalForage (*offline draft cache*)
- **Pengujian & Kualitas:** Vitest 4, Testing Library, `pg-mem`, ESLint

---

## Struktur Navigasi Aplikasi

Aplikasi dikonsolidasikan ke dalam hub fungsional utama:
1. **Dashboard** — Ringkasan operasional cabang aktif dan metrik lintas cabang (Owner).
2. **Pengadaan (`ProcurementHub`)** — *Marketlist*, Pembelian Harian & Kuota Bulanan, Penerimaan Barang (*GRN*), dan *Invoicing*.
3. **Gudang & Stok Harian (`DailyInventoryHub`)** — *Stock Ledger*, *Daily Inventory* EOD, *Transfer Antar Cabang*, *Catatan Limbah*, dan *Monitor Kedaluwarsa (FEFO)*.
4. **Olah Bahan (`SimplePrep`)** — Konversi bahan mentah ke bahan olahan dan kalkulasi ulang HPP otomatis.
5. **Resep & Harga Menu (`PricingCogsHub`)** — Resep & BOM (termasuk tarik menu antar cabang), *Menu Pricing*, dan *Menu Engineering Matrix*.
6. **Opname & Penyesuaian (`OpnameAssetsHub`)** — *Stock Opname*, *Physical Check*, dan *Audit Selisih Stok*.
7. **Penjualan POS (`BeverageSalesHub`)** — Impor data POS ESB, *POS Terminal*, dan riwayat transaksi mentah POS.
8. **Laporan & Cost Control (`CostControlReportHub`)** — *Cost Control*, *Rekap Pemakaian*, dan *Laporan Barista vs POS*.
9. **Administrasi Sistem (`SystemAdminHub`)** — Manajemen cabang, pengguna/staf, undangan cabang, *Audit Logs*, dan *Backup Center*.

---

## Panduan Setup & Perintah Pengembangan

### 1. Konfigurasi Lingkungan
Salin `.env.example` menjadi `.env` dan isi kredensial yang sesuai:

```env
GEMINI_API_KEY=
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
PORT=3000
NODE_ENV=development
```

### 2. Instalasi & Menjalankan Aplikasi
```bash
npm install
npm run dev        # Menjalankan server development Express + Vite di port 3000
```

### 3. Build, Test, & Lint
```bash
npm test           # Menjalankan seluruh test suite Vitest
npm run lint       # Pemeriksaan ESLint
npm run build      # Build frontend Vite & bundle server Express (dist/server.cjs)
npm start          # Menjalankan build produksi
```

### 4. Deployment Database Supabase
Terapkan file migrasi SQL di folder `supabase/migrations/` secara berurutan mulai dari `20260918000000_barventis_v2_core.sql` hingga `20261115000000_strict_branch_isolation_v12.sql` pada lingkungan *staging* terlebih dahulu sebelum produksi. Lihat panduan urutan lengkap pada [Changelog & Referensi Arsitektur](docs/CHANGELOG_AND_ARCHITECTURE.md).

---

## Peta Dokumentasi Repository

- **[Changelog & Referensi Arsitektur (v3–v12)](docs/CHANGELOG_AND_ARCHITECTURE.md)** — Evolusi lengkap sistem, arsitektur multi-cabang, isolasi ketat `branch_id` (37 tabel, RLS, trigger, fail-closed API), dan daftar migrasi SQL.
- **[Index Dokumentasi](_index.md)** — Daftar navigasi seluruh dokumen blueprint, QA, dan vault proyek.
- **[Project State](docs/ayling/PROJECT_STATE.md)** — Status terkini proyek, hasil verifikasi teruji, dan langkah selanjutnya.
- **[Decision Log](docs/ayling/DECISION_LOG.md)** — Catatan keputusan teknis & arsitektur (`DEC-0002` s.d. `DEC-0012`).
- **[Evidence Ledger](docs/ayling/EVIDENCE_LEDGER.md)** — Bukti hasil pengujian (`vitest`, `build`, `lint`) dan observasi kode.
- **Catatan Implementasi Spesifik Versi:**
  - `IMPLEMENTATION_NOTES_Daily_Inventory_Cost_Control_v3.md`
  - `IMPLEMENTATION_NOTES_Daily_Inventory_Cost_Control_v4.md`
  - `IMPLEMENTATION_NOTES_Daily_Inventory_Cost_Control_v6.md`
  - `IMPLEMENTATION_NOTES_Daily_Inventory_Cost_Control_v6_1.md`
  - `IMPLEMENTATION_NOTES_Daily_Inventory_Cost_Control_v6_2.md`
