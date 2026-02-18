/**
 * CLI Command Definitions — Server
 *
 * Data-driven definition for the `server` command group.
 * @module @stark-o/shared/cli/commands/server
 */

import type { CliCommandDef } from '../types.js';

export const serverCommandDef: CliCommandDef = {
  name: 'server',
  description: 'Server management commands',
  subcommands: [
    {
      name: 'start',
      description: 'Start the orchestrator server',
      options: [
        { flags: '-p, --port <port>', description: 'Server port', defaultValue: '443' },
        { flags: '-h, --host <host>', description: 'Server host', defaultValue: '0.0.0.0' },
        { flags: '--supabase-url <url>', description: 'Supabase URL', envVar: 'SUPABASE_URL' },
        { flags: '--supabase-key <key>', description: 'Supabase anon key', envVar: 'SUPABASE_ANON_KEY' },
        { flags: '--supabase-service-key <key>', description: 'Supabase service role key', envVar: 'SUPABASE_SERVICE_ROLE_KEY' },
        { flags: '--expose-http', description: 'Expose HTTP (non-TLS) endpoint' },
      ],
      requiresAuth: false,
    },
  ],
};
