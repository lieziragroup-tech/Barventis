# Barventis ERP (V2 Core) 🚀

Platform ERP & Cost Control khusus F&B (Restoran, Cafe, Bar). Dirancang ulang berdasarkan audit proses bisnis riil (Sistem *Draft/Batch* EOD, bukan Maker-Checker birokratis).

## ⚡ Arsitektur Inti (TO-BE Blueprint)
- **Role BAR First:** Form EOD Harian dengan fitur *Draft* & *Lock*.
- **Pipa Bukti Limbah (Waste):** Integrasi *Photo Evidence* otomatis terkompresi (WebP) untuk transparansi.
- **Multi-Lokasi Logistik:** Manajemen stok terpisah untuk *Central Warehouse* (Buffer) dan *Resto Bar* (Bahan segar/kerja).
- **POS & BOM Engine:** Impor laporan POS ESB otomatis. Omset ditarik dari *Package Head*, pemotongan bahan ditarik dari *Package Content* sesuai resep (BOM).

## 🛠️ Tech Stack
- Frontend: React 19 + Vite + TailwindCSS
- Backend: Supabase (PostgreSQL + Auth + Storage)
- State & Memory: Obsidian Vault terintegrasi di folder root (`_memory/`)

## 📝 Dokumentasi Agen
Semua keputusan arsitektur, rekam jejak, dan *Business Goals* tersimpan dalam format Markdown di folder `_memory/`. Buka *root* repositori ini menggunakan aplikasi **Obsidian** untuk melihat *graph view* dan *roadmap* interaktif.


## Daily Inventory & Cost Control v3 implementation package

File: `supabase/migrations/20261020000000_daily_inventory_cost_control_v3.sql`

The v3 working copy consolidates daily inventory under `daily_inventories` + `daily_inventory_items`, uses `transactions` as the stock-movement source of truth, makes EOD close/reopen and purchase/transfer/waste/production posting transactional and idempotent, and separates staff-confirmed actual OUT from theoretical COGS derived from ESB sales and recipes. The semi-finished-material production workflow is available as the `Proses Produksi` tab inside Daily Inventory Hub.

**Deployment status:** the migration has not been applied to a live database, and no live Supabase connection was provided. Back up the database and apply/test the migration in staging first. See `IMPLEMENTATION_NOTES_Daily_Inventory_Cost_Control_v3.md` for rollout order, known constraints, reconciliation items, and acceptance checklist. A frontend syntax check passed, but the full npm build/tests could not be run because dependency installation timed out in this environment.


## SQL syntax fix (v3.2)
The migration at `supabase/migrations/20261020000000_daily_inventory_cost_control_v3.sql` contains the CASE-expression correction for PostgreSQL PL/pgSQL. In `convert_material_qty_to_stock_unit_v3`, `v_stock_group` is assigned before the IF statement and then compared as `v_content_group = v_stock_group`; the CASE expression is no longer embedded directly in that IF condition.

Use this migration file from this archive, not an older copy of the v3.0/v3.1 ZIP or previously copied SQL. This package has not been executed against a live Supabase database; run it in staging and verify before production.

## Daily Inventory & Cost Control v4 — FULL inferred, BROKEN weighed
The v4 design implements an EOD flow where FULL is inferred by the system from the book closing balance and BROKEN is manually weighed at closing in the material's configured content unit. Search uses a 300 ms debounce and the item table is paginated (25/50/100); closing preview spans the full inventory, not only the visible page. Expiry-tracked materials use lot identity and FEFO with a one-open-lot-per-material/location control. Cost Control explicitly distinguishes staff-confirmed actual OUT, recipe-based theoretical COGS, and stock-opname-based period COGS. Since FULL is inferred, the UI does not describe daily ledger depletion as independent physical verification.

Migrations (run in staging first):
- `supabase/migrations/20261020000000_daily_inventory_cost_control_v3.sql` (corrected CASE expression)
- `supabase/migrations/20261021000000_daily_inventory_broken_fefo_v4.sql` (additive v4)

See `IMPLEMENTATION_NOTES_Daily_Inventory_Cost_Control_v4.md` for deployment selection, first-use configuration, known limitations, and acceptance criteria. No production database was changed by producing this package.
