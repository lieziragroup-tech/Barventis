-- ====================================================================================================
-- MIGRASI 06: PERBAIKAN REGISTRASI UNDANGAN (AUTO-CONFIRM EMAIL), LOGIN 400, & AUTO-REPAIR AKUN NYANGKUT
-- Jalankan script ini di Supabase SQL Editor untuk menuntaskan masalah:
-- 1. Error 400 (grant_type=password / Email not confirmed) saat daftar & login via link undangan
-- 2. Akun auth.users yang sudah terbuat sebagian namun belum masuk ke public.users
-- ====================================================================================================

BEGIN;

-- 1. Trigger otomatis pada auth.users:
--    Jika user mendaftar (INSERT ke auth.users) dengan metadata invite_token yang valid di public.invites,
--    atau jika email-nya diundang, langsung konfirmasi email_confirmed_at = now() agar tidak terkena blokir OTP/Confirm Email.
CREATE OR REPLACE FUNCTION public.fn_auto_confirm_invited_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_token text;
  v_inv public.invites;
BEGIN
  v_token := btrim(coalesce(new.raw_user_meta_data ->> 'invite_token', ''));

  IF v_token <> '' THEN
    SELECT * INTO v_inv
    FROM public.invites
    WHERE id = v_token
      AND coalesce((payload ->> 'used')::boolean, false) = false
    LIMIT 1;

    IF FOUND THEN
      new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
      new.confirmed_at := coalesce(new.confirmed_at, now());
    END IF;
  END IF;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Jangan pernah menggagalkan INSERT auth.users jika terjadi perbedaan kolom internal Supabase
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_confirm_invited_auth_user ON auth.users;
CREATE TRIGGER trg_auto_confirm_invited_auth_user
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_confirm_invited_auth_user();


-- 2. Fungsi RPC SECURITY DEFINER: public.complete_invite_registration
--    Dapat dipanggil langsung dari client (anon / authenticated) segera setelah supabase.auth.signUp()
--    untuk mengonfirmasi email di auth.users, membuat profil di public.users, dan menandai invite used = true.
CREATE OR REPLACE FUNCTION public.complete_invite_registration(
  p_token text,
  p_email text,
  p_name text,
  p_nip text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_inv public.invites;
  v_uid uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_role text;
  v_used_by text;
BEGIN
  IF coalesce(btrim(p_token), '') = '' THEN
    RAISE EXCEPTION 'Token undangan wajib diisi.';
  END IF;
  IF v_email = '' THEN
    RAISE EXCEPTION 'Email wajib diisi.';
  END IF;
  IF v_name = '' THEN
    v_name := split_part(v_email, '@', 1);
  END IF;

  -- Cari user di auth.users berdasarkan email (atau auth.uid() jika sudah memiliki sesi)
  SELECT id INTO v_uid
  FROM auth.users
  WHERE lower(email) = v_email
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_uid IS NULL AND auth.uid() IS NOT NULL THEN
    v_uid := auth.uid();
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Akun autentikasi untuk email % belum ditemukan. Silakan ulangi pendaftaran.', v_email;
  END IF;

  -- Kunci baris invite
  SELECT * INTO v_inv
  FROM public.invites
  WHERE id = btrim(p_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token undangan tidak ditemukan.';
  END IF;

  v_used_by := coalesce(v_inv.payload ->> 'usedBy', '');
  IF coalesce((v_inv.payload ->> 'used')::boolean, false) AND v_used_by <> '' AND v_used_by <> v_uid::text THEN
    RAISE EXCEPTION 'Token undangan ini sudah pernah digunakan oleh pengguna lain.';
  END IF;

  IF (v_inv.payload ->> 'expiresAt') IS NOT NULL
     AND (v_inv.payload ->> 'expiresAt')::timestamptz <= now()
     AND NOT coalesce((v_inv.payload ->> 'used')::boolean, false) THEN
    RAISE EXCEPTION 'Token undangan ini sudah kedaluwarsa.';
  END IF;

  v_role := coalesce(nullif(btrim(v_inv.payload ->> 'role'), ''), 'TEKNISI_LAPANGAN');
  IF v_role NOT IN ('SUPERADMIN', 'ADMIN', 'MARKETING', 'INVENTORY', 'TEKNISI_LAPANGAN') THEN
    v_role := 'TEKNISI_LAPANGAN';
  END IF;

  -- Auto-confirm email di auth.users agar signInWithPassword tidak ditolak dengan HTTP 400
  UPDATE auth.users
  SET email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'full_name', v_name,
        'company_id', v_inv.company_id::text,
        'role', v_role,
        'invite_token', btrim(p_token)
      ),
      updated_at = now()
  WHERE id = v_uid;

  -- Upsert ke public.users
  INSERT INTO public.users (
    id, company_id, name, email, nip, password_hash, role, phone, is_active, created_at, updated_at
  )
  VALUES (
    v_uid,
    v_inv.company_id,
    v_name,
    v_email,
    nullif(btrim(coalesce(p_nip, '')), ''),
    'managed-by-supabase-auth',
    v_role::public.user_role,
    nullif(btrim(coalesce(p_phone, '')), ''),
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    name       = EXCLUDED.name,
    email      = EXCLUDED.email,
    nip        = coalesce(EXCLUDED.nip, public.users.nip),
    role       = EXCLUDED.role,
    phone      = coalesce(EXCLUDED.phone, public.users.phone),
    is_active  = true,
    updated_at = now();

  -- Tandai token undangan sebagai used = true
  UPDATE public.invites
  SET payload = v_inv.payload || jsonb_build_object(
    'used', true,
    'usedBy', v_uid::text,
    'usedByEmail', v_email,
    'usedByName', v_name,
    'usedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
  WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'ok', true,
    'userId', v_uid,
    'companyId', v_inv.company_id,
    'role', v_role,
    'email', v_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_invite_registration(text, text, text, text, text) TO anon, authenticated;


-- 3. Fungsi RPC SECURITY DEFINER: public.repair_pending_invite_user
--    Memperbaiki akun yang sempat "nyangkut" (sudah masuk auth.users saat pendaftaran sebelumnya,
--    namun email_confirmed_at masih NULL atau belum memiliki profil di public.users).
CREATE OR REPLACE FUNCTION public.repair_pending_invite_user(
  p_email text,
  p_token text DEFAULT NULL,
  p_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_auth record;
  v_existing_user public.users;
  v_inv public.invites;
  v_token text := nullif(btrim(coalesce(p_token, '')), '');
  v_name text;
  v_role text;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'empty_email');
  END IF;

  SELECT id, email, email_confirmed_at, raw_user_meta_data
  INTO v_auth
  FROM auth.users
  WHERE lower(email) = v_email
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_auth.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_user_not_found');
  END IF;

  -- Pastikan email_confirmed_at terisi
  IF v_auth.email_confirmed_at IS NULL THEN
    UPDATE auth.users
    SET email_confirmed_at = now(),
        updated_at = now()
    WHERE id = v_auth.id;
  END IF;

  -- Cek apakah sudah ada di public.users
  SELECT * INTO v_existing_user FROM public.users WHERE id = v_auth.id;
  IF FOUND AND v_existing_user.company_id IS NOT NULL THEN
    IF NOT v_existing_user.is_active THEN
      UPDATE public.users SET is_active = true, updated_at = now() WHERE id = v_auth.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'repaired', true,
      'userId', v_auth.id,
      'companyId', v_existing_user.company_id,
      'role', v_existing_user.role::text
    );
  END IF;

  -- Jika belum ada di public.users, cari token invite dari parameter, metadata, atau invite aktif terbaru
  IF v_token IS NULL THEN
    v_token := nullif(btrim(coalesce(v_auth.raw_user_meta_data ->> 'invite_token', '')), '');
  END IF;

  IF v_token IS NOT NULL THEN
    SELECT * INTO v_inv FROM public.invites WHERE id = v_token FOR UPDATE;
  END IF;

  IF v_inv.id IS NULL THEN
    SELECT * INTO v_inv
    FROM public.invites
    WHERE coalesce((payload ->> 'used')::boolean, false) = false
      AND ((payload ->> 'expiresAt') IS NULL OR (payload ->> 'expiresAt')::timestamptz > now())
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_matching_invite');
  END IF;

  v_name := coalesce(
    nullif(btrim(coalesce(p_name, '')), ''),
    nullif(btrim(coalesce(v_auth.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(btrim(coalesce(v_auth.raw_user_meta_data ->> 'name', '')), ''),
    split_part(v_email, '@', 1)
  );

  v_role := coalesce(nullif(btrim(v_inv.payload ->> 'role'), ''), 'TEKNISI_LAPANGAN');
  IF v_role NOT IN ('SUPERADMIN', 'ADMIN', 'MARKETING', 'INVENTORY', 'TEKNISI_LAPANGAN') THEN
    v_role := 'TEKNISI_LAPANGAN';
  END IF;

  INSERT INTO public.users (
    id, company_id, name, email, password_hash, role, is_active, created_at, updated_at
  )
  VALUES (
    v_auth.id,
    v_inv.company_id,
    v_name,
    v_email,
    'managed-by-supabase-auth',
    v_role::public.user_role,
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    name       = EXCLUDED.name,
    email      = EXCLUDED.email,
    role       = EXCLUDED.role,
    is_active  = true,
    updated_at = now();

  UPDATE public.invites
  SET payload = v_inv.payload || jsonb_build_object(
    'used', true,
    'usedBy', v_auth.id::text,
    'usedByEmail', v_email,
    'usedByName', v_name
  )
  WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'ok', true,
    'repaired', true,
    'userId', v_auth.id,
    'companyId', v_inv.company_id,
    'role', v_role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.repair_pending_invite_user(text, text, text) TO anon, authenticated;


-- 4. Perbaikan langsung (One-Time Auto-Heal) untuk seluruh akun di auth.users yang belum terkonfirmasi
--    atau belum masuk ke public.users akibat kendala pendaftaran sebelumnya:
DO $$
DECLARE
  r record;
  v_res jsonb;
BEGIN
  -- Konfirmasi seluruh akun di auth.users yang masih belum terkonfirmasi
  UPDATE auth.users
  SET email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  WHERE email_confirmed_at IS NULL;

  -- Hubungkan akun auth.users yang belum memiliki baris di public.users dengan invite aktif jika ada
  FOR r IN
    SELECT au.id, au.email
    FROM auth.users au
    LEFT JOIN public.users pu ON pu.id = au.id
    WHERE pu.id IS NULL AND au.email IS NOT NULL
    ORDER BY au.created_at DESC
  LOOP
    BEGIN
      v_res := public.repair_pending_invite_user(r.email, NULL, NULL);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END;
$$;

COMMIT;
