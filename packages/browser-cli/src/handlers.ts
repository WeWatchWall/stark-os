/**
 * Browser CLI — Command Handlers
 *
 * Implements all Stark CLI command handlers for the browser environment.
 * These mirror the Node.js CLI handlers but use browser-compatible APIs.
 * @module @stark-o/browser-cli/handlers
 */

import { createApiClient, requireAuth, resolveNodeId, loadConfig, saveConfig, loadCredentials, saveCredentials, clearCredentials, isAuthenticated } from './config.js';
import { downloadVolume, archiveVolumePath } from './volume.js';
import { startBrowserAgent, type BrowserAgentStartOptions } from './agent.js';

/**
 * API response type
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Result from a command execution
 */
export interface CommandResult {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: string;
}

/**
 * Write callback for streaming command output
 */
export type OutputWriter = (text: string) => void;

/**
 * Execute a CLI command in the browser.
 * Parses args and dispatches to the appropriate handler.
 *
 * @param args - Arguments (e.g., ['pack', 'list'])
 * @param write - Output callback
 * @returns Command result
 */
export async function executeCommand(
  args: string[],
  write: OutputWriter,
): Promise<CommandResult> {
  if (args.length === 0) {
    return { success: false, error: 'No command specified' };
  }

  const [command, subcommand, ...rest] = args;

  try {
    switch (command) {
      case 'auth':
        return handleAuth(subcommand, rest, write);
      case 'pack':
        return handlePack(subcommand, rest, write);
      case 'node':
        return handleNode(subcommand, rest, write);
      case 'pod':
        return handlePod(subcommand, rest, write);
      case 'service':
        return handleService(subcommand, rest, write);
      case 'namespace':
      case 'ns':
        return handleNamespace(subcommand, rest, write);
      case 'secret':
        return handleSecret(subcommand, rest, write);
      case 'volume':
        return handleVolume(subcommand, rest, write);
      case 'chaos':
        return handleChaos(subcommand, rest, write);
      case 'network':
        return handleNetwork(subcommand, rest, write);
      case 'server-config':
        return handleServerConfig(subcommand, rest, write);
      case 'config':
        return handleConfig(rest, write);
      case 'status':
        return handleStatus(write);
      case 'help':
        return handleHelp(write);
      default:
        write(`Unknown command: ${command}\n`);
        write('Run "help" for available commands.\n');
        return { success: false, error: `Unknown command: ${command}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    write(`Error: ${msg}\n`);
    return { success: false, error: msg };
  }
}

// ============================================================================
// Helper: parse simple --key value options from args
// ============================================================================

function parseOptions(args: string[]): { positionals: string[]; options: Record<string, string | boolean> } {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }
    } else {
      positionals.push(arg);
    }
  }

  return { positionals, options };
}

// ============================================================================
// Generic list/get handler for simple API commands
// ============================================================================

async function apiGet(path: string, write: OutputWriter): Promise<CommandResult> {
  requireAuth();
  const api = createApiClient();
  const response = await api.get(path);
  const result = (await response.json()) as ApiResponse<unknown>;
  if (!result.success) {
    write(`Error: ${result.error?.message ?? 'Request failed'}\n`);
    return { success: false, error: result.error?.message };
  }
  write(JSON.stringify(result.data, null, 2) + '\n');
  return { success: true, data: result.data };
}

async function apiPost(path: string, body: unknown, write: OutputWriter): Promise<CommandResult> {
  requireAuth();
  const api = createApiClient();
  const response = await api.post(path, body);
  const result = (await response.json()) as ApiResponse<unknown>;
  if (!result.success) {
    write(`Error: ${result.error?.message ?? 'Request failed'}\n`);
    return { success: false, error: result.error?.message };
  }
  write(JSON.stringify(result.data, null, 2) + '\n');
  return { success: true, data: result.data };
}

async function apiDelete(path: string, write: OutputWriter): Promise<CommandResult> {
  requireAuth();
  const api = createApiClient();
  const response = await api.delete(path);
  const result = (await response.json()) as ApiResponse<unknown>;
  if (!result.success) {
    write(`Error: ${result.error?.message ?? 'Request failed'}\n`);
    return { success: false, error: result.error?.message };
  }
  write('Deleted successfully.\n');
  return { success: true, data: result.data };
}

// ============================================================================
// Auth Handlers
// ============================================================================

async function handleAuth(subcommand: string | undefined, args: string[], write: OutputWriter): Promise<CommandResult> {
  const { options } = parseOptions(args);

  switch (subcommand) {
    case 'login': {
      const email = options['email'] ?? options['e'];
      const password = options['password'] ?? options['p'];
      if (!email || !password) {
        write('Usage: auth login --email <email> --password <password>\n');
        return { success: false, error: 'Email and password required' };
      }
      const api = createApiClient();
      const response = await api.post('/auth/login', { email, password });
      const result = (await response.json()) as ApiResponse<{
        accessToken: string;
        refreshToken?: string;
        expiresAt: string;
        user: { id: string; email: string };
      }>;
      if (!result.success || !result.data) {
        write(`Login failed: ${result.error?.message ?? 'Unknown error'}\n`);
        return { success: false, error: result.error?.message };
      }
      saveCredentials({
        accessToken: result.data.accessToken,
        refreshToken: result.data.refreshToken,
        expiresAt: result.data.expiresAt,
        userId: result.data.user.id,
        email: result.data.user.email,
      });
      write(`Logged in as ${result.data.user.email}\n`);
      return { success: true, message: `Logged in as ${result.data.user.email}` };
    }
    case 'logout':
      clearCredentials();
      write('Logged out.\n');
      return { success: true, message: 'Logged out' };
    case 'whoami': {
      const creds = loadCredentials();
      if (!creds || !isAuthenticated()) {
        write('Not authenticated.\n');
        return { success: false, error: 'Not authenticated' };
      }
      write(`Email: ${creds.email}\nUser ID: ${creds.userId}\n`);
      return { success: true, data: { email: creds.email, userId: creds.userId } };
    }
    case 'status': {
      const authenticated = isAuthenticated();
      write(`Authenticated: ${authenticated ? 'Yes' : 'No'}\n`);
      if (authenticated) {
        const creds = loadCredentials();
        if (creds) {
          write(`Email: ${creds.email}\nExpires: ${creds.expiresAt}\n`);
        }
      }
      return { success: true, data: { authenticated } };
    }
    default:
      write(`Unknown auth subcommand: ${subcommand}\nAvailable: login, logout, whoami, status\n`);
      return { success: false, error: `Unknown subcommand: ${subcommand}` };
  }
}

// ============================================================================
// Pack Handlers
// ============================================================================

async function handlePack(subcommand: string | undefined, args: string[], write: OutputWriter): Promise<CommandResult> {
  switch (subcommand) {
    case 'list':
    case 'ls':
      return apiGet('/api/packs', write);
    case 'versions': {
      const { positionals } = parseOptions(args);
      const name = positionals[0];
      if (!name) {
        write('Usage: pack versions <name>\n');
        return { success: false, error: 'Pack name required' };
      }
      return apiGet(`/api/packs/name/${encodeURIComponent(name)}/versions`, write);
    }
    case 'info': {
      const { positionals } = parseOptions(args);
      const name = positionals[0];
      if (!name) {
        write('Usage: pack info <name>\n');
        return { success: false, error: 'Pack name required' };
      }
      return apiGet(`/api/packs/name/${encodeURIComponent(name)}`, write);
    }
    case 'delete':
    case 'rm': {
      const { positionals } = parseOptions(args);
      const name = positionals[0];
      if (!name) {
        write('Usage: pack delete <name>\n');
        return { success: false, error: 'Pack name required' };
      }
      return apiDelete(`/api/packs/name/${encodeURIComponent(name)}`, write);
    }
    default:
      write(`Unknown pack subcommand: ${subcommand}\nAvailable: list, versions, info, delete\n`);
      return { success: false, error: `Unknown subcommand: ${subcommand}` };
  }
}

// ============================================================================
// Node Handlers
// ============================================================================

async function handleNode(subcommand: string | undefined, args: string[], write: OutputWriter): Promise<CommandResult> {
  switch (subcommand) {
    case 'list':
    case 'ls':
      return apiGet('/api/nodes', write);
    case 'status':
    case 'info': {
      const { positionals } = parseOptions(args);
      const name = positionals[0];
      if (!name) {
        write('Usage: node status <name>\n');
        return { success: false, error: 'Node name required' };
      }
      return apiGet(`/api/nodes/name/${encodeURIComponent(name)}`, write);
    }
    case 'agent': {
      const [agentSub, ...agentArgs] = args;
      if (agentSub === 'start') {
        return handleAgentStart(agentArgs, write);
      }
      write('Usage: node agent start [options]\n');
      return { success: false, error: 'Unknown agent subcommand' };
    }
    default:
      write(`Unknown node subcommand: ${subcommand}\nAvailable: list, status, agent\n`);
      return { success: false, error: `Unknown subcommand: ${subcommand}` };
  }
}

async function handleAgentStart(args: string[], write: OutputWriter): Promise<CommandResult> {
  const { options } = parseOptions(args);

  const agentOptions: BrowserAgentStartOptions = {
    url: String(options['url'] ?? options['u'] ?? 'wss://localhost:443/ws'),
    name: String(options['name'] ?? options['n'] ?? `browser-${Date.now()}`),
    token: options['token'] ? String(options['token']) : undefined,
    debug: options['debug'] === true,
    heartbeatInterval: options['heartbeat'] ? parseInt(String(options['heartbeat']), 10) * 1000 : undefined,
  };

  // Parse labels
  if (options['label'] || options['l']) {
    const labelStr = String(options['label'] ?? options['l']);
    const labels: Record<string, string> = {};
    for (const pair of labelStr.split(',')) {
      const [k, v] = pair.split('=');
      if (k && v !== undefined) labels[k] = v;
    }
    agentOptions.labels = labels;
  }

  write(`Starting browser node agent: ${agentOptions.name}\n`);
  write(`Orchestrator: ${agentOptions.url}\n`);

  const agent = await startBrowserAgent(agentOptions);
  write(`Browser node agent started.\n`);
  return { success: true, message: 'Agent started', data: { agent } };
}

// ============================================================================
// Pod Handlers
// ============================================================================

async function handlePod(subcommand: string | undefined, args: string[], write: OutputWriter): Promise<CommandResult> {
  const { positionals, options } = parseOptions(args);

  switch (subcommand) {
    case 'list':
    case 'ls': {
      const params = new URLSearchParams();
      if (options['namespace'] ?? options['n']) params.set('namespace', String(options['namespace'] ?? options['n']));
      if (options['status'] ?? options['s']) params.set('status', String(options['status'] ?? options['s']));
      const qs = params.toString();
      return apiGet(`/api/pods${qs ? '?' + qs : ''}`, write);
    }
    case 'status': {
      const podId = positionals[0];
      if (!podId) {
        write('Usage: pod status <podId>\n');
        return { success: false, error: 'Pod ID required' };
      }
      return apiGet(`/api/pods/${podId}`, write);
    }
    case 'create':
    case 'run': {
      const packName = positionals[0] ?? options['pack'];
      if (!packName) {
        write('Usage: pod create <pack> [options]\n');
        return { success: false, error: 'Pack name required' };
      }
      const body: Record<string, unknown> = {
        packName: String(packName),
        namespace: String(options['namespace'] ?? options['n'] ?? 'default'),
      };
      if (options['ver']) body.packVersion = String(options['ver']);
      if (options['node']) body.nodeId = String(options['node']);
      return apiPost('/api/pods', body, write);
    }
    case 'stop': {
      const podId = positionals[0];
      if (!podId) {
        write('Usage: pod stop <podId>\n');
        return { success: false, error: 'Pod ID required' };
      }
      return apiPost(`/api/pods/${podId}/stop`, {}, write);
    }
    case 'rollback': {
      const podId = positionals[0];
      if (!podId) {
        write('Usage: pod rollback <podId>\n');
        return { success: false, error: 'Pod ID required' };
      }
      return apiPost(`/api/pods/${podId}/rollback`, {}, write);
    }
    case 'history': {
      const podId = positionals[0];
      if (!podId) {
        write('Usage: pod history <podId>\n');
        return { success: false, error: 'Pod ID required' };
      }
      return apiGet(`/api/pods/${podId}/history`, write);
    }
    default:
      write(`Unknown pod subcommand: ${subcommand}\nAvailable: create, list, status, stop, rollback, history\n`);
      return { success: false, error: `Unknown subcommand: ${subcommand}` };
  }
}

// ============================================================================
// Service Handlers
// ============================================================================

async function handleService(subcommand: string | undefined, args: string[], write: OutputWriter): Promise<CommandResult> {
  const { positionals, options } = parseOptions(args);

  switch (subcommand) {
    case 'list':
    case 'ls': {
      const params = new URLSearchParams();
      if (options['namespace'] ?? options['n']) params.set('namespace', String(options['namespace'] ?? options['n']));
      const qs = params.toString();
      return apiGet(`/api/services${qs ? '?' + qs : ''}`, write);
    }
    case 'status': {
      const name = positionals[0];
      if (!name) {
        write('Usage: service status <name>\n');
        return { success: false, error: 'Service name required' };
      }
      return apiGet(`/api/services/name/${encodeURIComponent(name)}`, write);
    }
    case 'create': {
      const packName = options['pack'];
      if (!packName) {
        write('Usage: service create --pack <name> [options]\n');
        return { success: false, error: 'Pack name required' };
      }
      const body: Record<string, unknown> = {
        packName: String(packName),
        namespace: String(options['namespace'] ?? options['n'] ?? 'default'),
        replicas: parseInt(String(options['replicas'] ?? options['r'] ?? '1'), 10),
        visibility: String(options['visibility'] ?? 'private'),
      };
      return apiPost('/api/services', body, write);
    }
    default:
      write(`Unknown service subcommand: ${subcommand}\nAvailable: create, list, status\n`);
      return { success: false, error: `Unknown subcommand: ${subcommand}` };
  }
}

// ============================================================================
// Namespace Handlers
// ============================================================================

async function handleNamespace(subcommand: string | undefined, args: string[], write: OutputWriter): Promise<CommandResult> {
  const { positionals } = parseOptions(args);

  switch (subcommand) {
    case 'list':
    case 'ls':
      return apiGet('/api/namespaces', write);
    case 'get': {
      const name = positionals[0];
      if (!name) {
        write('Usage: namespace get <name>\n');
        return { success: false, error: 'Namespace name required' };
      }
      return apiGet(`/api/namespaces/name/${encodeURIComponent(name)}`, write);
    }
    case 'create': {
      const name = positionals[0];
      if (!name) {
        write('Usage: namespace create <name>\n');
        return { success: false, error: 'Namespace name required' };
      }
      return apiPost('/api/namespaces', { name }, write);
    }
    case 'delete':
    case 'rm': {
      const name = positionals[0];
      if (!name) {
        write('Usage: namespace delete <name>\n');
        return { success: false, error: 'Namespace name required' };
      }
      return apiDelete(`/api/namespaces/name/${encodeURIComponent(name)}`, write);
    }
    case 'current': {
      const config = loadConfig();
      write(`Current namespace: ${config.defaultNamespace}\n`);
      return { success: true, data: { namespace: config.defaultNamespace } };
    }
    case 'use': {
      const name = positionals[0];
      if (!name) {
        write('Usage: namespace use <name>\n');
        return { success: false, error: 'Namespace name required' };
      }
      saveConfig({ defaultNamespace: name });
      write(`Default namespace set to: ${name}\n`);
      return { success: true, message: `Default namespace set to ${name}` };
    }
    default:
      write(`Unknown namespace subcommand: ${subcommand}\nAvailable: create, list, get, delete, current, use\n`);
      return { success: false, error: `Unknown subcommand: ${subcommand}` };
  }
}

// ============================================================================
// Secret Handlers
// ============================================================================

async function handleSecret(subcommand: string | undefined, args: string[], write: OutputWriter): Promise<CommandResult> {
  const { positionals, options } = parseOptions(args);

  switch (subcommand) {
    case 'list':
    case 'ls': {
      const params = new URLSearchParams();
      if (options['namespace'] ?? options['n']) params.set('namespace', String(options['namespace'] ?? options['n']));
      const qs = params.toString();
      return apiGet(`/api/secrets${qs ? '?' + qs : ''}`, write);
    }
    case 'get': {
      const name = positionals[0];
      if (!name) {
        write('Usage: secret get <name>\n');
        return { success: false, error: 'Secret name required' };
      }
      const ns = String(options['namespace'] ?? options['n'] ?? 'default');
      return apiGet(`/api/secrets/name/${encodeURIComponent(name)}?namespace=${ns}`, write);
    }
    default:
      write(`Unknown secret subcommand: ${subcommand}\nAvailable: list, get\n`);
      return { success: false, error: `Unknown subcommand: ${subcommand}` };
  }
}

// ============================================================================
// Volume Handlers
// ============================================================================

async function handleVolume(subcommand: string | undefined, args: string[], write: OutputWriter): Promise<CommandResult> {
  const { positionals, options } = parseOptions(args);

  switch (subcommand) {
    case 'list':
    case 'ls': {
      const params = new URLSearchParams();
      if (options['node'] ?? options['n']) {
        const api = createApiClient();
        const nodeId = await resolveNodeId(String(options['node'] ?? options['n']), api);
        params.set('nodeId', nodeId);
      }
      const qs = params.toString();
      return apiGet(`/api/volumes${qs ? '?' + qs : ''}`, write);
    }
    case 'create': {
      const name = positionals[0] ?? options['name'];
      const node = options['node'] ?? options['n'];
      if (!name || !node) {
        write('Usage: volume create <name> --node <nodeNameOrId>\n');
        return { success: false, error: 'Volume name and node required' };
      }
      const api = createApiClient();
      const nodeId = await resolveNodeId(String(node), api);
      return apiPost('/api/volumes', { name: String(name), nodeId }, write);
    }
    case 'download': {
      const name = positionals[0] ?? options['name'];
      const node = options['node'] ?? options['n'];
      if (!name || !node) {
        write('Usage: volume download <name> --node <nodeNameOrId>\n');
        return { success: false, error: 'Volume name and node required' };
      }
      const data = await downloadVolume(String(name), String(node));
      write(`Downloaded volume "${name}" (${data.byteLength} bytes)\n`);
      return { success: true, data: { size: data.byteLength }, message: `Downloaded ${data.byteLength} bytes` };
    }
    case 'archive': {
      const node = options['node'] ?? options['n'];
      const vol = positionals[0] ?? options['volume'];
      const path = positionals[1] ?? options['path'];
      if (!node || !vol || !path) {
        write('Usage: volume archive <volume> <path> --node <nodeNameOrId>\n');
        return { success: false, error: 'Node, volume, and path required' };
      }
      const data = await archiveVolumePath(String(node), String(vol), String(path));
      write(`Archived "${path}" from volume "${vol}" (${data.byteLength} bytes)\n`);
      return { success: true, data: { size: data.byteLength }, message: `Archived ${data.byteLength} bytes` };
    }
    default:
      write(`Unknown volume subcommand: ${subcommand}\nAvailable: list, create, download, archive\n`);
      return { success: false, error: `Unknown subcommand: ${subcommand}` };
  }
}

// ============================================================================
// Chaos Handlers
// ============================================================================

async function handleChaos(subcommand: string | undefined, _args: string[], write: OutputWriter): Promise<CommandResult> {
  switch (subcommand) {
    case 'status':
      return apiGet('/chaos/status', write);
    case 'enable':
      return apiPost('/chaos/enable', {}, write);
    case 'disable':
      return apiPost('/chaos/disable', {}, write);
    case 'scenarios':
      return apiGet('/chaos/scenarios', write);
    case 'connections':
      return apiGet('/chaos/connections', write);
    case 'nodes':
      return apiGet('/chaos/nodes', write);
    case 'events':
      return apiGet('/chaos/events', write);
    case 'reset':
      return apiPost('/chaos/reset', {}, write);
    default:
      write(`Unknown chaos subcommand: ${subcommand}\nAvailable: status, enable, disable, scenarios, connections, nodes, events, reset\n`);
      return { success: false, error: `Unknown subcommand: ${subcommand}` };
  }
}

// ============================================================================
// Network Handlers
// ============================================================================

async function handleNetwork(subcommand: string | undefined, _args: string[], write: OutputWriter): Promise<CommandResult> {
  switch (subcommand) {
    case 'policies':
    case 'list':
      return apiGet('/api/network/policies', write);
    case 'registry':
      return apiGet('/api/network/registry', write);
    default:
      write(`Unknown network subcommand: ${subcommand}\nAvailable: policies, registry\n`);
      return { success: false, error: `Unknown subcommand: ${subcommand}` };
  }
}

// ============================================================================
// Server Config Handlers
// ============================================================================

async function handleServerConfig(subcommand: string | undefined, _args: string[], write: OutputWriter): Promise<CommandResult> {
  switch (subcommand) {
    case 'get':
      return apiGet('/api/config', write);
    default:
      write(`Unknown server-config subcommand: ${subcommand}\nAvailable: get\n`);
      return { success: false, error: `Unknown subcommand: ${subcommand}` };
  }
}

// ============================================================================
// Config & Status
// ============================================================================

function handleConfig(_args: string[], write: OutputWriter): CommandResult {
  const config = loadConfig();
  write(JSON.stringify(config, null, 2) + '\n');
  return { success: true, data: config };
}

function handleStatus(write: OutputWriter): CommandResult {
  const authenticated = isAuthenticated();
  const config = loadConfig();
  write(`Authenticated: ${authenticated ? 'Yes' : 'No'}\n`);
  write(`API: ${config.apiUrl}\n`);
  return { success: true, data: { authenticated, apiUrl: config.apiUrl } };
}

function handleHelp(write: OutputWriter): CommandResult {
  write('Stark Orchestrator CLI\n\n');
  write('Commands:\n');
  write('  auth        Authentication commands (login, logout, whoami, status)\n');
  write('  pack        Pack management (list, versions, info, delete)\n');
  write('  node        Node management (list, status, agent start)\n');
  write('  pod         Pod management (create, list, status, stop, rollback)\n');
  write('  service     Service management (create, list, status)\n');
  write('  namespace   Namespace management (create, list, get, delete, use, current)\n');
  write('  secret      Secret management (list, get)\n');
  write('  volume      Volume management (create, list, download, archive)\n');
  write('  chaos       Chaos testing (status, enable, disable, scenarios)\n');
  write('  network     Network policies (policies, registry)\n');
  write('  config      Show CLI configuration\n');
  write('  status      Show cluster status\n');
  write('  help        Show this help\n');
  return { success: true };
}
