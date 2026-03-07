/**
 * Shared OPFS (Origin Private File System) helpers.
 *
 * The canonical Stark OS filesystem root lives at
 * `navigator.storage.getDirectory()` → `stark-orchestrator/`.
 * All system apps that need filesystem access should use the same root
 * so they see a consistent view of the user's data.
 */

/* ── Minimal FS interface (read-only subset used by desktop) ── */

export interface ReadonlyFS {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string | Uint8Array): Promise<void>;
  readdir(path: string): Promise<string[]>;
  readdirWithTypes(path: string): Promise<Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>>;
  mkdir(path: string, recursive?: boolean): Promise<void>;
  exists(path: string): Promise<boolean>;
  isFile(path: string): Promise<boolean>;
  isDirectory(path: string): Promise<boolean>;
  unlink(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  stat(path: string): Promise<{ size: number; mtime: Date }>;
}

/* ── File item type used by file browsers ── */

export interface FileItem {
  name: string;
  isDirectory: boolean;
  size: number;
}

/* ── Path helpers (exported for reuse) ── */

export function getPathParts(resolvedPath: string): string[] {
  const raw = resolvedPath.split('/').filter(p => p.length > 0);
  const normalized: string[] = [];
  for (const part of raw) {
    if (part === '.') continue;
    if (part === '..') { if (normalized.length > 0) normalized.pop(); continue; }
    normalized.push(part);
  }
  return normalized;
}

export function normalizePath(p: string): string {
  const parts = getPathParts(p);
  return '/' + parts.join('/');
}

export async function getDirectoryHandle(
  root: FileSystemDirectoryHandle,
  resolvedPath: string,
  create = false,
): Promise<FileSystemDirectoryHandle> {
  const parts = getPathParts(resolvedPath);
  let handle = root;
  for (const part of parts) {
    handle = await handle.getDirectoryHandle(part, { create });
  }
  return handle;
}

export async function getFileHandle(
  root: FileSystemDirectoryHandle,
  resolvedPath: string,
  create = false,
): Promise<FileSystemFileHandle> {
  const parts = getPathParts(resolvedPath);
  if (parts.length === 0) throw new Error('Cannot open root as a file');
  const fileName = parts.pop()!;
  let dirHandle = root;
  for (const part of parts) {
    dirHandle = await dirHandle.getDirectoryHandle(part, { create });
  }
  return dirHandle.getFileHandle(fileName, { create });
}

/* ── Public API ── */

/**
 * Build a lightweight read/write FS backed by OPFS, rooted at the
 * `stark-orchestrator` directory — the same root the terminal uses.
 */
export function buildOpfsFS(rootHandle: FileSystemDirectoryHandle): ReadonlyFS {
  const fs: ReadonlyFS = {
    async readFile(path: string): Promise<string> {
      const fh = await getFileHandle(rootHandle, path);
      const file = await fh.getFile();
      return file.text();
    },

    async writeFile(path: string, content: string | Uint8Array): Promise<void> {
      const fh = await getFileHandle(rootHandle, path, true);
      const writable = await fh.createWritable();
      if (typeof content === 'string') {
        await writable.write(new TextEncoder().encode(content));
      } else {
        await writable.write(content);
      }
      await writable.close();
    },

    async readdir(path: string): Promise<string[]> {
      const dirHandle = await getDirectoryHandle(rootHandle, path);
      const entries: string[] = [];
      for await (const key of dirHandle.keys()) entries.push(key);
      return entries;
    },

    async readdirWithTypes(path: string) {
      const dirHandle = await getDirectoryHandle(rootHandle, path);
      const entries: Array<{ name: string; isFile(): boolean; isDirectory(): boolean }> = [];
      for await (const [name, handle] of dirHandle.entries()) {
        const isFileEntry = handle.kind === 'file';
        entries.push({
          name,
          isFile: () => isFileEntry,
          isDirectory: () => !isFileEntry,
        });
      }
      return entries;
    },

    async mkdir(path: string, recursive = true): Promise<void> {
      await getDirectoryHandle(rootHandle, path, recursive);
    },

    async exists(path: string): Promise<boolean> {
      const parts = getPathParts(path);
      if (parts.length === 0) return true;
      const name = parts.pop()!;
      try {
        let parent = rootHandle;
        for (const part of parts) parent = await parent.getDirectoryHandle(part);
        try { await parent.getFileHandle(name); return true; } catch { /* not a file */ }
        try { await parent.getDirectoryHandle(name); return true; } catch { /* not a dir */ }
      } catch { /* parent not found */ }
      return false;
    },

    async isFile(path: string): Promise<boolean> {
      const parts = getPathParts(path);
      if (parts.length === 0) return false;
      try {
        const name = parts.pop()!;
        let parent = rootHandle;
        for (const part of parts) parent = await parent.getDirectoryHandle(part);
        await parent.getFileHandle(name);
        return true;
      } catch { return false; }
    },

    async isDirectory(path: string): Promise<boolean> {
      const parts = getPathParts(path);
      if (parts.length === 0) return true;
      try {
        const name = parts.pop()!;
        let parent = rootHandle;
        for (const part of parts) parent = await parent.getDirectoryHandle(part);
        await parent.getDirectoryHandle(name);
        return true;
      } catch { return false; }
    },

    async unlink(path: string): Promise<void> {
      const parts = getPathParts(path);
      if (parts.length === 0) throw new Error('Cannot unlink root');
      const name = parts.pop()!;
      let parent = rootHandle;
      for (const part of parts) parent = await parent.getDirectoryHandle(part);
      await parent.removeEntry(name, { recursive: true });
    },

    async rename(oldPath: string, newPath: string): Promise<void> {
      const content = await fs.readFile(oldPath);
      await fs.writeFile(newPath, content);
      await fs.unlink(oldPath);
    },

    async stat(path: string): Promise<{ size: number; mtime: Date }> {
      const parts = getPathParts(path);
      if (parts.length === 0) return { size: 0, mtime: new Date() };
      const name = parts.pop()!;
      let parent = rootHandle;
      for (const part of parts) parent = await parent.getDirectoryHandle(part);
      try {
        const fh = await parent.getFileHandle(name);
        const file = await fh.getFile();
        return { size: file.size, mtime: new Date(file.lastModified) };
      } catch {
        await parent.getDirectoryHandle(name);
        return { size: 0, mtime: new Date() };
      }
    },
  };

  return fs;

/**
 * Convenience helper: obtain the shared Stark OS OPFS root handle.
 * Returns `null` when OPFS is unavailable (e.g. in unit-test environments).
 */
export async function getStarkOpfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const opfsRoot = await navigator.storage.getDirectory();
    return opfsRoot.getDirectoryHandle('stark-orchestrator', { create: true });
  } catch {
    return null;
  }
}

/* ── Format helpers (reusable across file browsers) ── */

/** Format a byte count to a human-readable string (e.g. "1.2 MB"). */
export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 && i > 0 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

/** Derive a human-readable file type from a filename (e.g. "PDF File"). */
export function formatType(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return 'File';
  const ext = name.slice(dot + 1).toUpperCase();
  return `${ext} File`;
}

/* ── Directory reading with sizes ── */

/**
 * Read a directory from OPFS and return FileItem entries (with file sizes).
 */
export async function readDirItems(
  root: FileSystemDirectoryHandle,
  path: string,
  create = true,
): Promise<FileItem[]> {
  const dirHandle = await getDirectoryHandle(root, path, create);
  const entries: FileItem[] = [];
  for await (const [name, handle] of dirHandle.entries()) {
    let size = 0;
    if (handle.kind === 'file') {
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        size = file.size;
      } catch { /* skip size */ }
    }
    entries.push({ name, isDirectory: handle.kind === 'directory', size });
  }
  return entries;
}
