/**
 * Volume Commands
 *
 * Volume management commands: create, list, download
 * @module @stark-o/cli/commands/volume
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createApiClient, requireAuth } from '../config.js';
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

    const volumeRequest = {
      name,
      nodeId: options.node,
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
      params.set('nodeId', options.node);
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
 * Download command handler — exports volume contents as a tar archive
 */
async function downloadHandler(
  nameArg: string | undefined,
  options: {
    name?: string;
    node: string;
    output: string;
  }
): Promise<void> {
  const name = nameArg || options.name;

  if (!name) {
    error('Volume name is required');
    process.exit(1);
  }

  requireAuth();

  info(`Downloading volume '${name}' from node ${options.node} to ${options.output}`);

  try {
    const api = createApiClient();
    const params = new URLSearchParams({ nodeId: options.node });
    const url = `/api/volumes/name/${encodeURIComponent(name)}/download?${params.toString()}`;
    const response = await api.get(url);

    if (!response.ok) {
      const result = (await response.json().catch(() => ({ success: false }))) as ApiResponse<unknown>;
      error('Failed to download volume', result.error);
      process.exit(1);
    }

    // Write the response body to the output file
    const { writeFileSync } = await import('fs');
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(options.output, buffer);

    success(`Volume '${name}' downloaded to ${options.output}`);
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
    .requiredOption('-n, --node <nodeId>', 'Target node ID')
    .action(createHandler);

  // List volumes
  volume
    .command('list')
    .alias('ls')
    .description('List volumes')
    .option('-n, --node <nodeId>', 'Filter by node')
    .action(listHandler);

  // Download volume
  volume
    .command('download [name]')
    .description('Download volume contents as a tar archive')
    .option('--name <name>', 'Volume name')
    .requiredOption('-n, --node <nodeId>', 'Node ID where the volume resides')
    .requiredOption('-o, --output <path>', 'Output file path')
    .action(downloadHandler);

  return volume;
}
