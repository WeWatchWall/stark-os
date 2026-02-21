-- Migration: 034_node_machine_id
-- Description: Add machine_id column to nodes table for identifying which physical/virtual machine a node runs on
-- Stark Orchestrator
--
-- machine_id is a UUID that uniquely identifies the machine where a node agent runs.
-- It is generated once on the machine and persisted locally (~/.stark/nodes/machine-id).
-- When a node registers or reconnects, it sends its machine_id to the server.

ALTER TABLE public.nodes
ADD COLUMN IF NOT EXISTS machine_id UUID DEFAULT NULL;

-- Index for querying nodes by machine
CREATE INDEX IF NOT EXISTS idx_nodes_machine_id ON public.nodes(machine_id);

COMMENT ON COLUMN public.nodes.machine_id IS 'UUID identifying the physical/virtual machine this node runs on. Persisted on the machine and sent during registration/reconnection.';
