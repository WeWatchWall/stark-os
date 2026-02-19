/**
 * Browser CLI Bridge
 *
 * Exposes the browser API to pods running in the browser runtime.
 * Pods can call API operations through this bridge.
 * Uses the internal API module directly (no external browser-cli dependency).
 * @module @stark-o/browser-runtime/cli-bridge
 */

import { createStarkAPI, type StarkAPI } from './api/api.js';
import { downloadVolume, archiveVolumePath } from './api/volume.js';

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
 * Uses the internal browser-runtime API module directly.
 */
export class CliBridge {
  private _api: StarkAPI | null = null;

  /**
   * Get or create the StarkAPI instance
   */
  private getApi(): StarkAPI {
    if (!this._api) {
      this._api = createStarkAPI();
    }
    return this._api;
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
    const api = this.getApi();

    try {
      switch (command) {
        case 'pack': {
          if (subcommand === 'list' || subcommand === 'ls') {
            const data = await api.pack.list();
            outputWriter(JSON.stringify(data, null, 2) + '\n');
            return { success: true, data };
          }
          if (subcommand === 'info') {
            const data = await api.pack.info(rest[0]!);
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
            const data = await api.pod.status(rest[0]!);
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
   * Download a volume as a zip archive
   */
  async downloadVolume(volumeName: string, nodeNameOrId: string): Promise<Uint8Array> {
    return downloadVolume(volumeName, nodeNameOrId);
  }

  /**
   * Archive a path within a volume
   */
  async archiveVolumePath(
    nodeNameOrId: string,
    volumeName: string,
    archivePath: string,
  ): Promise<Uint8Array> {
    return archiveVolumePath(nodeNameOrId, volumeName, archivePath);
  }
}

/**
 * Singleton CLI bridge instance
 */
let defaultBridge: CliBridge | null = null;

/**
 * Get the default CLI bridge instance
 */
export function getCliBridge(): CliBridge {
  if (!defaultBridge) {
    defaultBridge = new CliBridge();
  }
  return defaultBridge;
}
