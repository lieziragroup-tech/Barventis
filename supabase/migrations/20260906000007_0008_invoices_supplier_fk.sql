-- Backfill invoices.supplier -> supplier_id if we want, but schema change says invoices.supplier was text.
-- Since this depends on parsing text, we do it safely:
ALTER TABLE invoices ADD COLUMN supplier_id bigint;

-- Try to match by name
UPDATE invoices i 
SET supplier_id = s.id 
FROM suppliers s 
WHERE i.supplier = s.name AND i.tenant_id = s.tenant_id;

-- Any that didn't match can remain null for now, or we'd need to create them. 
-- For now, add FK constraint without NOT NULL.
ALTER TABLE invoices ADD CONSTRAINT invoices_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT;

-- Optional: After migrating data completely, we could drop the 'supplier' text column.
