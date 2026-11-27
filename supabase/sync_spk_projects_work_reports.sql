-- ============================================================================
-- PT GUCI EMAS PRATAMA — SINKRONISASI DATA ASLI SUPABASE (FILE 1 <-> FILE 2)
-- Jalankan di Supabase SQL Editor bila ingin menyinkronkan data SPK/Proyek lama
-- agar langsung muncul sebagai Work Report di kedua aplikasi.
-- ============================================================================

ALTER TABLE public.work_reports
  ADD COLUMN IF NOT EXISTS technician_signature text,
  ADD COLUMN IF NOT EXISTS technician_signed_at timestamptz;

ALTER TABLE public.spk
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Jembatani baris public.spk yang belum tercatat di public.projects
INSERT INTO public.projects (
  company_id, project_name, client_name, address, latitude, longitude, radius,
  work_date, work_type, service_type, contract_type, warranty_months,
  scheduled_start_time, notes, quotation_id, created_by
)
SELECT
  s.company_id,
  COALESCE(NULLIF(TRIM(s."Work_Description"), ''), s.customer_name, 'Proyek Operasional'),
  COALESCE(s.customer_name, 'Pelanggan Operasional'),
  COALESCE(NULLIF(TRIM(s.location), ''), s.customer_name, 'Lokasi Operasional'),
  COALESCE((s.payload->>'latitude')::float8, 0),
  COALESCE((s.payload->>'longitude')::float8, 0),
  100,
  COALESCE(s.execution_date, CURRENT_DATE),
  COALESCE(NULLIF(TRIM(s."Work_Description"), ''), 'Layanan Pengendalian Hama'),
  CASE
    WHEN UPPER(COALESCE(s.service_type, '')) LIKE '%RAYAP%' OR UPPER(COALESCE(s.service_type, '')) LIKE '%TERMITE%' THEN 'TERMITE_CONTROL'::public.service_type
    WHEN UPPER(COALESCE(s.service_type, '')) LIKE '%RODENT%' OR UPPER(COALESCE(s.service_type, '')) LIKE '%TIKUS%' THEN 'RODENT_CONTROL'::public.service_type
    WHEN UPPER(COALESCE(s.service_type, '')) LIKE '%FOGGING%' OR UPPER(COALESCE(s.service_type, '')) LIKE '%MOSQUITO%' THEN 'MOSQUITO_CONTROL'::public.service_type
    WHEN UPPER(COALESCE(s.service_type, '')) LIKE '%FUMIG%' THEN 'FUMIGATION'::public.service_type
    ELSE 'GENERAL_PEST_CONTROL'::public.service_type
  END,
  'ONE_TIME'::public.contract_type,
  0,
  '08:30'::time,
  CONCAT('[SPK: ', COALESCE(s.spk_number, '-'), '] ', COALESCE(s."Work_Description", '')),
  s.quotation_id,
  s.assigned_to
FROM public.spk s
WHERE s.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.company_id = s.company_id
      AND (
        (s.quotation_id IS NOT NULL AND p.quotation_id = s.quotation_id AND p.work_date = s.execution_date)
        OR (s.spk_number IS NOT NULL AND p.notes LIKE '%' || s.spk_number || '%')
      )
  );

-- Pastikan setiap baris di public.projects memiliki pasangan di public.work_reports
INSERT INTO public.work_reports (
  company_id, project_id, executor_id, status, customer_name, notes
)
SELECT
  p.company_id,
  p.id,
  COALESCE(
    p.created_by,
    (SELECT u.id FROM public.users u WHERE u.company_id = p.company_id AND u.role = 'TEKNISI_LAPANGAN' AND u.is_active = true LIMIT 1)
  ),
  'READY'::public.work_report_status,
  COALESCE(p.client_name, p.project_name),
  p.notes
FROM public.projects p
WHERE NOT EXISTS (
  SELECT 1 FROM public.work_reports wr WHERE wr.project_id = p.id
);

NOTIFY pgrst, 'reload schema';
