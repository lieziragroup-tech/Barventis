# Blueprint & WBS: Migrasi Data Riil Umatis BSD & Kasuna Menara Astra ke Barventis ERP

**Author**: Ayling (Lead Autonomous Orchestrator) & Izumi (Architect) / Rafi  
**Status**: DRAFT BLUEPRINT & WBS (Menunggu Approval Rafi Sebelum Eksekusi Script)  
**Sumber Data (Single Source of Truth)**:
1. `Data Source/SO BARISTA AGUSTUS 2026 (1).xlsx` (Umatis Resto & Venue BSD)
2. `Data Source/SO BARISTA AGUSTUS KASUNA.xlsx` (Kasuna by Umatis, Menara Astra)
3. `Data Source/Daily Sales Menu Report_Umatis_Agustus_minuman.xlsx` (ESB POS Umatis)
4. `Data Source/Daily Sales Menu Report_KASUNA_MINUMAN.xlsx` (ESB POS Kasuna)

---

## 1. Arsitektur Multi-Tenant & Cabang (Entity Architecture)

```mermaid
graph TD
    Tenant[Tenant PT Asta Boga Nusantara] --> Branch1[Cabang 1: UMATIS RESTO & VENUE BSD]
    Tenant --> Branch2[Cabang 2: KASUNA by Umatis Menara Astra]

    Branch1 --> Loc1A[Lokasi: RESTO BSD]
    Branch1 --> Loc1B[Lokasi: CENTRAL BSD]

    Branch2 --> Loc2A[Lokasi: RESTO KASUNA]
    Branch2 --> Loc2B[Lokasi: CENTRAL KASUNA]

    subgraph Data Induk Bersama
        Materials[Master Bahan Baku & Satuan]
        Recipes[Master Resep & BOM Minuman]
        Suppliers[Master Supplier & Kontak]
    end

    Data Induk Bersama -.-> Branch1
    Data Induk Bersama -.-> Branch2
```

---

## 2. Work Breakdown Structure (WBS) Migrasi

### WBS 1.0 — Pra-Migrasi & Master Data Pendaftaran
- **1.1 Verifikasi Tenant & Cabang**:
  - Pastikan tenant resmi (`PT Asta Boga Nusantara`) aktif di tabel `public.tenants`.
  - Daftarkan 2 cabang resmi di tabel `public.branches`:
    - `BSD` $\rightarrow$ Umatis Resto & Venue BSD (`is_central: true`)
    - `ASTRA` $\rightarrow$ Kasuna by Umatis (`is_central: false`)
- **1.2 Ekstraksi & Normalisasi Master Bahan Baku (`materials`)**:
  - Sumber: Sheet `MARKETLIST ` dari Umatis & Kasuna.
  - Normalisasi nama bahan (eliminasi duplikasi penulisan seperti `Sirup Vanilla` vs `Syrup Vanilla Monin`).
  - Penetapan satuan dasar (`unit`: `ml`, `gr`, `pcs`) dan ukuran kemasan (`pack_size`, `content_unit`).
  - Klasifikasi kategori resmi: `Syrup & Puree`, `Dairy & Milk`, `Coffee & Tea`, `Fruit & Fresh`, `Powder`, `RTD Beer`, `Packaging`.
- **1.3 Ekstraksi Master Supplier (`suppliers`)**:
  - Sumber: Kolom `SUPPLIER` di sheet `MARKETLIST ` dan sheet `Pembelian Harian`.
  - Pendaftaran vendor (Monin, Toffin, Greenfields, dll).

### WBS 2.0 — Resep, BOM & Harga Menu Kasir
- **2.1 Ekstraksi Master Menu Kasir POS**:
  - Sumber: Sheet `MENU PRICING` & ekspor ESB POS (`Daily Sales Menu Report`).
  - Sinkronisasi kode menu kasir (*PLU*) dan harga jual per varian (`Hot`, `Ice`, `Large`).
- **2.2 Ekstraksi Bill of Materials (BOM Resep)**:
  - Sumber: Sheet `COGS All Beverage ` & `seed_rtd_beer_recipes.cjs`.
  - Hubungkan menu ke bahan baku dengan gramasi/ml riil.
  - Formula perhitungan HPP otomatis:
    $$\text{COGS Menu} = \sum (\text{Qty Bahan} \times \text{Harga Satuan}) + \text{Fix Cost 5\%}$$

### WBS 3.0 — Saldo Awal Fisik (Opening Balance Resto & Central)
- **3.1 Saldo Awal Umatis BSD (Periode 1 Agustus 2026)**:
  - Sensus Meja Bar: Sheet `STOCK OPNAME RESTO` $\rightarrow$ `materials.qty_resto`.
  - Sensus Gudang Pusat: Sheet `STOCK OPNAME CENTRAL` $\rightarrow$ `materials.qty_central`.
  - Pembuatan batch saldo awal di `material_batches` untuk alur FEFO.
- **3.2 Saldo Awal Kasuna Astra (Periode 1 Agustus 2026)**:
  - Ekstraksi stok awal dari file `SO BARISTA AGUSTUS KASUNA.xlsx`.
  - Alokasi stok kerja Kasuna.

### WBS 4.0 — Transaksi Pembelian & Penerimaan Barang
- **4.1 Faktur Pembelian Pasar Harian & Grosir Bulanan**:
  - Sumber: Sheet `Pembelian Harian` (550 baris transaksi belanja).
  - Pemasukan data ke tabel `purchase_entries` & pembuatan dokumen `invoices`.
  - Pembaruan harga beli rata-rata tertimbang (*Weighted Average Cost / WAC*):
    $$\text{WAC Baru} = \frac{(\text{Stok Lama} \times \text{WAC Lama}) + (\text{Qty Beli} \times \text{Harga Beli})}{\text{Stok Lama} + \text{Qty Beli}}$$

### WBS 5.0 — Integrasi Penjualan POS ESB & Pemotongan Stok
- **5.1 Impor Penjualan Agustus 2026**:
  - Umatis: 5.970 transaksi minuman (Omset Rp 148.255.000).
  - Kasuna: Seluruh data penjualan kasir dari `Daily Sales Menu Report_KASUNA_MINUMAN.xlsx`.
  - Injeksi ke `pos_transactions` dan pencatatan ringkasan omset harian di `transactions`.
- **5.2 Deduksi Stok Teoretis**:
  - Pembuatan rekaman pemotongan stok bahan baku di `expected_usage`.

### WBS 6.0 — Sesi Harian EOD & Rekonsiliasi Cost Control Akhir
- **6.1 Rekonstruksi Daily Inventory 1–31 Agustus 2026**:
  - Konversi data Sheet 5 & Sheet 6 (`Daily Iventory Bahan ` & `Daily Iventory Beer`) ke tabel `daily_inventories` dan `daily_inventory_items`.
- **6.2 Verifikasi Dashboard Cost Control**:
  - Pencocokan angka HPP Akhir: Pastikan rasio *Beverage Cost* Agustus tepat di angka **22,56%** sesuai data forensik bisnis.

---

## 3. Matriks Pencegahan Risiko & Keamanan Data (Guards)

1. **Prinsip Zero-Data Overwrite**:
   - Seluruh script migrasi menggunakan `ON CONFLICT (tenant_id, ...) DO NOTHING` atau `DO UPDATE` yang terukur, tanpa operasi `TRUNCATE CASCADE` yang merusak tabel lain.
2. **Uji Validasi Staging Terlebih Dahulu**:
   - Semua script SQL dieksekusi dengan sintaks `DO $$ BEGIN ... EXCEPTION ... END $$;` agar rollback otomatis jika terjadi inkonsistensi foreign key.
3. **Kontrol Commit**:
   - Setiap hasil migrasi akan diverifikasi dengan test query mandiri dan dilaporkan ke Rafi sebelum perubahan dicatat ke Git.
