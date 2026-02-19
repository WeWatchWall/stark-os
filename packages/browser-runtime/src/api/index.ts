/**
 * Browser API — Programmatic API for Stark Orchestrator
 *
 * Exports the StarkAPI interface, factory function, client utilities,
 * and volume operations for use by packs (context.starkAPI) and the terminal.
 *
 * @module @stark-o/browser-runtime/api
 */

// Programmatic API
export { createStarkAPI, type StarkAPI } from './api.js';

// Client utilities
export {
  loadConfig,
  saveConfig,
  loadCredentials,
  saveCredentials,
  clearCredentials,
  isAuthenticated,
  getAccessToken,
  requireAuth,
  createApiClient,
  resolveNodeId,
  resolveApiUrl,
  type BrowserApiConfig,
  type BrowserCredentials,
  type ApiClient,
} from './client.js';

// Volume operations (JSZip-based)
export {
  downloadVolume,
  archiveVolumePath,
} from './volume.js';
