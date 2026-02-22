/**
 * Composable for saving and loading data using the Origin Private File System (OPFS).
 * OPFS provides a sandboxed file system that persists data in the browser.
 */

const OPFS_DIR = 'stark-os-office';

async function getOpfsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR, { create: true });
}

export async function saveToOpfs(filename: string, data: unknown): Promise<void> {
  const dir = await getOpfsDir();
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data));
  await writable.close();
}

export async function loadFromOpfs<T = unknown>(filename: string): Promise<T | null> {
  try {
    const dir = await getOpfsDir();
    const fileHandle = await dir.getFileHandle(filename);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
