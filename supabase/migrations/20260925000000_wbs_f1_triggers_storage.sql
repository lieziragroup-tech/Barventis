-- WBS FITUR 1: Pemulihan Basis Data & Storage Lifecycle

-- 1.1.3 View Kompatibilitas Penamaan Skema PostgREST
CREATE OR REPLACE VIEW public.daily_inventory AS
SELECT * FROM public.daily_stock_counts;

-- 1.2.1 Trigger Perhitungan Biaya Satuan Dasar Bahan (materials)
-- WBS asks for trg_calc_material_cost, but v_materials_costing view already handles it dynamically.
-- Adding a stub for materials if needed, but skipping modifying v_materials_costing.
-- Adding supplier_id to materials if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'materials' AND column_name = 'supplier_id') THEN
        ALTER TABLE public.materials ADD COLUMN supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 1.2.2 Trigger Perhitungan Stok Akhir & Pemakaian Harian (daily_inventories -> daily_stock_counts)
ALTER TABLE public.daily_stock_counts DROP COLUMN closing_stock;
ALTER TABLE public.daily_stock_counts DROP COLUMN usage_qty;
ALTER TABLE public.daily_stock_counts ADD COLUMN closing_stock NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.daily_stock_counts ADD COLUMN usage_qty NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.trg_calc_daily_inventory()
RETURNS TRIGGER AS $$
BEGIN
    NEW.closing_stock := COALESCE(NEW.full_units, 0) + COALESCE(NEW.broken_fraction, 0);
    NEW.usage_qty := COALESCE(NEW.opening_stock, 0) + COALESCE(NEW.in_qty, 0) - NEW.closing_stock - COALESCE(NEW.waste_qty, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_daily_stock_counts_calc
    BEFORE INSERT OR UPDATE ON public.daily_stock_counts
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_calc_daily_inventory();

-- 1.2.3 Trigger Variansi Mutasi Antar-Cabang (inter_branch_transfer_items)
ALTER TABLE public.inter_branch_transfer_items DROP COLUMN variance;
ALTER TABLE public.inter_branch_transfer_items ADD COLUMN variance NUMERIC(12,2);

CREATE OR REPLACE FUNCTION public.trg_calc_transfer_variance()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.qty_received IS NULL THEN
        NEW.variance := NULL;
    ELSE
        NEW.variance := NEW.qty_received - NEW.qty_dispatched;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inter_branch_transfer_items_calc
    BEFORE INSERT OR UPDATE ON public.inter_branch_transfer_items
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_calc_transfer_variance();

-- Trigger for stock_adjustments variance (from upgrade_modules.sql)
ALTER TABLE public.stock_adjustments DROP COLUMN variance_qty;
ALTER TABLE public.stock_adjustments ADD COLUMN variance_qty NUMERIC(12,3);

CREATE OR REPLACE FUNCTION public.trg_calc_stock_adjustment_variance()
RETURNS TRIGGER AS $$
BEGIN
    NEW.variance_qty := COALESCE(NEW.physical_qty, 0) - COALESCE(NEW.system_qty, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_adjustments_calc
    BEFORE INSERT OR UPDATE ON public.stock_adjustments
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_calc_stock_adjustment_variance();

-- 1.3 Kebijakan Retensi Media 90 Hari (Storage Auto-Purge Policy)
-- Create buckets if they don't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('receipt-photos', 'receipt-photos', false, 1048576, '{image/webp,image/jpeg,image/png}'),
  ('trimming-photos', 'trimming-photos', false, 1048576, '{image/webp,image/jpeg,image/png}')
ON CONFLICT (id) DO UPDATE SET 
  file_size_limit = 1048576, 
  allowed_mime_types = '{image/webp,image/jpeg,image/png}';

-- Setup policies for authenticated users
CREATE POLICY "Allow authenticated users to insert to receipt-photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'receipt-photos');
CREATE POLICY "Allow authenticated users to select from receipt-photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'receipt-photos');
CREATE POLICY "Allow authenticated users to insert to trimming-photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'trimming-photos');
CREATE POLICY "Allow authenticated users to select from trimming-photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'trimming-photos');

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- 1.3.3.2 Penjadwalan eksekusi harian otomatis menggunakan ekstensi pg_cron
DO $$`nBEGIN
    -- Only create if pg_cron extension exists
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule('purge_old_media_daily', '0 2 * * *', 'SELECT net.http_post(url:=''https://[PROJECT_REF].supabase.co/functions/v1/purge-old-media'', headers:=''{\"Authorization\": \"Bearer [ANON_KEY]\"}''::jsonb);');
    END IF;
END $$;
