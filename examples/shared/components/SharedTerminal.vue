<template>
  <div ref="terminalContainer" class="shared-terminal-wrapper"></div>
</template>

<script setup lang="ts">
/**
 * Shared Terminal Component
 *
 * Reusable xterm.js terminal with OPFS-backed filesystem.
 * Used by both the terminal system-app and the Monaco code editor.
 *
 * Props:
 *  - initialPath: The directory the terminal starts in (default: '/home')
 *
 * Inspired by https://github.com/GoogleChromeLabs/wasi-fs-access
 */

import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { commands, normalizePath, type TerminalFS } from '../utils/terminal-commands';
import { parseCommandLine, executePlan, type ShellState } from '../utils/terminal-shell';

const props = withDefaults(defineProps<{
  initialPath?: string;
}>(), {
  initialPath: '/home',
});

const terminalContainer = ref<HTMLDivElement | null>(null);

// Expose for parent to call
defineExpose({
  clear: () => { if (term) term.write('\x1B[2J\x1B[H'); },
  focus: () => { if (term) term.focus(); },
  fit: () => { if (fitAddon && terminalContainer.value) fitAddon.fit(); },
});

// State managed outside onMounted so cleanup can access it
let term: any = null;
let fitAddon: any = null;
let resizeObserver: ResizeObserver | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;

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

  // Resize terminal when window resizes (debounced to avoid loops)
  window.addEventListener('resize', handleResize);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  if (terminalContainer.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => handleResize());
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

  // Determine initial path from prop
  const startPath = normalizePath(props.initialPath || '/home', '/');

  const state: ShellState = {
    cwd: startPath,
    fs,
    env: {
      USER: 'user',
      HOME: '/home',
      HOSTNAME: location.hostname || 'stark-os',
      SHELL: '/bin/sh',
      TERM: 'xterm-256color',
      PATH: '/usr/bin:/bin',
    },
  };

  // Try to load actual user name from browser-cli credentials
  try {
    const stored = localStorage.getItem('stark-cli-credentials');
    if (stored) {
      const creds = JSON.parse(stored);
      if (creds.email) {
        state.env['USER'] = creds.email.split('@')[0];
      }
    }
  } catch { /* ignore */ }

  // Also try browser-runtime agent credentials (different localStorage key)
  if (state.env['USER'] === 'user') {
    try {
      const agentStored = localStorage.getItem('stark:agent:credentials');
      if (agentStored) {
        const agentCreds = JSON.parse(agentStored);
        if (agentCreds.email) {
          state.env['USER'] = agentCreds.email.split('@')[0];
        }
      }
    } catch { /* ignore */ }
  }

  // Ensure default directories exist
  try { await fs.mkdir('/home', true); } catch { /* ok */ }
  try { await fs.mkdir('/tmp', true); } catch { /* ok */ }
  try { await fs.mkdir('/volumes', true); } catch { /* ok */ }

  // Ensure the initial path directory exists
  if (startPath !== '/home' && startPath !== '/tmp' && startPath !== '/volumes') {
    try { await fs.mkdir(startPath, true); } catch { /* ok */ }
  }

  // Sync volume directories from orchestrator API (best-effort)
  try {
    const { createStarkAPI } = await import('@stark-o/browser-runtime');
    const starkApi = createStarkAPI();
    const volData = await starkApi.volume.list() as Array<{ name?: string }> | undefined;
    if (volData && Array.isArray(volData)) {
      for (const vol of volData) {
        if (vol.name) {
          try { await fs.mkdir(`/volumes/${vol.name}`, true); } catch { /* dir exists */ }
        }
      }
    }
  } catch { /* API not available — volumes will be shown when packs create them */ }

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
  let historyIndex = 0;

  try {
    const stored = localStorage.getItem('stark-terminal-history');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) commandHistory.push(...parsed);
    }
  } catch { /* ignore */ }
  historyIndex = commandHistory.length;

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
  let savedLine = '';

  function writePrompt() { term.write(getPrompt()); }

  function getPromptVisibleLength(): number {
    return getPrompt().replace(/\x1B\[[0-9;]*m/g, '').length;
  }

  function termRow(offset: number, cols: number): number {
    return offset > 0 ? Math.floor((offset - 1) / cols) : 0;
  }

  function clearCurrentLine() {
    const promptLen = getPromptVisibleLength();
    const cols = term.cols || 80;
    const totalOffset = promptLen + cursorPos;
    const promptEndRow = Math.floor(promptLen / cols);
    const cursorRow = termRow(totalOffset, cols);

    const upCount = cursorRow - promptEndRow;
    if (upCount > 0) term.write(`\x1B[${upCount}A`);

    const promptEndCol = promptLen % cols;
    term.write('\r');
    if (promptEndCol > 0) term.write(`\x1B[${promptEndCol}C`);

    term.write('\x1B[J');
  }

  function redrawLine(targetPos?: number) {
    clearCurrentLine();
    if (targetPos !== undefined) cursorPos = targetPos;
    if (cursorPos >= currentLine.length) {
      term.write(currentLine);
    } else {
      term.write(currentLine.slice(0, cursorPos));
      term.write('\x1B7');
      term.write(currentLine.slice(cursorPos));
      term.write('\x1B8');
    }
  }

  // ============================================================================
  // Interactive Prompt Infrastructure
  // ============================================================================

  let promptResolve: ((value: string) => void) | null = null;
  let promptBuffer = '';
  let promptHidden = false;

  function handlePromptInput(data: string) {
    let i = 0;
    while (i < data.length) {
      if (data[i] === '\x1b') {
        if (i + 1 < data.length && data[i + 1] === '[') {
          i += 2;
          while (i < data.length && data[i]! >= '0' && data[i]! <= '?') i++;
          if (i < data.length) i++;
        } else {
          i += 2;
        }
        continue;
      }

      const char = data[i]!;
      i++;

      if (char === '\r' || char === '\n') {
        term.writeln('');
        const resolve = promptResolve!;
        const buffer = promptBuffer;
        promptResolve = null;
        promptBuffer = '';
        promptHidden = false;
        resolve(buffer);
        return;
      }

      if (char === '\x7f' || char === '\b') {
        if (promptBuffer.length > 0) {
          promptBuffer = promptBuffer.slice(0, -1);
          term.write('\b \b');
        }
        continue;
      }

      if (char === '\x03') {
        term.writeln('^C');
        const resolve = promptResolve!;
        promptResolve = null;
        promptBuffer = '';
        promptHidden = false;
        resolve('');
        return;
      }

      if (char.charCodeAt(0) < 32) continue;

      promptBuffer += char;
      if (promptHidden) {
        term.write('*');
      } else {
        term.write(char);
      }
    }
  }

  function terminalPrompt(message: string): Promise<string> {
    return new Promise((resolve) => {
      term.write(message.replaceAll('\n', '\r\n'));
      promptBuffer = '';
      promptHidden = false;
      promptResolve = resolve;
    });
  }

  function terminalPromptPassword(message: string): Promise<string> {
    return new Promise((resolve) => {
      term.write(message.replaceAll('\n', '\r\n'));
      promptBuffer = '';
      promptHidden = true;
      promptResolve = resolve;
    });
  }

  state.prompt = terminalPrompt;
  state.promptPassword = terminalPromptPassword;

  // ============================================================================
  // Word Boundary Helpers
  // ============================================================================

  function findWordBoundaryLeft(line: string, pos: number): number {
    let j = pos - 1;
    while (j > 0 && line[j - 1] === ' ') j--;
    while (j > 0 && line[j - 1] !== ' ') j--;
    return Math.max(0, j);
  }

  function findWordBoundaryRight(line: string, pos: number): number {
    let j = pos;
    while (j < line.length && line[j] !== ' ') j++;
    while (j < line.length && line[j] === ' ') j++;
    return j;
  }

  async function handleCommand(line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) return;
    commandHistory.push(trimmed);
    historyIndex = commandHistory.length;
    savedLine = '';
    saveHistory();
    const plan = parseCommandLine(trimmed);
    const write = (text: string) => { term.write(text.replaceAll('\n', '\r\n')); };
    try { await executePlan(plan, state, write); } catch { /* error already written */ }
  }

  function findCommonPrefix(strings: string[]): string {
    if (strings.length === 0) return '';
    let prefix = strings[0] ?? '';
    for (let si = 1; si < strings.length; si++) {
      while (!strings[si]?.startsWith(prefix)) {
        prefix = prefix.slice(0, -1);
      }
    }
    return prefix;
  }

  async function handleTabCompletion() {
    const parts = currentLine.slice(0, cursorPos).split(' ');
    const lastPart = parts[parts.length - 1] || '';

    if (parts.length <= 1) {
      const matches = Object.keys(commands).filter(c => c.startsWith(lastPart));
      if (matches.length === 1) {
        const completion = matches[0]!.slice(lastPart.length) + ' ';
        const beforeCursor = currentLine.slice(0, cursorPos);
        if (beforeCursor.endsWith(matches[0]! + ' ')) {
          // Already completed
        } else {
          const newPos = cursorPos + completion.length;
          currentLine = currentLine.slice(0, cursorPos) + completion + currentLine.slice(cursorPos);
          redrawLine(newPos);
        }
      } else if (matches.length > 1) {
        const common = findCommonPrefix(matches);
        const additionalChars = common.slice(lastPart.length);
        if (additionalChars.length > 0) {
          const newPos = cursorPos + additionalChars.length;
          currentLine = currentLine.slice(0, cursorPos) + additionalChars + currentLine.slice(cursorPos);
          redrawLine(newPos);
        } else {
          term.writeln('');
          term.writeln(matches.join('  '));
          writePrompt();
          if (cursorPos >= currentLine.length) {
            term.write(currentLine);
          } else {
            term.write(currentLine.slice(0, cursorPos));
            term.write('\x1B7');
            term.write(currentLine.slice(cursorPos));
            term.write('\x1B8');
          }
        }
      }
    } else {
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
          const beforeCursor = currentLine.slice(0, cursorPos);
          if (beforeCursor.endsWith(match + ' ') || beforeCursor.endsWith(match + '/')) {
            // Already completed
          } else {
            const newPos = cursorPos + fullCompletion.length;
            currentLine = currentLine.slice(0, cursorPos) + fullCompletion + currentLine.slice(cursorPos);
            redrawLine(newPos);
          }
        } else if (matches.length > 1) {
          const common = findCommonPrefix(matches);
          const additionalChars = common.slice(prefix.length);
          if (additionalChars.length > 0) {
            const newPos = cursorPos + additionalChars.length;
            currentLine = currentLine.slice(0, cursorPos) + additionalChars + currentLine.slice(cursorPos);
            redrawLine(newPos);
          } else {
            term.writeln('');
            term.writeln(matches.join('  '));
            writePrompt();
            if (cursorPos >= currentLine.length) {
              term.write(currentLine);
            } else {
              term.write(currentLine.slice(0, cursorPos));
              term.write('\x1B7');
              term.write(currentLine.slice(cursorPos));
              term.write('\x1B8');
            }
          }
        }
      } catch { /* no completions available */ }
    }
  }

  // Handle terminal data input
  term.onData(async (data: string) => {
    if (promptResolve) {
      handlePromptInput(data);
      return;
    }

    if (isRunning) return;

    let i = 0;
    while (i < data.length) {
      if (data[i] === '\x1b' && i + 1 < data.length && data[i + 1] === '[') {
        let j = i + 2;
        let params = '';
        while (j < data.length && data[j]! >= '0' && data[j]! <= '?') {
          params += data[j];
          j++;
        }
        const final = j < data.length ? data[j] : '';
        j++;

        const hasCtrl = params.includes(';5');

        if (final === 'A') {
          const cols = term.cols || 80;
          const pLen = getPromptVisibleLength();
          const cursorRow = termRow(pLen + cursorPos, cols);
          const firstRow = termRow(pLen, cols);

          if (cursorRow > firstRow) {
            redrawLine(Math.max(0, cursorPos - cols));
          } else if (historyIndex > 0) {
            if (historyIndex === commandHistory.length) savedLine = currentLine;
            historyIndex--;
            currentLine = commandHistory[historyIndex] || '';
            redrawLine(currentLine.length);
          }
          i = j; continue;
        }
        if (final === 'B') {
          const cols = term.cols || 80;
          const pLen = getPromptVisibleLength();
          const cursorRow = termRow(pLen + cursorPos, cols);
          const lastRow = termRow(pLen + currentLine.length, cols);

          if (cursorRow < lastRow) {
            redrawLine(Math.min(currentLine.length, cursorPos + cols));
          } else if (historyIndex < commandHistory.length - 1) {
            historyIndex++;
            currentLine = commandHistory[historyIndex] || '';
            redrawLine(currentLine.length);
          } else if (historyIndex === commandHistory.length - 1) {
            historyIndex = commandHistory.length;
            currentLine = savedLine;
            savedLine = '';
            redrawLine(currentLine.length);
          }
          i = j; continue;
        }
        if (final === 'C') {
          if (hasCtrl) {
            const newPos = findWordBoundaryRight(currentLine, cursorPos);
            if (newPos > cursorPos) redrawLine(newPos);
          } else {
            if (cursorPos < currentLine.length) redrawLine(cursorPos + 1);
          }
          i = j; continue;
        }
        if (final === 'D') {
          if (hasCtrl) {
            const newPos = findWordBoundaryLeft(currentLine, cursorPos);
            if (newPos < cursorPos) redrawLine(newPos);
          } else {
            if (cursorPos > 0) redrawLine(cursorPos - 1);
          }
          i = j; continue;
        }
        if (final === 'H') {
          if (cursorPos > 0) redrawLine(0);
          i = j; continue;
        }
        if (final === 'F') {
          if (cursorPos < currentLine.length) redrawLine(currentLine.length);
          i = j; continue;
        }
        if (final === '~') {
          if (params === '3') {
            if (cursorPos < currentLine.length) {
              currentLine = currentLine.slice(0, cursorPos) + currentLine.slice(cursorPos + 1);
              redrawLine(cursorPos);
            }
          }
          i = j; continue;
        }
        i = j; continue;
      }

      const char = data[i]!;
      i++;

      switch (char) {
        case '\r':
        case '\n':
          term.writeln('');
          isRunning = true;
          try { await handleCommand(currentLine); }
          finally { currentLine = ''; cursorPos = 0; isRunning = false; writePrompt(); }
          break;

        case '\x7f':
          if (cursorPos > 0) {
            currentLine = currentLine.slice(0, cursorPos - 1) + currentLine.slice(cursorPos);
            redrawLine(cursorPos - 1);
          }
          break;

        case '\x03':
          if (term.hasSelection()) {
            navigator.clipboard.writeText(term.getSelection()).catch(() => {});
            term.clearSelection();
          } else {
            term.write('^C\r\n');
            currentLine = ''; cursorPos = 0;
            writePrompt();
          }
          break;

        case '\x16': {
          try {
            const text = await navigator.clipboard.readText();
            if (text) {
              const clean = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
              const lines = clean.split(/\r\n|\r|\n/);
              for (let li = 0; li < lines.length; li++) {
                const lineText = lines[li] || '';
                if (lineText) {
                  currentLine = currentLine.slice(0, cursorPos) + lineText + currentLine.slice(cursorPos);
                  redrawLine(cursorPos + lineText.length);
                }
                if (li < lines.length - 1) {
                  term.writeln('');
                  isRunning = true;
                  try { await handleCommand(currentLine); }
                  finally { currentLine = ''; cursorPos = 0; isRunning = false; writePrompt(); }
                }
              }
            }
          } catch { /* clipboard not available */ }
          break;
        }

        case '\x0c':
          term.write('\x1B[2J\x1B[H');
          writePrompt();
          if (cursorPos >= currentLine.length) {
            term.write(currentLine);
          } else {
            term.write(currentLine.slice(0, cursorPos));
            term.write('\x1B7');
            term.write(currentLine.slice(cursorPos));
            term.write('\x1B8');
          }
          break;

        case '\x01':
          if (cursorPos > 0) redrawLine(0);
          break;

        case '\x05':
          if (cursorPos < currentLine.length) redrawLine(currentLine.length);
          break;

        case '\x0b':
          if (cursorPos < currentLine.length) {
            currentLine = currentLine.slice(0, cursorPos);
            term.write('\x1B[J');
          }
          break;

        case '\x15':
          if (cursorPos > 0) {
            currentLine = currentLine.slice(cursorPos);
            redrawLine(0);
          }
          break;

        case '\x17':
          if (cursorPos > 0) {
            let j = cursorPos - 1;
            while (j > 0 && currentLine[j - 1] === ' ') j--;
            while (j > 0 && currentLine[j - 1] !== ' ') j--;
            currentLine = currentLine.slice(0, j) + currentLine.slice(cursorPos);
            redrawLine(j);
          }
          break;

        case '\t':
          await handleTabCompletion();
          break;

        default:
          if (char.charCodeAt(0) < 32) break;
          currentLine = currentLine.slice(0, cursorPos) + char + currentLine.slice(cursorPos);
          redrawLine(cursorPos + 1);
          break;
      }
    }
  });

  writePrompt();
  term.focus();
});

function handleResize() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!fitAddon || !terminalContainer.value) return;
    const rect = terminalContainer.value.getBoundingClientRect();
    if (rect.width < 50 || rect.height < 50) return;
    fitAddon.fit();
  }, 100);
}

function handleVisibilityChange() {
  if (!document.hidden) {
    setTimeout(() => handleResize(), 200);
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  if (resizeObserver) resizeObserver.disconnect();
  if (term) term.dispose();
});

// ============================================================================
// OPFS-backed TerminalFS builder
// ============================================================================

function buildOpfsTerminalFS(rootHandle: FileSystemDirectoryHandle): TerminalFS {
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
// In-memory fallback TerminalFS
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
.shared-terminal-wrapper {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
