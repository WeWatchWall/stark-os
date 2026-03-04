-- Migration: 037_user_username
-- Description: Add username column to users table and update namespace derivation
--              to use username instead of email for namespace resolution.
-- Stark Orchestrator

-- ============================================================================
-- 1. ADD USERNAME COLUMN TO USERS TABLE
-- ============================================================================

-- Add username column (temporarily nullable for existing rows)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS username TEXT;

-- Backfill username from email local part for existing users
UPDATE public.users
SET username = left(
  trim(BOTH '-' FROM
    regexp_replace(
      regexp_replace(
        lower(split_part(email, '@', 1)),
        '[^a-z0-9]', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  ), 63)
WHERE username IS NULL;

-- Handle edge case where sanitized username is empty
UPDATE public.users
SET username = 'user-' || left(id::text, 8)
WHERE username IS NULL OR username = '';

-- Make username NOT NULL and UNIQUE
ALTER TABLE public.users
ALTER COLUMN username SET NOT NULL;

ALTER TABLE public.users
ADD CONSTRAINT users_username_key UNIQUE (username);

-- Index for username lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);

COMMENT ON COLUMN public.users.username IS 'Unique username used for namespace resolution';

-- ============================================================================
-- 2. UPDATE handle_new_user() TRIGGER TO INCLUDE USERNAME
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, username, display_name, roles)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'display_name', COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))),
        COALESCE(
            (SELECT ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'roles'))),
            ARRAY['viewer']::TEXT[]
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. UPDATE derive_user_namespace() TO USE USERNAME
-- ============================================================================

-- Function: derive a namespace name from a username.
-- Lowercases, replaces non-alphanum with hyphens, collapses consecutive
-- hyphens, strips leading/trailing hyphens, and truncates to 63 characters.
CREATE OR REPLACE FUNCTION derive_user_namespace(uname TEXT)
RETURNS TEXT AS $$
DECLARE
  ns TEXT;
BEGIN
  ns := lower(uname);
  ns := regexp_replace(ns, '[^a-z0-9]', '-', 'g');
  ns := regexp_replace(ns, '-+', '-', 'g');
  ns := trim(BOTH '-' FROM ns);
  IF length(ns) = 0 THEN
    ns := 'user';
  END IF;
  RETURN left(ns, 63);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 4. UPDATE handle_new_user_namespace() TO USE USERNAME
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
