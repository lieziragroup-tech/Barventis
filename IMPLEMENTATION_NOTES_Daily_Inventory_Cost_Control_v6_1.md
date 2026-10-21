# Barventis Daily Inventory — Input IN Fix v6.1

## What changed

1. **The editable EOD form opens by default.** Previously the Daily Inventory component opened in `REKAP`, whose IN column is read-only. This was the clearest UI reason a user could see IN but not type into it.
2. **The editable column is `IN (Total)`.** It shows the daily total: source-derived IN from Purchasing/transfers plus any manual input that has not been recorded elsewhere. The user types the total; the app subtracts source-derived IN and persists only that delta to prevent duplicates.
3. **Expiry-controlled materials can receive multiple manual lots.** Lot rows must sum to the manual delta above auto receipts, not the total including purchases. Each manual lot needs a quantity and expiry date.
4. **Draft persists IN; stock is posted at successful EOD closing.** This keeps incomplete drafts from mutating live balances. If the date/location is already closed, authorized reopen is required before edits.
5. **FULL is automatic and independent of BROKEN.** It is `floor(book closing / stock units per pack)`. With no IN, WASTE, transfer, or adjustments, this reduces to opening stock minus OUT. Legitimate IN still needs to be included in the book closing; ignoring receipt quantities would make closing inconsistent on days when stock arrives. BROKEN is hand-weighed and validated separately.
6. **The dedicated Proses Produksi workflow remains removed from UI/API/report navigation.** Legacy historical stock movements are retained and read only where needed to keep older balances coherent; no new production-entry screen remains.

## Validation performed

- Transpile syntax check: 114 JS/JSX/TS/TSX files, zero diagnostics.
- Relative import scan under `src`: all targets resolve.
- Domain smoke tests: total-IN-to-manual-delta (including source-receipt subtraction), unit conversion, FULL inference, and BROKEN reconciliation passed.
- `rg` scan: no `MaterialProduction`, `Proses Produksi Bahan`, `Proses Produksi`, `recordProductionRun`, `getProductionRecipes`, or `saveProductionRecipe` entry points under `src`.
- Full Vite build and Vitest suite were not run: dependency directory is absent in this environment. PostgreSQL/Supabase SQL has not been executed against a live database.

## Deployment notes

- In the app, use the updated source package.
- The API calls `save_daily_inventory_manual_in_v6`; the v6 database migration must already be applied. If not, apply migrations in order after the existing Barventis base schema, first in staging.
- If custom v3/v4/v5/v6 migrations already succeeded, do not rerun the all-in-one SQL; no database change is required for the UI-only total-IN presentation.
- If v6 is not present, use the combined custom migration script in staging only after backing up the database and checking which custom migrations succeeded. Do not run both the combined SQL and the individual files.
