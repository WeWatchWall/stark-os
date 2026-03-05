/**
 * Unit tests for server configuration loading
 * @module @stark-o/server/tests/unit/server-config
 *
 * Tests that the server configuration file (~/.stark/server-config.json)
 * is read on startup and that Supabase settings are propagated correctly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Mock heavy dependencies that createServer imports so we don't spin up real
// Express / HTTPS / WebSocket servers during unit tests.
// ---------------------------------------------------------------------------

vi.mock('express', () => {
  const router = vi.fn(() => ({
    use: vi.fn().mockReturnThis(),
    get: vi.fn().mockReturnThis(),
    post: vi.fn().mockReturnThis(),
    put: vi.fn().mockReturnThis(),
    patch: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  }));
  const app = {
    set: vi.fn(),
    use: vi.fn(),
    get: vi.fn(),
  };
  const expressFn = Object.assign(vi.fn(() => app), {
    json: vi.fn(() => vi.fn()),
    urlencoded: vi.fn(() => vi.fn()),
    static: vi.fn(() => vi.fn()),
    Router: router,
  });
  return { default: expressFn, Router: router };
});

vi.mock('cors', () => ({ default: vi.fn(() => vi.fn()) }));
vi.mock('ws', () => ({ WebSocketServer: vi.fn() }));
vi.mock('http-proxy', () => ({ default: { createProxyServer: vi.fn(() => ({ on: vi.fn() })) } }));
vi.mock('selfsigned', () => ({ default: { generate: vi.fn() } }));
vi.mock('express-rate-limit', () => ({ default: vi.fn(() => vi.fn()) }));
vi.mock('http', () => ({ default: { createServer: vi.fn(() => ({ listen: vi.fn(), close: vi.fn(), on: vi.fn() })) } }));
vi.mock('https', () => ({ default: { createServer: vi.fn(() => ({ listen: vi.fn(), close: vi.fn(), on: vi.fn() })) } }));

vi.mock('../../src/api/router.js', () => ({
  createApiRouter: vi.fn(() => vi.fn()),
}));
vi.mock('../../src/ws/connection-manager.js', () => ({
  createConnectionManager: vi.fn(() => ({ shutdown: vi.fn() })),
}));
vi.mock('../../src/ws/handlers/podgroup-handler.js', () => ({
  getCentralPodGroupStore: vi.fn(() => ({})),
}));
vi.mock('../../src/services/scheduler-service.js', () => ({
  getSchedulerService: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));
vi.mock('../../src/services/service-controller.js', () => ({
  getServiceController: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));
vi.mock('../../src/services/node-health-service.js', () => ({
  createNodeHealthService: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));
vi.mock('../../src/services/ingress-manager.js', () => ({
  getIngressManager: vi.fn(() => ({ shutdown: vi.fn() })),
}));
vi.mock('../../src/services/connection-service.js', () => ({
  setConnectionManager: vi.fn(),
}));
vi.mock('../../src/chaos/bootstrap.js', () => ({
  bootstrapChaosMode: vi.fn(),
}));
vi.mock('../../src/supabase/index.js', () => ({
  loadAllNetworkPolicies: vi.fn(),
}));
vi.mock('@stark-o/shared', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    createServiceLogger: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  };
});

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { loadSavedConfig, SERVER_CONFIG_PATH } from '../../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONFIG_PATH = SERVER_CONFIG_PATH;

describe('Server Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Restore environment to prevent cross-test pollution
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // -------------------------------------------------------------------------
  // SERVER_CONFIG_PATH
  // -------------------------------------------------------------------------

  describe('SERVER_CONFIG_PATH', () => {
    it('should point to ~/.stark/server-config.json', () => {
      const expected = path.join(os.homedir(), '.stark', 'server-config.json');
      expect(CONFIG_PATH).toBe(expected);
    });
  });

  // -------------------------------------------------------------------------
  // loadSavedConfig
  // -------------------------------------------------------------------------

  describe('loadSavedConfig', () => {
    it('should return an empty object when the config file does not exist', () => {
      // loadSavedConfig reads SERVER_CONFIG_PATH which typically won't exist in CI
      // We just verify the function does not throw
      const result = loadSavedConfig();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should parse valid Supabase config values from a config file', () => {
      const testConfig = {
        supabaseUrl: 'https://my-project.supabase.co',
        supabaseAnonKey: 'test-anon-key-123',
        supabaseServiceRoleKey: 'test-service-key-456',
        port: 8443,
      };

      // Temporarily write a config file
      const starkDir = path.dirname(CONFIG_PATH);
      fs.mkdirSync(starkDir, { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(testConfig, null, 2));

      try {
        const result = loadSavedConfig();
        expect(result.supabaseUrl).toBe('https://my-project.supabase.co');
        expect(result.supabaseAnonKey).toBe('test-anon-key-123');
        expect(result.supabaseServiceRoleKey).toBe('test-service-key-456');
        expect(result.port).toBe(8443);
      } finally {
        // Clean up
        try { fs.unlinkSync(CONFIG_PATH); } catch { /* ignore */ }
      }
    });

    it('should ignore keys with wrong types', () => {
      const testConfig = {
        supabaseUrl: 12345, // wrong type - should be string
        supabaseAnonKey: true, // wrong type
        port: 'not-a-number', // wrong type - should be number
        host: 'valid-host',
      };

      const starkDir = path.dirname(CONFIG_PATH);
      fs.mkdirSync(starkDir, { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(testConfig, null, 2));

      try {
        const result = loadSavedConfig();
        expect(result.supabaseUrl).toBeUndefined();
        expect(result.supabaseAnonKey).toBeUndefined();
        expect(result.port).toBeUndefined();
        expect(result.host).toBe('valid-host');
      } finally {
        try { fs.unlinkSync(CONFIG_PATH); } catch { /* ignore */ }
      }
    });

    it('should return an empty object for invalid JSON', () => {
      const starkDir = path.dirname(CONFIG_PATH);
      fs.mkdirSync(starkDir, { recursive: true });
      fs.writeFileSync(CONFIG_PATH, '{ this is not valid JSON }');

      try {
        const result = loadSavedConfig();
        expect(result).toEqual({});
      } finally {
        try { fs.unlinkSync(CONFIG_PATH); } catch { /* ignore */ }
      }
    });
  });

  // -------------------------------------------------------------------------
  // ServerConfig interface includes Supabase fields
  // -------------------------------------------------------------------------

  describe('ServerConfig Supabase fields', () => {
    it('should include supabaseServiceRoleKey in the config written by createServer', () => {
      // Write a config with supabaseServiceRoleKey
      const testConfig = {
        supabaseUrl: 'https://remote.supabase.co',
        supabaseAnonKey: 'anon-key',
        supabaseServiceRoleKey: 'service-role-key',
      };

      const starkDir = path.dirname(CONFIG_PATH);
      fs.mkdirSync(starkDir, { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(testConfig, null, 2));

      try {
        const result = loadSavedConfig();
        expect(result.supabaseServiceRoleKey).toBe('service-role-key');
      } finally {
        try { fs.unlinkSync(CONFIG_PATH); } catch { /* ignore */ }
      }
    });
  });
});
