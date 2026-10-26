# Blueprint & WBS: Integrasi Penuh & Sinkronisasi HPP Antar-Tab (Menu Pricing, Recipes COGS, & Menu Engineering)

**Author**: Ayling (Lead Autonomous Orchestrator) & Izumi (Architect) / Rafi  
**Status**: APPROVED EXECUTION BLUEPRINT & WBS  
**Target File**:
1. `src/services/costUtils.js` (Perbaikan Unit & Konversi Kemasan)
2. `src/pages/shared/MenuPricing.jsx` (Sinkronisasi HPP Dinamis & Navigasi Tab)
3. `src/pages/shared/Recipes.jsx` (Lookup Key Case-Insensitive, Auto-Sync & Recalculate)
4. `src/services/upgradeModulesApi.js` (Perbaikan Kolom Menu Engineering Matrix)
5. `src/pages/shared/UsageRecap.jsx` & `SimplePrep.jsx` & `WasteLogs.jsx` (Perbaikan Pengali Harga Pack)

---

## 1. Work Breakdown Structure (WBS)

```
WBS 1.0 — Perbaikan Core Calculation Engine (costUtils.js)
  ├── 1.1 Perketat isPackUnitConsistent: tolak recipeUnit gr/ml jika packUnit = pck/pcs tanpa konversi terdefinisi
  ├── 1.2 Ekstrak contentUnit dari full_pack format lama ("1000 ml" -> contentUnit: "ml", packSize: 1000)
  └── 1.3 Cegah pembagi nol atau perkalian harga pack utuh per gram/ml

WBS 2.0 — Sinkronisasi HPP Dinamis & Navigasi di MenuPricing.jsx (Tab 1)
  ├── 2.1 Gunakan useData() untuk mengambil master stock & recipes (Single Source of Truth)
  ├── 2.2 Hitung HPP dinamis secara live menggunakan kalkulasi bahan riil (bukan baca kolom basi DB)
  ├── 2.3 Sambungkan tombol "Lihat Resep" ke Tab COGS All (?tab=cogs-all&targetRecipeId=...)
  └── 2.4 Panggil refreshData() saat harga jual disimpan agar Tab 2 ikut ter-update

WBS 3.0 — Optimasi Recipes.jsx (Tab 2)
  ├── 3.1 Indeks stockMap menggunakan material.id dan lowercase name (case-insensitive & trim)
  ├── 3.2 Hapus fallback ke ing.amount basi jika bahan tidak cocok
  └── 3.3 Gunakan new_price || price secara konsisten untuk kalkulasi modal

WBS 4.0 — Perbaikan Schema Column di Menu Engineering Matrix (Tab 3)
  ├── 4.1 Ubah kueri di upgradeModulesApi.js: gunakan menu_name dan basic_cost
  └── 4.2 Pastikan Tab 3 memuat data matriks STAR, PLOWHORSE, PUZZLE, DOG dengan benar

WBS 5.0 — Eliminasi Perkalian Langsung Harga Per-Pack di Modul Lain
  ├── 5.1 UsageRecap.jsx: gunakan calculateIngredientCost untuk total_cost & gap_value
  ├── 5.2 SimplePrep.jsx: gunakan calculateIngredientCost untuk totalSourceCost & wasteLoss
  └── 5.3 WasteLogs.jsx: gunakan calculateIngredientCost untuk estimasi kerugian form limbah

WBS 6.0 — Testing & Quality Gate
  ├── 6.1 Unit testing kalkulasi costUtils & fuzzyMatch
  ├── 6.2 Full test suite vitest (13+ test suites)
  └── 6.3 Build production verification (vite build)
```

---

## 2. Rencana Arsitektur Alur Data (Data Lineage)

```
[Master Materials (Marketlist)]
       │
       ▼ (Harga Bahan / Kemasan)
[Single Engine: costUtils.calculateIngredientCost()]
       │
       ├─────────────────────────────────┬─────────────────────────────────┐
       ▼                                 ▼                                 ▼
[Tab 1: MenuPricing.jsx]       [Tab 2: Recipes.jsx]             [Tab 3: Menu Matrix]
- HPP Terhitung Dinamis        - Live Calculation + Save DB     - upgradeModulesApi
- Sinkron 100% dengan Tab 2    - Pemicu refreshData() global    - Menggunakan menu_name
- Navigasi ?tab=cogs-all       - Tombol Recalculate All           & basic_cost
```
