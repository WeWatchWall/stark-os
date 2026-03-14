-- Migration: 039_service_mode
-- Description: Add mode column to services table for replica/daemon/dynamic scheduling
-- Stark Orchestrator

-- Service mode enum
CREATE TYPE service_mode AS ENUM ('replica', 'daemon', 'dynamic');

-- Add mode column with default 'replica'
ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS mode service_mode NOT NULL DEFAULT 'replica';

-- Migrate existing DaemonSet services (replicas=0) to daemon mode
UPDATE public.services SET mode = 'daemon' WHERE replicas = 0;

-- Comments
COMMENT ON COLUMN public.services.mode IS 'Scheduling mode: replica (maintain N pods), daemon (one per node), dynamic (on-demand)';
