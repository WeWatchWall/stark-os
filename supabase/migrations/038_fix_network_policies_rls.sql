-- Migration: 038_fix_network_policies_rls
-- Description: Restrict network_policies INSERT/UPDATE/DELETE so that regular
--              users can only manage policies within namespaces they own, while
--              admins retain full access. The previous policies used USING(true)
--              which allowed any authenticated user to modify any policy.

-- Drop the overly-permissive policies
DROP POLICY IF EXISTS "network_policies_insert" ON public.network_policies;
DROP POLICY IF EXISTS "network_policies_update" ON public.network_policies;
DROP POLICY IF EXISTS "network_policies_delete" ON public.network_policies;

-- Helper: check if the current user owns the given namespace (or is admin)
CREATE OR REPLACE FUNCTION public.can_manage_namespace(ns TEXT)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.namespaces
        WHERE name = ns AND created_by = auth.uid()
    ) OR public.has_role('admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Recreate with namespace-scoped access
CREATE POLICY "network_policies_insert" ON public.network_policies
    FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_namespace(namespace));

CREATE POLICY "network_policies_update" ON public.network_policies
    FOR UPDATE TO authenticated
    USING (public.can_manage_namespace(namespace))
    WITH CHECK (public.can_manage_namespace(namespace));

CREATE POLICY "network_policies_delete" ON public.network_policies
    FOR DELETE TO authenticated
    USING (public.can_manage_namespace(namespace));
