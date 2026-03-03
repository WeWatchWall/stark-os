-- Migration: 036_namespace_scoping
-- Description: Scope nodes, packs, and volumes uniqueness to namespaces
-- Stark Orchestrator

-- ============================================================================
-- 1. NODES — add namespace column, update unique constraint
-- ============================================================================

-- Add namespace column to nodes
ALTER TABLE public.nodes
ADD COLUMN IF NOT EXISTS namespace TEXT NOT NULL DEFAULT 'default';

-- Drop old global unique constraint on name
ALTER TABLE public.nodes
DROP CONSTRAINT IF EXISTS nodes_name_key;

-- Add namespace-scoped unique constraint
ALTER TABLE public.nodes
ADD CONSTRAINT unique_node_name_namespace UNIQUE (name, namespace);

-- Index for namespace queries
CREATE INDEX IF NOT EXISTS idx_nodes_namespace ON public.nodes(namespace);
CREATE INDEX IF NOT EXISTS idx_nodes_name_namespace ON public.nodes(name, namespace);

COMMENT ON COLUMN public.nodes.namespace IS 'Namespace for resource isolation — node names are unique within a namespace';

-- ============================================================================
-- 2. PACKS — add resource_namespace column, update unique constraint
-- ============================================================================

-- Add resource_namespace column to packs
-- (The existing 'namespace' column is a pack_namespace enum for trust boundary)
ALTER TABLE public.packs
ADD COLUMN IF NOT EXISTS resource_namespace TEXT NOT NULL DEFAULT 'default';

-- Drop old global unique constraint on name + version
ALTER TABLE public.packs
DROP CONSTRAINT IF EXISTS unique_pack_version;

-- Add namespace-scoped unique constraint
ALTER TABLE public.packs
ADD CONSTRAINT unique_pack_version_namespace UNIQUE (name, version, resource_namespace);

-- Index for resource_namespace queries
CREATE INDEX IF NOT EXISTS idx_packs_resource_namespace ON public.packs(resource_namespace);
CREATE INDEX IF NOT EXISTS idx_packs_name_version_ns ON public.packs(name, version, resource_namespace);

COMMENT ON COLUMN public.packs.resource_namespace IS 'Resource namespace for isolation — pack name+version is unique within a namespace';

-- ============================================================================
-- 3. VOLUMES — add namespace column, update unique constraint
-- ============================================================================

-- Add namespace column to volumes
ALTER TABLE public.volumes
ADD COLUMN IF NOT EXISTS namespace TEXT NOT NULL DEFAULT 'default';

-- Drop old node-scoped unique constraint
ALTER TABLE public.volumes
DROP CONSTRAINT IF EXISTS volumes_name_node_id_key;

-- Add namespace-scoped unique constraint
ALTER TABLE public.volumes
ADD CONSTRAINT unique_volume_name_namespace UNIQUE (name, namespace);

-- Index for namespace queries
CREATE INDEX IF NOT EXISTS idx_volumes_namespace ON public.volumes(namespace);
CREATE INDEX IF NOT EXISTS idx_volumes_name_namespace ON public.volumes(name, namespace);

COMMENT ON COLUMN public.volumes.namespace IS 'Namespace for resource isolation — volume names are unique within a namespace';

-- ============================================================================
-- 4. AUTO-CREATE USER NAMESPACE ON SIGNUP
-- ============================================================================

-- Function: derive a namespace name from an email address.
-- Takes the local part (before @), lowercases, replaces non-alphanum with
-- hyphens, collapses consecutive hyphens, strips leading/trailing hyphens,
-- and truncates to 63 characters.
CREATE OR REPLACE FUNCTION derive_user_namespace(email TEXT)
RETURNS TEXT AS $$
DECLARE
  local_part TEXT;
  ns TEXT;
BEGIN
  local_part := split_part(email, '@', 1);
  ns := lower(local_part);
  ns := regexp_replace(ns, '[^a-z0-9]', '-', 'g');
  ns := regexp_replace(ns, '-+', '-', 'g');
  ns := trim(BOTH '-' FROM ns);
  IF length(ns) = 0 THEN
    ns := 'user';
  END IF;
  RETURN left(ns, 63);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function: after a new user is created in public.users,
-- auto-create a personal namespace for them (if it does not already exist).
CREATE OR REPLACE FUNCTION public.handle_new_user_namespace()
RETURNS TRIGGER AS $$
DECLARE
  ns_name TEXT;
BEGIN
  ns_name := derive_user_namespace(NEW.email);

  INSERT INTO public.namespaces (name, labels, annotations, created_by)
  VALUES (
    ns_name,
    jsonb_build_object('stark.io/user', NEW.email),
    jsonb_build_object('description', 'Personal namespace for ' || NEW.email),
    NEW.id
  )
  ON CONFLICT (name) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_user_profile_created_namespace
    AFTER INSERT ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_namespace();
