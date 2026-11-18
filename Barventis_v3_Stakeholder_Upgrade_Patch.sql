-- ============================================================================
-- BARVENTIS v3.0 (PATCH v18) — DELTA SQL UPGRADE HASIL RAPAT STAKEHOLDER UMATIS
-- ============================================================================
-- Catatan Penting:
-- File ini HANYA berisi penambahan kolom, tabel baru, fungsi RPC baru, dan
-- seed contoh Berita Acara (sesuai 2 foto fisik Oktober 2026).
-- Aman dijalankan berulang kali (100% Idempotent) di Supabase SQL Editor.
-- ============================================================================

-- 1. PENAMBAHAN NILAI ENUM ROLE (HEAD BAR & REKAN BAR) SECARA AMAN
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    BEGIN
      ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Head Bar';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Rekan Bar';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- 2. ALTER TABLE: DUKUNGAN HIERARKI BAR, PEMBAYARAN TEMPO/PETTY CASH, & HARGA BON PO
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS sub_role VARCHAR(40) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nip VARCHAR(50) DEFAULT '-';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS headbar_approved_by VARCHAR(120) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS headbar_approved_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) DEFAULT 'TEMPO', -- 'CASH', 'PETTY_CASH', 'TEMPO'
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'UNPAID', -- 'UNPAID' (Belum Dibayar), 'PAID' (Sudah Dibayar)
  ADD COLUMN IF NOT EXISTS due_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_proof_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS actual_receipt_total NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS price_adjusted_on_receipt BOOLEAN DEFAULT FALSE;

ALTER TABLE public.purchase_entries
  ADD COLUMN IF NOT EXISTS payment_source VARCHAR(30) DEFAULT 'REGULAR_PO', -- 'REGULAR_PO', 'PETTY_CASH_RESTO', 'CASH_URGENT'
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'PAID',       -- 'UNPAID', 'PAID'
  ADD COLUMN IF NOT EXISTS due_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_proof_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS historical_cost_locked BOOLEAN DEFAULT TRUE;

-- 3. ALTER TABLE: DUKUNGAN BERITA ACARA WASTE & GELAS PECAH PADA WASTE_LOGS
ALTER TABLE public.waste_logs
  ADD COLUMN IF NOT EXISTS ba_category VARCHAR(30) DEFAULT 'CONSUMABLE_WASTE', -- 'CONSUMABLE_WASTE' | 'GLASS_BREAKAGE'
  ADD COLUMN IF NOT EXISTS staff_responsible_name VARCHAR(120) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pack_size_label VARCHAR(60) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expiry_or_status_label VARCHAR(60) DEFAULT 'Waste',
  ADD COLUMN IF NOT EXISTS unit_price_snapshot NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_price_snapshot NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disposition_instruction TEXT DEFAULT 'Memberikan Izin untuk membuang produk yang waste ini',
  ADD COLUMN IF NOT EXISTS ba_document_id UUID DEFAULT NULL;

-- 4. ALTER TABLE: DUKUNGAN BARCODE LOT CENTRAL & TRANSFER RP 0 KE BAR/RESTO
ALTER TABLE public.stock_lots
  ADD COLUMN IF NOT EXISTS barcode_code VARCHAR(80) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_lots_barcode_code ON public.stock_lots(barcode_code);

-- 5. TABEL BARU: DOKUMEN BERITA ACARA BULANAN (WASTE & GELAS PECAH)
CREATE TABLE IF NOT EXISTS public.berita_acara_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  period_month VARCHAR(7) NOT NULL, -- Contoh: '2026-10'
  document_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ba_type VARCHAR(30) NOT NULL DEFAULT 'COMBINED', -- 'WASTE', 'BREAKAGE', 'COMBINED'
  location_division VARCHAR(80) NOT NULL DEFAULT 'Resto - Central',
  submitter_name VARCHAR(120) NOT NULL DEFAULT 'Irpan',
  submitter_nip VARCHAR(50) NOT NULL DEFAULT '-',
  submitter_title VARCHAR(80) NOT NULL DEFAULT 'Head Barista',
  intro_statement TEXT NOT NULL DEFAULT 'Dengan ini menyerahkan minuman/bahan yang sudah melewati masa Expired/Rusak Yaitu :',
  approver_name VARCHAR(120) NOT NULL DEFAULT 'Bpk. Gandhi',
  approver_title VARCHAR(80) NOT NULL DEFAULT 'Owner Umatis',
  disposition_statement TEXT NOT NULL DEFAULT 'Memberikan Izin untuk membuang produk yang waste ini',
  closing_statement TEXT NOT NULL DEFAULT 'Demikian Berita Acara ini dibuat menurut keadaan yang sebenarnya untuk dipergunakan sebagaimana mestinya.',
  sign_city VARCHAR(80) NOT NULL DEFAULT 'Tangerang',
  waste_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  breakage_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_waste_amount NUMERIC NOT NULL DEFAULT 0,
  total_breakage_amount NUMERIC NOT NULL DEFAULT 0,
  disposal_photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'APPROVED', -- 'DRAFT', 'SUBMITTED', 'APPROVED'
  created_by UUID DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ba_docs_tenant_period ON public.berita_acara_documents(tenant_id, period_month);

ALTER TABLE public.berita_acara_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ba_docs_tenant_isolation" ON public.berita_acara_documents;
CREATE POLICY "ba_docs_tenant_isolation" ON public.berita_acara_documents
  FOR ALL USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

-- 6. TABEL BARU: PENYESUAIAN COST CONTROL (BUFFET, EVENT, COMPLIMENT RP 0)
CREATE TABLE IF NOT EXISTS public.cost_control_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  period_month VARCHAR(7) NOT NULL, -- Contoh: '2026-08'
  adjustment_type VARCHAR(30) NOT NULL, -- 'BUFFET', 'EVENT', 'COMPLIMENT', 'OTHER'
  title VARCHAR(160) NOT NULL,
  event_date DATE DEFAULT CURRENT_DATE,
  pax_or_qty NUMERIC NOT NULL DEFAULT 1,
  estimated_cost NUMERIC NOT NULL DEFAULT 0,
  notes TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cc_adj_tenant_period ON public.cost_control_adjustments(tenant_id, period_month);

ALTER TABLE public.cost_control_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cc_adj_tenant_isolation" ON public.cost_control_adjustments;
CREATE POLICY "cc_adj_tenant_isolation" ON public.cost_control_adjustments
  FOR ALL USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

-- 7. TABEL BARU: RIWAYAT SPLIT BAHAN ZERO-WASTE (KASUS KELAPA URGENT -> AIR + DAGING)
CREATE TABLE IF NOT EXISTS public.zero_waste_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  split_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source_material_id BIGINT NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  source_material_name VARCHAR(160) NOT NULL,
  source_qty NUMERIC NOT NULL,
  source_unit VARCHAR(30) NOT NULL,
  outputs JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ material_id, name, qty, unit, cost_allocated }]
  waste_qty NUMERIC NOT NULL DEFAULT 0,       -- Selalu 0 untuk Zero-Waste Split
  notes TEXT DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.zero_waste_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zw_splits_tenant_isolation" ON public.zero_waste_splits;
CREATE POLICY "zw_splits_tenant_isolation" ON public.zero_waste_splits
  FOR ALL USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

-- 8. RPC: ATOMIC ZERO-WASTE MATERIAL SPLIT (1 BAHAN INDUK -> 2+ BAHAN TURUNAN TANPA WASTE)
CREATE OR REPLACE FUNCTION public.atomic_split_material_zero_waste_v18(
  p_tenant_id UUID,
  p_branch_id UUID,
  p_source_material_id BIGINT,
  p_source_qty NUMERIC,
  p_outputs JSONB,
  p_notes TEXT DEFAULT 'Split Bahan Zero-Waste (Cutting Portion 0%)',
  p_actor_name TEXT DEFAULT 'Barista'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_src RECORD;
  v_out JSONB;
  v_target_id BIGINT;
  v_target_qty NUMERIC;
  v_split_id UUID;
BEGIN
  SELECT * INTO v_src
  FROM public.materials
  WHERE id = p_source_material_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bahan induk tidak ditemukan.';
  END IF;

  IF COALESCE(v_src.qty_resto, 0) < p_source_qty THEN
    RAISE EXCEPTION 'Stok Resto % tidak mencukupi (Tersedia: %, Diminta: %).', v_src.name, COALESCE(v_src.qty_resto, 0), p_source_qty;
  END IF;

  -- Kurangi stok bahan induk di Resto
  UPDATE public.materials
  SET qty_resto = GREATEST(0, COALESCE(qty_resto, 0) - p_source_qty),
      updated_at = NOW()
  WHERE id = p_source_material_id AND tenant_id = p_tenant_id;

  -- Tambahkan stok ke masing-masing bahan turunan (misal Air Kelapa & Daging Kelapa) tanpa mencatat Waste
  FOR v_out IN SELECT * FROM jsonb_array_elements(p_outputs)
  LOOP
    v_target_id := (v_out->>'material_id')::BIGINT;
    v_target_qty := COALESCE((v_out->>'qty')::NUMERIC, 0);

    IF v_target_id IS NOT NULL AND v_target_qty > 0 THEN
      UPDATE public.materials
      SET qty_resto = COALESCE(qty_resto, 0) + v_target_qty,
          is_prep_output = TRUE,
          updated_at = NOW()
      WHERE id = v_target_id AND tenant_id = p_tenant_id;
    END IF;
  END LOOP;

  INSERT INTO public.zero_waste_splits (
    tenant_id, branch_id, split_date, source_material_id, source_material_name,
    source_qty, source_unit, outputs, waste_qty, notes, created_by
  ) VALUES (
    p_tenant_id, p_branch_id, CURRENT_DATE, p_source_material_id, v_src.name,
    p_source_qty, COALESCE(v_src.unit, 'pck'), p_outputs, 0, p_notes, p_actor_name
  ) RETURNING id INTO v_split_id;

  RETURN jsonb_build_object(
    'success', true,
    'split_id', v_split_id,
    'source_material', v_src.name,
    'source_deducted', p_source_qty,
    'waste_recorded', 0
  );
END;
$$;

-- 9. SEED CONTOH BERITA ACARA OKTOBER 2026 SESUAI 2 FOTO FISIK UMATIS
DO $$
DECLARE
  v_tenant_id UUID;
  v_branch_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants ORDER BY created_at ASC LIMIT 1;
  IF v_tenant_id IS NOT NULL THEN
    SELECT id INTO v_branch_id FROM public.branches WHERE tenant_id = v_tenant_id ORDER BY created_at ASC LIMIT 1;

    IF NOT EXISTS (
      SELECT 1 FROM public.berita_acara_documents
      WHERE tenant_id = v_tenant_id AND period_month = '2026-10'
    ) THEN
      INSERT INTO public.berita_acara_documents (
        tenant_id, branch_id, period_month, document_date, ba_type, location_division,
        submitter_name, submitter_nip, submitter_title,
        intro_statement, approver_name, approver_title,
        disposition_statement, closing_statement, sign_city,
        waste_items, breakage_items, total_waste_amount, total_breakage_amount, status
      ) VALUES (
        v_tenant_id,
        v_branch_id,
        '2026-10',
        '2026-10-22',
        'COMBINED',
        'Resto - Central',
        'Irpan',
        '-',
        'Head Barista',
        'Dengan ini menyerahkan minuman beer yang sudah melewati masa Expired/Rusak Yaitu :',
        'Bpk. Gandhi',
        'Owner Umatis',
        'Memberikan Izin untuk membuang produk yang waste ini',
        'Demikian Berita Acara ini dibuat menurut keadaan yang sebenarnya untuk di pergunakan sebagaimana mestinya.',
        'Tangerang',
        jsonb_build_array(
          jsonb_build_object(
            'no', 1,
            'nama_barang', 'Juice Sirsak',
            'kemasan', '1440 grm',
            'jumlah', '1 box',
            'masa_expired', 'Waste',
            'harga', 105000,
            'total_harga', 105000
          )
        ),
        jsonb_build_array(
          jsonb_build_object('no', 1, 'nama_karyawan', 'ayat', 'nama_barang', 'Gelas teh', 'tanggal', '2026-10-03', 'jumlah', 1, 'harga', 23000, 'total_harga', 23000),
          jsonb_build_object('no', 2, 'nama_karyawan', 'Putri', 'nama_barang', 'Gelas teh', 'tanggal', '2026-10-06', 'jumlah', 1, 'harga', 23000, 'total_harga', 23000),
          jsonb_build_object('no', 3, 'nama_karyawan', 'Ali partime', 'nama_barang', 'Gelas teh', 'tanggal', '2026-10-10', 'jumlah', 2, 'harga', 23000, 'total_harga', 46000),
          jsonb_build_object('no', 4, 'nama_karyawan', 'costumer', 'nama_barang', 'Gelas teh', 'tanggal', '2026-10-10', 'jumlah', 1, 'harga', 23000, 'total_harga', 23000),
          jsonb_build_object('no', 5, 'nama_karyawan', 'Tukang kolam ikan', 'nama_barang', 'Gelas teh', 'tanggal', '2026-10-12', 'jumlah', 1, 'harga', 23000, 'total_harga', 23000),
          jsonb_build_object('no', 6, 'nama_karyawan', 'costumer', 'nama_barang', 'Gelas teh mocel', 'tanggal', '2026-10-15', 'jumlah', 1, 'harga', 23000, 'total_harga', 23000),
          jsonb_build_object('no', 7, 'nama_karyawan', 'fajar', 'nama_barang', 'Gelas latte ice', 'tanggal', '2026-10-18', 'jumlah', 1, 'harga', 28000, 'total_harga', 28000),
          jsonb_build_object('no', 8, 'nama_karyawan', 'Efan partime', 'nama_barang', 'Gelas teh', 'tanggal', '2026-10-23', 'jumlah', 1, 'harga', 23000, 'total_harga', 23000)
        ),
        105000,
        212000,
        'APPROVED'
      );
    END IF;
  END IF;
END $$;
