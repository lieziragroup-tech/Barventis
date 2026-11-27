-- =====================================================================================
-- BARVENTIS v17 PURCHASING WORKFLOW, SUPPLIER COMPARISON & DUAL-PHOTO GOODS RECEIPT:
-- 1. Extended PO Workflow & Supplier Replacement Audit Columns on `public.invoices`
-- 2. Dual-Photo Goods Receipt (`receipt_photo_url` + `delivery_note_photo_url` + `delivery_note_no`)
-- 3. Multi-Supplier Price & Quality Comparison Table (`public.supplier_price_offers`)
-- =====================================================================================

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'REQUESTED';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS division text DEFAULT 'BAR';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS original_supplier text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS supplier_change_note text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS requested_by_role text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS requested_by_name text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS approved_by_name text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS delivery_note_photo_url text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS delivery_note_no text;

CREATE TABLE IF NOT EXISTS public.supplier_price_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid,
  material_id bigint,
  material_name text NOT NULL,
  supplier_name text NOT NULL,
  price numeric(15,2) NOT NULL DEFAULT 0,
  unit text DEFAULT 'pck',
  quality_grade text DEFAULT 'Standar',
  lead_time text DEFAULT 'H+1',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
