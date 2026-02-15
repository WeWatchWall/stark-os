/**
 * Volume Commands
 *
 * Volume management commands: create, list, download
 * @module @stark-o/cli/commands/volume
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createApiClient, requireAuth, resolveNodeId } from '../config.js';
import {
  success,
  error,
  info,
  table,
  keyValue,
  getOutputFormat,
  relativeTime,
} from '../output.js';

/**
 * API response types
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

interface Volume {
  id: string;
  name: string;
  nodeId: string;
  createdAt: string;
  updatedAt: string;
}

interface VolumeFileEntry {
  path: string;
  data: string; // base64
}

/**
 * Create command handler
 */
async function createHandler(
  nameArg: string | undefined,
  options: {
    name?: string;
    node: string;
  }
): Promise<void> {
  const name = nameArg || options.name;

  if (!name) {
    error('Volume name is required');
    process.exit(1);
  }

  requireAuth();

  info(`Creating volume: ${name} on node ${options.node}`);

  try {
    const api = createApiClient();

    // Resolve node name to UUID if necessary
    let nodeId: string;
    try {
      nodeId = await resolveNodeId(options.node, api);
    } catch (err) {
      error(err instanceof Error ? err.message : `Node not found: ${options.node}`);
      process.exit(1);
    }

    const volumeRequest = {
      name,
      nodeId,
    };

    const response = await api.post('/api/volumes', volumeRequest);
    const result = (await response.json()) as ApiResponse<{ volume: Volume }>;

    if (!result.success || !result.data) {
      error('Failed to create volume', result.error);
      process.exit(1);
    }

    const volume = result.data.volume;

    success(`Volume '${volume.name}' created`);

    if (getOutputFormat() === 'json') {
      console.log(JSON.stringify(volume, null, 2));
      return;
    }

    console.log();
    keyValue({
      'ID': volume.id,
      'Name': volume.name,
      'Node': volume.nodeId,
      'Created': new Date(volume.createdAt).toLocaleString(),
    });

    console.log();
  } catch (err) {
    error('Failed to create volume', err instanceof Error ? { message: err.message } : undefined);
    process.exit(1);
  }
}

/**
 * List command handler
 */
async function listHandler(options: {
  node?: string;
}): Promise<void> {
  requireAuth();

  try {
    const api = createApiClient();
    const params = new URLSearchParams();

    if (options.node) {
      try {
        const nodeId = await resolveNodeId(options.node, api);
        params.set('nodeId', nodeId);
      } catch (err) {
        error(err instanceof Error ? err.message : `Node not found: ${options.node}`);
        process.exit(1);
      }
    }

    const url = `/api/volumes${params.toString() ? '?' + params.toString() : ''}`;
    const response = await api.get(url);
    const result = (await response.json()) as ApiResponse<{ volumes: Volume[] }>;

    if (!result.success || !result.data) {
      error('Failed to list volumes', result.error);
      process.exit(1);
    }

    const volumes = result.data.volumes;

    if (getOutputFormat() === 'json') {
      console.log(JSON.stringify(result.data, null, 2));
      return;
    }

    if (volumes.length === 0) {
      info('No volumes found');
      return;
    }

    console.log(chalk.bold(`\nVolumes (${volumes.length})\n`));

    table(
      volumes.map((v) => ({
        name: v.name,
        node: v.nodeId,
        age: relativeTime(v.createdAt),
      })),
      [
        { key: 'name', header: 'Name', width: 25 },
        { key: 'node', header: 'Node', width: 40 },
        { key: 'age', header: 'Age', width: 15 },
      ]
    );

    console.log();
  } catch (err) {
    error('Failed to list volumes', err instanceof Error ? { message: err.message } : undefined);
    process.exit(1);
  }
}

/**
 * Download command handler — exports volume contents as a tar archive.
 *
 * 1. Requests the file list (base64-encoded) from the orchestrator API.
 * 2. The orchestrator in turn asks the runtime via WebSocket.
 * 3. CLI receives JSON file entries and uses `tar` to write a tar archive.
 */
async function downloadHandler(
  nameArg: string | undefined,
  options: {
    name?: string;
    node: string;
    outFile: string;
  }
): Promise<void> {
  const name = nameArg || options.name;

  if (!name) {
    error('Volume name is required');
    process.exit(1);
  }

  requireAuth();

  info(`Downloading volume '${name}' from node ${options.node} to ${options.outFile}`);

  try {
    const api = createApiClient();

    // Resolve node name to UUID if necessary
    let nodeId: string;
    try {
      nodeId = await resolveNodeId(options.node, api);
    } catch (err) {
      error(err instanceof Error ? err.message : `Node not found: ${options.node}`);
      process.exit(1);
    }

    const params = new URLSearchParams({ nodeId });
    const url = `/api/volumes/name/${encodeURIComponent(name)}/download?${params.toString()}`;
    const response = await api.get(url);

    if (!response.ok) {
      const result = (await response.json().catch(() => ({ success: false }))) as ApiResponse<unknown>;
      error('Failed to download volume', result.error);
      process.exit(1);
    }

    const result = (await response.json()) as ApiResponse<{
      volumeName: string;
      files: VolumeFileEntry[];
    }>;

    if (!result.success || !result.data) {
      error('Failed to download volume', result.error);
      process.exit(1);
    }

    const { files } = result.data;

    if (files.length === 0) {
      info('Volume is empty — writing empty tar archive');
    }

    // Write files to a temporary directory, then create tar archive
    const { mkdirSync, writeFileSync, rmSync } = await import('fs');
    const { join, dirname } = await import('path');
    const { tmpdir } = await import('os');
    const { randomUUID } = await import('crypto');
    const tar = await import('tar');

    const tmpDir = join(tmpdir(), `stark-volume-${randomUUID()}`);
    const volumeDir = join(tmpDir, name);
    mkdirSync(volumeDir, { recursive: true });

    try {
      // Write decoded files to the temp directory
      for (const entry of files) {
        const filePath = join(volumeDir, entry.path);
        mkdirSync(dirname(filePath), { recursive: true });
        const content = Buffer.from(entry.data, 'base64');
        writeFileSync(filePath, content);
      }

      // Create tar archive using tar@7.5.7
      await tar.create(
        {
          file: options.outFile,
          cwd: tmpDir,
          gzip: false,
        },
        [name]
      );

      success(`Volume '${name}' downloaded to ${options.outFile} (${files.length} file(s))`);
    } finally {
      // Clean up temp directory
      rmSync(tmpDir, { recursive: true, force: true });
    }
  } catch (err) {
    error('Failed to download volume', err instanceof Error ? { message: err.message } : undefined);
    process.exit(1);
  }
}

/**
 * Creates the volume command group
 */
export function createVolumeCommand(): Command {
  const volume = new Command('volume')
    .description('Volume management commands');

  // Create volume
  volume
    .command('create [name]')
    .description('Create a named volume on a node')
    .option('--name <name>', 'Volume name')
    .requiredOption('-n, --node <nameOrId>', 'Target node (name or UUID)')
    .action(createHandler);

  // List volumes
  volume
    .command('list')
    .alias('ls')
    .description('List volumes')
    .option('-n, --node <nameOrId>', 'Filter by node (name or UUID)')
    .action(listHandler);

  // Download volume
  volume
    .command('download [name]')
    .description('Download volume contents as a tar archive')
    .option('--name <name>', 'Volume name')
    .requiredOption('-n, --node <nameOrId>', 'Node where the volume resides (name or UUID)')
    .requiredOption('-O, --out-file <path>', 'Output file path')
    .action(downloadHandler);

  return volume;
}
