-- ============================================================================
-- Barventis v5.2 GO-LIVE LOCKDOWN SCRIPT
-- Jalankan skrip ini di Supabase SQL Editor HANYA SETELAH masa uji coba selesai
-- dan seluruh karyawan sudah berpindah ke akun asli (VITE_ENABLE_TRIAL_SHORTCUT=false).
-- ============================================================================

BEGIN;

-- 1. Revoke public/anon execution on all beta & trial helper RPCs
REVOKE EXECUTE ON FUNCTION public.seed_beta_testing_dummy_data_v13() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prepare_beta_signup_v13(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bind_beta_user_profile_v13(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prepare_trial_signup_v19(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bind_trial_user_profile_v19(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

-- 2. Drop trial/beta helper functions permanently for production
DROP FUNCTION IF EXISTS public.seed_beta_testing_dummy_data_v13();
DROP FUNCTION IF EXISTS public.prepare_beta_signup_v13(text);
DROP FUNCTION IF EXISTS public.bind_beta_user_profile_v13(uuid, text);
DROP FUNCTION IF EXISTS public.prepare_trial_signup_v19(text);
DROP FUNCTION IF EXISTS public.bind_trial_user_profile_v19(uuid, text, text, text);

COMMIT;
