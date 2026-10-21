# Barventis Daily Inventory & Cost Control v4 — Implementation Notes

## Scope
This package implements the v4 design for Daily Inventory, closing preview, pagination/debounced search, inferred FULL + manually weighed BROKEN, location-specific opening balances, source-ledger driven IN/WASTE/production movements, optional lot/expiry tracking, FEFO exception controls, and separate Cost Control metrics.

## Confirmed operating rules
- Daily session identity: one tenant + operational date + stock location.
- Previous approved EOD closing is the next opening baseline for the same material/location; legitimate posted movements after that closing are applied exactly once.
- If no approved EOD exists, the opening is marked estimated and reconstructed from current material balance and same-day posted movements. This must be reconciled before treating it as accounting-grade.
- IN is sourced from posted receipts/transfers/production output, not re-entered in the Daily Inventory form.
- OUT is staff-entered/confirmed actual usage; staff must explicitly confirm zero activity where appropriate.
- WASTE, BREAKAGE, EXPIRED and COMP are distinct from direct OUT.
- FULL is inferred; it is not presented as a separate physical count. BROKEN is manually weighed at closing per material/location in the configured content unit.
- One active open lot per tracked material/location. Lot-level expiry remains separate; FEFO is the default issue order. Aggregate BROKEN is linked internally to the active lot. FEFO or unverified legacy-lot exceptions require an authorized role and reason.
- ESB sales imports feed revenue and recipe/theoretical COGS only; they do not automatically deduct physical inventory.
- Cost Control presents actual OUT, theoretical COGS, and stock-opname-based COGS separately.

## Files of interest
- `src/pages/shared/DailyInventory.jsx`
- `src/pages/shared/CostControl.jsx`
- `src/services/api.js`
- `src/services/dailyInventoryMath.js`
- `src/pages/shared/StockLedger.jsx`
- `src/pages/shared/ProductionBatches.jsx` and associated components/services
- `supabase/migrations/20261020000000_daily_inventory_cost_control_v3.sql`
- `supabase/migrations/20261021000000_daily_inventory_broken_fefo_v4.sql`
- `src/services/__tests__/dailyInventoryMath.test.js`

## Migration selection
1. **If v3 has not been fully applied** (or an earlier attempt rolled back): use `Barventis_Daily_Inventory_Cost_Control_v4_ALL_IN_ONE.sql`, which contains the corrected v3 migration and the additive v4 migration in order.
2. **If v3 was applied successfully already:** apply only `20261021000000_daily_inventory_broken_fefo_v4.sql`.
3. Do not run both the combined file and incremental v4 on the same database unnecessarily. The SQL is designed to be largely idempotent, but deployment should still be tracked deliberately.
4. Take a database backup and use a staging project first. Inspect duplicate sessions, legacy lot balances, RLS/function permissions, and current inventory values. Do not delete historical data to clear a migration error.
5. For manual SQL Editor use, note the exact file/version that was executed. For CLI-based deployments, reconcile the files with Supabase migration history instead of mixing manual and CLI bookkeeping blindly.

## First-use configuration
- Review `materials.broken_tracking_enabled`; migration enables it heuristically for materials whose Full Pack appears to specify a recognized content unit. This heuristic needs a human review.
- Configure `materials.expiry_tracking_enabled` only for materials where expiry/lot tracking is needed.
- For expiry-tracked materials, configure shelf life for production outputs and supply an expiry date on receipt. If a single purchase contains several expiry dates, split it into separate lot receipts.
- Existing lot rows are marked unverified until their aggregate quantities/location are reconciled. A manager reason does not make a real quantity mismatch disappear.
- Opening balances seeded from legacy material master values are estimates until a signed stock count verifies them.
- Moving Weighted Average per material/location is the current implementation recommendation, not an accounting policy approved by Finance. Get explicit owner/finance sign-off before production reporting is considered final.

## Cost Control measurement limitation
Because FULL is inferred from book balance minus weighed BROKEN, daily EOD does **not** independently measure sealed FULL packages. Therefore daily ledger depletion must not be described as an independent physical stock reconciliation. The UI/export now labels this as a ledger estimate; the independent stock-based metric remains the approved Stock Opname/period opening + receipts − closing method. A difference between this metric and staff-confirmed OUT/waste requires investigation; it is not automatically loss.

## Acceptance / smoke checks
- Opening carry-forward: same location/material, last closed/verified EOD + legitimate ledger movements after close.
- First-day opening is flagged estimated, never silently presented as verified.
- OUT must be entered or explicitly confirmed zero before close. Blank is not zero.
- BROKEN is required only for configured materials and must be a nonnegative number in the expected unit. FULL is inferred server-side from book closing, pack size, and BROKEN.
- A non-integral/negative inferred FULL blocks close and provides a message to check unit, OUT, IN, waste, production, or weigh-in.
- Draft state survives pagination, page-size changes, and searching; search is debounced.
- Preview covers all active non-asset materials, not just currently visible rows. Closing refuses to omit an active material.
- Duplicate material IDs in one payload fail. Saving the same draft/close again cannot double-post OUT/adjustment/lot movements.
- ESB imports never mutate physical stock; POS sales remain the source for theoretical COGS and revenue.
- FEFO-tracked items require expiry on receipt; one open lot per material/location; transfers preserve lot identity; exceptions require permitted approver/reason.
- Production input and output are atomic and costs are carried to the semi-finished item without double-counting as final usage.
- Reopen/reclose must reverse/reapply only the appropriate EOD OUT lot movements and must not restore waste/production usage that remains posted.
- Cross-tenant access is denied by RPC/RLS; verify using at least two tenant accounts in staging.
- Export/report labels distinguish actual OUT, theoretical COGS, inferred daily ledger estimate, and independent stock-opname-based depletion.

## Validation status (truthful)
- `node --check` passed for the modified plain `.js` service files.
- TypeScript transpile/syntax validation and relative import checks should be re-run as part of CI after deployment.
- Domain math has a local test file, but the package's full Vitest suite was not run in this environment because project dependencies are not installed here.
- PostgreSQL migration syntax and runtime behavior have **not** been confirmed on a live Supabase/PostgreSQL server in this environment. Static quote/parenthesis checks are not a substitute for applying to staging.
- Do not claim production-ready until the full Vite build, unit tests, staging migration, RLS tests, and acceptance scenarios above pass.
