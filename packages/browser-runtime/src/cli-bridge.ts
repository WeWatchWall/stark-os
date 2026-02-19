/**
 * Browser CLI Bridge
 *
 * Exposes the Stark API to pods running in the browser runtime.
 * Pods can call API operations through this bridge.
 * Always uses context.starkAPI — no direct imports of createStarkAPI.
 * @module @stark-o/browser-runtime/cli-bridge
 */

import type { StarkAPI } from './api/api.js';

/**
 * CLI command result
 */
export interface CliBridgeResult {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: string;
}

/**
 * Output writer callback
 */
export type CliBridgeWriter = (text: string) => void;

/**
 * CLI bridge that exposes the Stark API to pods.
 * Receives its StarkAPI instance from the pack execution context
 * (context.starkAPI) rather than creating its own.
 */
export class CliBridge {
  private readonly _api: StarkAPI;

  constructor(api: StarkAPI) {
    this._api = api;
  }

  /**
   * Execute a CLI-like command via the StarkAPI.
   * Dispatches to the appropriate API method based on args.
   *
   * @param args - Command arguments (e.g., ['pack', 'list'])
   * @param write - Optional output callback
   */
  async execute(args: string[], write?: CliBridgeWriter): Promise<CliBridgeResult> {
    const outputWriter = write ?? (() => {});
    if (args.length === 0) {
      return { success: false, error: 'No command specified' };
    }

    const [command, subcommand, ...rest] = args;
    const api = this._api;

    try {
      switch (command) {
        case 'pack': {
          if (subcommand === 'list' || subcommand === 'ls') {
            const data = await api.pack.list();
            outputWriter(JSON.stringify(data, null, 2) + '\n');
            return { success: true, data };
          }
          if (subcommand === 'info') {
            if (!rest[0]) return { success: false, error: 'Pack name required' };
            const data = await api.pack.info(rest[0]);
            outputWriter(JSON.stringify(data, null, 2) + '\n');
            return { success: true, data };
          }
          return { success: false, error: `Unknown pack subcommand: ${subcommand}` };
        }
        case 'pod': {
          if (subcommand === 'list' || subcommand === 'ls') {
            const data = await api.pod.list();
            outputWriter(JSON.stringify(data, null, 2) + '\n');
            return { success: true, data };
          }
          if (subcommand === 'status') {
            if (!rest[0]) return { success: false, error: 'Pod ID required' };
            const data = await api.pod.status(rest[0]);
            outputWriter(JSON.stringify(data, null, 2) + '\n');
            return { success: true, data };
          }
          return { success: false, error: `Unknown pod subcommand: ${subcommand}` };
        }
        default:
          return { success: false, error: `Unknown command: ${command}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      outputWriter(`Error: ${msg}\n`);
      return { success: false, error: msg };
    }
  }

  /**
   * Download a volume as a zip archive via context.starkAPI
   */
  async downloadVolume(volumeName: string, nodeNameOrId: string): Promise<Uint8Array> {
    return this._api.volume.downloadAsZip(volumeName, nodeNameOrId);
  }

  /**
   * Archive a path within a volume via context.starkAPI
   */
  async archiveVolumePath(
    nodeNameOrId: string,
    volumeName: string,
    archivePath: string,
  ): Promise<Uint8Array> {
    return this._api.volume.archivePathAsZip(nodeNameOrId, volumeName, archivePath);
  }
}

/**
 * Create a CliBridge from a StarkAPI (typically from context.starkAPI)
 */
export function createCliBridge(api: StarkAPI): CliBridge {
  return new CliBridge(api);
}
