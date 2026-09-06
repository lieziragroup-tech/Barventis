-- Fase 0.5 & 1.2: Audit Immutability + Trigger Server-side
-- Mencegah modifikasi data log dan memastikan setiap aksi tercatat di level database.

-- 1. Cabut updated_at (audit logs sifatnya append-only)
ALTER TABLE audit_logs DROP COLUMN IF EXISTS updated_at;

-- 2. Trigger menolak UPDATE/DELETE di tabel audit_logs
CREATE OR REPLACE FUNCTION fn_block_audit_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs bersifat immutable — UPDATE/DELETE tidak diizinkan';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_audit_update ON audit_logs;
CREATE TRIGGER trg_block_audit_update
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION fn_block_audit_mutation();

-- 3. Persiapan tabel untuk audit log otomatis dari trigger (Fase 1.2)
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS table_name character varying,
  ADD COLUMN IF NOT EXISTS record_id bigint,
  ADD COLUMN IF NOT EXISTS old_data jsonb,
  ADD COLUMN IF NOT EXISTS new_data jsonb;

-- 4. Fungsi trigger generic
CREATE OR REPLACE FUNCTION fn_audit_trigger() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (tenant_id, user_id, action, description, table_name, record_id, old_data, new_data, created_at)
  VALUES (
    COALESCE(NEW.tenant_id, OLD.tenant_id),
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME || ' ' || lower(TG_OP),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    to_jsonb(OLD),
    to_jsonb(NEW),
    now()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Attach ke tabel-tabel penting
CREATE TRIGGER trg_audit_materials AFTER INSERT OR UPDATE OR DELETE ON materials FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
CREATE TRIGGER trg_audit_recipes AFTER INSERT OR UPDATE OR DELETE ON recipes FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
CREATE TRIGGER trg_audit_invoices AFTER INSERT OR UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
CREATE TRIGGER trg_audit_purchase_entries AFTER INSERT OR UPDATE OR DELETE ON purchase_entries FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
CREATE TRIGGER trg_audit_stock_opnames AFTER INSERT OR UPDATE OR DELETE ON stock_opnames FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
CREATE TRIGGER trg_audit_stock_opname_items AFTER INSERT OR UPDATE OR DELETE ON stock_opname_items FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
CREATE TRIGGER trg_audit_daily_inventories AFTER INSERT OR UPDATE OR DELETE ON daily_inventories FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
