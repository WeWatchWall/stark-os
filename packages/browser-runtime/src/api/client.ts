/**
 * Browser API Client
 *
 * Isomorphic API client for browser runtimes. Provides config management,
 * credential storage, and an authenticated HTTP client using fetch.
 * This is the foundation shared by the CLI layer and pack code (context.starkAPI).
 *
 * @module @stark-o/browser-runtime/api/client
 */

/**
 * Browser API configuration
 */
export interface BrowserApiConfig {
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  defaultNamespace: string;
}

/**
 * Browser credentials stored in localStorage or memory
 */
export interface BrowserCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  userId: string;
  email: string;
}

const DEFAULT_CONFIG: BrowserApiConfig = {
  apiUrl: 'https://127.0.0.1:443',
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  defaultNamespace: 'default',
};

const STORAGE_KEY_CONFIG = 'stark-cli-config';
const STORAGE_KEY_CREDENTIALS = 'stark-cli-credentials';

/**
 * Load configuration from localStorage (or return defaults)
 */
export function loadConfig(): BrowserApiConfig {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (stored) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
      }
    }
  } catch {
    // Return defaults on error
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save configuration to localStorage
 */
export function saveConfig(config: Partial<BrowserApiConfig>): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const current = loadConfig();
      const updated = { ...current, ...config };
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(updated));
    }
  } catch {
    // Silently fail if storage unavailable
  }
}

/**
 * Load credentials from storage
 */
export function loadCredentials(): BrowserCredentials | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY_CREDENTIALS);
      if (stored) {
        return JSON.parse(stored);
      }
    }
  } catch {
    // Return null on error
  }
  return null;
}

/**
 * Save credentials to storage
 */
export function saveCredentials(credentials: BrowserCredentials): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_CREDENTIALS, JSON.stringify(credentials));
    }
  } catch {
    // Silently fail
  }
}

/**
 * Clear stored credentials
 */
export function clearCredentials(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_CREDENTIALS);
    }
  } catch {
    // Silently fail
  }
}

/**
 * Resolve an access token from the pod execution context (__STARK_CONTEXT__).
 * The pack executor sets `_userAccessToken` on the context and updates it
 * when `auth:token-refreshed` messages arrive via sendMessage.
 * Checks both own global and parent window (for srcdoc iframes).
 */
function getContextAccessToken(): string | null {
  try {
    const ctx = (globalThis as Record<string, unknown>).__STARK_CONTEXT__ as
      { _userAccessToken?: string } | undefined;
    if (ctx?._userAccessToken) return ctx._userAccessToken;
  } catch { /* ignore */ }

  try {
    const g = globalThis as Record<string, unknown>;
    if (g.parent && g.parent !== globalThis) {
      const ctx = (g.parent as Record<string, unknown>).__STARK_CONTEXT__ as
        { _userAccessToken?: string } | undefined;
      if (ctx?._userAccessToken) return ctx._userAccessToken;
    }
  } catch { /* cross-origin — ignore */ }

  return null;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  // In-memory context token (set by pack executor, refreshed via sendMessage)
  if (getContextAccessToken()) return true;

  // Fallback to localStorage (for the node shell, not running as a pod)
  const creds = loadCredentials();
  if (!creds) return false;
  const expiresAt = new Date(creds.expiresAt);
  return expiresAt > new Date();
}

/**
 * Get the current access token
 */
export function getAccessToken(): string | null {
  // In-memory context token (set by pack executor, refreshed via sendMessage)
  const contextToken = getContextAccessToken();
  if (contextToken) return contextToken;

  // Fallback to localStorage (for the node shell, not running as a pod)
  const creds = loadCredentials();
  if (!creds) return null;
  const expiresAt = new Date(creds.expiresAt);
  if (expiresAt <= new Date()) return null;
  return creds.accessToken;
}

/**
 * Require authentication — throws if not authenticated
 */
export function requireAuth(): BrowserCredentials {
  const creds = loadCredentials();
  if (!creds) {
    throw new Error('Not authenticated. Please login first.');
  }
  const expiresAt = new Date(creds.expiresAt);
  if (expiresAt <= new Date()) {
    throw new Error('Session expired. Please login again.');
  }
  return creds;
}

/**
 * UUID v4 pattern for node ID resolution
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Authenticated HTTP client interface
 */
export interface ApiClient {
  get: (path: string) => Promise<Response>;
  post: (path: string, body?: unknown) => Promise<Response>;
  put: (path: string, body?: unknown) => Promise<Response>;
  patch: (path: string, body?: unknown) => Promise<Response>;
  delete: (path: string) => Promise<Response>;
}

/**
 * Creates an authenticated HTTP client for API calls (browser-compatible using fetch)
 *
 * @param config - Optional config overrides
 * @param explicitAccessToken - Optional access token override (e.g. for Web Workers that lack localStorage)
 */
export function createApiClient(config?: BrowserApiConfig, explicitAccessToken?: string): ApiClient {
  const cfg = config ?? loadConfig();
  const baseUrl = cfg.apiUrl;
  const accessToken = explicitAccessToken ?? getAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  return {
    get: (path: string) =>
      fetch(`${baseUrl}${path}`, { method: 'GET', headers }),

    post: (path: string, body?: unknown) =>
      fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      }),

    put: (path: string, body?: unknown) =>
      fetch(`${baseUrl}${path}`, {
        method: 'PUT',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      }),

    patch: (path: string, body?: unknown) =>
      fetch(`${baseUrl}${path}`, {
        method: 'PATCH',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      }),

    delete: (path: string) =>
      fetch(`${baseUrl}${path}`, { method: 'DELETE', headers }),
  };
}

/**
 * Resolves a node name-or-UUID to a UUID.
 */
export async function resolveNodeId(
  nameOrId: string,
  api: ApiClient,
): Promise<string> {
  if (UUID_PATTERN.test(nameOrId)) {
    return nameOrId;
  }

  const response = await api.get(`/api/nodes/name/${encodeURIComponent(nameOrId)}`);
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
 * Resolve the API URL from multiple sources with fallbacks:
 * 1. Explicit config in localStorage
 * 2. __STARK_CONTEXT__.orchestratorUrl (set by pack executor for pods)
 * 3. location.origin (works on main thread)
 * 4. Hard-coded fallback
 */
export function resolveApiUrl(): string {
  const cfgUrl = loadConfig().apiUrl;
  if (cfgUrl && cfgUrl !== 'null' && cfgUrl !== DEFAULT_CONFIG.apiUrl) return cfgUrl;

  // Derive HTTP URL from orchestrator WebSocket URL set on pod context
  const ctx = (globalThis as Record<string, unknown>).__STARK_CONTEXT__ as
    { orchestratorUrl?: string } | undefined;
  if (ctx?.orchestratorUrl) {
    try {
      const u = new URL(ctx.orchestratorUrl);
      u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
      u.pathname = '/';
      return u.origin;
    } catch { /* malformed — try next */ }
  }

  if (typeof globalThis.location !== 'undefined') {
    const origin = globalThis.location.origin;
    if (origin && origin !== 'null') return origin;
  }

  // srcdoc iframes have location.origin === 'null'; try the parent window
  try {
    if (typeof globalThis.parent !== 'undefined' && globalThis.parent !== globalThis) {
      const parentOrigin = (globalThis.parent as { location?: { origin?: string } }).location?.origin;
      if (parentOrigin && parentOrigin !== 'null') return parentOrigin;
    }
  } catch { /* cross-origin — ignore */ }

  return cfgUrl || DEFAULT_CONFIG.apiUrl;
}
