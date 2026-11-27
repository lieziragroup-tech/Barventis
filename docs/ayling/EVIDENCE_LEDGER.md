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
| EV-0007 | 2026-10-27 | Fix HTTP 400 errors: normalize material payload and guard transfer request enum | OBSERVED | Code inspection & build | `npm run build` && `npm test` | 2026-10-27 | PASS | Build clean, 276/276 tests pass | Ayling & Izumi |
| EV-0008 | 2026-11-13 | Migrasi v7–v10 (BROKEN counts, 2-tier conversion, POS compare, terpakai_qty trigger) | OBSERVED | Code & SQL migration inspection | `supabase/migrations/20261024*` .. `20261113*` | 2026-11-13 | PASS | Skema SQL & utilitas konversi terpasang di repo; eksekusi DB live tetap prasyarat staging | Ayling & Izumi |
| EV-0009 | 2026-11-13 | Perapian UI copywriting & sub-deskripsi 4–6 kata di modul utama | OBSERVED | Code inspection & build | `npm run build` && `npm run lint` | 2026-11-13 | PASS | Build sukses, 0 lint errors | Ayling & Izumi |
| EV-0010 | 2026-11-13 | Implementasi multi-cabang v11 (isolasi katalog, clone menu, mutasi antar cabang, dashboard Owner) | OBSERVED | Code & SQL migration inspection | `supabase/migrations/20261114000000_multi_branch_full_support_v11.sql` | 2026-11-13 | PASS | Terintegrasi dengan UI & API; eksekusi SQL di staging diperlukan sebelum produksi | Ayling & Izumi |
| EV-0011 | 2026-11-13 | Penegakan strict branch isolation v12 (NOT NULL, RLS 37 tabel, trigger integritas, fail-closed API & interceptor) | OBSERVED | Unit & integration test suite | `npx vitest run` | 2026-11-13 | PASS | 18 file uji, 322/322 test lulus (termasuk `multiBranch.test.js` 10/10 & `upgradeModulesApi.test.js` 8/8) | Ayling & Izumi |
| EV-0012 | 2026-11-13 | Verifikasi kompilasi produksi & pemeriksaan lint pasca-v12 | OBSERVED | Build & ESLint check | `npm run build` && `npm run lint` | 2026-11-13 | PASS | Vite + esbuild bundle sukses; ESLint 0 errors (186 warnings eksisting) | Ayling & Izumi |
| EV-0013 | 2026-11-13 | Pembaruan dokumentasi penuh repository (.md) | OBSERVED | File review | `README.md`, `_index.md`, `docs/CHANGELOG_AND_ARCHITECTURE.md`, `docs/ayling/*` | 2026-11-13 | PASS | Seluruh dokumen utama sinkron dengan status v12 | Ayling & Izumi |

Allowed classifications: `OBSERVED`, `SOURCE-BACKED`, `INFERRED`, `ASSUMPTION`, `UNKNOWN`, `NOT RUN`. For tests use `PASS`, `FAIL`, `NOT RUN`, `BLOCKED` in Result.
