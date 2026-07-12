-- Migration: 043_fix_auth_triggers_exception_safe
-- Description: Make auth user-creation triggers exception-safe.
--
-- Problem: In PostgreSQL 17 with Supabase, the handle_new_user() trigger
-- fires inside the GoTrue transaction that INSERTs into auth.users. If the
-- trigger raises ANY exception (e.g., permission denied on public.users due
-- to RLS/GRANT issues), the entire transaction is rolled back and GoTrue
-- returns "Database error saving new user".
--
-- Solution: Wrap trigger bodies in BEGIN...EXCEPTION blocks so they silently
-- swallow errors. The application server already has fallback logic to create
-- the user profile via the service_role client if the trigger didn't create it
-- (see packages/server/src/supabase/auth.ts registerUser() lines 220-253).
--
-- This also sets explicit search_path to prevent search_path injection and
-- ensures the functions are owned by postgres (superuser) for RLS bypass.

-- ============================================================================
-- 1. Recreate handle_new_user() with exception handling
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, username, display_name, roles)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        COALESCE(
            NEW.raw_user_meta_data->>'display_name',
            COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
        ),
        -- Always assign default role; promotion must happen through app_metadata
        ARRAY['viewer']::TEXT[]
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log but do not abort the auth.users insert.
    -- The application will create the profile via service_role fallback.
    RAISE WARNING 'handle_new_user trigger failed for user %: % %', NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure owned by postgres (superuser) for RLS bypass
ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

-- ============================================================================
-- 2. Recreate handle_new_user_namespace() with exception handling
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_namespace()
RETURNS TRIGGER AS $$
DECLARE
  ns_name TEXT;
BEGIN
  ns_name := derive_user_namespace(NEW.username);

  INSERT INTO public.namespaces (name, labels, annotations, created_by)
  VALUES (
    ns_name,
    jsonb_build_object('stark.io/user', NEW.username),
    jsonb_build_object('description', 'Personal namespace for ' || NEW.username),
    NEW.id
  )
  ON CONFLICT (name) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log but do not abort the users insert.
    RAISE WARNING 'handle_new_user_namespace trigger failed for user %: % %', NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure owned by postgres (superuser) for RLS bypass
ALTER FUNCTION public.handle_new_user_namespace() OWNER TO postgres;
