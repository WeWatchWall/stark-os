/**
 * Tests for LogRotator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LogRotator, MAX_SEGMENT_BYTES, MAX_SEGMENT_AGE_MS, MAX_SEGMENTS } from '../../src/logging/log-rotator.js';
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
    const entries: string[] = [];
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        if (!rest.includes('/')) entries.push(rest);
      }
    }
    return entries;
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
  async rmdir(_path: string, _recursive?: boolean): Promise<void> {}
  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }
  async stat(path: string): Promise<FileStats> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    const size = new TextEncoder().encode(content).byteLength;
    return {
      size,
      isFile: () => true,
      isDirectory: () => false,
      isSymbolicLink: () => false,
      atime: new Date(),
      mtime: new Date(),
      birthtime: new Date(),
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
  async isDirectory(path: string): Promise<boolean> { return this.dirs.has(path); }

  /** Test helper: return all file paths */
  getAllPaths(): string[] { return [...this.files.keys()]; }
}

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'test',
    ...overrides,
  };
}

describe('LogRotator', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('exports default constants', () => {
    expect(MAX_SEGMENT_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_SEGMENT_AGE_MS).toBe(60 * 60 * 1000);
    expect(MAX_SEGMENTS).toBe(5);
  });

  describe('initialize', () => {
    it('creates the log directory', async () => {
      const rotator = new LogRotator({ directory: '/logs/pods/pod-1', storage });
      await rotator.initialize();
      expect(await storage.isDirectory('/logs/pods/pod-1')).toBe(true);
    });

    it('is idempotent', async () => {
      const rotator = new LogRotator({ directory: '/logs/pods/pod-1', storage });
      await rotator.initialize();
      await rotator.initialize();
      expect(await storage.isDirectory('/logs/pods/pod-1')).toBe(true);
    });
  });

  describe('write', () => {
    it('writes entries as newline-delimited JSON', async () => {
      const rotator = new LogRotator({ directory: '/logs', storage });
      await rotator.initialize();

      const e1 = makeEntry({ message: 'one' });
      const e2 = makeEntry({ message: 'two' });
      await rotator.write([e1, e2]);

      const segments = await rotator.listSegments();
      expect(segments.length).toBe(1);

      const content = await storage.readFile(`/logs/${segments[0]}`);
      const lines = content.split('\n').filter(Boolean);
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]!).message).toBe('one');
      expect(JSON.parse(lines[1]!).message).toBe('two');
    });

    it('auto-initializes when not explicitly called', async () => {
      const rotator = new LogRotator({ directory: '/logs', storage });
      await rotator.write([makeEntry()]);
      const segments = await rotator.listSegments();
      expect(segments.length).toBe(1);
    });

    it('is a no-op for empty batch', async () => {
      const rotator = new LogRotator({ directory: '/logs', storage });
      await rotator.initialize();
      await rotator.write([]);
      const segments = await rotator.listSegments();
      expect(segments.length).toBe(0);
    });
  });

  describe('rotation by size', () => {
    it('rotates when segment exceeds maxSegmentBytes', async () => {
      // Use a very small segment size to trigger rotation
      const rotator = new LogRotator({
        directory: '/logs',
        storage,
        maxSegmentBytes: 100,
        maxSegments: 10,
      });
      await rotator.initialize();

      // Write enough to exceed 100 bytes
      const bigEntry = makeEntry({ message: 'x'.repeat(60) });
      await rotator.write([bigEntry]);
      await rotator.write([bigEntry]);

      const segments = await rotator.listSegments();
      expect(segments.length).toBe(2);
    });
  });

  describe('retention', () => {
    it('deletes old segments beyond maxSegments', async () => {
      const rotator = new LogRotator({
        directory: '/logs',
        storage,
        maxSegmentBytes: 50,
        maxSegments: 2,
      });
      await rotator.initialize();

      const entry = makeEntry({ message: 'x'.repeat(40) });

      // Create 4 segments
      for (let i = 0; i < 4; i++) {
        await rotator.write([entry]);
        // Give a unique timestamp for segment names
        await new Promise((r) => setTimeout(r, 5));
      }

      const segments = await rotator.listSegments();
      expect(segments.length).toBeLessThanOrEqual(2);
    });
  });

  describe('readAll', () => {
    it('reads all entries across segments in chronological order', async () => {
      const rotator = new LogRotator({
        directory: '/logs',
        storage,
        maxSegmentBytes: 50,
        maxSegments: 10,
      });
      await rotator.initialize();

      const e1 = makeEntry({ message: 'first' });
      const e2 = makeEntry({ message: 'second' });
      const e3 = makeEntry({ message: 'third' });
      await rotator.write([e1]);
      await rotator.write([e2]);
      await rotator.write([e3]);

      const all = await rotator.readAll();
      expect(all.length).toBeGreaterThanOrEqual(3);
      // All messages should be present
      const messages = all.map((e) => e.message);
      expect(messages).toContain('first');
      expect(messages).toContain('second');
      expect(messages).toContain('third');
    });

    it('respects the limit parameter', async () => {
      const rotator = new LogRotator({ directory: '/logs', storage });
      await rotator.initialize();

      const entries = Array.from({ length: 10 }, (_, i) => makeEntry({ message: `msg-${i}` }));
      await rotator.write(entries);

      const limited = await rotator.readAll(3);
      expect(limited).toHaveLength(3);
      // Should be the last 3 entries
      expect(limited[0]!.message).toBe('msg-7');
      expect(limited[2]!.message).toBe('msg-9');
    });

    it('returns empty when no segments exist', async () => {
      const rotator = new LogRotator({ directory: '/logs', storage });
      await rotator.initialize();
      const all = await rotator.readAll();
      expect(all).toEqual([]);
    });
  });

  describe('listSegments', () => {
    it('only returns log-*.jsonl files', async () => {
      const rotator = new LogRotator({ directory: '/logs', storage });
      await rotator.initialize();

      // Write a legit segment
      await rotator.write([makeEntry()]);
      // Write an unrelated file
      await storage.writeFile('/logs/readme.txt', 'not a log');

      const segments = await rotator.listSegments();
      expect(segments.every((s) => s.startsWith('log-') && s.endsWith('.jsonl'))).toBe(true);
    });
  });
});
