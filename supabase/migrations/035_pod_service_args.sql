-- Migration: 035_pod_service_args
-- Description: Add args column to pods and services tables
-- Stark Orchestrator

-- Add args column to pods table
ALTER TABLE public.pods
ADD COLUMN IF NOT EXISTS args JSONB DEFAULT '[]'::JSONB;

-- Add args column to services table
ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS args JSONB DEFAULT '[]'::JSONB;

-- Comments
COMMENT ON COLUMN public.pods.args IS 'Arguments passed to the pack entrypoint';
COMMENT ON COLUMN public.services.args IS 'Arguments passed to pods created by this service';
