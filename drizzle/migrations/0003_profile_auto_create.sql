-- Real user profiles: add a city field, and auto-create a profiles row for
-- every new signup (email, phone OTP or Google — all of them create a row in
-- auth.users, so a trigger there covers every signup path at once instead of
-- trying to insert client-side after each different auth flow).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city text;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), new.phone),
    new.phone
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: give a profile row to accounts created before this trigger existed.
INSERT INTO public.profiles (id, full_name, phone)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), u.phone),
  u.phone
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
