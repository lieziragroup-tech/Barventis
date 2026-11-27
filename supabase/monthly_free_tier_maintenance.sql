-- ============================================================================
-- PT GUCI EMAS PRATAMA — MAINTENANCE & RESET BULANAN SUPABASE FREE TIER (500 MB)
-- Jalankan 1x sebulan di Supabase SQL Editor (atau panggil via RPC dari Admin)
-- agar database tetap lega (< 100 MB) tanpa menghapus riwayat laporan & GPS validasi!
-- ============================================================================

-- 1. Fungsi Cek Penggunaan Ruang Tabel PostgreSQL (Real-Time Monitor Kuota 500 MB)
CREATE OR REPLACE FUNCTION public.get_supabase_storage_usage()
RETURNS TABLE (
  table_name text,
  row_count bigint,
  total_size_mb numeric
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    relname::text AS table_name,
    n_live_tup::bigint AS row_count,
    ROUND(pg_total_relation_size(relid)::numeric / (1024 * 1024), 2) AS total_size_mb
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(relid) DESC;
$$;

-- 2. Fungsi Pembersihan Bulanan Aman (Hemat Storage Tanpa Hilang Riwayat Laporan)
--    - Mengosongkan base64 foto mentah pada baris yang sudah di-purge atau lebih tua dari p_keep_photo_days (default 35 hari)
--    - Memangkas riwayat titik GPS lama (user_locations > p_keep_gps_days) sambil menyisakan titik terakhir tiap teknisi
--    - Memangkas audit_logs > p_keep_audit_days (default 60 hari)
CREATE OR REPLACE FUNCTION public.run_monthly_free_tier_cleanup(
  p_keep_photo_days int DEFAULT 35,
  p_keep_gps_days int DEFAULT 30,
  p_keep_audit_days int DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_photos_cleaned int := 0;
  v_gps_deleted int := 0;
  v_audit_deleted int := 0;
BEGIN
  -- A. Bersihkan payload base64 foto lama/sudah diarsipkan (metadata GPS & Haversine tetap utuh)
  UPDATE public.documentation_photos
  SET
    storage_path = '',
    purged_at = COALESCE(purged_at, NOW())
  WHERE (
      purged_at IS NOT NULL
      OR captured_at < NOW() - make_interval(days => p_keep_photo_days)
    )
    AND storage_path IS NOT NULL
    AND length(storage_path) > 100;
  GET DIAGNOSTICS v_photos_cleaned = ROW_COUNT;

  -- B. Hapus log GPS perjalanan lama (> 30 hari), kecuali 1 lokasi terbaru per user
  DELETE FROM public.user_locations ul
  WHERE ul.tracked_at < NOW() - make_interval(days => p_keep_gps_days)
    AND ul.id NOT IN (
      SELECT DISTINCT ON (user_id) id
      FROM public.user_locations
      ORDER BY user_id, tracked_at DESC
    );
  GET DIAGNOSTICS v_gps_deleted = ROW_COUNT;

  -- C. Hapus log audit lama (> 60 hari)
  DELETE FROM public.audit_logs
  WHERE created_at < NOW() - make_interval(days => p_keep_audit_days);
  GET DIAGNOSTICS v_audit_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'cleaned_at', NOW(),
    'photos_offloaded', v_photos_cleaned,
    'gps_rows_pruned', v_gps_deleted,
    'audit_rows_pruned', v_audit_deleted
  );
END;
$$;

-- Contoh pemakaian langsung di Supabase SQL Editor saat reset bulanan:
-- SELECT * FROM public.get_supabase_storage_usage();
-- SELECT public.run_monthly_free_tier_cleanup(35, 30, 60);
