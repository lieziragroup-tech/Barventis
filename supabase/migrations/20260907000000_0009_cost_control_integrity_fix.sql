-- =============================================================================
-- Migration: 0009_cost_control_integrity_fix
-- Tujuan   : Fase 2 dari rencana perbaikan QA Cost Control (lihat
--            Rencana_Perbaikan_Barventis_CostControl.md).
--
-- PENTING: jalankan query pengecekan duplikat DULU (lihat Bagian 0) sebelum
-- migrasi ini di-apply ke production. Jika ada duplikat existing, ALTER TABLE
-- ADD CONSTRAINT di bawah akan GAGAL (by design) — itu tandanya harus
-- dibersihkan manual dulu (lihat Fase 2.1 di rencana perbaikan), baru migrasi
-- ini dijalankan ulang.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- BAGIAN 0 — Pengecekan duplikat (jalankan manual dulu, JANGAN di-apply
-- sebagai bagian dari migrasi otomatis; disediakan di sini untuk referensi).
-- -----------------------------------------------------------------------------
-- SELECT tenant_id, period_month, period_year, location, COUNT(*)
-- FROM stock_opnames
-- GROUP BY tenant_id, period_month, period_year, location
-- HAVING COUNT(*) > 1;
--
-- SELECT tenant_id, file_hash, COUNT(*)
-- FROM pos_upload_logs
-- GROUP BY tenant_id, file_hash
-- HAVING COUNT(*) > 1;

-- -----------------------------------------------------------------------------
-- BAGIAN 1 — Cegah stock_opnames duplikat per tenant+cabang+periode.
-- Akar masalah temuan QA: Total Stock Akhir sistem ~2x lipat dari Excel SO,
-- karena getCostControlReport() menjumlah SEMUA stock_opnames yang match
-- periode tanpa filter status/duplikat.
-- -----------------------------------------------------------------------------
ALTER TABLE public.stock_opnames
  ADD CONSTRAINT uq_stock_opnames_tenant_period_location
  UNIQUE (tenant_id, period_month, period_year, location);

-- -----------------------------------------------------------------------------
-- BAGIAN 2 — Cegah pos_upload_logs duplikat per tenant+file_hash.
-- Catatan: sebelum fix di api.js (processPOSSync), file_hash diisi dari
-- nama file saja (bukan hash konten), jadi constraint ini baru benar-benar
-- efektif SETELAH kode di-deploy dengan fix content-hashing (SHA-256).
-- -----------------------------------------------------------------------------
ALTER TABLE public.pos_upload_logs
  ADD CONSTRAINT uq_pos_upload_logs_tenant_filehash
  UNIQUE (tenant_id, file_hash);

-- Kolom audit tambahan untuk pos_upload_logs (dipakai oleh fix processPOSSync
-- di api.js, supaya setiap upload log mencatat jelas mana baris yang benar-benar
-- baru vs yang di-update/di-merge ke tanggal yang sudah ada).
ALTER TABLE public.pos_upload_logs
  ADD COLUMN IF NOT EXISTS rows_inserted integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_updated integer DEFAULT 0;

-- -----------------------------------------------------------------------------
-- BAGIAN 3 — Kolom jejak audit untuk backfill Fase 4 (bug pack-size legacy).
-- Menyimpan nilai `amount` original SEBELUM di-recalculate, supaya proses
-- backfill bisa diaudit/di-rollback dan tidak ada history yang hilang.
-- -----------------------------------------------------------------------------
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS amount_original numeric;

COMMENT ON COLUMN public.transactions.amount_original IS
  'Nilai amount SEBELUM backfill Fase 4 (koreksi bug pack-size pra-Juli 2026). NULL berarti baris ini belum pernah di-backfill / dibuat setelah fix.';

-- -----------------------------------------------------------------------------
-- BAGIAN 4 — Index pendukung query duplicate-check yang lebih sering dipanggil
-- sekarang (checkPosSalesDuplicate, processPOSSync existing-date lookup).
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_type_date
  ON public.transactions (tenant_id, type, date);
