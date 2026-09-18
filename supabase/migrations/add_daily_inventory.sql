-- Add hpp to items
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS hpp numeric DEFAULT 0;

-- Create daily_inventory table
CREATE TABLE IF NOT EXISTS public.daily_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  stok_awal int NOT NULL DEFAULT 0,
  qty_in int NOT NULL DEFAULT 0,
  qty_out int NOT NULL DEFAULT 0,
  waste int NOT NULL DEFAULT 0,
  broken int NOT NULL DEFAULT 0,
  full_qty int NOT NULL DEFAULT 0,
  stok_akhir int NOT NULL DEFAULT 0,
  qty_terpakai int NOT NULL DEFAULT 0,
  nilai_rupiah numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(date, item_id)
);
