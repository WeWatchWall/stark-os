<template>
  <div ref="terminalContainer" class="terminal-wrapper"></div>
</template>

<script setup lang="ts">
/**
 * Stark OS Terminal Page
 *
 * Full-page terminal using xterm.js with OPFS-backed filesystem.
 * Volumes stored in OPFS are visible at /volumes/<name>.
 *
 * Inspired by https://github.com/GoogleChromeLabs/wasi-fs-access
 *
 * Original work Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * CHANGES from original:
 * - Uses @xterm/xterm v5+ inside a Vue 3 / Nuxt 3 component
 * - Integrated with OPFS-backed filesystem via StorageAdapter
 * - Shell with pipe, &, && operators
 */

import { ref, onMounted, onBeforeUnmount } from 'vue';
import { commands, normalizePath, type TerminalFS } from '../utils/commands';
import { parseCommandLine, executePlan, type ShellState } from '../utils/shell';

const terminalContainer = ref<HTMLDivElement | null>(null);

// State managed outside onMounted so cleanup can access it
let term: any = null;
let fitAddon: any = null;
let resizeObserver: ResizeObserver | null = null;

onMounted(async () => {
  // Dynamically import xterm.js (client-side only)
  const { Terminal } = await import('@xterm/xterm');
  const { FitAddon } = await import('@xterm/addon-fit');
  const { WebLinksAddon } = await import('@xterm/addon-web-links');

  // Import xterm CSS
  await import('@xterm/xterm/css/xterm.css');

  term = new Terminal({
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#d4d4d4',
      selectionBackground: '#264f78',
      black: '#1e1e1e',
      red: '#f44747',
      green: '#6a9955',
      yellow: '#dcdcaa',
      blue: '#569cd6',
      magenta: '#c586c0',
      cyan: '#4ec9b0',
      white: '#d4d4d4',
      brightBlack: '#808080',
      brightRed: '#f44747',
      brightGreen: '#6a9955',
      brightYellow: '#dcdcaa',
      brightBlue: '#569cd6',
      brightMagenta: '#c586c0',
      brightCyan: '#4ec9b0',
      brightWhite: '#ffffff',
    },
    fontFamily: '"Cascadia Code", "Fira Code", Menlo, Monaco, "Courier New", monospace',
    fontSize: 14,
    cursorBlink: true,
    cursorStyle: 'block',
    allowProposedApi: true,
  });

  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());

  if (terminalContainer.value) {
    term.open(terminalContainer.value);
    fitAddon.fit();
  }

  // Resize terminal when window resizes
  window.addEventListener('resize', handleResize);
  if (terminalContainer.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => fitAddon.fit());
    resizeObserver.observe(terminalContainer.value);
  }

  // ============================================================================
  // OPFS Filesystem Setup
  // ============================================================================

  let fs: TerminalFS;

  // Try to use OPFS StorageAdapter, fall back to in-memory stub
  try {
    const opfsRoot = await navigator.storage.getDirectory();
    const starkRoot = await opfsRoot.getDirectoryHandle('stark-orchestrator', { create: true });

    // Build an OPFS-backed TerminalFS that operates on the stark-orchestrator directory
    fs = buildOpfsTerminalFS(starkRoot);
  } catch {
    // Fallback: simple in-memory FS for environments without OPFS
    fs = buildMemoryTerminalFS();
  }

  const state: ShellState = {
    cwd: '/home',
    fs,
    env: {
      USER: 'user',
      HOME: '/home',
      HOSTNAME: 'stark-os',
      SHELL: '/bin/sh',
      TERM: 'xterm-256color',
      PATH: '/usr/bin:/bin',
    },
  };

  // Ensure default directories exist
  try { await fs.mkdir('/home', true); } catch { /* ok */ }
  try { await fs.mkdir('/tmp', true); } catch { /* ok */ }
  try { await fs.mkdir('/volumes', true); } catch { /* ok */ }

  // Write welcome file if it doesn't exist
  const readmeExists = await fs.exists('/home/README.md');
  if (!readmeExists) {
    await fs.writeFile('/home/README.md',
      '# Welcome to Stark OS Terminal\n\n' +
      'Filesystem is backed by OPFS. Volumes at /volumes/<name>.\n' +
      'Type `help` for commands, `stark help` for orchestrator.\n'
    );
  }

  // ============================================================================
  // Command History
  // ============================================================================

  const commandHistory: string[] = [];
  let historyIndex = -1;

  try {
    const stored = localStorage.getItem('stark-terminal-history');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) commandHistory.push(...parsed);
    }
  } catch { /* ignore */ }

  function saveHistory() {
    try { localStorage.setItem('stark-terminal-history', JSON.stringify(commandHistory.slice(-100))); } catch { /* ignore */ }
  }

  // ============================================================================
  // Prompt & Input
  // ============================================================================

  const ANSI_GRAY = '\x1B[38;5;245m';
  const ANSI_GREEN = '\x1B[32m';
  const ANSI_BLUE = '\x1B[34;1m';
  const ANSI_RESET = '\x1B[0m';

  function getPrompt(): string {
    const cwd = state.cwd === state.env['HOME'] ? '~' : state.cwd;
    return `${ANSI_GREEN}${state.env['USER']}@${state.env['HOSTNAME']}${ANSI_RESET}:${ANSI_BLUE}${cwd}${ANSI_RESET}$ `;
  }

  term.writeln(`${ANSI_GRAY}# Welcome to Stark OS Terminal (OPFS-backed)${ANSI_RESET}`);
  term.writeln(`${ANSI_GRAY}# Type 'help' for available commands${ANSI_RESET}`);
  term.writeln('');

  let currentLine = '';
  let cursorPos = 0;
  let isRunning = false;

  function writePrompt() { term.write(getPrompt()); }

  function clearCurrentLine() {
    if (cursorPos > 0) term.write(`\x1B[${cursorPos}D`);
    term.write('\x1B[K');
  }

  function redrawLine() {
    clearCurrentLine();
    term.write(currentLine);
    if (cursorPos < currentLine.length) term.write(`\x1B[${currentLine.length - cursorPos}D`);
  }

  async function handleCommand(line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) return;
    commandHistory.push(trimmed);
    historyIndex = commandHistory.length;
    saveHistory();
    const plan = parseCommandLine(trimmed);
    const write = (text: string) => { term.write(text.replaceAll('\n', '\r\n')); };
    try { await executePlan(plan, state, write); } catch { /* error already written */ }
  }

  async function handleTabCompletion() {
    const parts = currentLine.slice(0, cursorPos).split(' ');
    const lastPart = parts[parts.length - 1] || '';

    if (parts.length <= 1) {
      const matches = Object.keys(commands).filter(c => c.startsWith(lastPart));
      if (matches.length === 1) {
        const completion = matches[0]!.slice(lastPart.length) + ' ';
        currentLine = currentLine.slice(0, cursorPos) + completion + currentLine.slice(cursorPos);
        cursorPos += completion.length;
        redrawLine();
      } else if (matches.length > 1) {
        term.writeln('');
        term.writeln(matches.join('  '));
        writePrompt();
        term.write(currentLine);
        if (cursorPos < currentLine.length) term.write(`\x1B[${currentLine.length - cursorPos}D`);
      }
    } else {
      // Complete file/directory names from OPFS
      const pathParts = lastPart.split('/');
      const prefix = pathParts.pop() || '';
      const dirPath = pathParts.length > 0
        ? normalizePath(pathParts.join('/'), state.cwd)
        : state.cwd;

      try {
        const entries = await fs.readdir(dirPath);
        const matches = entries.filter(e => e.startsWith(prefix));
        if (matches.length === 1) {
          const match = matches[0]!;
          const completion = match.slice(prefix.length);
          const fullPath = normalizePath(
            (pathParts.length > 0 ? pathParts.join('/') + '/' : '') + match,
            state.cwd
          );
          const isDir = await fs.isDirectory(fullPath);
          const suffix = isDir ? '/' : ' ';
          const fullCompletion = completion + suffix;
          currentLine = currentLine.slice(0, cursorPos) + fullCompletion + currentLine.slice(cursorPos);
          cursorPos += fullCompletion.length;
          redrawLine();
        } else if (matches.length > 1) {
          term.writeln('');
          term.writeln(matches.join('  '));
          writePrompt();
          term.write(currentLine);
          if (cursorPos < currentLine.length) term.write(`\x1B[${currentLine.length - cursorPos}D`);
        }
      } catch { /* no completions available */ }
    }
  }

  // Handle terminal data input
  term.onData(async (data: string) => {
    if (isRunning) return;

    for (const char of data) {
      switch (char) {
        case '\r':
          term.writeln('');
          isRunning = true;
          try { await handleCommand(currentLine); }
          finally { currentLine = ''; cursorPos = 0; isRunning = false; writePrompt(); }
          break;

        case '\x7f':
          if (cursorPos > 0) {
            currentLine = currentLine.slice(0, cursorPos - 1) + currentLine.slice(cursorPos);
            cursorPos--;
            term.write('\b');
            const rest = currentLine.slice(cursorPos);
            term.write(rest + ' ');
            if (rest.length + 1 > 0) term.write(`\x1B[${rest.length + 1}D`);
          }
          break;

        case '\x1b[A':
          if (historyIndex > 0) {
            historyIndex--;
            clearCurrentLine();
            currentLine = commandHistory[historyIndex] || '';
            cursorPos = currentLine.length;
            term.write(currentLine);
          }
          break;

        case '\x1b[B':
          if (historyIndex < commandHistory.length - 1) {
            historyIndex++;
            clearCurrentLine();
            currentLine = commandHistory[historyIndex] || '';
            cursorPos = currentLine.length;
            term.write(currentLine);
          } else if (historyIndex === commandHistory.length - 1) {
            historyIndex = commandHistory.length;
            clearCurrentLine();
            currentLine = '';
            cursorPos = 0;
          }
          break;

        case '\x1b[C':
          if (cursorPos < currentLine.length) { cursorPos++; term.write('\x1b[C'); }
          break;

        case '\x1b[D':
          if (cursorPos > 0) { cursorPos--; term.write('\x1b[D'); }
          break;

        case '\x03':
          term.write('^C\r\n');
          currentLine = ''; cursorPos = 0;
          writePrompt();
          break;

        case '\x0c':
          term.write('\x1B[2J\x1B[H');
          writePrompt();
          term.write(currentLine);
          break;

        case '\x01':
          if (cursorPos > 0) { term.write(`\x1B[${cursorPos}D`); cursorPos = 0; }
          break;

        case '\x05':
          if (cursorPos < currentLine.length) { term.write(`\x1B[${currentLine.length - cursorPos}C`); cursorPos = currentLine.length; }
          break;

        case '\t':
          await handleTabCompletion();
          break;

        default:
          if (char.charCodeAt(0) < 32) break;
          currentLine = currentLine.slice(0, cursorPos) + char + currentLine.slice(cursorPos);
          cursorPos++;
          const rest = currentLine.slice(cursorPos - 1);
          term.write(rest);
          if (rest.length > 1) term.write(`\x1B[${rest.length - 1}D`);
          break;
      }
    }
  });

  writePrompt();
  term.focus();
});

function handleResize() { if (fitAddon) fitAddon.fit(); }

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  if (resizeObserver) resizeObserver.disconnect();
  if (term) term.dispose();
});

// ============================================================================
// OPFS-backed TerminalFS builder
// ============================================================================

function buildOpfsTerminalFS(rootHandle: FileSystemDirectoryHandle): TerminalFS {
  function getPathParts(resolvedPath: string): string[] {
    return resolvedPath.split('/').filter(p => p.length > 0);
  }

  async function getDirectoryHandle(resolvedPath: string, create = false): Promise<FileSystemDirectoryHandle> {
    const parts = getPathParts(resolvedPath);
    let handle = rootHandle;
    for (const part of parts) {
      handle = await handle.getDirectoryHandle(part, { create });
    }
    return handle;
  }

  async function getFileHandle(resolvedPath: string, create = false): Promise<FileSystemFileHandle> {
    const parts = getPathParts(resolvedPath);
    if (parts.length === 0) throw new Error('Cannot open root as a file');
    const fileName = parts.pop()!;
    let dirHandle = rootHandle;
    for (const part of parts) {
      dirHandle = await dirHandle.getDirectoryHandle(part, { create });
    }
    return dirHandle.getFileHandle(fileName, { create });
  }

  async function getParentAndName(resolvedPath: string): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
    const parts = getPathParts(resolvedPath);
    if (parts.length === 0) throw new Error('Cannot operate on root path');
    const name = parts.pop()!;
    let parent = rootHandle;
    for (const part of parts) {
      parent = await parent.getDirectoryHandle(part);
    }
    return { parent, name };
  }

  const fs: TerminalFS = {
    async readFile(path: string): Promise<string> {
      const fh = await getFileHandle(path);
      const file = await fh.getFile();
      return file.text();
    },

    async writeFile(path: string, content: string | Uint8Array): Promise<void> {
      const fh = await getFileHandle(path, true);
      const writable = await fh.createWritable();
      if (typeof content === 'string') {
        await writable.write(new TextEncoder().encode(content));
      } else {
        await writable.write(content);
      }
      await writable.close();
    },

    async appendFile(path: string, content: string | Uint8Array): Promise<void> {
      let existingBytes: Uint8Array;
      try {
        const fh = await getFileHandle(path);
        const file = await fh.getFile();
        existingBytes = new Uint8Array(await file.arrayBuffer());
      } catch {
        existingBytes = new Uint8Array(0);
      }
      const newBytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
      const combined = new Uint8Array(existingBytes.length + newBytes.length);
      combined.set(existingBytes);
      combined.set(newBytes, existingBytes.length);
      const fh = await getFileHandle(path, true);
      const writable = await fh.createWritable();
      await writable.write(combined);
      await writable.close();
    },

    async mkdir(path: string, recursive = true): Promise<void> {
      if (recursive) {
        await getDirectoryHandle(path, true);
      } else {
        const { parent, name } = await getParentAndName(path);
        await parent.getDirectoryHandle(name, { create: true });
      }
    },

    async readdir(path: string): Promise<string[]> {
      const dirHandle = await getDirectoryHandle(path);
      const entries: string[] = [];
      for await (const key of dirHandle.keys()) entries.push(key);
      return entries;
    },

    async readdirWithTypes(path: string) {
      const dirHandle = await getDirectoryHandle(path);
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

    async rmdir(path: string, recursive = false): Promise<void> {
      const { parent, name } = await getParentAndName(path);
      await parent.removeEntry(name, { recursive });
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

    async stat(path: string) {
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

    async unlink(path: string): Promise<void> {
      const { parent, name } = await getParentAndName(path);
      await parent.removeEntry(name);
    },

    async rename(oldPath: string, newPath: string): Promise<void> {
      const content = await fs.readFile(oldPath);
      await fs.writeFile(newPath, content);
      await fs.unlink(oldPath);
    },

    async copyFile(src: string, dest: string): Promise<void> {
      const content = await fs.readFile(src);
      await fs.writeFile(dest, content);
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

  return fs;
}

// ============================================================================
// In-memory fallback TerminalFS (for environments without OPFS)
// ============================================================================

interface MemNode { type: 'file' | 'dir'; content?: string; children?: Map<string, MemNode>; mtime: Date }

function buildMemoryTerminalFS(): TerminalFS {
  const root: MemNode = { type: 'dir', children: new Map(), mtime: new Date() };

  function resolve(path: string): { parent: MemNode; name: string } | null {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    const name = parts.pop()!;
    let cur = root;
    for (const p of parts) {
      const child = cur.children?.get(p);
      if (!child || child.type !== 'dir') return null;
      cur = child;
    }
    return { parent: cur, name };
  }

  function get(path: string): MemNode | null {
    if (path === '/') return root;
    const info = resolve(path);
    if (!info) return null;
    return info.parent.children?.get(info.name) ?? null;
  }

  const fs: TerminalFS = {
    async readFile(path) {
      const node = get(path);
      if (!node || node.type !== 'file') throw new Error('Not found');
      return node.content ?? '';
    },
    async writeFile(path, content) {
      const info = resolve(path);
      if (!info) throw new Error('Invalid path');
      if (!info.parent.children) info.parent.children = new Map();
      info.parent.children.set(info.name, {
        type: 'file',
        content: typeof content === 'string' ? content : new TextDecoder().decode(content),
        mtime: new Date(),
      });
    },
    async appendFile(path, content) {
      const existing = await fs.readFile(path).catch(() => '');
      const appendStr = typeof content === 'string' ? content : new TextDecoder().decode(content);
      await fs.writeFile(path, existing + appendStr);
    },
    async mkdir(path, recursive = true) {
      const parts = path.split('/').filter(Boolean);
      let cur = root;
      for (const part of parts) {
        if (!cur.children) cur.children = new Map();
        let child = cur.children.get(part);
        if (!child) {
          if (!recursive && part !== parts[parts.length - 1]) throw new Error('Parent not found');
          child = { type: 'dir', children: new Map(), mtime: new Date() };
          cur.children.set(part, child);
        }
        if (child.type !== 'dir') throw new Error('Not a directory');
        cur = child;
      }
    },
    async readdir(path) {
      const node = get(path);
      if (!node || node.type !== 'dir') throw new Error('Not a directory');
      return Array.from(node.children?.keys() ?? []);
    },
    async readdirWithTypes(path) {
      const node = get(path);
      if (!node || node.type !== 'dir') throw new Error('Not a directory');
      return Array.from(node.children?.entries() ?? []).map(([name, child]) => ({
        name,
        isFile: () => child.type === 'file',
        isDirectory: () => child.type === 'dir',
      }));
    },
    async rmdir(path, recursive = false) {
      const info = resolve(path);
      if (!info) throw new Error('Not found');
      const node = info.parent.children?.get(info.name);
      if (!node || node.type !== 'dir') throw new Error('Not a directory');
      if (!recursive && node.children && node.children.size > 0) throw new Error('Directory not empty');
      info.parent.children?.delete(info.name);
    },
    async exists(path) { return get(path) !== null; },
    async stat(path) {
      const node = get(path);
      if (!node) throw new Error('Not found');
      return { size: node.content?.length ?? 0, mtime: node.mtime };
    },
    async unlink(path) {
      const info = resolve(path);
      if (!info) throw new Error('Not found');
      info.parent.children?.delete(info.name);
    },
    async rename(oldPath, newPath) {
      const content = await fs.readFile(oldPath);
      await fs.writeFile(newPath, content);
      await fs.unlink(oldPath);
    },
    async copyFile(src, dest) {
      const content = await fs.readFile(src);
      await fs.writeFile(dest, content);
    },
    async isFile(path) { const n = get(path); return n?.type === 'file'; },
    async isDirectory(path) { if (path === '/') return true; const n = get(path); return n?.type === 'dir'; },
  };

  return fs;
}
</script>

<style scoped>
.terminal-wrapper {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
</style>
