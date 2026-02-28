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
}

/* ── Path helpers ── */

function getPathParts(resolvedPath: string): string[] {
  const raw = resolvedPath.split('/').filter(p => p.length > 0);
  const normalized: string[] = [];
  for (const part of raw) {
    if (part === '.') continue;
    if (part === '..') { if (normalized.length > 0) normalized.pop(); continue; }
    normalized.push(part);
  }
  return normalized;
}

async function getDirectoryHandle(
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

async function getFileHandle(
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
  return {
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
  };
}

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
