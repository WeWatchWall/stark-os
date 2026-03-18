/**
 * Events REST API Endpoints
 *
 * Provides REST endpoints for querying system events.
 * Events are first-class data used for debugging, UI timelines, and audits.
 *
 * @module @stark-o/server/api/events
 */

import { Router, Request, Response } from 'express';
import { createServiceLogger } from '@stark-o/shared';
import type { EventCategory, EventSeverity } from '@stark-o/shared';
import { queryEvents } from '../supabase/index.js';
import {
  authMiddleware,
  abilityMiddleware,
  type AuthenticatedRequest,
} from '../middleware/index.js';

/**
 * Logger for events API
 */
const logger = createServiceLogger({
  level: 'debug',
  service: 'stark-orchestrator',
}, { component: 'api-events' });

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

// ── Constants ───────────────────────────────────────────────────────────────

const VALID_CATEGORIES: ReadonlySet<string> = new Set<EventCategory>([
  'pod', 'node', 'pack', 'service', 'system', 'auth', 'scheduler',
]);

const VALID_SEVERITIES: ReadonlySet<string> = new Set<EventSeverity>([
  'info', 'warning', 'error', 'critical',
]);

// ── Handlers ────────────────────────────────────────────────────────────────

/**
 * GET /api/events — List recent events
 */
async function listEvents(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user?.id;

  if (!userId) {
    sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
    return;
  }

  try {
    const category = req.query.category as string | undefined;
    const severity = req.query.severity as string | undefined;
    const since = req.query.since as string | undefined;
    const limitParam = req.query.limit as string | undefined;
    const offsetParam = req.query.offset as string | undefined;

    if (category && !VALID_CATEGORIES.has(category)) {
      sendError(res, 'VALIDATION_ERROR', `Invalid category: ${category}`, 400);
      return;
    }

    if (severity && !VALID_SEVERITIES.has(severity)) {
      sendError(res, 'VALIDATION_ERROR', `Invalid severity: ${severity}`, 400);
      return;
    }

    const limit = limitParam ? parseInt(limitParam, 10) : 100;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    if (isNaN(limit) || limit < 1 || limit > 1000) {
      sendError(res, 'VALIDATION_ERROR', 'limit must be a number between 1 and 1000', 400);
      return;
    }

    if (isNaN(offset) || offset < 0) {
      sendError(res, 'VALIDATION_ERROR', 'offset must be a non-negative number', 400);
      return;
    }

    let sinceDate: Date | undefined;
    if (since) {
      sinceDate = new Date(since);
      if (isNaN(sinceDate.getTime())) {
        sendError(res, 'VALIDATION_ERROR', 'since must be a valid ISO 8601 date string', 400);
        return;
      }
    }

    const result = await queryEvents({
      ...(category && { category: category as EventCategory }),
      ...(severity && { severity: severity as EventSeverity }),
      ...(sinceDate && { since: sinceDate }),
      limit,
      offset,
    });

    logger.debug('Events queried', {
      userId,
      category,
      severity,
      since,
      limit,
      offset,
      total: result.total,
      returned: result.events.length,
    });

    sendSuccess(res, {
      events: result.events,
      total: result.total,
      hasMore: result.hasMore,
    });
  } catch (err) {
    logger.error('Error listing events', err instanceof Error ? err : undefined);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

// ── Router ──────────────────────────────────────────────────────────────────

/**
 * Create the events router
 */
export function createEventsRouter(): Router {
  const router = Router();

  // All routes require authentication
  router.use(authMiddleware);
  router.use(abilityMiddleware);

  // Query routes
  router.get('/', listEvents);

  return router;
}

export default createEventsRouter;
