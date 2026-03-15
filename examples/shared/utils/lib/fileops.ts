/**
 * Shared file operations for Stark OS apps (files, desktop).
 *
 * All heavy dependencies (JSZip) are dynamically imported so they
 * are tree-shaken from apps that don't use them.
 */

import {
  getDirectoryHandle,
  getFileHandle,
  getPathParts,
  normalizePath,
} from './opfs';

/* ── Constants ── */

export const TRASH_PATH = '/trash';

/* ── Zip operations ── */

/**
 * Recursively read all files under a directory handle and add them to a
 * JSZip folder instance, preserving the directory structure.
 */
async function addDirectoryToZip(
  zipFolder: InstanceType<import('jszip').default>,
  dirHandle: FileSystemDirectoryHandle,
): Promise<void> {
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file') {
      const file = await (handle as FileSystemFileHandle).getFile();
      const data = await file.arrayBuffer();
      zipFolder.file(name, data);
    } else {
      const subFolder = zipFolder.folder(name)!;
      await addDirectoryToZip(
        subFolder,
        handle as FileSystemDirectoryHandle,
      );
    }
  }
}

/**
 * Zip one or more files/folders from OPFS and write the archive to the
 * same directory as a `.zip` file.
 *
 * @param root       OPFS root handle (from `getStarkOpfsRoot()`)
 * @param dirPath    The directory that contains the items (e.g. `/home/desktop`)
 * @param names      Names of files/folders to include
 * @returns          The name of the created zip file
 */
export async function zipItems(
  root: FileSystemDirectoryHandle,
  dirPath: string,
  names: string[],
): Promise<string> {
  if (names.length === 0) throw new Error('No items to zip');

  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const parentHandle = await getDirectoryHandle(root, dirPath);

  for (const name of names) {
    // Try as file first, then as directory
    let isFile = true;
    try {
      await parentHandle.getFileHandle(name);
    } catch {
      isFile = false;
    }

    if (isFile) {
      const fh = await parentHandle.getFileHandle(name);
      const file = await fh.getFile();
      const data = await file.arrayBuffer();
      zip.file(name, data);
    } else {
      const dh = await parentHandle.getDirectoryHandle(name);
      const folder = zip.folder(name)!;
      await addDirectoryToZip(folder, dh);
    }
  }

  // Generate the zip
  const zipData = await zip.generateAsync({ type: 'uint8array' });

  // Derive output name
  const baseName = names.length === 1 ? names[0] : 'archive';
  let zipName = baseName + '.zip';
  // Avoid overwriting existing files — append a number if needed
  let counter = 1;
  const existingNames = new Set<string>();
  for await (const key of parentHandle.keys()) existingNames.add(key);
  while (existingNames.has(zipName)) {
    zipName = `${baseName} (${counter}).zip`;
    counter++;
  }

  // Write to OPFS
  const outHandle = await parentHandle.getFileHandle(zipName, { create: true });
  const writable = await outHandle.createWritable();
  try {
    await writable.write(zipData);
  } finally {
    await writable.close();
  }

  return zipName;
}

/* ── Trash operations ── */

/**
 * Ensure the /trash directory exists under the OPFS root.
 */
export async function ensureTrash(
  root: FileSystemDirectoryHandle,
): Promise<void> {
  await getDirectoryHandle(root, TRASH_PATH, true);
}

/**
 * Empty the trash by removing all entries inside /trash.
 */
export async function emptyTrash(
  root: FileSystemDirectoryHandle,
): Promise<void> {
  const trashHandle = await getDirectoryHandle(root, TRASH_PATH);
  const names: string[] = [];
  for await (const key of trashHandle.keys()) names.push(key);
  for (const name of names) {
    await trashHandle.removeEntry(name, { recursive: true });
  }
}

/**
 * Recursively copy a directory from source to destination.
 */
async function copyDirectory(
  srcHandle: FileSystemDirectoryHandle,
  destHandle: FileSystemDirectoryHandle,
): Promise<void> {
  for await (const [name, handle] of srcHandle.entries()) {
    if (handle.kind === 'file') {
      const file = await (handle as FileSystemFileHandle).getFile();
      const data = await file.arrayBuffer();
      const destFile = await destHandle.getFileHandle(name, { create: true });
      const writable = await destFile.createWritable();
      await writable.write(data);
      await writable.close();
    } else {
      const destSubDir = await destHandle.getDirectoryHandle(name, { create: true });
      await copyDirectory(handle as FileSystemDirectoryHandle, destSubDir);
    }
  }
}

/**
 * Move items to the /trash directory. If a name collision exists in trash,
 * appends a numeric suffix.
 *
 * @param root       OPFS root handle
 * @param dirPath    The directory containing the items
 * @param names      Names of files/folders to trash
 */
export async function moveToTrash(
  root: FileSystemDirectoryHandle,
  dirPath: string,
  names: string[],
): Promise<void> {
  if (names.length === 0) return;

  await ensureTrash(root);
  const trashHandle = await getDirectoryHandle(root, TRASH_PATH);
  const srcHandle = await getDirectoryHandle(root, dirPath);

  // Collect existing trash names for collision detection
  const existingNames = new Set<string>();
  for await (const key of trashHandle.keys()) existingNames.add(key);

  for (const name of names) {
    // Resolve unique name in trash
    let destName = name;
    let counter = 1;
    while (existingNames.has(destName)) {
      const dot = name.lastIndexOf('.');
      if (dot > 0) {
        destName = `${name.slice(0, dot)} (${counter})${name.slice(dot)}`;
      } else {
        destName = `${name} (${counter})`;
      }
      counter++;
    }
    existingNames.add(destName);

    // Determine if file or directory and copy to trash
    let isFile = true;
    try {
      await srcHandle.getFileHandle(name);
    } catch {
      isFile = false;
    }

    if (isFile) {
      const fh = await srcHandle.getFileHandle(name);
      const file = await fh.getFile();
      const data = await file.arrayBuffer();
      const destFh = await trashHandle.getFileHandle(destName, { create: true });
      const writable = await destFh.createWritable();
      await writable.write(data);
      await writable.close();
    } else {
      const srcDir = await srcHandle.getDirectoryHandle(name);
      const destDir = await trashHandle.getDirectoryHandle(destName, { create: true });
      await copyDirectory(srcDir, destDir);
    }

    // Remove original
    await srcHandle.removeEntry(name, { recursive: true });
  }
}

/* ── File / folder creation ── */

/**
 * Create an empty file in the given OPFS directory.
 * Returns the actual name used (avoids collisions).
 */
export async function createEmptyFile(
  root: FileSystemDirectoryHandle,
  dirPath: string,
  desiredName = 'untitled.txt',
): Promise<string> {
  const dirHandle = await getDirectoryHandle(root, dirPath, true);

  // Avoid collisions
  const existingNames = new Set<string>();
  for await (const key of dirHandle.keys()) existingNames.add(key);

  let finalName = desiredName;
  let counter = 1;
  while (existingNames.has(finalName)) {
    const dot = desiredName.lastIndexOf('.');
    if (dot > 0) {
      finalName = `${desiredName.slice(0, dot)} (${counter})${desiredName.slice(dot)}`;
    } else {
      finalName = `${desiredName} (${counter})`;
    }
    counter++;
  }

  const fh = await dirHandle.getFileHandle(finalName, { create: true });
  const writable = await fh.createWritable();
  await writable.write(new Uint8Array(0));
  await writable.close();

  return finalName;
}

/**
 * Create a new folder in the given OPFS directory.
 * Returns the actual name used (avoids collisions).
 */
export async function createFolder(
  root: FileSystemDirectoryHandle,
  dirPath: string,
  desiredName = 'New Folder',
): Promise<string> {
  const dirHandle = await getDirectoryHandle(root, dirPath, true);

  // Avoid collisions
  const existingNames = new Set<string>();
  for await (const key of dirHandle.keys()) existingNames.add(key);

  let finalName = desiredName;
  let counter = 1;
  while (existingNames.has(finalName)) {
    finalName = `${desiredName} (${counter})`;
    counter++;
  }

  await dirHandle.getDirectoryHandle(finalName, { create: true });
  return finalName;
}

/* ── Download operations ── */

/**
 * Download one or more files/folders from OPFS to the user's device.
 *
 * - Single file: triggers a direct browser download.
 * - Multiple items or a directory: zips them first, then downloads the zip.
 *
 * @param root       OPFS root handle
 * @param dirPath    The directory containing the items
 * @param names      Names of files/folders to download
 */
export async function downloadItems(
  root: FileSystemDirectoryHandle,
  dirPath: string,
  names: string[],
): Promise<void> {
  if (names.length === 0) return;

  const parentHandle = await getDirectoryHandle(root, dirPath);

  // Helper to trigger browser download
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (names.length === 1) {
    const name = names[0];
    // Check if it's a file
    let isFile = true;
    try {
      await parentHandle.getFileHandle(name);
    } catch {
      isFile = false;
    }

    if (isFile) {
      // Direct download of a single file
      const fh = await parentHandle.getFileHandle(name);
      const file = await fh.getFile();
      triggerDownload(file, name);
      return;
    }
  }

  // Multiple items or directory: zip then download
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  for (const name of names) {
    let isFile = true;
    try {
      await parentHandle.getFileHandle(name);
    } catch {
      isFile = false;
    }

    if (isFile) {
      const fh = await parentHandle.getFileHandle(name);
      const file = await fh.getFile();
      const data = await file.arrayBuffer();
      zip.file(name, data);
    } else {
      const dh = await parentHandle.getDirectoryHandle(name);
      const folder = zip.folder(name)!;
      await addDirectoryToZip(folder, dh);
    }
  }

  const zipData = await zip.generateAsync({ type: 'blob' });
  const archiveName = names.length === 1 ? `${names[0]}.zip` : 'download.zip';
  triggerDownload(zipData, archiveName);
}

/* ── Upload operations ── */

/**
 * Rename a file or folder inside an OPFS directory.
 *
 * OPFS doesn't have a native rename — we copy+delete.
 *
 * @param root       OPFS root handle
 * @param dirPath    The directory containing the item
 * @param oldName    Current name
 * @param newName    Desired new name
 * @returns          The actual name used (may differ if collision)
 */
export async function renameItem(
  root: FileSystemDirectoryHandle,
  dirPath: string,
  oldName: string,
  newName: string,
): Promise<string> {
  if (!newName || newName === oldName) return oldName;

  const dirHandle = await getDirectoryHandle(root, dirPath);

  // Collision avoidance
  const existingNames = new Set<string>();
  for await (const key of dirHandle.keys()) existingNames.add(key);

  let finalName = newName;
  let counter = 1;
  while (existingNames.has(finalName) && finalName !== oldName) {
    const dot = newName.lastIndexOf('.');
    if (dot > 0) {
      finalName = `${newName.slice(0, dot)} (${counter})${newName.slice(dot)}`;
    } else {
      finalName = `${newName} (${counter})`;
    }
    counter++;
  }

  // Determine if file or directory
  let isFile = true;
  try {
    await dirHandle.getFileHandle(oldName);
  } catch {
    isFile = false;
  }

  if (isFile) {
    const srcFh = await dirHandle.getFileHandle(oldName);
    const file = await srcFh.getFile();
    const data = await file.arrayBuffer();
    const destFh = await dirHandle.getFileHandle(finalName, { create: true });
    const writable = await destFh.createWritable();
    try {
      await writable.write(data);
    } finally {
      await writable.close();
    }
    await dirHandle.removeEntry(oldName);
  } else {
    const srcDir = await dirHandle.getDirectoryHandle(oldName);
    const destDir = await dirHandle.getDirectoryHandle(finalName, { create: true });
    await copyDirectory(srcDir, destDir);
    await dirHandle.removeEntry(oldName, { recursive: true });
  }

  return finalName;
}

/**
 * Upload files from the browser's native file picker into an OPFS directory.
 * Accepts a FileList or array of File objects (from `<input type="file">`).
 *
 * @param root       OPFS root handle
 * @param dirPath    Target directory path
 * @param files      Browser File objects to upload
 */
export async function uploadFiles(
  root: FileSystemDirectoryHandle,
  dirPath: string,
  files: FileList | File[],
): Promise<void> {
  if (!files || files.length === 0) return;

  const dirHandle = await getDirectoryHandle(root, dirPath, true);

  for (const file of Array.from(files)) {
    const fh = await dirHandle.getFileHandle(file.name, { create: true });
    const writable = await fh.createWritable();
    try {
      await writable.write(await file.arrayBuffer());
    } finally {
      await writable.close();
    }
  }
}

/* ── Move / Copy operations ── */

/**
 * Check which names in a list already exist in the destination directory.
 *
 * @param root       OPFS root handle
 * @param destPath   Destination directory path
 * @param names      Names to check
 * @returns          Names that already exist in the destination
 */
export async function checkConflicts(
  root: FileSystemDirectoryHandle,
  destPath: string,
  names: string[],
): Promise<string[]> {
  const destHandle = await getDirectoryHandle(root, destPath);
  const existing = new Set<string>();
  for await (const key of destHandle.keys()) existing.add(key);
  return names.filter(n => existing.has(n));
}

/**
 * Copy files/folders from one directory to another.
 *
 * @param root       OPFS root handle
 * @param srcPath    Source directory path
 * @param destPath   Destination directory path
 * @param names      Names of files/folders to copy
 * @param overwrite  If true, replace existing items; otherwise return conflicts
 * @returns          Empty array on success, or conflicting names if overwrite is false
 */
export async function copyItems(
  root: FileSystemDirectoryHandle,
  srcPath: string,
  destPath: string,
  names: string[],
  overwrite = false,
): Promise<string[]> {
  if (names.length === 0) return [];
  if (normalizePath(srcPath) === normalizePath(destPath)) return []; // noop

  const srcHandle = await getDirectoryHandle(root, srcPath);
  const destHandle = await getDirectoryHandle(root, destPath, true);

  // Check for conflicts
  if (!overwrite) {
    const conflicts = await checkConflicts(root, destPath, names);
    if (conflicts.length > 0) return conflicts;
  }

  for (const name of names) {
    // Remove existing if overwriting
    if (overwrite) {
      try { await destHandle.removeEntry(name, { recursive: true }); } catch { /* may not exist */ }
    }

    let isFile = true;
    try { await srcHandle.getFileHandle(name); } catch { isFile = false; }

    if (isFile) {
      const fh = await srcHandle.getFileHandle(name);
      const file = await fh.getFile();
      const data = await file.arrayBuffer();
      const destFh = await destHandle.getFileHandle(name, { create: true });
      const writable = await destFh.createWritable();
      try { await writable.write(data); } finally { await writable.close(); }
    } else {
      const srcDir = await srcHandle.getDirectoryHandle(name);
      const destDir = await destHandle.getDirectoryHandle(name, { create: true });
      await copyDirectory(srcDir, destDir);
    }
  }

  return [];
}

/**
 * Move files/folders from one directory to another.
 *
 * @param root       OPFS root handle
 * @param srcPath    Source directory path
 * @param destPath   Destination directory path
 * @param names      Names of files/folders to move
 * @param overwrite  If true, replace existing items; otherwise return conflicts
 * @returns          Empty array on success, or conflicting names if overwrite is false
 */
export async function moveItems(
  root: FileSystemDirectoryHandle,
  srcPath: string,
  destPath: string,
  names: string[],
  overwrite = false,
): Promise<string[]> {
  if (names.length === 0) return [];
  if (normalizePath(srcPath) === normalizePath(destPath)) return []; // noop

  const conflicts = await copyItems(root, srcPath, destPath, names, overwrite);
  if (conflicts.length > 0) return conflicts;

  // Remove originals
  const srcHandle = await getDirectoryHandle(root, srcPath);
  for (const name of names) {
    await srcHandle.removeEntry(name, { recursive: true });
  }

  return [];
}

/* ── Clipboard helpers ── */

export const CLIPBOARD_COPY_PREFIX = 'stark-copy:';
export const CLIPBOARD_CUT_PREFIX = 'stark-cut:';

/**
 * Build clipboard text for copy or cut operations.
 * Each line is prefixed with `stark-copy:` or `stark-cut:` followed by the full path.
 */
export function buildClipboardText(
  mode: 'copy' | 'cut',
  dirPath: string,
  names: string[],
): string {
  const prefix = mode === 'copy' ? CLIPBOARD_COPY_PREFIX : CLIPBOARD_CUT_PREFIX;
  return names.map(n => prefix + normalizePath(dirPath + '/' + n)).join('\n');
}

/**
 * Parse clipboard text written by buildClipboardText.
 *
 * @returns  The operation mode and list of full paths, or null if not a Stark clipboard.
 */
export function parseClipboard(
  text: string,
): { mode: 'copy' | 'cut'; paths: string[] } | null {
  const lines = text.trim().split('\n').filter(l => l.length > 0);
  if (lines.length === 0) return null;

  const first = lines[0];
  let mode: 'copy' | 'cut';
  let prefix: string;

  if (first.startsWith(CLIPBOARD_COPY_PREFIX)) {
    mode = 'copy';
    prefix = CLIPBOARD_COPY_PREFIX;
  } else if (first.startsWith(CLIPBOARD_CUT_PREFIX)) {
    mode = 'cut';
    prefix = CLIPBOARD_CUT_PREFIX;
  } else {
    return null;
  }

  const paths = lines
    .filter(l => l.startsWith(prefix))
    .map(l => l.slice(prefix.length));

  if (paths.length === 0) return null;
  return { mode, paths };
}

/**
 * Given a list of full paths, extract the common source directory and individual names.
 * Assumes all paths share the same parent directory.
 */
export function extractSourceDir(
  paths: string[],
): { srcDir: string; names: string[] } {
  const names: string[] = [];
  let srcDir = '/';
  for (const p of paths) {
    const parts = p.split('/').filter(s => s.length > 0);
    const name = parts.pop();
    if (name) names.push(name);
    srcDir = '/' + parts.join('/');
  }
  return { srcDir: normalizePath(srcDir), names };
}
