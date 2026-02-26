/**
 * Portable Stark API
 *
 * Runtime-agnostic programmatic API for orchestrator operations.
 * Works in Node.js, browsers, and Web Workers — uses only `fetch`
 * (no localStorage, no JSZip).
 *
 * Browser-specific features (volume zip operations) are NOT included here;
 * they live in `@stark-o/browser-runtime/api`.
 *
 * @module @stark-o/shared/api/stark-api
 */

/**
 * Minimal config needed to create a StarkAPI in any runtime environment.
 */
export interface StarkAPIConfig {
  /** Base HTTP URL of the orchestrator (e.g. https://localhost:443) */
  apiUrl?: string;
  /** Bearer token for authenticated requests */
  accessToken?: string;
}

/**
 * Standard Stark API interface.
 * Available to packs via `context.starkAPI`.
 */
export interface StarkAPI {
  auth: {
    login(email: string, password: string): Promise<{ user: { id: string; email: string }; accessToken: string }>;
    logout(): void;
    whoami(): { email: string; userId: string } | null;
    isAuthenticated(): boolean;
    status(): { authenticated: boolean; email?: string; expiresAt?: string };
    /** Update the in-memory access token (called by runtime on auth:token-refreshed) */
    updateAccessToken(token: string): void;
    setup(email: string, password: string, displayName?: string): Promise<{ user: { id: string; email: string }; accessToken: string }>;
    setupStatus(): Promise<{ needsSetup: boolean }>;
    addUser(email: string, password: string, options?: { displayName?: string; roles?: string[] }): Promise<{ user: { id: string; email: string; roles?: string[] } }>;
    listUsers(): Promise<unknown>;
  };
  pack: {
    list(): Promise<unknown>;
    versions(name: string): Promise<unknown>;
    info(name: string): Promise<unknown>;
    delete(name: string): Promise<void>;
  };
  node: {
    list(): Promise<unknown>;
    status(nameOrId: string): Promise<unknown>;
    logs(nameOrId: string, options?: { tail?: number }): Promise<unknown>;
  };
  pod: {
    list(options?: { namespace?: string; status?: string }): Promise<unknown>;
    status(podId: string): Promise<unknown>;
    create(packName: string, options?: { namespace?: string; packVersion?: string; nodeId?: string }): Promise<unknown>;
    stop(podId: string): Promise<unknown>;
    rollback(podId: string): Promise<unknown>;
    history(podId: string): Promise<unknown>;
    logs(podId: string, options?: { tail?: number }): Promise<unknown>;
  };
  service: {
    list(options?: { namespace?: string }): Promise<unknown>;
    status(name: string): Promise<unknown>;
    create(packName: string, options?: { namespace?: string; replicas?: number; visibility?: string }): Promise<unknown>;
  };
  namespace: {
    list(): Promise<unknown>;
    get(name: string): Promise<unknown>;
    create(name: string): Promise<unknown>;
    delete(name: string): Promise<void>;
    current(): string;
    use(name: string): void;
  };
  secret: {
    list(options?: { namespace?: string }): Promise<unknown>;
    get(name: string, namespace?: string): Promise<unknown>;
  };
  volume: {
    list(options?: { nodeNameOrId?: string }): Promise<unknown>;
    create(name: string, nodeNameOrId: string): Promise<unknown>;
    download(name: string, nodeNameOrId: string): Promise<{ files: Array<{ path: string; data: string }> }>;
  };
  chaos: {
    status(): Promise<unknown>;
    enable(): Promise<unknown>;
    disable(): Promise<unknown>;
    scenarios(): Promise<unknown>;
    connections(): Promise<unknown>;
    nodes(): Promise<unknown>;
    events(): Promise<unknown>;
    reset(): Promise<unknown>;
  };
  network: {
    policies(): Promise<unknown>;
    registry(): Promise<unknown>;
  };
  serverConfig: {
    get(): Promise<unknown>;
  };
}

// ── Internal helpers ──────────────────────────────────────────────────

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}

async function handleResponse<T>(response: Response): Promise<T> {
  const result = (await response.json()) as ApiResponse<T>;
  if (!result.success || !result.data) {
    throw new Error(result.error?.message ?? 'Request failed');
  }
  return result.data;
}

async function handleDeleteResponse(response: Response): Promise<void> {
  const result = (await response.json()) as ApiResponse<unknown>;
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Request failed');
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveNodeId(
  nameOrId: string,
  apiFetch: (path: string) => Promise<Response>,
): Promise<string> {
  if (UUID_PATTERN.test(nameOrId)) return nameOrId;
  const response = await apiFetch(`/api/nodes/name/${encodeURIComponent(nameOrId)}`);
  const result = (await response.json()) as {
    success: boolean;
    data?: { node: { id: string } };
    error?: { code: string; message: string };
  };
  if (!result.success || !result.data) {
    throw new Error(`Node not found: ${nameOrId}`);
  }
  return result.data.node.id;
}

/**
 * Resolve the API URL from available sources:
 * 1. Explicit apiUrl passed to config
 * 2. `__STARK_CONTEXT__.orchestratorUrl` (set by worker scripts)
 * 3. `location.origin` (main-thread browser)
 * 4. Fallback to localhost
 */
function resolveApiUrl(explicitUrl?: string): string {
  if (explicitUrl) return explicitUrl;

  // Check global __STARK_CONTEXT__ (set by pack-worker scripts)
  const ctx = (globalThis as Record<string, unknown>).__STARK_CONTEXT__ as
    { orchestratorUrl?: string } | undefined;
  if (ctx?.orchestratorUrl) {
    try {
      const u = new URL(ctx.orchestratorUrl);
      u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
      return u.origin;
    } catch { /* malformed — try next */ }
  }

  if (typeof globalThis.location !== 'undefined') {
    const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
    if (origin && origin !== 'null') return origin;
  }

  // srcdoc iframes have location.origin === 'null'; try the parent window
  try {
    const g = globalThis as Record<string, unknown>;
    if (g.parent && g.parent !== globalThis) {
      const parentOrigin = (g.parent as { location?: { origin?: string } }).location?.origin;
      if (parentOrigin && parentOrigin !== 'null') return parentOrigin;
    }
  } catch { /* cross-origin — ignore */ }

  return 'https://127.0.0.1:443';
}

// ── Factory ───────────────────────────────────────────────────────────

/**
 * Creates a portable StarkAPI instance.
 *
 * Unlike the browser-runtime's version, this does NOT use localStorage.
 * Auth tokens and API URL must be provided explicitly (or derived from
 * the global `__STARK_CONTEXT__`).
 *
 * @param config - API URL and/or access token
 * @returns StarkAPI object suitable for `context.starkAPI`
 */
export function createStarkAPI(config?: StarkAPIConfig): StarkAPI {
  const baseUrl = resolveApiUrl(config?.apiUrl);
  let currentAccessToken = config?.accessToken;

  let currentNamespace = 'default';

  /**
   * Resolve the access token dynamically on each request:
   * 1. Mutable token (set explicitly or updated via auth:token-refreshed)
   * 2. __STARK_CONTEXT__._userAccessToken (set by pack executor, updated on refresh)
   */
  const resolveAccessToken = (): string | undefined => {
    if (currentAccessToken) return currentAccessToken;

    try {
      const ctx = (globalThis as Record<string, unknown>).__STARK_CONTEXT__ as
        { _userAccessToken?: string } | undefined;
      if (ctx?._userAccessToken) return ctx._userAccessToken;
    } catch { /* ignore */ }

    return undefined;
  };

  const getHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = resolveAccessToken();
    if (token) {
      h['Authorization'] = `Bearer ${token}`;
    }
    return h;
  };

  const apiFetch = (path: string, init?: RequestInit): Promise<Response> =>
    fetch(`${baseUrl}${path}`, { ...init, headers: { ...getHeaders(), ...init?.headers } });

  const apiGet = (path: string) => apiFetch(path, { method: 'GET' });
  const apiPost = (path: string, body?: unknown) =>
    apiFetch(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  const apiDelete = (path: string) => apiFetch(path, { method: 'DELETE' });

  return {
    auth: {
      async login(email: string, password: string) {
        const response = await apiPost('/auth/login', { email, password });
        return handleResponse<{ accessToken: string; user: { id: string; email: string } }>(response);
      },
      logout() { /* no-op — no localStorage to clear */ },
      whoami() { return null; /* no persistent credential store */ },
      isAuthenticated() { return !!resolveAccessToken(); },
      status() {
        return { authenticated: !!resolveAccessToken(), email: undefined, expiresAt: undefined };
      },
      updateAccessToken(token: string) { currentAccessToken = token; },
      async setup(email: string, password: string, displayName?: string) {
        const response = await apiPost('/auth/setup', { email, password, displayName });
        return handleResponse<{ accessToken: string; user: { id: string; email: string } }>(response);
      },
      async setupStatus() {
        return handleResponse<{ needsSetup: boolean }>(await apiGet('/auth/setup/status'));
      },
      async addUser(email: string, password: string, options?: { displayName?: string; roles?: string[] }) {
        const response = await apiPost('/auth/users', {
          email, password,
          displayName: options?.displayName,
          roles: options?.roles ?? ['viewer'],
        });
        return handleResponse<{ user: { id: string; email: string; roles?: string[] } }>(response);
      },
      async listUsers() {
        return handleResponse<unknown>(await apiGet('/auth/users'));
      },
    },
    pack: {
      async list() { return handleResponse<unknown>(await apiGet('/api/packs')); },
      async versions(name: string) { return handleResponse<unknown>(await apiGet(`/api/packs/name/${encodeURIComponent(name)}/versions`)); },
      async info(name: string) { return handleResponse<unknown>(await apiGet(`/api/packs/name/${encodeURIComponent(name)}`)); },
      async delete(name: string) { await handleDeleteResponse(await apiDelete(`/api/packs/name/${encodeURIComponent(name)}`)); },
    },
    node: {
      async list() { return handleResponse<unknown>(await apiGet('/api/nodes')); },
      async status(nameOrId: string) { return handleResponse<unknown>(await apiGet(`/api/nodes/name/${encodeURIComponent(nameOrId)}`)); },
      async logs(nameOrId: string, options?: { tail?: number }) {
        const nodeId = await resolveNodeId(nameOrId, apiGet);
        const params = new URLSearchParams();
        if (options?.tail) params.set('tail', String(options.tail));
        const qs = params.toString();
        return handleResponse<unknown>(await apiGet(`/api/nodes/${nodeId}/logs${qs ? '?' + qs : ''}`));
      },
    },
    pod: {
      async list(options?: { namespace?: string; status?: string }) {
        const params = new URLSearchParams();
        if (options?.namespace) params.set('namespace', options.namespace);
        if (options?.status) params.set('status', options.status);
        const qs = params.toString();
        return handleResponse<unknown>(await apiGet(`/api/pods${qs ? '?' + qs : ''}`));
      },
      async status(podId: string) { return handleResponse<unknown>(await apiGet(`/api/pods/${podId}`)); },
      async create(packName: string, options?: { namespace?: string; packVersion?: string; nodeId?: string }) {
        const body: Record<string, unknown> = { packName, namespace: options?.namespace ?? 'default' };
        if (options?.packVersion) body.packVersion = options.packVersion;
        if (options?.nodeId) body.nodeId = options.nodeId;
        return handleResponse<unknown>(await apiPost('/api/pods', body));
      },
      async stop(podId: string) { return handleResponse<unknown>(await apiPost(`/api/pods/${podId}/stop`, {})); },
      async rollback(podId: string) { return handleResponse<unknown>(await apiPost(`/api/pods/${podId}/rollback`, {})); },
      async history(podId: string) { return handleResponse<unknown>(await apiGet(`/api/pods/${podId}/history`)); },
      async logs(podId: string, options?: { tail?: number }) {
        const params = new URLSearchParams();
        if (options?.tail) params.set('tail', String(options.tail));
        const qs = params.toString();
        return handleResponse<unknown>(await apiGet(`/api/pods/${podId}/logs${qs ? '?' + qs : ''}`));
      },
    },
    service: {
      async list(options?: { namespace?: string }) {
        const params = new URLSearchParams();
        if (options?.namespace) params.set('namespace', options.namespace);
        const qs = params.toString();
        return handleResponse<unknown>(await apiGet(`/api/services${qs ? '?' + qs : ''}`));
      },
      async status(name: string) { return handleResponse<unknown>(await apiGet(`/api/services/name/${encodeURIComponent(name)}`)); },
      async create(packName: string, options?: { namespace?: string; replicas?: number; visibility?: string }) {
        const body = { packName, namespace: options?.namespace ?? 'default', replicas: options?.replicas ?? 1, visibility: options?.visibility ?? 'private' };
        return handleResponse<unknown>(await apiPost('/api/services', body));
      },
    },
    namespace: {
      async list() { return handleResponse<unknown>(await apiGet('/api/namespaces')); },
      async get(name: string) { return handleResponse<unknown>(await apiGet(`/api/namespaces/name/${encodeURIComponent(name)}`)); },
      async create(name: string) { return handleResponse<unknown>(await apiPost('/api/namespaces', { name })); },
      async delete(name: string) { await handleDeleteResponse(await apiDelete(`/api/namespaces/name/${encodeURIComponent(name)}`)); },
      current() { return currentNamespace; },
      use(name: string) { currentNamespace = name; },
    },
    secret: {
      async list(options?: { namespace?: string }) {
        const params = new URLSearchParams();
        if (options?.namespace) params.set('namespace', options.namespace);
        const qs = params.toString();
        return handleResponse<unknown>(await apiGet(`/api/secrets${qs ? '?' + qs : ''}`));
      },
      async get(name: string, namespace?: string) {
        const ns = namespace ?? 'default';
        return handleResponse<unknown>(await apiGet(`/api/secrets/name/${encodeURIComponent(name)}?namespace=${ns}`));
      },
    },
    volume: {
      async list(options?: { nodeNameOrId?: string }) {
        const params = new URLSearchParams();
        if (options?.nodeNameOrId) {
          const nodeId = await resolveNodeId(options.nodeNameOrId, apiGet);
          params.set('nodeId', nodeId);
        }
        const qs = params.toString();
        return handleResponse<unknown>(await apiGet(`/api/volumes${qs ? '?' + qs : ''}`));
      },
      async create(name: string, nodeNameOrId: string) {
        const nodeId = await resolveNodeId(nodeNameOrId, apiGet);
        return handleResponse<unknown>(await apiPost('/api/volumes', { name, nodeId }));
      },
      async download(name: string, nodeNameOrId: string) {
        const nodeId = await resolveNodeId(nodeNameOrId, apiGet);
        const params = new URLSearchParams({ nodeId });
        const url = `/api/volumes/name/${encodeURIComponent(name)}/download?${params.toString()}`;
        return handleResponse<{ files: Array<{ path: string; data: string }> }>(await apiGet(url));
      },
    },
    chaos: {
      async status() { return handleResponse<unknown>(await apiGet('/chaos/status')); },
      async enable() { return handleResponse<unknown>(await apiPost('/chaos/enable', {})); },
      async disable() { return handleResponse<unknown>(await apiPost('/chaos/disable', {})); },
      async scenarios() { return handleResponse<unknown>(await apiGet('/chaos/scenarios')); },
      async connections() { return handleResponse<unknown>(await apiGet('/chaos/connections')); },
      async nodes() { return handleResponse<unknown>(await apiGet('/chaos/nodes')); },
      async events() { return handleResponse<unknown>(await apiGet('/chaos/events')); },
      async reset() { return handleResponse<unknown>(await apiPost('/chaos/reset', {})); },
    },
    network: {
      async policies() { return handleResponse<unknown>(await apiGet('/api/network/policies')); },
      async registry() { return handleResponse<unknown>(await apiGet('/api/network/registry')); },
    },
    serverConfig: {
      async get() { return handleResponse<unknown>(await apiGet('/api/config')); },
    },
  };
}
