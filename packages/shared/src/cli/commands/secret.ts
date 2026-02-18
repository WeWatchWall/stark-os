/**
 * CLI Command Definitions — Secret
 *
 * Data-driven definition for the `secret` command group.
 * @module @stark-o/shared/cli/commands/secret
 */

import type { CliCommandDef } from '../types.js';

export const secretCommandDef: CliCommandDef = {
  name: 'secret',
  description: 'Secret management commands',
  subcommands: [
    {
      name: 'create',
      argument: '<name>',
      argumentDescription: 'Secret name',
      description: 'Create a secret',
      options: [
        { flags: '-n, --namespace <namespace>', description: 'Namespace', defaultValue: 'default' },
        { flags: '--type <type>', description: 'Secret type (opaque, tls, docker-registry)', defaultValue: 'opaque' },
        { flags: '--from-literal <key=value...>', description: 'Key-value pairs' },
        { flags: '--from-file <key=path...>', description: 'File contents' },
        { flags: '--inject <mode>', description: 'Injection mode (env, volume)', defaultValue: 'env' },
      ],
      apiMethod: 'POST',
      apiPath: '/api/secrets',
      requiresAuth: true,
    },
    {
      name: 'list',
      alias: 'ls',
      description: 'List secrets',
      options: [
        { flags: '-n, --namespace <namespace>', description: 'Filter by namespace' },
      ],
      apiMethod: 'GET',
      apiPath: '/api/secrets',
      requiresAuth: true,
    },
    {
      name: 'get',
      argument: '<name>',
      argumentDescription: 'Secret name',
      description: 'Show secret metadata (never values)',
      options: [
        { flags: '-n, --namespace <namespace>', description: 'Namespace', defaultValue: 'default' },
      ],
      apiMethod: 'GET',
      apiPath: '/api/secrets/name/:name',
      requiresAuth: true,
    },
    {
      name: 'update',
      argument: '<name>',
      argumentDescription: 'Secret name',
      description: 'Update a secret',
      options: [
        { flags: '-n, --namespace <namespace>', description: 'Namespace', defaultValue: 'default' },
        { flags: '--from-literal <key=value...>', description: 'Key-value pairs to update' },
        { flags: '--from-file <key=path...>', description: 'File contents to update' },
        { flags: '--inject <mode>', description: 'Change injection mode' },
      ],
      apiMethod: 'PATCH',
      apiPath: '/api/secrets/:id',
      requiresAuth: true,
    },
    {
      name: 'delete',
      argument: '<name>',
      argumentDescription: 'Secret name',
      alias: 'rm',
      description: 'Delete a secret',
      options: [
        { flags: '-n, --namespace <namespace>', description: 'Namespace', defaultValue: 'default' },
        { flags: '-f, --force', description: 'Skip confirmation prompt' },
      ],
      apiMethod: 'DELETE',
      apiPath: '/api/secrets/:id',
      requiresAuth: true,
    },
  ],
};
