/**
 * Volumes REST API Endpoints
 *
 * Provides REST endpoints for volume lifecycle management.
 * Volumes are node-local named storage units that persist across pod restarts.
 *
 * @module @stark-o/server/api/volumes
 */

import { Router, Request, Response } from 'express';
import {
  validateCreateVolumeInput,
  createServiceLogger,
  generateCorrelationId,
} from '@stark-o/shared';
import { getVolumeQueries } from '../supabase/volumes.js';
import { getConnectionManager } from '../services/connection-service.js';
import { registerPendingDownload } from '../services/volume-download-service.js';
import {
  authMiddleware,
  abilityMiddleware,
  canCreatePod,
  canReadPod,
  type AuthenticatedRequest,
} from '../middleware/index.js';

/**
 * Logger for volumes API
 */
const logger = createServiceLogger({
  level: 'debug',
  service: 'stark-orchestrator',
}, { component: 'api-volumes' });

/**
 * API success response
 */
interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * API error response
 */
interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Helper to send success response
 */
function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const response: ApiSuccessResponse<T> = { success: true, data };
  res.status(statusCode).json(response);
}

/**
 * Helper to send error response
 */
function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode: number,
  details?: Record<string, unknown>
): void {
  const response: ApiErrorResponse = {
    success: false,
    error: { code, message, ...(details && { details }) },
  };
  res.status(statusCode).json(response);
}

// ── Handlers ────────────────────────────────────────────────────────────────

/**
 * POST /api/volumes — Create a new volume
 */
async function createVolume(req: Request, res: Response): Promise<void> {
  const correlationId = generateCorrelationId();
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user?.id;

  if (!userId) {
    sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
    return;
  }

  logger.info('Creating volume', { correlationId, userId });

  try {
    const input = req.body;

    // Validate input
    const validation = validateCreateVolumeInput(input);
    if (!validation.valid) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid volume input', 400, {
        errors: validation.errors,
      });
      return;
    }

    const { name, nodeId } = input as { name: string; nodeId: string };

    // Check uniqueness (name + nodeId)
    const queries = getVolumeQueries();
    const exists = await queries.volumeExists(name, nodeId);
    if (exists) {
      sendError(res, 'CONFLICT', `Volume '${name}' already exists on node '${nodeId}'`, 409);
      return;
    }

    const result = await queries.createVolume({ name, nodeId });

    if (result.error) {
      logger.error('Failed to create volume', undefined, {
        error: result.error,
        correlationId,
      });
      sendError(res, 'INTERNAL_ERROR', 'Failed to create volume', 500);
      return;
    }

    logger.info('Volume created', {
      volumeId: result.data!.id,
      name,
      nodeId,
      correlationId,
    });

    sendSuccess(res, { volume: result.data }, 201);
  } catch (err) {
    logger.error('Error creating volume', err instanceof Error ? err : undefined, { correlationId });
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

/**
 * GET /api/volumes — List volumes
 */
async function listVolumes(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user?.id;

  if (!userId) {
    sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
    return;
  }

  try {
    const nodeId = req.query.nodeId as string | undefined;

    const queries = getVolumeQueries();
    const result = await queries.listVolumes({ nodeId });

    if (result.error) {
      sendError(res, 'INTERNAL_ERROR', 'Failed to list volumes', 500);
      return;
    }

    sendSuccess(res, { volumes: result.data ?? [] });
  } catch (err) {
    logger.error('Error listing volumes', err instanceof Error ? err : undefined);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

/**
 * GET /api/volumes/name/:name — Get volume by name
 */
async function getVolumeByName(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user?.id;

  if (!userId) {
    sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
    return;
  }

  try {
    const name = req.params.name;
    if (!name) {
      sendError(res, 'VALIDATION_ERROR', 'Volume name is required', 400);
      return;
    }
    const nodeId = req.query.nodeId as string | undefined;

    if (!nodeId) {
      sendError(res, 'VALIDATION_ERROR', 'nodeId query parameter is required', 400);
      return;
    }

    const queries = getVolumeQueries();
    const result = await queries.getVolumeByNameAndNode(name, nodeId);

    if (result.error || !result.data) {
      sendError(res, 'NOT_FOUND', `Volume '${name}' not found on node '${nodeId}'`, 404);
      return;
    }

    sendSuccess(res, { volume: result.data });
  } catch (err) {
    logger.error('Error getting volume', err instanceof Error ? err : undefined);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

/**
 * GET /api/volumes/name/:name/download — Download volume contents
 *
 * Sends a `volume:download` message to the target node via WebSocket,
 * waits for the runtime to collect and return all files, then responds
 * with a JSON payload of base64-encoded file entries. The CLI uses
 * the `tar` library to assemble the archive locally.
 */
async function downloadVolume(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user?.id;

  if (!userId) {
    sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
    return;
  }

  try {
    const name = req.params.name;
    if (!name) {
      sendError(res, 'VALIDATION_ERROR', 'Volume name is required', 400);
      return;
    }
    const nodeId = req.query.nodeId as string;
    if (!nodeId) {
      sendError(res, 'VALIDATION_ERROR', 'nodeId query parameter is required', 400);
      return;
    }

    // Check if volume is registered in the database (best-effort).
    // The node runtime is the source of truth — the volume may exist on disk
    // even if no database record is present (e.g. created implicitly via a
    // pod volume mount).  We log a warning but still proceed to ask the node.
    const queries = getVolumeQueries();
    const result = await queries.getVolumeByNameAndNode(name, nodeId);

    if (result.error || !result.data) {
      logger.warn('Volume not found in database, attempting download from node anyway', {
        volumeName: name,
        nodeId,
      });
    }

    // Send download request to the runtime via WebSocket
    const connectionManager = getConnectionManager();
    if (!connectionManager) {
      sendError(res, 'SERVICE_UNAVAILABLE', 'WebSocket connection manager not available', 503);
      return;
    }

    const correlationId = generateCorrelationId();
    const downloadPromise = registerPendingDownload(correlationId);

    const sent = connectionManager.sendToNodeId(nodeId, {
      type: 'volume:download',
      payload: { volumeName: name },
      correlationId,
    });

    if (!sent) {
      sendError(res, 'SERVICE_UNAVAILABLE', `Node '${nodeId}' is not connected`, 503);
      return;
    }

    logger.info('Volume download requested from node', { volumeName: name, nodeId, correlationId });

    // Wait for the runtime to respond with file data
    const files = await downloadPromise;

    logger.info('Volume download complete', { volumeName: name, nodeId, fileCount: files.length });

    // Return the file list as JSON — the CLI will create the tar archive
    sendSuccess(res, { volumeName: name, files });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('Error downloading volume', err instanceof Error ? err : undefined);
    sendError(res, 'DOWNLOAD_ERROR', message, 500);
  }
}

// ── Router ──────────────────────────────────────────────────────────────────

/**
 * Create the volumes router
 */
export function createVolumesRouter(): Router {
  const router = Router();

  // All routes require authentication
  router.use(authMiddleware);
  router.use(abilityMiddleware);

  // CRUD routes
  router.post('/', canCreatePod, createVolume);
  router.get('/', canReadPod, listVolumes);
  router.get('/name/:name', canReadPod, getVolumeByName);
  router.get('/name/:name/download', canReadPod, downloadVolume);

  return router;
}

export default createVolumesRouter;
