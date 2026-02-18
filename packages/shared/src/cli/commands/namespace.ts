/**
 * CLI Command Definitions — Namespace
 *
 * Data-driven definition for the `namespace` command group.
 * @module @stark-o/shared/cli/commands/namespace
 */

import type { CliCommandDef } from '../types.js';

export const namespaceCommandDef: CliCommandDef = {
  name: 'namespace',
  alias: 'ns',
  description: 'Namespace management commands',
  subcommands: [
    {
      name: 'create',
      argument: '<name>',
      argumentDescription: 'Namespace name',
      description: 'Create a namespace',
      options: [
        { flags: '-l, --label <label...>', description: 'Labels (format: key=value)' },
        { flags: '--cpu-limit <millicores>', description: 'CPU quota in millicores' },
        { flags: '--memory-limit <mb>', description: 'Memory quota in MB' },
        { flags: '--pod-limit <count>', description: 'Maximum pods' },
      ],
      apiMethod: 'POST',
      apiPath: '/api/namespaces',
      requiresAuth: true,
    },
    {
      name: 'list',
      alias: 'ls',
      description: 'List all namespaces',
      apiMethod: 'GET',
      apiPath: '/api/namespaces',
      requiresAuth: true,
    },
    {
      name: 'get',
      argument: '<name>',
      argumentDescription: 'Namespace name',
      description: 'Show namespace details',
      apiMethod: 'GET',
      apiPath: '/api/namespaces/name/:name',
      requiresAuth: true,
    },
    {
      name: 'delete',
      argument: '<name>',
      argumentDescription: 'Namespace name',
      alias: 'rm',
      description: 'Delete a namespace',
      options: [
        { flags: '-f, --force', description: 'Skip confirmation prompt' },
      ],
      apiMethod: 'DELETE',
      apiPath: '/api/namespaces/:id',
      requiresAuth: true,
    },
    {
      name: 'quota',
      argument: '<name>',
      argumentDescription: 'Namespace name',
      description: 'Show namespace resource quotas and usage',
      apiMethod: 'GET',
      apiPath: '/api/namespaces/name/:name',
      requiresAuth: true,
    },
    {
      name: 'use',
      argument: '<name>',
      argumentDescription: 'Namespace name',
      description: 'Set default namespace for CLI',
      requiresAuth: false,
    },
    {
      name: 'current',
      description: 'Show current default namespace',
      requiresAuth: false,
    },
  ],
};
