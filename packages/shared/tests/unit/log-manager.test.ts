/**
 * Tests for LogManager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LogManager, createLogManager, cleanupStalePodLogs, STALE_POD_LOG_AGE_MS } from '../../src/logging/log-manager.js';
import type { IStorageAdapter, FileStats, DirectoryEntry } from '../../src/logging/../types/storage-adapter.js';
import type { LogEntry } from '../../src/logging/logger.js';

// ── In-memory storage adapter for tests ──

class MemoryStorage implements IStorageAdapter {
  private files: Map<string, string> = new Map();
  private dirs: Set<string> = new Set();
  private _initialized = false;

  async initialize(): Promise<void> { this._initialized = true; }
  isInitialized(): boolean { return this._initialized; }
  getRootPath(): string { return '/'; }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  }
  async readFileBytes(path: string): Promise<Uint8Array> {
    return new TextEncoder().encode(await this.readFile(path));
  }
  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    this.files.set(path, typeof content === 'string' ? content : new TextDecoder().decode(content));
  }
  async appendFile(path: string, content: string | Uint8Array): Promise<void> {
    const existing = this.files.get(path) ?? '';
    this.files.set(path, existing + (typeof content === 'string' ? content : new TextDecoder().decode(content)));
  }
  async mkdir(path: string, _recursive?: boolean): Promise<void> {
    this.dirs.add(path);
  }
  async readdir(path: string): Promise<string[]> {
    const prefix = path.endsWith('/') ? path : path + '/';
    const entries = new Set<string>();
    // Find file entries
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        const firstSegment = rest.split('/')[0]!;
        if (firstSegment) entries.add(firstSegment);
      }
    }
    // Find subdirectories
    for (const dir of this.dirs) {
      if (dir.startsWith(prefix)) {
        const rest = dir.slice(prefix.length);
        const firstSegment = rest.split('/')[0]!;
        if (firstSegment) entries.add(firstSegment);
      }
    }
    return [...entries];
  }
  async readdirWithTypes(path: string): Promise<DirectoryEntry[]> {
    const names = await this.readdir(path);
    return names.map(name => ({
      name,
      isFile: () => true,
      isDirectory: () => false,
      isSymbolicLink: () => false,
    }));
  }
  async rmdir(path: string, _recursive?: boolean): Promise<void> {
    const prefix = path.endsWith('/') ? path : path + '/';
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(prefix)) this.files.delete(key);
    }
    for (const dir of [...this.dirs]) {
      if (dir === path || dir.startsWith(prefix)) this.dirs.delete(dir);
    }
  }
  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }
  /** Overridable file mtimes for testing. */
  fileMtimes: Map<string, Date> = new Map();

  async stat(path: string): Promise<FileStats> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    const size = new TextEncoder().encode(content).byteLength;
    const mtime = this.fileMtimes.get(path) ?? new Date();
    return {
      size,
      isFile: () => true,
      isDirectory: () => false,
      isSymbolicLink: () => false,
      atime: mtime,
      mtime,
      birthtime: mtime,
      mode: 0o644,
    };
  }
  async unlink(path: string): Promise<void> {
    this.files.delete(path);
  }
  async rename(oldPath: string, newPath: string): Promise<void> {
    const content = this.files.get(oldPath);
    if (content !== undefined) {
      this.files.set(newPath, content);
      this.files.delete(oldPath);
    }
  }
  async copyFile(src: string, dest: string): Promise<void> {
    const content = this.files.get(src);
    if (content !== undefined) this.files.set(dest, content);
  }
  async isFile(path: string): Promise<boolean> { return this.files.has(path); }
  async isDirectory(path: string): Promise<boolean> {
    if (this.dirs.has(path)) return true;
    // Also check if any files exist under this path
    const prefix = path.endsWith('/') ? path : path + '/';
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  }
}

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'test',
    ...overrides,
  };
}

describe('LogManager', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = new MemoryStorage();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor / getDirectory', () => {
    it('computes the correct directory for a pod', () => {
      const manager = new LogManager({
        entityType: 'pod',
        entityId: 'pod-123',
        basePath: '/logs',
        storage,
        flushIntervalMs: 100_000,
      });
      expect(manager.getDirectory()).toBe('/logs/pods/pod-123');
      manager.destroy();
    });

    it('computes the correct directory for a node', () => {
      const manager = new LogManager({
        entityType: 'node',
        entityId: 'node-456',
        basePath: '/logs',
        storage,
        flushIntervalMs: 100_000,
      });
      expect(manager.getDirectory()).toBe('/logs/nodes/node-456');
      manager.destroy();
    });
  });

  describe('log + readLogs', () => {
    it('buffers entries and persists them on flush', async () => {
      vi.useRealTimers(); // readLogs has a small setTimeout
      const manager = new LogManager({
        entityType: 'pod',
        entityId: 'p1',
        basePath: '/data',
        storage,
        flushIntervalMs: 100_000, // won't auto-flush during test
      });
      await manager.initialize();

      manager.log(makeEntry({ message: 'hello' }));
      manager.log(makeEntry({ message: 'world' }));

      const entries = await manager.readLogs();
      expect(entries.length).toBe(2);
      expect(entries[0]!.message).toBe('hello');
      expect(entries[1]!.message).toBe('world');

      manager.destroy();
    });

    it('returns entries limited by tail parameter', async () => {
      vi.useRealTimers();
      const manager = new LogManager({
        entityType: 'pod',
        entityId: 'p2',
        basePath: '/data',
        storage,
        flushIntervalMs: 100_000,
      });
      await manager.initialize();

      for (let i = 0; i < 10; i++) {
        manager.log(makeEntry({ message: `msg-${i}` }));
      }

      const entries = await manager.readLogs(3);
      expect(entries).toHaveLength(3);
      expect(entries[0]!.message).toBe('msg-7');
      expect(entries[2]!.message).toBe('msg-9');

      manager.destroy();
    });
  });

  describe('destroy', () => {
    it('flushes remaining entries', async () => {
      vi.useRealTimers();
      const manager = new LogManager({
        entityType: 'node',
        entityId: 'n1',
        basePath: '/data',
        storage,
        flushIntervalMs: 100_000,
      });
      await manager.initialize();

      manager.log(makeEntry({ message: 'last' }));
      manager.destroy();

      // After destroy, the entry should have been written to the rotator
      // Need a brief pause for async write
      await new Promise((r) => setTimeout(r, 100));

      // Re-create a rotator to verify data was written
      const { LogRotator } = await import('../../src/logging/log-rotator.js');
      const rotator = new LogRotator({ directory: '/data/nodes/n1', storage });
      await rotator.initialize();
      const all = await rotator.readAll();
      expect(all.length).toBe(1);
      expect(all[0]!.message).toBe('last');
    });
  });

  describe('createLogManager', () => {
    it('is a convenience factory', () => {
      const manager = createLogManager({
        entityType: 'pod',
        entityId: 'test',
        basePath: '/logs',
        storage,
        flushIntervalMs: 100_000,
      });
      expect(manager).toBeInstanceOf(LogManager);
      expect(manager.getDirectory()).toBe('/logs/pods/test');
      manager.destroy();
    });
  });
});

describe('cleanupStalePodLogs', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('exports the default threshold constant', () => {
    expect(STALE_POD_LOG_AGE_MS).toBe(5 * 60 * 1000);
  });

  it('removes stale pod directories whose segments are older than maxAgeMs', async () => {
    // Create a stale pod directory with an old log segment
    const oldDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
    await storage.mkdir('/logs/pods/stale-pod', true);
    await storage.writeFile('/logs/pods/stale-pod/log-2024-01-01T00-00-00-000Z-0000.jsonl', '{}');
    storage.fileMtimes.set('/logs/pods/stale-pod/log-2024-01-01T00-00-00-000Z-0000.jsonl', oldDate);

    await cleanupStalePodLogs(storage, '/logs', new Set(), 5 * 60 * 1000);

    // The stale pod directory and its files should be removed
    expect(await storage.exists('/logs/pods/stale-pod/log-2024-01-01T00-00-00-000Z-0000.jsonl')).toBe(false);
  });

  it('preserves pod directories whose segments are newer than maxAgeMs', async () => {
    // Create a fresh pod directory with a recent log segment
    const recentDate = new Date(); // just now
    await storage.mkdir('/logs/pods/fresh-pod', true);
    await storage.writeFile('/logs/pods/fresh-pod/log-2024-01-01T00-00-00-000Z-0000.jsonl', '{}');
    storage.fileMtimes.set('/logs/pods/fresh-pod/log-2024-01-01T00-00-00-000Z-0000.jsonl', recentDate);

    await cleanupStalePodLogs(storage, '/logs', new Set(), 5 * 60 * 1000);

    // The fresh pod directory should still exist
    expect(await storage.exists('/logs/pods/fresh-pod/log-2024-01-01T00-00-00-000Z-0000.jsonl')).toBe(true);
  });

  it('skips active pod IDs even if their segments are old', async () => {
    const oldDate = new Date(Date.now() - 10 * 60 * 1000);
    await storage.mkdir('/logs/pods/active-pod', true);
    await storage.writeFile('/logs/pods/active-pod/log-old-0000.jsonl', '{}');
    storage.fileMtimes.set('/logs/pods/active-pod/log-old-0000.jsonl', oldDate);

    await cleanupStalePodLogs(storage, '/logs', new Set(['active-pod']), 5 * 60 * 1000);

    // The active pod's directory should be preserved
    expect(await storage.exists('/logs/pods/active-pod/log-old-0000.jsonl')).toBe(true);
  });

  it('removes empty pod directories', async () => {
    await storage.mkdir('/logs/pods', true);
    await storage.mkdir('/logs/pods/empty-pod', true);

    await cleanupStalePodLogs(storage, '/logs', new Set());

    expect(await storage.isDirectory('/logs/pods/empty-pod')).toBe(false);
  });

  it('uses newest segment mtime when multiple segments exist', async () => {
    const oldDate = new Date(Date.now() - 10 * 60 * 1000);
    const recentDate = new Date(); // just now

    await storage.mkdir('/logs/pods/multi-seg', true);
    await storage.writeFile('/logs/pods/multi-seg/log-old-0000.jsonl', '{}');
    storage.fileMtimes.set('/logs/pods/multi-seg/log-old-0000.jsonl', oldDate);
    await storage.writeFile('/logs/pods/multi-seg/log-new-0001.jsonl', '{}');
    storage.fileMtimes.set('/logs/pods/multi-seg/log-new-0001.jsonl', recentDate);

    await cleanupStalePodLogs(storage, '/logs', new Set(), 5 * 60 * 1000);

    // Should be preserved because the newest segment is recent
    expect(await storage.exists('/logs/pods/multi-seg/log-new-0001.jsonl')).toBe(true);
  });

  it('is a no-op when pods/ directory does not exist', async () => {
    // Should not throw
    await cleanupStalePodLogs(storage, '/logs', new Set());
  });
});
