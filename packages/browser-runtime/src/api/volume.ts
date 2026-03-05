/**
 * Browser Volume Operations
 *
 * Volume download and archive using the shared StarkAPI's JSZip-based
 * zip operations. These standalone helpers resolve credentials from
 * localStorage / __STARK_CONTEXT__ and delegate to the portable API.
 *
 * @module @stark-o/browser-runtime/api/volume
 */

import { createStarkAPI } from '@stark-o/shared/api/stark-api.js';
import { getAccessToken, resolveApiUrl, requireAuth } from './client.js';

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

  const api = createStarkAPI({
    apiUrl: resolveApiUrl(),
    accessToken: getAccessToken() ?? undefined,
  });

  return api.volume.downloadAsZip(volumeName, nodeNameOrId);
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

  const api = createStarkAPI({
    apiUrl: resolveApiUrl(),
    accessToken: getAccessToken() ?? undefined,
  });

  return api.volume.archivePathAsZip(nodeNameOrId, volumeName, archivePath);
}
