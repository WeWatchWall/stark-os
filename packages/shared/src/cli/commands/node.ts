/**
 * CLI Command Definitions — Node
 *
 * Data-driven definition for the `node` command group.
 * @module @stark-o/shared/cli/commands/node
 */

import type { CliCommandDef } from '../types.js';

export const nodeCommandDef: CliCommandDef = {
  name: 'node',
  description: 'Node management commands',
  subcommands: [
    {
      name: 'list',
      alias: 'ls',
      description: 'List all nodes',
      options: [
        { flags: '-s, --status <status>', description: 'Filter by status (healthy, unhealthy, offline)' },
        { flags: '-r, --runtime <runtime>', description: 'Filter by runtime type (node, browser)' },
        { flags: '-l, --label <selector...>', description: 'Filter by label selector (e.g., env=prod)' },
        { flags: '-p, --page <page>', description: 'Page number' },
        { flags: '--limit <limit>', description: 'Results per page' },
      ],
      apiMethod: 'GET',
      apiPath: '/api/nodes',
      requiresAuth: true,
    },
    {
      name: 'status',
      argument: '<name>',
      argumentDescription: 'Node name or UUID',
      alias: 'info',
      description: 'Show detailed status of a node',
      apiMethod: 'GET',
      apiPath: '/api/nodes/name/:name',
      requiresAuth: true,
    },
    {
      name: 'delete',
      argument: '<name>',
      argumentDescription: 'Node name or UUID',
      alias: 'rm',
      description: 'Delete a node by name',
      options: [
        { flags: '-f, --force', description: 'Skip confirmation prompt' },
      ],
      apiMethod: 'DELETE',
      apiPath: '/api/nodes/:id',
      requiresAuth: true,
    },
    {
      name: 'update',
      argument: '<name>',
      argumentDescription: 'Node name or UUID',
      description: 'Update node properties (labels, taints, schedulability)',
      options: [
        { flags: '-l, --label <label...>', description: 'Add or update labels (format: key=value)' },
        { flags: '--remove-label <key...>', description: 'Remove labels by key' },
        { flags: '--taint <taint...>', description: 'Add or update taints (format: key=value:effect or key:effect)' },
        { flags: '--remove-taint <key...>', description: 'Remove taints by key' },
        { flags: '--unschedulable', description: 'Mark node as unschedulable (cordon)' },
        { flags: '--schedulable', description: 'Mark node as schedulable (uncordon)' },
      ],
      apiMethod: 'PATCH',
      apiPath: '/api/nodes/:id',
      requiresAuth: true,
    },
    {
      name: 'watch',
      description: 'Watch node status in real-time',
      options: [
        { flags: '-i, --interval <seconds>', description: 'Refresh interval in seconds', defaultValue: '5' },
      ],
      apiMethod: 'GET',
      apiPath: '/api/nodes',
      requiresAuth: true,
    },
    {
      name: 'agent',
      description: 'Node agent commands',
      subcommands: [
        {
          name: 'start',
          description: 'Start a node agent to connect to the orchestrator',
          options: [
            { flags: '-u, --url <url>', description: 'Orchestrator WebSocket URL', defaultValue: 'wss://localhost:443/ws', envVar: 'STARK_ORCHESTRATOR_URL' },
            { flags: '-n, --name <name>', description: 'Unique node name', envVar: 'STARK_NODE_NAME' },
            { flags: '-t, --token <token>', description: 'Authentication token', envVar: 'STARK_AUTH_TOKEN' },
            { flags: '-e, --email <email>', description: 'Login email (alternative to token)', envVar: 'STARK_EMAIL' },
            { flags: '-p, --password <password>', description: 'Login password (with email)', envVar: 'STARK_PASSWORD' },
            { flags: '-l, --label <label...>', description: 'Node labels (format: key=value)' },
            { flags: '--taint <taint...>', description: 'Node taints (format: key=value:effect)' },
            { flags: '--cpu <millicores>', description: 'Allocatable CPU in millicores', defaultValue: '1000' },
            { flags: '--memory <mb>', description: 'Allocatable memory in MB', defaultValue: '1024' },
            { flags: '--pods <count>', description: 'Maximum concurrent pods', defaultValue: '10' },
            { flags: '--heartbeat <seconds>', description: 'Heartbeat interval in seconds', defaultValue: '15' },
          ],
          requiresAuth: true,
        },
      ],
    },
  ],
};
