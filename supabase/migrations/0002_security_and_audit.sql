-- ==============================================================================
-- MIGRATION: 0002_security_and_audit.sql
-- DESCRIPTION: Penerapan Row Level Security (RLS) dan Trigger Audit Trail (Immutability)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTEND AUDIT LOGS TABLE FOR ENTERPRISE AUDIT TRAIL
-- ------------------------------------------------------------------------------
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS table_name character varying,
  ADD COLUMN IF NOT EXISTS record_id text,
  ADD COLUMN IF NOT EXISTS old_data jsonb,
  ADD COLUMN IF NOT EXISTS new_data jsonb;

-- Menghapus updated_at jika ada untuk memastikan tabel ini by-design append-only
ALTER TABLE public.audit_logs DROP COLUMN IF EXISTS updated_at;


-- ------------------------------------------------------------------------------
-- 2. TRIGGER: BLOCK UPDATE/DELETE PADA AUDIT LOGS (IMMUTABILITY)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_block_audit_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Keamanan Sistem: Tabel audit_logs bersifat IMMUTABLE. UPDATE atau DELETE tidak diizinkan sama sekali.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_audit_update ON public.audit_logs;
CREATE TRIGGER trg_block_audit_update
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_audit_mutation();


-- ------------------------------------------------------------------------------
-- 3. TRIGGER: AUTOMATIC SERVER-SIDE AUDIT LOGGING
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_audit_trigger() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    action,
    description,
    table_name,
    record_id,
    old_data,
    new_data,
    created_at
  )
  VALUES (
    COALESCE(NEW.tenant_id, OLD.tenant_id),
    auth.uid(),
    TG_OP,
    'System Auto-Audit: ' || TG_TABLE_NAME || ' ' || lower(TG_OP),
    TG_TABLE_NAME,
    COALESCE(NEW.id::text, OLD.id::text),
    to_jsonb(OLD),
    to_jsonb(NEW),
    now()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Menerapkan trigger audit ini pada tabel-tabel transaksi/master yang paling sensitif
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'materials', 'recipes', 'invoices', 'purchase_entries',
    'stock_opnames', 'transactions', 'expected_usage'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger()', t, t);
  END LOOP;
END;
$$;


-- ------------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES - POLA A (Direct Tenant_id)
-- ------------------------------------------------------------------------------
-- Membuat fungsi pembantu kecil untuk RLS
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id() RETURNS uuid AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_superadmin() RETURNS boolean AS $$
  SELECT role = 'SuperAdmin' FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;


DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'materials', 'recipes', 'invoices', 'suppliers', 'purchase_entries',
    'daily_inventories', 'stock_opnames', 'asset_items', 'production_batches',
    'audit_logs', 'transactions', 'expected_usage', 'pos_orders', 'pos_transactions',
    'pos_upload_logs', 'usage_variance', 'backups'
  ]) LOOP
    -- Aktifkan RLS di setiap tabel
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Hapus policy lama jika ada (idempotency)
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_%I" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "superadmin_bypass_%I" ON public.%I', t, t);

    -- Buat Policy Isolasi Multi-Tenant
    EXECUTE format(
      'CREATE POLICY "tenant_isolation_%I" ON public.%I FOR ALL USING (tenant_id = public.get_auth_tenant_id()) WITH CHECK (tenant_id = public.get_auth_tenant_id())',
      t, t
    );

    -- Buat Policy SuperAdmin Bypass
    EXECUTE format(
      'CREATE POLICY "superadmin_bypass_%I" ON public.%I FOR ALL USING (public.is_superadmin())',
      t, t
    );
  END LOOP;
END;
$$;


-- ------------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES - POLA B (Tabel Referensi Global)
-- ------------------------------------------------------------------------------
-- Tabel pos_templates tidak terikat ke tenant tertentu, semua bisa baca, superadmin bisa tulis
ALTER TABLE public.pos_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_all_pos_templates" ON public.pos_templates;
CREATE POLICY "read_all_pos_templates" ON public.pos_templates FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "superadmin_write_pos_templates" ON public.pos_templates;
CREATE POLICY "superadmin_write_pos_templates" ON public.pos_templates FOR ALL USING (public.is_superadmin());

-- ==============================================================================
-- MIGRATION END
-- ==============================================================================