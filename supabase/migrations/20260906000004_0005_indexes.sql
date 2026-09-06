-- Index tenant_id (filter RLS)
CREATE INDEX idx_materials_tenant ON materials(tenant_id);
CREATE INDEX idx_recipes_tenant ON recipes(tenant_id);
CREATE INDEX idx_suppliers_tenant ON suppliers(tenant_id);
CREATE INDEX idx_purchase_entries_tenant ON purchase_entries(tenant_id);
CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_daily_inventories_tenant ON daily_inventories(tenant_id);
CREATE INDEX idx_stock_opnames_tenant ON stock_opnames(tenant_id);
CREATE INDEX idx_asset_items_tenant ON asset_items(tenant_id);
CREATE INDEX idx_production_batches_tenant ON production_batches(tenant_id);
CREATE INDEX idx_transactions_tenant ON transactions(tenant_id);
CREATE INDEX idx_expected_usage_tenant ON expected_usage(tenant_id);
CREATE INDEX idx_unit_conversions_tenant ON unit_conversions(tenant_id);
CREATE INDEX idx_physical_checks_tenant ON physical_checks(tenant_id);
CREATE INDEX idx_pos_upload_logs_tenant ON pos_upload_logs(tenant_id);
CREATE INDEX idx_pos_orders_tenant ON pos_orders(tenant_id);
CREATE INDEX idx_pos_transactions_tenant ON pos_transactions(tenant_id);
CREATE INDEX idx_pos_daily_aggregates_tenant ON pos_daily_aggregates(tenant_id);
CREATE INDEX idx_usage_variance_tenant ON usage_variance(tenant_id);
CREATE INDEX idx_generated_so_reports_tenant ON generated_so_reports(tenant_id);
CREATE INDEX idx_backups_tenant ON backups(tenant_id);
CREATE INDEX idx_invitations_tenant ON invitations(tenant_id);
CREATE INDEX idx_tenant_reset_requests_tenant ON tenant_reset_requests(tenant_id);
CREATE INDEX idx_recipe_ingredients_tenant ON recipe_ingredients(tenant_id);
CREATE INDEX idx_invoice_items_tenant ON invoice_items(tenant_id);
CREATE INDEX idx_daily_inventory_items_tenant ON daily_inventory_items(tenant_id);
CREATE INDEX idx_physical_check_items_tenant ON physical_check_items(tenant_id);
CREATE INDEX idx_stock_opname_items_tenant ON stock_opname_items(tenant_id);
CREATE INDEX idx_pos_transaction_items_tenant ON pos_transaction_items(tenant_id);

-- Index FK
CREATE INDEX idx_purchase_entries_material ON purchase_entries(material_id);
CREATE INDEX idx_purchase_entries_supplier ON purchase_entries(supplier_id);
CREATE INDEX idx_purchase_entries_invoice ON purchase_entries(invoice_id);
CREATE INDEX idx_recipe_ingredients_material ON recipe_ingredients(material_id);
CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_material ON invoice_items(material_id);
CREATE INDEX idx_stock_opname_items_opname ON stock_opname_items(opname_id);
CREATE INDEX idx_stock_opname_items_material ON stock_opname_items(material_id);
CREATE INDEX idx_daily_inventory_items_inventory ON daily_inventory_items(inventory_id);
CREATE INDEX idx_pos_order_items_order ON pos_order_items(order_id);
CREATE INDEX idx_pos_order_items_recipe ON pos_order_items(recipe_id);
CREATE INDEX idx_pos_transaction_items_transaction ON pos_transaction_items(transaction_id);
CREATE INDEX idx_usage_variance_material ON usage_variance(material_id);
CREATE INDEX idx_material_price_history_material ON material_price_history(material_id);

-- Composite
CREATE INDEX idx_usage_variance_period ON usage_variance(tenant_id, period_year, period_month);
CREATE INDEX idx_stock_opnames_period ON stock_opnames(tenant_id, period_year, period_month);
CREATE INDEX idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_purchase_entries_date ON purchase_entries(tenant_id, date DESC);
CREATE INDEX idx_pos_daily_aggregates_date ON pos_daily_aggregates(tenant_id, sales_date DESC);
