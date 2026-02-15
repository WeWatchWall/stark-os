/**
 * Volume CRUD Queries
 *
 * Provides database operations for volume entities using Supabase.
 * Volumes are node-local named storage units that persist across pod restarts.
 * @module @stark-o/server/supabase/volumes
 */

import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import type { Volume, VolumeListItem } from '@stark-o/shared';
import { getSupabaseServiceClient } from './client.js';

// ── Row Type ────────────────────────────────────────────────────────────────

/**
 * Database row type for the volumes table (snake_case)
 */
interface VolumeRow {
  id: string;
  name: string;
  node_id: string;
  created_at: string;
  updated_at: string;
}

// ── Result Type ─────────────────────────────────────────────────────────────

/**
 * Result type for database operations
 */
export interface VolumeResult<T> {
  data: T | null;
  error: PostgrestError | null;
}

// ── Row Mapping ─────────────────────────────────────────────────────────────

/**
 * Converts a database row (snake_case) to a Volume entity (camelCase)
 */
function rowToVolume(row: VolumeRow): Volume {
  return {
    id: row.id,
    name: row.name,
    nodeId: row.node_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Converts a database row to a VolumeListItem
 */
function rowToListItem(row: VolumeRow): VolumeListItem {
  return {
    id: row.id,
    name: row.name,
    nodeId: row.node_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ── Query Class ─────────────────────────────────────────────────────────────

/**
 * Volume queries using service role (server-side)
 */
export class VolumeQueries {
  constructor(private client: SupabaseClient) {}

  /**
   * Create a new volume
   */
  async createVolume(input: {
    name: string;
    nodeId: string;
  }): Promise<VolumeResult<Volume>> {
    const { data, error } = await this.client
      .from('volumes')
      .insert({
        name: input.name,
        node_id: input.nodeId,
      })
      .select()
      .single();

    if (error) {
      return { data: null, error };
    }

    return { data: rowToVolume(data as VolumeRow), error: null };
  }

  /**
   * Get a volume by ID
   */
  async getVolumeById(id: string): Promise<VolumeResult<Volume>> {
    const { data, error } = await this.client
      .from('volumes')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return { data: null, error };
    }

    return { data: rowToVolume(data as VolumeRow), error: null };
  }

  /**
   * Get a volume by name and node
   */
  async getVolumeByNameAndNode(
    name: string,
    nodeId: string
  ): Promise<VolumeResult<Volume>> {
    const { data, error } = await this.client
      .from('volumes')
      .select('*')
      .eq('name', name)
      .eq('node_id', nodeId)
      .single();

    if (error) {
      return { data: null, error };
    }

    return { data: rowToVolume(data as VolumeRow), error: null };
  }

  /**
   * List volumes with optional node filter
   */
  async listVolumes(filters?: {
    nodeId?: string;
  }): Promise<VolumeResult<VolumeListItem[]>> {
    let query = this.client
      .from('volumes')
      .select('*')
      .order('created_at', { ascending: true });

    if (filters?.nodeId) {
      query = query.eq('node_id', filters.nodeId);
    }

    const { data, error } = await query;

    if (error) {
      return { data: null, error };
    }

    return {
      data: (data as VolumeRow[]).map(rowToListItem),
      error: null,
    };
  }

  /**
   * Check if a volume exists by name and node
   */
  async volumeExists(
    name: string,
    nodeId: string
  ): Promise<boolean> {
    const { count } = await this.client
      .from('volumes')
      .select('id', { count: 'exact', head: true })
      .eq('name', name)
      .eq('node_id', nodeId);

    return (count ?? 0) > 0;
  }

  /**
   * Delete a volume by ID
   */
  async deleteVolume(id: string): Promise<VolumeResult<{ deleted: boolean }>> {
    const { error, count } = await this.client
      .from('volumes')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) {
      return { data: null, error };
    }

    return { data: { deleted: (count ?? 0) > 0 }, error: null };
  }

  /**
   * Delete a volume by name and node
   */
  async deleteVolumeByNameAndNode(
    name: string,
    nodeId: string
  ): Promise<VolumeResult<{ deleted: boolean }>> {
    const { error, count } = await this.client
      .from('volumes')
      .delete({ count: 'exact' })
      .eq('name', name)
      .eq('node_id', nodeId);

    if (error) {
      return { data: null, error };
    }

    return { data: { deleted: (count ?? 0) > 0 }, error: null };
  }
}

// ── Singleton Instance ──────────────────────────────────────────────────────

let _queriesInstance: VolumeQueries | null = null;

/**
 * Get the singleton VolumeQueries instance using service role
 */
export function getVolumeQueries(): VolumeQueries {
  if (!_queriesInstance) {
    _queriesInstance = new VolumeQueries(getSupabaseServiceClient());
  }
  return _queriesInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetVolumeQueries(): void {
  _queriesInstance = null;
}
