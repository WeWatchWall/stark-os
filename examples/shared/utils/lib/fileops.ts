/**
 * Shared file operations for Stark OS apps (files, desktop).
 *
 * All heavy dependencies (JSZip) are dynamically imported so they
 * are tree-shaken from apps that don't use them.
 */

import {
  type FileItem,
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

/* ── Zip navigation & extraction ── */

/**
 * Check whether a normalized path traverses into a zip archive.
 * A path like `/home/docs/archive.zip/folder` is inside a zip.
 */
export function isZipPath(path: string): boolean {
  const parts = getPathParts(path);
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i].toLowerCase().endsWith('.zip')) return true;
  }
  return false;
}

/**
 * Split a zip-traversing path into its OPFS and in-zip components.
 *
 * Example: `/home/docs/archive.zip/sub/file.txt`
 *   → { opfsDir: '/home/docs', zipName: 'archive.zip', innerPath: 'sub/file.txt' }
 *
 * Returns `null` when the path does not traverse into a zip.
 */
export function splitZipPath(
  path: string,
): { opfsDir: string; zipName: string; innerPath: string } | null {
  const parts = getPathParts(path);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].toLowerCase().endsWith('.zip')) {
      if (i === parts.length - 1) return null; // path points AT the zip, not inside it
      const opfsDir = '/' + parts.slice(0, i).join('/') || '/';
      return {
        opfsDir: normalizePath(opfsDir),
        zipName: parts[i],
        innerPath: parts.slice(i + 1).join('/'),
      };
    }
  }
  return null;
}

/**
 * Load a JSZip instance for a zip file stored in OPFS.
 */
async function loadZip(
  root: FileSystemDirectoryHandle,
  opfsDir: string,
  zipName: string,
): Promise<InstanceType<typeof import('jszip').default>> {
  const JSZip = (await import('jszip')).default;
  const dirHandle = await getDirectoryHandle(root, opfsDir);
  const fh = await dirHandle.getFileHandle(zipName);
  const file = await fh.getFile();
  const data = await file.arrayBuffer();
  return JSZip.loadAsync(data);
}

/**
 * Save a JSZip instance back to the same OPFS file.
 */
async function saveZip(
  root: FileSystemDirectoryHandle,
  opfsDir: string,
  zipName: string,
  zip: InstanceType<typeof import('jszip').default>,
): Promise<void> {
  const dirHandle = await getDirectoryHandle(root, opfsDir);
  const fh = await dirHandle.getFileHandle(zipName, { create: true });
  const writable = await fh.createWritable();
  try {
    const data = await zip.generateAsync({ type: 'uint8array' });
    await writable.write(data);
  } finally {
    await writable.close();
  }
}

/**
 * Read directory contents inside a zip archive and return FileItem entries.
 *
 * @param root       OPFS root handle
 * @param path       A path that traverses into a zip (e.g. `/home/archive.zip/sub`)
 * @returns          FileItem[] representing the entries at the given zip-internal directory
 */
export async function readZipDir(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileItem[]> {
  const info = splitZipPath(path);
  if (!info) throw new Error('Not a zip path: ' + path);

  const zip = await loadZip(root, info.opfsDir, info.zipName);

  // Normalize the inner prefix (ensure trailing slash for directory matching)
  const prefix = info.innerPath ? info.innerPath.replace(/\/+$/, '') + '/' : '';
  const depth = prefix ? prefix.split('/').length : 0;

  const seenDirs = new Set<string>();
  const items: FileItem[] = [];

  zip.forEach((relativePath, zipEntry) => {
    // Skip the prefix itself
    if (!relativePath.startsWith(prefix)) return;
    const remainder = relativePath.slice(prefix.length);
    if (!remainder || remainder === '/') return;

    const segments = remainder.split('/').filter(s => s.length > 0);
    if (segments.length === 0) return;

    if (segments.length === 1) {
      const name = segments[0];
      if (zipEntry.dir) {
        if (!seenDirs.has(name)) {
          seenDirs.add(name);
          items.push({ name, isDirectory: true, size: 0 });
        }
      } else {
        items.push({
          name,
          isDirectory: false,
          size: zipEntry._data?.uncompressedSize ?? 0,
        });
      }
    } else {
      // Deeper entry → its first segment is a subdirectory at this level
      const dirName = segments[0];
      if (!seenDirs.has(dirName)) {
        seenDirs.add(dirName);
        items.push({ name: dirName, isDirectory: true, size: 0 });
      }
    }
  });

  return items;
}

/**
 * Extract a zip archive into a folder of the same name (minus `.zip`).
 *
 * @param root       OPFS root handle
 * @param dirPath    The directory containing the zip file
 * @param zipName    Name of the zip file to extract
 * @returns          The name of the created folder
 */
export async function extractZip(
  root: FileSystemDirectoryHandle,
  dirPath: string,
  zipName: string,
): Promise<string> {
  const zip = await loadZip(root, dirPath, zipName);

  // Derive folder name (strip .zip extension)
  const baseName = zipName.replace(/\.zip$/i, '');
  const parentHandle = await getDirectoryHandle(root, dirPath);

  // Avoid overwriting existing folders
  const existingNames = new Set<string>();
  for await (const key of parentHandle.keys()) existingNames.add(key);

  let folderName = baseName;
  let counter = 1;
  while (existingNames.has(folderName)) {
    folderName = `${baseName} (${counter})`;
    counter++;
  }

  const destHandle = await parentHandle.getDirectoryHandle(folderName, { create: true });

  // Extract all entries
  const entries = Object.entries(zip.files);
  for (const [path, entry] of entries) {
    if (entry.dir) {
      // Create directory
      await getDirectoryHandle(destHandle, path, true);
    } else {
      // Write file
      const data = await entry.async('uint8array');
      const parts = path.split('/').filter(s => s.length > 0);
      const fileName = parts.pop()!;
      let parent = destHandle;
      for (const part of parts) {
        parent = await parent.getDirectoryHandle(part, { create: true });
      }
      const fh = await parent.getFileHandle(fileName, { create: true });
      const writable = await fh.createWritable();
      try {
        await writable.write(data);
      } finally {
        await writable.close();
      }
    }
  }

  return folderName;
}

/**
 * Extract specific items from inside a zip to an OPFS directory.
 *
 * @param root       OPFS root handle
 * @param zipPath    Full zip-traversing path (e.g. `/home/archive.zip/sub`)
 * @param names      Names of entries at the current zip level to extract
 * @param destPath   OPFS destination directory for extracted items
 */
export async function extractFromZip(
  root: FileSystemDirectoryHandle,
  zipPath: string,
  names: string[],
  destPath: string,
): Promise<void> {
  if (names.length === 0) return;

  const info = splitZipPath(zipPath);
  if (!info) throw new Error('Not a zip path: ' + zipPath);

  const zip = await loadZip(root, info.opfsDir, info.zipName);
  const prefix = info.innerPath ? info.innerPath.replace(/\/+$/, '') + '/' : '';
  const destHandle = await getDirectoryHandle(root, destPath, true);

  for (const name of names) {
    const entryPath = prefix + name;

    // Check if it's a file entry
    const fileEntry = zip.file(entryPath);
    if (fileEntry) {
      const data = await fileEntry.async('uint8array');
      const fh = await destHandle.getFileHandle(name, { create: true });
      const writable = await fh.createWritable();
      try { await writable.write(data); } finally { await writable.close(); }
      continue;
    }

    // Must be a directory — extract all entries under it
    const dirPrefix = entryPath + '/';
    const dirHandle = await destHandle.getDirectoryHandle(name, { create: true });

    zip.forEach((relPath, entry) => {
      if (!relPath.startsWith(dirPrefix)) return;
      // Queue the extraction (forEach is sync so we collect promises)
    });

    // Collect and await all sub-entries
    const subEntries: Array<[string, import('jszip').JSZipObject]> = [];
    zip.forEach((relPath, entry) => {
      if (relPath.startsWith(dirPrefix) && relPath !== dirPrefix) {
        subEntries.push([relPath.slice(dirPrefix.length), entry]);
      }
    });

    for (const [subPath, entry] of subEntries) {
      if (entry.dir) {
        await getDirectoryHandle(dirHandle, subPath, true);
      } else {
        const data = await entry.async('uint8array');
        const parts = subPath.split('/').filter(s => s.length > 0);
        const fileName = parts.pop()!;
        let parent: FileSystemDirectoryHandle = dirHandle;
        for (const part of parts) {
          parent = await parent.getDirectoryHandle(part, { create: true });
        }
        const fh = await parent.getFileHandle(fileName, { create: true });
        const writable = await fh.createWritable();
        try { await writable.write(data); } finally { await writable.close(); }
      }
    }
  }
}

/**
 * Download items from inside a zip archive to the user's device.
 *
 * @param root       OPFS root handle
 * @param zipPath    Full zip-traversing path
 * @param names      Names of entries to download
 */
export async function downloadZipItems(
  root: FileSystemDirectoryHandle,
  zipPath: string,
  names: string[],
): Promise<void> {
  if (names.length === 0) return;

  const info = splitZipPath(zipPath);
  if (!info) throw new Error('Not a zip path: ' + zipPath);

  const zip = await loadZip(root, info.opfsDir, info.zipName);
  const prefix = info.innerPath ? info.innerPath.replace(/\/+$/, '') + '/' : '';

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

  // Single file → direct download
  if (names.length === 1) {
    const entryPath = prefix + names[0];
    const fileEntry = zip.file(entryPath);
    if (fileEntry) {
      const data = await fileEntry.async('blob');
      triggerDownload(data, names[0]);
      return;
    }
  }

  // Multiple items or directory: create a new zip for download
  const JSZip = (await import('jszip')).default;
  const dlZip = new JSZip();

  for (const name of names) {
    const entryPath = prefix + name;
    const fileEntry = zip.file(entryPath);
    if (fileEntry) {
      const data = await fileEntry.async('uint8array');
      dlZip.file(name, data);
    } else {
      // Directory — add all sub-entries
      const dirPrefix = entryPath + '/';
      zip.forEach((relPath, entry) => {
        if (relPath.startsWith(dirPrefix) && !entry.dir) {
          const subPath = relPath.slice((prefix).length);
          // We need to queue this
        }
      });

      // Collect sub-entries
      const subEntries: Array<[string, import('jszip').JSZipObject]> = [];
      zip.forEach((relPath, entry) => {
        if (relPath.startsWith(dirPrefix) && relPath !== dirPrefix) {
          subEntries.push([relPath.slice(dirPrefix.length), entry]);
        }
      });

      const folder = dlZip.folder(name)!;
      for (const [subPath, entry] of subEntries) {
        if (entry.dir) {
          folder.folder(subPath);
        } else {
          const data = await entry.async('uint8array');
          folder.file(subPath, data);
        }
      }
    }
  }

  const blob = await dlZip.generateAsync({ type: 'blob' });
  const archiveName = names.length === 1 ? `${names[0]}.zip` : 'download.zip';
  triggerDownload(blob, archiveName);
}

/**
 * Delete entries from inside a zip archive (modifies the zip in-place).
 *
 * @param root       OPFS root handle
 * @param zipPath    Full zip-traversing path
 * @param names      Names of entries to delete from the current zip directory level
 */
export async function deleteFromZip(
  root: FileSystemDirectoryHandle,
  zipPath: string,
  names: string[],
): Promise<void> {
  if (names.length === 0) return;

  const info = splitZipPath(zipPath);
  if (!info) throw new Error('Not a zip path: ' + zipPath);

  const zip = await loadZip(root, info.opfsDir, info.zipName);
  const prefix = info.innerPath ? info.innerPath.replace(/\/+$/, '') + '/' : '';

  for (const name of names) {
    const entryPath = prefix + name;
    // Remove exact file entry
    zip.remove(entryPath);
    // Remove directory entry and all contents
    zip.remove(entryPath + '/');
    // Also remove any entries that start with entryPath/ (children)
    const childPrefix = entryPath + '/';
    const toRemove: string[] = [];
    zip.forEach((relPath) => {
      if (relPath.startsWith(childPrefix)) {
        toRemove.push(relPath);
      }
    });
    for (const p of toRemove) {
      zip.remove(p);
    }
  }

  await saveZip(root, info.opfsDir, info.zipName, zip);
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

/** Build a user-facing conflict confirmation message. */
export function conflictMessage(folderName?: string): string {
  if (folderName) {
    return `Some items already exist in "${folderName}". Do you want to replace them?`;
  }
  return 'Some items already exist in the destination. Do you want to replace them?';
}

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
 * Assumes all paths share the same parent directory (uses the first path's parent).
 */
export function extractSourceDir(
  paths: string[],
): { srcDir: string; names: string[] } {
  if (paths.length === 0) return { srcDir: '/', names: [] };

  // Use the first path to determine the source directory
  const firstParts = paths[0].split('/').filter(s => s.length > 0);
  firstParts.pop();
  const srcDir = normalizePath('/' + firstParts.join('/'));

  const names: string[] = [];
  for (const p of paths) {
    const parts = p.split('/').filter(s => s.length > 0);
    const name = parts.pop();
    if (name) names.push(name);
  }
  return { srcDir, names };
}
