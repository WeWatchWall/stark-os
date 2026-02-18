/**
 * CLI Command Definitions — Chaos
 *
 * Data-driven definition for the `chaos` command group.
 * @module @stark-o/shared/cli/commands/chaos
 */

import type { CliCommandDef } from '../types.js';

export const chaosCommandDef: CliCommandDef = {
  name: 'chaos',
  description: 'Chaos testing commands',
  subcommands: [
    {
      name: 'status',
      description: 'Show chaos testing status',
      apiMethod: 'GET',
      apiPath: '/chaos/status',
      requiresAuth: true,
    },
    {
      name: 'enable',
      description: 'Enable chaos testing mode',
      apiMethod: 'POST',
      apiPath: '/chaos/enable',
      requiresAuth: true,
    },
    {
      name: 'disable',
      description: 'Disable chaos testing mode',
      apiMethod: 'POST',
      apiPath: '/chaos/disable',
      requiresAuth: true,
    },
    {
      name: 'scenarios',
      description: 'List available chaos scenarios',
      apiMethod: 'GET',
      apiPath: '/chaos/scenarios',
      requiresAuth: true,
    },
    {
      name: 'run',
      argument: '<scenario>',
      argumentDescription: 'Scenario name',
      description: 'Execute a chaos scenario',
      options: [
        { flags: '--target <target>', description: 'Target node or service' },
        { flags: '--duration <seconds>', description: 'Duration in seconds' },
      ],
      apiMethod: 'POST',
      apiPath: '/chaos/run',
      requiresAuth: true,
    },
    {
      name: 'connections',
      description: 'List active connections',
      apiMethod: 'GET',
      apiPath: '/chaos/connections',
      requiresAuth: true,
    },
    {
      name: 'nodes',
      description: 'List chaos node state',
      apiMethod: 'GET',
      apiPath: '/chaos/nodes',
      requiresAuth: true,
    },
    {
      name: 'events',
      description: 'Show chaos events',
      options: [
        { flags: '--limit <count>', description: 'Number of events', defaultValue: '20' },
      ],
      apiMethod: 'GET',
      apiPath: '/chaos/events',
      requiresAuth: true,
    },
    {
      name: 'reset',
      description: 'Reset all chaos effects',
      apiMethod: 'POST',
      apiPath: '/chaos/reset',
      requiresAuth: true,
    },
    {
      name: 'partition',
      description: 'Network partition commands',
      subcommands: [
        {
          name: 'create',
          description: 'Create a network partition',
          options: [
            { flags: '--nodes <nodes...>', description: 'Nodes to partition' },
          ],
          apiMethod: 'POST',
          apiPath: '/chaos/partitions',
          requiresAuth: true,
        },
        {
          name: 'list',
          description: 'List active partitions',
          apiMethod: 'GET',
          apiPath: '/chaos/partitions',
          requiresAuth: true,
        },
        {
          name: 'remove',
          argument: '<id>',
          argumentDescription: 'Partition ID',
          description: 'Remove a partition',
          apiMethod: 'DELETE',
          apiPath: '/chaos/partitions/:id',
          requiresAuth: true,
        },
      ],
    },
    {
      name: 'latency',
      description: 'Latency injection commands',
      subcommands: [
        {
          name: 'inject',
          description: 'Inject latency',
          options: [
            { flags: '--target <target>', description: 'Target node' },
            { flags: '--delay <ms>', description: 'Delay in milliseconds' },
            { flags: '--jitter <ms>', description: 'Jitter in milliseconds', defaultValue: '0' },
          ],
          apiMethod: 'POST',
          apiPath: '/chaos/latency',
          requiresAuth: true,
        },
        {
          name: 'clear',
          description: 'Clear latency rules',
          options: [
            { flags: '--target <target>', description: 'Target node (omit for all)' },
          ],
          apiMethod: 'DELETE',
          apiPath: '/chaos/latency',
          requiresAuth: true,
        },
      ],
    },
    {
      name: 'message',
      description: 'Message drop/delay commands',
      subcommands: [
        {
          name: 'drop',
          description: 'Drop messages by type',
          options: [
            { flags: '--type <type>', description: 'Message type to drop' },
            { flags: '--rate <rate>', description: 'Drop rate (0-1)', defaultValue: '1' },
          ],
          apiMethod: 'POST',
          apiPath: '/chaos/message-drop',
          requiresAuth: true,
        },
        {
          name: 'clear',
          description: 'Clear message drop rules',
          apiMethod: 'DELETE',
          apiPath: '/chaos/message-drop',
          requiresAuth: true,
        },
      ],
    },
  ],
};
