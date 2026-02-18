// Stark Orchestrator - Browser Runtime
// Storage Adapter using Origin Private File System (OPFS)

import type {
  IStorageAdapter,
  FileStats,
  DirectoryEntry,
  StorageAdapterConfig,
} from '@stark-o/shared';

/**
 * Configuration options for the browser storage adapter
 */
export interface BrowserStorageConfig extends StorageAdapterConfig {
  /**
   * The root path prefix for all file system operations.
   * @default '/'
   */
  rootPath?: string;

  /**
   * The name of the OPFS subdirectory to use as root.
   * @default 'stark-orchestrator'
   */
  storeName?: string;
}

/**
 * Browser storage adapter using the Origin Private File System (OPFS).
 * Provides a unified file system interface for pack execution in browsers.
 *
 * Note: This implementation only provides async methods since
 * OPFS does not support synchronous operations outside of Web Workers.
 */
export class StorageAdapter implements IStorageAdapter {
  private readonly config: Required<BrowserStorageConfig>;
  private initialized: boolean = false;
  private rootHandle: FileSystemDirectoryHandle | null = null;

  constructor(config: BrowserStorageConfig = {}) {
    this.config = {
      rootPath: config.rootPath ?? '/',
      storeName: config.storeName ?? 'stark-orchestrator',
    };
  }

  /**
   * Initialize the storage adapter with OPFS backend.
   * Must be called before using any file system operations.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const opfsRoot = await navigator.storage.getDirectory();
    this.rootHandle = await opfsRoot.getDirectoryHandle(
      this.config.storeName,
      { create: true },
    );

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
    if (!this.initialized || !this.rootHandle) {
      throw new Error(
        'StorageAdapter not initialized. Call initialize() first.',
      );
    }
  }

  /**
   * Get the configured root path.
   */
  getRootPath(): string {
    return this.config.rootPath;
  }

  /**
   * Resolve a path relative to the root path.
   */
  private resolvePath(path: string): string {
    if (path.startsWith('/')) {
      return path;
    }
    const root = this.config.rootPath.endsWith('/')
      ? this.config.rootPath
      : this.config.rootPath + '/';
    return root + path;
  }

  /**
   * Split a resolved path into non-empty segments, normalizing `.` and `..`.
   * OPFS does not support `.` or `..` as directory entry names.
   */
  private getPathParts(resolvedPath: string): string[] {
    const raw = resolvedPath.split('/').filter((part) => part.length > 0);
    const normalized: string[] = [];
    for (const part of raw) {
      if (part === '.') continue;
      if (part === '..') { normalized.pop(); continue; }
      normalized.push(part);
    }
    return normalized;
  }

  /**
   * Navigate to a directory handle by path.
   * @param resolvedPath - The resolved path
   * @param create - Whether to create directories along the way
   */
  private async getDirectoryHandle(
    resolvedPath: string,
    create: boolean = false,
  ): Promise<FileSystemDirectoryHandle> {
    const parts = this.getPathParts(resolvedPath);
    let handle = this.rootHandle!;
    for (const part of parts) {
      handle = await handle.getDirectoryHandle(part, { create });
    }
    return handle;
  }

  /**
   * Navigate to a file handle by path.
   * @param resolvedPath - The resolved path
   * @param create - Whether to create the file and parent directories
   */
  private async getFileHandle(
    resolvedPath: string,
    create: boolean = false,
  ): Promise<FileSystemFileHandle> {
    const parts = this.getPathParts(resolvedPath);
    if (parts.length === 0) {
      throw new Error('Cannot open root as a file');
    }
    const fileName = parts.pop()!;
    let dirHandle = this.rootHandle!;
    for (const part of parts) {
      dirHandle = await dirHandle.getDirectoryHandle(part, { create });
    }
    return dirHandle.getFileHandle(fileName, { create });
  }

  /**
   * Get the parent directory handle and entry name for a path.
   */
  private async getParentAndName(
    resolvedPath: string,
  ): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
    const parts = this.getPathParts(resolvedPath);
    if (parts.length === 0) {
      throw new Error('Cannot operate on root path');
    }
    const name = parts.pop()!;
    let parent = this.rootHandle!;
    for (const part of parts) {
      parent = await parent.getDirectoryHandle(part);
    }
    return { parent, name };
  }

  // ============================================
  // File Reading Operations
  // ============================================

  /**
   * Read file contents as a string.
   * @param path - Path to the file (relative to root path)
   * @param encoding - Character encoding (default: 'utf-8')
   */
  async readFile(
    path: string,
    encoding: BufferEncoding = 'utf-8',
  ): Promise<string> {
    this.ensureInitialized();
    const resolvedPath = this.resolvePath(path);
    const fileHandle = await this.getFileHandle(resolvedPath);
    const file = await fileHandle.getFile();
    return file.text();
  }

  /**
   * Read file contents as a Uint8Array.
   * @param path - Path to the file (relative to root path)
   */
  async readFileBytes(path: string): Promise<Uint8Array> {
    this.ensureInitialized();
    const resolvedPath = this.resolvePath(path);
    const fileHandle = await this.getFileHandle(resolvedPath);
    const file = await fileHandle.getFile();
    return new Uint8Array(await file.arrayBuffer());
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
    content: string | Uint8Array,
    encoding: BufferEncoding = 'utf-8',
  ): Promise<void> {
    this.ensureInitialized();
    const resolvedPath = this.resolvePath(path);
    const fileHandle = await this.getFileHandle(resolvedPath, true);
    const writable = await fileHandle.createWritable();
    if (typeof content === 'string') {
      const encoder = new TextEncoder();
      await writable.write(encoder.encode(content));
    } else {
      await writable.write(content);
    }
    await writable.close();
  }

  /**
   * Append content to a file.
   * @param path - Path to the file (relative to root path)
   * @param content - Content to append
   * @param encoding - Character encoding (default: 'utf-8')
   */
  async appendFile(
    path: string,
    content: string | Uint8Array,
    encoding: BufferEncoding = 'utf-8',
  ): Promise<void> {
    this.ensureInitialized();
    const resolvedPath = this.resolvePath(path);

    // Read existing content
    let existingBytes: Uint8Array;
    try {
      const fileHandle = await this.getFileHandle(resolvedPath);
      const file = await fileHandle.getFile();
      existingBytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      existingBytes = new Uint8Array(0);
    }

    // Encode new content
    const newBytes =
      typeof content === 'string'
        ? new TextEncoder().encode(content)
        : content;

    // Combine and write
    const combined = new Uint8Array(existingBytes.length + newBytes.length);
    combined.set(existingBytes);
    combined.set(newBytes, existingBytes.length);

    const fileHandle = await this.getFileHandle(resolvedPath, true);
    const writable = await fileHandle.createWritable();
    await writable.write(combined);
    await writable.close();
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
    const resolvedPath = this.resolvePath(path);
    if (recursive) {
      await this.getDirectoryHandle(resolvedPath, true);
    } else {
      const { parent, name } = await this.getParentAndName(resolvedPath);
      await parent.getDirectoryHandle(name, { create: true });
    }
  }

  /**
   * Read directory contents.
   * @param path - Path to the directory (relative to root path)
   */
  async readdir(path: string): Promise<string[]> {
    this.ensureInitialized();
    const resolvedPath = this.resolvePath(path);
    const dirHandle = await this.getDirectoryHandle(resolvedPath);
    const entries: string[] = [];
    for await (const key of dirHandle.keys()) {
      entries.push(key);
    }
    return entries;
  }

  /**
   * Read directory contents with file type information.
   * @param path - Path to the directory (relative to root path)
   */
  async readdirWithTypes(path: string): Promise<DirectoryEntry[]> {
    this.ensureInitialized();
    const resolvedPath = this.resolvePath(path);
    const dirHandle = await this.getDirectoryHandle(resolvedPath);
    const entries: DirectoryEntry[] = [];
    for await (const [name, handle] of dirHandle.entries()) {
      const isFileEntry = handle.kind === 'file';
      entries.push({
        name,
        isFile: () => isFileEntry,
        isDirectory: () => !isFileEntry,
        isSymbolicLink: () => false,
      });
    }
    return entries;
  }

  /**
   * Remove a directory.
   * @param path - Path to the directory (relative to root path)
   * @param recursive - Remove contents recursively (default: false)
   */
  async rmdir(path: string, recursive: boolean = false): Promise<void> {
    this.ensureInitialized();
    const resolvedPath = this.resolvePath(path);
    const { parent, name } = await this.getParentAndName(resolvedPath);
    await parent.removeEntry(name, { recursive });
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
    const resolvedPath = this.resolvePath(path);
    const parts = this.getPathParts(resolvedPath);
    if (parts.length === 0) {
      return true; // Root always exists
    }
    const name = parts.pop()!;
    try {
      let parent = this.rootHandle!;
      for (const part of parts) {
        parent = await parent.getDirectoryHandle(part);
      }
      try {
        await parent.getFileHandle(name);
        return true;
      } catch {
        await parent.getDirectoryHandle(name);
        return true;
      }
    } catch {
      return false;
    }
  }

  /**
   * Get file or directory statistics.
   * @param path - Path to the file or directory (relative to root path)
   */
  async stat(path: string): Promise<FileStats> {
    this.ensureInitialized();
    const resolvedPath = this.resolvePath(path);
    const parts = this.getPathParts(resolvedPath);

    // Root directory
    if (parts.length === 0) {
      const now = new Date();
      return {
        size: 0,
        isFile: () => false,
        isDirectory: () => true,
        isSymbolicLink: () => false,
        atime: now,
        mtime: now,
        birthtime: now,
        mode: 0o755,
      };
    }

    const name = parts.pop()!;
    let parent = this.rootHandle!;
    for (const part of parts) {
      parent = await parent.getDirectoryHandle(part);
    }

    // Try as file first
    try {
      const fileHandle = await parent.getFileHandle(name);
      const file = await fileHandle.getFile();
      const lastModified = new Date(file.lastModified);
      return {
        size: file.size,
        isFile: () => true,
        isDirectory: () => false,
        isSymbolicLink: () => false,
        atime: lastModified,
        mtime: lastModified,
        birthtime: lastModified,
        mode: 0o644,
      };
    } catch {
      // Try as directory
      await parent.getDirectoryHandle(name);
      const now = new Date();
      return {
        size: 0,
        isFile: () => false,
        isDirectory: () => true,
        isSymbolicLink: () => false,
        atime: now,
        mtime: now,
        birthtime: now,
        mode: 0o755,
      };
    }
  }

  /**
   * Remove a file.
   * @param path - Path to the file (relative to root path)
   */
  async unlink(path: string): Promise<void> {
    this.ensureInitialized();
    const resolvedPath = this.resolvePath(path);
    const { parent, name } = await this.getParentAndName(resolvedPath);
    await parent.removeEntry(name);
  }

  /**
   * Rename/move a file.
   * Note: Only supports files. Directory rename is not supported in OPFS.
   * @param oldPath - Current path (relative to root path)
   * @param newPath - New path (relative to root path)
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    this.ensureInitialized();
    // OPFS does not support rename directly; copy + delete
    const content = await this.readFileBytes(oldPath);
    await this.writeFile(newPath, content);
    await this.unlink(oldPath);
  }

  /**
   * Copy a file.
   * @param src - Source path (relative to root path)
   * @param dest - Destination path (relative to root path)
   */
  async copyFile(src: string, dest: string): Promise<void> {
    this.ensureInitialized();
    const content = await this.readFileBytes(src);
    await this.writeFile(dest, content);
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
    const resolvedPath = this.resolvePath(path);
    const parts = this.getPathParts(resolvedPath);
    if (parts.length === 0) {
      return false;
    }
    try {
      const name = parts.pop()!;
      let parent = this.rootHandle!;
      for (const part of parts) {
        parent = await parent.getDirectoryHandle(part);
      }
      await parent.getFileHandle(name);
      return true;
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
    const resolvedPath = this.resolvePath(path);
    const parts = this.getPathParts(resolvedPath);
    if (parts.length === 0) {
      return true; // Root is always a directory
    }
    try {
      const name = parts.pop()!;
      let parent = this.rootHandle!;
      for (const part of parts) {
        parent = await parent.getDirectoryHandle(part);
      }
      await parent.getDirectoryHandle(name);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the store name (OPFS subdirectory name).
   */
  getStoreName(): string {
    return this.config.storeName;
  }
}

/**
 * Create a new StorageAdapter instance.
 * @param config - Configuration options
 */
export function createStorageAdapter(
  config?: BrowserStorageConfig,
): StorageAdapter {
  return new StorageAdapter(config);
}

/**
 * Default export for convenience.
 */
export default StorageAdapter;
