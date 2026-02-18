/**
 * Browser CLI Tests
 *
 * Tests for the browser CLI handlers and configuration.
 * @module @stark-o/browser-cli/tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeCommand,
  type OutputWriter,
  type CommandResult,
} from '../../src/handlers.js';
import {
  loadConfig,
  saveConfig,
  loadCredentials,
  saveCredentials,
  clearCredentials,
  isAuthenticated,
  getAccessToken,
  requireAuth,
  createApiClient,
} from '../../src/config.js';

// ============================================================================
// Mock localStorage for Node.js test environment
// ============================================================================

const storageMap = new Map<string, string>();

const mockLocalStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, value),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  get length() { return storageMap.size; },
  key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
};

// Set up localStorage mock
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// ============================================================================
// Config Tests
// ============================================================================

describe('Browser CLI Config', () => {
  beforeEach(() => {
    storageMap.clear();
    vi.clearAllMocks();
  });

  describe('loadConfig', () => {
    it('should return default config when nothing stored', () => {
      const config = loadConfig();
      expect(config.apiUrl).toBe('https://127.0.0.1:443');
      expect(config.defaultNamespace).toBe('default');
    });

    it('should load stored config', () => {
      storageMap.set('stark-cli-config', JSON.stringify({ apiUrl: 'https://custom.api' }));
      const config = loadConfig();
      expect(config.apiUrl).toBe('https://custom.api');
      expect(config.defaultNamespace).toBe('default'); // default preserved
    });
  });

  describe('saveConfig', () => {
    it('should save config to storage', () => {
      saveConfig({ defaultNamespace: 'production' });
      const stored = JSON.parse(storageMap.get('stark-cli-config')!);
      expect(stored.defaultNamespace).toBe('production');
    });
  });

  describe('credentials', () => {
    const testCredentials = {
      accessToken: 'test-token',
      refreshToken: 'test-refresh',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      userId: 'user-123',
      email: 'test@example.com',
    };

    it('should save and load credentials', () => {
      saveCredentials(testCredentials);
      const loaded = loadCredentials();
      expect(loaded?.email).toBe('test@example.com');
      expect(loaded?.accessToken).toBe('test-token');
    });

    it('should return null when no credentials', () => {
      expect(loadCredentials()).toBeNull();
    });

    it('should clear credentials', () => {
      saveCredentials(testCredentials);
      clearCredentials();
      expect(loadCredentials()).toBeNull();
    });

    it('should detect authenticated state', () => {
      saveCredentials(testCredentials);
      expect(isAuthenticated()).toBe(true);
    });

    it('should detect expired credentials', () => {
      saveCredentials({
        ...testCredentials,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      });
      expect(isAuthenticated()).toBe(false);
    });

    it('should get access token when authenticated', () => {
      saveCredentials(testCredentials);
      expect(getAccessToken()).toBe('test-token');
    });

    it('should return null access token when expired', () => {
      saveCredentials({
        ...testCredentials,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      });
      expect(getAccessToken()).toBeNull();
    });

    it('should throw on requireAuth when not authenticated', () => {
      expect(() => requireAuth()).toThrow('Not authenticated');
    });
  });
});

// ============================================================================
// Command Handler Tests
// ============================================================================

describe('Browser CLI Commands', () => {
  let output: string[];
  const write: OutputWriter = (text: string) => { output.push(text); };

  beforeEach(() => {
    output = [];
    storageMap.clear();
    vi.clearAllMocks();

    // Set up authenticated state
    saveCredentials({
      accessToken: 'test-token',
      refreshToken: 'test-refresh',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      userId: 'user-123',
      email: 'test@example.com',
    });
  });

  describe('help', () => {
    it('should show help text', async () => {
      const result = await executeCommand(['help'], write);
      expect(result.success).toBe(true);
      expect(output.join('')).toContain('Stark Orchestrator CLI');
      expect(output.join('')).toContain('auth');
      expect(output.join('')).toContain('pack');
      expect(output.join('')).toContain('node');
    });
  });

  describe('status', () => {
    it('should show cluster status', async () => {
      const result = await executeCommand(['status'], write);
      expect(result.success).toBe(true);
      expect(output.join('')).toContain('Authenticated: Yes');
    });
  });

  describe('auth', () => {
    it('should show whoami when authenticated', async () => {
      const result = await executeCommand(['auth', 'whoami'], write);
      expect(result.success).toBe(true);
      expect(output.join('')).toContain('test@example.com');
    });

    it('should show auth status', async () => {
      const result = await executeCommand(['auth', 'status'], write);
      expect(result.success).toBe(true);
      expect(output.join('')).toContain('Authenticated: Yes');
    });

    it('should handle logout', async () => {
      const result = await executeCommand(['auth', 'logout'], write);
      expect(result.success).toBe(true);
      expect(loadCredentials()).toBeNull();
    });
  });

  describe('namespace', () => {
    it('should show current namespace', async () => {
      const result = await executeCommand(['namespace', 'current'], write);
      expect(result.success).toBe(true);
      expect(output.join('')).toContain('default');
    });

    it('should set namespace', async () => {
      const result = await executeCommand(['namespace', 'use', 'production'], write);
      expect(result.success).toBe(true);
      const config = loadConfig();
      expect(config.defaultNamespace).toBe('production');
    });
  });

  describe('config', () => {
    it('should show current config', async () => {
      const result = await executeCommand(['config'], write);
      expect(result.success).toBe(true);
      expect(output.join('')).toContain('apiUrl');
    });
  });

  describe('unknown commands', () => {
    it('should handle unknown top-level command', async () => {
      const result = await executeCommand(['foobar'], write);
      expect(result.success).toBe(false);
      expect(output.join('')).toContain('Unknown command: foobar');
    });

    it('should handle empty args', async () => {
      const result = await executeCommand([], write);
      expect(result.success).toBe(false);
    });
  });

  describe('API commands with mocked fetch', () => {
    it('should handle pack list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { packs: [{ id: '1', name: 'test-pack' }], total: 1 },
        }),
      } as Response);

      const result = await executeCommand(['pack', 'list'], write);
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/packs'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle node list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { nodes: [] },
        }),
      } as Response);

      const result = await executeCommand(['node', 'list'], write);
      expect(result.success).toBe(true);
    });

    it('should handle pod list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { pods: [] },
        }),
      } as Response);

      const result = await executeCommand(['pod', 'list'], write);
      expect(result.success).toBe(true);
    });
  });
});
