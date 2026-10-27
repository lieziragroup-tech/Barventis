# Evidence Ledger

Record consequential factual claims, external documentation checks, test runs, repository observations, and release evidence. Do not log secrets or sensitive raw payloads.

| ID | Date checked | Claim / check | Classification | Source type | Exact URL/path/command | Version/date observed | Result | Confidence / limitation | Review by |
|---|---|---|---|---|---|---|---|---|---|
| EV-0001 | YYYY-MM-DD | Example only—replace with actual evidence | NOT RUN | none | none | UNKNOWN | NOT RUN | Template example, not real project evidence | YYYY-MM-DD |
| EV-0002 | 2026-10-27 | Fix infinite loading & full_pack cost in UsageRecap | OBSERVED | Code inspection & build | `npm run build` && `npm test` | 2026-10-27 | PASS | Build clean, 276/276 tests pass | Ayling & Izumi |
| EV-0003 | 2026-10-27 | Align Onboarding & Guidebook with F&B Daily Inventory workflow | OBSERVED | Code inspection & build | `npm run build` && `npm test` | 2026-10-27 | PASS | Build clean, 276/276 tests pass | Ayling & Izumi |
| EV-0004 | 2026-10-27 | Fix .form-control cascade layer and SimplePrep inputs & default full_pack | OBSERVED | Code inspection & build | `npm run build` && `npm test` | 2026-10-27 | PASS | Build clean, 276/276 tests pass | Ayling & Izumi |
| EV-0005 | 2026-10-27 | Add debounced search, sorting, category/quadrant filters, and pagination to MenuEngineering | OBSERVED | Code inspection & build | `npm run build` && `npm test` | 2026-10-27 | PASS | Build clean, 276/276 tests pass | Ayling & Izumi |
| EV-0006 | 2026-10-27 | Add trimming stage selector in SimplePrep & auto-update processed material HPP in api.js | OBSERVED | Code inspection & build | `npm run build` && `npm test` | 2026-10-27 | PASS | Build clean, 276/276 tests pass | Ayling & Izumi |

Allowed classifications: `OBSERVED`, `SOURCE-BACKED`, `INFERRED`, `ASSUMPTION`, `UNKNOWN`, `NOT RUN`. For tests use `PASS`, `FAIL`, `NOT RUN`, `BLOCKED` in Result.
