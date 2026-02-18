/**
 * Browser CLI — Main Entry Point
 *
 * Exposes the browser CLI API for use in browser runtimes and pods.
 * @module @stark-o/browser-cli
 */

// Config & auth
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
  type BrowserCliConfig,
  type BrowserCredentials,
} from './config.js';

// Command execution
export {
  executeCommand,
  type CommandResult,
  type OutputWriter,
} from './handlers.js';

// Volume operations (JSZip-based)
export {
  downloadVolume,
  archiveVolumePath,
} from './volume.js';

// Browser agent
export {
  startBrowserAgent,
  storeBrowserCredentials,
  getBrowserCredentials,
  type BrowserAgentStartOptions,
  type BrowserNodeCredentials,
} from './agent.js';

// Re-export shared CLI data definitions
export {
  starkCliDefinition,
  type CliDefinition,
  type CliCommandDef,
  type CliSubcommandDef,
  type CliOptionDef,
} from '@stark-o/shared';
