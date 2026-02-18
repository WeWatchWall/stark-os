/**
 * Complete Stark CLI Definition
 *
 * Assembles all command definitions into a single CLI definition
 * that can be used to build both Node.js and browser CLIs.
 * @module @stark-o/shared/cli/definition
 */

import type { CliDefinition } from './types.js';
import { authCommandDef } from './commands/auth.js';
import { packCommandDef } from './commands/pack.js';
import { nodeCommandDef } from './commands/node.js';
import { podCommandDef } from './commands/pod.js';
import { serviceCommandDef } from './commands/service.js';
import { namespaceCommandDef } from './commands/namespace.js';
import { secretCommandDef } from './commands/secret.js';
import { volumeCommandDef } from './commands/volume.js';
import { chaosCommandDef } from './commands/chaos.js';
import { networkCommandDef } from './commands/network.js';
import { serverCommandDef } from './commands/server.js';
import { serverConfigCommandDef } from './commands/server-config.js';

/**
 * Complete CLI definition for the Stark Orchestrator
 */
export const starkCliDefinition: CliDefinition = {
  name: 'stark',
  version: '0.0.1',
  description: `Stark Orchestrator CLI

A command-line interface for managing distributed pack services
across Node.js servers and browser runtimes.

Commands:
  auth        Authentication commands (login, logout, whoami)
  pack        Pack management (register, list, versions)
  node        Node management (list, status)
  pod         Pod management (create, list, status, rollback)
  service     Service management (create, list, scale, pause)
  namespace   Namespace management (create, list, delete)
  chaos       Chaos testing commands (fault injection, partitions)
  secret      Secret management (create, list, get, update, delete)
  volume      Volume management (create, list, download)

Examples:
  $ stark auth login
  $ stark pack list
  $ stark pod create my-pack --node my-node
  $ stark service create --pack my-pack --replicas 3
  $ stark node list --status healthy`,

  globalOptions: [
    { flags: '-o, --output <format>', description: 'Output format: json, table, plain', defaultValue: 'table' },
    { flags: '--api-url <url>', description: 'API server URL' },
    { flags: '--no-color', description: 'Disable colored output' },
    { flags: '-k, --insecure', description: 'Skip TLS certificate verification (for self-signed certs)' },
  ],

  commands: [
    authCommandDef,
    packCommandDef,
    nodeCommandDef,
    podCommandDef,
    serviceCommandDef,
    namespaceCommandDef,
    secretCommandDef,
    volumeCommandDef,
    chaosCommandDef,
    networkCommandDef,
    serverCommandDef,
    serverConfigCommandDef,
  ],
};
