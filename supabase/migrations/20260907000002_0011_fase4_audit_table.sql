-- Fase 4: Persiapan tabel sementara untuk dry-run audit backfill historis
-- Tabel ini digunakan untuk me-review perbedaan amount (akibat bug pack-size) 
-- sebelum data production diubah secara permanen.

CREATE TABLE IF NOT EXISTS public.transactions_recalc_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_id bigint NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  material_id bigint REFERENCES public.materials(id) ON DELETE SET NULL,
  date date NOT NULL,
  type character varying NOT NULL,
  amount_lama numeric NOT NULL,
  amount_baru numeric NOT NULL,
  selisih numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Index untuk mempermudah review
CREATE INDEX idx_recalc_audit_material ON public.transactions_recalc_audit(material_id);
CREATE INDEX idx_recalc_audit_date ON public.transactions_recalc_audit(date);
