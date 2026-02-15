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
  generateUUID,
} from '@stark-o/shared';
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
 * In-memory volume store (production would use persistent storage)
 */
interface VolumeRecord {
  id: string;
  name: string;
  nodeId: string;
  createdAt: Date;
  updatedAt: Date;
}

const volumeStore: Map<string, VolumeRecord> = new Map();

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
    for (const vol of volumeStore.values()) {
      if (vol.name === name && vol.nodeId === nodeId) {
        sendError(res, 'CONFLICT', `Volume '${name}' already exists on node '${nodeId}'`, 409);
        return;
      }
    }

    const now = new Date();
    const volume: VolumeRecord = {
      id: generateUUID(),
      name,
      nodeId,
      createdAt: now,
      updatedAt: now,
    };

    volumeStore.set(volume.id, volume);

    logger.info('Volume created', {
      volumeId: volume.id,
      name,
      nodeId,
      correlationId,
    });

    sendSuccess(res, { volume }, 201);
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

    let volumes = Array.from(volumeStore.values());

    if (nodeId) {
      volumes = volumes.filter(v => v.nodeId === nodeId);
    }

    sendSuccess(res, { volumes });
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

    let volume: VolumeRecord | undefined;
    for (const v of volumeStore.values()) {
      if (v.name === name && (!nodeId || v.nodeId === nodeId)) {
        volume = v;
        break;
      }
    }

    if (!volume) {
      sendError(res, 'NOT_FOUND', `Volume '${name}' not found`, 404);
      return;
    }

    sendSuccess(res, { volume });
  } catch (err) {
    logger.error('Error getting volume', err instanceof Error ? err : undefined);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

/**
 * GET /api/volumes/name/:name/download — Download volume contents
 *
 * In V1, this is a placeholder that returns an empty tar as actual
 * volume content retrieval depends on the node runtime implementation.
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

    let volume: VolumeRecord | undefined;
    for (const v of volumeStore.values()) {
      if (v.name === name && v.nodeId === nodeId) {
        volume = v;
        break;
      }
    }

    if (!volume) {
      sendError(res, 'NOT_FOUND', `Volume '${name}' not found on node '${nodeId}'`, 404);
      return;
    }

    // V1 placeholder: return empty tar header (512 zero bytes = end-of-archive)
    logger.info('Volume download requested', { volumeName: name, nodeId });
    res.setHeader('Content-Type', 'application/x-tar');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.tar"`);
    res.status(200).send(Buffer.alloc(1024, 0));
  } catch (err) {
    logger.error('Error downloading volume', err instanceof Error ? err : undefined);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
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
