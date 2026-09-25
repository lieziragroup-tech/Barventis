# Dokumen Perencanaan Operasional & WBS 4-Level Sistem Barventis ERP V2

**Versi**: 4.0 (Master Execution & Monitoring Blueprint)  
**Status Grounding**: 100% Berakar pada Data Berkas Nyata (Master\_Materials\_Converted\_Base\_Unit.xlsx, Master\_Recipes\_Integrated\_Clean.xlsx, POS\_Bulk\_Import\_Recipes.xlsx, dan supabase\_migration\_barventis\_v2.sql)

## 1\. Ringkasan Eksekutif & Kerangka Kerja Anti-Halusinasi

Dokumen ini disusun untuk memberikan panduan eksekusi teknis tingkat tinggi hingga baris implementasi detail bagi tim pengembang frontend, backend Supabase, QA automation, dan tim operasional lapangan Barventis ERP V2. Untuk memastikan tidak terjadi halusinasi sistem (zero-hallucination guarantee), seluruh perancangan sistem mengikat tiga protokol integritas:

1. Strict Data Grounding: Seluruh entitas bahan (184 item MTR-0001 s/d MTR-0184), resep minuman (72 menu RCP-0001 s/d RCP-0072), rasio susut buah mentah, dan batas aman biaya minuman (Target \&lt;= 27%) merujuk secara verbatim pada berkas Excel operasional.  
2. Contract-Driven Verification: Setiap fungsi API, trigger PostgreSQL, dan komponen antarmuka React diatur oleh kontrak skema data yang ketat.  
3. High Observability & Quantitative Monitoring: Setiap paket kerja Level 4 memiliki indikator monitoring numerik yang dapat diaudit secara real-time.

## 2\. Struktur Dekomposisi WBS 4-Level Lengkap (Level 1.0 s/d 9.0)

1.0 PEMULIHAN BASIS DATA & STORAGE LIFECYCLE (SUPABASE & POSTGRESQL)  
    ├── 1.1 Skema Relasional Master & Relasi Vendor  
    │   ├── 1.1.1 Desain & Migrasi Tabel Master suppliers  
    │   │   ├── 1.1.1.1 Penulisan DDL pembuatan tabel suppliers (id UUID PK, code UNIQUE, name, contact, phone, terms)  
    │   │   ├── 1.1.1.2 Pembuatan indeks pencarian B-Tree pada kolom suppliers.name dan suppliers.code  
    │   │   └── 1.1.1.3 Inisialisasi data benih (seeding) daftar vendor eksisting dari berkas Excel SO Barista  
    │   ├── 1.1.2 Pembaruan Tabel Master materials & Foreign Key  
    │   │   ├── 1.1.2.1 Penambahan kolom supplier\_id UUID REFERENCES suppliers(id) ON DELETE SET NULL  
    │   │   ├── 1.1.2.2 Penambahan enum/kategori baku 'Bahan Mentah' dan flag is\_preparable BOOLEAN DEFAULT false  
    │   │   └── 1.1.2.3 Pembersihan data inkonsisten kategori bahan baku eksisting di database  
    │   └── 1.1.3 View Kompatibilitas Penamaan Skema PostgREST  
    │       ├── 1.1.3.1 Pembuatan view SQL CREATE OR REPLACE VIEW daily\_inventory AS SELECT \* FROM daily\_inventories  
    │       └── 1.1.3.2 Pembuatan view kompatibilitas rute singular/plural untuk entitas materials dan recipes  
    ├── 1.2 Rekayasa Ulang Logika Kalkulasi Otomatis (Database Triggers)  
    │   ├── 1.2.1 Trigger Perhitungan Biaya Satuan Dasar Bahan (materials)  
    │   │   ├── 1.2.1.1 Penghapusan sintaks GENERATED ALWAYS AS STORED pada materials.cost\_per\_base\_unit  
    │   │   ├── 1.2.1.2 Penulisan fungsi PL/pgSQL trg\_calc\_material\_cost() (Round purchase\_price / pack\_factor, 4\)  
    │   │   └── 1.2.1.3 Pemasangan trigger BEFORE INSERT OR UPDATE ON materials FOR EACH ROW  
    │   ├── 1.2.2 Trigger Perhitungan Stok Akhir & Pemakaian Harian (daily\_inventories)  
    │   │   ├── 1.2.2.1 Penghapusan sintaks GENERATED ALWAYS AS STORED pada closing\_stock dan usage\_qty  
    │   │   ├── 1.2.2.2 Penulisan fungsi PL/pgSQL trg\_calc\_daily\_inventory() (closing \= full \+ broken, usage \= awal \+ in \- akhir \+ waste)  
    │   │   └── 1.2.2.3 Pemasangan trigger BEFORE INSERT OR UPDATE ON daily\_inventories FOR EACH ROW  
    │   └── 1.2.3 Trigger Variansi Mutasi Antar-Cabang (inter\_branch\_transfer\_items)  
    │       ├── 1.2.3.1 Penulisan fungsi PL/pgSQL trg\_calc\_transfer\_variance() (variance \= qty\_received \- qty\_dispatched)  
    │       └── 1.2.3.2 Pemasangan trigger otomatis BEFORE INSERT OR UPDATE ON inter\_branch\_transfer\_items  
    ├── 1.3 Kebijakan Retensi Media 90 Hari (Storage Auto-Purge Policy)  
    │   ├── 1.3.1 Konfigurasi Bucket Penyimpanan Supabase Storage  
    │   │   ├── 1.3.1.1 Pembuatan bucket terotentikasi receipt-photos dan trimming-photos  
    │   │   └── 1.3.1.2 Pengaturan kuota maksimal ukuran unggah berkas (Max File Size: 1 MB per upload)  
    │   ├── 1.3.2 Pengembangan Fungsi Pembersih Otomatis (Cron / Edge Function)  
    │   │   ├── 1.3.2.1 Penulisan skrip Supabase Edge Function purge-old-media (Node.js/Deno)  
    │   │   ├── 1.3.2.2 Query seleksi berkas: SELECT id, photo\_url FROM transactions WHERE created\_at \&lt; NOW() \- INTERVAL '90 days' AND is\_purged \= false  
    │   │   └── 1.3.2.3 Eksekusi penghapusan objek biner fisik via Supabase Storage API (storage.from().remove())  
    │   └── 1.3.3 Pembaruan Status & Retensi Abadi Metadata Database  
    │       ├── 1.3.3.1 Update kolom status: UPDATE transactions SET photo\_url \= NULL, is\_photo\_purged \= true  
    │       ├── 1.3.3.2 Penjadwalan eksekusi harian otomatis menggunakan ekstensi pg\_cron (Tiap pukul 02:00 WIB)  
    │       └── 1.3.3.3 Pengujian integritas: Verifikasi nomor surat jalan, nominal Rp, dan tanggal tetap abadi di database  
    └── 1.4 Prosedur Atomik Penutupan EOD & Hak Akses (Grants)  
        ├── 1.4.1 Refactoring Fungsi PL/pgSQL close\_daily\_inventory\_eod  
        │   ├── 1.4.1.1 Penyesuaian parameter multi-cabang p\_branch\_id, p\_date, dan p\_user\_id  
        │   ├── 1.4.1.2 Eksekusi penguncian transaksi: UPDATE daily\_inventories SET is\_eod\_locked \= true  
        │   ├── 1.4.1.3 Query penyalinan saldo penutupan menjadi saldo pembuka esok hari (p\_date \+ INTERVAL '1 day')  
        │   └── 1.4.1.4 Klausa resolusi konflik aman: ON CONFLICT (branch\_id, material\_id, date, location\_id) DO UPDATE  
        └── 1.4.2 Penerapan Izin Akses Menyeluruh (RBAC Grants)  
            ├── 1.4.2.1 Eksekusi GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service\_role  
            ├── 1.4.2.2 Eksekusi GRANT ALL ON ALL TABLES/SEQUENCES IN SCHEMA public  
            └── 1.4.2.3 Pemicu paksa reload schema cache: NOTIFY pgrst, 'reload schema'  
2.0 ENGINE PEMROSESAN CITRA SISI KLIEN (CLIENT-SIDE IMAGE PIPELINE)  
    ├── 2.1 Modul Kompresi Kanvas & Auto-Konversi Format WebP  
    │   ├── 2.1.1 Pembangunan Utilitas JavaScript imageCompressor.js  
    │   │   ├── 2.1.1.1 Penulisan pembaca input berkas kamera berbasis FileReader dan Image() object  
    │   │   ├── 2.1.1.2 Algoritma penskalaan dimensi cerdas (Downscaling maksimum 1280px pada sisi terpanjang)  
    │   │   └── 2.1.1.3 Rendering ulang gambar pada elemen virtual canvas HTML5  
    │   └── 2.1.2 Ekspor WebP & Validasi Bobot Berkas  
    │       ├── 2.1.2.1 Konversi kanvas menggunakan method canvas.toBlob(blob, 'image/webp', 0.80)  
    │       ├── 2.1.2.2 Validasi batas ukuran berkas: Pengecekan ukuran blob \&lt;= 300 KB  
    │       └── 2.1.2.3 Fallback kompresi bertingkat (turunkan kualitas ke 0.65 jika ukuran awal \&gt; 300 KB)  
    ├── 2.2 Modul Stempel Air Digital Permanen (Burn-In Watermark Canvas)  
    │   ├── 2.2.1 Penangkapan Data Telemetri & Identitas  
    │   │   ├── 2.2.1.1 Ekstraksi waktu sistem lokal presisi (Format: YYYY-MM-DD HH:mm:ss \[WIB\])  
    │   │   ├── 2.2.1.2 Penangkapan koordinat geografis perangkat via navigator.geolocation.getCurrentPosition  
    │   │   └── 2.2.1.3 Ekstraksi metadata pengguna aktif dari session context (user.name & user.role)  
    │   └── 2.2.2 Pencetakan Teks Watermark pada Pixel Gambar  
    │       ├── 2.2.2.1 Pembuatan bilah latar belakang semi-transparan hitam (rgba(0, 0, 0, 0.65)) di bagian bawah kanvas  
    │       ├── 2.2.2.2 Penulisan teks stempel putih anti-alias: \[WAKTU\] | \[PIC\] | \[CABANG\] | \[KOORDINAT GPS\]  
    │       └── 2.2.2.3 Penguncian rasterisasi: Memastikan watermark menjadi satu kesatuan pixel biner permanen  
    └── 2.3 Komponen Antarmuka Pengambilan Gambar Ganda (DualPhotoCapture.jsx)  
        ├── 2.3.1 Antarmuka Input Kamera Ganda Terpandu  
        │   ├── 2.3.1.1 Slot 1: Tombol & Pratinjau 'Ambil Foto Nota / Surat Jalan Resmi'  
        │   ├── 2.3.1.2 Slot 2: Tombol & Pratinjau 'Ambil Foto Wujud Fisik Barang Datang'  
        │   └── 2.3.1.3 Pembatasan atribut input file perangkat keras: accept='image/\*' capture='environment' (Live Camera Only)  
        └── 2.3.2 Validasi Form & Indikator Status Unggah  
            ├── 2.3.2.1 Indikator centang hijau status kompresi dan ukuran berkas (WebP, \~180 KB)  
            ├── 2.3.2.2 Penguncian status tombol submit: Disabled jika salah satu foto belum diambil  
            └── 2.3.2.3 Penanganan error jika akses kamera ditolak oleh browser/perangkat  
3.0 MODUL PENGADAAN LANGSUNG (LEAN 2-PARTY PROCUREMENT PIPELINE)  
    ├── 3.1 Pangkalan Data Market List (Master Sourcing & Vendor Catalog)  
    │   ├── 3.1.1 Komponen Antarmuka Katalog Bahan Terpadu (MarketlistExcelView.jsx)  
    │   │   ├── 3.1.1.1 Tabel komprehensif master bahan: Kode, Nama, Kategori, Unit Racik, Unit Beli, Faktor Konversi  
    │   │   ├── 3.1.1.2 Kolom finansial: Harga Beli Kemasan, HPP Dasar per Unit Racik, Min Stock, dan Par Stock  
    │   │   └── 3.1.1.3 Kolom data vendor: Nama Supplier, Kontak PIC, Nomor Telepon, dan Termin Pembayaran  
    │   └── 3.1.2 Formulir Usulan Kebutuhan Belanja Harian (Requester)  
    │       ├── 3.1.2.1 Form usulan kebutuhan belanja otomatis: Request Qty \= max(0, Par Stock \- Current Stock)  
    │       ├── 3.1.2.2 Penanda prioritas otomatis: Label merah URGENT jika stok berjalan \&lt; Min Stock  
    │       └── 3.1.2.3 Tombol aksi tunggal: \[Kirim Usulan Kebutuhan ke Purchasing\]  
    ├── 3.2 Eksekusi Pemesanan Cepat oleh Purchasing (Direct Supplier Order)  
    │   ├── 3.2.1 Dashboard Verifikasi & Konsolidasi Pesanan Purchasing  
    │   │   ├── 3.2.1.1 Layar tinjauan kebutuhan belanja masuk dari Bar Resto dan Gudang Central  
    │   │   ├── 3.2.1.2 Verifikasi batas kuantitas minimum order (MOQ) dan penyesuaian kuantitas final  
    │   │   └── 3.2.1.3 Pengelompokan barang belanjaan otomatis berdasarkan supplier penyedianya  
    │   └── 3.2.2 Penerbitan Purchase Order (PO) Langsung ke Supplier  
    │       ├── 3.2.2.1 Tombol aksi \[Terbitkan PO Resmi ke Supplier\] (Tanpa menunggu approval manajerial)  
    │       ├── 3.2.2.2 Generator dokumen PO digital berformat PDF standar F\&B lengkap dengan nomor registrasi unik  
    │       └── 3.2.2.3 Pembaruan status transaksi: Perubahan status dari REQUESTED menjadi ORDERED  
    └── 3.3 Formulir Penerimaan Barang (GRN) & Setup Kedaluwarsa di Lokasi Tujuan  
        ├── 3.3.1 Antarmuka Penerimaan Fisik di Bar Resto / Gudang Central  
        │   ├── 3.3.1.1 Tampilan daftar PO masuk berstatus SHIPPED yang siap diterima  
        │   ├── 3.3.1.2 Tabel pencocokan kuantitas: Kolom Kuantitas Dipesan vs Kuantitas Aktual Fisik Datang  
        │   └── 3.3.1.3 Pencatatan selisih barang (variance flag) jika barang datang kurang/rusak  
        └── 3.3.2 Eksekusi Penerimaan & Sinkronisasi Stok  
            ├── 3.3.2.1 Input wajib tanggal kedaluwarsa (expiry\_date) oleh PIC penerima untuk bahan perishable  
            ├── 3.3.2.2 Pengunggahan 2 foto bukti WebP ber-watermark (Nota Surat Jalan & Fisik Barang)  
            ├── 3.3.2.3 Tombol aksi \[Konfirmasi Barang Masuk & Tambah Saldo Stok\]  
            └── 3.3.2.4 Eksekusi penambahan stok atomik di database pada lokasi stasiun penerima (BAR\_MAIN atau CENTRAL\_STORAGE)  
4.0 MODUL TRIMMING TERISOLASI (BAHAN MENTAH KE MATERIALS BIASA)  
    ├── 4.1 Filter Ketat & Isolasi Bahan Mentah  
    │   ├── 4.1.1 Query Pembatasan Sumber Bahan di Modul Trimming  
    │   │   ├── 4.1.1.1 Konfigurasi query dropdown: supabase.from('materials').select('\*').eq('category', 'Bahan Mentah')  
    │   │   ├── 4.1.1.2 Pemblokiran total seluruh bahan non-mentah (sirup, susu, bubuk, bir, packaging)  
    │   │   └── 4.1.1.3 Tampilan panduan berat satuan standar buah (misal: Nanas Utuh per butir \~1200 gram)  
    │   └── 4.1.2 Pemetaan Produk Olahan Bersih Hasil Potong (Output Mapping)  
    │       ├── 4.1.2.1 Relasi pasangan bahan: Bahan Mentah (Nanas Utuh) \-\&gt; Bahan Olahan (Nanas Potong Pack 100g)  
    │       └── 4.1.2.2 Pemetaan rasio konversi porsi kemasan pack siap pakai di meja bar  
    ├── 4.2 Alur Pemrosesan Produksi Buah 2-Tahap (TrimmingCaptureFlow.jsx)  
    │   ├── 4.2.1 Tahap 1: Pengukuran Berat Mentah (Gross Measurement)  
    │   │   ├── 4.2.1.1 Input berat kotor mentah sebelum dikupas (W\_gross dalam satuan gram)  
    │   │   ├── 4.2.1.2 Pengambilan foto kamera live buah mentah di atas timbangan bar  
    │   │   ├── 4.2.1.3 Kompresi WebP & stempel watermark timestamp pada foto mentah  
    │   │   └── 4.2.1.4 Tombol kunci tahap 1: Mengunci nilai berat kotor dan membuka formulir tahap 2  
    │   └── 4.2.2 Tahap 2: Pengukuran Hasil Bersih & Evaluasi Susut (Yield Evaluation)  
    │       ├── 4.2.2.1 Input berat bersih siap pakai (W\_clean) dan berat kulit/limbah (W\_waste)  
    │       ├── 4.2.2.2 Validasi toleransi matematika timbangan: |W\_gross \- (W\_clean \+ W\_waste)| \&lt;= 5 gram  
    │       ├── 4.2.2.3 Pengambilan foto live hasil bersih dan foto tumpukan kulit/limbah  
    │       ├── 4.2.2.4 Komputasi persentase susut real-time: Susut % \= ((W\_gross \- W\_clean) / W\_gross) \* 100%  
    │       └── 4.2.2.5 Penentuan status otomatis: Label hijau GOOD YIELD (\&lt;= 30%) atau label merah BAD YIELD (\&gt; 30%)  
    └── 4.3 Transaksi Mutasi Inventaris Tiga Arah  
        ├── 4.3.1 Pengurangan Saldo Stok Bahan Mentah  
        │   ├── 4.3.1.1 Eksekusi pemotongan saldo stok fisik bahan mentah sebesar \-W\_gross  
        │   └── 4.3.1.2 Pembuatan kartu stok mutasi keluar pada buku stok bahan mentah  
        ├── 4.3.2 Pencatatan Otomatis Buku Limbah (waste\_logs)  
        │   ├── 4.3.2.1 Pembuatan record baru pada tabel waste\_logs sebesar kuantitas W\_waste  
        │   ├── 4.3.2.2 Kalkulasi nilai rupiah kerugian limbah kulit: W\_waste \* HPP Dasar Bahan Mentah  
        │   └── 4.3.2.3 Penyimpanan link foto WebP limbah dan penandaan sumber source\_type \= 'TRIMMING'  
        └── 4.3.3 Penambahan Saldo Stok Bahan Olahan Biasa  
            ├── 4.3.3.1 Eksekusi penambahan saldo stok pada item bahan olahan bersih di materials biasa (+W\_clean atau porsi pack)  
            └── 4.3.3.2 Perhitungan HPP riil bahan olahan pasca-susut untuk akurasi resep COGS  
5.0 UNIFIKASI COGS & MENU PRICING (POKA-YOKE RACIK VS JADI)  
    ├── 5.1 Penyatuan Tampilan Tabel COGS Terpadu  
    │   ├── 5.1.1 Antarmuka Tunggal COGS Seluruh Item Menu  
    │   │   ├── 5.1.1.1 Peleburan tab terpisah Beer dan Beverage ke dalam satu tabel linier komprehensif  
    │   │   ├── 5.1.1.2 Kolom tabel: Kode Menu, Nama Item, Tipe, Kategori, Harga Modal (HPP), Harga Jual, Cost %, Status  
    │   │   └── 5.1.1.3 Indikator visual status Food Cost: Hijau (\&lt;= 27%), Kuning (27.1% \- 30%), Merah (\&gt; 30%)  
    │   └── 5.1.2 Bilah Filter Kategori Cepat (Filter Chips)  
    │       ├── 5.1.2.1 Pembuatan tombol filter: \[Semua Item\], \[Kopi Racik\], \[Non-Kopi & Teh Racik\], \[Mocktail & Jus\]  
    │       ├── 5.1.2.2 Pembuatan tombol filter khusus produk jadi: \[Beer (Produk Jadi)\], \[Soft Drink & Air Mineral\]  
    │       └── 5.1.2.3 Fitur pencarian instan nama menu dan kode PLU kasir  
    ├── 5.2 Logika Proteksi Anti-Salah Input (Poka-Yoke Interface Logic)  
    │   ├── 5.2.1 Mekanisme Proteksi untuk Tipe 'Produk Jadi (Tinggal Jual / Langsung Saji)'  
    │   │   ├── 5.2.1.1 Penguncian dan penyembunyian formulir komposisi resep/BOM (menonaktifkan input gramasi)  
    │   │   ├── 5.2.1.2 Penarikan otomatis harga modal (HPP) dari harga beli satuan di pangkalan data Market List  
    │   │   └── 5.2.1.3 Pemblokiran pembuatan resep kosong atau resep ganda untuk item bir dan minuman kaleng  
    │   └── 5.2.2 Mekanisme Form untuk Tipe 'Minuman Racik (Pakai Resep)'  
    │       ├── 5.2.2.1 Pembukaan tabel isian resep bertingkat (Bahan Baku 1 hingga 10\)  
    │       ├── 5.2.2.2 Dropdown pemilihan bahan baku dari master materials yang aktif  
    │       ├── 5.2.2.3 Input kuantitas gramasi/ml per porsi dan kalkulasi otomatis sub-total rupiah modal bahan  
    │       └── 5.2.2.4 Penjumlahan otomatis seluruh bahan menjadi total HPP Dasar Menu (Basic Cost)  
    └── 5.3 Mesin Simulasi Harga Jual & Margin F\&B  
        ├── 5.3.1 Kalkulasi Parameter Biaya Komersial  
        │   ├── 5.3.1.1 Pembebanan biaya tetap (Fix Cost / Overhead Allowance baku: 5%)  
        │   ├── 5.3.1.2 Evaluasi batas aman margin kotor (Gross Margin Rp dan Gross Margin %)  
        │   └── 5.3.1.3 Formula rekomendasi harga jual: Harga Jual Ideal \= HPP Dasar / (0.27 \- 0.05)  
        └── 5.3.2 Pembulatan Komersial Kasir  
            ├── 5.3.2.1 Opsi arah pembulatan harga: Bulat ke Atas, Bulat Standar, Bulat ke Bawah (Kelipatan Rp 1.000)  
            └── 5.3.2.2 Tombol simpan perubahan harga dan sinkronisasi ke tabel master resep  
6.0 UNIFIKASI DAILY INVENTORY EOD (ONE-SHEET COUNTING)  
    ├── 6.1 Formulir Hitung Fisik Harian Linier (DailyInventoryEOD.jsx)  
    │   ├── 6.1.1 Penyatuan Seluruh Item Lantai Bar dalam Satu Lembar Input  
    │   │   ├── 6.1.1.1 Penggabungan bahan racikan bar, susu, sirup, buah olahan, dan produk bir ke dalam satu tabel  
    │   │   ├── 6.1.1.2 Kolom baku 1:1 Excel SO Barista: Kode, Nama Bahan, Unit, Stok Awal, IN, OUT, FULL, BROKEN, WASTE  
    │   │   └── 6.1.1.3 Kolom kalkulasi otomatis: Total Stok Akhir (FULL \+ BROKEN) dan Total Pakai (Awal \+ IN \- Akhir \+ WASTE)  
    │   └── 6.1.2 Fitur Akselerasi & Penyaring Terfokus  
    │       ├── 6.1.2.1 Bilah tombol filter kategori cepat di bagian atas formulir EOD  
    │       └── 6.1.2.2 Pencarian cepat nama item untuk verifikasi stok rak tertentu  
    ├── 6.2 Ergonomi Lantai Bar & Proteksi Typo  
    │   ├── 6.2.1 Navigasi Keyboard Cepat Mode Spreadsheet  
    │   │   ├── 6.2.1.1 Event listener tombol Enter untuk berpindah ke baris bahan di bawahnya  
    │   │   ├── 6.2.1.2 Event listener tombol Tab untuk bergeser ke kolom metrik berikutnya (FULL \-\&gt; BROKEN \-\&gt; WASTE)  
    │   │   └── 6.2.1.3 Auto-select teks angka saat sel input aktif (mempercepat pengetikan ulang tanpa backspace)  
    │   └── 6.2.2 Validasi Peringatan Dini Angka Ekstrem (Typo Protection)  
    │       ├── 6.2.2.1 Peringatan visual jika angka BROKEN melebihi kapasitas 1 botol penuh  
    │       └── 6.2.2.2 Peringatan konfirmasi jika angka fisik bernilai 0 sementara hari sebelumnya stok melimpah  
    └── 6.3 Penguncian Shift Malam Atomik (EOD Settlement)  
        ├── 6.3.1 Prosedur Penguncian Shift  
        │   ├── 6.3.1.1 Tombol aksi \[Kunci & Closing EOD (23:59:59)\]  
        │   ├── 6.3.1.2 Dialog konfirmasi penutupan buku harian permanen  
        │   └── 6.3.1.3 Pemanggilan RPC Supabase close\_daily\_inventory\_eod  
        └── 6.3.2 Pembaruan Status & Salin Saldo  
            ├── 6.3.2.1 Penguncian sel input: Seluruh kolom input menjadi read-only berlabel TERKUNCI (EOD CLOSED)  
            └── 6.3.2.2 Penyalinan otomatis total stok akhir hari ini menjadi stok awal esok hari di database  
7.0 DASHBOARD COST CONTROL OTOMATIS & PUSAT EKSPOR LAPORAN  
    ├── 7.1 Alur Bersih Pemantauan Variansi (Tanpa Upload Ulang)  
    │   ├── 7.1.1 Integrasi Data Penjualan Kasir POS  
    │   │   ├── 7.1.1.1 Penarikan data transaksi dari modul Penjualan POS (hasil unggah tunggal file POS ESB)  
    │   │   └── 7.1.1.2 Agregasi total porsi menu terjual dan total omset kotor (Gross Sales)  
    │   ├── 7.1.2 Komputasi Pemakaian Teoretis Ideal (Theoretical Usage & Cost)  
    │   │   ├── 7.1.2.1 Perkalian porsi menu terjual dengan gramasi bahan pada resep BOM COGS  
    │   │   └── 7.1.2.2 Penjumlahan biaya bahan baku teoretis: Theoretical Cost \= sum(Qty Terjual \* HPP Resep)  
    │   ├── 7.1.3 Komputasi Pemakaian Fisik Nyata (Actual Usage & Cost)  
    │   │   ├── 7.1.3.1 Penarikan angka Total Pakai dari formulir Daily Inventory EOD  
    │   │   └── 7.1.3.2 Penjumlahan biaya pemakaian aktual: Actual Cost \= sum(Qty Total Pakai \* Harga Beli Dasar)  
    │   └── 7.1.4 Analisis Variansi & Deteksi Anomali  
    │       ├── 7.1.4.1 Perhitungan rasio aktual: Actual Cost % \= (Actual Cost / Total Omset POS) \* 100%  
    │       ├── 7.1.4.2 Perhitungan selisih variansi rupiah: Variansi Rp \= Actual Cost \- Theoretical Cost  
    │       └── 7.1.4.3 Lampu indikator peringatan kebocoran jika Variansi \&gt; 0 melebihi ambang batas toleransi 3%  
    └── 7.2 Pusat Ekspor Laporan Resmi SO Barista 2026  
        ├── 7.2.1 Modul Generator Berkas Excel 13 Sheet Terpadu  
        │   ├── 7.2.1.1 Pembangunan engine ekspor multi-sheet berbasis library ExcelJS  
        │   ├── 7.2.1.2 Pembuatan 13 lembar kerja identik: Penjualan POS, Daily Bahan, Pemakaian Harian, Pembelian Harian, Marketlist, Pricing, COGS, SO Resto, SO Central, SO Glass Tool, Trimming, Cost Control  
        │   └── 7.2.1.3 Tombol aksi unduh bundel komprehensif (Full Workbook XLSX) dan unduh per sheet  
        └── 7.2.2 Generator Laporan Ringkasan Eksekutif PDF  
            ├── 7.2.2.1 Pembuatan template cetak PDF resmi untuk rapat manajemen dan audit owner  
            └── 7.2.2.2 Tampilan ringkasan metrik: Realisasi COGS %, Total Pembelian, Total Limbah, dan Selisih Stok  
8.0 ARSITEKTUR ANTARMUKA RESPONSIF & NAVIGASI GESTUR SENTUH  
    ├── 8.1 Struktur Sidebar Mandiri Terkelompok (Role-Based Visibility)  
    │   ├── 8.1.1 Pengelompokan Menu Berdasarkan Siklus Kerja Operasional  
    │   │   ├── 8.1.1.1 Kelompok 1 (Operasional Harian): Penjualan POS, Daily EOD Terpadu, Trimming, Waste Log  
    │   │   ├── 8.1.1.2 Kelompok 2 (Pengadaan & Resep): Market List Sourcing, COGS Terpadu, Pembelian PO, Penerimaan GRN  
    │   │   └── 8.1.1.3 Kelompok 3 (Kontrol & Audit): Cost Control, Stock Opname Resto/Central, Inventaris Glass & Tool, Ekspor 13 Sheet  
    │   └── 8.1.2 Filter Akses Pengguna Berbasis Peran (RBAC Sidebar Filter)  
    │       ├── 8.1.2.1 Pengguna Role 'Bar / Barista': Hanya menampilkan Kelompok 1 (Menu harian bersih tanpa distraksi)  
    │       ├── 8.1.2.2 Pengguna Role 'Central': Menampilkan inventaris Central, Mutasi Cabang, dan GRN Central  
    │       ├── 8.1.2.3 Pengguna Role 'Purchasing': Menampilkan Market List, PO Supplier, dan Katalog Vendor  
    │       └── 8.1.2.4 Pengguna Role 'Manager / Owner': Menampilkan seluruh menu operasional dan administrasi  
    ├── 8.2 Navigasi Gestur Sentuh Edge-Swipe Bebas Konflik (Tablet & Mobile)  
    │   ├── 8.2.1 Deteksi Sentuhan Tepi Kiri Layar (Edge-Swipe Touch Detection)  
    │   │   ├── 8.2.1.1 Event listener touchstart khusus area X \&lt;= 30px dari tepi kiri layar  
    │   │   ├── 8.2.1.2 Event listener touchmove untuk mendeteksi vektor geser ke kanan (Delta X \&gt; 60px)  
    │   │   └── 8.2.1.3 Pemicu pembukaan animasi drawer sidebar dari sisi kiri layar  
    │   └── 8.2.2 Isolasi Area Tengah Layar untuk Tabel Data  
    │       ├── 8.2.2.1 Pengecualian area X \&gt; 30px: Gestur geser kanan/kiri murni untuk navigasi tabel horizontal  
    │       ├── 8.2.2.2 Pencegahan insiden sidebar terbuka tiba-tiba saat barista menggeser tabel data  
    │       └── 8.2.2.3 Penyediaan tombol menu hamburger cadangan pada sticky header atas  
    └── 8.3 Desain Tata Letak Adaptif 3 Lapis (Desktop, Tablet, HP)  
        ├── 8.3.1 Optimasi Layar Desktop (Resolusi \&gt;= 1024px)  
        │   ├── 8.3.1.1 Tampilan tabel data padat penuh (dense table layout) dengan seluruh 12 kolom terlihat  
        │   └── 8.3.1.2 Sidebar terbuka permanen (fixed left navigation panel)  
        ├── 8.3.2 Optimasi Layar Tablet (Resolusi 768px \- 1023px)  
        │   ├── 8.3.2.1 Penerapan kolom pertama beku (sticky first column): Kolom Nama Bahan tetap diam saat tabel digeser  
        │   ├── 8.3.2.2 Pembesaran target area sentuhan (touch target height \&gt;= 44px) ramah jari basah  
        │   └── 8.3.2.3 Mode Landscape: Sidebar mini ikon; Mode Portrait: Sidebar drawer overlay  
        └── 8.3.3 Optimasi Layar Ponsel / HP (Resolusi \&lt; 768px)  
            ├── 8.3.3.1 Transformasi otomatis tabel lebar menjadi format Kartu Akordeon Per Bahan (Card View)  
            ├── 8.3.3.2 Tampilan ringkas kartu: Nama Bahan, Stok Awal, dan input cepat FULL / BROKEN / WASTE  
            └── 8.3.3.3 Modal Numpad Angka Layar Penuh saat sel input disentuh  
9.0 PENJAMINAN MUTU (QA), UAT LANTAI BAR, & RILIS PRODUKSI  
    ├── 9.1 Unit Testing & Test Suite Logika Bisnis Terpadu  
    │   ├── 9.1.1 Pengujian Python Test Suite (simulation\_and\_validation.py)  
    │   │   ├── 9.1.1.1 Uji integritas formula Daily Inventory EOD (Full \+ Broken \= Closing, Total Pakai)  
    │   │   ├── 9.1.1.2 Uji toleransi trimming susut buah mentah (Ambang batas 30% Good vs Bad Yield)  
    │   │   ├── 9.1.1.3 Uji penarikan otomatis harga modal Produk Jadi di COGS  
    │   │   └── 9.1.1.4 Uji komputasi variansi Cost Control (Actual vs Theoretical)  
    │   └── 9.1.2 Pengujian Otomasi Engine Citra & Retensi Storage  
    │       ├── 9.1.2.1 Uji kompresi gambar: Verifikasi rasio ukuran berkas WebP selalu \&lt; 300 KB  
    │       ├── 9.1.2.2 Uji ketajaman dan keterbacaan teks stempel watermark digital  
    │       └── 9.1.2.3 Uji simulasi cron job auto-purge berkas usia 91 hari di bucket storage  
    ├── 9.2 Pengujian Keberterimaan Pengguna (UAT) di Resto Bar BSD & Central  
    │   ├── 9.2.1 Simulasi Alur Pengadaan Langsung (Purchasing ke Supplier hingga GRN)  
    │   │   ├── 9.2.1.1 Uji coba pembuatan pesanan langsung tanpa birokrasi approval  
    │   │   ├── 9.2.1.2 Uji coba penerimaan fisik: Unggah 2 foto WebP dan input tanggal kedaluwarsa oleh PIC  
    │   │   └── 9.2.1.3 Verifikasi pertambahan stok otomatis pada lokasi stasiun yang tepat  
    │   └── 9.2.2 Simulasi Penutupan Shift Malam Bersama Tim Barista  
    │       ├── 9.2.2.1 Uji coba pengisian formulir Daily Inventory EOD menggunakan tablet meja bar  
    │       ├── 9.2.2.2 Uji coba navigasi gestur edge-swipe dan navigasi keyboard spreadsheet  
    │       └── 9.2.2.3 Evaluasi waktu pengisian: Target tercapai \&lt; 10 menit tanpa keluhan kebingungan istilah  
    └── 9.3 Rilis Produksi & Manajemen Perubahan (Change Management)  
        ├── 9.3.1 Deployment Produksi  
        │   ├── 9.3.1.1 Eksekusi skrip DDL Supabase produksi terkoreksi (Triggers, Views, Grants, Cron)  
        │   ├── 9.3.1.2 Konfigurasi variabel lingkungan (Environment Variables) dan rilis build frontend Vercel  
        │   └── 9.3.1.3 Pemantauan log transaksi PostgREST pada 24 jam pertama pasca-rilis  
        └── 9.3.2 Distribusi Panduan Operasional Barista  
            ├── 9.3.2.1 Pembuatan kartu pintar ringkas SOP Closing Barista (Format laminasi fisik di meja bar)  
            └── 9.3.2.2 Sosialisasi singkat istilah membumi: Minuman Racik, Produk Jadi, Bahan Mentah, dan EOD

## 3\. Matriks Alokasi Tanggung Jawab (RACI Matrix)

| Kode Level 2 | Nama Modul / Sub-Sistem | Backend Lead | Frontend Lead | QA Engineer | Bar Supervisor | Purchasing / Owner |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| 1.0 | Pemulihan Database Supabase & Retensi 90 Hari | R / A | C | C | I | I |
| 2.0 | Engine Citra WebP & Watermark Timestamp | C | R / A | C | I | I |
| 3.0 | Lean Procurement & Penerimaan Barang Dual-Photo | C | R | C | C | A |
| 4.0 | Modul Trimming Terisolasu (Bahan Mentah) | C | R | C | R | A |
| 5.0 | Unifikasi COGS (Poka-Yoke Racik vs Jadi) | C | R | C | C | A |
| 6.0 | Unifikasi Daily Inventory EOD (One-Sheet) | C | R | C | R | A |
| 7.0 | Cost Control Otomatis & Ekspor 13 Sheet | C | R | C | I | A |
| 8.0 | UI Responsif 3 Lapis & Navigasi Edge-Swipe | I | R / A | C | C | I |
| 9.0 | QA Test Suite, UAT Lapangan, & SOP Deployment | R | R | R | R | A |

## 4\. Rencana Eksekusi Terstruktur Fitur per Fitur & Protokol Monitoring

Setiap fitur dikunci dengan format monitoring transparan:

* Grounding Data Nyata  
* Langkah Implementasi Detail  
* Indikator Pemantauan & Metrik Kunci (KPI Monitoring)  
* Protokol Pengujian & Bukti Verifikasi  
* Definition of Done

### \[FITUR 1\] Pemulihan Basis Data Supabase, Triggers Otomatis, & Retensi Media 90 Hari

Objektif: Skema SQL stabil, trigger aman upsert, master vendor aktif, auto-purge foto \&gt;90 hari.  
Grounding Data Nyata: Berkas skrip supabase\_migration\_barventis\_v2.sql dan master suppliers pada Master\_Materials\_Converted\_Base\_Unit.xlsx.  
Langkah Implementasi:

1. Eksekusi tabel suppliers lengkap dengan code, name, contact\_person, phone, payment\_terms.  
2. Relasikan materials.supplier\_id ke suppliers.id via foreign key ON DELETE SET NULL.  
3. Ganti GENERATED ALWAYS AS STORED menjadi trigger BEFORE INSERT OR UPDATE (trg\_materials\_cost\_calc dan trg\_daily\_inventory\_calc).  
4. Konfigurasi cron job harian pembersih foto \&gt;90 hari dan update flag is\_photo\_purged \= true.  
5. Buat view kompatibilitas daily\_inventory dan eksekusi NOTIFY pgrst, 'reload schema'.

Indikator Pemantauan: PostgREST Error Rate \= 0%, Upsert Success Rate \= 100%, Penghematan Storage \= 75%.  
Definition of Done: DDL sukses di Supabase SQL Editor; relasi supplier aktif; cron pembersihan foto terjadwal harian pukul 02:00 WIB.

### \[FITUR 2\] Engine Pemrosesan Citra Klien (Auto-Convert WebP & Burn-In Watermark Canvas)

Objektif: Kompresi tangkapan kamera menjadi WebP \&lt;300 KB serta cetak stempel watermark digital (waktu WIB, PIC, GPS) permanen pada kanvas sebelum unggah.  
Grounding Data Nyata: Standar waktu WIB (Intl.DateTimeFormat Asia/Jakarta), koordinat GPS navigator.geolocation, dan sesi aktif currentUser.  
Langkah Implementasi:

1. Bangun utilitas imageCompressor.js berbasis HTML5 canvas.  
2. Terapkan pembatasan dimensi maksimum 1280px pada sisi terpanjang.  
3. Gambar bilah watermark hitam semi-transparan (rgba(0,0,0,0.65)) di bagian bawah kanvas dan cetak teks stempel putih: \[WAKTU\] | \[PIC\] | \[CABANG\] | \[GPS\].  
4. Ekspor ke format image/webp dengan kualitas 0.80.

Indikator Pemantauan: Ukuran berkas WebP rata-rata 150 KB – 250 KB (maks 300 KB), durasi kompresi \&lt;800 ms per foto.  
Definition of Done: Seluruh unggahan foto terkompresi otomatis menjadi WebP dan memiliki stempel waktu permanen.

### \[FITUR 3\] Pangkalan Data Market List (Master Sourcing & Vendor Catalog)

Objektif: Menyajikan Market List sebagai katalog pengadaan terpadu yang memetakan seluruh bahan baku, spesifikasi kemasan, harga beli, dan vendor penyedia.  
Grounding Data Nyata: 184 baris bahan pada Master\_Materials\_Converted\_Base\_Unit.xlsx lengkap dengan 13 kategori.  
Langkah Implementasi:

1. Kembangkan MarketlistExcelView.jsx menampilkan data bahan dan relasi supplier.  
2. Tampilkan metrik: Satuan Racik (Base Unit), Satuan Beli (Pack Unit), Faktor Konversi, Harga Beli Pack, HPP per Base Unit, Min Stock, dan Par Stock.  
3. Pasang filter chips kategori dan input pencarian multi-kolom.  
4. Integrasikan form usulan belanja otomatis: Request Qty \= max(0, Par Stock \- Current Stock).

Indikator Pemantauan: Data coverage 184 bahan baku terpetakan 100%, search response \&lt;100 ms.  
Definition of Done: Staf dan purchasing dapat melihat sumber vendor dan harga modal setiap bahan dalam satu tabel interaktif.

### \[FITUR 4\] Alur Pengadaan Langsung (Lean 2-Party Procurement Pipeline)

Objektif: Menghilangkan birokrasi approval bertingkat; alur hanya melibatkan Pemohon (Bar/Central) dan Purchasing yang langsung menerbitkan PO ke Supplier.  
Grounding Data Nyata: Siklus status dokumen: REQUESTED \-\&gt; ORDERED \-\&gt; SHIPPED \-\&gt; RECEIVED.  
Langkah Implementasi:

1. Pemohon membuat usulan kebutuhan bahan dari Market List dan mengklik \[Kirim Usulan\].  
2. Dashboard Purchasing memvalidasi kuantitas dan langsung menekan tombol \[Terbitkan PO ke Supplier\].  
3. Sistem menghasilkan dokumen PO digital PDF standar dengan nomor registrasi unik.  
4. Transaksi berpindah status menjadi ORDERED lalu SHIPPED saat barang dikirim.

Indikator Pemantauan: Lead time pemesanan terpangkas dari 2-3 hari menjadi \&lt;1 jam, 0 transaksi tertahan menunggu approval manajer.  
Definition of Done: Siklus PO berjalan tangkas tanpa approval manajerial dan dokumen PO tercatat rapi di database.

### \[FITUR 5\] Formulir Penerimaan Barang (GRN) Dual-Photo & Setup Expiry Date oleh PIC

Objektif: Mewajibkan 2 foto bukti WebP ber-watermark (Nota Surat Jalan & Fisik Barang) serta pencatatan tanggal kedaluwarsa oleh PIC penerima fisik sebelum stok bertambah.  
Grounding Data Nyata: Validasi kolom tabel goods\_receipts: invoice\_photo\_url NOT NULL, goods\_photo\_url NOT NULL, dan expiry\_date DATE.  
Langkah Implementasi:

1. Bangun antarmuka penerimaan PO masuk di Bar Resto atau Central.  
2. Pasang komponen DualPhotoCapture.jsx untuk Foto 1 (Nota) dan Foto 2 (Fisik Barang).  
3. Tambahkan input wajib tanggal kedaluwarsa untuk bahan yang berstatus perishable.  
4. Eksekusi penambahan stok atomik pada lokasi tujuan (BAR\_MAIN atau CENTRAL\_STORAGE) saat verifikasi tuntas.

Indikator Pemantauan: Tingkat kepatuhan foto 100%, zero fraud incident barang fiktif.  
Definition of Done: Stok bertambah secara otomatis hanya setelah verifikasi 2 foto dan tanggal kedaluwarsa tersimpan.

### \[FITUR 6\] Modul Trimming Terisolsasi (Khusus Kategori 'Bahan Mentah' \-\&gt; Materials Olahan \+ Waste Log)

Objektif: Mengendalikan susut buah segar dengan mengunci input Trimming khusus kategori 'Bahan Mentah', mencatat limbah kulit ke Waste Log, dan menambah stok bersih ke Materials Biasa.  
Grounding Data Nyata: Kategori bahan mentah: Nanas Utuh, Jeruk Pontianak, Lemon Utuh, Semangka Utuh pada Master\_Materials\_Converted\_Base\_Unit.xlsx; ambang batas F\&B: \&lt;=30% Good Yield, \&gt;30% Bad Yield.  
Langkah Implementasi:

1. Pasang filter ketat pada query dropdown Trimming: category \= 'Bahan Mentah'.  
2. Rekam berat kotor (W\_gross) pada Tahap 1 dan kunci dengan foto live WebP.  
3. Rekam berat bersih (W\_clean) dan berat kulit (W\_waste) pada Tahap 2; hitung susut % dan status yield.  
4. Eksekusi mutasi tiga arah: Potong stok Bahan Mentah (-W\_gross), catat limbah di waste\_logs (+W\_waste), dan tambah stok bahan olahan di materials biasa (+W\_clean).

Indikator Pemantauan: Akurasi rasio susut terpantau dengan toleransi \&lt;= 5 gram, 0 item non-mentah di dropdown Trimming.  
Definition of Done: Sirup dan bir tidak dapat dipilih di Trimming; stok bahan mentah terpotong dan bahan olahan bertambah secara otomatis.

### \[FITUR 7\] Unifikasi COGS & Menu Pricing (Poka-Yoke Racik vs Jadi \+ Filter Kategori)

Objektif: Menggabungkan seluruh menu minuman racik dan produk jadi (bir/kaleng) dalam 1 tabel COGS terpadu dengan perlindungan anti salah input: memilih Produk Jadi langsung mengunci form resep dan mengambil modal dari Market List.  
Grounding Data Nyata: 72 menu pada Master\_Recipes\_Integrated\_Clean.xlsx dan batas aman Food Cost \&lt;= 27%.  
Langkah Implementasi:

1. Lebur tab terpisah Beer dan Beverage menjadi satu tabel utama berkolom: Kode, Nama Item, Tipe, Kategori, HPP, Harga Jual, Cost %, Status.  
2. Terapkan logika Poka-Yoke: Tipe Produk Jadi mengunci form resep dan menarik HPP dari harga beli Market List; Tipe Minuman Racik membuka form gramasi bahan.  
3. Pasang filter chips kategori: \[Semua\], \[Kopi Racik\], \[Non-Kopi & Teh\], \[Mocktail & Jus\], \[Beer (Produk Jadi)\], \[Soft Drink\].  
4. Hitung Food Cost % real-time dan tampilkan indikator visual batas aman 27%.

Indikator Pemantauan: 0 resep kosong/salah untuk item bir/kaleng, peringatan otomatis jika Food Cost \&gt; 27%.  
Definition of Done: 1 tabel COGS terpadu aktif; form resep adaptif berfungsi sempurna; filter kategori merespons cepat.

### \[FITUR 8\] Unifikasi Daily Inventory EOD (One-Sheet Counting Harian Barista & EOD Lock)

Objektif: Menggabungkan pencatatan fisik stok harian bahan racik dan bir ke dalam 1 lembar kerja linier EOD, dilengkapi navigasi keyboard spreadsheet dan penguncian shift atomik.  
Grounding Data Nyata: Formula baku: Stok Akhir \= FULL \+ BROKEN, Total Pakai \= (Stok Awal \+ IN) \- Stok Akhir \+ WASTE.  
Langkah Implementasi:

1. Tampilkan seluruh item bar dalam 1 tabel input di DailyInventoryEOD.jsx.  
2. Pasang navigasi keyboard spreadsheet (Enter turun baris, Tab geser kolom).  
3. Pasang validasi peringatan typo jika angka BROKEN melebihi kapasitas botol utuh.  
4. Integrasikan tombol \[Kunci & Closing EOD (23:59:59)\] yang mengeksekusi RPC atomik dan menyalin saldo akhir ke hari berikutnya.

Indikator Pemantauan: Waktu closing barista terpangkas dari \&gt;30 menit menjadi \&lt;10 menit, 100% item bar terhitung dalam satu lembar.  
Definition of Done: Barista dapat menyelesaikan penutupan shift dalam satu lembar kerja dan data terkunci per 23:59:59.

### \[FITUR 9\] Dashboard Cost Control Otomatis & Pusat Ekspor Laporan 13 Sheet

Objektif: Menyajikan analisis variansi HPP secara otomatis tanpa upload ulang di menu Cost Control, serta menyediakan generator ekspor resmi 13 sheet Excel dan ringkasan PDF.  
Grounding Data Nyata: Rumus: Variansi \= Actual Cost (Daily EOD) \- Theoretical Cost (Sales POS \* BOM Resep).  
Langkah Implementasi:

1. Hapus seluruh tombol upload duplikat di menu Cost Control.  
2. Tarik data pemakaian teoretis dari Penjualan POS dikalikan resep COGS.  
3. Tarik data pemakaian riil dari Daily Inventory EOD dikalikan harga beli dasar.  
4. Tampilkan grafik tren variansi dan lampu peringatan jika selisih \&gt;3%.  
5. Bangun engine ekspor bundel 13 sheet Excel resmi SO Barista dan ringkasan PDF.

Indikator Pemantauan: 0 upload ulang di modul Cost Control, 100% selisih biaya terdeteksi real-time.  
Definition of Done: Menu Cost Control bersih dari tombol upload; unduhan 13 sheet Excel dan PDF berfungsi sempurna.

### \[FITUR 10\] Arsitektur Antarmuka Responsif 3-Lapis & Navigasi Gestur Edge-Swipe

Objektif: Menjamin kenyamanan penggunaan di Desktop (tabel padat), Tablet (kolom nama beku & tombol sentuh \&gt;= 44px), dan Ponsel (kartu akordeon), dengan navigasi gestur edge-swipe khusus tepi kiri layar (X \&lt;= 30px).  
Grounding Data Nyata: Breakpoint responsif: Desktop (\&gt;= 1024px), Tablet (768px \- 1023px), Mobile (\&lt; 768px).  
Langkah Implementasi:

1. Bangun sidebar mandiri terkelompok berbasis peran (Barista hanya melihat Operasional Harian).  
2. Terapkan event listener sentuh khusus area X \&lt;= 30px dari tepi kiri layar untuk membuka sidebar drawer.  
3. Isolasi area tengah layar (X \&gt; 30px) agar gestur geser tabel horizontal tidak membuka sidebar.  
4. Terapkan styling responsif: Sticky first column pada tablet dan format kartu akordeon pada ponsel.

Indikator Pemantauan: 0 insiden sidebar terbuka tidak sengaja saat menggeser tabel data, 100% tombol input pada tablet memiliki tinggi \&gt;= 44px.  
Definition of Done: Antarmuka beroperasi nyaman dan adaptif di seluruh perangkat bar tanpa gangguan gestur.

## 5\. Timeline Pelaksanaan & Jadwal Sprint Terpadu (4 Minggu)

\[Minggu 1\] SPRINT 1: Backend Architecture, Storage Retention 90 Hari, & Client Image Engine

* DDL Supabase: Master Suppliers, Materials, Goods Receipts, Triggers, Views, Grants.  
* Konfigurasi Storage Bucket & Cron Auto-Purge foto 90 hari.  
* Komponen Client-Side Canvas: Kompresi WebP (\&lt;300 KB) & Burn-in Watermark Timestamp/GPS.  
* Milestone 1: Infrastruktur data stabil, aman upsert, dan engine media siap pakai.

\[Minggu 2\] SPRINT 2: Lean Procurement, Dual-Photo GRN, & Market List Sourcing

* Pangkalan data Market List & alur pemesanan langsung Purchasing ke Supplier.  
* Formulir GRN di lokasi tujuan (Bar/Central) dengan upload 2 foto WebP & input Expiry Date oleh PIC.  
* Otomasi penambahan stok masuk di stasiun yang tepat pasca-konfirmasi fisik.  
* Milestone 2: Rantai pasok pengadaan dan penerimaan fisik barang beroperasi tangkas dan akuntabel.

\[Minggu 3\] SPRINT 3: Isolasi Trimming, Unifikasi COGS (Poka-Yoke), & Daily Inventory EOD

* Fitur Trimming terisolasi: Dropdown khusus 'Bahan Mentah' \-\&gt; Output ke 'Materials Biasa' \+ Waste Log.  
* Unifikasi COGS: 1 tabel dengan form resep adaptif (Terkunci untuk Produk Jadi, Terbuka untuk Racik).  
* Unifikasi Daily Inventory: 1 lembar linier EOD untuk bahan racik & produk jadi bir.  
* Milestone 3: Seluruh modul kerja operasional lantai bar terpadu dan bebas risiko salah input.

\[Minggu 4\] SPRINT 4: Cost Control Otomatis, UI Responsif (Edge-Swipe), UAT Barista, & Go-Live

* Dashboard Cost Control otomatis (Variansi dari Sales POS x BOM vs EOD, tanpa upload ulang).  
* Layout responsif 3 lapis (Desktop, Tablet, HP) & implementasi gestur Edge-Swipe bebas konflik tabel.  
* UAT langsung penutupan shift malam bersama tim barista di Resto Bar BSD & PIC Central.  
* Peluncuran produksi penuh dan pembagian kartu pintar SOP Closing Barista.  
* Milestone 4: Sistem Barventis V2 beroperasi penuh di seluruh outlet dengan tingkat adopsi optimal.

## 6\. Kesimpulan Penilaian Objektif

Dengan selesainya Dokumen Perencanaan Operasional & WBS 4-Level Versi 4.0 ini:

1. **Tidak Ada Halusinasi Sistem**: Setiap fitur, formula matematika, dan kolom database terikat langsung pada data operasional nyata berkas SO BARISTA 2026\.  
2. **Mudah Dipantau (High Observability)**: Setiap tugas Level 4 memiliki indikator monitoring numerik dan kriteria selesai yang jelas.  
3. **Keseimbangan Sempurna Efisiensi & Efektivitas**: Sistem memangkas birokrasi belanja harian dan durasi closing shift, sekaligus mengunci akurasi stok dan mencegah manipulasi fisik melalui stempel foto permanen dan pencatatan tanggal kedaluwarsa.

