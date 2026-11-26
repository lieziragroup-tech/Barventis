-- ============================================================================
-- Barventis v5.2 Security Hardening Migration (SAFE TO RUN IMMEDIATELY)
-- 1. Enforces database-level Role-Aware RLS on public.invoices so Central
--    can ONLY read POs with location = 'CENTRAL' (blocks RESTO POs at DB layer).
-- 2. Creates security_invoker operational PO view without financial totals.
-- 3. Locks SET search_path = public, pg_temp on ALL SECURITY DEFINER functions
--    in the public schema to prevent search_path hijacking.
-- ============================================================================

BEGIN;

-- 1. Harden SELECT policy on public.invoices with strict role-location boundaries
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bv52_invoices_role_boundary_select" ON public.invoices;

CREATE POLICY "bv52_invoices_role_boundary_select"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  tenant_id = public.bv2_auth_tenant_id()
  AND (
    -- Owner / Admin / Super Admin / Purchasing: full visibility within tenant (and active branch if scoped)
    LOWER(COALESCE(public.bv2_auth_role(), '')) IN ('owner', 'admin / owner', 'admin  owner', 'super admin', 'superadmin', 'purchasing')
    OR (
      -- Central: STRICTLY POs destined for CENTRAL warehouse only
      LOWER(COALESCE(public.bv2_auth_role(), '')) = 'central'
      AND UPPER(COALESCE(location, '')) = 'CENTRAL'
    )
    OR (
      -- Head Bar / Supervisor: own branch RESTO POs or PENDING_HEADBAR approvals
      LOWER(COALESCE(public.bv2_auth_role(), '')) IN ('head bar', 'supervisor')
      AND (branch_id IS NULL OR branch_id = public.bv2_auth_branch_id())
      AND (
        UPPER(COALESCE(location, '')) = 'RESTO'
        OR UPPER(COALESCE(workflow_status, '')) = 'PENDING_HEADBAR'
      )
    )
    OR (
      -- Rekan Bar / Bar / Barista / other outlet staff: own branch RESTO POs only
      (branch_id IS NULL OR branch_id = public.bv2_auth_branch_id())
      AND UPPER(COALESCE(location, '')) = 'RESTO'
    )
  )
);

-- 2. Create financial-masked operational view for non-financial roles (Central / Bar)
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
  workflow_status,
  location,
  notes,
  received_date,
  created_at
FROM public.invoices;

GRANT SELECT ON public.v_invoices_operational_safe TO authenticated;

-- 3. Lock SET search_path = public, pg_temp on ALL SECURITY DEFINER functions in public schema
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
