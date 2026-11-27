-- supabase/migrations/01_atomic_transactions.sql

CREATE OR REPLACE FUNCTION process_inventory_mutation(
  p_item_id UUID,
  p_quantity INT,
  p_type TEXT,
  p_notes TEXT,
  p_pencatat_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_stock INT;
  v_new_stock INT;
  v_log_id UUID;
  v_company_id UUID;
BEGIN
  -- Validate inputs
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;

  IF p_type NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION 'Type must be IN or OUT';
  END IF;

  -- Lock the item row for update to prevent race conditions
  SELECT stok, company_id INTO v_current_stock, v_company_id
  FROM inventory_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found';
  END IF;

  -- Calculate new stock
  IF p_type = 'IN' THEN
    v_new_stock := v_current_stock + p_quantity;
  ELSE
    v_new_stock := v_current_stock - p_quantity;
    IF v_new_stock < 0 THEN
      RAISE EXCEPTION 'Insufficient stock';
    END IF;
  END IF;
  -- Update item stock
  UPDATE inventory_items
  SET stok = v_new_stock,
      updated_at = NOW()
  WHERE id = p_item_id;

  -- Insert inventory log
  IF p_type = 'IN' THEN
    INSERT INTO inventory_logs (
      item_id,
      company_id,
      tanggal,
      qty_masuk,
      qty_keluar,
      sisa_stok,
      keterangan,
      created_at
    ) VALUES (
      p_item_id,
      v_company_id,
      CURRENT_DATE,
      p_quantity,
      0,
      v_new_stock,
      p_notes,
      NOW()
    ) RETURNING id INTO v_log_id;
  ELSE
    INSERT INTO inventory_logs (
      item_id,
      company_id,
      tanggal,
      qty_masuk,
      qty_keluar,
      sisa_stok,
      keterangan,
      created_at
    ) VALUES (
      p_item_id,
      v_company_id,
      CURRENT_DATE,
      0,
      p_quantity,
      v_new_stock,
      p_notes,
      NOW()
    ) RETURNING id INTO v_log_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'log_id', v_log_id,
    'new_stock', v_new_stock
  );
END;
$$;

-- Status Approval RPC
CREATE OR REPLACE FUNCTION process_status_approval(
  p_report_id UUID,
  p_status TEXT,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Lock the row
  PERFORM id
  FROM work_reports
  WHERE id = p_report_id
  FOR UPDATE;

  UPDATE work_reports
  SET status = p_status::varchar,
      review_notes = p_notes,
      updated_at = NOW()
  WHERE id = p_report_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
