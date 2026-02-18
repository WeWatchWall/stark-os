/**
 * Shared CLI Data Tests
 *
 * Validates the data-driven CLI command definitions.
 * @module @stark-o/shared/tests/unit/cli-data
 */

import { describe, it, expect } from 'vitest';
import {
  starkCliDefinition,
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
} from '../../src/cli/index.js';
import type {
  CliCommandDef,
  CliSubcommandDef,
  CliDefinition,
} from '../../src/cli/types.js';

// ============================================================================
// CLI Definition Structure
// ============================================================================

describe('Shared CLI Definition', () => {
  it('should have correct program metadata', () => {
    expect(starkCliDefinition.name).toBe('stark');
    expect(starkCliDefinition.version).toBe('0.0.1');
    expect(starkCliDefinition.description).toContain('Stark Orchestrator CLI');
  });

  it('should have global options', () => {
    expect(starkCliDefinition.globalOptions.length).toBeGreaterThanOrEqual(3);
    const flags = starkCliDefinition.globalOptions.map((o) => o.flags);
    expect(flags).toContain('-o, --output <format>');
    expect(flags).toContain('--api-url <url>');
    expect(flags).toContain('-k, --insecure');
  });

  it('should include all 12 command groups', () => {
    expect(starkCliDefinition.commands).toHaveLength(12);
    const names = starkCliDefinition.commands.map((c) => c.name);
    expect(names).toContain('auth');
    expect(names).toContain('pack');
    expect(names).toContain('node');
    expect(names).toContain('pod');
    expect(names).toContain('service');
    expect(names).toContain('namespace');
    expect(names).toContain('secret');
    expect(names).toContain('volume');
    expect(names).toContain('chaos');
    expect(names).toContain('network');
    expect(names).toContain('server');
    expect(names).toContain('server-config');
  });
});

// ============================================================================
// Individual Command Group Tests
// ============================================================================

describe('Auth Command Definition', () => {
  it('should have correct name and description', () => {
    expect(authCommandDef.name).toBe('auth');
    expect(authCommandDef.description).toContain('Authentication');
  });

  it('should have all subcommands', () => {
    const names = authCommandDef.subcommands.map((s) => s.name);
    expect(names).toContain('login');
    expect(names).toContain('logout');
    expect(names).toContain('whoami');
    expect(names).toContain('status');
    expect(names).toContain('setup');
    expect(names).toContain('register');
    expect(names).toContain('add-user');
    expect(names).toContain('list-users');
  });

  it('login should not require auth', () => {
    const login = authCommandDef.subcommands.find((s) => s.name === 'login');
    expect(login?.requiresAuth).toBe(false);
  });

  it('add-user should require auth', () => {
    const addUser = authCommandDef.subcommands.find((s) => s.name === 'add-user');
    expect(addUser?.requiresAuth).toBe(true);
  });
});

describe('Pack Command Definition', () => {
  it('should have all subcommands', () => {
    const names = packCommandDef.subcommands.map((s) => s.name);
    expect(names).toContain('bundle');
    expect(names).toContain('register');
    expect(names).toContain('list');
    expect(names).toContain('versions');
    expect(names).toContain('info');
    expect(names).toContain('delete');
  });

  it('list should have ls alias', () => {
    const list = packCommandDef.subcommands.find((s) => s.name === 'list');
    expect(list?.alias).toBe('ls');
  });

  it('register should have API info', () => {
    const register = packCommandDef.subcommands.find((s) => s.name === 'register');
    expect(register?.apiMethod).toBe('POST');
    expect(register?.apiPath).toBe('/api/packs');
  });
});

describe('Node Command Definition', () => {
  it('should have all subcommands', () => {
    const names = nodeCommandDef.subcommands.map((s) => s.name);
    expect(names).toContain('list');
    expect(names).toContain('status');
    expect(names).toContain('delete');
    expect(names).toContain('update');
    expect(names).toContain('watch');
    expect(names).toContain('agent');
  });

  it('agent should have nested start subcommand', () => {
    const agent = nodeCommandDef.subcommands.find((s) => s.name === 'agent');
    expect(agent?.subcommands).toBeDefined();
    const agentSubNames = agent!.subcommands!.map((s) => s.name);
    expect(agentSubNames).toContain('start');
  });

  it('agent start should have connection options', () => {
    const agent = nodeCommandDef.subcommands.find((s) => s.name === 'agent');
    const start = agent!.subcommands!.find((s) => s.name === 'start');
    const flags = start!.options!.map((o) => o.flags);
    expect(flags.some((f) => f.includes('--url'))).toBe(true);
    expect(flags.some((f) => f.includes('--name'))).toBe(true);
    expect(flags.some((f) => f.includes('--token'))).toBe(true);
  });
});

describe('Pod Command Definition', () => {
  it('should have all subcommands', () => {
    const names = podCommandDef.subcommands.map((s) => s.name);
    expect(names).toContain('create');
    expect(names).toContain('list');
    expect(names).toContain('status');
    expect(names).toContain('rollback');
    expect(names).toContain('history');
    expect(names).toContain('stop');
    expect(names).toContain('logs');
  });

  it('create should have alias run', () => {
    const create = podCommandDef.subcommands.find((s) => s.name === 'create');
    expect(create?.alias).toBe('run');
  });
});

describe('Service Command Definition', () => {
  it('should have deploy alias', () => {
    expect(serviceCommandDef.alias).toBe('deploy');
  });

  it('should have all subcommands', () => {
    const names = serviceCommandDef.subcommands.map((s) => s.name);
    expect(names).toContain('create');
    expect(names).toContain('list');
    expect(names).toContain('status');
    expect(names).toContain('scale');
    expect(names).toContain('set-visibility');
    expect(names).toContain('expose');
    expect(names).toContain('unexpose');
    expect(names).toContain('pause');
    expect(names).toContain('resume');
    expect(names).toContain('delete');
  });
});

describe('Namespace Command Definition', () => {
  it('should have ns alias', () => {
    expect(namespaceCommandDef.alias).toBe('ns');
  });

  it('should have all subcommands', () => {
    const names = namespaceCommandDef.subcommands.map((s) => s.name);
    expect(names).toContain('create');
    expect(names).toContain('list');
    expect(names).toContain('get');
    expect(names).toContain('delete');
    expect(names).toContain('quota');
    expect(names).toContain('use');
    expect(names).toContain('current');
  });
});

describe('Volume Command Definition', () => {
  it('should have download command with required options', () => {
    const download = volumeCommandDef.subcommands.find((s) => s.name === 'download');
    expect(download).toBeDefined();
    expect(download?.options?.some((o) => o.required && o.flags.includes('--node'))).toBe(true);
    expect(download?.options?.some((o) => o.required && o.flags.includes('--out-file'))).toBe(true);
  });
});

describe('Chaos Command Definition', () => {
  it('should have nested partition subcommands', () => {
    const partition = chaosCommandDef.subcommands.find((s) => s.name === 'partition');
    expect(partition?.subcommands).toBeDefined();
    const subNames = partition!.subcommands!.map((s) => s.name);
    expect(subNames).toContain('create');
    expect(subNames).toContain('list');
    expect(subNames).toContain('remove');
  });

  it('should have nested latency subcommands', () => {
    const latency = chaosCommandDef.subcommands.find((s) => s.name === 'latency');
    expect(latency?.subcommands).toBeDefined();
    const subNames = latency!.subcommands!.map((s) => s.name);
    expect(subNames).toContain('inject');
    expect(subNames).toContain('clear');
  });
});

// ============================================================================
// Cross-cutting Validation
// ============================================================================

describe('CLI Data Consistency', () => {
  function getAllSubcommands(def: CliCommandDef): CliSubcommandDef[] {
    const result: CliSubcommandDef[] = [];
    for (const sub of def.subcommands) {
      result.push(sub);
      if (sub.subcommands) {
        for (const nested of sub.subcommands) {
          result.push(nested);
        }
      }
    }
    return result;
  }

  it('all commands with apiPath should have apiMethod', () => {
    for (const cmd of starkCliDefinition.commands) {
      for (const sub of getAllSubcommands(cmd)) {
        if (sub.apiPath) {
          expect(sub.apiMethod).toBeDefined();
        }
      }
    }
  });

  it('all options should have flags and description', () => {
    for (const cmd of starkCliDefinition.commands) {
      for (const sub of getAllSubcommands(cmd)) {
        if (sub.options) {
          for (const opt of sub.options) {
            expect(opt.flags).toBeTruthy();
            expect(opt.description).toBeTruthy();
          }
        }
      }
    }
  });

  it('all subcommands should have description', () => {
    for (const cmd of starkCliDefinition.commands) {
      for (const sub of getAllSubcommands(cmd)) {
        expect(sub.description).toBeTruthy();
      }
    }
  });
});
