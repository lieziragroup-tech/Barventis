-- UNIQUE constraints
ALTER TABLE invoices ADD CONSTRAINT uq_invoices_tenant_invoiceno UNIQUE (tenant_id, invoice_no);
ALTER TABLE suppliers ADD CONSTRAINT uq_suppliers_tenant_name UNIQUE (tenant_id, name);

-- FK RESTRICT
ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_material_id_fkey;
ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_material_id_fkey FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT;

ALTER TABLE purchase_entries DROP CONSTRAINT IF EXISTS purchase_entries_material_id_fkey;
ALTER TABLE purchase_entries ADD CONSTRAINT purchase_entries_material_id_fkey FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT;

ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_material_id_fkey;
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_material_id_fkey FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT;

ALTER TABLE stock_opname_items DROP CONSTRAINT IF EXISTS stock_opname_items_material_id_fkey;
ALTER TABLE stock_opname_items ADD CONSTRAINT stock_opname_items_material_id_fkey FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT;

ALTER TABLE physical_check_items DROP CONSTRAINT IF EXISTS physical_check_items_material_id_fkey;
ALTER TABLE physical_check_items ADD CONSTRAINT physical_check_items_material_id_fkey FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT;

-- FK SET NULL (users)
ALTER TABLE material_price_history DROP CONSTRAINT IF EXISTS material_price_history_changed_by_fkey;
ALTER TABLE material_price_history ADD CONSTRAINT material_price_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL;

-- FK CASCADE (child items)
ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_recipe_id_fkey;
ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE;

ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_invoice_id_fkey;
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;

ALTER TABLE daily_inventory_items DROP CONSTRAINT IF EXISTS daily_inventory_items_inventory_id_fkey;
ALTER TABLE daily_inventory_items ADD CONSTRAINT daily_inventory_items_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES daily_inventories(id) ON DELETE CASCADE;

ALTER TABLE stock_opname_items DROP CONSTRAINT IF EXISTS stock_opname_items_opname_id_fkey;
ALTER TABLE stock_opname_items ADD CONSTRAINT stock_opname_items_opname_id_fkey FOREIGN KEY (opname_id) REFERENCES stock_opnames(id) ON DELETE CASCADE;

ALTER TABLE physical_check_items DROP CONSTRAINT IF EXISTS physical_check_items_check_id_fkey;
ALTER TABLE physical_check_items ADD CONSTRAINT physical_check_items_check_id_fkey FOREIGN KEY (check_id) REFERENCES physical_checks(id) ON DELETE CASCADE;

ALTER TABLE pos_order_items DROP CONSTRAINT IF EXISTS pos_order_items_order_id_fkey;
ALTER TABLE pos_order_items ADD CONSTRAINT pos_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES pos_orders(id) ON DELETE CASCADE;

ALTER TABLE pos_transaction_items DROP CONSTRAINT IF EXISTS pos_transaction_items_transaction_id_fkey;
ALTER TABLE pos_transaction_items ADD CONSTRAINT pos_transaction_items_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES pos_transactions(id) ON DELETE CASCADE;
