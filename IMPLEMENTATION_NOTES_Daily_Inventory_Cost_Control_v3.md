# Barventis — Daily Inventory & Cost Control v3

## Status

This is an implementation working copy. The migration has **not** been applied to any live Supabase project. The attached `Pasted text.txt` was used as a schema reference; it does not provide a database connection or live data access.

## Main changes

- Daily Inventory uses a single daily session in `daily_inventories` + `daily_inventory_items`, unique per tenant/date/location and one row per material. `daily_stock_counts` is not dropped or copied; it remains a legacy table pending a separate migration decision.
- Draft save/closing/reopen flow uses database RPCs so detail updates, inventory adjustment, and audit records run in a database transaction. Closing requires all daily Bahan/Beer items to be explicitly marked counted; a blank count differs from an explicit zero.
- OUT is manually entered/confirmed by staff and is posted once at EOD close. It is not derived from ESB sales. WASTE/BREAKAGE/EXPIRED/COMP remain separate source transactions; purchases/transfers already recorded in their source modules are read into Daily Inventory rather than entered again.
- Purchasing/PO receipt, waste recording, location transfer, EOD closing and reopen use atomic/idempotent RPCs. Purchase cancellation reverses its source transaction rather than deleting history, and is blocked when later stock movements/closed EODs make an automatic reversal unsafe.
- `material_location_costs` stores Moving Weighted Average (WAC) per material and stock location. Legacy `avg_cost`/price is treated as package-level cost for compatibility with the existing recipe UI, then converted to cost per tracked stock unit using `unit` and `full_pack`. The per-location WAC table is the authority for inventory valuation; the legacy `avg_cost` field remains package-level for the existing recipe-costing code. New materials are seeded with estimated costs for both locations.
- Stock opname valuation snapshots WAC on approval. The estimate flag remains true until opening stock and valuation are verified.
- ESB upload is treated as revenue/sales plus theoretical recipe usage only. POS import no longer deducts physical stock. The same file hash is idempotent, and overlapping date windows require the user to choose/confirm overwrite rather than silently adding sales twice.
- Cost Control distinguishes (1) actual daily usage from staff-confirmed OUT, (2) stock-based usage from closing count + ledger movements, and (3) theoretical COGS calculated from POS quantities and recipe ingredients.
- Manual stock adjustment UI is narrowed to legitimate adjustments; purchase, waste, transfer and usage belong to their source modules.
- Date defaults use the local calendar date rather than UTC slicing.

## Migration and rollout order

1. **Back up the database** and keep a restorable copy of current data.
2. Deploy to a staging Supabase project first. Do not run this directly in production as the first test.
3. Apply `supabase/migrations/20261020000000_daily_inventory_cost_control_v3.sql` before deploying the updated frontend. The frontend calls new RPCs/columns added by this migration.
4. The migration preflight intentionally stops and rolls back if `daily_inventories` has duplicate `(tenant_id, date, location)` headers or `daily_inventory_items` has duplicate `(inventory_id, material_id)` rows. Reconcile these before retrying; do not delete arbitrary rows to get past the check.
5. Review roles for closing/reopening. The RPC defaults to permitting `Admin / Owner`, `Owner`, `Supervisor`, and `Super Admin`. Adjust only after the permission matrix is explicitly approved.
6. Validate the first opening stock and WAC per material in both RESTO and CENTRAL. The seeded WAC is marked estimated by design. Do not treat stock-valued Cost Control as finance-final until the location balance and value have been verified against a physical count and purchase history.
7. Test all flows below in staging. Confirm report totals with the agreed reconciliation period before rollout.

## Known migration/cutover constraints

- The migration preserves existing tables and old transaction rows. It does not destructively delete `daily_stock_counts`, old POS deduction rows or historical Excel data.
- Old `POS_DEDUCTION` movements are kept because they may already be reflected in legacy stock balances. During cutover, inspect legacy deduction periods before trusting historic stock variance. New ESB imports do not create physical stock deductions.
- Recipe theoretical COGS depends on the current recipe and current recipe ingredient pricing available to the importer. Historical recipe-version pricing must be validated for reports where exact historical standard cost is required.
- Unit and `full_pack` data quality remains a prerequisite. Items whose purchase unit and stock unit cannot be reconciled should be corrected in master data before purchasing, count closing or official cost reporting.
- Automatic cancellation of a purchase is deliberately conservative. If any later stock movement or a closed EOD uses that receipt, the RPC rejects cancellation; use an approved stock adjustment/reconciliation path instead.
- A missing/mismatched menu-to-recipe mapping is surfaced as an import issue; it must not be silently considered a zero theoretical cost.
- The migration adds a per-location WAC table but does not create a financial accounting ledger or replace general-ledger/accounting approvals.

## Acceptance checklist for staging

### Daily Inventory
- [ ] Opening a date/location twice opens the same session; no duplicate header is created.
- [ ] Saving a draft twice keeps one detail per material.
- [ ] Blank physical count remains `uncounted`; explicitly checking a zero stock count stores zero and allows close.
- [ ] FULL/BROKEN converts correctly for representative pck, bottle/carton, kg/gr and ml/l materials.
- [ ] Closing is blocked when any Bahan/Beer item has not been physically counted.
- [ ] OUT is stored as actual usage at close; OUT is not also deducted by POS import.
- [ ] WASTE remains separate and is not subtracted twice from inventory.
- [ ] Closing writes stock adjustments only when there is a non-zero unexplained stock difference and never writes zero-quantity movement rows.
- [ ] Reopening requires an authorized role, reverses only the linked EOD entries, restores the pre-close balance, and records audit history.
- [ ] A historical close/reopen is blocked when newer closing sessions or stock movements exist.

### Purchasing, PO receipt, waste and transfers
- [ ] Retrying a purchase request key or receiving the same PO twice does not increase stock twice.
- [ ] Purchase quantity is converted to the stock unit before updating quantity/WAC; its line total remains purchase quantity × entered unit price.
- [ ] Receipt directly into RESTO and receipt into CENTRAL both update only the selected location.
- [ ] WAC recomputes per location on receipt; a transfer preserves source cost and blends into the receiving location's WAC.
- [ ] Waste updates stock, waste log and transaction exactly once.
- [ ] Cancellation refuses after later movement/closing; successful cancellation reverses history and restores prior state.

### ESB and Cost Control
- [ ] Re-uploading identical file hash does not duplicate sales/revenue/theoretical usage.
- [ ] Overlapping import dates require an explicit overwrite decision.
- [ ] ESB upload increases sales and theoretical usage but does not change `qty_resto`/`qty_central`.
- [ ] Cost Control separately shows actual OUT, stock-based usage, theoretical COGS, and their differences.
- [ ] Revenue denominator uses ESB `Subtotal` and excludes service/tax if that is the approved Barventis rule.
- [ ] Unmapped menu/recent recipe/unit issues are visible and prevent a false “complete” report.
- [ ] Historical values use cost snapshots and do not change merely because the master price changes later.

## Continued implementation after v3 package draft

- Kept production inside the existing Daily Inventory Hub as the `Proses Produksi` tab. Visibility is role-aware for Admin/Owner, Supervisor, Bar, Kitchen, and Central, so Daily Inventory remains the single navigation workspace rather than adding a parallel menu route.
- Recipe setup/edit controls are hidden for operators who can post a production run but cannot manage production recipes; database authorization remains authoritative.
- Extended database unit conversion for legacy `full_pack` formats such as `1000 gr` when stock is tracked by package (`pck`, bottle, carton, etc.). Ambiguous/incompatible unit conversions still fail instead of silently inventing a conversion.
- Updated WAC uncertainty propagation: a purchase or production receipt into an empty location may establish a non-estimated cost, while positive stock that was already estimated remains flagged; transfers carry estimation status from the source/target valuation.
- Fixed an existing escaped template-literal syntax issue in `src/components/shared/SwipeableItem.jsx` that prevented the source parser from reading the full frontend tree.

## Validation performed in this working copy

- TypeScript compiler transpile/parser check passed for all 115 source JS/JSX/TS files after the existing `SwipeableItem.jsx` syntax fix. This is a syntax check, not a full type-check/bundle.
- 7 domain smoke assertions passed for FULL/BROKEN conversion, count variance, production accounting and local date formatting.
- Static migration checks are rerun for transaction wrapper, function delimiter balance, expected RPC declarations, non-destructive DDL and uniqueness/preflight guards.
- Full `npm run build` / `npm test` could not be completed because `npm install --ignore-scripts --no-audit --no-fund` timed out in this execution environment and dependencies are unavailable locally.
- SQL was not executed against PostgreSQL/Supabase in this environment. Treat the migration as **requiring staging execution and SQL review**, not as a proven production-safe migration yet.

## Patch v3.0.1 — SQL syntax fix (2026-10-20)

Fixed a PL/pgSQL parser error in `convert_material_qty_to_stock_unit_v3` around the `CASE` expression embedded directly in an `IF` condition. The inventory stock dimension (`v_stock_group`) is now calculated into a local variable before the condition is evaluated. This avoids the parser failure at the `WHEN v_stock IN ('gr','g','kg') THEN 'MASS'` branch and makes the condition easier to maintain.

Use the full corrected migration file. Do not run only the fragment around the reported line. This is a source-level fix; it has not been executed against the user's live PostgreSQL/Supabase database in this environment.
