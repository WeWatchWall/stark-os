/**
 * Composable for saving and loading internal settings files using OPFS.
 * Uses the shared stark-orchestrator directory for consistency with other apps.
 * Note: This is only used for internal settings (extensions state).
 * Files are stored under /home/.stark-code/ in the OPFS filesystem.
 */

async function getOpfsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const starkRoot = await root.getDirectoryHandle('stark-orchestrator', { create: true });
  const homeDir = await starkRoot.getDirectoryHandle('home', { create: true });
  return homeDir.getDirectoryHandle('.stark-code', { create: true });
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
