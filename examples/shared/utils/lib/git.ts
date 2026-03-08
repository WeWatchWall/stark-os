/**
 * Git integration powered by isomorphic-git, backed by OPFS.
 *
 * This module provides a filesystem adapter that bridges the OPFS
 * (Origin Private File System) interface to isomorphic-git's expected
 * Node-like `fs.promises` API, plus high-level wrappers for common
 * git operations (init, clone, add, commit, push, log, status, diff).
 *
 * Lives in examples/shared so both the Monaco editor and the browser
 * terminal can share the same git backend.
 */

// isomorphic-git requires a global `Buffer` (it checks `typeof Buffer`
// at runtime and throws "Missing Buffer dependency" when absent).
// In the browser, provide the polyfill from the `buffer` npm package
// which is already a transitive dependency of isomorphic-git.
import { Buffer } from 'buffer';
if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { createPatch } from 'diff';
import {
  getDirectoryHandle,
  getFileHandle,
  getPathParts,
  normalizePath,
} from './opfs';

// ── Types ────────────────────────────────────────────

/** Minimal stat result expected by isomorphic-git. */
interface StatLike {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  mode: number;
  size: number;
  ino: number;
  mtimeMs: number;
  ctimeMs: number;
  uid: number;
  gid: number;
  dev: number;
}

/** Git author / committer identity. */
export interface GitAuthor {
  name: string;
  email: string;
}

/** Authentication info for remote operations. */
export interface GitAuth {
  username: string;   // GitHub username or 'x-access-token' for PAT
  password: string;   // Personal access token
}

/** A single entry in `git log` output. */
export interface GitLogEntry {
  oid: string;
  message: string;
  author: { name: string; email: string; timestamp: number };
  committer: { name: string; email: string; timestamp: number };
  parent: string[];
}

/** A file changed between two commits. */
export interface GitDiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
}

/** A file diff with the unified patch text. */
export interface GitFileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  patch: string;       // unified diff text
  oldContent: string;
  newContent: string;
}

/** Status matrix row: [filepath, head, workdir, stage] */
export type GitStatusRow = [string, 0 | 1, 0 | 1 | 2, 0 | 1 | 2 | 3];

// No CORS proxy — GitHub supports CORS natively for both
// authenticated AND unauthenticated requests.  The old
// cors.isomorphic-git.org proxy is unreliable and causes 401/403 errors.

// ── OPFS → isomorphic-git filesystem adapter ─────────

/**
 * Normalize an error thrown by the OPFS API so that its `.code` property
 * is always a string.  isomorphic-git relies on patterns like
 *   `(err.code || '').includes('ENS')`
 * which crash when `.code` is a number (e.g. `DOMException.code === 8`
 * for `NotFoundError`), because `Number.prototype` has no `.includes`.
 */
function normalizeError(err: unknown, filepath: string): Error {
  // Already a well-formed Node-style error with a string code — pass through
  if (err instanceof Error && typeof (err as any).code === 'string') {
    return err;
  }

  const name =
    err instanceof DOMException ? err.name :
    err instanceof Error ? err.name : '';

  const message =
    err instanceof Error ? err.message : String(err);

  let code: string;
  switch (name) {
    case 'NotFoundError':
      code = 'ENOENT';
      break;
    case 'NotAllowedError':
      code = 'EACCES';
      break;
    case 'TypeMismatchError':
      code = 'ENOTDIR';
      break;
    default:
      code = 'EIO';
  }

  return Object.assign(
    new Error(`${code}: ${message}, path '${filepath}'`),
    { code },
  );
}

/**
 * Build a `{ promises: { … } }` filesystem object that isomorphic-git
 * can use directly, backed by an OPFS root directory handle.
 */
export function buildGitFs(rootHandle: FileSystemDirectoryHandle) {
  return {
    promises: {
      /** Read a file as string (encoding: 'utf8') or Uint8Array. */
      async readFile(
        filepath: string,
        options?: { encoding?: string } | string,
      ): Promise<Uint8Array | string> {
        try {
          const fh = await getFileHandle(rootHandle, filepath);
          const file = await fh.getFile();
          const encoding =
            typeof options === 'string'
              ? options
              : options?.encoding;
          if (encoding === 'utf8' || encoding === 'utf-8') {
            return file.text();
          }
          const buf = await file.arrayBuffer();
          return new Uint8Array(buf);
        } catch (err) {
          throw normalizeError(err, filepath);
        }
      },

      /** Write data to a file (creates parent dirs as needed). */
      async writeFile(
        filepath: string,
        data: Uint8Array | string,
        _options?: any,
      ): Promise<void> {
        try {
          const fh = await getFileHandle(rootHandle, filepath, true);
          const writable = await fh.createWritable();
          if (typeof data === 'string') {
            await writable.write(new TextEncoder().encode(data));
          } else {
            await writable.write(data);
          }
          await writable.close();
        } catch (err) {
          throw normalizeError(err, filepath);
        }
      },

      /** Unlink (delete) a file. */
      async unlink(filepath: string): Promise<void> {
        try {
          const parts = getPathParts(filepath);
          if (parts.length === 0) throw new Error('Cannot unlink root');
          const name = parts.pop()!;
          let parent = rootHandle;
          for (const part of parts) {
            parent = await parent.getDirectoryHandle(part);
          }
          await parent.removeEntry(name);
        } catch (err) {
          throw normalizeError(err, filepath);
        }
      },

      /** List directory entries. */
      async readdir(filepath: string): Promise<string[]> {
        try {
          const dirHandle = await getDirectoryHandle(rootHandle, filepath);
          const entries: string[] = [];
          for await (const key of dirHandle.keys()) entries.push(key);
          return entries;
        } catch (err) {
          throw normalizeError(err, filepath);
        }
      },

      /** Create a directory (like mkdir -p). */
      async mkdir(filepath: string, _options?: any): Promise<void> {
        try {
          await getDirectoryHandle(rootHandle, filepath, true);
        } catch (err) {
          throw normalizeError(err, filepath);
        }
      },

      /** Remove an empty directory. */
      async rmdir(filepath: string): Promise<void> {
        try {
          const parts = getPathParts(filepath);
          if (parts.length === 0) throw new Error('Cannot rmdir root');
          const name = parts.pop()!;
          let parent = rootHandle;
          for (const part of parts) {
            parent = await parent.getDirectoryHandle(part);
          }
          await parent.removeEntry(name, { recursive: true });
        } catch (err) {
          throw normalizeError(err, filepath);
        }
      },

      /** Stat a path (file or directory). */
      async stat(filepath: string): Promise<StatLike> {
        try {
          return await statPath(rootHandle, filepath);
        } catch (err) {
          throw normalizeError(err, filepath);
        }
      },

      /** lstat — OPFS has no symlinks so this is the same as stat. */
      async lstat(filepath: string): Promise<StatLike> {
        try {
          return await statPath(rootHandle, filepath);
        } catch (err) {
          throw normalizeError(err, filepath);
        }
      },

      /** readlink — not supported on OPFS. */
      async readlink(filepath: string): Promise<string> {
        throw normalizeError(new Error('Symlinks not supported in OPFS'), filepath);
      },

      /** symlink — not supported on OPFS. */
      async symlink(_target: string, filepath: string): Promise<void> {
        throw normalizeError(new Error('Symlinks not supported in OPFS'), filepath);
      },

      /** chmod — no-op on OPFS. */
      async chmod(_filepath: string, _mode: number): Promise<void> {
        // OPFS doesn't have file permissions — silently succeed
      },
    },
  };
}

/** Internal stat helper. */
async function statPath(
  rootHandle: FileSystemDirectoryHandle,
  filepath: string,
): Promise<StatLike> {
  const parts = getPathParts(filepath);

  // Root directory
  if (parts.length === 0) {
    return makeStat(true, 0, Date.now());
  }

  const name = parts[parts.length - 1];
  let parent = rootHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    parent = await parent.getDirectoryHandle(parts[i]);
  }

  // Try as file first
  try {
    const fh = await parent.getFileHandle(name);
    const file = await fh.getFile();
    return makeStat(false, file.size, file.lastModified);
  } catch { /* not a file */ }

  // Try as directory
  try {
    await parent.getDirectoryHandle(name);
    return makeStat(true, 0, Date.now());
  } catch { /* not found */ }

  throw Object.assign(new Error(`ENOENT: no such file or directory, stat '${filepath}'`), { code: 'ENOENT' });
}

function makeStat(isDir: boolean, size: number, mtimeMs: number): StatLike {
  return {
    isFile: () => !isDir,
    isDirectory: () => isDir,
    isSymbolicLink: () => false,
    mode: isDir ? 0o40755 : 0o100644,
    size,
    ino: 0,
    mtimeMs,
    ctimeMs: mtimeMs,
    uid: 1000,
    gid: 1000,
    dev: 0,
  };
}

// ── High-level git operations ────────────────────────

/**
 * Initialize a new git repository at the given directory.
 * `dir` is the OPFS path relative to the rootHandle (e.g. "/home/project").
 */
export async function gitInit(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
  defaultBranch = 'main',
): Promise<void> {
  const fs = buildGitFs(rootHandle);
  await git.init({ fs, dir, defaultBranch });
}

/**
 * Clone a remote repository into an OPFS directory.
 */
export async function gitClone(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
  url: string,
  auth?: GitAuth,
  corsProxy?: string,
  onProgress?: (msg: string) => void,
  depth?: number,
): Promise<void> {
  const fs = buildGitFs(rootHandle);
  await git.clone({
    fs,
    http,
    dir,
    url,
    ...(corsProxy ? { corsProxy } : {}),
    singleBranch: false,
    depth: depth ?? 20,
    onAuth: auth ? () => ({ username: auth.username, password: auth.password }) : undefined,
    onMessage: onProgress,
  });
}

/**
 * Stage one or more files (git add).
 */
export async function gitAdd(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
  filepath: string | string[],
): Promise<void> {
  const fs = buildGitFs(rootHandle);
  const paths = Array.isArray(filepath) ? filepath : [filepath];
  for (const fp of paths) {
    await git.add({ fs, dir, filepath: fp });
  }
}

/**
 * Unstage a file (git reset -- <file>). Uses remove from index.
 */
export async function gitRemove(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
  filepath: string,
): Promise<void> {
  const fs = buildGitFs(rootHandle);
  await git.remove({ fs, dir, filepath });
}

/**
 * Create a commit.
 */
export async function gitCommit(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
  message: string,
  author: GitAuthor,
): Promise<string> {
  const fs = buildGitFs(rootHandle);
  return git.commit({ fs, dir, message, author });
}

/**
 * Push commits to a remote.
 */
export async function gitPush(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
  auth?: GitAuth,
  corsProxy?: string,
  remote = 'origin',
): Promise<void> {
  const fs = buildGitFs(rootHandle);
  await git.push({
    fs,
    http,
    dir,
    remote,
    ...(corsProxy ? { corsProxy } : {}),
    onAuth: auth ? () => ({ username: auth.username, password: auth.password }) : undefined,
  });
}

/**
 * Pull changes from a remote (fetch + fast-forward merge).
 */
export async function gitPull(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
  auth?: GitAuth,
  author?: GitAuthor,
  corsProxy?: string,
  remote = 'origin',
): Promise<void> {
  const fs = buildGitFs(rootHandle);
  await git.pull({
    fs,
    http,
    dir,
    remote,
    ...(corsProxy ? { corsProxy } : {}),
    singleBranch: true,
    author: author || { name: 'User', email: 'user@example.com' },
    onAuth: auth ? () => ({ username: auth.username, password: auth.password }) : undefined,
  });
}

/**
 * Get the current branch name.
 */
export async function gitCurrentBranch(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
): Promise<string> {
  const fs = buildGitFs(rootHandle);
  return (await git.currentBranch({ fs, dir })) || 'HEAD';
}

/**
 * Get the commit log (most recent first).
 */
export async function gitLog(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
  depth = 50,
): Promise<GitLogEntry[]> {
  const fs = buildGitFs(rootHandle);
  const commits = await git.log({ fs, dir, depth });
  return commits.map((c) => ({
    oid: c.oid,
    message: c.commit.message,
    author: {
      name: c.commit.author.name,
      email: c.commit.author.email,
      timestamp: c.commit.author.timestamp,
    },
    committer: {
      name: c.commit.committer.name,
      email: c.commit.committer.email,
      timestamp: c.commit.committer.timestamp,
    },
    parent: c.commit.parent,
  }));
}

/**
 * Get working-directory status matrix.
 * Returns rows: [filepath, HEAD, WORKDIR, STAGE]
 *   HEAD:    0=absent, 1=present
 *   WORKDIR: 0=absent, 1=identical to HEAD, 2=different
 *   STAGE:   0=absent, 1=identical to HEAD, 2=different (staged), 3=different from both
 */
export async function gitStatusMatrix(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
): Promise<GitStatusRow[]> {
  const fs = buildGitFs(rootHandle);
  const matrix = await git.statusMatrix({ fs, dir }) as GitStatusRow[];
  // Filter out .git internal files
  return matrix.filter((row) => !row[0].startsWith('.git/'));
}

/**
 * Check if a directory is a git repository.
 */
export async function gitIsRepo(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
): Promise<boolean> {
  const fs = buildGitFs(rootHandle);
  try {
    // Check if .git directory exists at the given path
    const entries = await fs.promises.readdir(dir);
    return entries.includes('.git');
  } catch {
    return false;
  }
}

/**
 * Read the content of a blob at a given commit OID.
 */
export async function gitReadBlob(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
  oid: string,
  filepath: string,
): Promise<Uint8Array | null> {
  const fs = buildGitFs(rootHandle);
  try {
    const result = await git.readBlob({ fs, dir, oid, filepath });
    return result.blob;
  } catch {
    return null;
  }
}

/**
 * List files changed between two commits (or between a commit and its parent).
 * Uses `git.walk` to compare two trees.
 */
export async function gitDiffFiles(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
  commitOid: string,
  parentOid?: string,
): Promise<GitDiffFile[]> {
  const fs = buildGitFs(rootHandle);
  const results: GitDiffFile[] = [];

  const trees = parentOid
    ? [git.TREE({ ref: parentOid }), git.TREE({ ref: commitOid })]
    : [git.TREE({ ref: commitOid })];

  await git.walk({
    fs,
    dir,
    trees,
    map: async (filepath, entries) => {
      if (!entries || filepath === '.' || filepath === '.git') return undefined;

      // If no parent, all files in commitOid are "added"
      if (!parentOid) {
        const [entry] = entries;
        if (entry) {
          const type = await entry.type();
          if (type === 'blob') {
            results.push({ path: filepath, status: 'added' });
          }
        }
        return undefined;
      }

      const [parentEntry, commitEntry] = entries;

      const parentOidVal = parentEntry ? await parentEntry.oid() : null;
      const commitOidVal = commitEntry ? await commitEntry.oid() : null;

      // Skip if identical
      if (parentOidVal === commitOidVal) return undefined;

      // Skip directories — only look at blobs
      const parentType = parentEntry ? await parentEntry.type() : null;
      const commitType = commitEntry ? await commitEntry.type() : null;
      if (parentType === 'tree' || commitType === 'tree') return undefined;

      if (!parentOidVal && commitOidVal) {
        results.push({ path: filepath, status: 'added' });
      } else if (parentOidVal && !commitOidVal) {
        results.push({ path: filepath, status: 'deleted' });
      } else {
        results.push({ path: filepath, status: 'modified' });
      }
      return undefined;
    },
  });

  return results;
}

/**
 * Generate a unified diff for a single file between two commits.
 */
export async function gitDiffFileContent(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
  filepath: string,
  commitOid: string,
  parentOid?: string,
): Promise<GitFileDiff> {
  let oldContent = '';
  let newContent = '';

  if (parentOid) {
    const oldBlob = await gitReadBlob(rootHandle, dir, parentOid, filepath);
    if (oldBlob) {
      try {
        oldContent = new TextDecoder('utf-8', { fatal: true }).decode(oldBlob);
      } catch {
        oldContent = '(binary file)';
      }
    }
  }

  const newBlob = await gitReadBlob(rootHandle, dir, commitOid, filepath);
  if (newBlob) {
    try {
      newContent = new TextDecoder('utf-8', { fatal: true }).decode(newBlob);
    } catch {
      newContent = '(binary file)';
    }
  }

  const status: GitDiffFile['status'] =
    !oldContent && newContent ? 'added' :
    oldContent && !newContent ? 'deleted' : 'modified';

  const patch = createPatch(
    filepath,
    oldContent,
    newContent,
    parentOid ? parentOid.substring(0, 7) : '/dev/null',
    commitOid.substring(0, 7),
    { context: 3 },
  );

  return { path: filepath, status, patch, oldContent, newContent };
}

/**
 * List remote branches / refs.
 */
export async function gitListRemotes(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
): Promise<Array<{ remote: string; url: string }>> {
  const fs = buildGitFs(rootHandle);
  return git.listRemotes({ fs, dir });
}

/**
 * Set user config (author name / email) in the local .git/config.
 */
export async function gitSetConfig(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
  key: string,
  value: string,
): Promise<void> {
  const fs = buildGitFs(rootHandle);
  await git.setConfig({ fs, dir, path: key, value });
}

/**
 * Compute a diff between the HEAD commit (or index) and the working directory
 * for a single file.  This is the "current changes" diff for unstaged files.
 *
 * For staged files it compares HEAD → index content.
 * For unstaged files it compares HEAD → working directory content.
 */
export async function gitDiffWorkingFile(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
  filepath: string,
  staged: boolean = false,
): Promise<GitFileDiff> {
  const fs = buildGitFs(rootHandle);
  let oldContent = '';
  let newContent = '';

  // Read HEAD version of the file
  try {
    const headOid = await git.resolveRef({ fs, dir, ref: 'HEAD' });
    const blob = await gitReadBlob(rootHandle, dir, headOid, filepath);
    if (blob) {
      try {
        oldContent = new TextDecoder('utf-8', { fatal: true }).decode(blob);
      } catch {
        oldContent = '(binary file)';
      }
    }
  } catch {
    // No HEAD commit yet (empty repo) — old content is empty
  }

  if (staged) {
    // For staged files, we need the content in the Git index.
    // isomorphic-git doesn't expose a simple "read blob from index" API,
    // so we read the working-tree copy.  For the common workflow (edit →
    // stage → commit) the working-tree and the index are identical.
    // In the rare partially-staged case (stage=3) the diff may not be
    // perfectly accurate, but it is still useful.
    try {
      const fullPath = normalizePath(dir + '/' + filepath);
      const fh = await getFileHandle(rootHandle, fullPath);
      const file = await fh.getFile();
      newContent = await file.text();
    } catch {
      newContent = '';
    }
  } else {
    // For unstaged files, read the working directory version
    try {
      const fullPath = normalizePath(dir + '/' + filepath);
      const fh = await getFileHandle(rootHandle, fullPath);
      const file = await fh.getFile();
      newContent = await file.text();
    } catch {
      // File deleted in working directory
      newContent = '';
    }
  }

  const status: GitDiffFile['status'] =
    !oldContent && newContent ? 'added' :
    oldContent && !newContent ? 'deleted' : 'modified';

  const patch = createPatch(
    filepath,
    oldContent,
    newContent,
    'HEAD',
    staged ? 'Index' : 'Working Tree',
    { context: 3 },
  );

  return { path: filepath, status, patch, oldContent, newContent };
}

/**
 * List all branches in the repository (local + remote tracking).
 * Remote branches are returned without the `remotes/origin/` prefix
 * and de-duplicated against local branches.
 */
export async function gitListBranches(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
): Promise<string[]> {
  const fs = buildGitFs(rootHandle);
  const local = await git.listBranches({ fs, dir });
  let remote: string[] = [];
  try {
    remote = await git.listBranches({ fs, dir, remote: 'origin' });
  } catch {
    // No remote configured or no remote refs yet
  }
  // Merge: local first, then remote names not already in local
  // remote entries are plain branch names (e.g. 'main', 'dev')
  // Filter out HEAD pointer that isomorphic-git sometimes includes
  const localSet = new Set(local);
  for (const branch of remote) {
    if (branch !== 'HEAD' && !localSet.has(branch)) {
      local.push(branch);
    }
  }
  return local;
}

/**
 * Fetch refs and objects from a remote.
 */
export async function gitFetch(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
  auth?: GitAuth,
  corsProxy?: string,
  remote = 'origin',
): Promise<void> {
  const fs = buildGitFs(rootHandle);
  await git.fetch({
    fs,
    http,
    dir,
    remote,
    ...(corsProxy ? { corsProxy } : {}),
    onAuth: auth ? () => ({ username: auth.username, password: auth.password }) : undefined,
  });
}

/**
 * Create a new branch.
 */
export async function gitCreateBranch(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
  name: string,
  checkout = true,
): Promise<void> {
  const fs = buildGitFs(rootHandle);
  await git.branch({ fs, dir, ref: name, checkout });
}

/**
 * Checkout a branch or commit.
 */
export async function gitCheckout(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
  ref: string,
): Promise<void> {
  const fs = buildGitFs(rootHandle);
  await git.checkout({ fs, dir, ref });
}

/**
 * Delete a branch.
 */
export async function gitDeleteBranch(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
  name: string,
): Promise<void> {
  const fs = buildGitFs(rootHandle);
  await git.deleteBranch({ fs, dir, ref: name });
}

/**
 * Merge a branch into the current branch.
 */
export async function gitMerge(
  rootHandle: FileSystemDirectoryHandle,
  dir: string,
  theirs: string,
  author: GitAuthor,
): Promise<string> {
  const fs = buildGitFs(rootHandle);
  const ours = await git.currentBranch({ fs, dir });
  if (!ours) {
    throw new Error('Cannot merge: no current branch');
  }
  const result = await git.merge({ fs, dir, ours, theirs, author });
  return result.oid;
}
