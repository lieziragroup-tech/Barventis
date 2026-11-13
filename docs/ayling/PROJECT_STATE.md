# Project State — Barventis

- Project: Barventis (Daily Inventory & Cost Control — F&B Bar & Kitchen, Multi-Branch ERP)
- Baseline version: 1.0.0 (Arsitektur DB v12 — Strict Branch Isolation)
- Current stage: Ready for Staging Verification
- Current objective: Isolasi data ketat per cabang (`branch_id` fail-closed API, RLS PostgreSQL, `NOT NULL`) & sinkronisasi dokumentasi penuh
- Current branch / commit: main
- Worktree changes: supabase/migrations/ (v7–v12), src/lib/supabase.js, src/contexts/, src/data/materialsRepo.js, src/services/ (api.js, upgradeModulesApi.js, __tests__), src/pages/shared/, docs/
- Last confirmed verification run: 2026-11-13 (Vitest: 322/322 PASS across 18 test files; Build `vite build && esbuild`: PASS; ESLint: 0 errors, 186 warnings)
- Known blockers: Migrasi SQL v9–v12 (termasuk `20261115000000_strict_branch_isolation_v12.sql`) belum dieksekusi pada instance Supabase produksi/staging yang terhubung eksternal
- Risks / limitations: Mengikuti spesifikasi Barventis & alur bisnis F&B (13 sheets / multi-cabang); pastikan seluruh pengguna non-admin di Supabase memiliki `branch_id` valid sebelum menerapkan constraint `NOT NULL` & RLS v12
- Next smallest useful action: Terapkan migrasi `v9 → v10 → v11 → v12` di Supabase staging dan verifikasi skenario CRUD non-admin lintas cabang secara end-to-end
- Last updated: 2026-11-13
- Updated by: Ayling / Izumi
