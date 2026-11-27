# Decision Log

Append one section per meaningful decision. Keep proposed and approved decisions distinct.

## DEC-0001 — <short title>
- **Date:** YYYY-MM-DD
- **Status:** `PROPOSED | APPROVED | REJECTED | SUPERSEDED`
- **Decision owner:**
- **Context / problem:**
- **Options considered:**
- **Evidence/source:**
- **Decision and rationale:**
- **Consequences / trade-offs:**
- **Affected baseline requirements/modules:**
- **Verification / rollback:**

## DEC-0002 — Fix Infinite Loading and Cost Calculation in UsageRecap
- **Date:** 2026-10-27
- **Status:** `APPROVED`
- **Decision owner:** Ayling & Izumi
- **Context / problem:** Tab Rekap Pemakaian (`UsageRecap.jsx`) mengalami infinite loading/skeleton loop saat rentang tanggal kosong atau tidak memiliki data inventaris, karena ketiadaan blok `finally { setLoading(false); }` pada `fetchUsageData`. Terdapat pula anomali biaya pemakaian akibat `full_pack` tidak disalin ke objek agregasi bahan.
- **Options considered:**
  1. Memanggil `setLoading(false)` manual di setiap branch return.
  2. Menambahkan blok `finally { setLoading(false); }` dan melengkapi data `full_pack` serta `effectivePrice` pada agregasi.
- **Evidence/source:** `src/pages/shared/UsageRecap.jsx:37-146`, `src/services/costUtils.js`.
- **Decision and rationale:** Opsi 2 dipilih karena menjamin state `loading` selalu di-reset baik saat sukses, error, maupun early return. Selain itu menyertakan `full_pack` memastikan `calculateIngredientCost` mengonversi satuan wadah (gr/ml vs pack) dengan benar.
- **Consequences / trade-offs:** Skeleton loader dan empty state disinkronkan ke 9 kolom sesuai jumlah header tabel.
- **Affected baseline requirements/modules:** `UsageRecap.jsx`
- **Verification / rollback:** Vitest test suite pass (276/276 passed), `npm run build` sukses.
- **Review trigger/date:** 2026-10-27

## DEC-0003 — Onboarding & Guidebook Alignment to Barventis F&B Daily Inventory
- **Date:** 2026-10-27
- **Status:** `APPROVED`
- **Decision owner:** Ayling & Izumi
- **Context / problem:** File `CLAUDE.md` sebelumnya merupakan residu template generic maker-checker gudang umum. Komponen `Onboarding.jsx` dan `GuidebookModal.jsx` belum sepenuhnya merefleksikan alur operasional inti Barventis F&B (Daily Inventory FULL/BROKEN, segitiga logistik Bar-Central-Purchasing, serta rekonsiliasi variansi POS vs Fisik).
- **Options considered:**
  1. Memasang engine render video eksternal (Remotion) untuk tutorial.
  2. Menyelaraskan modul interaktif native (`Onboarding.jsx` & `GuidebookModal.jsx`) dengan alur F&B Barventis tanpa menambah dependensi berat.
- **Evidence/source:** `SPEC_Daily_Inventory_Cost_Control_Barventis_v4_FINAL_CONCEPT.md`, `business_process_discovery_barventis_13_sheets.md`, `CLAUDE.md`.
- **Decision and rationale:** Opsi 2 dipilih sesuai prinsip zero-slop dan efisiensi performa. Menghapus `CLAUDE.md` lama, menerbitkan `CLAUDE.md` baru berbasis Barventis, serta memperbarui onboarding & guidebook dengan 4 langkah F&B dan tab interaktif FULL/BROKEN.
- **Consequences / trade-offs:** `AppLayout.jsx` diperluas untuk menangani navigasi dinamis rute Onboarding (`stock`, `recipes`, `daily`, `pos`, `cost-report`).
- **Affected baseline requirements/modules:** `CLAUDE.md`, `src/components/Onboarding.jsx`, `src/components/GuidebookModal.jsx`, `src/components/AppLayout.jsx`.
- **Verification / rollback:** `npm run build` PASS, Vitest 276/276 PASS.
- **Review trigger/date:** 2026-10-27

## DEC-0004 — Fix CSS Cascade Layer Conflict on .form-control & Default full_pack in SimplePrep
- **Date:** 2026-10-27
- **Status:** `APPROVED`
- **Decision owner:** Ayling & Izumi
- **Context / problem:** Input numerik pada SimplePrep.jsx (Banyaknya Diambil, Hasil Bersih, Berat Ampas) menyusut menjadi kapsul kecil (~28px total padding, 0px content width) karena `.form-control` di `src/index.css` berada di luar `@layer`, menimpa utilities Tailwind v4 (`w-24` dan `flex-1`). Selain itu, modal `+ Daftarkan Bahan Baru` membuat bahan tanpa `full_pack`, memicu kalkulasi HPP Rp 0.
- **Options considered:**
  1. Menggunakan CSS `!important` di setiap elemen form SimplePrep.
  2. Membungkus `.form-control` ke dalam `@layer components` di `src/index.css`, menambahkan style inline eksplisit (`flex: 1 1 0%`, `minWidth: 120px`, `width: auto` dan `flex: 0 0 96px`) di SimplePrep.jsx, serta menginjeksi default `full_pack` pada `handleCreateRawMaterial`.
- **Evidence/source:** `src/index.css:827`, `src/pages/shared/SimplePrep.jsx:79,437,575,682`.
- **Decision and rationale:** Opsi 2 adalah solusi standar CSS Cascade Layer Tailwind v4 yang menyelesaikan masalah secara global untuk seluruh aplikasi tanpa hack `!important`, sekaligus melindungi perhitungan HPP olahan.
- **Consequences / trade-offs:** Seluruh class utility Tailwind v4 dapat menimpa properti `.form-control` sesuai layer priority yang benar.
- **Affected baseline requirements/modules:** `src/index.css`, `src/pages/shared/SimplePrep.jsx`.
- **Verification / rollback:** `npm run build` PASS, Vitest 276/276 PASS.
- **Review trigger/date:** 2026-10-27

## DEC-0005 — Menu Engineering Matrix: Search with Debounce, Multi-Filter, Sorting & Pagination
- **Date:** 2026-10-27
- **Status:** `APPROVED`
- **Decision owner:** Ayling & Izumi
- **Context / problem:** Modul Menu Engineering Matrix (`MenuEngineering.jsx`) menampilkan data tabel utuh tanpa search bar di UI, tanpa filter kategori menu, tanpa kemampuan sorting multi-kolom, dan paginasi sebelumnya belum aktif menghubungkan `paginatedItems` ke tampilan tabel.
- **Options considered:**
  1. Hanya menambahkan search bar sederhana tanpa sorting atau filter kategori.
  2. Menambahkan search bar ter-debounce (`useDebounce`, 300ms) dengan tombol clear, filter dropdown kategori dinamis + kuadran BCG, per-page selector (10/20/50/100), sorting klik header (nama, harga jual, COGS, margin, total terjual, kontribusi Rp, food cost %), serta integrasi penuh komponen `Pagination`.
- **Evidence/source:** `src/pages/shared/MenuEngineering.jsx`, `src/hooks/useDebounce.js`, `src/components/shared/Pagination.jsx`.
- **Decision and rationale:** Opsi 2 dipilih agar user operasional F&B dan owner mudah menyortir menu terbaik/terburuk berdasarkan kontribusi margin atau volume terjual, terutama saat katalog menu mencapai puluhan hingga ratusan resep.
- **Consequences / trade-offs:** State `currentPage` otomatis di-reset ke 1 setiap kali query pencarian, filter, atau sorting berubah.
- **Affected baseline requirements/modules:** `src/pages/shared/MenuEngineering.jsx`.
- **Verification / rollback:** `npm run build` PASS, Vitest 276/276 PASS.
- **Review trigger/date:** 2026-10-27

## DEC-0006 — Clarify Trimming Stage in SimplePrep Setup & Auto-Update Processed Material HPP
- **Date:** 2026-10-27
- **Status:** `APPROVED`
- **Decision owner:** Ayling & Izumi
- **Context / problem:** Modal "Setup Bahan Mentah Baru" di `SimplePrep.jsx` belum membedakan secara tegas antara Bahan Mentah Belum Di-trimming (*Gross Weight / As Purchased*) dengan Bahan Jadi Hasil Olahan (*Edible Portion / Clean Yield*). Selain itu, tombol pendaftaran bahan olahan baru di Tahap 2 belum tersedia, stok mentah terpotong tanpa konversi satuan stok master, dan HPP bahan hasil trimming (`target_mat_id`) di database belum diperbarui otomatis saat batch olahan dicatat.
- **Options considered:**
  1. Hanya menambahkan teks keterangan statis pada modal.
  2. Menambahkan pemilih status satuan bahan interaktif (`RAW_UNTRIMMED` vs `PREPPED_TRIMMED`), menambahkan tombol `+ Daftarkan Bahan Hasil Trimming` di Tahap 2, mengirimkan `source_unit`, `target_unit`, `waste_unit`, dan `new_target_hpp` ke backend, serta melakukan konversi satuan stok atomic dan update `price`/`new_price`/`avg_cost` di `api.recordOlahBahan`.
- **Evidence/source:** `src/pages/shared/SimplePrep.jsx`, `src/services/api.js:5604-5755`.
- **Decision and rationale:** Opsi 2 dipilih agar alur F&B Barventis konsisten dengan prinsip yield/edible portion: bahan mentah kotor dicatat sesuai nota supplier, sedangkan bahan hasil olahan otomatis menyerap biaya ampas ke HPP barunya dan siap dipakai pada resep menu.
- **Consequences / trade-offs:** Tabel `materials` kolom `is_preparable` diisi `true` untuk bahan mentah belum di-trimming dan `false` untuk bahan hasil olahan siap pakai.
- **Affected baseline requirements/modules:** `src/pages/shared/SimplePrep.jsx`, `src/services/api.js`.
- **Verification / rollback:** `npm run build` PASS, Vitest 276/276 PASS.
- **Review trigger/date:** 2026-10-27

## DEC-0007 — Prevent HTTP 400 Bad Request on transactions enum & materials NOT NULL schema
- **Date:** 2026-10-27
- **Status:** `APPROVED`
- **Decision owner:** Ayling & Izumi
- **Context / problem:** Berdasarkan audit `Check-Manual/analisis_dan_solusi_error_400_supabase.md`, terjadi 3 titik HTTP 400 di konsol: (1) query `type=eq.TRANSFER_REQUEST` ditolak jika enum `transaction_type` di DB belum memiliki value tersebut, (2) insert material pertama kali gagal karena kolom `shelf_life_days` belum ada di skema remote, dan (3) insert fallback kedua gagal 400 akibat pelanggaran NOT NULL kolom `supplier` & `new_price`, serta tipe data `price` (int8) di tabel `public.materials`.
- **Options considered:**
  1. Hanya mengandalkan migrasi manual database tanpa proteksi aplikasi.
  2. Mengimplementasikan payload normalizer `normalizeMaterialCreatePayload` di `materialsRepo.js` (default `supplier: '-'`, `new_price`, rounded `price`, dsb), caching ketiadaan kolom `shelf_life_days`, normalisasi lokasi (`RESTO`/`CENTRAL`) pada `createTransferRequest`, serta caching `__dbSupportsTransferRequestEnum` di memori agar UI tidak terus menerus menembak request 400 jika enum DB belum diupdate.
- **Evidence/source:** `Check-Manual/analisis_dan_solusi_error_400_supabase.md`, `src/data/materialsRepo.js:3-130`, `src/services/api.js:1740-1786`.
- **Decision and rationale:** Opsi 2 dipilih agar aplikasi resilient terhadap perbedaan versi skema database Supabase dan mencegah error merah berulang di sisi client.
- **Consequences / trade-offs:** Nilai `supplier` default `'-'` dan `new_price` otomatis diisi sama dengan `price` jika tidak disertakan.
- **Affected baseline requirements/modules:** `src/data/materialsRepo.js`, `src/services/api.js`.
- **Verification / rollback:** `npm run build` PASS, Vitest 276/276 PASS.
- **Review trigger/date:** 2026-10-27

## DEC-0008 — Pemisahan Input BROKEN dari Mutasi Limbah & Integrasi v7
- **Date:** 2026-10-28
- **Status:** `APPROVED`
- **Decision owner:** Ayling & Izumi
- **Context / problem:** Pencatatan sisa fisik pecah/terbuka (*BROKEN*) melalui UI Catatan Limbah sebelumnya berisiko menciptakan transaksi pengurangan limbah palsu atau menggeser saldo stok master secara tidak semestinya.
- **Options considered:**
  1. Mencatat BROKEN sebagai transaksi `WASTE` di ledger utama.
  2. Menyediakan RPC khusus `save_daily_inventory_broken_counts_v7` yang hanya memperbarui detail `daily_inventory_items` dan *open-lot state* tanpa memotong saldo stok master.
- **Evidence/source:** `supabase/migrations/20261024000000_daily_inventory_broken_from_waste_v7.sql`, `src/services/api.js`.
- **Decision and rationale:** Opsi 2 dipilih karena BROKEN adalah penghitungan sisa fisik terbuka (*physical remainder*), bukan pergerakan limbah. Hal ini menjaga integritas buku stok harian (*FULL*).
- **Consequences / trade-offs:** Saldo master `materials` tidak berubah saat input BROKEN disimpan; efek pemakaian tetap dihitung melalui mekanisme EOD Daily Inventory.
- **Affected baseline requirements/modules:** `DailyInventory.jsx`, `WasteLogs.jsx`, `api.js`, migrasi v7.
- **Verification / rollback:** Verifikasi skema migrasi v7 dan regresi Daily Inventory pass di Vitest.
- **Review trigger/date:** 2026-11-12

## DEC-0009 — Konversi 2-Satuan, Rekonsiliasi POS ESB, & Perbaikan Trigger `terpakai_qty` (v9–v10)
- **Date:** 2026-11-12
- **Status:** `APPROVED`
- **Decision owner:** Ayling & Izumi
- **Context / problem:** Bahan dengan harga beli per kemasan sebelumnya sering tercatat dengan satuan `gr`/`ml` sehingga memicu salah hitung HPP; pembelian harian membutuhkan tujuan kirim (*Central* vs *Resto*) serta acuan kuota bulanan; pemakaian manual barista perlu disandingkan langsung dengan pemakaian teoritis POS ESB; dan kolom `daily_inventory_items.terpakai_qty` yang bertipe `GENERATED ALWAYS` memicu error SQL saat penyimpanan EOD.
- **Options considered:**
  1. Mempertahankan 1 satuan datar dan menghitung variansi POS secara terpisah di spreadsheet eksternal.
  2. Menerapkan arsitektur konversi 2-satuan (`full_pack` format `<kemasan> = <isi> <satuan>`), kolom `monthly_quota_qty`, `is_prep_output`, `delivery_notes`, modul perbandingan Barista vs POS ESB, serta migrasi v10 untuk melepas `GENERATED ALWAYS` pada `terpakai_qty` dengan trigger sinkronisasi `sync_daily_inventory_terpakai_qty_v10`.
- **Evidence/source:** `supabase/migrations/20261112000000_inventory_two_tier_conversion_pos_compare_v9.sql`, `supabase/migrations/20261113000000_fix_terpakai_qty_generated_column_v10.sql`, `src/services/costUtils.js`.
- **Decision and rationale:** Opsi 2 menyatukan akurasi satuan beli vs satuan resep sekaligus menuntaskan error SQL EOD secara permanen.
- **Consequences / trade-offs:** Membutuhkan eksekusi migrasi v9 & v10 secara berurutan pada database eksisting sebelum penggunaan modul POS compare dan kuota bulanan.
- **Affected baseline requirements/modules:** `costUtils.js`, `materialsRepo.js`, `BaristaReport.jsx`, `Purchasing.jsx`, `DailyInventory.jsx`, `SimplePrep.jsx`.
- **Verification / rollback:** Vitest (`costUtils.test.js`, `v9InventoryFlow.test.js`, `dailyInventoryMath.test.js`) PASS.
- **Review trigger/date:** 2026-11-13

## DEC-0010 — Penyederhanaan Copywriting & Sub-Deskripsi UI Seluruh Halaman Utama
- **Date:** 2026-11-13
- **Status:** `APPROVED`
- **Decision owner:** Ayling & Izumi
- **Context / problem:** Banyak judul, sub-deskripsi halaman, teks modal, dan label kontrol di modul Pengadaan, Gudang, Menu, dan Laporan mengandung kalimat terlalu panjang, kaku, atau ambigu bagi operator lapangan.
- **Options considered:**
  1. Merombak ulang struktur tata letak komponen secara menyeluruh.
  2. Merapikan copywriting secara terarah di seluruh area utama dengan membatasi sub-deskripsi menjadi 4–6 kata yang padat, kontekstual, dan langsung ke inti tindakan.
- **Evidence/source:** `src/pages/shared/ProcurementHub.jsx`, `DailyInventoryHub.jsx`, `PricingCogsHub.jsx`, `CostControlReportHub.jsx`, dan modul turunannya.
- **Decision and rationale:** Opsi 2 meningkatkan kejelasan UX operasional secara cepat tanpa memecah alur kerja atau komponen yang sudah stabil.
- **Consequences / trade-offs:** Seluruh pesan bantu di UI kini konsisten berbahasa Indonesia operasional yang ringkas; perubahan hanya memengaruhi lapisan teks antarmuka.
- **Affected baseline requirements/modules:** Seluruh halaman hub dan modal operasional utama.
- **Verification / rollback:** `npm run build` PASS, ESLint 0 errors.
- **Review trigger/date:** 2026-11-13

## DEC-0011 — Arsitektur Multi-Cabang Penuh: Katalog Terpisah, Distribusi Fleksibel, & Tarik Menu (v11)
- **Date:** 2026-11-13
- **Status:** `APPROVED`
- **Decision owner:** Ayling & Izumi
- **Context / problem:** Ekspansi restoran membutuhkan dukungan banyak cabang dengan kondisi katalog bahan dan stok yang terpisah total per cabang, pengadaan fleksibel (melalui Central atau langsung per cabang), opsi menyamakan/menarik menu dari cabang lain, serta aturan akses staf yang terkunci pada 1 cabang sedangkan Owner bebas berpindah cabang.
- **Options considered:**
  1. Berbagi satu katalog master bahan dan resep secara global antar cabang dengan tabel stok terpisah.
  2. Memisahkan katalog bahan, supplier, resep, dan stok per `branch_id`, menambahkan RPC `clone_branch_data` (tarik menu/bahan/supplier antar cabang), alur mutasi kirim-terima `inter_branch_transfers` (`DISPATCH → RECEIVE`), undangan staf terikat cabang, serta switcher cabang & RPC ringkasan `get_owner_multi_branch_summary` khusus Owner.
- **Evidence/source:** `supabase/migrations/20261114000000_multi_branch_full_support_v11.sql`, `src/pages/shared/InterBranchTransfer.jsx`, `src/pages/shared/Recipes.jsx`, `src/pages/owner/TenantAdminPanel.jsx`.
- **Decision and rationale:** Opsi 2 mencegah harga beli lokal dan komposisi stok antar cabang saling menimpa, sekaligus tetap memudahkan pembukaan cabang baru lewat fitur tarik menu/bahan dari cabang referensi.
- **Consequences / trade-offs:** Data lama tanpa `branch_id` di-backfill ke cabang utama pertama per tenant; fitur salin resep memulai stok cabang tujuan dari angka `0`.
- **Affected baseline requirements/modules:** `branches`, `inter_branch_transfers`, `DataContext.jsx`, `AppLayout.jsx`, `Recipes.jsx`, `TenantAdminPanel.jsx`, `api.js`.
- **Verification / rollback:** Vitest (`multiBranch.test.js`), `npm run build` PASS.
- **Review trigger/date:** 2026-11-13

## DEC-0012 — Penegakan Isolasi Data Ketat Per Cabang (`NOT NULL`, RLS, Trigger, & Fail-Closed API) (v12)
- **Date:** 2026-11-13
- **Status:** `APPROVED`
- **Decision owner:** Ayling & Izumi
- **Context / problem:** Untuk menjamin keamanan multi-cabang di level produksi, isolasi tidak boleh hanya mengandalkan filter opsional di sisi klien. Pengguna non-admin harus ditolak secara tegas (*fail-closed*) apabila `branch_id` hilang atau mencoba menyentuh cabang lain, baik di API, interceptor klien, maupun skema & RLS PostgreSQL.
- **Options considered:**
  1. Membiarkan `branch_id` nullable dengan fallback pembacaan lintas cabang bila `branch_id` tidak dikirim.
  2. Memberlakukan strategi *defense-in-depth* v12: (a) backfill & terapkan `NOT NULL` + `DEFAULT bv2_auth_branch_id()` pada seluruh 37 tabel cabang, (b) terapkan kebijakan RLS ketat `strict_branch_*` dan trigger `bv2_enforce_branch_integrity()` + hardening RPC stok, (c) blokir query/mutasi non-admin tanpa `branch_id` atau lintas cabang dan blokir `unscopedFrom()` di `supabase.js`, serta (d) validasi wajib `requireBranchContext()` pada seluruh CRUD Materials, Recipes, dan Stock di `api.js`, `upgradeModulesApi.js`, dan `materialsRepo.js`.
- **Evidence/source:** `supabase/migrations/20261115000000_strict_branch_isolation_v12.sql`, `src/lib/supabase.js`, `src/contexts/AuthContext.jsx`, `src/data/materialsRepo.js`, `src/services/api.js`, `src/services/upgradeModulesApi.js`, `src/services/__tests__/multiBranch.test.js`.
- **Decision and rationale:** Opsi 2 menghilangkan celah kebocoran data lintas cabang sekaligus memproteksi integritas stok dari manipulasi permintaan sisi klien.
- **Consequences / trade-offs:** Seluruh akun non-admin wajib terikat pada `branch_id` yang valid; jika sesi non-admin belum memiliki `branch_id`, seluruh operasi baca/tulis tabel cabang otomatis ditolak dengan galat validasi.
- **Affected baseline requirements/modules:** Seluruh 37 tabel cabang PostgreSQL, `supabase.js`, `AuthContext.jsx`, `materialsRepo.js`, `api.js`, `upgradeModulesApi.js`.
- **Verification / rollback:** `npx vitest run` (18 file, 322/322 PASS), `npm run build` PASS, ESLint 0 errors.
- **Review trigger/date:** 2026-11-13

