-- Invite-only signup enforcement (ARCHITECTURE.md §10.3), implemented as a
-- DB trigger so it holds even if a caller bypasses the app's API entirely.
-- On every new auth.users row: reject unless the email is in
-- invited_emails, then create the matching public.users profile row and
-- mark the invite redeemed. Runs as SECURITY DEFINER since the trigger
-- fires in the auth schema but needs to read/write public tables.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.invited_emails WHERE email = NEW.email
  ) THEN
    RAISE EXCEPTION 'signup not allowed: % is not on the invite list', NEW.email;
  END IF;

  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'display_name'
  );

  UPDATE public.invited_emails
  SET redeemed_at = now()
  WHERE email = NEW.email AND redeemed_at IS NULL;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
