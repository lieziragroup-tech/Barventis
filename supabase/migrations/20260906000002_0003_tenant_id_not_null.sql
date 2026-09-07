-- 1. Backfill tenant_id dari parent untuk tabel child yang tenant_id-nya masih bisa null
UPDATE recipe_ingredients ri SET tenant_id = r.tenant_id FROM recipes r WHERE ri.recipe_id = r.id AND ri.tenant_id IS NULL;
UPDATE invoice_items ii SET tenant_id = i.tenant_id FROM invoices i WHERE ii.invoice_id = i.id AND ii.tenant_id IS NULL;
UPDATE daily_inventory_items dii SET tenant_id = di.tenant_id FROM daily_inventories di WHERE dii.inventory_id = di.id AND dii.tenant_id IS NULL;
UPDATE physical_check_items pci SET tenant_id = pc.tenant_id FROM physical_checks pc WHERE pci.check_id = pc.id AND pci.tenant_id IS NULL;
UPDATE stock_opname_items soi SET tenant_id = so.tenant_id FROM stock_opnames so WHERE soi.opname_id = so.id AND soi.tenant_id IS NULL;
UPDATE pos_transaction_items pti SET tenant_id = pt.tenant_id FROM pos_transactions pt WHERE pti.transaction_id = pt.id AND pti.tenant_id IS NULL;
UPDATE pos_order_items poi SET tenant_id = po.tenant_id FROM pos_orders po WHERE poi.order_id = po.id AND poi.tenant_id IS NULL;

-- 2. Set NOT NULL
ALTER TABLE recipe_ingredients ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE invoice_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE daily_inventory_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE physical_check_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE stock_opname_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE pos_transaction_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE pos_order_items ALTER COLUMN tenant_id SET NOT NULL;

-- 3. Terapkan RLS Pola A karena sekarang tenant_id sudah NOT NULL
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON recipe_ingredients FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON recipe_ingredients FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON recipe_ingredients FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON recipe_ingredients FOR ALL USING ((SELECT role::text FROM users WHERE id = auth.uid()) = 'SuperAdmin');

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON invoice_items FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON invoice_items FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON invoice_items FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON invoice_items FOR ALL USING ((SELECT role::text FROM users WHERE id = auth.uid()) = 'SuperAdmin');

ALTER TABLE daily_inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON daily_inventory_items FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON daily_inventory_items FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON daily_inventory_items FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON daily_inventory_items FOR ALL USING ((SELECT role::text FROM users WHERE id = auth.uid()) = 'SuperAdmin');

ALTER TABLE physical_check_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON physical_check_items FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON physical_check_items FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON physical_check_items FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON physical_check_items FOR ALL USING ((SELECT role::text FROM users WHERE id = auth.uid()) = 'SuperAdmin');

ALTER TABLE stock_opname_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON stock_opname_items FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON stock_opname_items FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON stock_opname_items FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON stock_opname_items FOR ALL USING ((SELECT role::text FROM users WHERE id = auth.uid()) = 'SuperAdmin');

ALTER TABLE pos_transaction_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON pos_transaction_items FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON pos_transaction_items FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON pos_transaction_items FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON pos_transaction_items FOR ALL USING ((SELECT role::text FROM users WHERE id = auth.uid()) = 'SuperAdmin');

ALTER TABLE pos_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON pos_order_items FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON pos_order_items FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON pos_order_items FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON pos_order_items FOR ALL USING ((SELECT role::text FROM users WHERE id = auth.uid()) = 'SuperAdmin');
