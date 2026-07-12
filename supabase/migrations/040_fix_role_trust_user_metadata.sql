-- Migration: 040_fix_role_trust_user_metadata
-- Description: Fix privilege-escalation vulnerability where roles were sourced
--   from user_metadata (which the end user can freely write via updateUser()).
--   Roles are now sourced from app_metadata which only service_role can set.
--
-- Changes:
--   1. get_user_roles() reads from JWT app_metadata instead of user_metadata.
--   2. handle_new_user() no longer copies roles from raw_user_meta_data; new
--      users always start as 'viewer'. Admins must promote via app_metadata.
--   3. "Users can update own data" policy gets a WITH CHECK that prevents
--      non-admins from changing their own roles column.
-- Stark Orchestrator

-- ============================================================================
-- 1. Fix get_user_roles() to source from app_metadata (server-controlled)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_roles()
RETURNS TEXT[] AS $$
BEGIN
    -- Extract roles from the JWT app_metadata (only settable by service_role).
    -- This prevents users from self-promoting by editing their own user_metadata.
    RETURN COALESCE(
        (SELECT ARRAY(
            SELECT jsonb_array_elements_text(
                (auth.jwt() -> 'app_metadata' -> 'roles')
            )
        )),
        ARRAY['viewer']::TEXT[]
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- 2. Fix handle_new_user() - never trust user-supplied roles
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
        -- set by service_role (e.g. admin dashboard or provisioning script).
        ARRAY['viewer']::TEXT[]
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. Restrict self-updates: users cannot change their own roles
-- ============================================================================

-- Drop and recreate the "Users can update own data" policy with a WITH CHECK
-- that ensures the roles column is unchanged unless the caller is an admin.
DROP POLICY IF EXISTS "Users can update own data" ON public.users;

CREATE POLICY "Users can update own data"
    ON public.users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        AND (
            -- Either the roles column is unchanged …
            roles IS NOT DISTINCT FROM (
                SELECT u.roles FROM public.users u WHERE u.id = auth.uid()
            )
            -- … or the caller is an admin (checked via app_metadata in JWT)
            OR public.has_role('admin')
        )
    );

-- ============================================================================
-- 4. Update comments
-- ============================================================================

COMMENT ON FUNCTION public.get_user_roles() IS
    'Extracts user roles from JWT app_metadata (server-controlled) to avoid privilege escalation and RLS recursion';
