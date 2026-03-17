/**
 * Shared API — Portable Stark API for all runtimes
 *
 * Exports the runtime-agnostic StarkAPI factory, types, and helpers.
 *
 * @module @stark-o/shared/api
 */

export {
  createStarkAPI,
  type StarkAPI,
  type StarkAPIConfig,
  type ApiResponse,
  handleResponse,
  handleDeleteResponse,
  resolveNodeId,
  resolvePackId,
  resolveApiUrl,
  base64ToUint8Array,
  UUID_PATTERN,
} from './stark-api.js';
