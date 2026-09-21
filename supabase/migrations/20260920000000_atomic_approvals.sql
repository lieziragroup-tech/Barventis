-- Migration for Atomic Approvals (Fixes ISS-01, ISS-02, ISS-03)
-- Prevents Double-Approval and Stale Stock (TOCTOU) issues using Row-Level Locks and Atomic RPCs.

BEGIN;

-- 1. Atomic Approval for Inter-Branch Transfers
CREATE OR REPLACE FUNCTION public.approve_inter_branch_transfer(
    p_transfer_id uuid,
    p_receiver_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_transfer record;
BEGIN
    -- Lock the row to prevent TOCTOU and concurrent race conditions (ISS-02)
    SELECT * INTO v_transfer 
    FROM public.inter_branch_transfers 
    WHERE id = p_transfer_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transfer not found';
    END IF;

    -- Prevent double-approval (ISS-03)
    IF v_transfer.status != 'DISPATCHED' THEN
        RAISE EXCEPTION 'Transfer is not in DISPATCHED state (Current state: %)', v_transfer.status;
    END IF;

    -- Execute Atomic Update for status
    UPDATE public.inter_branch_transfers
    SET status = 'RECEIVED',
        received_at = now(),
        receiver_id = p_receiver_id
    WHERE id = p_transfer_id AND status = 'DISPATCHED';

    RETURN jsonb_build_object('success', true, 'message', 'Transfer approved atomically');
END;
$$;

-- 2. Atomic Approval for Stock Opnames
CREATE OR REPLACE FUNCTION public.approve_stock_opname(
    p_opname_id bigint,
    p_approved_by uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_opname record;
BEGIN
    -- Lock the row to prevent TOCTOU
    SELECT * INTO v_opname 
    FROM public.stock_opnames 
    WHERE id = p_opname_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock opname not found';
    END IF;

    -- Prevent double-approval (ISS-03)
    IF v_opname.status != 'SUBMITTED' THEN
        RAISE EXCEPTION 'Opname is not in SUBMITTED state (Current state: %)', v_opname.status;
    END IF;

    -- Atomic Update
    UPDATE public.stock_opnames
    SET status = 'APPROVED',
        approved_at = now(),
        approved_by = p_approved_by
    WHERE id = p_opname_id AND status = 'SUBMITTED';

    RETURN jsonb_build_object('success', true, 'message', 'Opname approved atomically');
END;
$$;

COMMIT;
