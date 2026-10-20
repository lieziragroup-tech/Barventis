-- ==============================================================================
-- Add shelf_life_days column to materials table
-- ==============================================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'materials' AND column_name = 'shelf_life_days'
  ) THEN
    ALTER TABLE public.materials ADD COLUMN shelf_life_days integer DEFAULT NULL;
  END IF;
END $$;
