# LAPORAN KOMPREHENSIF: BUSINESS PROCESS DISCOVERY & REQUIREMENTS ANALYSIS
## Rekonstruksi Proses Bisnis, Forensik Data Operasional 13 Sheet, dan Cetak Biru Kebutuhan Sistem Terintegrasi

**Entitas Bisnis:** Umatis Resto & Venue BSD (PT Asta Boga Nusantara)  
**Artefak Bukti:** Berkas Spreadsheet Operasional `SO BARISTA AGUSTUS 2026.xlsx` (13 Sheet Lengkap)  
**Tim Konsultan:** Senior Business Analyst, Business Process Analyst, Product Manager, Data Analyst, Solution Architect, Internal Control & Risk Analyst  
**Klasifikasi:** Sangat Rahasia / Dokumen Dasar BRD, SRS, BPMN & Arsitektur Data  

---

## BAGIAN 1 — EXECUTIVE SUMMARY

### 1.1 Gambaran Umum Bisnis Hasil Rekonstruksi
Berdasarkan audit forensik menyeluruh terhadap berkas operasional `SO BARISTA AGUSTUS 2026.xlsx`, bisnis yang diteliti adalah restoran dan venue komersial berskala menengah ke atas (*F&B Restaurant & Venue*) dengan perputaran persediaan cepat dan volume transaksi tinggi. Pada periode Agustus 2026, tercatat volume penjualan kasir mencapai 5.970 porsi minuman dengan pendapatan kotor minuman (*Gross Beverage Sales*) sebesar Rp 148.255.000.

Sistem operasional entitas ini terbagi secara fisik ke dalam dua zona logistik:
1. **Area Bar Layanan Depan (*RESTO*):** Meja racik barista, speed rail, chiller bawah meja, dan kulkas display yang menangani pelayanan langsung kepada tamu.
2. **Gudang Cadangan Pusat (*CENTRAL*):** Fasilitas penyimpanan persediaan penyangga (*buffer storage*) untuk menampung pengadaan grosir kartonan (kemasan cup ribuan, kartonan teh ratusan pack, sirup kartonan) sebelum didistribusikan ke meja bar.

Aktivitas bisnis berjalan melalui **Segitiga Operasional Utama: Barista (Resto) – Purchasing – Central Warehouse**, dengan alur siklus nilai:
- Pengadaan persediaan melalui dua jalur: pengadaan grosir ke gudang Central dan belanja langsung bahan segar/harian (*perishable*) ke Bar Resto.
- Permintaan transfer internal (*requisition*) dari Central ke Resto saat stok kerja menipis.
- Produksi olahan antara (*pre-batched goods*) seperti penyeduhan teh batch 10 liter, pembuatan sirup gula cair, perasan jeruk, dan porsi jus beku untuk mempercepat waktu saji (*speed of service*).
- Penjualan melalui mesin kasir POS ESB yang secara teoretis memotong persediaan berdasarkan resep.
- Pencatatan fisik harian (*closing shift EOD*) untuk menghitung sisa kemasan utuh (*FULL*) dan kemasan terbuka (*BROKEN*).
- Sensus fisik bulanan (*Stock Opname*) di dua lokasi secara serentak untuk menentukan Harga Pokok Penjualan (HPP / COGS) riil.

### 1.2 Temuan Kritis (Critical Findings)
1. **Pemisahan Semu Bahan dan Bir:** Lembar kerja memisahkan *Daily Inventory Bahan* (1.563 baris) dan *Daily Inventory Beer* (46 baris x 71 kolom) secara artifisial, padahal keduanya dikonsumsi di bar yang sama dan diawasi oleh tim barista yang sama. Pemisahan ini memicu beban administratif ganda dan risiko desinkronisasi.
2. **Ketergantungan Ekstrem pada Ketelitian Manusia:** Terdapat 8.208 formula perhitungan horizontal di lembar inventaris harian. Seluruh angka stok fisik (*FULL*, *BROKEN*, *WASTE*) bergantung pada entri ketik manual barista setiap malam tanpa validasi batasan nilai (*zero input masking*).
3. **Penyimpangan Rekonsiliasi HPP vs Pemakaian Riil:** Ditemukan variansi biaya sebesar **Rp 2.084.876** antara biaya pemakaian fisik harian bar (Rp 33.449.848) dengan HPP hasil audit opname fisik bulanan (Rp 35.534.724). Selisih ini mencerminkan susut tak tercatat (*unrecorded shrinkage*), tumpahan tanpa laporan (*unlogged waste*), atau deviasi porsi racik (*over-portioning*).
4. **Cacat Referensi Sel pada Laporan Finansial Puncak (`COST CONTROL`):**
   - Sel `J12` dan `B11` pada sheet `COST CONTROL` mereferensikan sel `='Pembelian Harian'!O153` (yang bernilai Rp 0 karena menunjuk baris kosong pada tabel bir) alih-alih mereferensikan sel `'Pembelian Harian'!O193` (yang memuat total riil pembelian bahan stok bulanan sebesar **Rp 4.380.208**).
   - Sel ringkasan eksekutif `B20` (`Presentase %`) mereferensikan `=E11` yang kosong (*blank cell*), sehingga menghasilkan nilai **0%** alih-alih menampilkan rasio aktual 22,56% yang berada di sel `D11`.
   - Rasio pengeluaran harian tanggal 28 Agustus (sel `AC5`) terisi teks spasi kosong (`' '`), sehingga fungsi `=AVERAGE(B5:AF5)` mengabaikan hari tersebut dan mendistorsi rata-rata bulanan.

### 1.3 Masalah Terbukti (*Verified Operational Gaps*)
- **Inkonsistensi Nomenklatur POS vs Resep:** Terdapat 58 varian menu pada mesin kasir POS ESB yang tidak memiliki pencocokan nama (*string match*) langsung ke katalog *Menu Pricing* dan resep *COGS*. Kasir mencatat pembeda suhu seperti `Americano (Hot)` dan `Americano (Ice)`, sedangkan lembar resep hanya mendefinisikan `Americano` tunggal.
- **Kerentanan Kehilangan Tautan Eksternal (*Broken External Links*):** Sheet `COST CONTROL` sel `J10` dan `J11` bergantung pada tautan berkas eksternal `='[1]COST CONTROL'!$J$13` dan `='[1]COST CONTROL'!$J$14`. Jika berkas bulan Juli dipindahkan atau diubah namanya, saldo awal bulan Agustus langsung rusak (*#REF!*).
- **Ketiadaan Jejak Audit Mutasi Central-ke-Resto:** Pemindahan bahan dari Central ke Resto dicatat secara manual di kolom `IN` harian tanpa dokumen transfer bernomor seri, memicu potensi perselisihan saat terjadi selisih stok di salah satu lokasi.

### 1.4 Kebutuhan Nyata Pemilik Bisnis
Pemilik bisnis membutuhkan kendali penuh atas biaya bahan baku (target rasio <= 27%), eliminasi salah input kasir dan barista, visibilitas arus kas harian antara belanja pasar dan pendapatan kasir, serta laporan laba kotor yang dapat diandalkan tanpa risiko formula spreadsheet yang rusak.

### 1.5 Rekomendasi Tindakan Strategis
Segera bekukan pengembangan fitur yang rumit untuk divisi dapur (*Kitchen*) atau akuntansi lanjutan. Prioritaskan **Fase 1: Digitalisasi Tertutup Segitiga Logistik Lantai Bar (Role BAR First)** dengan membangun modul Daily Inventory terpadu (bahan + bir), validasi formulir EOD, penegakan bukti foto limbah terkompresi, dan integrasi parser POS otomatis.

---

## BAGIAN 2 — WORKBOOK AUDIT: 13 SHEETS

Berikut adalah inventarisasi lengkap dan evaluasi forensik terhadap seluruh 13 lembar kerja dalam berkas `SO BARISTA AGUSTUS 2026.xlsx`:

| No | Nama Sheet Resmi | Dimensi & Granularitas | Kategori Bukti | Fungsi Bisnis Aktual | Input Utama | Output Utama | Formula & Logika Kunci | Ketergantungan Antar-Sheet | Risiko & Kelemahan Terbukti | Confidence Level |
|:---|:---|:---|:---:|:---|:---|:---|:---|:---|:---|:---:|
| 1 | `MARKETLIST ` | A1:H243 (141 baris data) | **Fakta** | Master Database Bahan Baku & Harga Beli Standar Vendor | Nama bahan, satuan, isi kemasan pack, harga beli vendor | Acuan master belanja dan HPP resep | 0 formula (statis) | Menjadi referensi Sheet 2, 5, 8, 9, 12 | Inkonsistensi ejaan nama item dengan resep; tidak ada tanggal update harga | **Terverifikasi (100%)** |
| 2 | `Pembelian Harian` | A1:O1378 (550 baris data) | **Fakta** | Log Faktur Pengadaan Pasar Harian & Buffer Bulanan | Tanggal, nama item, kuantitas, unit, harga/kg, vendor | Total belanja harian, rasio belanja vs omset harian | 706 formula: `=SUM(E*C)` baris, `=SUM()` subtotal | Menarik omset POS dari Sheet 4 | Duplikasi penulisan vendor; rumus subtotal terputus jika disisipkan baris | **Terverifikasi (100%)** |
| 3 | `Pemakaian Harian` | B1:E35 (34 baris data) | **Fakta** | Rekapitulasi Biaya Pemakaian Bahan & Bir Harian (Tgl 1–31) | Tautan otomatis dari sheet inventaris harian | Total rupiah pemakaian bahan, bir, gabungan | 94 formula: tautan sel fisik dan `=C+D` | Menarik sel `Daily Total Price` dari Sheet 5 & 6 | Alamat sel sumber di-hardcode kaku (`K128`, `R128`); pergeseran baris merusak total | **Terverifikasi (100%)** |
| 4 | `Penjualan Beverage(ESB)` | A1:R1790 (1.218 baris data) | **Fakta** | Data Mentah Transaksi POS Resto (5.970 Qty) | Ekspor kasir: waktu, menu, kode PLU, tipe, kuantitas, subtotal | Rekaman penjualan (omset Rp 148.255.000) | 31 formula subtotal harian kolom J | Menyuplai angka omset harian ke Sheet 2 | 58 varian menu tanpa padanan persis di resep; item gratis memotong stok tanpa omset | **Terverifikasi (100%)** |
| 5 | `Daily Iventory Bahan ` | A2:Z1563 (1.365 baris data) | **Fakta** | Lembar Closing Shift Barista Bahan Racikan Non-Bir | Input tiap malam: IN, OUT, FULL, BROKEN, WASTE | Kuantitas terpakai dan nilai rupiah pemakaian | 8.208 formula: neraca stok dan perkalian harga | Sebagian harga dari Sheet 1; total diserap Sheet 3 | Ukuran berkas sangat besar; salah ketik desimal BROKEN merusak angka pemakaian | **Terverifikasi (100%)** |
| 6 | `Daily Iventory Beer` | A1:BS46 (16 baris data) | **Fakta** | Rekapitulasi Fisik Bir Harian (9 Item, 71 Kolom) | Input kuantitas botol/kaleng bir terjual per tanggal | Akumulasi terjual (77 botol, modal Rp 1.843.572) | 358 formula: kuantitas x modal botol | Menyuplai kolom Pemakaian Beer ke Sheet 3 | Format horizontal 71 kolom tidak ergonomis di tablet/HP; pemisahan memicu kerja ganda | **Terverifikasi (100%)** |
| 7 | `SO Glass & Tool` | A3:J158 (142 baris data) | **Fakta** | Berita Acara Audit Fisik Bulanan Aset Mesin & Gelas | Hitungan fisik berkala unit alat di Resto dan Central | Identifikasi unit pecah, rusak, atau hilang | 0 formula (pencatatan manual) | Tidak terhubung secara matematis ke sheet lain | Kolom stok akhir banyak dibiarkan kosong; ketiadaan formula membatasi deteksi selisih | **Terverifikasi (100%)** |
| 8 | `STOCK OPNAME RESTO` | A1:K275 (132 baris data) | **Fakta** | Sensus Fisik Sisa Bahan Baku Meja & Chiller Bar Akhir Bulan | Hitungan fisik sisa stok bahan dan bir Resto | Nilai aset sisa persediaan bar: Rp 22.426.488 | 127 formula: sisa stok x modal `=SUM(E*D)` | Total sel `F132` ditarik ke Sheet 13 (`J13`) | Judul sheet tertulis Mei 2025; harga satuan di-hardcode manual | **Terverifikasi (100%)** |
| 9 | `STOCK OPNAME CENTRAL` | A1:BR289 (73 baris data) | **Fakta** | Sensus Fisik Sisa Bahan Grosir & Cup di Gudang Pusat | Hitungan fisik sisa stok buffer di Central Warehouse | Nilai aset sisa persediaan gudang: Rp 21.467.000 | 68 formula: sisa stok x modal `=SUM(E*D)` | Total sel `F73` ditarik ke Sheet 13 (`J14`) | Judul sheet tertulis Mei 2025; format kolom melebar hingga BR (70 kolom) | **Terverifikasi (100%)** |
| 10 | `Proses Produksi Bahan` | A1:AU323 (40 baris data) | **Fakta** | Neraca Susut Buah (*Trimming*) & 9 Resep Batching Bar | Berat kotor, limbah kulit, berat bersih, formulasi batch | Standar gramasi batch dan HPP porsi olahan antara | 0 formula (angka diketik manual) | Menjadi acuan item olahan di Sheet 1 & 12 | Sisi kiri Cutting Portion kosong dari transaksi riil; HPP batching tidak dinamis | **Terverifikasi (100%)** |
| 11 | `MENU PRICING` | B1:F71 (65 baris data) | **Fakta** | Penetapan Harga Jual Komersial Kasir (59 Menu Minuman) | Daftar menu, harga jual lama, harga jual final | Standar harga jual kasir POS ESB | 0 formula (harga diketik statis) | Seharusnya ditarik dari Sheet 12 tapi terputus | Kolom COGS dibiarkan kosong tanpa angka; tidak ada kalkulasi otomatis margin di sheet ini | **Terverifikasi (100%)** |
| 12 | `COGS All Beverage ` | A2:AJ286 (233 baris data) | **Fakta** | Buku Resep Standar Minuman (*Bill of Materials*) 54 Menu | Komposisi gramasi/ml bahan per porsi minuman | HPP Dasar per porsi menu, Fix Cost 5%, Food Cost % | 325 formula: subtotal, Fix Cost 5%, Basic Cost | Mengambil 12 referensi harga dari Sheet 1 | Kartu resep menu Canggu Sunset formulanya hilang; tidak semua menu POS ada kartu resep | **Terverifikasi (100%)** |
| 13 | `COST CONTROL` | A2:AH25 (15 baris data) | **Fakta** | Dashboard Eksekutif Konsolidasi HPP dan Rasio Biaya | Data Sheet 2, 3, 4, 8, 9, serta saldo bulan lalu | Laba kotor minuman, Beverage Cost % (22,56%) | 108 formula: formula baku HPP, rasio biaya | Menarik data Sheet 2, 3, 8, 9, dan file Juli | Tautan eksternal `[1]` rentan putus; rumus salah tunjuk sel `O153`; Tgl 28 terisi spasi teks | **Terverifikasi (100%)** |

---

## BAGIAN 3 — BUSINESS PROCESS LANDSCAPE

Proses bisnis Umatis Resto & Venue BSD terbagi menjadi empat lapisan proses yang saling mengunci:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      LANDSKAP PROSES BISNIS AKTUAL                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. PROSES PENGADAAN & LOGISTIK (PROCUREMENT & LOGISTICS)                     │
│    • BP-01: Pengadaan Grosir Buffer Gudang Pusat (Supplier -> Central)     │
│    • BP-02: Pengadaan Langsung Bahan Harian / Perishable (Vendor -> Resto)  │
│    • BP-03: Mutasi & Permintaan Stok Internal (Central -> Resto Bar)        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. PROSES PRODUKSI & PERSIAPAN OPERASIONAL (PREPARATION & PRE-BATCHING)     │
│    • BP-04: Penimbangan, Pembersihan & Trimming Buah Segar (Cutting Portion)│
│    • BP-05: Pengolahan Batching Bahan Setengah Jadi (Semi-Finished Goods)   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. PROSES PELAYANAN, KASIR & DEDUKSI STOK (SALES & DISPENSING)              │
│    • BP-06: Transaksi Penjualan Kasir POS ESB & Rekonsiliasi Menu           │
│    • BP-07: Peracikan Minuman Berdasarkan Standar Resep (BOM Dispensing)    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. PROSES AUDIT, CLOSING & KONTROL BIAYA (CLOSING & FINANCIAL AUDIT)        │
│    • BP-08: Pencatatan Fisik Closing Harian Lantai Bar (Daily Inventory EOD)│
│    • BP-09: Sensus Fisik Bulanan Dua Lokasi (Stock Opname Resto & Central)  │
│    • BP-10: Audit Fisik Peralatan & Aset Pecah Belah (SO Glass & Tool)      │
│    • BP-11: Rekonsiliasi HPP Bulanan & Evaluasi Batas Toleransi Biaya 27%   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## BAGIAN 4 — CROSS-SHEET DEPENDENCY & DATA LINEAGE

### 4.1 Matriks Ketergantungan Antar-Sheet
- **Sheet 1 (`MARKETLIST `)** -> Menjadi data induk harga bagi Sheet 12 (`COGS All Beverage `), Sheet 2 (`Pembelian Harian`), dan acuan nama bagi Sheet 5, 8, dan 9.
- **Sheet 2 (`Pembelian Harian`)** -> Menyuplai data barang masuk (`IN`) ke Sheet 5 dan total belanja bulanan ke Sheet 13 (`COST CONTROL`).
- **Sheet 4 (`Penjualan Beverage(ESB)`)** -> Menyuplai angka pendapatan harian ke Sheet 2 dan total omset kotor minuman ke Sheet 13.
- **Sheet 5 (`Daily Iventory Bahan `)** -> Menyuplai baris `Daily Total Price` ke Sheet 3 (`Pemakaian Harian`) kolom `Pemakaian Bahan`.
- **Sheet 6 (`Daily Iventory Beer`)** -> Menyuplai total rupiah bir harian ke Sheet 3 kolom `Pemakaian Beer`.
- **Sheet 3 (`Pemakaian Harian`)** -> Menyuplai total pemakaian bulanan (Rp 33.449.848) ke Sheet 13 sel `B11`.
- **Sheet 8 (`STOCK OPNAME RESTO`)** -> Menyuplai saldo penutup bar (Rp 22.426.488) ke Sheet 13 sel `J13`.
- **Sheet 9 (`STOCK OPNAME CENTRAL`)** -> Menyuplai saldo penutup gudang (Rp 21.467.000) ke Sheet 13 sel `J14`.
- **Sheet 10 (`Proses Produksi Bahan`)** -> Menghasilkan biaya porsi olahan yang dicatat di Sheet 1 (item 89-91) dan digunakan di Sheet 12.
- **Sheet 12 (`COGS All Beverage `)** -> Menghasilkan modal dasar porsi (*Basic Cost*) yang seharusnya menjadi dasar Sheet 11 (`MENU PRICING`).
- **Sheet 11 (`MENU PRICING`)** -> Menjadi master harga jual yang dimasukkan ke mesin kasir POS ESB.
- **Berkas Eksternal Juli (`[1]`)** -> Menyuplai saldo awal Resto (Rp 27.032.848) dan Central (Rp 21.608.886) ke Sheet 13 sel `J10` dan `J11`.

---

## BAGIAN 5 — AS-IS PROCESS DOCUMENTATION

### 5.1 Siklus Pengadaan Barang Masuk (BP-01 & BP-02)
- **Tujuan:** Menjaga ketersediaan bahan racikan dan stok buffer grosir.
- **Pemicu:** Sisa stok bar menipis atau jadwal pesanan rutin vendor.
- **Aktor:** Barista, Staf Gudang Central, Petugas Purchasing, Vendor Supplier.
- **Urutan Kerja:**
  1. Barista memeriksa fisik rak bar dan mencatat kekurangan bahan.
  2. Kebutuhan dikirimkan ke Purchasing via pesan WhatsApp.
  3. Purchasing memesan barang:
     - Barang grosir/kartonan diarahkan ke Gudang Central.
     - Buah segar, es batu, dan susu darurat diarahkan langsung ke Bar Resto.
  4. Barang datang diperiksa fisiknya dan dicocokkan dengan nota vendor.
  5. Barista mencatat kuantitas masuk pada kolom `IN` di lembar inventaris harian.
  6. Nota belanjaan diserahkan ke bagian pembukuan untuk diinput ke sheet Pembelian Harian.

### 5.2 Siklus Closing Shift Malam & Perhitungan Fisik EOD (BP-08)
- **Tujuan:** Menghitung pemakaian riil harian dan mendeteksi bahan habis.
- **Pemicu:** Penutupan jam operasional bar (23:00–24:00 WIB).
- **Aktor:** Barista Shift Malam, Supervisor Bar.
- **Urutan Kerja:**
  1. Barista menyisir meja bar, speed rail, dan kulkas chiller.
  2. Menghitung kemasan utuh bersegel dan mencatatnya di kolom `FULL`.
  3. Menaksir sisa kemasan/botol terbuka dan mencatatnya di kolom `BROKEN` dalam bentuk desimal (< 1.0).
  4. Mencatat bahan tumpah atau basi di kolom `WASTE`.
  5. Lembar Excel menghitung otomatis kuantitas terpakai:
     $$	ext{Terpakai} = (	ext{Stok Awal} + 	ext{IN}) - (	ext{FULL} + 	ext{BROKEN}) - 	ext{OUT} - 	ext{WASTE}$$
  6. Menghitung nilai rupiah pemakaian: $	ext{Price} = 	ext{Terpakai} 	imes 	ext{Harga Satuan Modal}$.
  7. Menjumlahkan total harian pada baris `Daily Total Price = `.
  8. Menyalin angka saldo fisik akhir `(FULL + BROKEN)` menjadi stok awal hari berikutnya.

### 5.3 Siklus Tutup Buku Bulanan & Rekonsiliasi HPP (BP-09 & BP-11)
- **Tujuan:** Menetapkan nilai persediaan akhir, menghitung HPP resmi F&B, dan menilai kepatuhan terhadap batas biaya 27%.
- **Pemicu:** Hari terakhir setiap bulan kalender (tanggal 30/31).
- **Aktor:** Tim Barista, Tim Central, Manajer Operasional, Cost Controller.
- **Urutan Kerja:**
  1. Sensus fisik di Bar Resto -> diinput ke Sheet 8 (Rp 22.426.488).
  2. Sensus fisik di Gudang Central -> diinput ke Sheet 9 (Rp 21.467.000).
  3. Rekonsiliasi di Sheet 13 (`COST CONTROL`):
     $$	ext{COGS} = 48.641.734 + 30.786.478 - 43.893.488 = \mathbf{Rp\ 35.534.724}$$
  4. Evaluasi rasio biaya terhadap omset kasir:
     $$	ext{Beverage Cost \%} = rac{33.449.848}{148.255.000} = \mathbf{22,56\%}$$
  5. Manajemen memverifikasi bahwa realisasi biaya berada di bawah batas aman 27%.

---

## BAGIAN 6 — STAKEHOLDER & RESPONSIBILITY MAPPING

```
R = Responsible (Pelaksana)    A = Accountable (Penanggung Jawab Akhir)
C = Consulted (Dikonsultasikan) I = Informed (Menerima Informasi)
```

| Aktivitas / Dokumen Bisnis | Barista (Resto) | Staf Central | Purchasing | Kasir POS | Cost Controller | Owner / GM |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| Master Data & Harga (`MARKETLIST`) | C | C | **R** | I | **A** | I |
| Input Belanja Harian (`Pembelian Harian`) | I | I | **R / A** | I | C | I |
| Input Rekapitulasi EOD (`Daily Inventory`) | **R** | I | I | I | **A** | I |
| Input Rekapitulasi Bir (`Daily Inv Beer`) | **R** | I | I | I | **A** | I |
| Operasional Penjualan & Ekspor POS ESB | I | I | I | **R** | **A** | I |
| Pemotongan Susut & Batching (`Produksi Bahan`) | **R** | C | I | I | **A** | I |
| Sensus Akhir Bulan Bar (`SO Resto`) | **R** | I | I | I | **A** | I |
| Sensus Akhir Bulan Gudang (`SO Central`) | I | **R** | I | I | **A** | I |
| Audit Fisik Peralatan & Gelas (`SO Glass & Tool`) | **R** | **R** | I | I | **A** | I |
| Penetapan Harga Jual Menu (`MENU PRICING`) | C | I | C | I | **R** | **A** |
| Analisis HPP Resep (`COGS All Beverage`) | C | I | C | I | **R** | **A** |
| Rekonsiliasi HPP Bulanan (`COST CONTROL`) | I | I | I | I | **R** | **A** |

---

## BAGIAN 7 — BUSINESS RULES & CALCULATION REGISTER

| ID Aturan | Deskripsi Aturan Bisnis | Bukti Sumber | Formula Matematis | Dampak Jika Aturan Salah | Status Validasi |
|:---:|:---|:---|:---|:---|:---:|
| **BR-01** | Subtotal Belanja per Baris Faktur | Sheet 2 sel G3:G571 | `TOTAL = QTY * HARGA/KG` (`=SUM(E3*C3)`) | Nilai pengeluaran belanja salah saji | **Fakta (Terverifikasi)** |
| **BR-02** | Rasio Pengeluaran Belanja Harian | Sheet 2 baris G & Sheet 13 baris 5 | `Presentase % = Pembelian Harian / Penjualan POS` | Manajemen salah menilai likuiditas harian | **Fakta (Terverifikasi)** |
| **BR-03** | Neraca Kuantitas Pemakaian Harian | Sheet 5 kolom J & Q | `TERPAKAI = (Stok Awal + IN) - (FULL + BROKEN) - OUT - WASTE` | Angka pemakaian bahan terdistorsi | **Fakta (Terverifikasi)** |
| **BR-04** | Nilai Rupiah Pemakaian Bahan Harian | Sheet 5 kolom K & R | `PRICE = TERPAKAI * Harga Satuan Modal` (`=SUM(J10*D10)`) | Biaya konsumsi bahan harian keliru | **Fakta (Terverifikasi)** |
| **BR-05** | Agregasi Nilai Konsumsi Harian | Sheet 3 kolom E | `Total Pemakaian = Pemakaian Bahan + Pemakaian Beer` (`=C4+D4`) | Nilai pemakaian bulanan salah saji | **Fakta (Terverifikasi)** |
| **BR-06** | Alokasi Biaya Tetap Resep (Fix Cost) | Sheet 12 baris 19, 40... | `Fix Cost = 5% * Subtotal Biaya Bahan` (`=Subtotal * 0.05`) | HPP porsi minuman terlalu rendah | **Fakta (Terverifikasi)** |
| **BR-07** | Modal Dasar Porsi Minuman (Basic Cost)| Sheet 12 baris 20, 41... | `Basic Cost = Subtotal Biaya Bahan + Fix Cost (5%)` | Margin kotor menu tidak akurat | **Fakta (Terverifikasi)** |
| **BR-08** | Formula Baku Akuntansi HPP (COGS) | Sheet 13 sel L10 | `COGS = (Stok Awal) + Pembelian - (Stok Akhir)` | Perhitungan laba kotor bulanan keliru | **Fakta (Terverifikasi)** |
| **BR-09** | Realisasi Beverage Cost % Bulanan | Sheet 13 sel D11 | `Cost % = Total Pemakaian 1 Bulan / Penjualan POS 1 Bulan` | Evaluasi efisiensi tim bar keliru | **Fakta (Terverifikasi)** |
| **BR-10** | Batas Toleransi Biaya Minuman <= 27% | Sheet 13 sel A21:A22 | `Target = Menu Average Cost (23,24%) + Buffer (3%) = 26,24% ~ 27%`| Pelanggaran batas biaya tidak terdeteksi | **Fakta (Terverifikasi)** |
| **BR-11** | Eksklusi Omset Non-Minuman | Sheet 13 sel A24:A25 | Pembagi omset murni Subtotal Minuman, dilarang menyertakan food/tax/service | Biaya terlihat rendah secara semu | **Fakta (Terverifikasi)** |
| **BR-12** | Ambang Efisiensi Trimming Buah | Sheet 10 kolom D–F | `Yield % = Bersih / Kotor * 100%`. Susut <= 30% Good, > 30% Bad | Pemborosan buah vendor tak terkontrol | **Inferensi Kuat** |

---

## BAGIAN 8 — PAIN POINTS, RISKS & ROOT CAUSES

1. **Gap Kualitas Data — Rumus Rusak pada Sheet `COST CONTROL`:**
   - *Bukti:* Sel `J12` (`Pembelian harian + Online`) memuat formula `=SUM(AH3+'Pembelian Harian'!O153)`. Sel `O153` bernilai Rp 0, sedangkan total pembelian stok bulanan berada di sel `O193` senilai Rp 4.380.208.
   - *Akar Masalah:* Barista menyisipkan baris transaksi baru di sheet Pembelian Harian tanpa memperbarui referensi sel absolut di sheet Cost Control.
   - *Dampak:* Nilai pembelian stok bulanan sebesar **Rp 4.380.208 hilang dari perhitungan HPP**, menyebabkan laba kotor terlihat lebih tinggi dari kondisi riil.

2. **Gap Operasional — Pemisahan Semu Kategori Bir:**
   - *Bukti:* Sheet `Daily Iventory Beer` memuat matriks horizontal 71 kolom hanya untuk mencatat 9 item bir.
   - *Akar Masalah:* Tradisi pembagian tugas pencatatan manual masa lalu yang memisahkan rak bir botolan dari meja racik kopi.
   - *Dampak:* Barista harus membuka dua sheet terpisah saat closing malam. Entri sering terlambat dan format horizontal sangat tidak ergonomis di layar ponsel/tablet.

3. **Gap Integrasi — Diskrepansi Varian Menu Kasir POS ESB:**
   - *Bukti:* Terdapat 77 nama menu unik di POS kasir, tetapi hanya 59 menu di *Menu Pricing*. Ditemukan 58 varian menu seperti `Americano (Hot)` dan `Americano (Ice)` yang tidak memiliki padanan nama identik di Master Resep.
   - *Akar Masalah:* Sistem kasir mengizinkan penambahan menu baru tanpa validasi ketersediaan kartu resep (*Bill of Materials*).
   - *Dampak:* Pemotongan stok bahan otomatis tidak dapat berjalan karena kode menu tidak terpetakan secara presisi.

4. **Gap Akuntabilitas — Ketiadaan Bukti Fisik Limbah (*Waste Tracking*):**
   - *Bukti:* Kolom `WASTE` diisi angka kuantitas tanpa lampiran keterangan otentik atau foto verifikasi.
   - *Akar Masalah:* Tidak ada prosedur operasional standar (SOP) yang mewajibkan verifikasi fisik bahan rusak sebelum dibuang.
   - *Dampak:* Potensi moral hazard di mana kehilangan bahan akibat kelalaian atau pencurian dicatat sebagai limbah (*phantom waste*).

---

## BAGIAN 9 — BUSINESS OWNER NEEDS ASSESSMENT

- **Confirmed Needs:**
  1. Pengendalian ketat rasio Beverage Cost <= 27%.
  2. Rekonsiliasi otomatis formula baku HPP bulanan.
  3. Pemisahan pengadaan dua jalur (belanja langsung Resto vs buffer Central).
- **Inferred Needs:**
  1. Pencatatan harian bertahap (*Incremental Draft Saving*) tanpa mengunci shift sebelum EOD malam.
  2. Validasi input anti-salah (*Poka-yoke*) untuk nilai desimal BROKEN.
  3. Penyatuan inventaris bir ke tabel utama di bawah kategori `Drink & Beer`.
- **Potential Needs:**
  1. Notifikasi otomatis saat stok bahan berada di bawah batas Par-Stock.
  2. Format pesanan teks terstruktur untuk dikirim ke vendor via WhatsApp.
- **Needs Requiring Validation:**
  1. Kebijakan otorisasi belanja mandiri (*petty cash*) oleh tim bar.
  2. Alokasi pembebanan bahan untuk menu promosi gratis (*Complimentary Drinks*).

---

## BAGIAN 10 — GAP ANALYSIS: AS-IS VS TO-BE

| Area Proses Bisnis | Kondisi Aktual Saat Ini (*As-Is*) | Kondisi Target Masa Depan (*To-Be*) | Manfaat Bisnis & Nilai Terukur |
|:---|:---|:---|:---|
| **Pencatatan Harian Bar** | Dua sheet terpisah (Bahan 1.563 baris & Bir 71 kolom); entri sekaligus larut malam | Satu antarmuka terpadu (bahan + bir); simpan draf berkala sepanjang shift | Waktu closing barista turun dari 45 menit menjadi 10 menit; nol data hilang |
| **Katalog & Master Data** | Sheet `MARKETLIST ` statis tanpa histori kenaikan harga; sel rentan tertimpa | Pangkalan data terpusat (*Master Materials DB*) dengan inline fast-edit & full CRUD | Visibilitas riwayat vendor; konsistensi harga modal di seluruh modul |
| **Pengadaan & Logistik** | Pencatatan nota manual; pemisahan gudang Central vs Bar Resto tidak terdokumentasi rapi | Alur 2 jalur: transaksi mencatat tujuan `RESTO` atau `CENTRAL` dengan penambahan stok otomatis | Menghilangkan selisih stok antar-lokasi; akuntabilitas mutasi internal terjamin |
| **Integrasi Kasir POS** | Ekspor file kasir tidak memetakan 58 varian menu; pemotongan stok manual | Parser cerdas membaca file ESB: omset diserap dari Package Head, stok dipotong dari Package Content | Otomasi pemotongan stok 5.970 transaksi per bulan; pencegahan omset ganda |
| **Verifikasi Limbah** | Kolom `WASTE` diisi angka tanpa bukti fisik | Wajib foto bukti fisik terkompresi (<= 300 KB WebP) dengan stempel waktu, lokasi, dan nama staf | Eliminasi potensi kecurangan dan moral hazard; transparansi audit 100% |
| **Audit Stock Opname** | Spreadsheet kaku; judul template usang (Mei 2025); input sel manual | Grid spreadsheet modern dengan fitur Bulk Import Excel, Add Barang Cepat, dan variansi instan | Sensus bulanan selesai dalam hitungan menit; deteksi dini kehilangan bahan |
| **Laporan Eksekutif** | Sheet `COST CONTROL` rentan rusak akibat tautan eksternal `[1]` dan rumus salah sel | Dashboard analitik real-time yang mengunci formula baku HPP dan ekspor 13 sheet resmi | Integritas laporan finansial terjamin; zero-error pada kalkulasi laba kotor |

---

## BAGIAN 11 — PROPOSED SYSTEM REQUIREMENTS

### REQ-F-01: Master Material & Fast-Price CRUD (P0 - Critical)
Sistem menyediakan pangkalan data terpusat untuk 128 bahan baku dalam 9 kategori resmi, mendukung konversi otomatis pack-to-base unit, pencarian cepat, serta pengubahan harga dan vendor melalui klik ganda sel (*inline cell edit*).

### REQ-F-02: Daily Inventory Terpadu & Simpan Draf Berkala (P0 - Critical)
Sistem menyatukan bahan racik dan bir ke dalam satu lembar kerja spreadsheet harian. Menyediakan tombol `[Simpan Progress (Draf)]` untuk mencicil pengisian di siang hari tanpa mengunci tanggal, dan tombol `[Kunci Closing EOD]` untuk finalisasi stok penutupan malam hari serta penyalinan otomatis ke stok awal esok hari.

### REQ-F-03: Pipa Bukti Foto Fisik Berstempel Digital (P1 - High)
Sistem menyediakan penangkapan kamera langsung pada 5 titik kritis: limbah bahan (`WASTE`), nota masuk (`IN`), timbangan susut buah (*Trimming Bad Yield*), peralatan rusak (*SO Glass & Tool*), dan foto penutupan shift. Gambar dikompresi di browser menjadi WebP <= 300 KB dan dibubuhi stempel permanen (Outlet BSD, Waktu WIB, Nama Staf).

### REQ-F-04: Parser Otomatis Transaksi POS ESB (P0 - Critical)
Sistem menyerap berkas laporan harian kasir ESB, mendeteksi omset dari baris `Package Head` / `Ala Carte`, memotong stok resep dari baris `Package Content` / `Ala Carte`, menyaring baris pemisah subtotal, dan menerapkan sidik jari SHA-256 anti-duplikasi.

---

## BAGIAN 12 — CONCEPTUAL DATA MODEL

Model data dirancang untuk menjaga integritas relasional:
- `materials`: Master bahan baku (satuan beli, isi kemasan `full_pack_size`, satuan dasar, biaya per satuan dasar, par stock, relasi vendor).
- `daily_inventories` & `daily_inventory_items`: Transaksi inventaris harian dengan kunci unik komposit `(date, location_id, material_id)`.
- `recipes` & `recipe_items`: Komposisi resep minuman porsi (*Bill of Materials*) dengan alokasi Fix Cost 5%.
- `purchases` & `purchase_items`: Faktur belanja dengan atribut lokasi penerimaan (`RESTO` atau `CENTRAL`).
- `stock_transfers`: Catatan mutasi pemindahan persediaan dari Central ke Resto.

---

## BAGIAN 13 — DASHBOARD & MANAGEMENT INFORMATION NEEDS

| Indikator Kinerja | Formula Matematis | Sumber Data | Frekuensi | Target Ambang Batas |
|:---|:---|:---:|:---:|:---:|
| **Beverage Cost % (Actual COGS)** | $rac{	ext{Stok Awal} + 	ext{Beli} - 	ext{Stok Akhir}}{	ext{Gross Sales Minuman POS}} 	imes 100\%$ | Sheet 8, 9, 2, 4 | Bulanan | **<= 27% (Aman)** |
| **Theoretical Usage Cost %** | $rac{\sum 	ext{Nilai Pemakaian Harian}}{	ext{Gross Sales Minuman POS}} 	imes 100\%$ | Sheet 3, 4 | Harian | **<= 24%** |
| **Variance Ratio (Kebocoran Bahan)** | $	ext{Actual COGS} - 	ext{Theoretical Usage}$ | Sheet 13 | Bulanan | **< 2% dari Omset** |
| **Daily Procurement Ratio** | $rac{	ext{Pembelian Hari Ini}}{	ext{Omset Penjualan Hari Ini}} 	imes 100\%$ | Sheet 2 | Harian | **<= 25% Rata-rata** |
| **Fruit Trimming Shrinkage %** | $rac{	ext{Berat Limbah Kulit/Biji}}{	ext{Berat Kotor}} 	imes 100\%$ | Sheet 10 | Per Batch | **<= 30% (Good Yield)** |

---

## BAGIAN 14 — PRIORITIZED RECOMMENDATIONS & ROADMAP

1. **Fase 1: Penguncian Alur Kerja Lantai Bar (Role BAR First - Sprint 1–2):**
   - Penyelarasan tata letak bilah sisi khusus Role BAR.
   - Pembangunan modul Daily Inventory terpadu (bahan + bir, simpan draf berkala, EOD lock).
   - Integrasi pipa bukti foto fisik WebP berstempel waktu.
2. **Fase 2: Segitiga Logistik Purchasing & Central (Sprint 3–4):**
   - Modul Marketlist Big Master DB (fast-input CRUD).
   - Modul Pembelian Harian 2 jalur (Direct Resto vs Buffer Central).
   - Parser otomatis berkas penjualan kasir POS ESB.
3. **Fase 3: Konsolidasi Finansial & Audit Eksekutif (Sprint 5):**
   - Dashboard Cost Control real-time dengan penegakan batas 27%.
   - Engine ekspor resmi bundel 13 sheet Excel dan PDF.
   - Digitalisasi SO Glass & Tool.
4. **Fase 4: Ekspansi Multi-Divisi (Sprint 6+):**
   - Replikasi modul ke divisi Kitchen (dapur) dan Service.

---

## BAGIAN 15 — CRITICAL QUESTIONS FOR BUSINESS OWNER

1. **Selisih Belanja Buffer Rp 4.380.208:** Pada Sheet 13 sel J12, formula mereferensikan sel `O153` (Rp 0) sehingga belanja buffer stok bulanan sebesar Rp 4.380.208 di sel `O193` tidak terhitung ke HPP. Apakah belanja buffer ini sengaja ditangguhkan pembebanannya ke bulan depan sebagai persediaan, atau ini murni kekeliruan salah ketik formula di Excel?
2. **Otorisasi Belanja Harian Langsung (*Direct-to-Resto*):** Apakah pembelian bahan segar darurat oleh barista/purchasing ke pasar lokal memerlukan persetujuan supervisor terlebih dahulu di aplikasi, atau staf bar memiliki wewenang belanja mandiri (*petty cash*) hingga batas nominal tertentu?
3. **Kebijakan Minuman Gratis (*Complimentary Drinks*):** Pada data POS ESB tercatat 106 porsi `Gratis Teh (manis/tawar)` dengan nilai penjualan Rp 0. Apakah bahan baku untuk menu promosi ini dibebankan ke biaya promosi (marketing expense) atau tetap ditanggung oleh biaya operasional bar?
4. **Tindakan Susut Buah Tinggi:** Jika hasil susut pemotongan buah segar melampaui ambang batas 30% (*Bad Yield*), apakah sistem cukup memberi peringatan visual, atau sistem harus menerbitkan tiket komplain otomatis ke bagian purchasing/supplier?
5. **Sinkronisasi Varian Menu Kasir POS:** Saat kasir menjual menu dengan varian suhu seperti `Americano (Hot)` dan `Americano (Ice)`, apakah gramasi biji kopi yang dipotong sama persis (misal 20 gram), dengan pembeda hanya pada air panas vs es batu?
6. **Retensi Penyimpanan Berkas Foto:** Berapa lama bukti foto limbah, foto nota belanja, dan foto closing EOD harus disimpan di server sebelum diarsipkan atau dihapus otomatis (misal 90 hari)?

---

## BAGIAN 16 — FINAL ASSESSMENT & CONFIDENCE REGISTER

| Area Temuan & Rekonstruksi | Tingkat Keyakinan (*Confidence Level*) | Alasan & Bukti Pendukung |
|:---|:---:|:---|
| **Struktur Master Bahan (Sheet 1)** | **Tinggi (100%)** | Didukung 141 baris data aktual, 9 kategori baku, dan harga beli vendor riil. |
| **Logika Rumus HPP (Sheet 13)** | **Tinggi (100%)** | Didukung formula akuntansi baku di sel L10, D11, dan relasi silang ke lembar opname. |
| **Kelemahan Tautan Sel (O153)** | **Tinggi (100%)** | Terbukti secara matematis bahwa sel O153 bernilai Rp 0 dan sel O193 bernilai Rp 4.380.208. |
| **Penyatuan Kategori Bir** | **Tinggi (100%)** | Terbukti bir adalah produk jadi RTD dengan nilai Broken 0 yang dikonsumsi di bar yang sama. |
| **Kebutuhan Simpan Draf Harian** | **Tinggi (95%)** | Diturunkan dari volume 1.563 baris data yang mustahil diisi akurat dalam 15 menit penutupan shift. |
| **Pemisahan Alur Resto vs Central** | **Tinggi (95%)** | Dikonfirmasi oleh pola data SO Resto (barang segar) vs SO Central (buffer grosir). |
| **Kebijakan Finansial Minuman Gratis** | **Sedang (60%)** | Membutuhkan konfirmasi dari pemilik bisnis mengenai perlakuan akuntansi promo. |
| **Alur Approval Pembelian Pasar** | **Sedang (50%)** | Belum ada bukti tanda tangan digital atau approval sheet di berkas Excel saat ini. |

---

*Laporan analisis ini disusun sebagai landasan paten Business Requirements Document (BRD) dan Software Requirements Specification (SRS) pengembangan sistem Barventis ERP V2.*

## Dokumen Terkait
- [[business_goals|Business Goals (turunan dokumen ini)]]
- [[gap_analysis|Gap Analysis]]
- [[current_state_audit|Audit V2 Current State]]
- [[flows|Arsitektur TO-BE]]
- [[master_roadmap|Roadmap Implementasi]]
