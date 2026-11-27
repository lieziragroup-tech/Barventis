-- ============================================================================
-- Barventis v4.3 — Separate Real Trial Accounts RPC (Internal Resto Umatis)
-- ============================================================================
-- Membuat 7 akun trial inti benar-benar terpisah di Supabase Auth & public.users
-- (Unique Email, Unique UUID, Real Role, Real sub_role, Real branch_id & RLS):
--   1. OWNER_UMATIS      -> owner.umatis@umatis.id       (Role: Owner, Multi-Cabang)
--   2. CENTRAL_UMATIS    -> central.umatis@umatis.id     (Role: Central, Gudang Pusat)
--   3. PURCHASING_UMATIS -> purchasing.umatis@umatis.id  (Role: Purchasing, Pengadaan & PO)
--   4. HEAD_BAR_BSD      -> headbar.bsd@umatis.id        (Role: Bar, sub_role: HEAD_BAR, BSD)
--   5. BAR_BSD           -> bar.bsd@umatis.id            (Role: Bar, sub_role: REKAN_BAR, BSD)
--   6. HEAD_BAR_KASUNA   -> headbar.kasuna@umatis.id     (Role: Bar, sub_role: HEAD_BAR, KASUNA)
--   7. BAR_KASUNA        -> bar.kasuna@umatis.id         (Role: Bar, sub_role: REKAN_BAR, KASUNA)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prepare_trial_signup_v19(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clean_email text := lower(trim(coalesce(p_email, '')));
BEGIN
  -- Safety guard: hanya mengizinkan reset akun internal trial @umatis.id
  IF v_clean_email = '' OR right(v_clean_email, 10) <> '@umatis.id' THEN
    RAISE EXCEPTION 'Email bukan akun trial internal @umatis.id';
  END IF;

  DELETE FROM public.users WHERE lower(email) = v_clean_email;
  DELETE FROM auth.identities WHERE lower(coalesce(identity_data->>'email', '')) = v_clean_email;
  DELETE FROM auth.users WHERE lower(email) = v_clean_email;
END;
$$;

CREATE OR REPLACE FUNCTION public.bind_trial_user_profile_v19(
  p_user_id uuid,
  p_preset_key text,
  p_email text,
  p_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tenant_id uuid;
  v_branch_id uuid;
  v_role public.user_role := 'Bar'::public.user_role;
  v_sub_role varchar := 'REKAN_BAR';
  v_branch_code text := 'BSD';
  v_clean_email text := lower(trim(coalesce(p_email, '')));
BEGIN
  -- 1. Temukan tenant aktif Resto Umatis (fallback tenant pertama)
  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE lower(coalesce(company_name, '')) LIKE '%umatis%'
     OR lower(coalesce(name, '')) LIKE '%umatis%'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id FROM public.tenants ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant belum tersedia di tabel public.tenants';
  END IF;

  -- 2. Mapping preset key ke role, sub_role, dan cabang asli
  CASE upper(trim(coalesce(p_preset_key, '')))
    WHEN 'OWNER_UMATIS' THEN
      v_role := 'Owner'::public.user_role;
      v_sub_role := 'OWNER';
      v_branch_code := 'BSD';
    WHEN 'CENTRAL_UMATIS' THEN
      v_role := 'Central'::public.user_role;
      v_sub_role := 'CENTRAL';
      v_branch_code := 'CENTRAL';
    WHEN 'PURCHASING_UMATIS' THEN
      v_role := 'Purchasing'::public.user_role;
      v_sub_role := 'PURCHASING';
      v_branch_code := 'BSD';
    WHEN 'HEAD_BAR_BSD' THEN
      v_role := 'Bar'::public.user_role;
      v_sub_role := 'HEAD_BAR';
      v_branch_code := 'BSD';
    WHEN 'BAR_BSD' THEN
      v_role := 'Bar'::public.user_role;
      v_sub_role := 'REKAN_BAR';
      v_branch_code := 'BSD';
    WHEN 'HEAD_BAR_KASUNA' THEN
      v_role := 'Bar'::public.user_role;
      v_sub_role := 'HEAD_BAR';
      v_branch_code := 'KASUNA';
    WHEN 'BAR_KASUNA' THEN
      v_role := 'Bar'::public.user_role;
      v_sub_role := 'REKAN_BAR';
      v_branch_code := 'KASUNA';
    ELSE
      v_role := 'Bar'::public.user_role;
      v_sub_role := 'REKAN_BAR';
      v_branch_code := 'BSD';
  END CASE;

  -- 3. Resolve branch_id sesuai cabang (Central / Kasuna / BSD)
  IF v_branch_code = 'CENTRAL' THEN
    SELECT id INTO v_branch_id
    FROM public.branches
    WHERE tenant_id = v_tenant_id AND (is_central = true OR upper(coalesce(code, '')) = 'CENTRAL')
    ORDER BY is_central DESC, created_at ASC
    LIMIT 1;
  ELSE
    SELECT id INTO v_branch_id
    FROM public.branches
    WHERE tenant_id = v_tenant_id
      AND (upper(coalesce(code, '')) = v_branch_code OR lower(name) LIKE '%' || lower(v_branch_code) || '%')
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_branch_id IS NULL THEN
    SELECT id INTO v_branch_id
    FROM public.branches
    WHERE tenant_id = v_tenant_id
    ORDER BY is_central DESC, created_at ASC
    LIMIT 1;
  END IF;

  -- 4. Pastikan email terkonfirmasi di auth.users agar langsung bisa login tanpa verifikasi email
  UPDATE auth.users
  SET email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  WHERE id = p_user_id;

  -- 5. Bersihkan duplikat email lama (jika ada id berbeda) & upsert profil asli di public.users
  DELETE FROM public.users
  WHERE lower(email) = v_clean_email AND id <> p_user_id;

  INSERT INTO public.users (id, tenant_id, name, email, role, branch_id, sub_role, created_at, updated_at)
  VALUES (
    p_user_id,
    v_tenant_id,
    coalesce(nullif(trim(p_name), ''), v_clean_email),
    v_clean_email,
    v_role,
    v_branch_id,
    v_sub_role,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    branch_id = EXCLUDED.branch_id,
    sub_role = EXCLUDED.sub_role,
    updated_at = now();

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'tenant_id', v_tenant_id,
    'branch_id', v_branch_id,
    'role', v_role::text,
    'sub_role', v_sub_role,
    'email', v_clean_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.prepare_trial_signup_v19(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_trial_user_profile_v19(uuid, text, text, text) TO anon, authenticated;
