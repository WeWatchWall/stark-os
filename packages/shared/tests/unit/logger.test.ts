/**
 * Tests for Logger
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, createLogger, createServiceLogger, type LogEntry, type LogPersistFn } from '../../src/logging/logger.js';

describe('Logger', () => {
  describe('setPersist', () => {
    it('calls persist callback with log entry when set', () => {
      const persist = vi.fn<[LogEntry], void>();
      const entries: LogEntry[] = [];
      const logger = new Logger({ level: 'debug', output: () => {} });
      logger.setPersist((entry) => { entries.push(entry); persist(entry); });

      logger.info('test message', { foo: 'bar' });

      expect(persist).toHaveBeenCalledTimes(1);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.message).toBe('test message');
      expect(entries[0]!.level).toBe('info');
      expect(entries[0]!.meta).toMatchObject({ foo: 'bar' });
    });

    it('does not persist when level is below threshold', () => {
      const persist = vi.fn<[LogEntry], void>();
      const logger = new Logger({ level: 'warn', output: () => {} });
      logger.setPersist(persist);

      logger.debug('hidden debug');
      logger.info('hidden info');

      expect(persist).not.toHaveBeenCalled();
    });

    it('can be cleared by passing null', () => {
      const persist = vi.fn<[LogEntry], void>();
      const logger = new Logger({ level: 'debug', output: () => {} });
      logger.setPersist(persist);

      logger.info('one');
      expect(persist).toHaveBeenCalledTimes(1);

      logger.setPersist(null);
      logger.info('two');
      expect(persist).toHaveBeenCalledTimes(1); // still 1
    });

    it('persist is propagated to child loggers', () => {
      const persist = vi.fn<[LogEntry], void>();
      const parent = new Logger({ level: 'debug', output: () => {} });
      parent.setPersist(persist);

      const child = parent.child({ component: 'child-component' });
      child.info('from child');

      expect(persist).toHaveBeenCalledTimes(1);
      expect(persist.mock.calls[0]![0]!.meta).toMatchObject({ component: 'child-component' });
    });

    it('persist set via config is used', () => {
      const persist = vi.fn<[LogEntry], void>();
      const logger = new Logger({ level: 'debug', output: () => {}, persist });

      logger.warn('config persist');

      expect(persist).toHaveBeenCalledTimes(1);
      expect(persist.mock.calls[0]![0]!.level).toBe('warn');
    });
  });

  describe('defaultOutput uses original console references', () => {
    let originalDebug: typeof console.debug;
    let debugSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      // Save the real console.debug
      originalDebug = console.debug;
      debugSpy = vi.fn();
    });

    afterEach(() => {
      // Restore the real console.debug
      console.debug = originalDebug;
    });

    it('does not go through patched console methods', () => {
      // Patch console.debug AFTER the Logger module has already loaded
      // This simulates what a pod console patch does
      const patchedDebug = vi.fn((...args: unknown[]) => {
        // A pod console patch would add a prefix
        originalDebug('[PATCHED]', ...args);
      });
      console.debug = patchedDebug;

      // Create a logger AFTER console is patched
      const logger = createLogger({ level: 'debug', pretty: true, component: 'test' });
      logger.debug('should not be patched');

      // The patched console.debug should NOT have been called
      // because Logger uses ORIGINAL_CONSOLE captured at module load time
      expect(patchedDebug).not.toHaveBeenCalled();
    });
  });

  describe('formatPretty', () => {
    it('entry includes component in meta for pretty output', () => {
      const entries: LogEntry[] = [];
      const logger = new Logger({
        level: 'info',
        component: 'test-comp',
        pretty: true,
        output: (entry) => entries.push(entry),
      });

      logger.info('hello world', { requestId: 'req-123' });

      expect(entries).toHaveLength(1);
      expect(entries[0]!.message).toBe('hello world');
      expect(entries[0]!.meta).toMatchObject({ component: 'test-comp', requestId: 'req-123' });
    });

    it('serializes extra meta fields in entry', () => {
      const entries: LogEntry[] = [];
      const logger = new Logger({
        level: 'debug',
        pretty: true,
        output: (entry) => entries.push(entry),
      });

      logger.info('test', { requestId: 'req-1', userId: 'user-1' });

      expect(entries).toHaveLength(1);
      expect(entries[0]!.meta).toMatchObject({ requestId: 'req-1', userId: 'user-1' });
    });
  });

  describe('createServiceLogger', () => {
    it('creates a logger with the given config', () => {
      const logger = createServiceLogger({ level: 'debug', component: 'svc' });
      // In test environment, it suppresses output
      expect(logger).toBeInstanceOf(Logger);
    });
  });

  describe('error and fatal methods', () => {
    it('passes Error object details to persist', () => {
      const entries: LogEntry[] = [];
      const logger = new Logger({ level: 'debug', output: () => {} });
      logger.setPersist((entry) => entries.push(entry));

      const err = new Error('something failed');
      logger.error('operation failed', err);

      expect(entries).toHaveLength(1);
      expect(entries[0]!.error?.name).toBe('Error');
      expect(entries[0]!.error?.message).toBe('something failed');
    });

    it('passes meta to persist for error', () => {
      const entries: LogEntry[] = [];
      const logger = new Logger({ level: 'debug', output: () => {} });
      logger.setPersist((entry) => entries.push(entry));

      logger.error('op failed', { code: 500 });

      expect(entries).toHaveLength(1);
      expect(entries[0]!.meta).toMatchObject({ code: 500 });
    });
  });
});
