# Changelog & Referensi Arsitektur Barventis ERP

Dokumen ini merupakan referensi teknis terpadu dan catatan perubahan kronologis (**v3 → v12**) untuk **Barventis ERP**, platform manajemen inventori, *cost control*, dan operasional F&B (*Resto, Cafe, Central Kitchen*).

---

## 1. Peta Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LAPISAN ANTARMUKA (REACT 19 + VITE)                 │
│  Hub Navigasi: Pengadaan • Gudang & EOD • Resep & HPP • Laporan & Analisis  │
│  Konteks Sesi: AuthContext (Profil + Role) ──► DataContext (Active Branch)  │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   LAPISAN LAYANAN API & REPOSITORI                          │
│  • api.js / upgradeModulesApi.js / materialsRepo.js                         │
│  • Guard Fail-Closed: requireBranchContext() & isAdminSession()             │
│  • Menolak non-admin jika branch_id kosong atau lintas cabang               │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   INTERCEPTOR KLIEN SUPABASE (supabase.js)                  │
│  • Memeriksa window.__activeUserRole & window.__activeBranchId              │
│  • Auto-filter .eq('branch_id', ...) & inject payload pada 37 tabel cabang  │
│  • Memblokir supabase.unscopedFrom() bagi pengguna non-admin                │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  DATABASE POSTGRESQL / SUPABASE (v11–v12)                   │
│  • Kolom branch_id NOT NULL + DEFAULT public.bv2_auth_branch_id()           │
│  • Trigger: bv2_enforce_branch_integrity() (Materials, Recipes, Stock)      │
│  • Kebijakan RLS Ketat: strict_branch_{select,insert,update,delete}         │
│  • RPC Atomik & Terisolasi: clone_branch_data, get_owner_multi_branch_summary│
│    adjust_material_stock, deduct_stock_atomic, atomic_record_waste_v2       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Riwayat Perubahan & Evolusi Versi (v3 → v12)

### v3 — Konsolidasi Daily Inventory & Transaction Ledger
- Mengonsolidasikan pencatatan EOD harian ke dalam `daily_inventories` dan `daily_inventory_items`.
- Menjadikan tabel `transactions` sebagai *source of truth* mutasi stok dengan eksekusi idempoten saat *close/reopen* EOD, pembelian, transfer, dan limbah.
- Memisahkan pemakaian aktual terkonfirmasi (*Actual OUT*) dari HPP teoritis berbasis POS ESB (*Theoretical COGS*).
- Perbaikan sintaks PL/pgSQL `CASE` pada `convert_material_qty_to_stock_unit_v3`.

### v4 — Konsep FULL Inferred, BROKEN Weighed, & FEFO Lot Control
- **FULL Inferred**: Saldo kemasan utuh akhir dihitung sistem dari saldo buku (*opening + posted IN - OUT - WASTE*), bukan input manual ulang.
- **BROKEN Weighed**: Sisa bahan terbuka/pecahan ditimbang dalam satuan isi resep (*gr / ml / pcs*).
- **FEFO & Open Lot**: Menambahkan kontrol lot kedaluwarsa 3-warna (`material_batches`, `material_open_lot_state`, `material_lot_movements_v4`).
- Pencarian halaman di-debounce (300 ms) dengan paginasi 25/50/100 baris.

### v5 & v6 / v6.1 / v6.2 / v6.2.1 — Perbaikan Input IN, Hapus Modul Produksi Lama, & Stabilitas UI
- Mengganti modul *Proses Produksi* lama dengan alur **SimplePrep / Olah Bahan** yang lebih ringkas (riwayat transaksi historis tetap dipertahankan untuk kontinuitas saldo).
- Menyatukan input **IN (Total)** pada `Form Input EOD` (default tab saat membuka Daily Inventory): penerimaan *Purchasing/Transfer* ditampilkan otomatis dan hanya selisih manual (*manual delta*) yang disimpan dalam Draft lalu diposting idempoten saat EOD ditutup (*Lock*).
- Memperbaiki perhitungan `FULL` agar tidak pernah dikurangi `BROKEN`, serta memperbaiki *scope* variabel `outConfirmed` pada renderer baris tabel.

### v7 — Pemisahan Input Sisa Fisik BROKEN di Modul Limbah
- Menambahkan RPC `save_daily_inventory_broken_counts_v7` agar pencatatan sisa fisik **BROKEN** dari antarmuka *Catatan Limbah* langsung memperbarui detail Daily Inventory dan *open-lot state* tanpa menciptakan mutasi pengurangan stok limbah palsu.

### v9 — Arsitektur Konversi 2-Satuan, Olah Bahan, Kuota Bulanan, & Rekonsiliasi POS
1. **Konversi 2-Satuan (*Two-Tier Conversion*)**: Standarisasi format `full_pack` menjadi `<kemasan> = <jumlah> <satuan_isi>` (mis. `pck = 1000 gr`, `btl = 750 ml`). Sistem otomatis mengonversi unit isi ke unit kemasan saat memotong stok dan menghitung HPP.
2. **Rekonsiliasi Barista vs POS ESB**: Perbandingan langsung antara pemakaian aktual harian (input EOD Barista) dan pemakaian teoritis berdasarkan penjualan POS ESB & komposisi resep (BOM).
3. **Pembelian Harian & Acuan Kuota 1 Bulan**: Menambahkan `monthly_quota_qty` pada `materials` serta kolom `delivery_notes` pada `purchase_entries` dan `transactions` untuk memperjelas tujuan pengiriman (*Central* vs *Resto*).
4. **Visibilitas Bahan Olahan**: Menambahkan `is_prep_output` pada `materials` agar bahan hasil *trimming/prep* tetap tampil dan terkelola di Daily Inventory serta menyerap biaya ampas ke HPP barunya secara otomatis.

### v10 — Perbaikan Kolom Generated `terpakai_qty`
- Mengatasi error PostgreSQL `cannot insert a non-DEFAULT value into column "terpakai_qty"` pada database yang mendefinisikan kolom tersebut sebagai `GENERATED ALWAYS`.
- Mengubah `daily_inventory_items.terpakai_qty` menjadi kolom numerik standar dengan trigger `sync_daily_inventory_terpakai_qty_v10` yang menjaga nilainya tetap sinkron dengan `out_qty`.

### Pembaruan UI/UX & Penyederhanaan Copywriting
- Merapikan seluruh teks judul, sub-deskripsi (maksimal 4–6 kata), label tombol, dan pesan bantuan modal di seluruh modul utama (**Pengadaan**, **Gudang**, **Menu**, **Laporan**) agar singkat, kontekstual, bebas istilah ambigu, dan konsisten dalam Bahasa Indonesia.

### v11 — Dukungan Penuh Multi-Cabang (*Multi-Branch Full Support*)
- **Katalog & Stok Terpisah per Cabang**: Setiap cabang memiliki katalog `materials`, `suppliers`, `recipes`, pengadaan, dan saldo stok mandiri agar harga beli lokal dan stok fisik tidak tercampur.
- **Tarik / Salin Menu & Bahan Antar Cabang**: RPC `clone_branch_data` memungkinkan cabang menarik resep, harga jual, supplier, dan definisi bahan dari cabang lain dengan mode konflik `SKIP` atau `OVERWRITE` (saldo stok disalin mulai dari `0`).
- **Distribusi Stok Fleksibel & Transfer Antar Cabang**: Mendukung pembelian langsung per cabang maupun pengiriman lintas cabang (`inter_branch_transfers` & `inter_branch_transfer_items`) dengan alur **DISPATCH → RECEIVE**.
- **Kontrol Akses Peran & Switcher Owner**: Staf operasional terkunci pada `branch_id` masing-masing; *Owner / Admin* dapat berpindah cabang aktif via header dan memantau performa agregat melalui RPC `get_owner_multi_branch_summary`.

### v12 — Isolasi Ketat Data Per Cabang (*Strict Branch Isolation*)
- **Constraint `NOT NULL` & Backfill Aman**: Seluruh 37 tabel operasional cabang di-backfill ke cabang utama tenant lalu dikunci `NOT NULL` dan `DEFAULT public.bv2_auth_branch_id()`.
- **Indeks Unik Berbasis Cabang**: Mengganti indeks unik lama pada `daily_inventories`, `pos_daily_aggregates`, `materials`, `recipes`, dan `suppliers` agar terisolasi per `(tenant_id, branch_id)`.
- **Kebijakan RLS PostgreSQL Ketat**: Menghapus policy permisif lama dan menerapkan policy seragam `strict_branch_{select,insert,update,delete}` di seluruh tabel induk dan anak cabang.
- **Trigger Integritas Cabang & Hardening RPC**: Menambahkan `bv2_enforce_branch_integrity()` pada operasi `INSERT`/`UPDATE` Materials, Recipes, dan Stock, serta `bv2_assert_branch_access()` pada RPC stok (`adjust_material_stock`, `deduct_stock_atomic`, `atomic_record_waste_v2`).
- **Fail-Closed API & Interceptor Klien**: Menolak operasi CRUD non-admin di lapisan layanan (`api.js`, `upgradeModulesApi.js`, `materialsRepo.js`) dan interceptor `supabase.js` jika `branch_id` kosong atau mencoba mengakses cabang lain.

---

## 3. Arsitektur Isolasi Data & Keamanan Multi-Cabang

### 3.1 Matriks Hak Akses Peran
| Peran Pengguna | Pengenalan Role (`isAdminRole` / `bv2_is_admin`) | Cakupan Cabang | `unscopedFrom()` & Lintas Cabang | Perilaku jika `branch_id` Kosong |
|---|---|---|---|---|
| **Super Admin** | `Super Admin`, `SuperAdmin`, `super_admin` | Seluruh tenant & cabang | Diizinkan | Diizinkan |
| **Owner / Admin** | `Admin / Owner`, `Owner`, `Admin` | Seluruh cabang dalam 1 tenant | Diizinkan dalam tenant | Diizinkan untuk ringkasan lintas cabang |
| **Staf Operasional** | `Supervisor`, `Bar`, `Kitchen`, `Central`, `Service`, `Kasir`, `Purchasing`, `Staff` | Terkunci 1 `branch_id` | **Diblokir keras** | **Ditolak (*Fail-Closed Validation Error*)** |

### 3.2 Daftar 37 Tabel Terisolasi `branch_id` (`BRANCH_SCOPED_TABLES`)
1. **Master Data & Resep (4):** `materials`, `recipes`, `recipe_ingredients`, `recipe_versions`
2. **Stok, Lot FEFO, Opname, & Penyesuaian (12):** `material_batches`, `material_location_costs`, `material_open_lot_state`, `material_lot_movements_v4`, `stock_adjustments`, `daily_inventories`, `daily_inventory_items`, `stock_opnames`, `stock_opname_items`, `physical_checks`, `physical_check_items`, `unit_conversions`
3. **Mutasi, Limbah, & Produksi (4):** `transactions`, `waste_logs`, `production_batches`, `production_trimming_batches`
4. **Pengadaan & Supplier (11):** `suppliers`, `supplier_materials`, `purchase_orders`, `purchase_order_items`, `purchase_entries`, `market_lists`, `market_list_items`, `invoices`, `invoice_items`, `expected_usage`, `usage_variance`
5. **POS & Agregasi Penjualan (6):** `pos_upload_logs`, `pos_orders`, `pos_order_items`, `pos_transactions`, `pos_transaction_items`, `pos_daily_aggregates`

*(Tabel pendukung tambahan pada migrasi RLS v12 yang juga diproteksi `branch_id`: `storage_locations`, `daily_stock_counts`, `assets`, `equipment_service_logs`, dan `invitations`.)*

### 3.3 Lapisan Proteksi Pertahanan Berlapis (*Defense-in-Depth*)
1. **Lapisan Layanan (`api.js`, `upgradeModulesApi.js`, `materialsRepo.js`)**:
   - `requireBranchId` / `api.requireBranchContext` memvalidasi peran pengguna dan mewajibkan `branch_id` aktif bagi non-admin.
   - Seluruh operasi baca/tulis pada **Materials**, **Recipes**, dan **Stock** secara eksplisit memfilter `.eq('branch_id', branchId)` dan menyisipkan `branch_id` ke payload tulis.
2. **Lapisan Interceptor Klien (`src/lib/supabase.js`)**:
   - Memantau `window.__activeBranchId` dan `window.__activeUserRole` yang disinkronkan oleh `AuthContext` dan `DataContext`.
   - Menolak operasi `.select()`, `.insert()`, `.upsert()`, `.update()`, dan `.delete()` pada tabel cabang jika pengguna non-admin tidak memiliki `branch_id` aktif atau menyertakan `branch_id` milik cabang lain.
3. **Lapisan Database (Trigger + RLS + RPC)**:
   - Fungsi SQL `bv2_auth_tenant_id()`, `bv2_auth_role()`, `bv2_auth_branch_id()`, dan `bv2_is_admin()` memastikan evaluasi hak akses dilakukan langsung di PostgreSQL menggunakan `auth.uid()` sehingga tidak dapat dimanipulasi dari sisi klien.

---

## 4. Alur Operasional Utama Aplikasi

### 4.1 Alur Harian Gudang & Bar (*EOD Daily Inventory*)
```
[Opening Stok] + [IN Otomatis (Purchasing/Transfer) + Manual Delta]
      │
      ├──► Input [OUT Aktual] (Pemakaian operasional)
      ├──► Input [BROKEN]     (Sisa terbuka/tertimbang dalam gr/ml/pcs)
      └──► Hitung [FULL]      (Saldo buku akhir dalam satuan kemasan)
             │
             ▼
     Tutup & Lock EOD ──► Posting Transaksi Idempoten ──► Bandingkan dengan POS ESB
```

### 4.2 Alur Olah Bahan (*SimplePrep / Trimming*)
1. **Tahap 1 — Pengambilan Bahan Mentah (*Gross Weight*)**: Mencatat bahan mentah yang diambil beserta konversi ke satuan master.
2. **Tahap 2 — Hasil Bersih & Ampas (*Edible Portion*)**: Mencatat *yield* bersih dan berat ampas, lalu otomatis memperbarui HPP (`price`, `new_price`, `avg_cost`) bahan hasil olahan (`is_prep_output = true`) agar siap digunakan dalam resep menu.

### 4.3 Alur Mutasi Stok Antar Cabang (v11)
```
Cabang Pengirim / Central                   Cabang Penerima
─────────────────────────                   ───────────────
Pilih Bahan & Kuantitas                     Terima Notifikasi Mutasi (DISPATCHED)
         │                                           │
         ▼                                           ▼
dispatchInterBranchShipment()               receiveInterBranchShipment()
• Status = DISPATCHED                       • Verifikasi qty diterima per item
• Potong stok & catat TX OUT                • Buat item otomatis jika belum ada di katalog tujuan
                                            • Tambah stok & catat TX IN (Status = RECEIVED)
```

---

## 5. Urutan Migrasi SQL Database (`supabase/migrations/`)

Jalankan secara berurutan pada Supabase SQL Editor saat melakukan provisioning database baru atau staging:

1. `20260918000000_barventis_v2_core.sql` — Skema inti V2 (*tenants, users, branches, materials, recipes, transactions*).
2. `20260920000000_atomic_approvals.sql` — Mekanisme persetujuan atomik.
3. `20260924000000_upgrade_modules.sql` — Modul tambahan (*FEFO, adjustment, maintenance, par-stock, menu engineering*).
4. `20260925000000_wbs_f1_triggers_storage.sql` — Trigger inventori & policy storage bukti foto.
5. `20261007000000_v2_atomic_cogs.sql` & `20261007000001_missing_rpcs.sql` — RPC kalkulasi COGS & fungsi pembantu.
6. `20261014000000_phase3_fefo_batches.sql` — Pelacakan lot kedaluwarsa 3-warna.
7. `20261016000000` s.d. `20261016000002` — Penambahan `shelf_life_days`, perbaikan cast enum waste, & `adjust_material_stock`.
8. `20261020000000_daily_inventory_cost_control_v3.sql` — Konsolidasi Daily Inventory & Cost Control v3.
9. `20261021000000_daily_inventory_broken_fefo_v4.sql` — Mode *FULL inferred / BROKEN weighed* & lot kontrol v4.
10. `20261022000000_daily_inventory_manual_in_no_production_v5.sql` — Dukungan manual IN EOD & penyederhanaan produksi.
11. `20261023000000_daily_inventory_in_input_fix_v6.sql` — Perbaikan jalur input IN & kalkulasi FULL v6.
12. `20261024000000_daily_inventory_broken_from_waste_v7.sql` — RPC `save_daily_inventory_broken_counts_v7`.
13. `20261112000000_inventory_two_tier_conversion_pos_compare_v9.sql` — Konversi 2-satuan, `monthly_quota_qty`, `is_prep_output`, & POS compare v9.
14. `20261113000000_fix_terpakai_qty_generated_column_v10.sql` — Konversi kolom generated `terpakai_qty` & trigger v10.
15. `20261114000000_multi_branch_full_support_v11.sql` — Skema multi-cabang v11, backfill cabang utama, `clone_branch_data`, & `get_owner_multi_branch_summary`.
16. `20261115000000_strict_branch_isolation_v12.sql` — Constraint `NOT NULL`, indeks unik cabang, trigger integritas, RLS ketat 37+ tabel, & hardening RPC stok.
