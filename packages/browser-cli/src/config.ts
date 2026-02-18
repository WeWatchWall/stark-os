/**
 * Browser CLI API Client
 *
 * Isomorphic API client that works in both Node.js and browser.
 * Mirrors the Node.js CLI's config.ts but uses browser-compatible storage.
 * @module @stark-o/browser-cli/config
 */

/**
 * Browser CLI configuration
 */
export interface BrowserCliConfig {
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

const DEFAULT_CONFIG: BrowserCliConfig = {
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
export function loadConfig(): BrowserCliConfig {
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
export function saveConfig(config: Partial<BrowserCliConfig>): void {
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
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const creds = loadCredentials();
  if (!creds) return false;
  const expiresAt = new Date(creds.expiresAt);
  return expiresAt > new Date();
}

/**
 * Get the current access token
 */
export function getAccessToken(): string | null {
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
 * Creates an authenticated HTTP client for API calls (browser-compatible using fetch)
 */
export function createApiClient(config?: BrowserCliConfig): {
  get: (path: string) => Promise<Response>;
  post: (path: string, body?: unknown) => Promise<Response>;
  put: (path: string, body?: unknown) => Promise<Response>;
  patch: (path: string, body?: unknown) => Promise<Response>;
  delete: (path: string) => Promise<Response>;
} {
  const cfg = config ?? loadConfig();
  const baseUrl = cfg.apiUrl;
  const accessToken = getAccessToken();

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
  api: ReturnType<typeof createApiClient>,
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
