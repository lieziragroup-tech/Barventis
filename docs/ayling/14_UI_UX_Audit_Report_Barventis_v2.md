# LAPORAN AUDIT ARSITEKTUR, UI/UX, DAN REKOMENDASI UPGRADE SISTEM BARVENTIS V2
## Evaluasi Forensik Kode Sumber (Barventis-main) & Analisis Bukti Visual Antarmuka Mobile

**Disusun Oleh:** Ayling (System Architect, Product Manager & Full-Stack Reviewer) & Izumi (Evidence Traceability & Quality Auditor)  
**Target Sistem:** Barventis ERP V2 (`barventis-v2.vercel.app` / `Barventis-main.zip`)  
**Metode Evaluasi:** Static Code Analysis (`OBSERVED` pada repositori penuh) + Visual UI/UX Inspection (4 Bukti Tangkapan Layar Mobile)  
**Tanggal Evaluasi:** 9 November 2026  

## 1. RINGKASAN EKSEKUTIF KEPUTUSAN CEPAT

Tabel berikut merangkum jawaban langsung atas tiga pertanyaan utama Anda beserta temuan sistemik lainnya dari hasil bedah kode sumber `Barventis-main.zip`:

| Area Evaluasi | Komponen & File Sumber (`OBSERVED`) | Keputusan & Rekomendasi Inti | Dampak Bisnis & Operasional |
|:---|:---|:---|:---|
| **Image 1: Log Sistem (Audit Trail)** | `src/pages/shared/AuditLogs.jsx`<br/>`src/services/activityLogService.js`<br/>`src/services/api.js:3885` | **Log Teknis Client-Side Tidak Perlu; Jejak Mutasi Kritis Tetap Perlu.** Hapus antrean `localStorage`, hapus tombol `Sync 1 Logs`, hapus log baca (`VIEW_COST_CONTROL`), dan perbaiki bug kolom `actor_id` yang membuat tabel kosong. | Menghentikan pembengkakan ribuan baris log sampah di database, memulihkan visibilitas audit Owner, dan membersihkan layar dari tombol teknis yang membingungkan. |
| **Image 2: UI/UX Cost Control** | `src/pages/shared/CostControl.jsx:397-521` | **Wajib Dioptimasi & Direstrukturisasi.** Perbaiki `Filter Tanggal` yang jebol keluar kartu (`overflow`), pangkas 14 kartu KPI yang duplikat menjadi 4 kartu inti, dan sembunyikan kotak "Catatan pengukuran" ke dalam ikon info (`?`). | Memperbaiki tata letak mobile yang rusak, memangkas jarak gulir (*scroll depth*) hingga 65%, dan menyajikan angka HPP yang bersih bagi pengambil keputusan. |
| **Image 3 & 4: Transfer Central ke Resto** | `src/pages/shared/InterBranchTransfer.jsx:841-864`<br/>`src/pages/shared/Purchasing.jsx:574-755` | **Ganti `<select>` Dropdown dengan Debounced Search (250ms) + Multi-Item Transfer Cart.** Adopsi pola keranjang `Purchasing.jsx` agar staf dapat memilih banyak barang sekaligus dalam satu surat jalan mutasi. | Mempercepat proses mutasi harian gudang (10 sampai 25 item sekali angkut) dari 15 menit menjadi di bawah 1 menit tanpa gulir manual ratusan baris di HP. |
| **Temuan Tambahan (Upgrade Sistemik)** | `App.jsx:188`, `WasteLogs.jsx:1171`, `Marketlist.jsx:9`, `Purchasing.jsx:317`, `ContextualFloatingNav.jsx:90` | **6 Upgrade Prioritas Tinggi:** Buka akses rute Transfer untuk Role Bar/Central, ganti `<select>` bahan di modul Limbah & Produksi, selaraskan kategori Marketlist, ganti `window.prompt()` beruntun, dan hapus duplikasi navigasi melayang. | Mencegah error `Unauthorized` saat Barista meminta barang ke Central, menyatukan standar pencarian bahan di seluruh aplikasi, dan menstabilkan pengalaman mobile. |

## 2. ANALISIS MENDALAM IMAGE 1: APAKAH LOG SISTEM PERLU ATAU TIDAK?

### 2.1 Jawaban Tegas: Bedakan "Log Teknis Sistem" vs "Riwayat Perubahan Kritis"
Dalam tata kelola sistem ERP F&B, kita harus memisahkan dua jenis pencatatan yang saat ini tercampur aduk di dalam `AuditLogs.jsx`:

1. **Log Teknis Aktivitas Sistem (TIDAK PERLU ditampilkan ke pengguna & harus dihapus):**
   Pencatatan setiap kali pengguna membuka halaman laporan (`VIEW_COST_CONTROL`), setiap kali sistem melakukan *auto-save draft* EOD lima detik sekali (`SAVE_EOD`), setiap kali pengguna login/logout rutin, serta mekanisme penahanan log di `localStorage` browser yang memunculkan tombol **`Sync 1 Logs`**. Semua ini adalah *noise* (sampah data) yang membuat angka `TOTAL AKTIVITAS SISTEM` membengkak menjadi **2.526 baris** hanya dari 3 pengguna aktif.
2. **Riwayat Perubahan Kritis / Audit Finansial (PERLU untuk Owner/GM, tetapi harus disederhanakan):**
   Pemilik bisnis hanya membutuhkan catatan transparan ketika terjadi **5 aksi berisiko tinggi terhadap uang dan stok**:
   - Pembatalan atau penghapusan riwayat pembelian (`CANCEL_PURCHASE`, `DELETE_TRANSACTION`).
   - Perubahan harga beli master bahan baku atau komposisi resep (`UPDATE_PRICE`, `UPDATE_RECIPE`).
   - Pembukaan kembali kunci EOD yang sudah ditutup (`UNLOCK_EOD`).
   - Penyesuaian selisih Stock Opname (`COMPLETE_OPNAME`, `ADJUST_STOCK`).
   - Penghapusan atau reset data toko (`TENANT_RESET`).

### 2.2 Empat Bukti Forensik Kode (`OBSERVED`) Mengapa Layar Image 1 Bermasalah

| No | Lokasi Kode Sumber | Temuan Bukti Teknis (`OBSERVED`) | Efek & Dampak Nyata pada Sistem |
|:---:|:---|:---|:---|
| 1 | `src/services/api.js` baris 3884-3886 & `src/pages/shared/AuditLogs.jsx` baris 26, 49 | Saat checkbox `Tindakan Manusia Saja` dicentang (`humanOnly = true` secara default), fungsi `getAuditLogsPaged` mengeksekusi `query.not('actor_id', 'is', null)`. Padahal pada skema database (`20260918000000_barventis_v2_core.sql` baris 832 & 850), nama kolom yang benar adalah **`user_id`** (dan `NOT is_system`), bukan `actor_id`. | Query ke Supabase selalu gagal dengan **HTTP 400 Bad Request** (`column audit_logs.actor_id does not exist`). Karena baris 49 memakai `.catch(() => ({ data: [], totalCount: 0 }))`, error ditelan diam-diam sehingga daftar tabel audit di bawahnya gagal tampil sama sekali, menyisakan hanya 1 log lokal (`Sync 1 Logs`). |
| 2 | `src/services/api.js` baris 517, 549, 564, 3146 & `v3.sql` baris 552, 736, 962, 1079, 1552, 1636 | Fungsi baca `getCostControlReport` menulis log `VIEW_COST_CONTROL` setiap kali halaman dibuka. Selain itu, terjadi **pencatatan ganda (*double logging*)**: fungsi RPC di PostgreSQL sudah melakukan `INSERT INTO public.audit_logs`, tetapi frontend `api.js` memanggil `logAudit()` lagi setelah RPC selesai. | Satu tindakan pengguna menghasilkan 2 baris log kembar. Ukuran tabel `audit_logs` membengkak cepat, memperlambat proses *Backup Database* (`api.js:3949` menarik seluruh isi `audit_logs` tanpa batas ke dalam file JSON backup). |
| 3 | `src/services/activityLogService.js` baris 3-116 & `AuditLogs.jsx` baris 315 | Log dari frontend tidak langsung dikirim ke server, melainkan ditampung di `localStorage` (`barventis_activity_logs`) dan baru dikirim setiap 5 menit (`FLUSH_INTERVAL_MS`). Jika ada sisa di `localStorage`, muncul tombol hijau **`Sync 1 Logs`**. | Jika pelaku kecurangan menghapus data browser atau menutup tab sebelum 5 menit, jejak audit dari frontend hilang. Tombol `Sync 1 Logs` juga membingungkan Owner karena terlihat seperti sistem sedang macet. |
| 4 | `src/components/ContextualFloatingNav.jsx` baris 90 | Elemen navigasi kapsul bawah (`fixed bottom-16 z-40`) melayang tepat di atas area kontrol halaman. | Pada Image 1, kapsul `[Buku] [Transfer] [Gear] [Audit]` menabrak dan menutupi teks checkbox `Tindakan Manusia Saja` serta tombol `Segarkan`. |

### 2.3 Rencana Penyesuaian Image 1
- **Langkah 1:** Hapus `activityLogService.js` (antrean `localStorage`) dan hapus tombol **`Sync 1 Logs`** dari `AuditLogs.jsx`. Biarkan seluruh pencatatan audit kritikal ditangani secara atomik di dalam fungsi RPC database PostgreSQL sehingga mustahil dimanipulasi dari browser.
- **Langkah 2:** Perbaiki `api.js:3885` dari `query.not('actor_id', 'is', null)` menjadi `query.not('user_id', 'is', null).eq('is_system', false)`.
- **Langkah 3:** Hapus `logAudit('VIEW_COST_CONTROL')` pada `api.js:3146` dan hapus seluruh panggilan `logAudit` di `api.js` yang sudah dicatat oleh RPC database.
- **Langkah 4:** Rampingkan UI `AuditLogs.jsx` dengan mengganti 4 kartu KPI besar (yang menghabiskan ruang layar HP) menjadi bar ringkas di bagian atas, sehingga daftar riwayat perubahan langsung terlihat begitu halaman dibuka.

## 3. ANALISIS MENDALAM IMAGE 2: OPTIMASI UI/UX HALAMAN COST CONTROL

### 3.1 Bedah Masalah Visual & Kode pada `src/pages/shared/CostControl.jsx`
Tangkapan layar pada Image 2 memperlihatkan tiga masalah desain antarmuka dan arsitektur informasi pada halaman Cost Control:

1. **Komponen `Filter Tanggal` Jebol Keluar Kontainer (*Horizontal Overflow*):**
   - **Bukti Kode (`CostControl.jsx:490-520`):**
     ```jsx
     <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
       <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Filter Tanggal:</span>
       <input type="date" className="form-control" style={{ padding: '4px 8px', fontSize: '0.8rem', width: '130px' }} ... />
       <span style={{ color: 'var(--text-muted)' }}>-</span>
       <input type="date" className="form-control" style={{ padding: '4px 8px', fontSize: '0.8rem', width: '130px' }} ... />
     </div>
     ```
   - **Penyebab:** Kontainer flex tidak memiliki `flexWrap: 'wrap'` dan kedua input tanggal dipaksa berukuran statis `width: '130px'`. Pada layar ponsel selebar 360px hingga 390px, lebar bersih di dalam kartu (setelah dikurangi padding luar `24px` kiri-kanan) hanya sekitar `312px`. Karena total lebar elemen anak mencapai `~395px`, input tanggal kedua terdorong keluar menembus batas kanan kartu seperti terlihat jelas pada Image 2.
   - **Evaluasi Kebutuhan:** Di bagian paling atas halaman (`CostControl.jsx:316`), pengguna sudah memilih **Periode Bulan** (misal `November 2026`). Tabel `Daily Purchase vs Sales` maksimal hanya memuat 30 atau 31 baris (1 baris per tanggal). Menambahkan dua pemilih kalender penuh untuk menyaring tabel 30 baris adalah fitur berlebihan (*over-engineered*) yang merusak tampilan mobile.

2. **Banjir 14 Kartu Metrik & Duplikasi Informasi Tiga Kali Lipat (`CostControl.jsx:397-478`):**
   - **Bukti Kode:** Halaman Cost Control saat ini merender tiga blok `kpi-grid` secara berurutan:
     - **Blok 1 (`baris 397`):** 4 Kartu (*Total Beverage Sales*, *Actual COGS vs Theoretical*, *Cost Variance Rate*, dan kartu berisi tombol *View Variance Details*).
     - **Blok 2 (`baris 435`):** 5 Kartu Formula (*1. Stock Awal*, *2. Pembelian*, *3. Stock Akhir*, *Kerugian Waste*, *4. Pemakaian COGS*).
     - **Blok 3 (`baris 452` - terlihat pada paruh atas Image 2):** 5 Kartu Rekonsiliasi (*Pemakaian Harian Aktual*, *Theoretical COGS*, *COGS dari Rekonsiliasi Stok*, *Selisih Rekonsiliasi*, *EOD Final Tercatat*).
   - **Dampak UX:** Angka `{formatIDR(pemakaianBulan)}` ditampilkan berulang tiga kali di tiga blok berbeda! Pada layar ponsel, 14 kartu ini bertumpuk secara vertikal menjadi daftar yang sangat panjang. Pemilik bisnis harus menggulir layar berkali-kali sebelum menemukan tabel rincian harian.
   - **Bug Karakter Rusak (`CostControl.jsx:459`):** Terdapat karakter rusak `Theoretical COGS (ESB  Resep)` di mana simbol kali (`x`) terkorupsi menjadi karakter *replacement diamond* (`U+FFFD`).

3. **Penempatan Kotak "Catatan Pengukuran" yang Mengganggu Hierarki Eksekutif (`CostControl.jsx:479-481`):**
   - **Bukti Kode:** Kotak catatan abu-abu berisi kalimat teknis: *"Catatan pengukuran: FULL dihitung dari saldo buku dan BROKEN yang ditimbang, bukan hitung fisik independen atas kemasan utuh..."* diletakkan secara permanen di tengah halaman.
   - **Evaluasi Penempatan:** Kalimat tersebut adalah dokumentasi logika internal sistem (catatan transisi migrasi v4 ke v6), bukan informasi operasional harian yang perlu dibaca berulang kali setiap hari oleh Owner. Menempatkannya secara mencolok di tengah dashboard menurunkan kejelasan visual dan membuat halaman tampak seperti lembar kerja yang belum selesai.

### 3.2 Rekomendasi Optimasi Halaman Cost Control (Image 2)
- **Pangkas 14 Kartu Menjadi 4 Kartu Eksekutif + 1 Pita Rumus HPP Ringkas:**
  1. **Total Penjualan Beverage (POS):** Menampilkan omset kotor minuman.
  2. **HPP Aktual (Rekonsiliasi Opname):** Menampilkan nilai COGS beserta rincian satu baris `(Stok Awal + Pembelian - Stok Akhir)`.
  3. **Rasio Beverage Cost % (vs Target 27%):** Menampilkan persentase biaya dengan lencana status (`AMAN <= 27%`, `WASPADA`, atau `BAHAYA`).
  4. **Pemakaian Harian & Selisih Rekonsiliasi:** Menggabungkan *Pemakaian Harian Aktual (EOD)*, *Total Waste*, dan *Jumlah Sesi EOD Terkunci* ke dalam satu kartu komparasi yang padat dan jelas.
- **Pindahkan "Catatan Pengukuran" ke Ikon Tooltip / Collapsible Info:** Sembunyikan penjelasan metodologi perhitungan `FULL` vs `BROKEN` ke dalam tombol kecil `(i) Metodologi Perhitungan` yang hanya terbuka saat diklik.
- **Perbaiki Baris Header `Daily Purchase vs Sales`:** Hapus dua `<input type="date">` yang jebol keluar kartu, atau jika tetap ingin mempertahankan filter rentang tanggal, gunakan `display: grid; grid-template-columns: repeat(2, minmax(0, 1fr))` dengan `width: 100%` pada layar mobile sehingga kedua input tanggal sejajar rapi di dalam batas kartu.

## 4. ANALISIS MENDALAM IMAGE 3 & 4: REDESIGN MUTASI BARANG CENTRAL KE RESTO

### 4.1 Mengapa Desain Saat Ini (`InterBranchTransfer.jsx`) Menghambat Operasional?
Pendapat Anda untuk mengganti dropdown pada Gambar 3 & 4 dengan **Debounced Search + Pemilihan Multi-Barang (seperti di Pembelian Harian)** adalah **solusi yang 100% tepat sasaran**.

Mari kita lihat bukti kelemahan struktural pada `src/pages/shared/InterBranchTransfer.jsx`:
1. **Kelemahan Pemilihan via `<select>` Native (`baris 851-863`):**
   Komponen merender seluruh isi array `stock` (180+ bahan baku) ke dalam tag `<option>` dengan string panjang `{m.name} ({m.sku}) - Satuan: {m.unit} | Kategori: {m.category}`. Ketika dibuka di ponsel Android (Gambar 3), sistem operasi menampilkan daftar radio-button layar penuh tanpa kotak pencarian. Staf gudang harus menggulir ratusan baris untuk mencari satu item.
2. **Kelemahan Arsitektur Satu Barang per Form (`baris 56-62 & 179-252`):**
   State `transferForm` hanya menyimpan satu `item_id` dan satu `quantity`. Padahal dalam operasional restoran nyata, perpindahan barang dari **Central Warehouse ke Resto Bar** tidak pernah dilakukan satu biji per surat jalan. Setiap pagi atau pergantian shift, Barista atau Staf Central memindahkan **10 hingga 25 jenis barang sekaligus** dalam satu troli (misal: Susu Fresh Milk, Biji Kopi, Cup Plastik, Sedotan, dan Sirup). Dengan modal tunggal pada Gambar 4, staf dipaksa mengisi dan mengirim form **20 kali berturut-turut**!
3. **Ketiadaan Filter Stok Tersedia:**
   Dropdown saat ini menampilkan semua bahan baku, termasuk bahan yang stoknya di Central Warehouse bernilai **0**! Hal ini memicu kesalahan pilih barang yang sebenarnya kosong di gudang asal.

### 4.2 Spesifikasi Upgrade: Multi-Item Transfer Cart dengan Debounced Search (250ms)
Kita akan menyelaraskan `InterBranchTransfer.jsx` agar memiliki pola kerja secepat dan senyaman `Purchasing.jsx` (`/dashboard/procurement?tab=pembelian`):

| Komponen Fitur | Kondisi Lama (Gambar 3 & 4) | Desain Baru (Setara Pembelian Harian) | Manfaat Operasional |
|:---|:---|:---|:---|
| **Penentuan Rute Mutasi** | Diatur di tengah form untuk 1 item saja | **Header Rute Global di Atas Keranjang:** Pilih `Asal: Central Warehouse` ke `Tujuan: Resto Bar` dan Tanggal Mutasi satu kali untuk seluruh keranjang. | Rute terkunci rapi untuk satu surat jalan pengantaran troli. |
| **Pencarian Bahan Baku** | Native `<select>` 180+ opsi tanpa search (Gambar 3) | **Smart Debounced Search Input (250ms):** Ketik nama/SKU bahan, langsung muncul dropdown hasil pencarian maksimal 8 item teratas + filter opsional `Hanya yang ada stok di Asal`. | Pencarian bahan selesai dalam 1 detik tanpa perlu gulir daftar panjang di layar HP. |
| **Informasi Sisa Stok** | Baru muncul setelah salah satu opsi dipilih dari dropdown | **Badge Stok Langsung di Hasil Pencarian & Baris Keranjang:** Menampilkan `Stok Central: 120 pck | Stok Resto: 4 pck` tepat di sebelah nama bahan. | Staf langsung tahu berapa jumlah maksimal yang bisa diambil dari Central. |
| **Kapasitas Transaksi** | 1 item per submit modal (Gambar 4) | **Tabel Keranjang Mutasi Multi-Item (*Transfer Cart*):** Tap hasil pencarian untuk memasukkan banyak barang ke daftar keranjang, atur kuantitas per baris, dan hapus baris dengan mudah. | 15 barang mutasi pagi hari dapat diinput sekaligus dalam satu layar dan dieksekusi dengan 1 klik. |
| **Eksekusi Database** | Memanggil `createTransfer` untuk 1 item | **Batch Atomic Execution:** Mengeksekusi seluruh item di keranjang secara paralel/batch dengan satu nomor referensi surat jalan dan validasi kuota stok asal. | Mencegah stok minus di Central dan menghasilkan riwayat mutasi yang bersih. |

## 5. TEMUAN MENDALAM LAINNYA DI SELURUH SISTEM YANG WAJIB DI-UPGRADE

Selain ketiga poin pada gambar yang Anda lampirkan, kami (Ayling & Izumi) melakukan audit menyeluruh terhadap seluruh kode sumber `Barventis-main.zip` dan menemukan **7 celah arsitektur, RBAC, dan UX penting** yang sangat layak di-upgrade:

### 5.1 Bug Blokir Akses RBAC: Role `Bar` & `Central` Tidak Bisa Mengakses Halaman Transfer! (Prioritas: P0 - Kritis)
- **Bukti Kode (`OBSERVED`):**
  - Pada `src/pages/shared/InterBranchTransfer.jsx` baris 208, 339, dan 577, kode sudah dilengkapi fitur khusus bagi `activeUser?.role === 'Bar'` untuk mengajukan **Permintaan Transfer (`createTransferRequest`)** dan bagi staf gudang untuk menyetujuinya (`handleApproveRequest`).
  - **NAMUN**, komponen `InterBranchTransfer` diletakkan di dalam `SystemAdminHub.jsx` pada rute `/dashboard/sistem`.
  - Pada `src/App.jsx` baris 100 dan 188, rute `/dashboard/sistem` dipagari dengan `<ProtectedRoute allowedRoles={ADMIN_ROLES}>` di mana `ADMIN_ROLES = ['Admin / Owner', 'Owner']`!
  - Selain itu, pada `src/components/AppLayout.jsx` baris 319-326, menu sidebar untuk `role === 'Bar'` dan `role === 'Central'` tidak memiliki tautan menuju halaman Transfer!
- **Efek & Dampak:** Seluruh fitur *Permintaan Transfer oleh Barista* yang sudah dibangun di dalam `InterBranchTransfer.jsx` menjadi **kode mati (*dead feature*)** karena jika Barista atau Staf Central mencoba membukanya, sistem langsung memblokir mereka ke halaman `/unauthorized`.
- **Solusi Upgrade:** Buat rute mandiri `/dashboard/transfer` di `App.jsx` yang mengizinkan `['Admin / Owner', 'Owner', 'Supervisor', 'Central', 'Purchasing', 'Bar', 'Kitchen']`, dan tampilkan menu **"Mutasi & Ambil Barang Central"** langsung di sidebar Role Bar, Central, dan Purchasing.

### 5.2 Polusi `<select>` Native Ratusan Bahan di Modul Limbah & Produksi (Prioritas: P1 - Tinggi)
- **Bukti Kode (`OBSERVED`):**
  - Masalah dropdown ratusan bahan seperti pada Gambar 3 ternyata juga terjadi pada:
    1. **Form Catat Limbah (`src/pages/shared/WasteLogs.jsx` baris 1171-1186):** Menggunakan `<select>` native untuk memilih bahan yang tumpah/basi.
    2. **Form Resep & Batch Produksi (`src/pages/shared/MaterialProduction.jsx` baris 167 & 174):** Menggunakan `<select>` native untuk memilih bahan output dan setiap baris bahan input resep.
- **Efek & Dampak:** Barista yang ingin melaporkan limbah atau membuat resep batching di HP mengalami kesulitan gulir layar yang sama persis seperti pada Gambar 3.
- **Solusi Upgrade:** Ekstrak pola pencarian *debounce 250ms* menjadi satu komponen bersama **`src/components/shared/MaterialAutocomplete.jsx`** dan gunakan menggantikan seluruh `<select>` bahan di `InterBranchTransfer.jsx`, `WasteLogs.jsx`, dan `MaterialProduction.jsx`.

### 5.3 Ketidakcocokan Konstanta Kategori `Marketlist.jsx` vs Data Riil Excel SO Barista (Prioritas: P1 - Tinggi)
- **Bukti Kode (`OBSERVED`):**
  - Pada `src/pages/shared/Marketlist.jsx` baris 9-19, konstanta `OFFICIAL_CATEGORIES` didefinisikan sebagai:
    `['Drink & Beer', 'Syrup & Flavor', 'Dairy & Milk', 'Coffee & Tea', 'Fruit & Produce', 'Liquor & Spirit', 'Bahan Mentah / Raw Material', 'Consumable (Packaging)', 'Glass & Tool (Asset)']`.
  - Padahal skrip migrasi data riil Umatis (`scripts/seed_phase1_materials.cjs` dan berkas Excel `SO BARISTA AGUSTUS 2026.xlsx`) menyimpan bahan baku dengan nama kategori: `'Coffee & Tea'`, `'Milk'`, `'Drink & Beer'`, `'Powder'`, `'Syrup & Juice'`, `'Fresh Fruit'`, `'Frozen Drink'`, `'Dry Goods'`, dan `'Take Away'`.
- **Efek & Dampak:** Ketika pengguna mengklik tombol filter kategori di halaman Marketlist (misal memilih `Syrup & Flavor` atau `Fruit & Produce`), bahan baku riil hasil migrasi yang berkategori `Syrup & Juice` atau `Fresh Fruit` tidak muncul karena string kategorinya berbeda.
- **Solusi Upgrade:** Selaraskan `OFFICIAL_CATEGORIES` dengan kategori baku SO Barista 2026 serta tambahkan daftar kategori dinamis yang ditarik langsung dari `new Set(materials.map(m => m.category))` agar tidak ada satu pun bahan baku yang tersembunyi saat difilter.

### 5.4 Penggunaan 4 Kali `window.prompt()` Beruntun saat Edit Pembelian (Prioritas: P1 - Tinggi)
- **Bukti Kode (`OBSERVED`):**
  - Pada `src/pages/shared/Purchasing.jsx` baris 316-335 (`handleEditHistory`), ketika pengguna menekan tombol Edit pada baris riwayat pembelian, kode memanggil **4 dialog `window.prompt()` secara berurutan**:
    1. `prompt('Edit QTY...')`
    2. `prompt('Edit Harga Satuan...')`
    3. `prompt('Edit Catatan...')`
    4. `prompt('Edit Tanggal...')`
  - Selain itu, terdapat **43 panggilan `window.alert()` dan `window.prompt()`** yang tersebar di `StockLedger.jsx`, `Invoicing.jsx`, `Recipes.jsx`, dan `DailyInventory.jsx`.
- **Efek & Dampak:** Di browser mobile (Chrome Android / Safari iOS), pemanggilan `prompt()` beruntun memicu proteksi anti-spam browser (*"Prevent this page from creating additional dialogs"*), tidak memiliki kalender tanggal maupun pemformatan angka ribuan, dan membatalkan seluruh edit jika pengguna tidak sengaja menekan Batal di prompt ke-4.
- **Solusi Upgrade:** Ganti `handleEditHistory` di `Purchasing.jsx` dengan **Modal Edit Pembelian** yang bersih (memuat input angka Qty, Harga, Date Picker Tanggal, dan Catatan dalam satu tampilan), serta ganti seluruh `alert()` dengan sistem notifikasi `showToast()` yang sudah tersedia di `DataContext`.

### 5.5 Tumpang Tindih Navigasi Mobile: `TabContainer` Atas vs `ContextualFloatingNav` Bawah (Prioritas: P2 - Menengah)
- **Bukti Kode (`OBSERVED`):**
  - Setiap halaman Hub (`ProcurementHub`, `DailyInventoryHub`, `OpnameAssetsHub`, `PricingCogsHub`, `SystemAdminHub`) sudah merender kapsul tab geser horizontal di bagian atas halaman menggunakan `src/components/shared/TabContainer.jsx`.
  - Pada saat yang sama, `src/components/AppLayout.jsx` baris 789 merender `ContextualFloatingNav.jsx` (`fixed bottom-16 z-40`) di bagian bawah layar mobile yang berisi **daftar tab yang persis sama**!
- **Efek & Dampak:**
  1. Memakan ruang vertikal layar ponsel dan menutupi tombol aksi penting di bagian bawah halaman (seperti terlihat pada Image 1 di mana kapsul bawah menutupi checkbox dan tombol `Segarkan`, atau menutupi tombol simpan/pagination di halaman tabel).
  2. Terdapat dua komponen berbeda yang mengendalikan parameter URL `?tab=...` secara bersamaan.
- **Solusi Upgrade:** Nonaktifkan atau hapus `ContextualFloatingNav.jsx` pada halaman yang sudah menggunakan `TabContainer.jsx` (atau buat `TabContainer` menjadi *sticky* di bawah header atas saat digulir), sehingga area bawah layar mobile 100% bersih dari gangguan tombol melayang yang menutupi formulir.

### 5.6 Bug Deteksi Layar Mobile Non-Reaktif (`window.innerWidth < 768`) (Prioritas: P2 - Menengah)
- **Bukti Kode (`OBSERVED`):**
  - Pada `src/pages/shared/Purchasing.jsx` baris 104 dan `src/components/shared/SwipeableItem.jsx` baris 10, kode menulis `const isMobile = window.innerWidth < 768;` secara langsung di badan fungsi komponen tanpa `useEffect` listener `resize` atau `window.matchMedia`.
- **Efek & Dampak:** Jika staf membuka aplikasi pada tablet dengan posisi miring (*landscape*) lalu memutarnya ke posisi tegak (*portrait*), atau mengubah ukuran jendela, tabel tidak berubah menjadi tampilan kartu mobile sampai halaman di-refresh paksa.
- **Solusi Upgrade:** Buat custom hook ringan `useIsMobile(breakpoint = 768)` menggunakan `window.matchMedia` agar seluruh komponen merespons perubahan orientasi layar secara instan.

### 5.7 Keamanan & Performa Fungsi Backup (`api.js:3939-3980`) dan Reset Data (`api.js:4880-4935`) (Prioritas: P2 - Menengah)
- **Bukti Kode (`OBSERVED`):**
  - Fungsi `createBackup` di `api.js:3949` menarik seluruh isi tabel `audit_logs` (`select('*')`) tanpa filter batas waktu dan menyimpannya kembali ke dalam kolom JSON di tabel `backups`. Jika `audit_logs` berisi puluhan ribu baris, pembuatan backup akan gagal karena melebihi batas payload PostgREST.
  - Fungsi `executeTenantResetImmediate` di `api.js:4880` menghapus data secara berurutan dari sisi klien (*client-side sequential deletes*) tanpa transaksi atomik tunggal. Jika koneksi terputus di tengah jalan, sebagian tabel terhapus dan sebagian lagi tertinggal.
- **Solusi Upgrade:** Kecualikan `audit_logs` dari payload `createBackup` (cukup backup data master & transaksi inti: `materials`, `suppliers`, `recipes`, `purchases`, `daily_inventories`, `stock_opnames`), dan pastikan seluruh operasi reset selalu melalui fungsi RPC database atomik.

## 6. MATRIKS PRIORITAS EKSEKUSI UPGRADE (ACTIONABLE ROADMAP)

| Prioritas | Kode Item | Rincian Pekerjaan Teknis | File Target Utama | Estimasi Dampak |
|:---:|:---:|:---|:---|:---|
| **P0 (Segera)** | **UPG-01** | **Redesain Mutasi Barang (`InterBranchTransfer.jsx`):** Ganti `<select>` dropdown dengan Debounced Search (250ms) + Multi-Item Transfer Cart (seperti `Purchasing.jsx`) + tampilkan stok Central vs Resto secara langsung. | `src/pages/shared/InterBranchTransfer.jsx`<br/>`src/services/api.js` | Memangkas waktu input mutasi Central-ke-Resto hingga 90% dan menghilangkan masalah dropdown panjang di HP (Gambar 3 & 4). |
| **P0 (Segera)** | **UPG-02** | **Perbaikan Bug & Penyederhanaan Audit Logs (Gambar 1):** Perbaiki bug `actor_id` menjadi `user_id` di `api.js:3885`, hapus antrean `localStorage` & tombol `Sync 1 Logs`, serta matikan log baca `VIEW_COST_CONTROL`. | `src/services/api.js`<br/>`src/pages/shared/AuditLogs.jsx`<br/>`src/services/activityLogService.js` | Memulihkan tabel Audit Logs yang gagal tampil akibat error HTTP 400 dan menghentikan pembengkakan ribuan log sampah. |
| **P0 (Segera)** | **UPG-03** | **Optimasi UI/UX Cost Control (Gambar 2):** Perbaiki overflow `Filter Tanggal`, konsolidasikan 14 kartu KPI duplikat menjadi 4 kartu inti + 1 baris rumus HPP, perbaiki karakter encoding rusak, dan lipat "Catatan pengukuran" ke dalam tooltip/expander. | `src/pages/shared/CostControl.jsx` | Tampilan mobile Cost Control rapi tanpa elemen yang jebol keluar kartu, lebih ringkas, dan fokus pada keputusan eksekutif. |
| **P1 (Tinggi)** | **UPG-04** | **Buka Rute & Sidebar Mutasi untuk Role Bar & Central:** Tambahkan rute `/dashboard/transfer` di `App.jsx` dan menu sidebar di `AppLayout.jsx` agar Barista & Central dapat mengakses fitur permintaan/persetujuan transfer. | `src/App.jsx`<br/>`src/components/AppLayout.jsx` | Menghidupkan alur kerja nyata *Permintaan Barang Barista ke Gudang Central* tanpa terblokir halaman `/unauthorized`. |
| **P1 (Tinggi)** | **UPG-05** | **Komponen `<MaterialAutocomplete />` di Modul Limbah & Produksi:** Ganti `<select>` ratusan bahan baku di `WasteLogs.jsx` dan `MaterialProduction.jsx` dengan pencarian debounce. | `src/pages/shared/WasteLogs.jsx`<br/>`src/pages/shared/MaterialProduction.jsx` | Pengalaman memilih bahan baku konsisten, cepat, dan bebas gulir panjang di seluruh modul aplikasi. |
| **P1 (Tinggi)** | **UPG-06** | **Penyelarasan Kategori Marketlist & Modal Edit Pembelian:** Sinkronkan filter kategori `Marketlist.jsx` dengan data riil database, serta ganti 4 `window.prompt()` beruntun di `Purchasing.jsx` dengan Modal Edit satu layar. | `src/pages/shared/Marketlist.jsx`<br/>`src/pages/shared/Purchasing.jsx` | Seluruh kategori bahan dapat difilter dengan akurat dan proses revisi data pembelian menjadi aman di perangkat mobile. |
| **P2 (Menengah)**| **UPG-07** | **Pembersihan Navigasi Melayang (`ContextualFloatingNav.jsx`):** Hilangkan kapsul navigasi bawah yang menduplikasi `TabContainer` atas agar tidak menutupi tombol aksi di bagian bawah layar HP. | `src/components/ContextualFloatingNav.jsx`<br/>`src/components/AppLayout.jsx` | Area bawah layar ponsel bersih dan tidak ada lagi tombol atau checkbox yang tertutup kapsul mengambang. |
