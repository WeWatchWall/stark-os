/**
 * Unit tests for secret-crypto — master key idempotency and persistence
 * @module @stark-o/core/tests/unit/secret-crypto
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import {
  initMasterKey,
  resetMasterKey,
  encryptSecretData,
  decryptSecretData,
} from '../../src/services/secret-crypto';

const MASTER_KEY_PATH = join(homedir(), '.stark', 'master.key');

describe('secret-crypto', () => {
  const originalEnv = process.env.STARK_MASTER_KEY;

  beforeEach(() => {
    resetMasterKey();
    delete process.env.STARK_MASTER_KEY;
  });

  afterEach(() => {
    resetMasterKey();
    if (originalEnv !== undefined) {
      process.env.STARK_MASTER_KEY = originalEnv;
    } else {
      delete process.env.STARK_MASTER_KEY;
    }
  });

  describe('initMasterKey idempotency', () => {
    it('should use the same key across multiple initMasterKey() calls', () => {
      // This is the core bug fix: encrypt, call initMasterKey again, decrypt must succeed
      initMasterKey();
      const data = { username: 'admin', password: 's3cr3t' };
      const encrypted = encryptSecretData(data);

      // Call initMasterKey again (the bug: this used to generate a NEW random key)
      initMasterKey();

      // Decrypt should succeed because the key was not regenerated
      const decrypted = decryptSecretData(encrypted.ciphertext, encrypted.iv, encrypted.authTag);
      expect(decrypted).toEqual(data);
      expect(Object.keys(decrypted).length).toBe(2);
    });

    it('should allow explicit key override even when already initialized', () => {
      initMasterKey('key-one');
      const enc = encryptSecretData({ a: '1' });

      // Override with a different explicit key
      initMasterKey('key-two');

      // Decryption with wrong key should throw
      expect(() => decryptSecretData(enc.ciphertext, enc.iv, enc.authTag)).toThrow();
    });

    it('should work with STARK_MASTER_KEY env var', () => {
      process.env.STARK_MASTER_KEY = 'test-env-key';
      initMasterKey();

      const data = { token: 'abc123' };
      const encrypted = encryptSecretData(data);

      // Call initMasterKey again — env var is deterministic so key stays the same
      initMasterKey();

      const decrypted = decryptSecretData(encrypted.ciphertext, encrypted.iv, encrypted.authTag);
      expect(decrypted).toEqual(data);
    });
  });

  describe('key persistence', () => {
    it('should persist a generated key to ~/.stark/master.key', () => {
      // Remove any existing key file
      try { unlinkSync(MASTER_KEY_PATH); } catch { /* ok */ }

      initMasterKey();

      expect(existsSync(MASTER_KEY_PATH)).toBe(true);
      const keyOnDisk = readFileSync(MASTER_KEY_PATH, 'utf8').trim();
      expect(keyOnDisk).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex = 64 chars
    });

    it('should load persisted key on restart (reset + re-init)', () => {
      // First run: generate + persist
      initMasterKey();
      const data = { secret: 'value' };
      const encrypted = encryptSecretData(data);

      // Simulate restart: clear in-memory key, re-init (should load from file)
      resetMasterKey();
      initMasterKey();

      const decrypted = decryptSecretData(encrypted.ciphertext, encrypted.iv, encrypted.authTag);
      expect(decrypted).toEqual(data);
    });
  });

  describe('encrypt/decrypt roundtrip', () => {
    it('should encrypt and decrypt arbitrary key-value data', () => {
      initMasterKey();
      const data = { DB_HOST: 'localhost', DB_PASS: 'hunter2', API_KEY: 'sk-abc' };
      const encrypted = encryptSecretData(data);

      expect(encrypted.ciphertext).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.authTag).toBeTruthy();

      const decrypted = decryptSecretData(encrypted.ciphertext, encrypted.iv, encrypted.authTag);
      expect(decrypted).toEqual(data);
      expect(Object.keys(decrypted).length).toBe(3);
    });
  });
});
