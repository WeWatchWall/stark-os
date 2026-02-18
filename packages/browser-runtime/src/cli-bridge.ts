/**
 * Browser CLI Bridge
 *
 * Exposes the browser-cli to pods running in the browser runtime.
 * Pods can call CLI commands through this bridge.
 * @module @stark-o/browser-runtime/cli-bridge
 */

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
 * CLI bridge that exposes browser-cli to pods.
 * Dynamically imports @stark-o/browser-cli to avoid circular dependencies.
 */
export class CliBridge {
  private cliModule: {
    executeCommand: (args: string[], write: CliBridgeWriter) => Promise<CliBridgeResult>;
    downloadVolume: (volumeName: string, nodeNameOrId: string) => Promise<Uint8Array>;
    archiveVolumePath: (nodeNameOrId: string, volumeName: string, archivePath: string) => Promise<Uint8Array>;
  } | null = null;

  /**
   * Lazily load the browser-cli module
   */
  private async loadCli(): Promise<NonNullable<typeof this.cliModule>> {
    if (!this.cliModule) {
      const mod = await import('@stark-o/browser-cli');
      this.cliModule = {
        executeCommand: mod.executeCommand,
        downloadVolume: mod.downloadVolume,
        archiveVolumePath: mod.archiveVolumePath,
      };
    }
    return this.cliModule;
  }

  /**
   * Execute a CLI command
   * @param args - Command arguments (e.g., ['pack', 'list'])
   * @param write - Optional output callback
   */
  async execute(args: string[], write?: CliBridgeWriter): Promise<CliBridgeResult> {
    const cli = await this.loadCli();
    const outputWriter = write ?? (() => {});
    return cli.executeCommand(args, outputWriter);
  }

  /**
   * Download a volume as a zip archive
   */
  async downloadVolume(volumeName: string, nodeNameOrId: string): Promise<Uint8Array> {
    const cli = await this.loadCli();
    return cli.downloadVolume(volumeName, nodeNameOrId);
  }

  /**
   * Archive a path within a volume
   */
  async archiveVolumePath(
    nodeNameOrId: string,
    volumeName: string,
    archivePath: string,
  ): Promise<Uint8Array> {
    const cli = await this.loadCli();
    return cli.archiveVolumePath(nodeNameOrId, volumeName, archivePath);
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
