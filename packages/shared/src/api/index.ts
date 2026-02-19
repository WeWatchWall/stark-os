/**
 * Shared API — Portable Stark API for all runtimes
 *
 * Exports the runtime-agnostic StarkAPI factory and types.
 *
 * @module @stark-o/shared/api
 */

export {
  createStarkAPI,
  type StarkAPI,
  type StarkAPIConfig,
} from './stark-api.js';
