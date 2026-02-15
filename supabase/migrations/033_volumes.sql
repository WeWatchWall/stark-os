-- Migration: 033_volumes
-- Description: Add volumes table, volume_mounts to pods/services, node_id to services
-- Stark Orchestrator

-- ============================================================================
-- 1. VOLUMES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.volumes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identity
    name TEXT NOT NULL,

    -- Node assignment (volumes are node-local)
    node_id UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique constraint: volume name must be unique per node
    UNIQUE(name, node_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_volumes_node_id ON public.volumes(node_id);
CREATE INDEX IF NOT EXISTS idx_volumes_name ON public.volumes(name);

-- Trigger for updated_at
CREATE TRIGGER trigger_volumes_updated_at
    BEFORE UPDATE ON public.volumes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security)
ALTER TABLE public.volumes ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read volumes
CREATE POLICY "Anyone can read volumes"
    ON public.volumes FOR SELECT
    USING (true);

-- Policy: Authenticated users can create volumes
CREATE POLICY "Authenticated users can create volumes"
    ON public.volumes FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Authenticated users can delete volumes
CREATE POLICY "Authenticated users can delete volumes"
    ON public.volumes FOR DELETE
    USING (auth.uid() IS NOT NULL);

-- Comments
COMMENT ON TABLE public.volumes IS 'Node-local named persistent storage units managed by the orchestrator';
COMMENT ON COLUMN public.volumes.name IS 'Volume name, unique per node';
COMMENT ON COLUMN public.volumes.node_id IS 'Node where this volume resides (volumes are node-local)';

-- ============================================================================
-- 2. ADD volume_mounts TO PODS
-- ============================================================================

ALTER TABLE public.pods
    ADD COLUMN IF NOT EXISTS volume_mounts JSONB DEFAULT '[]'::JSONB;

COMMENT ON COLUMN public.pods.volume_mounts IS 'Array of {name, mountPath} volume mount definitions for this pod';

-- ============================================================================
-- 3. ADD node_id AND volume_mounts TO SERVICES
-- ============================================================================

-- node_id: when set, all replicas are pinned to this node.
-- Required when volumeMounts are specified (volumes are node-local).
ALTER TABLE public.services
    ADD COLUMN IF NOT EXISTS node_id UUID REFERENCES public.nodes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.services.node_id IS 'Target node ID; when set all replicas schedule on this node. Required for volume mounts.';

-- volume_mounts: propagated to every pod created by the service
ALTER TABLE public.services
    ADD COLUMN IF NOT EXISTS volume_mounts JSONB DEFAULT '[]'::JSONB;

COMMENT ON COLUMN public.services.volume_mounts IS 'Array of {name, mountPath} volume mount definitions applied to pods created by this service';
