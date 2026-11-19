-- ============================================================================
-- BARVENTIS v4.0 (PATCH v18.2) — HARDENING RLS, UNIQUE BA, & VIEW MENU ENGINEERING
-- ============================================================================
-- Ringkas (~105 baris), 100% Idempotent, aman dijalankan di Supabase SQL Editor.
-- Memperbaiki:
--   - DEF-02: Mencegah duplikasi dokumen pada berita_acara_documents saat upsert
--   - DEF-03: Menyamakan RLS 3 tabel baru dengan pola strict_branch_* live DB
--   - DEF-05: Menyediakan view public.v_menu_engineering agar Menu Engineering bebas 404
-- ============================================================================

-- 1. DEF-02: Bersihkan duplikasi Berita Acara (jika ada) & pasang Unique Index per periode
DO $$
BEGIN
  IF to_regclass('public.berita_acara_documents') IS NOT NULL THEN
    DELETE FROM public.berita_acara_documents a
    USING public.berita_acara_documents b
    WHERE a.id < b.id
      AND a.tenant_id = b.tenant_id
      AND COALESCE(a.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(b.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND a.period_month = b.period_month;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_berita_acara_tenant_branch_period
      ON public.berita_acara_documents (
        tenant_id,
        COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
        period_month
      );
  END IF;
END $$;

-- 2. DEF-03: Upgrade RLS 3 tabel baru (berita_acara_documents, cost_control_adjustments, zero_waste_splits)
--    agar mengikuti standar strict_branch_* (tenant + branch isolation + WITH CHECK)
DO $$
DECLARE
  v_tbl TEXT;
  v_has_bv2 BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'bv2_auth_tenant_id'
  ) INTO v_has_bv2;

  FOREACH v_tbl IN ARRAY ARRAY['berita_acara_documents', 'cost_control_adjustments', 'zero_waste_splits']
  LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tbl);

      -- Hapus policy lama yang belum memiliki isolasi cabang
      EXECUTE format('DROP POLICY IF EXISTS "ba_docs_tenant_isolation" ON public.%I', v_tbl);
      EXECUTE format('DROP POLICY IF EXISTS "cc_adj_tenant_isolation" ON public.%I', v_tbl);
      EXECUTE format('DROP POLICY IF EXISTS "zw_splits_tenant_isolation" ON public.%I', v_tbl);
      EXECUTE format('DROP POLICY IF EXISTS "strict_branch_select" ON public.%I', v_tbl);
      EXECUTE format('DROP POLICY IF EXISTS "strict_branch_insert" ON public.%I', v_tbl);
      EXECUTE format('DROP POLICY IF EXISTS "strict_branch_update" ON public.%I', v_tbl);
      EXECUTE format('DROP POLICY IF EXISTS "strict_branch_delete" ON public.%I', v_tbl);

      IF v_has_bv2 THEN
        EXECUTE format($p$
          CREATE POLICY "strict_branch_select" ON public.%I
            FOR SELECT TO authenticated
            USING (((tenant_id = (SELECT bv2_auth_tenant_id())) AND ((SELECT bv2_is_admin()) OR (branch_id IS NULL) OR (branch_id = (SELECT bv2_auth_branch_id())))) OR (SELECT bv2_is_superadmin()));
        $p$, v_tbl);

        EXECUTE format($p$
          CREATE POLICY "strict_branch_insert" ON public.%I
            FOR INSERT TO authenticated
            WITH CHECK (((tenant_id = (SELECT bv2_auth_tenant_id())) AND ((SELECT bv2_is_admin()) OR (branch_id IS NULL) OR (branch_id = (SELECT bv2_auth_branch_id())))) OR (SELECT bv2_is_superadmin()));
        $p$, v_tbl);

        EXECUTE format($p$
          CREATE POLICY "strict_branch_update" ON public.%I
            FOR UPDATE TO authenticated
            USING (((tenant_id = (SELECT bv2_auth_tenant_id())) AND ((SELECT bv2_is_admin()) OR (branch_id IS NULL) OR (branch_id = (SELECT bv2_auth_branch_id())))) OR (SELECT bv2_is_superadmin()))
            WITH CHECK (((tenant_id = (SELECT bv2_auth_tenant_id())) AND ((SELECT bv2_is_admin()) OR (branch_id IS NULL) OR (branch_id = (SELECT bv2_auth_branch_id())))) OR (SELECT bv2_is_superadmin()));
        $p$, v_tbl);

        EXECUTE format($p$
          CREATE POLICY "strict_branch_delete" ON public.%I
            FOR DELETE TO authenticated
            USING (((tenant_id = (SELECT bv2_auth_tenant_id())) AND ((SELECT bv2_is_admin()) OR (branch_id IS NULL) OR (branch_id = (SELECT bv2_auth_branch_id())))) OR (SELECT bv2_is_superadmin()));
        $p$, v_tbl);
      END IF;
    END IF;
  END LOOP;
END $$;

-- 3. DEF-05: Buat View public.v_menu_engineering agar halaman Menu Engineering bebas error 404/42P01
CREATE OR REPLACE VIEW public.v_menu_engineering AS
SELECT
  r.id,
  r.tenant_id,
  r.branch_id,
  r.menu_name,
  r.pos_code,
  r.category,
  r.division,
  COALESCE(r.selling_price, 0) AS selling_price,
  COALESCE(r.basic_cost, 0) AS basic_cost,
  COALESCE(r.food_cost_pct, 0) AS food_cost_pct,
  COALESCE(r.total_sold, 0) AS total_sold,
  COALESCE(r.contribution_margin, GREATEST(0, COALESCE(r.selling_price, 0) - COALESCE(r.basic_cost, 0))) AS contribution_margin,
  COALESCE(r.menu_class,
    CASE
      WHEN COALESCE(r.total_sold, 0) >= 30 AND COALESCE(r.food_cost_pct, 100) <= 27 THEN 'STAR'
      WHEN COALESCE(r.total_sold, 0) >= 30 AND COALESCE(r.food_cost_pct, 100) > 27 THEN 'PLOWHORSE'
      WHEN COALESCE(r.total_sold, 0) < 30 AND COALESCE(r.food_cost_pct, 100) <= 27 THEN 'PUZZLE'
      ELSE 'DOG'
    END
  ) AS menu_class
FROM public.recipes r;
