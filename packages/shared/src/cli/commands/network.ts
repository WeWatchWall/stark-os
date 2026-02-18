/**
 * CLI Command Definitions — Network
 *
 * Data-driven definition for the `network` command group.
 * @module @stark-o/shared/cli/commands/network
 */

import type { CliCommandDef } from '../types.js';

export const networkCommandDef: CliCommandDef = {
  name: 'network',
  description: 'Network policy and service registry commands',
  subcommands: [
    {
      name: 'allow',
      description: 'Create an allow network policy',
      options: [
        { flags: '--from <service>', description: 'Source service', required: true },
        { flags: '--to <service>', description: 'Target service', required: true },
        { flags: '-n, --namespace <namespace>', description: 'Namespace', defaultValue: 'default' },
      ],
      apiMethod: 'POST',
      apiPath: '/api/network/policies',
      requiresAuth: true,
    },
    {
      name: 'deny',
      description: 'Create a deny network policy',
      options: [
        { flags: '--from <service>', description: 'Source service', required: true },
        { flags: '--to <service>', description: 'Target service', required: true },
        { flags: '-n, --namespace <namespace>', description: 'Namespace', defaultValue: 'default' },
      ],
      apiMethod: 'POST',
      apiPath: '/api/network/policies',
      requiresAuth: true,
    },
    {
      name: 'remove',
      argument: '<id>',
      argumentDescription: 'Policy ID',
      description: 'Remove a network policy',
      apiMethod: 'DELETE',
      apiPath: '/api/network/policies/:id',
      requiresAuth: true,
    },
    {
      name: 'policies',
      alias: 'list',
      description: 'List network policies',
      options: [
        { flags: '-n, --namespace <namespace>', description: 'Filter by namespace' },
      ],
      apiMethod: 'GET',
      apiPath: '/api/network/policies',
      requiresAuth: true,
    },
    {
      name: 'registry',
      description: 'Show service registry',
      apiMethod: 'GET',
      apiPath: '/api/network/registry',
      requiresAuth: true,
    },
  ],
};
