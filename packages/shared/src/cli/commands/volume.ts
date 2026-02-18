/**
 * CLI Command Definitions — Volume
 *
 * Data-driven definition for the `volume` command group.
 * @module @stark-o/shared/cli/commands/volume
 */

import type { CliCommandDef } from '../types.js';

export const volumeCommandDef: CliCommandDef = {
  name: 'volume',
  description: 'Volume management commands',
  subcommands: [
    {
      name: 'create',
      argument: '[name]',
      argumentDescription: 'Volume name',
      description: 'Create a named volume on a node',
      options: [
        { flags: '--name <name>', description: 'Volume name' },
        { flags: '-n, --node <nameOrId>', description: 'Target node (name or UUID)', required: true },
      ],
      apiMethod: 'POST',
      apiPath: '/api/volumes',
      requiresAuth: true,
    },
    {
      name: 'list',
      alias: 'ls',
      description: 'List volumes',
      options: [
        { flags: '-n, --node <nameOrId>', description: 'Filter by node (name or UUID)' },
      ],
      apiMethod: 'GET',
      apiPath: '/api/volumes',
      requiresAuth: true,
    },
    {
      name: 'download',
      argument: '[name]',
      argumentDescription: 'Volume name',
      description: 'Download volume contents as an archive',
      options: [
        { flags: '--name <name>', description: 'Volume name' },
        { flags: '-n, --node <nameOrId>', description: 'Node where the volume resides (name or UUID)', required: true },
        { flags: '-O, --out-file <path>', description: 'Output file path', required: true },
      ],
      apiMethod: 'GET',
      apiPath: '/api/volumes/name/:name/download',
      requiresAuth: true,
    },
  ],
};
