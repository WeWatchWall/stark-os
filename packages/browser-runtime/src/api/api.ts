/**
 * Browser Stark API
 *
 * Provides a standard programmatic API for orchestrator operations.
 * Delegates common endpoint logic to the shared (portable) StarkAPI and
 * adds browser-specific behaviour: localStorage credential/config
 * persistence and a `config` section.
 *
 * This is the object exposed as `context.starkAPI` to packs running in pods.
 *
 * @module @stark-o/browser-runtime/api/api
 */

import {
  createStarkAPI as createBaseStarkAPI,
  type StarkAPI as BaseStarkAPI,
} from '@stark-o/shared/api/stark-api.js';

import {
  createApiClient,
  resolveApiUrl,
  loadConfig,
  saveConfig,
  loadCredentials,
  saveCredentials,
  clearCredentials,
  isAuthenticated,
  getAccessToken,
  type BrowserApiConfig,
} from './client.js';

import {
  handleResponse,
} from '@stark-o/shared/api/stark-api.js';

/**
 * Standard Stark API interface for browser environments.
 * Extends the portable StarkAPI with browser-specific features.
 */
export interface StarkAPI extends BaseStarkAPI {
  config: {
    get(): BrowserApiConfig;
    set(key: string, value: string): void;
  };
}

/**
 * Creates a standard StarkAPI instance for browser environments.
 *
 * Wraps the shared (portable) StarkAPI and overrides auth/namespace
 * methods with localStorage-backed versions. Adds a `config` section
 * for managing API settings at runtime.
 *
 * @param overrides - Optional config overrides (e.g. apiUrl).
 *                    Pass `accessToken` to provide an explicit Bearer token
 *                    (used in Web Workers that lack localStorage).
 * @returns StarkAPI object suitable for use as context.starkAPI
 */
export function createStarkAPI(overrides?: Partial<BrowserApiConfig> & { accessToken?: string }): StarkAPI {
  const { accessToken: initialToken, ...configOverrides } = overrides ?? {};

  const getConfig = (): BrowserApiConfig => {
    const base = loadConfig();
    const apiUrl = configOverrides.apiUrl ?? resolveApiUrl();
    return { ...base, ...configOverrides, apiUrl };
  };

  // Resolve the access token: explicit > localStorage > __STARK_CONTEXT__
  const browserAccessToken = initialToken ?? getAccessToken() ?? undefined;

  // Create the base (shared) API — it handles all endpoint logic
  const base = createBaseStarkAPI({
    apiUrl: getConfig().apiUrl,
    accessToken: browserAccessToken,
  });

  // We need the browser API client for login/setup which need to
  // re-resolve tokens dynamically and persist credentials.
  const getApi = () => {
    const cfg = getConfig();
    return createApiClient(cfg, initialToken);
  };

  return {
    // ── Delegated sections (identical to shared) ───────────────────
    pack: {
      async list(options) { return base.pack.list(options ?? { pageSize: 100 }); },
      versions: base.pack.versions.bind(base.pack),
      info: base.pack.info.bind(base.pack),
      delete: base.pack.delete.bind(base.pack),
    },
    node: {
      async list(options) { return base.node.list(options ?? { pageSize: 100 }); },
      status: base.node.status.bind(base.node),
      logs: base.node.logs.bind(base.node),
    },
    pod: {
      async list(options) {
        return base.pod.list({ pageSize: 100, ...options });
      },
      status: base.pod.status.bind(base.pod),
      create: base.pod.create.bind(base.pod),
      stop: base.pod.stop.bind(base.pod),
      rollback: base.pod.rollback.bind(base.pod),
      history: base.pod.history.bind(base.pod),
      logs: base.pod.logs.bind(base.pod),
    },
    service: base.service,
    secret: base.secret,
    volume: base.volume,
    chaos: base.chaos,
    network: base.network,
    serverConfig: base.serverConfig,

    // ── Browser-specific overrides ─────────────────────────────────

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
        // Keep the base API's in-memory token in sync
        base.auth.updateAccessToken(data.accessToken);
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
      updateAccessToken(token: string) { base.auth.updateAccessToken(token); },
      async setup(email: string, username: string, password: string, displayName?: string) {
        const api = getApi();
        const response = await api.post('/auth/setup', { email, username, password, displayName: displayName || undefined });
        const data = await handleResponse<{
          accessToken: string;
          refreshToken?: string;
          expiresAt: string;
          user: { id: string; email: string; username: string };
        }>(response);
        saveCredentials({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
          userId: data.user.id,
          email: data.user.email,
        });
        base.auth.updateAccessToken(data.accessToken);
        return data;
      },
      async setupStatus() { return base.auth.setupStatus(); },
      async addUser(email: string, username: string, password: string, options?: { displayName?: string; roles?: string[] }) {
        return base.auth.addUser(email, username, password, options);
      },
      async listUsers() { return base.auth.listUsers(); },
    },

    namespace: {
      list: base.namespace.list.bind(base.namespace),
      get: base.namespace.get.bind(base.namespace),
      create: base.namespace.create.bind(base.namespace),
      delete: base.namespace.delete.bind(base.namespace),
      current() { return loadConfig().defaultNamespace; },
      use(name: string) { saveConfig({ defaultNamespace: name }); },
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
