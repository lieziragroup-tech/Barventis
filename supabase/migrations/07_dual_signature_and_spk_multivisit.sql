-- ====================================================================================================
-- MIGRASI 07: TANDA TANGAN GANDA TEKNISI & KLIEN PADA WORK REPORTS SERTA DUKUNGAN MULTI-VISIT SPK
-- Jalankan script ini di Supabase SQL Editor untuk memperbarui skema database:
-- 1. Menambahkan kolom `technician_signature` dan `technician_signed_at` pada tabel `work_reports`
-- 2. Memastikan tabel `spk` memiliki kolom `payload` JSONB untuk menyimpan metadata kunjungan bertahap
-- 3. Memastikan tabel `order_tracking` tersedia untuk pelacakan termin pembayaran kontrak (AR & PCO)
-- 4. Me-reload schema cache PostgREST Supabase
-- ====================================================================================================

BEGIN;

-- 1. Penambahan Kolom Tanda Tangan Teknisi pada Laporan Kerja Lapangan
ALTER TABLE public.work_reports 
ADD COLUMN IF NOT EXISTS technician_signature text,
ADD COLUMN IF NOT EXISTS technician_signed_at timestamptz;

COMMENT ON COLUMN public.work_reports.technician_signature IS 'Base64 data URL tanda tangan digital / paraf petugas teknisi lapangan';
COMMENT ON COLUMN public.work_reports.technician_signed_at IS 'Waktu saat teknisi membubuhkan tanda tangan pengesahan pekerjaan';

-- 2. Penambahan Kolom Payload pada Tabel SPK (Surat Perintah Kerja)
ALTER TABLE public.spk 
ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3. Memastikan Tabel Order Tracking Tersedia untuk Pelacakan Pembayaran Kontrak
CREATE TABLE IF NOT EXISTS public.order_tracking (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_order_tracking_company ON public.order_tracking(company_id);

-- 4. Reload PostgREST schema cache agar kolom baru langsung dikenali oleh Supabase client
NOTIFY pgrst, 'reload schema';

COMMIT;
