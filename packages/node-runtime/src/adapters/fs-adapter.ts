// Stark Orchestrator - Node.js Runtime
// File System Adapter using native Node.js fs

import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';
import type {
  ISyncStorageAdapter,
  FileStats,
  DirectoryEntry,
  StorageAdapterConfig,
} from '@stark-o/shared';

/**
 * Configuration options for the file system adapter
 */
export interface FsAdapterConfig extends StorageAdapterConfig {
  /**
   * The root directory prefix for file system operations.
   * All operations will be scoped to this directory.
   * @default process.cwd()
   */
  rootPath?: string;

  /**
   * Whether to use synchronous operations where possible.
   * @default false
   */
  preferSync?: boolean;
}

/**
 * Internal resolved configuration type.
 */
interface ResolvedFsAdapterConfig {
  rootPath: string;
  storeName: string;
  preferSync: boolean;
}

/**
 * File system adapter using native Node.js fs.
 * Provides a unified file system interface for pack execution.
 * Implements ISyncStorageAdapter interface for both async and sync operations.
 */
export class FsAdapter implements ISyncStorageAdapter {
  private readonly config: ResolvedFsAdapterConfig;
  private initialized: boolean = false;

  constructor(config: FsAdapterConfig = {}) {
    this.config = {
      rootPath: config.rootPath ?? process.cwd(),
      storeName: config.storeName ?? 'node-fs',
      preferSync: config.preferSync ?? false,
    };
  }

  /**
   * Initialize the file system adapter.
   * Must be called before using any file system operations.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await nodeFs.promises.mkdir(this.config.rootPath, { recursive: true });

    this.initialized = true;
  }

  /**
   * Check if the adapter has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Ensure the adapter is initialized before operations.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('FsAdapter not initialized. Call initialize() first.');
    }
  }

  /**
   * Resolve a path relative to the configured root path.
   */
  private resolvePath(path: string): string {
    return nodePath.join(this.config.rootPath, path);
  }

  // ============================================
  // File Reading Operations
  // ============================================

  /**
   * Read file contents as a string.
   * @param path - Path to the file (relative to root path)
   * @param encoding - Character encoding (default: 'utf-8')
   */
  async readFile(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    this.ensureInitialized();
    return nodeFs.promises.readFile(this.resolvePath(path), encoding);
  }

  /**
   * Read file contents as a Uint8Array (IStorageAdapter interface).
   * @param path - Path to the file (relative to root path)
   */
  async readFileBytes(path: string): Promise<Uint8Array> {
    this.ensureInitialized();
    return new Uint8Array(await nodeFs.promises.readFile(this.resolvePath(path)));
  }

  /**
   * Read file contents as a Buffer.
   * @param path - Path to the file (relative to root path)
   */
  async readFileBuffer(path: string): Promise<Buffer> {
    this.ensureInitialized();
    return nodeFs.promises.readFile(this.resolvePath(path));
  }

  /**
   * Read file contents synchronously.
   * @param path - Path to the file (relative to root path)
   * @param encoding - Character encoding (default: 'utf-8')
   */
  readFileSync(path: string, encoding: BufferEncoding = 'utf-8'): string {
    this.ensureInitialized();
    return nodeFs.readFileSync(this.resolvePath(path), encoding);
  }

  /**
   * Read file contents as Uint8Array synchronously (ISyncStorageAdapter interface).
   * @param path - Path to the file (relative to root path)
   */
  readFileBytesSync(path: string): Uint8Array {
    this.ensureInitialized();
    return new Uint8Array(nodeFs.readFileSync(this.resolvePath(path)));
  }

  /**
   * Read file contents as Buffer synchronously.
   * @param path - Path to the file (relative to root path)
   */
  readFileBufferSync(path: string): Buffer {
    this.ensureInitialized();
    return nodeFs.readFileSync(this.resolvePath(path));
  }

  // ============================================
  // File Writing Operations
  // ============================================

  /**
   * Write string content to a file.
   * @param path - Path to the file (relative to root path)
   * @param content - Content to write
   * @param encoding - Character encoding (default: 'utf-8')
   */
  async writeFile(
    path: string,
    content: string | Buffer,
    encoding: BufferEncoding = 'utf-8',
  ): Promise<void> {
    this.ensureInitialized();
    await nodeFs.promises.writeFile(this.resolvePath(path), content, { encoding });
  }

  /**
   * Write content to a file synchronously.
   * @param path - Path to the file (relative to root path)
   * @param content - Content to write
   * @param encoding - Character encoding (default: 'utf-8')
   */
  writeFileSync(
    path: string,
    content: string | Buffer,
    encoding: BufferEncoding = 'utf-8',
  ): void {
    this.ensureInitialized();
    nodeFs.writeFileSync(this.resolvePath(path), content, { encoding });
  }

  /**
   * Append content to a file.
   * @param path - Path to the file (relative to root path)
   * @param content - Content to append
   * @param encoding - Character encoding (default: 'utf-8')
   */
  async appendFile(
    path: string,
    content: string | Buffer,
    encoding: BufferEncoding = 'utf-8',
  ): Promise<void> {
    this.ensureInitialized();
    await nodeFs.promises.appendFile(this.resolvePath(path), content, { encoding });
  }

  /**
   * Append content to a file synchronously.
   * @param path - Path to the file (relative to root path)
   * @param content - Content to append
   * @param encoding - Character encoding (default: 'utf-8')
   */
  appendFileSync(
    path: string,
    content: string | Buffer,
    encoding: BufferEncoding = 'utf-8',
  ): void {
    this.ensureInitialized();
    nodeFs.appendFileSync(this.resolvePath(path), content, { encoding });
  }

  // ============================================
  // Directory Operations
  // ============================================

  /**
   * Create a directory.
   * @param path - Path to the directory (relative to root path)
   * @param recursive - Create parent directories if they don't exist (default: true)
   */
  async mkdir(path: string, recursive: boolean = true): Promise<void> {
    this.ensureInitialized();
    await nodeFs.promises.mkdir(this.resolvePath(path), { recursive });
  }

  /**
   * Create a directory synchronously.
   * @param path - Path to the directory (relative to root path)
   * @param recursive - Create parent directories if they don't exist (default: true)
   */
  mkdirSync(path: string, recursive: boolean = true): void {
    this.ensureInitialized();
    nodeFs.mkdirSync(this.resolvePath(path), { recursive });
  }

  /**
   * Read directory contents.
   * @param path - Path to the directory (relative to root path)
   */
  async readdir(path: string): Promise<string[]> {
    this.ensureInitialized();
    return nodeFs.promises.readdir(this.resolvePath(path));
  }

  /**
   * Read directory contents synchronously.
   * @param path - Path to the directory (relative to root path)
   */
  readdirSync(path: string): string[] {
    this.ensureInitialized();
    return nodeFs.readdirSync(this.resolvePath(path));
  }

  /**
   * Read directory contents with file type information.
   * @param path - Path to the directory (relative to root path)
   */
  async readdirWithTypes(path: string): Promise<DirectoryEntry[]> {
    this.ensureInitialized();
    return nodeFs.promises.readdir(this.resolvePath(path), { withFileTypes: true });
  }

  /**
   * Remove a directory.
   * @param path - Path to the directory (relative to root path)
   * @param recursive - Remove contents recursively (default: false)
   */
  async rmdir(path: string, recursive: boolean = false): Promise<void> {
    this.ensureInitialized();
    const resolved = this.resolvePath(path);
    if (recursive) {
      await nodeFs.promises.rm(resolved, { recursive: true, force: true });
    } else {
      await nodeFs.promises.rmdir(resolved);
    }
  }

  /**
   * Remove a directory synchronously.
   * @param path - Path to the directory (relative to root path)
   * @param recursive - Remove contents recursively (default: false)
   */
  rmdirSync(path: string, recursive: boolean = false): void {
    this.ensureInitialized();
    const resolved = this.resolvePath(path);
    if (recursive) {
      nodeFs.rmSync(resolved, { recursive: true, force: true });
    } else {
      nodeFs.rmdirSync(resolved);
    }
  }

  // ============================================
  // File/Path Operations
  // ============================================

  /**
   * Check if a file or directory exists.
   * @param path - Path to check (relative to root path)
   */
  async exists(path: string): Promise<boolean> {
    this.ensureInitialized();
    try {
      await nodeFs.promises.access(this.resolvePath(path));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a file or directory exists synchronously.
   * @param path - Path to check (relative to root path)
   */
  existsSync(path: string): boolean {
    this.ensureInitialized();
    return nodeFs.existsSync(this.resolvePath(path));
  }

  /**
   * Get file or directory statistics.
   * @param path - Path to the file or directory (relative to root path)
   */
  async stat(path: string): Promise<FileStats> {
    this.ensureInitialized();
    return nodeFs.promises.stat(this.resolvePath(path));
  }

  /**
   * Get file or directory statistics synchronously.
   * @param path - Path to the file or directory (relative to root path)
   */
  statSync(path: string): FileStats {
    this.ensureInitialized();
    return nodeFs.statSync(this.resolvePath(path));
  }

  /**
   * Remove a file.
   * @param path - Path to the file (relative to root path)
   */
  async unlink(path: string): Promise<void> {
    this.ensureInitialized();
    await nodeFs.promises.unlink(this.resolvePath(path));
  }

  /**
   * Remove a file synchronously.
   * @param path - Path to the file (relative to root path)
   */
  unlinkSync(path: string): void {
    this.ensureInitialized();
    nodeFs.unlinkSync(this.resolvePath(path));
  }

  /**
   * Rename/move a file or directory.
   * @param oldPath - Current path (relative to root path)
   * @param newPath - New path (relative to root path)
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    this.ensureInitialized();
    await nodeFs.promises.rename(this.resolvePath(oldPath), this.resolvePath(newPath));
  }

  /**
   * Rename/move a file or directory synchronously.
   * @param oldPath - Current path (relative to root path)
   * @param newPath - New path (relative to root path)
   */
  renameSync(oldPath: string, newPath: string): void {
    this.ensureInitialized();
    nodeFs.renameSync(this.resolvePath(oldPath), this.resolvePath(newPath));
  }

  /**
   * Copy a file.
   * @param src - Source path (relative to root path)
   * @param dest - Destination path (relative to root path)
   */
  async copyFile(src: string, dest: string): Promise<void> {
    this.ensureInitialized();
    await nodeFs.promises.copyFile(this.resolvePath(src), this.resolvePath(dest));
  }

  /**
   * Copy a file synchronously.
   * @param src - Source path (relative to root path)
   * @param dest - Destination path (relative to root path)
   */
  copyFileSync(src: string, dest: string): void {
    this.ensureInitialized();
    nodeFs.copyFileSync(this.resolvePath(src), this.resolvePath(dest));
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Check if path is a file.
   * @param path - Path to check (relative to root path)
   */
  async isFile(path: string): Promise<boolean> {
    this.ensureInitialized();
    try {
      const stats = await nodeFs.promises.stat(this.resolvePath(path));
      return stats.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Check if path is a file synchronously.
   * @param path - Path to check (relative to root path)
   */
  isFileSync(path: string): boolean {
    this.ensureInitialized();
    try {
      const stats = nodeFs.statSync(this.resolvePath(path));
      return stats.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Check if path is a directory.
   * @param path - Path to check (relative to root path)
   */
  async isDirectory(path: string): Promise<boolean> {
    this.ensureInitialized();
    try {
      const stats = await nodeFs.promises.stat(this.resolvePath(path));
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if path is a directory synchronously.
   * @param path - Path to check (relative to root path)
   */
  isDirectorySync(path: string): boolean {
    this.ensureInitialized();
    try {
      const stats = nodeFs.statSync(this.resolvePath(path));
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Get the configured root path.
   */
  getRootPath(): string {
    return this.config.rootPath;
  }

  /**
   * Get the raw Node.js fs module for advanced operations.
   * @returns The Node.js fs module
   */
  getRawFs(): typeof nodeFs {
    this.ensureInitialized();
    return nodeFs;
  }
}

/**
 * Create a new FsAdapter instance.
 * @param config - Configuration options
 */
export function createFsAdapter(config?: FsAdapterConfig): FsAdapter {
  return new FsAdapter(config);
}

/**
 * Default export for convenience.
 */
export default FsAdapter;
