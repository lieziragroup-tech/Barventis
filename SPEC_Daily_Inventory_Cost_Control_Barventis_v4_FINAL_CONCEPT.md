# Barventis — Daily Inventory & Cost Control v4

**Status:** Finalisasi desain konseptual dan acceptance criteria — menunggu sign-off sebelum implementasi  
**Batas pengerjaan:** Diskusi dan spesifikasi saja. Tidak ada perubahan kode, SQL, migration, atau database yang dilakukan dalam dokumen ini.  
**Cakupan:** Daily Inventory Bahan/Beer, alur FULL/BROKEN, opening/closing, konfirmasi nol, pagination/search, preview, multi-expiry lot, FEFO, produksi bahan setengah jadi, Cost Control, migrasi dari skema yang ada.

---

## 1. Keputusan yang sudah dikonfirmasi

1. Sistem mencatat Daily Inventory per tanggal operasional dan lokasi penyimpanan.
2. Stok awal suatu hari diwariskan dari closing hari sebelumnya yang sudah disahkan untuk material dan lokasi yang sama.
3. `IN`, `OUT`, `WASTE`, transfer, produksi, dan penyesuaian yang disahkan memengaruhi saldo sesuai jenis pergerakannya. Satu kejadian stok hanya boleh diposting satu kali.
4. `OUT` adalah pemakaian aktual yang diinput/dikonfirmasi staf. Penjualan ESB tidak otomatis mengurangi saldo fisik; ESB dipakai untuk omzet serta theoretical COGS.
5. `FULL` tidak perlu diinput manual. `FULL` closing dihitung sistem dari saldo buku, ukuran kemasan, dan BROKEN hasil penimbangan.
6. `BROKEN` ditimbang manual ketika closing dan diinput sebagai satu angka agregat per material/lokasi, bukan dipisah per expiry lot.
7. Semua material dalam Daily Inventory Bahan dan Beer mengikuti proses closing harian. Status “tidak ada aktivitas” boleh dikonfirmasi, tetapi belum diisi bukan berarti nol.
8. Pagination 25/50/100 item dan pencarian nama/SKU/kode dengan debounce disediakan. Draft dan state baris tidak boleh hilang saat halaman/filter berubah.
9. Pembelian dapat diterima di Central atau langsung di Resto.
10. Data lot/expiry disimpan per penerimaan. Kebijakan operasional: **maksimal satu lot aktif terbuka per material per lokasi**; lot berikutnya dipilih menggunakan FEFO. BROKEN agregat dihubungkan secara internal ke lot aktif.
11. Moving Weighted Average (WAC) per material/lokasi tetap menjadi rekomendasi valuasi, namun implementasi harus mencatatnya sebagai kebijakan operasional yang perlu disetujui owner/finance sebelum costing historis dijadikan angka resmi.
12. Stock opname Mei 2025 adalah arsip historis. Saldo operasional Juli–Agustus 2026 perlu direkonsiliasi terpisah sebelum dipakai sebagai saldo pembukaan terverifikasi.

## 2. Istilah dan definisi

### 2.1 Stok awal

Stok awal hari ini adalah saldo closing yang telah disahkan pada sesi hari sebelumnya, dengan snapshot dalam satuan dasar dan representasi kemasan:

- `opening_full_qty`: jumlah kemasan utuh pada closing sebelumnya, ditampilkan read-only.
- `opening_broken_qty_base`: sisa isi kemasan terbuka pada closing sebelumnya, dalam satuan dasar (contoh ml atau gram), ditampilkan read-only.
- `opening_qty_base = opening_full_qty × pack_size_base + opening_broken_qty_base`.

Stok awal bukan diambil bebas dari `materials.qty_resto` atau `materials.qty_central`, karena nilai master tersebut bukan pengganti riwayat transaksi per tanggal. Untuk hari pertama sistem atau hari yang memiliki celah closing, opening harus berasal dari saldo awal yang disetujui melalui stock opname/opening balance.

### 2.2 IN

Kuantitas barang yang masuk dari penerimaan sah, transfer masuk, atau produksi masuk. Jika sudah dibuat pada modul sumber, Daily Inventory menampilkannya secara otomatis sebagai referensi/mutasi; staf tidak mengetik ulang angka IN pada Daily Inventory.

### 2.3 OUT

Pemakaian aktual yang dikonfirmasi staf. Nilai ini bukan hasil turunan ESB dan tidak boleh dibuat ulang sebagai transaksi kedua ketika draft disimpan atau closing diulang. OUT tidak mencakup WASTE; kedua kategori dilaporkan terpisah.

### 2.4 WASTE

Bahan hilang/rusak/terbuang yang dicatat melalui sumber waste yang disepakati. WASTE menurunkan stok dan dilaporkan sebagai biaya kerugian terpisah. Jika data berasal dari `waste_logs`, Daily Inventory hanya membaca dan mengaitkan referensi sumber itu; jangan mem-posting ulang waste yang sama.

### 2.5 BROKEN

Jumlah isi aktual dari kemasan terbuka yang tersisa saat closing, diukur/dipastikan staf dan dicatat agregat per material/lokasi. Karena kebijakan lot membatasi satu lot terbuka aktif per material/lokasi, jumlah BROKEN tersebut dihubungkan secara internal ke `active_open_lot_id` pada saat closing. Pengguna tidak perlu mengisi rincian per lot.

BROKEN adalah isi yang tersisa dari kemasan terbuka, bukan kuantitas OUT hari ini, bukan jumlah botol rusak, dan tidak otomatis direset menjadi nol ketika staf mengonfirmasi “tidak ada aktivitas”.

### 2.6 FULL

Jumlah kemasan utuh yang **dihitung sistem**, bukan diinput/ditimbang manual setiap hari. Sistem menghitung FULL dari stok buku akhir, BROKEN closing aktual, dan pack size material. FULL hasil perhitungan bukan pemeriksaan independen atas jumlah kemasan tersegel. Untuk material berisiko/mahal, gunakan cycle count/pemeriksaan FULL secara berkala.

### 2.7 Lot aktif terbuka

Lot yang saat ini digunakan sebagai sumber isi kemasan terbuka di lokasi. Maksimal satu `active_open_lot` per material/lokasi pada satu waktu. Beberapa kemasan dari lot yang sama boleh dibuka apabila operasional memerlukannya; BROKEN adalah total sisa isi dari kemasan-kemasan terbuka milik lot aktif tersebut. Lot berbeda tidak boleh aktif terbuka secara bersamaan pada lokasi yang sama.

---

## 3. Rumus dan peraturan saldo

Semua mutasi harus dikonversi ke satuan dasar material terlebih dahulu (misalnya ml, g, pcs). Harga pembelian dan stok tidak boleh dihitung dalam satuan yang berbeda tanpa konversi eksplisit.

### 3.1 Opening balance

`opening_qty_base = opening_full_qty × pack_size_base + opening_broken_qty_base`

Jika material tidak memakai model kemasan/broken, gunakan mode hitung material yang sesuai, misalnya unit dasar langsung. Jangan memaksa semua barang menggunakan logika botol.

### 3.2 Saldo buku akhir

`book_closing_qty_base = opening_qty_base + IN + transfer_in + production_in - OUT - WASTE - transfer_out - production_consumption + approved_adjustments`

- Setiap mutasi hanya masuk satu kali.
- Mutasi dari modul sumber tidak disalin menjadi transaksi baru oleh Daily Inventory.
- Penyesuaian stok harus memiliki alasan, pembuat, persetujuan sesuai peran, dan audit trail.
- ESB tidak membuat mutasi fisik otomatis karena OUT tetap dikonfirmasi staf.

### 3.3 Menghitung FULL

`full_raw = (book_closing_qty_base - closing_broken_qty_base) / pack_size_base`

Sistem boleh menetapkan `closing_full_qty` ke bilangan bulat terdekat hanya jika selisihnya berada dalam toleransi konversi/pembulatan material yang dikonfigurasi. Bila bukan bilangan bulat dalam toleransi, saldo negatif, BROKEN lebih besar dari saldo buku, atau pack size tidak tersedia, status menjadi `RECONCILIATION_REQUIRED`; jangan membulatkan diam-diam.

Setelah FULL ditentukan:

`physical_equivalent_qty = closing_full_qty × pack_size_base + closing_broken_qty_base`

`variance_qty = physical_equivalent_qty - book_closing_qty_base`

Nilai FULL yang ditampilkan merupakan inferred full packs. Ia tidak membuktikan bahwa seluruh kemasan utuh benar-benar ada apabila OUT atau mutasi sebelumnya salah sebesar kelipatan satu pack. Pemeriksaan FULL berkala tetap disarankan untuk item bernilai/berisiko tinggi.

### 3.4 Contoh normal

Material sirup dengan pack size 1.000 ml:

| Komponen | Nilai |
|---|---:|
| Opening FULL | 5 botol |
| Opening BROKEN | 0 ml |
| IN | 0 ml |
| OUT | 200 ml |
| WASTE | 0 ml |
| Saldo buku akhir | 4.800 ml |
| BROKEN closing yang ditimbang | 800 ml |
| FULL hasil sistem | 4 botol |
| Stok total akhir | 4.800 ml |

Hari berikutnya opening otomatis menjadi 4 FULL + 800 ml BROKEN.

### 3.5 Contoh perlu rekonsiliasi

Jika saldo buku akhir 4.800 ml tetapi BROKEN ditimbang 900 ml, maka sisa untuk kemasan utuh adalah 3.900 ml atau 3,9 pack. Sistem tidak boleh menyimpan FULL = 4 seolah-olah tanpa selisih. Sesi ditandai `RECONCILIATION_REQUIRED` dan menampilkan exception agar staf memeriksa OUT, IN, WASTE, unit/pack size, serta hasil timbang.

### 3.6 Material tanpa BROKEN

Master material perlu punya konfigurasi seperti `count_mode` atau `broken_tracking_enabled`:

- Material kemasan terbuka (sirup/susu, dll.): BROKEN wajib ditimbang pada closing.
- Material satuan indivisible yang tidak memiliki isi parsial: BROKEN tidak berlaku; sistem menampilkan N/A atau nol terkonfirmasi sesuai master, bukan meminta staf mengarang nilai.
- Jika material membutuhkan hitung FULL fisik berkala, sistem membuat tugas cycle count terjadwal. Count ini tidak mengubah saldo sampai hasilnya disetujui.

---

## 4. Flow operasional sehari-hari

### 4.1 Buka sesi

1. Staf memilih tanggal operasional dan storage location.
2. Sistem mencari sesi kanonis dengan kunci tenant + branch/lokasi penyimpanan + tanggal. Jika draft sudah ada, buka draft yang sama. Jika sesi closed, tampilkan read-only kecuali pengguna menjalankan reopen yang berwenang.
3. Sistem mengambil saldo closing yang disahkan terakhir untuk material/lokasi yang sama, menampilkan sumber tanggal opening, dan memvalidasi apakah ada tanggal/closing yang hilang.
4. Jika hari sebelumnya belum closed atau ada celah saldo, sistem memberi peringatan dan tidak boleh mengarang opening. Manager berwenang dapat menyelesaikan lewat opening balance/adjustment terkontrol.

### 4.2 Input dan transaksi sumber

1. Pembelian/penerimaan dicatat satu kali pada modul penerimaan, di lokasi Central atau Resto yang menerima.
2. Detail penerimaan dibagi ke satu atau beberapa lot jika expiry berbeda; total semua lot harus sama dengan quantity penerimaan.
3. IN, transfer, dan produksi ditampilkan otomatis berdasarkan mutasi yang telah diposting.
4. Staf menginput/mengonfirmasi OUT aktual per material. Draft edit tidak membuat ledger baru sampai fungsi posting yang sah dijalankan.
5. WASTE berasal dari sumber waste yang disepakati; Daily Inventory menunjukkan nilai dan sumbernya, bukan menyimpan kejadian kedua.
6. Staf menimbang BROKEN agregat per material dan lokasi pada closing. Sistem menautkannya ke lot aktif internal tanpa input per lot.

### 4.3 Preview sebelum closing

Sebelum tombol closing diaktifkan, tampilkan satu review lengkap dengan:

- jumlah material telah dicatat;
- aktivitas yang dikonfirmasi nol;
- OUT yang belum dikonfirmasi;
- BROKEN yang belum ditimbang;
- status FEFO/lot dan expiry warning;
- saldo buku akhir dan FULL hasil hitung;
- selisih/exception;
- total nilai OUT aktual, nilai WASTE, serta sumber biaya;
- status transaksi yang belum sinkron/terposting;
- daftar koreksi yang membutuhkan persetujuan.

Pengguna dapat kembali ke baris bermasalah dari preview. Preview menghitung semua material, termasuk item pada halaman tabel lain dan material yang difilter keluar.

### 4.4 Closing

1. Pengguna mengonfirmasi preview.
2. Server/database memvalidasi ulang status, saldo, uniqueness, sesi sebelumnya, lot aktif, satuan, serta idempotency; tidak hanya percaya validasi frontend.
3. Posting ledger, penutupan sesi, snapshot saldo closing, dan audit trail berlangsung atomik.
4. Setelah berhasil, sesi menjadi read-only untuk role biasa.
5. Opening tanggal berikutnya mengambil snapshot closing sesi ini.
6. Reopen/koreksi hanya oleh role yang berwenang, dengan alasan, nilai sebelum/sesudah, timestamp, dan pembalikan/adjustment yang terlacak; jangan menghapus riwayat yang sudah diposting.

---

## 5. UX: pagination, search, input, dan status

### 5.1 Tabel dan pencarian

- Default 25 item/halaman; opsi 25, 50, atau 100.
- Search nama, SKU, item code; debounce yang disarankan 300 ms.
- Filter kategori dan status: Semua, Belum dikonfirmasi, Zero activity confirmed, BROKEN belum ditimbang, Perlu rekonsiliasi.
- Search/filter mengembalikan tampilan ke halaman pertama tetapi tidak menghapus atau me-reset draft.
- State input dikelola menurut ID item/sesi, bukan hanya indeks baris atau halaman yang sedang tampil.
- Sediakan navigasi keyboard, input numerik, sticky nama material bila berguna, dan layout kartu yang nyaman untuk layar kecil.
- Tampilkan jelas saved/unsaved, error simpan, user terakhir mengubah, dan timestamp.

### 5.2 Status harus membedakan aktivitas dan pemeriksaan fisik

Status idealnya dipisahkan menjadi dua sumbu daripada menggabungkan semua keadaan ke satu label:

**Activity status**
- `UNCONFIRMED`: OUT/WASTE belum diisi atau disetujui.
- `ZERO_ACTIVITY_CONFIRMED`: staf dengan sadar mengonfirmasi tidak ada OUT/WASTE.
- `ACTIVITY_ENTERED`: ada nilai aktivitas yang telah disimpan.

**Physical status**
- `BROKEN_PENDING`: BROKEN belum ditimbang/dikonfirmasi untuk material yang memerlukannya.
- `BROKEN_COUNTED`: hasil timbang BROKEN sudah dicatat.
- `NOT_APPLICABLE`: material tidak menggunakan perhitungan BROKEN sesuai master.
- `RECONCILIATION_REQUIRED`: nilai tidak konsisten atau membutuhkan keputusan manager.

Status sesi: `DRAFT`, `REVIEW`, `CLOSED`, `REOPENED` (nama final diselaraskan dengan status schema aktif saat implementasi).

### 5.3 Konfirmasi massal nol

Tombol “Konfirmasi tidak ada aktivitas untuk item yang dipilih/tersisa” harus:

- menyebutkan jumlah material yang akan diubah;
- menampilkan ringkasan sebelum pengguna menyetujui;
- menulis OUT/WASTE = 0 hanya untuk item yang dipilih dan benar-benar dikonfirmasi;
- mencatat siapa/kapan melakukan bulk confirmation;
- tidak mengubah opening balance, BROKEN, lot, atau saldo stok secara diam-diam;
- tidak menganggap item yang hanya difilter di UI sebagai item yang dikonfirmasi tanpa ringkasan eksplisit.

BROKEN tetap harus ditimbang pada closing untuk material yang memerlukannya, meskipun OUT/WASTE = 0.

---

## 6. Lot expiry, FEFO, dan BROKEN agregat

### 6.1 Data lot

Setiap lot/penerimaan menyimpan identitas material, nomor batch bila ada, sumber penerimaan, expiry date, tanggal diterima, lokasi, kuantitas masuk dalam satuan dasar, snapshot biaya masuk, serta referensi transaksi.

Untuk material dengan `expiry_tracking = true`, expiry date diwajibkan kecuali ada pengecualian yang disetujui dan ditandai secara eksplisit. Penerimaan 12 botol boleh dipecah menjadi beberapa lot, misalnya:

- 4 botol — expiry 22 Okt;
- 5 botol — expiry 25 Okt;
- 3 botol — expiry 27 Okt.

Total lot harus tepat 12 botol setelah konversi satuan. Sistem tidak menerima selisih antara jumlah transaksi penerimaan dan jumlah alokasi lot.

### 6.2 Satu lot aktif terbuka per material/lokasi

- Maksimal satu lot `ACTIVE_OPEN` untuk pasangan material + storage location.
- Saat tidak ada lot terbuka, sistem memilih lot yang valid dengan expiry terdekat (FEFO) sebagai kandidat untuk dibuka/digunakan.
- BROKEN yang ditimbang agregat dikaitkan di belakang layar ke `active_open_lot_id`; user tetap melihat satu baris BROKEN per material.
- Kuantitas BROKEN tidak boleh dialokasikan ke lot lain secara otomatis.
- Ketika lot aktif habis, lot ditutup sebagai depleted dan lot valid berikutnya dapat diaktifkan menurut FEFO.
- Sisa stok tak terbuka dari lot yang sama tetap ditelusuri pada lot tersebut. `FULL` adalah jumlah pack utuh hasil perhitungan/ledger; BROKEN hanya merujuk sisa isi kemasan terbuka dalam lot aktif.

### 6.3 Jika lot dengan expiry lebih awal diterima saat lot lain sudah terbuka

Situasi ini berpotensi konflik antara “satu lot aktif terbuka” dan FEFO ketat. Default yang aman:

1. Jangan mengganti `active_open_lot_id` secara otomatis dan jangan mengubah penautan BROKEN lama.
2. Tampilkan `FEFO_EXCEPTION`: lot baru memiliki expiry lebih awal daripada lot aktif.
3. Manager memilih dan mengaudit salah satu tindakan: menyelesaikan lot aktif lalu mengaktifkan lot berikutnya, atau menjalankan prosedur switching yang disetujui operasional (dengan penyelesaian/saldo sisa lot lama yang eksplisit). Tidak boleh ada dua lot aktif terbuka pada waktu yang sama.
4. Sampai diputuskan, aplikasi menandai exception pada preview; kebijakan closing (block atau allow dengan approval) dikonfigurasi oleh owner saat implementasi. Default rekomendasi: wajib ada keputusan manager sebelum lot exception dipakai.

### 6.4 FEFO untuk OUT, WASTE, transfer, dan produksi

- OUT mengurangi lot aktif terlebih dahulu; bila lot habis dan kuantitas OUT tersisa, sistem menyelesaikan lot itu dan memilih lot valid berikutnya berdasarkan FEFO.
- WASTE/EXPIRED idealnya merujuk lot penyebab kerugian. Karena form BROKEN bersifat agregat, waste tidak boleh dikurangkan dari BROKEN secara implisit; kejadian WASTE memiliki kuantitas dan referensi terpisah.
- Transfer mempertahankan identitas batch/expiry dan biaya lot. Pengiriman serta penerimaan transfer tidak boleh menciptakan dua kali pengurangan/penambahan stok.
- Produksi bahan setengah jadi menggunakan material lot sesuai aturan konsumsi yang disepakati; bahan hasil produksi mendapat identitas batch produksi dan expiry bila kebijakan produk memerlukannya.
- Jika OUT diinput sebagai total harian, alokasi lot dilakukan oleh aturan FEFO saat posting. Untuk audit yang membutuhkan penelusuran konsumsi per jam, form transaksi per kejadian perlu timestamp—rekap harian saja tidak mengandung detail waktu pemakaian.

### 6.5 Schema saat ini yang perlu direkonsiliasi kelak

`material_batches` pada schema yang diberikan memiliki kolom ganda untuk tanggal (`expiry_date`, `expired_date`) dan kuantitas/lokasi (`quantity`, `qty_resto`, `qty_central`). Sebelum implementasi, harus ditetapkan satu field expiry kanonis dan saldo lot yang diturunkan dari satu ledger, bukan mempertahankan beberapa saldo duplikat. `daily_inventory_items.batch_id` dapat dipakai untuk referensi jika tipe/constraint-nya diselaraskan dengan ID lot yang terpilih; jangan diasumsikan kompatibel tanpa audit schema.

---

## 7. Cost Control dan valuasi

Dashboard harus tetap menampilkan setidaknya tiga metrik yang terpisah:

1. **Actual Daily Usage**: OUT aktual staf × snapshot biaya yang ditentukan kebijakan valuasi. WASTE dilaporkan terpisah, tidak dicampur dengan OUT.
2. **Stock-based Depletion/Reconciliation**: opening stock + penerimaan/transfer/produksi masuk − transfer/produksi keluar − closing stock, dengan adjustment yang sudah disahkan; ini alat rekonsiliasi dan tidak otomatis dianggap sama dengan OUT.
3. **Theoretical COGS**: kuantitas bersih POS ESB × resep/recipe version yang berlaku pada tanggal penjualan.

WAC per material/lokasi direkomendasikan untuk biaya berjalan karena barang dapat diterima di Central atau Resto dengan harga beli berubah. FEFO tetap menentukan lot yang secara fisik dipakai; WAC menentukan valuasi biaya. Transfer membawa biaya yang konsisten, produksi mengalokasikan biaya bahan ke hasil batch, dan biaya historis harus menyimpan snapshot sehingga perubahan harga master tidak mengubah laporan lama.

Metode WAC final perlu disahkan owner/finance sebelum angka finansial menjadi laporan resmi. Selisih antar-metrik ditampilkan dan ditelusuri, bukan dipaksa nol.

---

## 8. Data model konseptual dan pemetaan terhadap schema yang ada

Bagian ini menentukan target logis; bukan instruksi menjalankan SQL sekarang.

### 8.1 Master material dan kemasan

`materials` tetap menjadi master material. Tambahkan/normalisasikan data:
- SKU/item code dan kategori;
- satuan dasar;
- `count_mode` (`PACK_AND_BROKEN`, `BASE_UNIT`, atau mode hitung yang disetujui);
- `pack_size_qty` + `pack_size_unit` yang terstruktur;
- `broken_tracking_enabled`;
- `expiry_tracking`;
- toleransi konversi;
- satuan/konversi pembelian melalui `unit_conversions`.

Jangan mengandalkan parsing teks bebas `full_pack` sebagai satu-satunya sumber pack size.

### 8.2 Daily session dan item

Target logis:
- Satu sesi per tenant + branch/storage location + tanggal operasional.
- Satu item per session + material.
- Sesi menyimpan status, pembuat, pemeriksa, approver/closer, waktu closing, dan catatan.
- Detail menyimpan opening FULL/BROKEN snapshot, mutasi IN/OUT/WASTE dalam satuan dasar, BROKEN aktual closing, FULL hasil hitung, saldo buku, stok ekuivalen, variance, status activity/physical, snapshot cost, serta referensi active lot untuk BROKEN.

Pada schema saat ini, `daily_inventories` belum mencantumkan `branch_id`/`storage_location_id` eksplisit dan memakai enum `stock_location`; desain multi-lokasi harus menyelesaikan identitas lokasi secara konsisten sebelum constraint unik ditentukan. `daily_inventory_items.prev_full_qty` dapat dipetakan sebagai snapshot FULL awal untuk kompatibilitas, tetapi nama dan maknanya harus didokumentasikan. `broken_qty` cocok sebagai BROKEN closing hanya setelah semantik dikunci; BROKEN awal perlu field snapshot yang terpisah.

### 8.3 Ledger stok kanonis

Targetnya hanya satu sumber pergerakan stok kanonis per tenant/material/location/lot. Audit `transactions` terlebih dahulu untuk menentukan apakah tabel tersebut dapat menjadi ledger kanonis dengan field tambahan seperti source module/record/line, idempotency key, base-unit quantity, lot ID, storage location ID, cost snapshot, status posting/reversal, dan metadata audit.

Tabel dokumen seperti `purchase_entries`/`invoices`/`invoice_items`, `waste_logs`, transfer, production batch, dan input OUT harian merupakan sumber perintah/dokumen. Posting masing-masing dibuat atomik dan satu kali ke ledger. Jangan melakukan posting ganda karena data yang sama juga tampil pada Daily Inventory.

`daily_stock_counts` tidak boleh langsung dihapus. Audit dependency, rekonsiliasi isinya terhadap `daily_inventories`/`daily_inventory_items`, lalu tandai legacy/read-only atau migrasikan secara terkontrol. Schema juga memiliki dua jenis transfer (`inter_branch_transfers` dan `location_transfers`); pilih jalur aktif yang kanonis untuk branch/lokasi dan hindari dua sistem yang dapat menulis mutasi sama.

### 8.4 RLS dan akses

Semua operasi baca/tulis harus scoped pada tenant dan branch/storage location sesuai izin. Constraint unik dan idempotency harus berlaku di database, bukan hanya UI. Closing/reopen/adjustment memvalidasi role di server/database dan menghasilkan audit log.

---

## 9. Aturan idempotensi dan integritas

- Kunci sesi harian: tenant + lokasi fisik kanonis + tanggal operasional.
- Kunci item: session ID + material ID.
- Kunci penerimaan/transfer/production/waste: referensi unik sumber + detail sumber atau idempotency key.
- Kirim ulang request yang sama menghasilkan respons hasil posting sebelumnya, bukan mutasi stok baru.
- Draft save bukan stock movement. Ledger hanya berubah melalui posting transaksi yang tervalidasi.
- Multi-user edits menggunakan optimistic concurrency/version check atau kunci sesi saat closing. Dua pengguna tidak boleh menimpa saldo secara senyap.
- Posting ledger + update sesi + opening/closing snapshot harus atomik. Jika satu langkah gagal, keseluruhan operasi transaksi dibatalkan.
- Reversal membuat entri pembalik dengan referensi transaksi asli; jangan delete ledger yang sudah posted.
- Saldo lot diturunkan dari ledger atau satu saldo kanonis yang terkontrol; tidak menyimpan hasil yang sama ke `material_batches.quantity`, `qty_resto`, `qty_central`, dan tabel lain tanpa rekonsiliasi.

---

## 10. Migration/data readiness — sebelum coding/deployment

1. Backup database aktif dan verifikasi prosedur restore.
2. Audit seluruh source code/references untuk `daily_inventories`, `daily_inventory_items`, `daily_stock_counts`, `transactions`, `purchase_entries`, `invoices`, `invoice_items`, `waste_logs`, transfer, production, dan `material_batches`.
3. Identifikasi jalur UI/API yang sedang digunakan untuk penerimaan agar hanya satu menjadi sumber IN kanonis.
4. Temukan duplikasi sesi/item/mutasi sebelum menambah unique constraints. Hasil audit harus berupa laporan; jangan auto-delete.
5. Mapping `materials.unit`, `full_pack`, dan `unit_conversions` ke satuan dasar serta pack size terstruktur. Material yang tak dapat dikonversi masuk daftar exception, bukan diberi faktor tebakan.
6. Audit expiry/lot: pilih field expiry kanonis, bedakan metadata batch dan saldo batch, dan cek duplicate/missing lot ID.
7. Rekonsiliasi opening balance per material dan lokasi. Arsip Stock Opname Mei 2025 tidak diperlakukan otomatis sebagai saldo 2026; saldo Juli–Agustus 2026 butuh evidence yang sesuai.
8. Validasi cost method dan opening cost per lokasi bersama owner/finance sebelum menyatakan WAC sebagai kebijakan final.
9. Deploy di staging, jalankan acceptance test di bawah, uji rollback/restore, lalu sign-off sebelum production.

---

## 11. Acceptance criteria (wajib lulus sebelum rilis)

### A. Opening/closing dan FULL/BROKEN

**AC-01 — Opening carry-forward**  
Given sesi kemarin sudah closed, when pengguna membuka sesi hari ini untuk material/lokasi sama, then opening FULL dan BROKEN otomatis sama dengan closing kemarin; tidak mengambil saldo master material sebagai pengganti historis.

**AC-02 — Tidak ada closing sebelumnya**  
Given material/lokasi belum memiliki opening balance terverifikasi, when pengguna membuka sesi pertama, then sistem meminta saldo pembukaan/stock opname disahkan dan tidak mengarang nilai opening.

**AC-03 — Perhitungan FULL normal**  
Given pack size 1.000 ml, opening 5.000 ml, OUT 200 ml, IN/WASTE 0, and BROKEN ditimbang 800 ml, then saldo buku 4.800 ml, FULL closing 4 botol, stok total 4.800 ml, dan opening hari berikutnya 4 FULL + 800 ml BROKEN.

**AC-04 — BROKEN agregat > satu pack**  
Given dalam lot aktif yang sama terdapat beberapa kemasan terbuka dengan sisa agregat 1.600 ml, pack size 1.000 ml dan saldo buku akhir 4.600 ml, then sistem dapat menghitung 3 FULL + 1.600 ml BROKEN = 4.600 ml, selama seluruh sisa BROKEN berasal dari satu lot aktif.

**AC-05 — Broken tidak cocok dengan saldo buku**  
Given saldo buku 4.800 ml dan BROKEN 900 ml, then sistem memberi `RECONCILIATION_REQUIRED`, menampilkan exception 900 ml yang tidak dapat dialokasikan menjadi pack utuh, tidak diam-diam membulatkan FULL.

**AC-06 — Tidak ada aktivitas bukan berarti BROKEN nol**  
Given staf bulk-confirm zero activity, then OUT/WASTE yang terpilih menjadi 0 dan tercatat siapa/kapan; opening balance serta BROKEN closing tidak otomatis berubah menjadi 0 dan BROKEN closing masih harus ditimbang jika berlaku.

**AC-07 — Pack configuration missing**  
Given material mode `PACK_AND_BROKEN` tidak mempunyai pack size/konversi valid, then sistem menampilkan configuration error dan tidak melakukan inferensi FULL atau menutup sesi normal.

**AC-08 — Material tidak menggunakan BROKEN**  
Given material mode `BASE_UNIT`/non-broken, then UI menandai BROKEN sebagai `NOT_APPLICABLE` sesuai master dan tidak memaksa nilai kemasan yang tidak relevan.

### B. Transaksi, duplikasi, dan atomisitas

**AC-09 — Pembelian satu kali**  
Given penerimaan sudah posted, when halaman Daily Inventory dibuka berkali-kali atau dokumen diimpor ulang, then IN dan cost hanya masuk satu kali.

**AC-10 — Draft tidak mem-posting movement**  
Given pengguna menyimpan edit draft beberapa kali, then saldo ledger tidak berubah sampai posting/closing yang sah; tidak ada movement duplikat.

**AC-11 — ESB tidak memotong stok**  
Given file ESB diimpor, then subtotal penjualan dan theoretical COGS diperbarui menurut mapping, tetapi saldo stok fisik tidak berkurang otomatis.

**AC-12 — Waste dipisahkan dari OUT**  
Given waste dicatat pada sumber `waste_logs` atau jalur kanonis yang ditentukan, then Daily Inventory menampilkan referensi dan nilai waste tanpa membuat transaksi waste kedua; actual usage tidak mencakup waste.

**AC-13 — Atomic posting**  
Given langkah ledger atau closing gagal, then tidak boleh ada kondisi parsial di mana saldo berubah tetapi sesi tidak closed, atau sesi closed tetapi mutasi tidak tercatat.

**AC-14 — Concurrent save/close**  
Given dua pengguna mengubah sesi yang sama, then version/lock check mencegah overwrite senyap atau closing ganda; pengguna mendapat konflik yang bisa dipahami.

**AC-15 — Correction/reopen audit**  
Given sesi closed dibuka ulang oleh role berwenang, then alasan, actor, timestamp, data sebelum/sesudah, serta reversal/adjustment dapat ditelusuri; ledger posted tidak dihapus.

### C. Lot, expiry, FEFO

**AC-16 — Multi-expiry receipt**  
Given penerimaan 12 botol dialokasikan menjadi lot 4 + 5 + 3, then total alokasi harus tepat 12 setelah konversi. Sistem menolak posting bila total lot tidak cocok dengan receipt.

**AC-17 — Satu active open lot**  
Given satu lot aktif terbuka untuk material/lokasi, when pengguna atau dua pengguna bersamaan mencoba membuka lot lain, then aturan database/service menolak aktivasi kedua kecuali proses switching terotorisasi menyelesaikan lot sebelumnya terlebih dahulu.

**AC-18 — FEFO lot selection**  
Given tidak ada lot aktif dan tersedia beberapa lot valid, then sistem menawarkan/mengaktifkan lot dengan expiry date paling awal. Lot expired/blocked tidak dipilih untuk penggunaan normal.

**AC-19 — BROKEN link to active lot**  
Given staf memasukkan BROKEN agregat, then nilai disimpan per material/lokasi/sesi dan ditautkan internal ke active lot ID; staf tidak diwajibkan memasukkan expiry/lot terpisah pada form closing.

**AC-20 — Earlier-expiry lot arrives late**  
Given lot baru dengan expiry lebih awal datang saat lot lain aktif terbuka, then aplikasi menampilkan `FEFO_EXCEPTION`, tidak mengubah active lot otomatis, dan mewajibkan keputusan/audit manager sesuai kebijakan closing yang dikonfigurasi.

**AC-21 — Transfer preserves lot**  
Given lot ditransfer antar lokasi, then batch/expiry dan cost snapshot terbawa, stok asal dan tujuan diperbarui sekali, dan saldo total tenant tidak mengganda.

### D. Search, pagination dan preview

**AC-22 — Debounced search**  
Given pengguna mengetik nama/SKU/kode, then pencarian dieksekusi setelah debounce yang ditentukan (default 300 ms) dan hasilnya akurat.

**AC-23 — Pagination does not lose draft**  
Given pengguna mengubah OUT/BROKEN lalu pindah halaman/filter, then draft per ID material tetap ada; kembali ke halaman sebelumnya menampilkan input yang sama.

**AC-24 — Preview includes all items**  
Given 109 material ada dalam 5 halaman, then summary jumlah item, zero confirmation, BROKEN pending, selisih, usage/waste/value menghitung semua item yang relevan—not only the current page or search result.

**AC-25 — Zero confirmation is explicit**  
Given pengguna menekan bulk zero confirmation, then dialog menunjukkan jumlah dan ruang lingkup item, membutuhkan persetujuan eksplisit, membuat audit event, dan tidak mengubah data lain.

**AC-26 — Save/error state visible**  
Given request gagal atau jaringan terputus, then UI tidak menyatakan saved/closed sebelum server mengonfirmasi; error dapat diulang tanpa menghasilkan transaksi kedua.

### E. Cost Control dan security

**AC-27 — Three cost metrics stay separate**  
Given periode laporan dihitung, then Actual Daily Usage, Stock-based Depletion/Reconciliation, dan Theoretical COGS tampil terpisah dengan definisi dan sumber masing-masing; selisih tidak disembunyikan.

**AC-28 — Historical cost snapshot stable**  
Given master price diubah setelah transaksi, then laporan transaksi lama tetap menggunakan snapshot cost/recipe version yang berlaku pada waktu transaksi sesuai metode costing yang disetujui.

**AC-29 — Tenant/location isolation**  
Given user hanya punya akses tenant/lokasi tertentu, then tidak bisa membaca, menulis, mengclosing, atau mem-posting saldo tenant/lokasi lain lewat UI maupun API.

**AC-30 — Migration is non-destructive**  
Given schema/data lama ditemukan, then migration staging tidak menghapus sesi/ledger lama tanpa laporan rekonsiliasi, backup yang tervalidasi, rencana cutover dan rollback tertulis.

---

## 12. Risiko dan batasan yang harus ditampilkan secara jujur

1. FULL adalah hasil inferensi, bukan hasil hitung fisik harian. Kesalahan OUT/mutasi sebesar satu atau beberapa pack dapat lolos jika tidak ada cycle count.
2. BROKEN agregat hanya bisa dilacak expiry-nya secara internal karena aturan membatasi satu lot aktif terbuka pada satu material/lokasi.
3. Lot expiry yang lebih awal datang setelah lot lain terbuka memerlukan exception manager agar FEFO dan satu-lot rule tidak bertentangan diam-diam.
4. WAC disarankan, tetapi belum menjadi kebijakan akuntansi final sampai disahkan owner/finance.
5. Data historis yang periodenya keliru atau berjumlah tidak cocok harus masuk rekonsiliasi; tidak boleh diimpor seolah-olah valid.
6. Nama tabel/kolom dan constraints final baru ditetapkan setelah audit dependensi aplikasi dan schema PostgreSQL/Supabase yang benar-benar aktif.

## 13. Gerbang sign-off sebelum implementasi

Implementasi belum boleh dimulai sampai pemilik proses menyetujui:

- [ ] Definisi FULL/BROKEN dan rumus di bagian 2–3.
- [ ] Kebijakan maksimal satu lot aktif terbuka per material/lokasi.
- [ ] Aturan FEFO exception saat lot expiry lebih awal datang terlambat.
- [ ] Mode BROKEN per material (`PACK_AND_BROKEN` atau `NOT_APPLICABLE`).
- [ ] Satu jalur penerimaan dan satu ledger mutasi kanonis setelah audit schema.
- [ ] Kebijakan valuasi WAC disetujui owner/finance.
- [ ] Acceptance criteria AC-01 sampai AC-30 lulus di staging.
- [ ] Backup, rencana rollback, dan rekonsiliasi opening balances tervalidasi.

**Status akhir dokumen:** desain konseptual dan acceptance criteria telah dirinci; implementasi kode, SQL, dan migration sengaja belum dilakukan.
