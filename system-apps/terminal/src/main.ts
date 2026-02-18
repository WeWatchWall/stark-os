/**
 * Stark OS Terminal — Main Entry Point
 *
 * Full-page terminal using xterm.js with automatic resize.
 * Implements unix commands and Stark CLI integration.
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
 * - Uses @xterm/xterm v5+ instead of the old xterm package
 * - Added Stark CLI integration with browser-cli
 * - Reimplemented shell with pipe, &, && operators
 * - Virtual filesystem instead of File System Access API
 * @module @stark-o/terminal/main
 */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

import { VirtualFS, commands } from './commands.js';
import { parseCommandLine, executePlan, type ShellState } from './shell.js';

// ============================================================================
// Terminal Setup
// ============================================================================

const term = new Terminal({
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

const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.loadAddon(new WebLinksAddon());

const termEl = document.getElementById('terminal');
if (termEl) {
  term.open(termEl);
  fitAddon.fit();
}

// Resize terminal when window resizes
window.addEventListener('resize', () => {
  fitAddon.fit();
});

// Also use ResizeObserver for more precise sizing
if (termEl && typeof ResizeObserver !== 'undefined') {
  const resizeObserver = new ResizeObserver(() => {
    fitAddon.fit();
  });
  resizeObserver.observe(termEl);
}

// ============================================================================
// Shell State
// ============================================================================

const state: ShellState = {
  cwd: '/home',
  fs: new VirtualFS(),
  env: {
    USER: 'user',
    HOME: '/home',
    HOSTNAME: 'stark-os',
    SHELL: '/bin/sh',
    TERM: 'xterm-256color',
    PATH: '/usr/bin:/bin',
  },
};

// Create some default files
state.fs.writeFile('/home/README.md', `# Welcome to Stark OS Terminal

This is an in-browser terminal for Stark OS.

## Available Commands

Type \`help\` to see all available commands.
Type \`stark help\` to see Stark orchestrator commands.

## Operators

- \`|\` — Pipe output of one command to another
- \`&&\` — Run next command only if previous succeeds
- \`&\` — Run command in background
- \`>\` — Redirect output to file
- \`>>\` — Append output to file
`);

// ============================================================================
// Command History
// ============================================================================

const commandHistory: string[] = [];
let historyIndex = -1;

function saveHistory() {
  try {
    localStorage.setItem('stark-terminal-history', JSON.stringify(commandHistory.slice(-100)));
  } catch {
    // Ignore storage errors
  }
}

function loadHistory() {
  try {
    const stored = localStorage.getItem('stark-terminal-history');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        commandHistory.push(...parsed);
      }
    }
  } catch {
    // Ignore storage errors
  }
}

loadHistory();

// ============================================================================
// Input Handling
// ============================================================================

const ANSI_GRAY = '\x1B[38;5;245m';
const ANSI_GREEN = '\x1B[32m';
const ANSI_BLUE = '\x1B[34;1m';
const ANSI_RESET = '\x1B[0m';

function getPrompt(): string {
  const cwd = state.cwd === state.env['HOME'] ? '~' : state.cwd;
  return `${ANSI_GREEN}${state.env['USER']}@${state.env['HOSTNAME']}${ANSI_RESET}:${ANSI_BLUE}${cwd}${ANSI_RESET}$ `;
}

// Write welcome message
term.writeln(`${ANSI_GRAY}# Welcome to Stark OS Terminal${ANSI_RESET}`);
term.writeln(`${ANSI_GRAY}# Type 'help' for available commands, 'stark help' for orchestrator commands${ANSI_RESET}`);
term.writeln('');

let currentLine = '';
let cursorPos = 0;
let isRunning = false;

function writePrompt() {
  term.write(getPrompt());
}

function clearCurrentLine() {
  // Move cursor to start of line, clear to end
  if (cursorPos > 0) {
    term.write(`\x1B[${cursorPos}D`);
  }
  term.write('\x1B[K');
}

function redrawLine() {
  clearCurrentLine();
  term.write(currentLine);
  // Move cursor back to correct position
  if (cursorPos < currentLine.length) {
    term.write(`\x1B[${currentLine.length - cursorPos}D`);
  }
}

async function handleCommand(line: string): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;

  commandHistory.push(trimmed);
  historyIndex = commandHistory.length;
  saveHistory();

  const plan = parseCommandLine(trimmed);

  const write = (text: string) => {
    term.write(text.replaceAll('\n', '\r\n'));
  };

  try {
    await executePlan(plan, state, write);
  } catch {
    // Error already written to terminal by executePlan
  }
}

// Handle terminal data input
term.onData(async (data) => {
  if (isRunning) return;

  for (const char of data) {
    switch (char) {
      case '\r': // Enter
        term.writeln('');
        isRunning = true;
        try {
          await handleCommand(currentLine);
        } finally {
          currentLine = '';
          cursorPos = 0;
          isRunning = false;
          writePrompt();
        }
        break;

      case '\x7f': // Backspace
        if (cursorPos > 0) {
          currentLine = currentLine.slice(0, cursorPos - 1) + currentLine.slice(cursorPos);
          cursorPos--;
          // Move back, redraw rest
          term.write('\b');
          const rest = currentLine.slice(cursorPos);
          term.write(rest + ' ');
          if (rest.length + 1 > 0) {
            term.write(`\x1B[${rest.length + 1}D`);
          }
        }
        break;

      case '\x1b[A': // Up arrow (history)
        if (historyIndex > 0) {
          historyIndex--;
          clearCurrentLine();
          currentLine = commandHistory[historyIndex] || '';
          cursorPos = currentLine.length;
          term.write(currentLine);
        }
        break;

      case '\x1b[B': // Down arrow (history)
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

      case '\x1b[C': // Right arrow
        if (cursorPos < currentLine.length) {
          cursorPos++;
          term.write('\x1b[C');
        }
        break;

      case '\x1b[D': // Left arrow
        if (cursorPos > 0) {
          cursorPos--;
          term.write('\x1b[D');
        }
        break;

      case '\x03': // Ctrl+C
        term.write('^C\r\n');
        currentLine = '';
        cursorPos = 0;
        writePrompt();
        break;

      case '\x0c': // Ctrl+L (clear)
        term.write('\x1B[2J\x1B[H');
        writePrompt();
        term.write(currentLine);
        break;

      case '\x01': // Ctrl+A (beginning of line)
        if (cursorPos > 0) {
          term.write(`\x1B[${cursorPos}D`);
          cursorPos = 0;
        }
        break;

      case '\x05': // Ctrl+E (end of line)
        if (cursorPos < currentLine.length) {
          term.write(`\x1B[${currentLine.length - cursorPos}C`);
          cursorPos = currentLine.length;
        }
        break;

      case '\t': // Tab completion
        handleTabCompletion();
        break;

      default:
        // Ignore other control characters
        if (char.charCodeAt(0) < 32) break;

        // Insert character at cursor position
        currentLine = currentLine.slice(0, cursorPos) + char + currentLine.slice(cursorPos);
        cursorPos++;

        // Write the character and rest of line
        const rest = currentLine.slice(cursorPos - 1);
        term.write(rest);
        if (rest.length > 1) {
          term.write(`\x1B[${rest.length - 1}D`);
        }
        break;
    }
  }
});

function handleTabCompletion() {
  const parts = currentLine.slice(0, cursorPos).split(' ');
  const lastPart = parts[parts.length - 1] || '';

  if (parts.length <= 1) {
    // Complete command names
    const matches = Object.keys(commands).filter(c => c.startsWith(lastPart));
    if (matches.length === 1) {
      const completion = matches[0]!.slice(lastPart.length) + ' ';
      currentLine = currentLine.slice(0, cursorPos) + completion + currentLine.slice(cursorPos);
      cursorPos += completion.length;
      redrawLine();
    } else if (matches.length > 1) {
      // Show all matches
      term.writeln('');
      term.writeln(matches.join('  '));
      writePrompt();
      term.write(currentLine);
      if (cursorPos < currentLine.length) {
        term.write(`\x1B[${currentLine.length - cursorPos}D`);
      }
    }
  } else {
    // Complete file/directory names
    const pathParts = lastPart.split('/');
    const prefix = pathParts.pop() || '';
    const dirPath = pathParts.length > 0
      ? state.fs.normalizePath(pathParts.join('/'), state.cwd)
      : state.cwd;

    const entries = state.fs.listDir(dirPath);
    if (entries) {
      const matches = entries.filter(e => e.startsWith(prefix));
      if (matches.length === 1) {
        const match = matches[0]!;
        const completion = match.slice(prefix.length);
        const node = state.fs.getNode(state.fs.normalizePath(
          (pathParts.length > 0 ? pathParts.join('/') + '/' : '') + match,
          state.cwd
        ));
        const suffix = node?.type === 'dir' ? '/' : ' ';
        const fullCompletion = completion + suffix;
        currentLine = currentLine.slice(0, cursorPos) + fullCompletion + currentLine.slice(cursorPos);
        cursorPos += fullCompletion.length;
        redrawLine();
      } else if (matches.length > 1) {
        term.writeln('');
        term.writeln(matches.join('  '));
        writePrompt();
        term.write(currentLine);
        if (cursorPos < currentLine.length) {
          term.write(`\x1B[${currentLine.length - cursorPos}D`);
        }
      }
    }
  }
}

// Initial prompt
writePrompt();

// Focus terminal
term.focus();
