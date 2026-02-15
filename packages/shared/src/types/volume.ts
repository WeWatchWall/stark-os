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

/**
 * A single file entry in a volume download response.
 * Content is base64-encoded so it can be serialized over JSON/WebSocket.
 */
export interface VolumeFileEntry {
  /** Relative path within the volume (e.g. "subdir/file.txt") */
  path: string;
  /** File content, base64-encoded */
  data: string;
}

/**
 * Payload sent by the orchestrator to a runtime to request volume contents.
 */
export interface VolumeDownloadRequest {
  /** Name of the volume to download */
  volumeName: string;
}

/**
 * Payload returned by a runtime with the volume's file contents.
 */
export interface VolumeDownloadResponse {
  /** Volume name */
  volumeName: string;
  /** All files in the volume, with base64-encoded content */
  files: VolumeFileEntry[];
}
