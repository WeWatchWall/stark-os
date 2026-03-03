/**
 * Namespace resolution utility
 *
 * Provides a helper to resolve the effective namespace for write operations.
 * Uses the user's personal namespace (derived from email) as the default
 * when no explicit namespace is provided.
 *
 * @module @stark-o/server/middleware/resolve-namespace
 */

import type { Request } from 'express';
import { getUserNamespace, DEFAULT_NAMESPACE } from '@stark-o/shared';
import type { AuthenticatedRequest } from './auth-middleware.js';

/**
 * Resolve the effective namespace for a write operation.
 *
 * Priority:
 *   1. Explicit namespace from the caller (body or argument)
 *   2. User's personal namespace (derived from email)
 *   3. 'default' global namespace
 */
export function resolveWriteNamespace(
  explicitNamespace: string | undefined | null,
  req: Request,
): string {
  if (explicitNamespace) {
    return explicitNamespace;
  }

  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.email) {
    return getUserNamespace(authReq.user.email);
  }

  return DEFAULT_NAMESPACE;
}
