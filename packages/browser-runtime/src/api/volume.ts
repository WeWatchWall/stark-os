/**
 * Browser Volume Operations
 *
 * Volume download and archive using JSZip for cross-platform archive handling.
 * @module @stark-o/browser-runtime/api/volume
 */

import JSZip from 'jszip';
import { createApiClient, requireAuth, resolveNodeId, type ApiClient } from './client.js';

/**
 * Volume file entry from the API
 */
interface VolumeFileEntry {
  path: string;
  data: string; // base64
}

/**
 * API response wrapper
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Downloads volume contents as a zip archive using JSZip.
 * Works in both Node.js and browser environments.
 *
 * @param volumeName - Name of the volume to download
 * @param nodeNameOrId - Node name or UUID
 * @returns Uint8Array containing the zip archive
 */
export async function downloadVolume(
  volumeName: string,
  nodeNameOrId: string,
): Promise<Uint8Array> {
  requireAuth();

  const api = createApiClient();
  const nodeId = await resolveNodeId(nodeNameOrId, api);

  const params = new URLSearchParams({ nodeId });
  const url = `/api/volumes/name/${encodeURIComponent(volumeName)}/download?${params.toString()}`;
  const response = await api.get(url);

  if (!response.ok) {
    const result = await response.json().catch(() => ({ success: false })) as ApiResponse<unknown>;
    throw new Error(result.error?.message ?? 'Failed to download volume');
  }

  const result = (await response.json()) as ApiResponse<{
    volumeName: string;
    files: VolumeFileEntry[];
  }>;

  if (!result.success || !result.data) {
    throw new Error(result.error?.message ?? 'Failed to download volume');
  }

  const { files } = result.data;
  const zip = new JSZip();

  for (const entry of files) {
    // Decode base64 to binary
    const binaryStr = atob(entry.data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    zip.file(`${volumeName}/${entry.path}`, bytes);
  }

  return zip.generateAsync({ type: 'uint8array' });
}

/**
 * Creates a zip archive of a specific path within a volume.
 *
 * @param nodeNameOrId - Node name or UUID
 * @param volumeName - Name of the volume
 * @param archivePath - Path within the volume to archive
 * @returns Uint8Array containing the zip archive
 */
export async function archiveVolumePath(
  nodeNameOrId: string,
  volumeName: string,
  archivePath: string,
): Promise<Uint8Array> {
  requireAuth();

  const api = createApiClient();
  const nodeId = await resolveNodeId(nodeNameOrId, api);

  const params = new URLSearchParams({ nodeId });
  const url = `/api/volumes/name/${encodeURIComponent(volumeName)}/download?${params.toString()}`;
  const response = await api.get(url);

  if (!response.ok) {
    const result = await response.json().catch(() => ({ success: false })) as ApiResponse<unknown>;
    throw new Error(result.error?.message ?? 'Failed to access volume');
  }

  const result = (await response.json()) as ApiResponse<{
    volumeName: string;
    files: VolumeFileEntry[];
  }>;

  if (!result.success || !result.data) {
    throw new Error(result.error?.message ?? 'Failed to access volume');
  }

  const { files } = result.data;

  // Normalize the target path
  const normalizedPath = archivePath.replace(/^\/+|\/+$/g, '');

  // Filter files that are under the target path
  const matchingFiles = files.filter((f) => {
    const normalizedFilePath = f.path.replace(/^\/+/, '');
    return normalizedFilePath === normalizedPath || normalizedFilePath.startsWith(normalizedPath + '/');
  });

  if (matchingFiles.length === 0) {
    throw new Error(`No files found at path: ${archivePath}`);
  }

  const zip = new JSZip();

  // Get the archive name from the last path segment
  const pathParts = normalizedPath.split('/');
  const archiveName = pathParts[pathParts.length - 1] ?? volumeName;

  for (const entry of matchingFiles) {
    const normalizedFilePath = entry.path.replace(/^\/+/, '');
    // Make the path relative to the parent of archivePath
    const parentPath = pathParts.slice(0, -1).join('/');
    const relativePath = parentPath
      ? normalizedFilePath.slice(parentPath.length + 1)
      : normalizedFilePath;

    const binaryStr = atob(entry.data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    zip.file(relativePath, bytes);
  }

  return zip.generateAsync({
    type: 'uint8array',
    comment: `Archive of ${archiveName} from volume ${volumeName}`,
  });
}
