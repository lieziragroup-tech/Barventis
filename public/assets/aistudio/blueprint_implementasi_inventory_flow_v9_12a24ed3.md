# Blueprint & Implementasi 4 Konfirmasi Alur Inventory Barventis v2 (v9)

**Disusun oleh:** Ayling (System Architect & Project Manager) dan Izumi (Evidence & Consistency Auditor)

Dokumen ini merangkum implementasi teknis dari 4 keputusan operasional yang telah Anda konfirmasi untuk menyelaraskan alur inventory **Barventis v2** dengan operasional aktual Barista, Gudang Central, dan POS ESB.

## 1. Konfigurasi 2 Satuan Konversi (`Kemasan Botol/Pack/Carton/Kg` <-> `Isi dalam Gram/ML/Pcs`)

Sesuai arahan Anda (*"buat menjadi 2 conversion aja, bisa dalam bentuk botol / pck dan sebagainya tapi harus disertakan berapa dalam gram dalam pck dan sebagainya untuk konfigurasi"*), sistem kini menstandarkan seluruh bahan baku ke dalam **Arsitektur 2-Konversi**:

| Lapisan Konversi | Nama Field di Database | Fungsi Operasional | Contoh Konfigurasi |
| :--- | :--- | :--- | :--- |
| **Konversi 1: Satuan Kemasan / Stok** | `materials.unit` | Dipakai untuk stok gudang (`Resto` & `Central`), Pembelian Harian, Stock Opname, dan satuan utama di `Daily Inventory`. | `pck`, `btl`, `carton`, `kg`, `pcs`, `galon`, `kaleng`, `drigen` |
| **Konversi 2: Isi per 1 Kemasan (Takaran Resep)** | `materials.full_pack` | Menyimpan berapa `gr`, `ml`, atau `pcs` di dalam 1 kemasan dengan format baku `<kemasan> = <jumlah> <satuan_isi>`. Dipakai oleh Resep (`COGS All Beverage`) dan kalkulator HPP. | `pck = 1000 gr`<br>`btl = 750 ml`<br>`carton = 24 pcs`<br>`pcs = 600 ml` |

### Apa Saja yang Diimplementasikan:
* **Komponen `TwoTierConversionEditor.jsx`**: Menggantikan input teks bebas dengan 2 pilihan terstruktur:
  1. Dropdown **Satuan Kemasan / Stok Harian** (`Pack`, `Botol`, `Carton`, `Kilogram`, `Pcs`, `Galon`, `Kaleng`, `Jerigen`).
  2. Input angka **Isi per 1 Kemasan** beserta pilihan satuan dasarnya (`gr`, `ml`, `pcs`), yang otomatis menghitung **HPP per Gram/ML/Pcs** secara langsung.
* **Toggle Input 2-Satuan di `DailyInventory.jsx`**: Pada kolom `Pakai Manual (OUT)`, barista dapat mengetik pemakaian dalam **Satuan Kemasan (`pck` / `btl`)** maupun mengganti dropdown ke **Satuan Isi (`gr` / `ml`)** dan sistem otomatis mengonversinya ke saldo kemasan utuh (`Sisa Utuh`) dan `Stok Akhir` secara real-time.
* **Migrasi Otomatis Data Lama (`20261112000000_inventory_two_tier_conversion_pos_compare_v9.sql`)**: Otomatis memperbaiki bahan yang sebelumnya telanjur berlabel `unit = 'gr'` atau `'ml'` padahal memiliki harga per kemasan (`>= Rp 1.000`) dan ukuran `full_pack` (`1000 grm`, `750 ml`), menjadi `unit = 'pck'` / `'btl'` dengan `full_pack = 'pck = 1000 gr'` / `'btl = 750 ml'`.

## 2. Input Manual Barista di `Daily Inventory` + Rekonsiliasi Otomatis vs POS ESB

Sesuai arahan Anda (*"diinput manual oleh barista karena di Daily Inventory itu emang untuk manual dan nanti di compare sama yang di POS ESB apakah cocok atau tidak gitu"*):

* **Input `PAKAI (OUT)` Tetap 100% Manual oleh Barista**: Barista tetap mengisi jumlah pemakaian aktual harian di bar tanpa ditimpa oleh POS.
* **Kolom & Filter `Compare POS ESB` di `DailyInventory.jsx`**:
  * Sistem menarik data penjualan menu harian dari POS ESB (`get_daily_pos_theoretical_usage_v9`) dan menghitung pemakaian teoritis bahan berdasarkan resep, lalu mengonversinya ke satuan kemasan/stok bahan tersebut.
  * Di sebelah kolom `Pakai Manual (OUT)`, tampil kolom **Compare POS ESB** dengan indikator status otomatis:
    * **Cocok POS** (hijau): Selisih antara input manual barista dan pemakaian resep POS berada dalam batas toleransi wajar.
    * **Terjual di POS, Belum Diinput OUT** (merah): Ada penjualan menu di POS ESB yang menggunakan bahan tersebut, tetapi barista belum menginput `OUT` (`OUT = 0`).
    * **Selisih Lebih / Kurang (`+X` / `-X`)** (kuning): Menunjukkan selisih kuantitas antara yang dicatat barista vs yang terjual di kasir ESB, dilengkapi tombol filter cepat **Selisih vs POS ESB** di bagian atas tabel.

## 3. Penataan Pembelian Harian (Tujuan Kirim `Resto` vs `Central` + Keterangan), Acuan Stok 1 Bulan, & Sinkronisasi SO Central ke Resto

Sesuai arahan Anda (*"sediakan menu aja untuk Pembelian Harian, Beli apa dan tambahkan keterangan mau dikirim kemana sehingga lebih tertata, dan Stock dalam 1 bulan itu untuk acuan data yang diinput perhari oleh barista, dan SO pada tabel Central itu yang tidak ada pada daftar itu akan bisa masuk ke Resto"*), kami menyediakan modul `DailyPurchaseAndMonthlyQuota.jsx` dan dukungan database dengan 3 sub-fitur terpadu:

1. **Form Pembelian Harian Tertata (`Input Pembelian Harian & Tujuan Kirim`)**:
   * Pencarian bahan baku dengan *debounced search* yang langsung menampilkan info konversi 2-Tier (`1 pck = 1.000 gr`).
   * Pilihan eksplisit **Dikirim Kemana (Lokasi Tujuan)**:
     * `Langsung ke Resto / Bar` -> Otomatis menambah stok `RESTO` dan masuk ke kolom `Masuk (IN)` pada `Daily Inventory` Resto hari tersebut.
     * `Ke Gudang Central` -> Otomatis menambah stok `CENTRAL` sebagai cadangan gudang.
   * Field **Keterangan Pengiriman & Alokasi** (`delivery_notes`) untuk mencatat detail distribusi (misalnya: *"Dikirim langsung ke Chiller Bar pagi ini"* atau *"Stok mingguan disimpan di Central"*).
2. **Tabel `Acuan Stok 1 Bulan` (Referensi Input Harian Barista)**:
   * Mengadopsi tabel kanan pada sheet `Pembelian Harian` Excel (`Daftar Pembelian Bahan Stock Dalam Satu Bulan`), menampilkan:
     * **Acuan Stok 1 Bulan (`monthly_quota_qty`)**
     * **Total Beli Bulan Ini**
     * **Akumulasi OUT Harian Barista**
     * **Sisa dari Acuan Bulanan**
3. **Sinkronisasi Barang Stock Opname Central ke Resto (`sync_central_opname_unlisted_to_resto_v9`)**:
   * Menampilkan daftar barang yang tercatat memiliki stok di tabel **Stock Opname Central** tetapi belum terdaftar atau masih bersaldo `0` di **Resto**, lengkap dengan tombol **"+ Masukkan ke Resto"** satu klik.

## 4. Visibilitas Bahan Hasil Olahan (`Simple Prep` / `Proses Produksi Bahan`) di `Daily Inventory`

Sesuai konfirmasi Anda (*"itu bagus, bisa dibuatkan seperti itu"*):

* Setiap bahan hasil olahan / setengah jadi dari menu **Olah Bahan (`SimplePrep`)** maupun sheet `Proses Produksi Bahan` (seperti `Green Delight`, `Dragon Beet`, `Beta Caroot E.ne`, `Berry Much`, `Tropical`, `Manggo Yougurt`, `Gula Cair`, `Teh Base`, dan `Foaming`) ditandai dengan atribut `is_prep_output = true` dan `is_active = true`.
* Di tabel `Daily Inventory`, bahan-bahan tersebut muncul langsung sebagai baris item mandiri dengan badge biru **`Hasil Olah / Prep`**, dapat difilter khusus melalui tombol **`Hasil Olahan / Prep`** di bagian atas tabel, dan setiap kali staf mencatat pengolahan di `SimplePrep`, hasil bersihnya otomatis masuk ke kolom **`Masuk (IN)`** pada baris bahan olahan tersebut, sementara bahan mentahnya otomatis tercatat pada indikator **`Diolah Prep`** di baris bahan mentah asal.
