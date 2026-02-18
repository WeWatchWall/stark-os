/**
 * CLI Command Definitions — Pack
 *
 * Data-driven definition for the `pack` command group.
 * @module @stark-o/shared/cli/commands/pack
 */

import type { CliCommandDef } from '../types.js';

export const packCommandDef: CliCommandDef = {
  name: 'pack',
  description: 'Pack management commands',
  subcommands: [
    {
      name: 'bundle',
      argument: '<source>',
      argumentDescription: 'Source directory to bundle',
      description: 'Bundle a project directory into a pack',
      options: [
        { flags: '-o, --output <file>', description: 'Output bundle file path', defaultValue: 'bundle.js' },
        { flags: '--name <name>', description: 'Pack name override' },
      ],
      requiresAuth: false,
    },
    {
      name: 'register',
      argument: '<bundle>',
      argumentDescription: 'Bundle file to register',
      description: 'Register a pack bundle with the orchestrator',
      options: [
        { flags: '--name <name>', description: 'Pack name' },
        { flags: '--ver <version>', description: 'Pack version', defaultValue: '1.0.0' },
        { flags: '-r, --runtime <runtime>', description: 'Runtime tag (node, browser)', defaultValue: 'node' },
        { flags: '-d, --description <desc>', description: 'Pack description' },
      ],
      apiMethod: 'POST',
      apiPath: '/api/packs',
      requiresAuth: true,
    },
    {
      name: 'list',
      alias: 'ls',
      description: 'List registered packs',
      options: [
        { flags: '-p, --page <page>', description: 'Page number' },
        { flags: '--limit <limit>', description: 'Results per page' },
      ],
      apiMethod: 'GET',
      apiPath: '/api/packs',
      requiresAuth: true,
    },
    {
      name: 'versions',
      argument: '<name>',
      argumentDescription: 'Pack name',
      description: 'List versions of a pack',
      apiMethod: 'GET',
      apiPath: '/api/packs/name/:name/versions',
      requiresAuth: true,
    },
    {
      name: 'info',
      argument: '<name>',
      argumentDescription: 'Pack name',
      description: 'Show pack details',
      options: [
        { flags: '--ver <version>', description: 'Specific version' },
      ],
      apiMethod: 'GET',
      apiPath: '/api/packs/name/:name',
      requiresAuth: true,
    },
    {
      name: 'delete',
      argument: '<name>',
      argumentDescription: 'Pack name',
      alias: 'rm',
      description: 'Delete a pack',
      options: [
        { flags: '-f, --force', description: 'Skip confirmation prompt' },
      ],
      apiMethod: 'DELETE',
      apiPath: '/api/packs/name/:name',
      requiresAuth: true,
    },
  ],
};
