-- Migration: 042_grant_table_permissions_service_role
-- Description: Grant explicit table-level permissions to service_role for PostgreSQL 17.
--
-- In PostgreSQL 17 (Supabase), the service_role no longer implicitly has
-- GRANT-level access to tables in the public schema. Migration 041 added RLS
-- bypass policies, but the underlying "permission denied for table X" errors
-- are caused by missing table GRANT privileges, not RLS.
--
-- This migration:
-- 1. Grants ALL privileges on all existing public tables to service_role.
-- 2. Grants ALL on all existing sequences to service_role.
-- 3. Sets default privileges so future tables/sequences created by postgres
--    are automatically accessible to service_role.

-- Grant on all existing tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Grant on all existing sequences
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Ensure future tables created by the postgres role also grant to service_role
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT ALL ON SEQUENCES TO service_role;

-- Also cover the supabase_admin role which may run migrations in some setups
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
    GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
    GRANT ALL ON SEQUENCES TO service_role;
