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

The v3 working copy consolidates daily inventory under `daily_inventories` + `daily_inventory_items`, uses `transactions` as the stock-movement source of truth, makes EOD close/reopen and purchase/transfer/waste posting transactional and idempotent, and separates staff-confirmed actual OUT from theoretical COGS derived from ESB sales and recipes. The `Proses Produksi` UI/API/report workflow has been removed in v6. Legacy database tables and historical transactions remain intact to avoid destructive history changes.

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


## Daily Inventory & Cost Control v6 — IN input fix and FULL derivation

The v6 update fixes the IN entry path: non-expiry materials have an editable manual IN field; expiry-tracked materials use multiple receipt-lot rows (quantity + expiry date per lot), with the total IN derived from the lot split. Source-derived Purchasing/transfer IN remains displayed separately and must not be typed again. The server posts manual IN and receipt lot records idempotently only on successful EOD close.

FULL is calculated from book closing balance (`opening + posted stock movements - OUT - WASTE`, with valid adjustments applied), without subtracting BROKEN to derive FULL. In days without incoming/waste/other movement, that reduces to opening stock minus OUT. BROKEN is weighed manually and then validated independently against the calculated book balance.

Additional migration: `supabase/migrations/20261023000000_daily_inventory_in_input_fix_v6.sql`. Run after successful v3/v4/v5 migrations. If starting from a database that has not applied those migrations, use the separate v6 all-in-one SQL bundle in staging. Never run the all-in-one and individual migrations as parallel/repeated rollout paths on the same database.

The source has been syntax-transpiled for the modified JS/JSX files and domain examples were checked. Full Vite build, complete test suite, and SQL execution against PostgreSQL/Supabase remain staging prerequisites; no production database was changed. See `IMPLEMENTATION_NOTES_Daily_Inventory_Cost_Control_v6.md`.


## Daily Inventory v6 follow-up fix

- Daily Inventory opens the editable **Form Input EOD** tab by default; REKAP is read-only output. The visible `IN` cell shows **total IN for the day** (Purchasing/transfer receipts plus any manual delta). Users type the total, and the client stores only the amount above source-derived receipts to prevent duplicate inventory movements.
- Manual IN is persisted in Draft; it posts one idempotent stock transaction only during successful EOD closing. A locked EOD remains read-only until an authorized reopen.
- `FULL` is inferred from book closing, never from subtracting BROKEN. When there are no receipts, waste, transfers or other movements, this simplifies to opening stock minus OUT. Legitimate incoming stock still has to be included in the ending balance.
- The dedicated `Proses Produksi` UI/API/report workflow is not available. Existing historical records are retained for balance continuity.


## UI follow-up v6.1: IN entry

- The Daily Inventory component now opens in `Form Input EOD` by default. The prior default was `REKAP`, which is a read-only table and made the IN column appear non-editable.
- The editable EOD column is labelled `IN (Total)`. It displays auto receipts plus manual delta; when a user types a total, only the delta above Purchasing/transfer receipts is persisted as manual IN.
- On expiry-tracked items, multi-lot detail must equal that manual delta. Draft values persist; stock ledger/master balance changes only after successful EOD close.
- FULL is independent of BROKEN. It derives from book closing, which is opening less OUT on days without legitimate IN/WASTE/other stock movements; new receipt quantities cannot be ignored without corrupting closing stock.
- No dedicated `Proses Produksi` entry point is available. Existing historic stock transaction rows remain for audit and balance continuity.

## Daily Inventory / Cost Control v6.2 UI fix

Baca `IMPLEMENTATION_NOTES_Daily_Inventory_Cost_Control_v6_2.md` untuk perubahan field IN (Total), konsistensi FULL awal dan FULL closing, perapian helper text, dan input BROKEN di Catatan Limbah.


## Hotfix v6.2.1 — `outConfirmed` runtime error
The OUT input's placeholder previously referenced `outConfirmed` outside its declaration scope. It is now computed inside the `paginatedItems.map` row renderer. This is a frontend-only hotfix and requires no SQL migration. See `IMPLEMENTATION_NOTES_Daily_Inventory_Cost_Control_v6_2.md`.
