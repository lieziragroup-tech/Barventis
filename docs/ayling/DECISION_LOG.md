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
- **Review trigger/date:**
