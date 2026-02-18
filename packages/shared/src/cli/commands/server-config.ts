/**
 * CLI Command Definitions — Server Config
 *
 * Data-driven definition for the `server-config` command group.
 * @module @stark-o/shared/cli/commands/server-config
 */

import type { CliCommandDef } from '../types.js';

export const serverConfigCommandDef: CliCommandDef = {
  name: 'server-config',
  description: 'Server configuration commands (admin only)',
  subcommands: [
    {
      name: 'get',
      description: 'Get current server configuration',
      apiMethod: 'GET',
      apiPath: '/api/config',
      requiresAuth: true,
    },
    {
      name: 'set',
      description: 'Update server configuration',
      options: [
        { flags: '--enable-registration', description: 'Enable public registration' },
        { flags: '--disable-registration', description: 'Disable public registration' },
      ],
      apiMethod: 'PATCH',
      apiPath: '/api/config',
      requiresAuth: true,
    },
  ],
};
