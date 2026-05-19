-- Auto-create public.profiles when a new auth.users row is inserted (sign-up).
-- Runs as SECURITY DEFINER so it works even when the browser has no session yet
-- (e.g. email confirmation off/on, or client upsert blocked by RLS timing).
-- Run once per Supabase project (staging + prod). Safe to re-run.
--
-- IMPORTANT (Supabase SQL Editor):
-- Bottom-right "Role" must be **postgres** — NOT "authenticated" as your email.
-- Otherwise you get: permission denied for schema public (42501).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  display_name text;
  user_email text;
BEGIN
  user_email := lower(coalesce(trim(new.email), ''));
  display_name := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
  IF display_name IS NULL OR display_name = '' THEN
    display_name := coalesce(nullif(split_part(user_email, '@', 1), ''), 'User');
  END IF;

  INSERT INTO public.profiles (id, name, email, role, status)
  VALUES (
    new.id,
    display_name,
    user_email,
    'client'::public.user_role,
    'active'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = CASE
      WHEN EXCLUDED.name IS NOT NULL AND EXCLUDED.name <> '' THEN EXCLUDED.name
      ELSE public.profiles.name
    END;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
