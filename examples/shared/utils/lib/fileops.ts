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
