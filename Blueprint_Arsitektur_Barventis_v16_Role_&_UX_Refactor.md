# Blueprint Arsitektur & Rencana Implementasi Barventis v16

**Topik:** Isolasi Divisi/Role per Cabang (`Bar`, `Kitchen`, `Service`), Simplifikasi Ikon UI, Manajemen Hapus Cabang, Komparasi Cost Control Setara, Navigasi Cepat COGS ke Buku Stok, Koreksi Stok Menggantikan Nilai (`Replace`), dan Override Stok Akhir Harian Khusus Owner.

## 1. Arsitektur Pemisahan Role / Divisi dalam Cabang (`Bar`, `Kitchen`, `Service`)

### 1.1 Masalah Saat Ini (As-Is)

1. **Pencampuran Data Operasional di Satu Gudang `RESTO`**: Seluruh bahan baku (`materials`), resep (`recipes`), dan lembar kerja harian (`Daily Inventory`) di dalam satu cabang disatukan ke dalam label `Resto (Bar / Kitchen / Service)`.

2. **Filter Kategori `Bar` Belum Mencakup Seluruh 142 Bahan Bar Umatis**: Pada `locationService.js`, konfigurasi kategori `Bar` sebelumnya belum memasukkan kategori `'Syrup & Juice'` (28 item), `'Frozen Drink'` (10 item), dan `'Take Away'` (11 item), sehingga saat login sebagai `Bar` hanya muncul **93 bahan** dari total **142 bahan Barista Umatis** (`142 - 49 = 93`).

3. **Kurangnya Isolasi Modul Resep & Alat Antar Divisi**: Role `Kitchen` belum memiliki ruang resep masakan tersendiri yang terpisah dari 68 resep minuman `Bar`, sementara role `Service` masih melihat bahan racikan minuman alih-alih berfokus pada peralatan (*glassware*, *chinaware*, *cutlery*, aset, dan perlengkapan *dining floor*).

### 1.2 Desain Arsitektur Baru (To-Be: Multi-Division Architecture per Branch)

Setiap cabang (`BSD`, `KASUNA`, dll.) dibagi menjadi **3 Divisi Operasional Mandiri** ditambah **1 Gudang Pusat (Central)**:

| Divisi / Role | Fokus Operasional Utama | Cakupan Materials (`division`) | Cakupan Resep & HPP (`division`) | Fitur Khusus Divisi | 
| ----- | ----- | ----- | ----- | ----- | 
| **1. BAR (`role = 'Bar'`)** | Operasional minuman, kopi, teh, mocktail, jus, dan bir RTD | **142 Bahan Barista Umatis** (`division = 'BAR'`: `Coffee & Tea`, `Milk`, `Syrup & Juice`, `Powder`, `Fresh Fruit`, `Frozen Drink`, `Drink & Beer`, `Dry Goods`, `Take Away`, `Prep / Bahan Olahan`) | **68 Resep Minuman Umatis** (`division = 'BAR'`: `KOPI`, `NON-KOPI`, `TEA`, `MOCKTAIL`, `JUICE`, `BEER`) | Batch Prep Barista (Sirup Gula Cair, Teh Base, Soda Siphon, Foaming), Compare POS Minuman, Daily Inventory Bar | 
| **2. KITCHEN (`role = 'Kitchen'`)** | Operasional dapur utama, masakan, persiapan bumbu/saus, dan *trimming* bahan mentah | **Bahan Baku Masakan & Dapur** (`division = 'KITCHEN'`: `Meat & Poultry`, `Seafood`, `Kitchen & Cooking`, `Vegetables & Herbs`, `Spices & Seasoning`, `Dairy & Cooking`, `Kitchen Prep / Saus`) | **Resep Makanan & Masakan** (`division = 'KITCHEN'`: `MAIN COURSE`, `APPETIZER`, `SOUP`, `PASTA & NOODLE`, `SNACK / LIGHT BITES`, `SAMBAL & SAUCE PREP`) | **Trimming & Yield Dapur (`SimplePrep`)** dengan foto bukti timbangan *gross* vs *clean weight* & pencatatan *shrinkage/waste* otomatis | 
| **3. SERVICE (`role = 'Service'`)** | Pelayanan tamu (*floor*), *tableware*, *glassware*, peralatan saji, *packaging takeaway*, dan Kasir POS | **Alat, Glassware, Aset & Perlengkapan Floor** (`division = 'SERVICE'`: 117 item `SO Glass & Tool` meliputi Mesin/Aset, Gelas/Glassware, Utensil/Tool, ditambah `Dining Amenities`, `Tissue & Cleaning`, `Packaging Floor`) | *Tidak menampilkan resep racikan minuman/masakan* (fokus murni pada inventaris alat, stok *amenities/packaging*, dan transaksi POS) | Audit Fisik Alat & Glassware (*Baik*, *Rusak Ringan*, *Rusak Berat*), Lapor Barang Pecah (*Breakage*), Kasir POS & Upload Penjualan | 
| **4. OWNER / ADMIN** | Pengawasan menyeluruh lintas cabang dan lintas divisi | Dapat melihat **`Semua Divisi`** atau memfilter spesifik **`Bar`**, **`Kitchen`**, atau **`Service`** melalui pemilih divisi (*Division Switcher*) | Dapat melihat dan mengedit resep **`Bar`** maupun **`Kitchen`** secara terpisah atau gabungan | Hapus Cabang Cascade, Komparasi Cost Control Antar Cabang, dan **Override Langsung Stok Akhir di Daily Inventory** | 

### 1.3 Skema Database Pendukung Isolasi Divisi

* Penambahan kolom `division VARCHAR(20) NOT NULL DEFAULT 'BAR'` pada tabel `public.materials` dan `public.recipes` (serta indeks `(tenant_id, branch_id, division)`).

* Seluruh **142 material** dan **68 resep** yang sudah ada di sistem dikunci sebagai `division = 'BAR'`.

* Saat pengguna dengan role `Bar` atau `Kitchen` menambah bahan baru di Buku Stok atau menambah resep baru di Menu & COGS, kolom `division` otomatis terisi sesuai role pengguna (`'BAR'` untuk Barista, `'KITCHEN'` untuk Chef Kitchen, `'SERVICE'` untuk Staf Service).

## 2. Standar Simplifikasi UI & Penghapusan Ikon Dekoratif (`Clean UI`)

Untuk menghilangkan kesan ramai dan tumpang-tindih seperti pada tangkapan layar:

1. **Penghapusan Header Ganda pada `DailyInventory.jsx`**: Menghapus judul kedua (`Daily Inventory / Catat stok akhir hari dan pemakaian`) serta tombol `Panduan` duplikat di dalam halaman karena sudah tersedia pada *top header* utama `AppLayout.jsx`.

2. **Penghapusan Emoji & Ikon pada Dropdown `<select>` dan Kapsul Tab**:

   * Menghapus emoji `🏪`, `🏢`, `🌐` pada opsi `<select>` lokasi di `DailyInventory.jsx` dan `locationService.js`.

   * Menghapus ikon dekoratif di dalam kapsul navigasi tab (`TabContainer.jsx` dan sub-tab `TenantAdminPanel.jsx`) sehingga tab tampil bersih dengan tipografi tegas.

3. **Simplifikasi Kartu Ringkasan & Tombol Aksi**:

   * Menghapus kotak ikon dekoratif `<Coins />` dan `<CheckCircle />` pada kartu HPP dan Food Cost di `Recipes.jsx`.

   * Merapikan tombol aksi tabel dan filter cepat agar fokus pada keterbacaan angka dan label.

## 3. Spesifikasi Teknis 5 Fitur Fungsional Baru (Berdasarkan Image 2 s/d Image 6)

### 3.1 Fitur Hapus Cabang & Modal Konfirmasi Dampak Penghapusan (Image 2 — `TenantAdminPanel.jsx`)

* **Lokasi UI**: `Pengaturan Sistem -> Akses & Toko -> Cabang -> Daftar Cabang Resto`.

* **Komponen**: Tombol **`Hapus`** berwarna merah di samping tombol `Edit`, `Salin Data`, dan `Nonaktifkan`.

* **Alur Konfirmasi & Keamanan**:

  1. Saat Owner menekan **`Hapus`** pada suatu cabang (dengan syarat minimal tersisa 1 cabang aktif di restoran), sistem memanggil `api.getBranchDeletionSummary(branch.id)` untuk menghitung seluruh data yang terikat pada cabang tersebut.

  2. Muncul **Modal Konfirmasi Hapus Cabang** yang merinci jumlah:

     * Bahan Baku (`materials`)

     * Resep & HPP (`recipes`)

     * Riwayat Pembelian & Mutasi (`purchase_entries` & `transactions`)

     * Sesi Daily Inventory & Stock Opname (`daily_inventories` & `stock_opnames`)

     * Akun Staf pada cabang tersebut (`users` — otomatis dipindahkan ke cabang aktif utama agar akun login tidak hilang).

  3. Owner mencentang persetujuan dan mengetik nama/kode cabang untuk membuka kunci tombol **`Hapus Permanen Cabang`**.

  4. Fungsi `api.deleteBranchCascade(branchId)` (dan RPC SQL `public.delete_branch_cascade_v16`) menghapus seluruh data operasional cabang tersebut dari tabel *child* ke *parent* secara atomik tanpa melanggar *Foreign Key*.

### 3.2 Dropdown Pemilihan Cabang Setara & Tabel Komparasi pada Cost Control (Image 3 — `CostControl.jsx`)

* **Lokasi UI**: Baris filter atas halaman `Cost Control`, tepat di sebelah kanan dropdown `Periode`.

* **Perubahan UI & Logika**:

  * Mengganti tombol kapsul `( BSD | Semua Cabang )` yang membuat cabang BSD tampak berdiri sendiri menjadi **Dropdown `<select>` Cabang yang Setara**:

    * Opsi 1: `Semua Cabang (Komparasi & Gabungan)`

    * Opsi 2..N: `Cabang BSD`, `Cabang Kasuna`, `Cabang Kemang`, dst. (seluruh cabang ditampilkan sejajar).

  * Ketika dipilih **`Semua Cabang (Komparasi & Gabungan)`**:

    * Menampilkan **Tabel Komparasi Cost Control Antar Cabang** di bagian atas yang membandingkan `Stok Awal`, `Pembelian`, `Stok Akhir`, `HPP Aktual`, `Penjualan POS`, `Rasio Biaya %`, dan `Status` setiap cabang secara berdampingan beserta baris **`TOTAL / RATA-RATA GABUNGAN`**.

    * Kartu KPI utama di atas menampilkan nilai agregat gabungan seluruh cabang.

  * Ketika dipilih salah satu cabang spesifik: halaman langsung memuat rincian Cost Control untuk cabang tersebut.

### 3.3 Shortcut Langsung dari Bahan Pembuatan COGS ke Buku Stok + Search Debounce (Image 4 — `Recipes.jsx` & `StockLedger.jsx`)

* **Lokasi UI**: Tabel `KOMPOSISI BAHAN BAKU` pada halaman `Menu & COGS -> Resep & HPP` (`Recipes.jsx`).

* **Perubahan UI & Logika**:

  * Menambahkan tombol pintas **`Cek Stok ↗`** di sebelah setiap bahan baku yang terisi pada tabel komposisi resep.

  * Saat diklik, pengguna diarahkan langsung ke `/dashboard/sistem?tab=stock-ledger&search=<Nama Bahan>`.

  * Pada `TabContainer.jsx` dan `StockLedger.jsx`:

    * Parameter URL `?search=` dibaca otomatis saat halaman dimuat dan langsung mengisi state pencarian (`search` & `debouncedSearch`), mereset filter kategori/lokasi ke `'ALL'` agar bahan pasti terlihat, serta otomatis membuka panel detail/riwayat bahan baku tersebut (`selectedItem`).

### 3.4 Koreksi Stok (`Adjust Stock`) Menggantikan Nilai Stok Aktual, Bukan Menambahkan (Image 5 — `StockLedger.jsx`)

* **Penyebab Masalah Sebelumnya**: Pada `StockLedger.jsx`, state `adjustType` sebelumnya dikunci ke `'IN'` (`Koreksi IN`), sehingga di `api.adjustStock` dan RPC `adjust_material_stock`, nilai yang diinput selalu **ditambahkan** (`currentStock + qty`) ke stok lama.

* **Perbaikan**:

  * Mengubah mode default `Koreksi Stok` di `StockLedger.jsx` menjadi **`OPNAME_ADJ` (`Ganti Stok Aktual / Set Saldo Baru`)**.

  * Saat tombol koreksi stok diklik, kolom input otomatis menampilkan angka stok saat ini sebagai nilai awal, disertai pratinjau langsung:
    `Stok Saat Ini: X -> Stok Baru: Y (Selisih Koreksi: +/-Z)`.

  * Saat disimpan, sistem langsung **menggantikan** nilai `qty_resto` (atau `qty_central`) menjadi angka baru yang diinput dan menyinkronkan snapshot `daily_inventory_items` terakhir agar `Stok Awal` di Daily Inventory ikut terbarui.

### 3.5 Penyesuaian Langsung `Stok Akhir` pada Daily Inventory Khusus Role Owner (Image 6 — `DailyInventory.jsx`)

* **Lokasi UI**: Kolom **`STOK AKHIR`** pada tabel `Input EOD` di halaman `Daily Inventory`.

* **Perubahan UI & Logika**:

  * Memperbaiki tampilan kolom `STOK AWAL` agar menampilkan nilai desimal utuh + bukaan (`stokAwal`, misalnya `0,875` pada `Bali Hai Draft beer 220`, bukan dibulatkan menjadi `0`).

  * Khusus untuk pengguna dengan role **`Owner` (`Admin / Owner`)**, kolom **`STOK AKHIR`** berubah menjadi **input angka yang dapat diedit langsung** (dilengkapi penanda `Setup Owner`).

  * Saat Owner mengubah angka `Stok Akhir` pada baris mana pun (untuk keperluan *setup* awal material dan stok) lalu menekan Enter / keluar dari kolom (*blur*) atau menekan `Simpan Draf`:

    * Sistem menyesuaikan saldo stok baris tersebut agar `Stok Akhir` persis sama dengan angka yang diinput Owner (`full_qty` & `broken_qty` terhitung otomatis), sekaligus memperbarui stok aktif (`qty_resto` / `qty_central`) di tabel `public.materials` dan `daily_inventory_items`.

  * Untuk role staf (`Bar`, `Kitchen`, `Service`), kolom `STOK AKHIR` tetap terkunci (*read-only*) sesuai rumus otomatis `Stok Awal + IN - OUT - Limbah`.