-- ============================================================================
-- Barventis v5.3 Final Incremental Database Update (Idempotent & Safe)
-- Jalankan di Supabase SQL Editor pada project Supabase Barventis yang aktif.
-- ============================================================================

BEGIN;

-- 0. Validasi awal: pastikan dijalankan di project Supabase Barventis yang benar
DO $$
BEGIN
  IF to_regclass('public.invoices') IS NULL THEN
    RAISE EXCEPTION 'Tabel public.invoices tidak ditemukan di project Supabase ini. Pastikan kamu memilih project Supabase Barventis yang benar di pojok kiri atas dashboard Supabase.';
  END IF;
END $$;

-- 1. Pastikan kolom workflow & penyesuaian penerimaan v4.x–v5.x tersedia di public.invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS workflow_status text,
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'REQUESTED',
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS actual_receipt_total numeric,
  ADD COLUMN IF NOT EXISTS price_adjusted_on_receipt boolean DEFAULT false;

-- 2. Kunci RLS tabel public.invoices berdasarkan role & lokasi (casting ::text aman untuk enum)
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bv52_invoices_role_boundary_select" ON public.invoices;

CREATE POLICY "bv52_invoices_role_boundary_select"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  tenant_id = public.bv2_auth_tenant_id()
  AND (
    -- Owner / Admin / Super Admin / Purchasing: akses penuh sesuai tenant
    LOWER(COALESCE(public.bv2_auth_role(), '')) IN ('owner', 'admin / owner', 'admin  owner', 'super admin', 'superadmin', 'purchasing')
    OR (
      -- Central: HANYA PO tujuan CENTRAL (PO tujuan RESTO/cabang diblokir di level DB)
      LOWER(COALESCE(public.bv2_auth_role(), '')) = 'central'
      AND UPPER(COALESCE(location::text, '')) = 'CENTRAL'
    )
    OR (
      -- Head Bar / Supervisor: PO cabang sendiri (RESTO) atau antrean PENDING_HEADBAR
      LOWER(COALESCE(public.bv2_auth_role(), '')) IN ('head bar', 'supervisor')
      AND (branch_id IS NULL OR branch_id = public.bv2_auth_branch_id())
      AND (
        UPPER(COALESCE(location::text, '')) = 'RESTO'
        OR UPPER(COALESCE(workflow_status, approval_status, status::text, '')) = 'PENDING_HEADBAR'
      )
    )
    OR (
      -- Rekan Bar / Bar / Barista / staf outlet lain: HANYA PO cabang sendiri (RESTO)
      (branch_id IS NULL OR branch_id = public.bv2_auth_branch_id())
      AND UPPER(COALESCE(location::text, '')) = 'RESTO'
    )
  )
);

-- 3. View operasional PO tanpa nominal finansial (total) untuk role non-keuangan
CREATE OR REPLACE VIEW public.v_invoices_operational_safe
WITH (security_invoker = true) AS
SELECT
  id,
  tenant_id,
  branch_id,
  invoice_no,
  supplier,
  date,
  status,
  COALESCE(workflow_status, approval_status, status::text) AS workflow_status,
  location,
  notes,
  received_date,
  created_at
FROM public.invoices;

GRANT SELECT ON public.v_invoices_operational_safe TO authenticated;

-- 4. Kunci SET search_path = public, pg_temp pada semua fungsi SECURITY DEFINER di skema public
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS fn_sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp;', fn.fn_sig);
  END LOOP;
END $$;

COMMIT;
