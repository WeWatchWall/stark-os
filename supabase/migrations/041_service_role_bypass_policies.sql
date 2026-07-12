-- Migration: 041_service_role_bypass_policies
-- Description: Add explicit service_role bypass policies for all RLS-enabled tables.
--
-- After upgrading to Supabase with PostgreSQL 17, the implicit RLS bypass for
-- service_role no longer applies. Tables that had RLS enabled but lacked an
-- explicit "TO service_role" policy now reject queries from the server's
-- service_role client. This migration adds explicit bypass policies matching
-- the pattern already used by network_policies and secrets.
--
-- Affected tables: users, packs, nodes, pods, pod_history, cluster_config,
--   namespaces, priority_classes, app_config, services, node_metrics,
--   pod_metrics, scheduling_metrics, cluster_metrics, events, volumes.
--
-- Tables already covered (skipped): network_policies, secrets.

-- ============================================================================
-- users
-- ============================================================================
CREATE POLICY "service_role_all_users" ON public.users
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- packs
-- ============================================================================
CREATE POLICY "service_role_all_packs" ON public.packs
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- nodes
-- ============================================================================
CREATE POLICY "service_role_all_nodes" ON public.nodes
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- pods
-- ============================================================================
CREATE POLICY "service_role_all_pods" ON public.pods
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- pod_history
-- ============================================================================
CREATE POLICY "service_role_all_pod_history" ON public.pod_history
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- cluster_config
-- ============================================================================
CREATE POLICY "service_role_all_cluster_config" ON public.cluster_config
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- namespaces
-- ============================================================================
CREATE POLICY "service_role_all_namespaces" ON public.namespaces
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- priority_classes
-- ============================================================================
CREATE POLICY "service_role_all_priority_classes" ON public.priority_classes
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- app_config
-- ============================================================================
CREATE POLICY "service_role_all_app_config" ON public.app_config
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- services
-- ============================================================================
CREATE POLICY "service_role_all_services" ON public.services
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- node_metrics
-- ============================================================================
CREATE POLICY "service_role_all_node_metrics" ON public.node_metrics
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- pod_metrics
-- ============================================================================
CREATE POLICY "service_role_all_pod_metrics" ON public.pod_metrics
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- scheduling_metrics
-- ============================================================================
CREATE POLICY "service_role_all_scheduling_metrics" ON public.scheduling_metrics
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- cluster_metrics
-- ============================================================================
CREATE POLICY "service_role_all_cluster_metrics" ON public.cluster_metrics
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- events
-- ============================================================================
CREATE POLICY "service_role_all_events" ON public.events
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- volumes
-- ============================================================================
CREATE POLICY "service_role_all_volumes" ON public.volumes
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
