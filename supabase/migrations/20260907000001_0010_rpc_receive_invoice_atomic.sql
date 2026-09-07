-- Migration: Sinkronisasi receive_invoice_atomic untuk menulis ke purchase_entries (Fase 3)
-- Menjadikan transactions sebagai single source of truth, dan purchase_entries sebagai detail

CREATE OR REPLACE FUNCTION public.receive_invoice_atomic(
  p_invoice_id bigint,
  p_tenant_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice record;
  v_item record;
  v_supplier_id bigint;
BEGIN
  -- Get invoice info
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice tidak ditemukan';
  END IF;

  IF v_invoice.status = 'RECEIVED' THEN
    RAISE EXCEPTION 'Invoice sudah diterima';
  END IF;

  -- Try to get supplier_id by name (supplier is character varying in invoices)
  SELECT id INTO v_supplier_id
  FROM suppliers
  WHERE name = v_invoice.supplier AND tenant_id = p_tenant_id
  LIMIT 1;

  -- Update invoice status
  UPDATE invoices
  SET status = 'RECEIVED',
      received_date = CURRENT_DATE,
      updated_at = now()
  WHERE id = p_invoice_id;

  -- Process each item
  FOR v_item IN (SELECT * FROM invoice_items WHERE invoice_id = p_invoice_id)
  LOOP
    -- 1. Insert to transactions (single source of truth for stock movement)
    INSERT INTO transactions (
      tenant_id, date, material_id, type, location, qty, amount, notes, created_by
    ) VALUES (
      p_tenant_id,
      CURRENT_DATE,
      v_item.material_id,
      'PURCHASE_IN',
      v_invoice.location,
      v_item.qty,
      v_item.qty * v_item.unit_price,
      'PO Receipt: ' || v_invoice.invoice_no,
      p_user_id
    );

    -- 2. Insert to purchase_entries (for Purchasing module, metadata link)
    -- BUG-FIX: Fase 3, Sinkronisasi supaya PO masuk laporan pembelian harian
    INSERT INTO purchase_entries (
      tenant_id, material_id, supplier_id, qty, unit, unit_price, date, input_by, invoice_id
    ) VALUES (
      p_tenant_id,
      v_item.material_id,
      v_supplier_id,
      v_item.qty,
      COALESCE((SELECT unit FROM materials WHERE id = v_item.material_id), '-'),
      v_item.unit_price,
      CURRENT_DATE,
      p_user_id,
      p_invoice_id
    );

    -- 3. Update material stock based on location
    IF v_invoice.location = 'CENTRAL' THEN
      UPDATE materials
      SET qty_central = qty_central + v_item.qty,
          updated_at = now()
      WHERE id = v_item.material_id;
    ELSE
      UPDATE materials
      SET qty_resto = qty_resto + v_item.qty,
          updated_at = now()
      WHERE id = v_item.material_id;
    END IF;
  END LOOP;
END;
$$;
