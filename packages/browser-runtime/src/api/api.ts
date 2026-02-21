/**
 * Browser Stark API
 *
 * Provides a standard programmatic API for orchestrator operations.
 * This is the object exposed as `context.starkAPI` to packs running in pods.
 *
 * @module @stark-o/browser-runtime/api/api
 */

import {
  createApiClient,
  resolveApiUrl,
  resolveNodeId,
  loadConfig,
  saveConfig,
  loadCredentials,
  saveCredentials,
  clearCredentials,
  isAuthenticated,
  type BrowserApiConfig,
} from './client.js';
import { downloadVolume as downloadVolumeZip, archiveVolumePath as archiveVolumePathZip } from './volume.js';

/**
 * API response wrapper used by orchestrator endpoints
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
 * Standard Stark API interface for browser environments.
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
  };
  pod: {
    list(options?: { namespace?: string; status?: string }): Promise<unknown>;
    status(podId: string): Promise<unknown>;
    create(packName: string, options?: { namespace?: string; packVersion?: string; nodeId?: string; volumeMounts?: Array<{ name: string; mountPath: string }> }): Promise<unknown>;
    stop(podId: string): Promise<void>;
    rollback(podId: string): Promise<unknown>;
    history(podId: string): Promise<unknown>;
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
    downloadAsZip(name: string, nodeNameOrId: string): Promise<Uint8Array>;
    archivePathAsZip(nodeNameOrId: string, name: string, archivePath: string): Promise<Uint8Array>;
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
  config: {
    get(): BrowserApiConfig;
    set(key: string, value: string): void;
  };
}

/**
 * Helper to handle API response and throw on failure
 */
async function handleResponse<T>(response: Response): Promise<T> {
  const result = (await response.json()) as ApiResponse<T>;
  if (!result.success || !result.data) {
    throw new Error(result.error?.message ?? 'Request failed');
  }
  return result.data;
}

/**
 * Helper for API calls that don't return data (deletes)
 */
async function handleDeleteResponse(response: Response): Promise<void> {
  const result = (await response.json()) as ApiResponse<unknown>;
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Request failed');
  }
}

/**
 * Creates a standard StarkAPI instance.
 *
 * @param overrides - Optional config overrides (e.g. apiUrl).
 *                    Pass `accessToken` to provide an explicit Bearer token
 *                    (used in Web Workers that lack localStorage).
 * @returns StarkAPI object suitable for use as context.starkAPI
 */
export function createStarkAPI(overrides?: Partial<BrowserApiConfig> & { accessToken?: string }): StarkAPI {
  const { accessToken: initialToken, ...configOverrides } = overrides ?? {};

  // Mutable access token — updated in-memory by auth:token-refreshed messages
  let currentAccessToken = initialToken;

  const getConfig = (): BrowserApiConfig => {
    const base = loadConfig();
    const apiUrl = configOverrides.apiUrl ?? resolveApiUrl();
    return { ...base, ...configOverrides, apiUrl };
  };

  const getApi = () => createApiClient(getConfig(), currentAccessToken);

  return {
    auth: {
      async login(email: string, password: string) {
        const api = getApi();
        const response = await api.post('/auth/login', { email, password });
        const data = await handleResponse<{
          accessToken: string;
          refreshToken?: string;
          expiresAt: string;
          user: { id: string; email: string };
        }>(response);
        saveCredentials({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
          userId: data.user.id,
          email: data.user.email,
        });
        return data;
      },
      logout() { clearCredentials(); },
      whoami() {
        const creds = loadCredentials();
        if (!creds || !isAuthenticated()) return null;
        return { email: creds.email, userId: creds.userId };
      },
      isAuthenticated() { return isAuthenticated(); },
      status() {
        const authed = isAuthenticated();
        const creds = loadCredentials();
        return {
          authenticated: authed,
          email: authed ? creds?.email : undefined,
          expiresAt: authed ? creds?.expiresAt : undefined,
        };
      },
      updateAccessToken(token: string) { currentAccessToken = token; },
      async setup(email: string, password: string, displayName?: string) {
        const api = getApi();
        const response = await api.post('/auth/setup', { email, password, displayName: displayName || undefined });
        const data = await handleResponse<{
          accessToken: string;
          refreshToken?: string;
          expiresAt: string;
          user: { id: string; email: string };
        }>(response);
        saveCredentials({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
          userId: data.user.id,
          email: data.user.email,
        });
        return data;
      },
      async setupStatus() {
        const api = getApi();
        const response = await api.get('/auth/setup/status');
        return handleResponse<{ needsSetup: boolean }>(response);
      },
      async addUser(email: string, password: string, options?: { displayName?: string; roles?: string[] }) {
        const api = getApi();
        const response = await api.post('/auth/users', {
          email, password,
          displayName: options?.displayName || undefined,
          roles: options?.roles ?? ['viewer'],
        });
        return handleResponse<{ user: { id: string; email: string; roles?: string[] } }>(response);
      },
      async listUsers() {
        const api = getApi();
        const response = await api.get('/auth/users');
        return handleResponse<unknown>(response);
      },
    },
    pack: {
      async list() { return handleResponse<unknown>(await getApi().get('/api/packs')); },
      async versions(name: string) { return handleResponse<unknown>(await getApi().get(`/api/packs/name/${encodeURIComponent(name)}/versions`)); },
      async info(name: string) { return handleResponse<unknown>(await getApi().get(`/api/packs/name/${encodeURIComponent(name)}`)); },
      async delete(name: string) { await handleDeleteResponse(await getApi().delete(`/api/packs/name/${encodeURIComponent(name)}`)); },
    },
    node: {
      async list() { return handleResponse<unknown>(await getApi().get('/api/nodes?pageSize=100')); },
      async status(nameOrId: string) { return handleResponse<unknown>(await getApi().get(`/api/nodes/name/${encodeURIComponent(nameOrId)}`)); },
    },
    pod: {
      async list(options?: { namespace?: string; status?: string }) {
        const params = new URLSearchParams();
        params.set('pageSize', '100');
        if (options?.namespace) params.set('namespace', options.namespace);
        if (options?.status) params.set('status', options.status);
        return handleResponse<unknown>(await getApi().get(`/api/pods?${params.toString()}`));
      },
      async status(podId: string) { return handleResponse<unknown>(await getApi().get(`/api/pods/${podId}`)); },
      async create(packName: string, options?: { namespace?: string; packVersion?: string; nodeId?: string; volumeMounts?: Array<{ name: string; mountPath: string }> }) {
        const body: Record<string, unknown> = { packName, namespace: options?.namespace ?? 'default' };
        if (options?.packVersion) body.packVersion = options.packVersion;
        if (options?.nodeId) body.nodeId = options.nodeId;
        if (options?.volumeMounts) body.volumeMounts = options.volumeMounts;
        return handleResponse<unknown>(await getApi().post('/api/pods', body));
      },
      async stop(podId: string) { return handleDeleteResponse(await getApi().delete(`/api/pods/${podId}`)); },
      async rollback(podId: string) { return handleResponse<unknown>(await getApi().post(`/api/pods/${podId}/rollback`, {})); },
      async history(podId: string) { return handleResponse<unknown>(await getApi().get(`/api/pods/${podId}/history`)); },
    },
    service: {
      async list(options?: { namespace?: string }) {
        const params = new URLSearchParams();
        if (options?.namespace) params.set('namespace', options.namespace);
        const qs = params.toString();
        return handleResponse<unknown>(await getApi().get(`/api/services${qs ? '?' + qs : ''}`));
      },
      async status(name: string) { return handleResponse<unknown>(await getApi().get(`/api/services/name/${encodeURIComponent(name)}`)); },
      async create(packName: string, options?: { namespace?: string; replicas?: number; visibility?: string }) {
        const body = { packName, namespace: options?.namespace ?? 'default', replicas: options?.replicas ?? 1, visibility: options?.visibility ?? 'private' };
        return handleResponse<unknown>(await getApi().post('/api/services', body));
      },
    },
    namespace: {
      async list() { return handleResponse<unknown>(await getApi().get('/api/namespaces')); },
      async get(name: string) { return handleResponse<unknown>(await getApi().get(`/api/namespaces/name/${encodeURIComponent(name)}`)); },
      async create(name: string) { return handleResponse<unknown>(await getApi().post('/api/namespaces', { name })); },
      async delete(name: string) { await handleDeleteResponse(await getApi().delete(`/api/namespaces/name/${encodeURIComponent(name)}`)); },
      current() { return loadConfig().defaultNamespace; },
      use(name: string) { saveConfig({ defaultNamespace: name }); },
    },
    secret: {
      async list(options?: { namespace?: string }) {
        const params = new URLSearchParams();
        if (options?.namespace) params.set('namespace', options.namespace);
        const qs = params.toString();
        return handleResponse<unknown>(await getApi().get(`/api/secrets${qs ? '?' + qs : ''}`));
      },
      async get(name: string, namespace?: string) {
        const ns = namespace ?? 'default';
        return handleResponse<unknown>(await getApi().get(`/api/secrets/name/${encodeURIComponent(name)}?namespace=${ns}`));
      },
    },
    volume: {
      async list(options?: { nodeNameOrId?: string }) {
        const api = getApi();
        const params = new URLSearchParams();
        if (options?.nodeNameOrId) {
          const nodeId = await resolveNodeId(options.nodeNameOrId, api);
          params.set('nodeId', nodeId);
        }
        const qs = params.toString();
        return handleResponse<unknown>(await api.get(`/api/volumes${qs ? '?' + qs : ''}`));
      },
      async create(name: string, nodeNameOrId: string) {
        const api = getApi();
        const nodeId = await resolveNodeId(nodeNameOrId, api);
        return handleResponse<unknown>(await api.post('/api/volumes', { name, nodeId }));
      },
      async download(name: string, nodeNameOrId: string) {
        const api = getApi();
        const nodeId = await resolveNodeId(nodeNameOrId, api);
        const params = new URLSearchParams({ nodeId });
        const url = `/api/volumes/name/${encodeURIComponent(name)}/download?${params.toString()}`;
        return handleResponse<{ files: Array<{ path: string; data: string }> }>(await api.get(url));
      },
      async downloadAsZip(name: string, nodeNameOrId: string) {
        return downloadVolumeZip(name, nodeNameOrId);
      },
      async archivePathAsZip(nodeNameOrId: string, name: string, archivePath: string) {
        return archiveVolumePathZip(nodeNameOrId, name, archivePath);
      },
    },
    chaos: {
      async status() { return handleResponse<unknown>(await getApi().get('/chaos/status')); },
      async enable() { return handleResponse<unknown>(await getApi().post('/chaos/enable', {})); },
      async disable() { return handleResponse<unknown>(await getApi().post('/chaos/disable', {})); },
      async scenarios() { return handleResponse<unknown>(await getApi().get('/chaos/scenarios')); },
      async connections() { return handleResponse<unknown>(await getApi().get('/chaos/connections')); },
      async nodes() { return handleResponse<unknown>(await getApi().get('/chaos/nodes')); },
      async events() { return handleResponse<unknown>(await getApi().get('/chaos/events')); },
      async reset() { return handleResponse<unknown>(await getApi().post('/chaos/reset', {})); },
    },
    network: {
      async policies() { return handleResponse<unknown>(await getApi().get('/api/network/policies')); },
      async registry() { return handleResponse<unknown>(await getApi().get('/api/network/registry')); },
    },
    serverConfig: {
      async get() { return handleResponse<unknown>(await getApi().get('/api/config')); },
    },
    config: {
      get() { return getConfig(); },
      set(key: string, value: string) {
        const allowedKeys = ['apiUrl', 'supabaseUrl', 'supabaseAnonKey', 'defaultNamespace'];
        if (!allowedKeys.includes(key)) {
          throw new Error(`Invalid config key: ${key}. Allowed keys: ${allowedKeys.join(', ')}`);
        }
        saveConfig({ [key]: value } as Partial<BrowserApiConfig>);
      },
    },
  };
}
