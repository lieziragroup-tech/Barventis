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
