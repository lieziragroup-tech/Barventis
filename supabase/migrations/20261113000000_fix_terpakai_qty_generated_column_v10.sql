-- =============================================================================
-- BARVENTIS v10 — Fix `cannot insert a non-DEFAULT value into column "terpakai_qty"`
--
-- Root cause:
--   In instances where `public.daily_inventory_items.terpakai_qty` was created as a
--   `GENERATED ALWAYS AS (...) STORED` column, PostgreSQL rejects any explicit
--   INSERT or UPDATE into `terpakai_qty` inside `atomic_save_daily_inventory_v3`
--   and `atomic_save_daily_inventory_v4`.
--
-- Fix:
--   1. Drop the GENERATED ALWAYS expression on `terpakai_qty` (`DROP EXPRESSION IF EXISTS`)
--      so it becomes a regular numeric column with default 0.
--   2. Attach a lightweight BEFORE INSERT OR UPDATE trigger that automatically keeps
--      `terpakai_qty` synchronized with `COALESCE(NEW.out_qty, 0)` whenever `terpakai_qty`
--      is omitted or null.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'daily_inventory_items'
      AND column_name = 'terpakai_qty'
      AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE public.daily_inventory_items
      ALTER COLUMN terpakai_qty DROP EXPRESSION;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Skipped DROP EXPRESSION on daily_inventory_items.terpakai_qty: %', SQLERRM;
END $$;

ALTER TABLE public.daily_inventory_items
  ALTER COLUMN terpakai_qty SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sync_daily_inventory_terpakai_qty_v10()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.terpakai_qty IS NULL THEN
    NEW.terpakai_qty := COALESCE(NEW.out_qty, 0);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_daily_inventory_terpakai_qty_v10 ON public.daily_inventory_items;
CREATE TRIGGER trg_sync_daily_inventory_terpakai_qty_v10
  BEFORE INSERT OR UPDATE ON public.daily_inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_daily_inventory_terpakai_qty_v10();

COMMIT;
