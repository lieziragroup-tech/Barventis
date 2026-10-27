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
