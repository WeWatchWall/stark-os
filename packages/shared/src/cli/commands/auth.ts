/**
 * CLI Command Definitions — Auth
 *
 * Data-driven definition for the `auth` command group.
 * @module @stark-o/shared/cli/commands/auth
 */

import type { CliCommandDef } from '../types.js';

export const authCommandDef: CliCommandDef = {
  name: 'auth',
  description: 'Authentication commands',
  subcommands: [
    {
      name: 'login',
      description: 'Login to the orchestrator',
      options: [
        { flags: '-e, --email <email>', description: 'User email' },
        { flags: '-p, --password <password>', description: 'User password' },
      ],
      apiMethod: 'POST',
      apiPath: '/auth/login',
      requiresAuth: false,
    },
    {
      name: 'logout',
      description: 'Logout and clear credentials',
      requiresAuth: false,
    },
    {
      name: 'whoami',
      description: 'Show current user information',
      requiresAuth: true,
    },
    {
      name: 'status',
      description: 'Show authentication status',
      requiresAuth: false,
    },
    {
      name: 'setup',
      description: 'Initialize server and create admin user',
      options: [
        { flags: '-e, --email <email>', description: 'Admin email' },
        { flags: '-p, --password <password>', description: 'Admin password' },
      ],
      apiMethod: 'POST',
      apiPath: '/auth/setup',
      requiresAuth: false,
    },
    {
      name: 'register',
      description: 'Register a new user (when public registration is enabled)',
      options: [
        { flags: '-e, --email <email>', description: 'User email' },
        { flags: '-p, --password <password>', description: 'User password' },
      ],
      apiMethod: 'POST',
      apiPath: '/auth/register',
      requiresAuth: false,
    },
    {
      name: 'add-user',
      description: 'Create a new user (admin only)',
      options: [
        { flags: '-e, --email <email>', description: 'User email' },
        { flags: '-p, --password <password>', description: 'User password' },
        { flags: '-r, --role <role>', description: 'User role', defaultValue: 'user' },
      ],
      apiMethod: 'POST',
      apiPath: '/auth/setup/users',
      requiresAuth: true,
    },
    {
      name: 'list-users',
      description: 'List all users (admin only)',
      apiMethod: 'GET',
      apiPath: '/auth/users',
      requiresAuth: true,
    },
  ],
};
