# CLAUDE.md — Barventis (Daily Inventory & Cost Control)

Dokumen panduan arsitektur, domain bisnis, dan aturan teknis Barventis berbasis dokumentasi Obsidian Vault.

---

## 1. Domain Bisnis & Filosofi Sistem

**Barventis** adalah sistem **Daily Inventory & Cost Control** terintegrasi khusus industri F&B (Restoran, Bar, Lounge, Kafe), dibangun dari digitalisasi 13 lembar kerja operasional (`SO BARISTA AGUSTUS 2026.xlsx` - Umatis Resto & Venue BSD).

### Segitiga Logistik Operasional:
1. **Bar / Resto (Layanan Depan):** Meja racik, speed rail, chiller undercounter. Transaksi harian, input closing EOD (End of Day).
2. **Central Warehouse (Gudang Buffer):** Penyimpanan stok kartonan/bulk, penerimaan purchasing grosir, transfer ke Resto.
3. **Purchasing & Cost Control:** Pengadaan bahan (daily marketlist vs PO grosir), audit HPP / COGS, kontrol rasio waste & variansi fisik vs POS.

### Prinsip Utama Inventory & Costing:
- **FULL / BROKEN Closing:** Kemasan utuh (`FULL`) dihitung sistem, kemasan terbuka (`BROKEN`) ditimbang/diukur aktual dalam satuan dasar (gram/ml).
- **Saldo Awal Warisan (Inherited Opening):** Opening hari $T$ adalah Closing sah hari $T-1$.
- **FEFO (First Expired, First Out):** Tracking multi-expiry lot dengan maksimal 1 lot aktif per bahan per lokasi.
- **Deduct POS vs Fisik:** Penjualan POS (ESB) memotong stok teoretis via Recipe Matching; Daily Inventory mencatat pemakaian fisik aktual (`OUT`). Gap keduanya = variansi/waste.

---

## 2. Struktur Proyek & Tech Stack

- **Frontend:** React 19 + Vite 8 + Tailwind CSS v4 + Framer Motion
- **Icons:** lucide-react
- **Backend/DB:** Express Node.js (`server.ts`) + PostgreSQL / Supabase
- **Exporting:** jsPDF (`jspdf-autotable`), XLSX (`xlsx`), JSZip
- **Testing:** Vitest + Testing Library + pg-mem

### Direktori Kunci (`src/`):
```
src/
├── pages/
│   ├── shared/
│   │   ├── DailyInventory.jsx      # Closing fisik harian (FULL/BROKEN)
│   │   ├── StockLedger.jsx         # Master data bahan baku & kartu stok
│   │   ├── Recipes.jsx             # Recipe builder & kalkulasi HPP / COGS
│   │   ├── CostControl.jsx         # Laporan cost control & margin
│   │   ├── PosUpload.jsx           # Upload & parsing laporan penjualan POS
│   │   ├── UsageRecap.jsx          # Rekapitulasi pemakaian bahan harian
│   │   ├── GoodsReceiptNote.jsx    # Penerimaan barang belanjaan
│   │   └── InterBranchTransfer.jsx # Transfer stok Central <-> Resto
│   ├── pos/                        # PosTerminal & sinkronisasi kasir
│   └── landing/                    # Halaman landing & pricing
├── components/
│   ├── AppLayout.jsx               # Layout utama, sidebar, floating nav
│   ├── Onboarding.jsx              # Setup awal interaktif tenant baru
│   └── GuidebookModal.jsx          # Modal panduan alur kerja 4-langkah
└── services/
    ├── api.js                      # Central client API
    ├── costUtils.js                # Helper kalkulasi HPP & unit conversion
    ├── dailyInventoryMath.js       # Logika matematika Full/Broken/Opening
    └── varianceCalculator.js       # Kalkulasi selisih fisik vs teoretis
```

---

## 3. Alur Pengenalan Pengguna (Tutorial & Onboarding)

Sistem sudah memiliki 2 modul panduan bawaan:
1. **`Onboarding.jsx` (Setup Awal Tenant Baru):**
   - Step 1: Input Bahan Baku Pertama (`StockLedger`)
   - Step 2: Buat Resep & Hitung HPP (`Recipes`)
   - Step 3: Sinkronisasi Data POS (`PosUpload`)
2. **`GuidebookModal.jsx` (Buku Panduan 4 Langkah Terintegrasi):**
   - Data Master & Resep $\rightarrow$ Belanja & Transfer $\rightarrow$ Closing Harian $\rightarrow$ Laporan Cost Control.
   - Dapat diakses kapan saja dari tombol panduan/header.

---

## 4. Konvensi Rekayasa & Aturan Teknis

1. **YAGNI & Zero Slop:** Jangan menambah dependensi berat (seperti video engine / remotion) jika platform native atau komponen internal sudah mampu menyelesaikannya.
2. **Konsistensi Satuan & HPP:** Perubahan kuantitas atau konversi satuan (pack $\rightarrow$ base unit) wajib melewati validasi `costUtils.js` dan `dailyInventoryMath.js`.
3. **Preservasi State:** Input closing harian dan auto-save draft tidak boleh hilang saat filter atau pagination berganti.
4. **Verifikasi:** Setiap perubahan fungsional wajib lolos uji vitest (`npm test`).
