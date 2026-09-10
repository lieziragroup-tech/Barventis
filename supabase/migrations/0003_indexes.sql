-- ==============================================================================
-- MIGRATION: 0003_indexes.sql
-- DESCRIPTION: Pembuatan indeks untuk relasi Foreign Key guna mencegah
-- Sequential Scans pada pemfilteran RLS dan operasi JOIN.
-- ==============================================================================

-- 1. INDEXES UNTUK KOLOM TENANT_ID (Sangat kritis untuk RLS filter)
CREATE INDEX IF NOT EXISTS idx_materials_tenant ON public.materials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recipes_tenant ON public.recipes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON public.suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_entries_tenant ON public.purchase_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON public.invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_daily_inventories_tenant ON public.daily_inventories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_opnames_tenant ON public.stock_opnames(tenant_id);
CREATE INDEX IF NOT EXISTS idx_asset_items_tenant ON public.asset_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_production_batches_tenant ON public.production_batches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON public.transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expected_usage_tenant ON public.expected_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_unit_conversions_tenant ON public.unit_conversions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_physical_checks_tenant ON public.physical_checks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_upload_logs_tenant ON public.pos_upload_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_orders_tenant ON public.pos_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_tenant ON public.pos_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_daily_aggregates_tenant ON public.pos_daily_aggregates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_variance_tenant ON public.usage_variance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_generated_so_reports_tenant ON public.generated_so_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_backups_tenant ON public.backups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invitations_tenant ON public.invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_reset_requests_tenant ON public.tenant_reset_requests(tenant_id);

-- Indeks Tenant ID untuk Tabel Item (Child Tables)
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_tenant ON public.recipe_ingredients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_tenant ON public.invoice_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_daily_inventory_items_tenant ON public.daily_inventory_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_physical_check_items_tenant ON public.physical_check_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_opname_items_tenant ON public.stock_opname_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_transaction_items_tenant ON public.pos_transaction_items(tenant_id);

-- 2. INDEXES UNTUK RELASI JOIN NON-TENANT (Foreign Keys ke tabel induk)
CREATE INDEX IF NOT EXISTS idx_purchase_entries_material ON public.purchase_entries(material_id);
CREATE INDEX IF NOT EXISTS idx_purchase_entries_supplier ON public.purchase_entries(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_entries_invoice ON public.purchase_entries(invoice_id);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_material ON public.recipe_ingredients(material_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON public.recipe_ingredients(recipe_id);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_material ON public.invoice_items(material_id);

CREATE INDEX IF NOT EXISTS idx_stock_opname_items_opname ON public.stock_opname_items(opname_id);
CREATE INDEX IF NOT EXISTS idx_stock_opname_items_material ON public.stock_opname_items(material_id);

CREATE INDEX IF NOT EXISTS idx_daily_inventory_items_inventory ON public.daily_inventory_items(inventory_id);

CREATE INDEX IF NOT EXISTS idx_pos_order_items_order ON public.pos_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_pos_order_items_recipe ON public.pos_order_items(recipe_id);

CREATE INDEX IF NOT EXISTS idx_pos_transaction_items_transaction ON public.pos_transaction_items(transaction_id);

CREATE INDEX IF NOT EXISTS idx_usage_variance_material ON public.usage_variance(material_id);
CREATE INDEX IF NOT EXISTS idx_material_price_history_material ON public.material_price_history(material_id);

-- 3. COMPOSITE INDEXES UNTUK POLA QUERY LAPORAN BERAT (Filter Periode/Tanggal)
CREATE INDEX IF NOT EXISTS idx_usage_variance_period ON public.usage_variance(tenant_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_stock_opnames_period ON public.stock_opnames(tenant_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON public.audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_entries_date ON public.purchase_entries(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_pos_daily_aggregates_date ON public.pos_daily_aggregates(tenant_id, sales_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_date ON public.transactions(tenant_id, date DESC);

-- ==============================================================================
-- MIGRATION END
-- ==============================================================================