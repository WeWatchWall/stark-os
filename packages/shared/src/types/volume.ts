/**
 * Volume type definitions
 * @module @stark-o/shared/types/volume
 */

/**
 * Volume mount definition for pods and services.
 * Maps a named volume to a path inside the container/pack runtime.
 */
export interface VolumeMount {
  /** Volume name (must exist on the target node) */
  name: string;
  /** Mount path inside the container/pack runtime */
  mountPath: string;
}

/**
 * Volume entity — a named, node-local persistent storage unit
 * managed by the orchestrator.
 */
export interface Volume {
  /** Unique identifier (UUID) */
  id: string;
  /** Volume name (unique per node) */
  name: string;
  /** Node ID the volume resides on */
  nodeId: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Volume creation input
 */
export interface CreateVolumeInput {
  /** Volume name */
  name: string;
  /** Target node ID */
  nodeId: string;
}

/**
 * Volume list item (summary)
 */
export interface VolumeListItem {
  id: string;
  name: string;
  nodeId: string;
  createdAt: Date;
  updatedAt: Date;
}
