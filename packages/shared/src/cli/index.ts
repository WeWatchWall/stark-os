/**
 * Shared CLI Data
 *
 * Data-driven CLI command definitions used by both
 * Node.js CLI (packages/cli) and Browser CLI (packages/browser-cli).
 * @module @stark-o/shared/cli
 */

export type {
  CliOptionDef,
  CliSubcommandDef,
  CliCommandDef,
  CliDefinition,
} from './types.js';

export { authCommandDef } from './commands/auth.js';
export { packCommandDef } from './commands/pack.js';
export { nodeCommandDef } from './commands/node.js';
export { podCommandDef } from './commands/pod.js';
export { serviceCommandDef } from './commands/service.js';
export { namespaceCommandDef } from './commands/namespace.js';
export { secretCommandDef } from './commands/secret.js';
export { volumeCommandDef } from './commands/volume.js';
export { chaosCommandDef } from './commands/chaos.js';
export { networkCommandDef } from './commands/network.js';
export { serverCommandDef } from './commands/server.js';
export { serverConfigCommandDef } from './commands/server-config.js';
export { starkCliDefinition } from './definition.js';
