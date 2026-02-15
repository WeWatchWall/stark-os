/**
 * Volume Download Service
 * @module @stark-o/server/services/volume-download-service
 *
 * Manages pending volume download requests from the HTTP API.
 * When the server API needs volume files, it:
 *   1. Registers a pending request with a correlationId
 *   2. Sends `volume:download` via WebSocket to the node
 *   3. The runtime responds with `volume:download:response` or `volume:download:error`
 *   4. The connection-manager calls handleVolumeDownloadResponse/handleVolumeDownloadError
 *   5. The pending promise resolves/rejects, and the API returns the result to the CLI
 */

import type { VolumeFileEntry } from '@stark-o/shared';

/**
 * A pending download request waiting for the runtime's response.
 */
interface PendingDownload {
  resolve: (files: VolumeFileEntry[]) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/** correlationId → PendingDownload */
const pendingDownloads = new Map<string, PendingDownload>();

/** Default timeout for volume download requests (60 s) */
const DOWNLOAD_TIMEOUT_MS = 60_000;

/**
 * Register a pending volume download and return a promise that
 * resolves when the runtime responds.
 */
export function registerPendingDownload(correlationId: string): Promise<VolumeFileEntry[]> {
  return new Promise<VolumeFileEntry[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingDownloads.delete(correlationId);
      reject(new Error('Volume download timed out'));
    }, DOWNLOAD_TIMEOUT_MS);

    pendingDownloads.set(correlationId, { resolve, reject, timeout });
  });
}

/**
 * Handle a successful volume download response from a runtime.
 * Called by the connection-manager when it receives `volume:download:response`.
 */
export function handleVolumeDownloadResponse(
  correlationId: string,
  payload: { volumeName: string; files: VolumeFileEntry[] }
): boolean {
  const pending = pendingDownloads.get(correlationId);
  if (!pending) return false;

  clearTimeout(pending.timeout);
  pendingDownloads.delete(correlationId);
  pending.resolve(payload.files);
  return true;
}

/**
 * Handle a volume download error from a runtime.
 * Called by the connection-manager when it receives `volume:download:error`.
 */
export function handleVolumeDownloadError(
  correlationId: string,
  payload: { volumeName: string; error: string }
): boolean {
  const pending = pendingDownloads.get(correlationId);
  if (!pending) return false;

  clearTimeout(pending.timeout);
  pendingDownloads.delete(correlationId);
  pending.reject(new Error(payload.error));
  return true;
}
