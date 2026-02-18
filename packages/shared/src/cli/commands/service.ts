/**
 * CLI Command Definitions — Service
 *
 * Data-driven definition for the `service` command group.
 * @module @stark-o/shared/cli/commands/service
 */

import type { CliCommandDef } from '../types.js';

export const serviceCommandDef: CliCommandDef = {
  name: 'service',
  alias: 'deploy',
  description: 'Service management commands',
  subcommands: [
    {
      name: 'create',
      description: 'Create a service',
      options: [
        { flags: '--pack <name>', description: 'Pack name', required: true },
        { flags: '--ver <version>', description: 'Pack version' },
        { flags: '-n, --namespace <namespace>', description: 'Target namespace', defaultValue: 'default' },
        { flags: '-r, --replicas <count>', description: 'Number of replicas (0 for DaemonSet)', defaultValue: '1' },
        { flags: '--visibility <vis>', description: 'Visibility (public, private, system)', defaultValue: 'private' },
        { flags: '-l, --label <label...>', description: 'Service labels' },
        { flags: '--node-selector <selector...>', description: 'Node selectors' },
        { flags: '--toleration <toleration...>', description: 'Tolerations' },
        { flags: '--secret <secret...>', description: 'Secrets to inject' },
        { flags: '--volume <volume...>', description: 'Volume mounts' },
        { flags: '--cpu-request <millicores>', description: 'CPU request in millicores' },
        { flags: '--memory-request <mb>', description: 'Memory request in MB' },
      ],
      apiMethod: 'POST',
      apiPath: '/api/services',
      requiresAuth: true,
    },
    {
      name: 'list',
      alias: 'ls',
      description: 'List services',
      options: [
        { flags: '-n, --namespace <namespace>', description: 'Filter by namespace' },
        { flags: '-s, --status <status>', description: 'Filter by status' },
        { flags: '-p, --page <page>', description: 'Page number' },
        { flags: '--limit <limit>', description: 'Results per page' },
      ],
      apiMethod: 'GET',
      apiPath: '/api/services',
      requiresAuth: true,
    },
    {
      name: 'status',
      argument: '<name>',
      argumentDescription: 'Service name',
      description: 'Show service status',
      apiMethod: 'GET',
      apiPath: '/api/services/name/:name',
      requiresAuth: true,
    },
    {
      name: 'scale',
      argument: '<name>',
      argumentDescription: 'Service name',
      description: 'Scale a service',
      options: [
        { flags: '-r, --replicas <count>', description: 'Target replica count', required: true },
        { flags: '-n, --namespace <namespace>', description: 'Namespace', defaultValue: 'default' },
      ],
      apiMethod: 'POST',
      apiPath: '/api/services/:id/scale',
      requiresAuth: true,
    },
    {
      name: 'set-visibility',
      argument: '<name>',
      argumentDescription: 'Service name',
      description: 'Set service visibility',
      options: [
        { flags: '--visibility <vis>', description: 'Visibility (public, private, system)', required: true },
        { flags: '-n, --namespace <namespace>', description: 'Namespace', defaultValue: 'default' },
      ],
      apiMethod: 'PATCH',
      apiPath: '/api/services/:id',
      requiresAuth: true,
    },
    {
      name: 'expose',
      argument: '<name>',
      argumentDescription: 'Service name',
      description: 'Enable ingress access for a service',
      options: [
        { flags: '-n, --namespace <namespace>', description: 'Namespace', defaultValue: 'default' },
      ],
      apiMethod: 'POST',
      apiPath: '/api/services/:id/expose',
      requiresAuth: true,
    },
    {
      name: 'unexpose',
      argument: '<name>',
      argumentDescription: 'Service name',
      description: 'Disable ingress access for a service',
      options: [
        { flags: '-n, --namespace <namespace>', description: 'Namespace', defaultValue: 'default' },
      ],
      apiMethod: 'POST',
      apiPath: '/api/services/:id/unexpose',
      requiresAuth: true,
    },
    {
      name: 'pause',
      argument: '<name>',
      argumentDescription: 'Service name',
      description: 'Pause service reconciliation',
      options: [
        { flags: '-n, --namespace <namespace>', description: 'Namespace', defaultValue: 'default' },
      ],
      apiMethod: 'POST',
      apiPath: '/api/services/:id/pause',
      requiresAuth: true,
    },
    {
      name: 'resume',
      argument: '<name>',
      argumentDescription: 'Service name',
      description: 'Resume service reconciliation',
      options: [
        { flags: '-n, --namespace <namespace>', description: 'Namespace', defaultValue: 'default' },
      ],
      apiMethod: 'POST',
      apiPath: '/api/services/:id/resume',
      requiresAuth: true,
    },
    {
      name: 'delete',
      argument: '<name>',
      argumentDescription: 'Service name',
      alias: 'rm',
      description: 'Delete a service',
      options: [
        { flags: '-n, --namespace <namespace>', description: 'Namespace', defaultValue: 'default' },
        { flags: '-f, --force', description: 'Skip confirmation prompt' },
      ],
      apiMethod: 'DELETE',
      apiPath: '/api/services/:id',
      requiresAuth: true,
    },
  ],
};
