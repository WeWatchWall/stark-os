-- Migration: 042_grant_table_permissions_service_role
-- Description: Grant explicit table-level permissions to service_role and
--   supabase_auth_admin for PostgreSQL 17.
--
-- In PostgreSQL 17 (Supabase), roles no longer implicitly have GRANT-level
-- access to tables in the public schema. Migration 041 added RLS bypass
-- policies, but the underlying "permission denied for table X" errors are
-- caused by missing table GRANT privileges, not RLS.
--
-- Additionally, the GoTrue auth service (supabase_auth_admin) fires triggers
-- on auth.users INSERT that write to public.users and public.namespaces.
-- These triggers are SECURITY DEFINER but the trigger execution context
-- still requires the invoking role to have USAGE on the schema and the
-- definer to have table privileges. We grant to both roles to be safe.
--
-- This migration:
-- 1. Grants ALL privileges on all existing public tables to service_role.
-- 2. Grants ALL on all existing sequences to service_role.
-- 3. Grants INSERT/SELECT/UPDATE on public.users and public.namespaces to
--    supabase_auth_admin (for auth triggers).
-- 4. Sets default privileges for future tables.

-- Grant on all existing tables to service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Grant on all existing sequences to service_role
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Grant schema usage to supabase_auth_admin so triggers can resolve tables
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

-- Grant table-level permissions needed by auth triggers (handle_new_user,
-- handle_new_user_namespace) which insert into these tables
GRANT ALL ON public.users TO supabase_auth_admin;
GRANT ALL ON public.namespaces TO supabase_auth_admin;

-- Also grant on sequences that may be referenced
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO supabase_auth_admin;

-- Ensure future tables created by the postgres role also grant to service_role
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT ALL ON SEQUENCES TO service_role;

