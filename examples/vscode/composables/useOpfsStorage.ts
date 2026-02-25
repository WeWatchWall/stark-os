/**
 * Composable for saving and loading files using the Origin Private File System (OPFS).
 * OPFS provides a sandboxed file system that persists data in the browser.
 * Enhanced for multi-file operations to support a VS Code-like file explorer.
 */

const OPFS_DIR = 'stark-os-vscode';

async function getOpfsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR, { create: true });
}

export async function listFiles(): Promise<string[]> {
  const dir = await getOpfsDir();
  const files: string[] = [];
  for await (const [name, handle] of dir) {
    if (handle.kind === 'file') {
      files.push(name);
    }
  }
  return files.sort();
}

export async function saveFile(filename: string, content: string): Promise<void> {
  const dir = await getOpfsDir();
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function loadFile(filename: string): Promise<string | null> {
  try {
    const dir = await getOpfsDir();
    const fileHandle = await dir.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

export async function deleteFile(filename: string): Promise<boolean> {
  try {
    const dir = await getOpfsDir();
    await dir.removeEntry(filename);
    return true;
  } catch {
    return false;
  }
}

export async function fileExists(filename: string): Promise<boolean> {
  try {
    const dir = await getOpfsDir();
    await dir.getFileHandle(filename);
    return true;
  } catch {
    return false;
  }
}
