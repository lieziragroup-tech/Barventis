-- Pola A - Tabel langsung punya tenant_id NOT NULL
-- (sebagian tabel)
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON materials FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON materials FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON materials FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON materials FOR ALL USING ((SELECT role FROM users WHERE id = auth.uid()) = 'SuperAdmin');

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON recipes FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON recipes FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON recipes FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON recipes FOR ALL USING ((SELECT role FROM users WHERE id = auth.uid()) = 'SuperAdmin');

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON invoices FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON invoices FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON invoices FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON invoices FOR ALL USING ((SELECT role FROM users WHERE id = auth.uid()) = 'SuperAdmin');

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON suppliers FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON suppliers FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON suppliers FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON suppliers FOR ALL USING ((SELECT role FROM users WHERE id = auth.uid()) = 'SuperAdmin');

ALTER TABLE purchase_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON purchase_entries FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON purchase_entries FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON purchase_entries FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON purchase_entries FOR ALL USING ((SELECT role FROM users WHERE id = auth.uid()) = 'SuperAdmin');

ALTER TABLE daily_inventories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON daily_inventories FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON daily_inventories FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON daily_inventories FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON daily_inventories FOR ALL USING ((SELECT role FROM users WHERE id = auth.uid()) = 'SuperAdmin');

ALTER TABLE stock_opnames ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON stock_opnames FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON stock_opnames FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON stock_opnames FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON stock_opnames FOR ALL USING ((SELECT role FROM users WHERE id = auth.uid()) = 'SuperAdmin');

ALTER TABLE asset_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON asset_items FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON asset_items FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON asset_items FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON asset_items FOR ALL USING ((SELECT role FROM users WHERE id = auth.uid()) = 'SuperAdmin');

ALTER TABLE production_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON production_batches FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON production_batches FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON production_batches FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON production_batches FOR ALL USING ((SELECT role FROM users WHERE id = auth.uid()) = 'SuperAdmin');

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON audit_logs FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON audit_logs FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON audit_logs FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON audit_logs FOR ALL USING ((SELECT role FROM users WHERE id = auth.uid()) = 'SuperAdmin');

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON transactions FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON transactions FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON transactions FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON transactions FOR ALL USING ((SELECT role FROM users WHERE id = auth.uid()) = 'SuperAdmin');

ALTER TABLE tenant_reset_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON tenant_reset_requests FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert" ON tenant_reset_requests FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update" ON tenant_reset_requests FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "superadmin_full_access" ON tenant_reset_requests FOR ALL USING ((SELECT role FROM users WHERE id = auth.uid()) = 'SuperAdmin');


-- Pola C - Tabel yang tidak scoped ke tenant
ALTER TABLE pos_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all_authenticated" ON pos_templates FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "superadmin_write" ON pos_templates FOR ALL USING ((SELECT role FROM users WHERE id = auth.uid()) = 'SuperAdmin');

ALTER TABLE seed_data_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all_authenticated" ON seed_data_files FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "superadmin_write" ON seed_data_files FOR ALL USING ((SELECT role FROM users WHERE id = auth.uid()) = 'SuperAdmin');
