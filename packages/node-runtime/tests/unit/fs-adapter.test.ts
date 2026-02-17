/**
 * FsAdapter Tests
 * Validates the Node.js file system adapter using native fs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { FsAdapter } from '../../src/adapters/fs-adapter.js';

describe('FsAdapter', () => {
  let adapter: FsAdapter;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `fs-adapter-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    adapter = new FsAdapter({ rootPath: testDir });
    await adapter.initialize();
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // ── Lifecycle ──────────────────────────────────────────────────────
  it('should initialize and create root directory', () => {
    expect(adapter.isInitialized()).toBe(true);
    expect(fs.existsSync(testDir)).toBe(true);
  });

  it('should not re-initialize on second call', async () => {
    await adapter.initialize(); // no-op
    expect(adapter.isInitialized()).toBe(true);
  });

  it('should throw when not initialized', async () => {
    const uninit = new FsAdapter({ rootPath: testDir });
    await expect(uninit.readFile('/any.txt')).rejects.toThrow('not initialized');
  });

  it('should return configured root path', () => {
    expect(adapter.getRootPath()).toBe(testDir);
  });

  // ── File read/write ────────────────────────────────────────────────
  it('should write and read a file (async)', async () => {
    await adapter.writeFile('/hello.txt', 'hello world');
    const content = await adapter.readFile('/hello.txt');
    expect(content).toBe('hello world');
  });

  it('should write and read a file (sync)', () => {
    adapter.writeFileSync('/sync.txt', 'sync data');
    expect(adapter.readFileSync('/sync.txt')).toBe('sync data');
  });

  it('should read file bytes', async () => {
    await adapter.writeFile('/bytes.txt', 'abc');
    const bytes = await adapter.readFileBytes('/bytes.txt');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(bytes).toString()).toBe('abc');
  });

  it('should read file bytes sync', () => {
    adapter.writeFileSync('/bytesSync.txt', 'xyz');
    const bytes = adapter.readFileBytesSync('/bytesSync.txt');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(bytes).toString()).toBe('xyz');
  });

  it('should read file as Buffer', async () => {
    await adapter.writeFile('/buf.txt', 'buf');
    const buf = await adapter.readFileBuffer('/buf.txt');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString()).toBe('buf');
  });

  it('should read file as Buffer sync', () => {
    adapter.writeFileSync('/bufSync.txt', 'bufs');
    const buf = adapter.readFileBufferSync('/bufSync.txt');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString()).toBe('bufs');
  });

  // ── Append ─────────────────────────────────────────────────────────
  it('should append to a file (async)', async () => {
    await adapter.writeFile('/app.txt', 'a');
    await adapter.appendFile('/app.txt', 'b');
    expect(await adapter.readFile('/app.txt')).toBe('ab');
  });

  it('should append to a file (sync)', () => {
    adapter.writeFileSync('/appSync.txt', 'x');
    adapter.appendFileSync('/appSync.txt', 'y');
    expect(adapter.readFileSync('/appSync.txt')).toBe('xy');
  });

  // ── Directory operations ───────────────────────────────────────────
  it('should create and list a directory (async)', async () => {
    await adapter.mkdir('/sub/dir');
    await adapter.writeFile('/sub/dir/file.txt', 'nested');
    const entries = await adapter.readdir('/sub/dir');
    expect(entries).toContain('file.txt');
  });

  it('should create and list a directory (sync)', () => {
    adapter.mkdirSync('/syncDir');
    adapter.writeFileSync('/syncDir/a.txt', '');
    const entries = adapter.readdirSync('/syncDir');
    expect(entries).toContain('a.txt');
  });

  it('should readdir with types', async () => {
    await adapter.mkdir('/typed');
    await adapter.writeFile('/typed/f.txt', '');
    await adapter.mkdir('/typed/d');
    const entries = await adapter.readdirWithTypes('/typed');
    const names = entries.map((e) => e.name);
    expect(names).toContain('f.txt');
    expect(names).toContain('d');
    const fileEntry = entries.find((e) => e.name === 'f.txt')!;
    expect(fileEntry.isFile()).toBe(true);
    expect(fileEntry.isDirectory()).toBe(false);
    const dirEntry = entries.find((e) => e.name === 'd')!;
    expect(dirEntry.isDirectory()).toBe(true);
  });

  it('should remove a directory (async)', async () => {
    await adapter.mkdir('/rmdir-test/child');
    await adapter.writeFile('/rmdir-test/child/f.txt', '');
    await adapter.rmdir('/rmdir-test', true);
    expect(await adapter.exists('/rmdir-test')).toBe(false);
  });

  it('should remove a directory (sync)', () => {
    adapter.mkdirSync('/rmdirSync');
    adapter.writeFileSync('/rmdirSync/f.txt', '');
    adapter.rmdirSync('/rmdirSync', true);
    expect(adapter.existsSync('/rmdirSync')).toBe(false);
  });

  // ── Exists / Stat ──────────────────────────────────────────────────
  it('should report exists correctly', async () => {
    expect(await adapter.exists('/nope')).toBe(false);
    await adapter.writeFile('/yep.txt', '');
    expect(await adapter.exists('/yep.txt')).toBe(true);
  });

  it('should report existsSync correctly', () => {
    expect(adapter.existsSync('/nope')).toBe(false);
    adapter.writeFileSync('/yep.txt', '');
    expect(adapter.existsSync('/yep.txt')).toBe(true);
  });

  it('should return stat for a file', async () => {
    await adapter.writeFile('/stat.txt', 'data');
    const s = await adapter.stat('/stat.txt');
    expect(s.isFile()).toBe(true);
    expect(s.isDirectory()).toBe(false);
    expect(s.size).toBeGreaterThan(0);
  });

  it('should return statSync for a directory', () => {
    adapter.mkdirSync('/statDir');
    const s = adapter.statSync('/statDir');
    expect(s.isDirectory()).toBe(true);
    expect(s.isFile()).toBe(false);
  });

  // ── Unlink / Rename / Copy ─────────────────────────────────────────
  it('should unlink a file (async)', async () => {
    await adapter.writeFile('/del.txt', '');
    await adapter.unlink('/del.txt');
    expect(await adapter.exists('/del.txt')).toBe(false);
  });

  it('should unlink a file (sync)', () => {
    adapter.writeFileSync('/delSync.txt', '');
    adapter.unlinkSync('/delSync.txt');
    expect(adapter.existsSync('/delSync.txt')).toBe(false);
  });

  it('should rename a file (async)', async () => {
    await adapter.writeFile('/old.txt', 'content');
    await adapter.rename('/old.txt', '/new.txt');
    expect(await adapter.exists('/old.txt')).toBe(false);
    expect(await adapter.readFile('/new.txt')).toBe('content');
  });

  it('should rename a file (sync)', () => {
    adapter.writeFileSync('/oldSync.txt', 'sc');
    adapter.renameSync('/oldSync.txt', '/newSync.txt');
    expect(adapter.existsSync('/oldSync.txt')).toBe(false);
    expect(adapter.readFileSync('/newSync.txt')).toBe('sc');
  });

  it('should copy a file (async)', async () => {
    await adapter.writeFile('/src.txt', 'copy me');
    await adapter.copyFile('/src.txt', '/dest.txt');
    expect(await adapter.readFile('/dest.txt')).toBe('copy me');
    expect(await adapter.exists('/src.txt')).toBe(true);
  });

  it('should copy a file (sync)', () => {
    adapter.writeFileSync('/srcSync.txt', 'clone');
    adapter.copyFileSync('/srcSync.txt', '/destSync.txt');
    expect(adapter.readFileSync('/destSync.txt')).toBe('clone');
  });

  // ── isFile / isDirectory ───────────────────────────────────────────
  it('should detect files and directories (async)', async () => {
    await adapter.writeFile('/check.txt', '');
    await adapter.mkdir('/checkDir');
    expect(await adapter.isFile('/check.txt')).toBe(true);
    expect(await adapter.isFile('/checkDir')).toBe(false);
    expect(await adapter.isDirectory('/checkDir')).toBe(true);
    expect(await adapter.isDirectory('/check.txt')).toBe(false);
    expect(await adapter.isFile('/nonexistent')).toBe(false);
    expect(await adapter.isDirectory('/nonexistent')).toBe(false);
  });

  it('should detect files and directories (sync)', () => {
    adapter.writeFileSync('/checkSync.txt', '');
    adapter.mkdirSync('/checkDirSync');
    expect(adapter.isFileSync('/checkSync.txt')).toBe(true);
    expect(adapter.isFileSync('/checkDirSync')).toBe(false);
    expect(adapter.isDirectorySync('/checkDirSync')).toBe(true);
    expect(adapter.isDirectorySync('/checkSync.txt')).toBe(false);
    expect(adapter.isFileSync('/nonexistent')).toBe(false);
    expect(adapter.isDirectorySync('/nonexistent')).toBe(false);
  });

  // ── getRawFs ───────────────────────────────────────────────────────
  it('should return the native fs module via getRawFs', () => {
    const raw = adapter.getRawFs();
    expect(raw).toBeDefined();
    expect(typeof raw.readFileSync).toBe('function');
    expect(typeof raw.promises.readFile).toBe('function');
  });
});
