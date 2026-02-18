/**
 * CLI Command Definitions — Pod
 *
 * Data-driven definition for the `pod` command group.
 * @module @stark-o/shared/cli/commands/pod
 */

import type { CliCommandDef } from '../types.js';

export const podCommandDef: CliCommandDef = {
  name: 'pod',
  description: 'Pod management commands',
  subcommands: [
    {
      name: 'create',
      argument: '[pack]',
      argumentDescription: 'Pack name to deploy',
      alias: 'run',
      description: 'Create and deploy a pod',
      options: [
        { flags: '--pack <name>', description: 'Pack name (alternative to positional)' },
        { flags: '--ver <version>', description: 'Pack version' },
        { flags: '-n, --namespace <namespace>', description: 'Target namespace', defaultValue: 'default' },
        { flags: '--node <nameOrId>', description: 'Target node (name or UUID)' },
        { flags: '-r, --replicas <count>', description: 'Number of replicas', defaultValue: '1' },
        { flags: '-l, --label <label...>', description: 'Pod labels (format: key=value)' },
        { flags: '--toleration <toleration...>', description: 'Tolerations (format: key=value:effect)' },
        { flags: '--volume <volume...>', description: 'Volume mounts (format: name:mountPath)' },
        { flags: '--secret <secret...>', description: 'Secrets to inject' },
      ],
      apiMethod: 'POST',
      apiPath: '/api/pods',
      requiresAuth: true,
    },
    {
      name: 'list',
      alias: 'ls',
      description: 'List pods',
      options: [
        { flags: '-n, --namespace <namespace>', description: 'Filter by namespace' },
        { flags: '-s, --status <status>', description: 'Filter by status' },
        { flags: '--node <nameOrId>', description: 'Filter by node' },
        { flags: '-p, --page <page>', description: 'Page number' },
        { flags: '--limit <limit>', description: 'Results per page' },
      ],
      apiMethod: 'GET',
      apiPath: '/api/pods',
      requiresAuth: true,
    },
    {
      name: 'status',
      argument: '<podId>',
      argumentDescription: 'Pod ID',
      description: 'Show detailed pod status',
      apiMethod: 'GET',
      apiPath: '/api/pods/:id',
      requiresAuth: true,
    },
    {
      name: 'rollback',
      argument: '<podId>',
      argumentDescription: 'Pod ID',
      description: 'Rollback pod to previous version',
      apiMethod: 'POST',
      apiPath: '/api/pods/:id/rollback',
      requiresAuth: true,
    },
    {
      name: 'history',
      argument: '<podId>',
      argumentDescription: 'Pod ID',
      description: 'Show pod change history',
      apiMethod: 'GET',
      apiPath: '/api/pods/:id/history',
      requiresAuth: true,
    },
    {
      name: 'stop',
      argument: '<podId>',
      argumentDescription: 'Pod ID',
      description: 'Stop a running pod',
      apiMethod: 'POST',
      apiPath: '/api/pods/:id/stop',
      requiresAuth: true,
    },
    {
      name: 'logs',
      argument: '<podId>',
      argumentDescription: 'Pod ID',
      description: 'Stream pod logs',
      options: [
        { flags: '-f, --follow', description: 'Follow log output' },
        { flags: '--tail <lines>', description: 'Number of lines to show', defaultValue: '100' },
      ],
      apiMethod: 'GET',
      apiPath: '/api/pods/:id/logs',
      requiresAuth: true,
    },
  ],
};
