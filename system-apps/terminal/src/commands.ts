/**
 * Unix Commands for Stark OS Terminal
 *
 * Implements common unix commands for the in-browser terminal.
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
 * - Reimplemented as pure JavaScript/TypeScript commands instead of WASI bindings
 * - Adapted for Stark OS virtual filesystem (in-memory)
 * - Added Stark CLI integration for orchestrator commands
 * - Added pipe, &, and && operator support
 * @module @stark-o/terminal/commands
 */

/**
 * In-memory filesystem for the terminal
 */
export interface VirtualFile {
  type: 'file';
  content: string;
  createdAt: Date;
  modifiedAt: Date;
}

export interface VirtualDir {
  type: 'dir';
  children: Map<string, VirtualFile | VirtualDir>;
  createdAt: Date;
}

export type VirtualNode = VirtualFile | VirtualDir;

/**
 * Virtual filesystem
 */
export class VirtualFS {
  root: VirtualDir;

  constructor() {
    const now = new Date();
    this.root = {
      type: 'dir',
      children: new Map(),
      createdAt: now,
    };
    // Create default directories
    this.mkdir('/home');
    this.mkdir('/tmp');
  }

  /**
   * Normalize a path (resolve . and ..)
   */
  normalizePath(path: string, cwd: string): string {
    if (!path.startsWith('/')) {
      path = cwd + '/' + path;
    }
    const parts = path.split('/').filter(Boolean);
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === '.') continue;
      if (part === '..') {
        resolved.pop();
        continue;
      }
      resolved.push(part);
    }
    return '/' + resolved.join('/');
  }

  /**
   * Get a node at a path
   */
  getNode(path: string): VirtualNode | null {
    if (path === '/') return this.root;
    const parts = path.split('/').filter(Boolean);
    let current: VirtualNode = this.root;
    for (const part of parts) {
      if (current.type !== 'dir') return null;
      const child = current.children.get(part);
      if (!child) return null;
      current = child;
    }
    return current;
  }

  /**
   * Get parent directory and name from path
   */
  private getParentAndName(path: string): { parent: VirtualDir; name: string } | null {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    const name = parts.pop()!;
    const parentPath = '/' + parts.join('/');
    const parent = this.getNode(parentPath);
    if (!parent || parent.type !== 'dir') return null;
    return { parent, name };
  }

  /**
   * Create a directory
   */
  mkdir(path: string): boolean {
    const parts = path.split('/').filter(Boolean);
    let current: VirtualDir = this.root;
    for (const part of parts) {
      let child = current.children.get(part);
      if (!child) {
        child = { type: 'dir', children: new Map(), createdAt: new Date() };
        current.children.set(part, child);
      } else if (child.type !== 'dir') {
        return false;
      }
      current = child;
    }
    return true;
  }

  /**
   * Write a file
   */
  writeFile(path: string, content: string): boolean {
    const info = this.getParentAndName(path);
    if (!info) return false;
    const now = new Date();
    const existing = info.parent.children.get(info.name);
    if (existing && existing.type === 'dir') return false;
    info.parent.children.set(info.name, {
      type: 'file',
      content,
      createdAt: existing?.type === 'file' ? existing.createdAt : now,
      modifiedAt: now,
    });
    return true;
  }

  /**
   * Read a file
   */
  readFile(path: string): string | null {
    const node = this.getNode(path);
    if (!node || node.type !== 'file') return null;
    return node.content;
  }

  /**
   * Remove a file or directory
   */
  remove(path: string, recursive = false): boolean {
    const info = this.getParentAndName(path);
    if (!info) return false;
    const node = info.parent.children.get(info.name);
    if (!node) return false;
    if (node.type === 'dir' && node.children.size > 0 && !recursive) return false;
    info.parent.children.delete(info.name);
    return true;
  }

  /**
   * List directory contents
   */
  listDir(path: string): string[] | null {
    const node = this.getNode(path);
    if (!node || node.type !== 'dir') return null;
    return Array.from(node.children.keys());
  }

  /**
   * Check if path exists
   */
  exists(path: string): boolean {
    return this.getNode(path) !== null;
  }
}

/**
 * Command context passed to each command handler
 */
export interface CommandContext {
  /** Arguments (not including the command name) */
  args: string[];
  /** Current working directory */
  cwd: string;
  /** Write to stdout */
  write: (text: string) => void;
  /** Write to stderr */
  writeError: (text: string) => void;
  /** Read from stdin (for piped input) */
  stdin?: string;
  /** Virtual filesystem */
  fs: VirtualFS;
  /** Environment variables */
  env: Record<string, string>;
  /** Set cwd (for cd) */
  setCwd: (path: string) => void;
}

/**
 * Command handler function
 */
export type CommandHandler = (ctx: CommandContext) => Promise<string>;

/**
 * Registry of all available commands
 */
export const commands: Record<string, CommandHandler> = {};

// ============================================================================
// File System Commands
// ============================================================================

commands['ls'] = async (ctx) => {
  const target = ctx.args[0] || ctx.cwd;
  const path = ctx.fs.normalizePath(target, ctx.cwd);
  const showAll = ctx.args.includes('-a') || ctx.args.includes('-la') || ctx.args.includes('-al');
  const longFormat = ctx.args.includes('-l') || ctx.args.includes('-la') || ctx.args.includes('-al');

  // Get the actual path (filter out flags)
  const pathArgs = ctx.args.filter(a => !a.startsWith('-'));
  const resolvedPath = ctx.fs.normalizePath(pathArgs[0] || ctx.cwd, ctx.cwd);

  const node = ctx.fs.getNode(resolvedPath);
  if (!node) {
    return `ls: cannot access '${target}': No such file or directory\n`;
  }

  if (node.type === 'file') {
    return `${pathArgs[0] || target}\n`;
  }

  const entries = Array.from(node.children.entries());
  const filtered = showAll
    ? ['.', '..', ...entries.map(([name]) => name)]
    : entries.map(([name]) => name);

  if (longFormat) {
    const lines: string[] = [];
    for (const name of filtered) {
      if (name === '.' || name === '..') {
        lines.push(`drwxr-xr-x  -  ${name}`);
        continue;
      }
      const [, child] = entries.find(([n]) => n === name)!;
      const typeChar = child.type === 'dir' ? 'd' : '-';
      const perms = child.type === 'dir' ? 'rwxr-xr-x' : 'rw-r--r--';
      const size = child.type === 'file' ? child.content.length.toString().padStart(6) : '     -';
      const date = child.type === 'file'
        ? child.modifiedAt.toLocaleDateString()
        : child.createdAt.toLocaleDateString();
      lines.push(`${typeChar}${perms}  ${size}  ${date}  ${name}`);
    }
    return lines.join('\n') + '\n';
  }

  return filtered.join('  ') + '\n';
};

commands['cd'] = async (ctx) => {
  const target = ctx.args[0];
  if (!target) {
    ctx.setCwd('/home');
    return '';
  }

  const path = ctx.fs.normalizePath(target, ctx.cwd);
  const node = ctx.fs.getNode(path);

  if (!node) {
    return `cd: ${target}: No such file or directory\n`;
  }
  if (node.type !== 'dir') {
    return `cd: ${target}: Not a directory\n`;
  }

  ctx.setCwd(path);
  return '';
};

commands['pwd'] = async (ctx) => {
  return ctx.cwd + '\n';
};

commands['mkdir'] = async (ctx) => {
  if (ctx.args.length === 0) {
    return 'mkdir: missing operand\n';
  }

  const results: string[] = [];
  const createParents = ctx.args.includes('-p');
  const paths = ctx.args.filter(a => !a.startsWith('-'));

  for (const target of paths) {
    const path = ctx.fs.normalizePath(target, ctx.cwd);
    if (createParents) {
      ctx.fs.mkdir(path);
    } else {
      // Check parent exists
      const parts = path.split('/').filter(Boolean);
      const parentPath = '/' + parts.slice(0, -1).join('/');
      if (!ctx.fs.exists(parentPath)) {
        results.push(`mkdir: cannot create directory '${target}': No such file or directory\n`);
        continue;
      }
      if (ctx.fs.exists(path)) {
        results.push(`mkdir: cannot create directory '${target}': File exists\n`);
        continue;
      }
      ctx.fs.mkdir(path);
    }
  }

  return results.join('');
};

commands['touch'] = async (ctx) => {
  if (ctx.args.length === 0) {
    return 'touch: missing file operand\n';
  }

  for (const target of ctx.args) {
    const path = ctx.fs.normalizePath(target, ctx.cwd);
    if (!ctx.fs.exists(path)) {
      ctx.fs.writeFile(path, '');
    }
  }

  return '';
};

commands['cat'] = async (ctx) => {
  if (ctx.args.length === 0 && ctx.stdin !== undefined) {
    return ctx.stdin;
  }

  if (ctx.args.length === 0) {
    return 'cat: missing file operand\n';
  }

  const results: string[] = [];
  for (const target of ctx.args) {
    const path = ctx.fs.normalizePath(target, ctx.cwd);
    const content = ctx.fs.readFile(path);
    if (content === null) {
      results.push(`cat: ${target}: No such file or directory\n`);
    } else {
      results.push(content);
    }
  }

  return results.join('');
};

commands['echo'] = async (ctx) => {
  const addNewline = !ctx.args.includes('-n');
  const text = ctx.args.filter(a => a !== '-n').join(' ');
  return text + (addNewline ? '\n' : '');
};

commands['rm'] = async (ctx) => {
  if (ctx.args.length === 0) {
    return 'rm: missing operand\n';
  }

  const recursive = ctx.args.includes('-r') || ctx.args.includes('-rf') || ctx.args.includes('-fr');
  const force = ctx.args.includes('-f') || ctx.args.includes('-rf') || ctx.args.includes('-fr');
  const paths = ctx.args.filter(a => !a.startsWith('-'));

  const results: string[] = [];
  for (const target of paths) {
    const path = ctx.fs.normalizePath(target, ctx.cwd);
    if (!ctx.fs.exists(path) && !force) {
      results.push(`rm: cannot remove '${target}': No such file or directory\n`);
      continue;
    }
    if (!ctx.fs.remove(path, recursive) && !force) {
      results.push(`rm: cannot remove '${target}': Is a directory\n`);
    }
  }

  return results.join('');
};

commands['cp'] = async (ctx) => {
  if (ctx.args.length < 2) {
    return 'cp: missing file operand\n';
  }

  const src = ctx.fs.normalizePath(ctx.args[0]!, ctx.cwd);
  const dst = ctx.fs.normalizePath(ctx.args[1]!, ctx.cwd);

  const content = ctx.fs.readFile(src);
  if (content === null) {
    return `cp: cannot stat '${ctx.args[0]}': No such file or directory\n`;
  }

  ctx.fs.writeFile(dst, content);
  return '';
};

commands['mv'] = async (ctx) => {
  if (ctx.args.length < 2) {
    return 'mv: missing file operand\n';
  }

  const src = ctx.fs.normalizePath(ctx.args[0]!, ctx.cwd);
  const dst = ctx.fs.normalizePath(ctx.args[1]!, ctx.cwd);

  const content = ctx.fs.readFile(src);
  if (content === null) {
    return `mv: cannot stat '${ctx.args[0]}': No such file or directory\n`;
  }

  ctx.fs.writeFile(dst, content);
  ctx.fs.remove(src);
  return '';
};

commands['head'] = async (ctx) => {
  const nIndex = ctx.args.indexOf('-n');
  let lines = 10;
  let file: string | undefined;

  if (nIndex !== -1) {
    lines = parseInt(ctx.args[nIndex + 1] || '10', 10);
    file = ctx.args.filter((_, i) => i !== nIndex && i !== nIndex + 1).find(a => !a.startsWith('-'));
  } else {
    file = ctx.args.find(a => !a.startsWith('-'));
  }

  let content: string;
  if (file) {
    const path = ctx.fs.normalizePath(file, ctx.cwd);
    const fileContent = ctx.fs.readFile(path);
    if (fileContent === null) {
      return `head: cannot open '${file}': No such file or directory\n`;
    }
    content = fileContent;
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return 'head: missing file operand\n';
  }

  return content.split('\n').slice(0, lines).join('\n') + '\n';
};

commands['tail'] = async (ctx) => {
  const nIndex = ctx.args.indexOf('-n');
  let lines = 10;
  let file: string | undefined;

  if (nIndex !== -1) {
    lines = parseInt(ctx.args[nIndex + 1] || '10', 10);
    file = ctx.args.filter((_, i) => i !== nIndex && i !== nIndex + 1).find(a => !a.startsWith('-'));
  } else {
    file = ctx.args.find(a => !a.startsWith('-'));
  }

  let content: string;
  if (file) {
    const path = ctx.fs.normalizePath(file, ctx.cwd);
    const fileContent = ctx.fs.readFile(path);
    if (fileContent === null) {
      return `tail: cannot open '${file}': No such file or directory\n`;
    }
    content = fileContent;
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return 'tail: missing file operand\n';
  }

  const allLines = content.split('\n');
  return allLines.slice(Math.max(0, allLines.length - lines)).join('\n') + '\n';
};

commands['wc'] = async (ctx) => {
  let content: string;
  const file = ctx.args.find(a => !a.startsWith('-'));

  if (file) {
    const path = ctx.fs.normalizePath(file, ctx.cwd);
    const fileContent = ctx.fs.readFile(path);
    if (fileContent === null) {
      return `wc: ${file}: No such file or directory\n`;
    }
    content = fileContent;
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return 'wc: missing file operand\n';
  }

  const lines = content.split('\n').length;
  const words = content.split(/\s+/).filter(Boolean).length;
  const chars = content.length;

  return `  ${lines}  ${words}  ${chars}${file ? '  ' + file : ''}\n`;
};

commands['grep'] = async (ctx) => {
  if (ctx.args.length === 0) {
    return 'grep: missing pattern\n';
  }

  const caseInsensitive = ctx.args.includes('-i');
  const showLineNumbers = ctx.args.includes('-n');
  const positionalArgs = ctx.args.filter(a => !a.startsWith('-'));
  const pattern = positionalArgs[0]!;
  const file = positionalArgs[1];

  let content: string;
  if (file) {
    const path = ctx.fs.normalizePath(file, ctx.cwd);
    const fileContent = ctx.fs.readFile(path);
    if (fileContent === null) {
      return `grep: ${file}: No such file or directory\n`;
    }
    content = fileContent;
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return 'grep: missing file operand\n';
  }

  const flags = caseInsensitive ? 'i' : '';
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch {
    return `grep: Invalid pattern '${pattern}'\n`;
  }

  const lines = content.split('\n');
  const matches: string[] = [];
  lines.forEach((line, i) => {
    if (regex.test(line)) {
      matches.push(showLineNumbers ? `${i + 1}:${line}` : line);
    }
  });

  return matches.join('\n') + (matches.length > 0 ? '\n' : '');
};

commands['sort'] = async (ctx) => {
  const reverse = ctx.args.includes('-r');
  const numeric = ctx.args.includes('-n');
  const file = ctx.args.find(a => !a.startsWith('-'));

  let content: string;
  if (file) {
    const path = ctx.fs.normalizePath(file, ctx.cwd);
    const fileContent = ctx.fs.readFile(path);
    if (fileContent === null) {
      return `sort: ${file}: No such file or directory\n`;
    }
    content = fileContent;
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return '';
  }

  let lines = content.split('\n').filter(Boolean);
  if (numeric) {
    lines.sort((a, b) => parseFloat(a) - parseFloat(b));
  } else {
    lines.sort();
  }
  if (reverse) lines.reverse();

  return lines.join('\n') + '\n';
};

commands['uniq'] = async (ctx) => {
  const file = ctx.args.find(a => !a.startsWith('-'));

  let content: string;
  if (file) {
    const path = ctx.fs.normalizePath(file, ctx.cwd);
    const fileContent = ctx.fs.readFile(path);
    if (fileContent === null) {
      return `uniq: ${file}: No such file or directory\n`;
    }
    content = fileContent;
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return '';
  }

  const lines = content.split('\n');
  const unique: string[] = [];
  for (const line of lines) {
    if (unique.length === 0 || unique[unique.length - 1] !== line) {
      unique.push(line);
    }
  }

  return unique.join('\n');
};

commands['tee'] = async (ctx) => {
  const file = ctx.args.find(a => !a.startsWith('-'));
  const input = ctx.stdin ?? '';

  if (file) {
    const path = ctx.fs.normalizePath(file, ctx.cwd);
    const append = ctx.args.includes('-a');
    if (append) {
      const existing = ctx.fs.readFile(path) ?? '';
      ctx.fs.writeFile(path, existing + input);
    } else {
      ctx.fs.writeFile(path, input);
    }
  }

  return input;
};

// ============================================================================
// Information Commands
// ============================================================================

commands['date'] = async () => {
  return new Date().toString() + '\n';
};

commands['whoami'] = async (ctx) => {
  return (ctx.env['USER'] || 'user') + '\n';
};

commands['hostname'] = async (ctx) => {
  return (ctx.env['HOSTNAME'] || 'stark-os') + '\n';
};

commands['uname'] = async (ctx) => {
  if (ctx.args.includes('-a')) {
    return 'StarkOS 1.0.0 JavaScript browser x86_64 StarkOS\n';
  }
  return 'StarkOS\n';
};

commands['uptime'] = async () => {
  const upMs = performance.now();
  const upSec = Math.floor(upMs / 1000);
  const hours = Math.floor(upSec / 3600);
  const mins = Math.floor((upSec % 3600) / 60);
  return `up ${hours}:${mins.toString().padStart(2, '0')}\n`;
};

commands['env'] = async (ctx) => {
  return Object.entries(ctx.env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
};

commands['export'] = async (ctx) => {
  for (const arg of ctx.args) {
    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) {
      const key = arg.slice(0, eqIdx);
      const value = arg.slice(eqIdx + 1);
      ctx.env[key] = value;
    }
  }
  return '';
};

commands['which'] = async (ctx) => {
  if (ctx.args.length === 0) return '';
  const cmd = ctx.args[0]!;
  if (commands[cmd]) {
    return `/usr/bin/${cmd}\n`;
  }
  return `${cmd} not found\n`;
};

commands['type'] = async (ctx) => {
  if (ctx.args.length === 0) return '';
  const cmd = ctx.args[0]!;
  if (commands[cmd]) {
    return `${cmd} is a shell builtin\n`;
  }
  return `${cmd}: not found\n`;
};

commands['true'] = async () => '';
commands['false'] = async () => { throw new Error(''); };

commands['sleep'] = async (ctx) => {
  const seconds = parseFloat(ctx.args[0] || '1');
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  return '';
};

commands['clear'] = async (ctx) => {
  ctx.write('\x1B[2J\x1B[H');
  return '';
};

commands['history'] = async (ctx) => {
  // History is stored in the shell, not in the command itself.
  // This returns a placeholder message.
  return 'History is available via up/down arrow keys.\n';
};

commands['help'] = async () => {
  const cmds = Object.keys(commands).sort();
  let result = 'Available commands:\n\n';
  const columns = 4;
  const colWidth = 16;
  for (let i = 0; i < cmds.length; i += columns) {
    const row = cmds.slice(i, i + columns).map(c => c.padEnd(colWidth)).join('');
    result += '  ' + row + '\n';
  }
  result += '\nUse "stark <command>" for orchestrator commands.\n';
  result += 'Pipe with |, run in background with &, chain with &&\n';
  return result;
};

// ============================================================================
// Stark CLI Commands (pass-through to browser-cli)
// ============================================================================

commands['stark'] = async (ctx) => {
  try {
    const { executeCommand } = await import('@stark-o/browser-cli');
    let output = '';
    const result = await executeCommand(ctx.args, (text) => { output += text; });
    if (!result.success && !output) {
      return `Error: ${result.error || 'Command failed'}\n`;
    }
    return output;
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}\n`;
  }
};

// ============================================================================
// Text Processing
// ============================================================================

commands['tr'] = async (ctx) => {
  const input = ctx.stdin ?? '';
  if (ctx.args.length < 2) {
    return 'tr: missing operand\n';
  }
  const set1 = ctx.args[0]!;
  const set2 = ctx.args[1]!;

  let result = input;
  for (let i = 0; i < set1.length && i < set2.length; i++) {
    result = result.split(set1[i]!).join(set2[i]!);
  }
  return result;
};

commands['cut'] = async (ctx) => {
  const input = ctx.stdin ?? '';
  const dIdx = ctx.args.indexOf('-d');
  const fIdx = ctx.args.indexOf('-f');

  const delimiter = dIdx !== -1 ? ctx.args[dIdx + 1] || '\t' : '\t';
  const fields = fIdx !== -1 ? ctx.args[fIdx + 1] || '1' : '1';

  const fieldNums = fields.split(',').map(f => parseInt(f, 10) - 1);

  const lines = input.split('\n');
  const result = lines.map(line => {
    const parts = line.split(delimiter);
    return fieldNums.map(f => parts[f] ?? '').join(delimiter);
  });

  return result.join('\n');
};

commands['seq'] = async (ctx) => {
  const args = ctx.args.map(Number);
  let start = 1, step = 1, end = 1;

  if (args.length === 1) {
    end = args[0]!;
  } else if (args.length === 2) {
    start = args[0]!;
    end = args[1]!;
  } else if (args.length >= 3) {
    start = args[0]!;
    step = args[1]!;
    end = args[2]!;
  }

  const result: number[] = [];
  if (step > 0) {
    for (let i = start; i <= end; i += step) result.push(i);
  } else if (step < 0) {
    for (let i = start; i >= end; i += step) result.push(i);
  }

  return result.join('\n') + '\n';
};

commands['yes'] = async (ctx) => {
  // In a real terminal, yes runs forever. Here we output a few lines.
  const text = ctx.args.join(' ') || 'y';
  return Array(10).fill(text).join('\n') + '\n';
};

commands['xargs'] = async (ctx) => {
  const input = ctx.stdin ?? '';
  const cmd = ctx.args[0];
  if (!cmd) return '';

  const items = input.trim().split(/\s+/);
  const handler = commands[cmd];
  if (!handler) {
    return `xargs: ${cmd}: command not found\n`;
  }

  return handler({
    ...ctx,
    args: [...ctx.args.slice(1), ...items],
    stdin: undefined,
  });
};

commands['find'] = async (ctx) => {
  const searchPath = ctx.args[0] || ctx.cwd;
  const nameIdx = ctx.args.indexOf('-name');
  const pattern = nameIdx !== -1 ? ctx.args[nameIdx + 1] : undefined;

  const resolvedPath = ctx.fs.normalizePath(searchPath, ctx.cwd);
  const results: string[] = [];

  function walk(path: string) {
    const node = ctx.fs.getNode(path);
    if (!node) return;

    const name = path.split('/').pop() || '';
    if (!pattern || name.includes(pattern.replace(/\*/g, ''))) {
      results.push(path);
    }

    if (node.type === 'dir') {
      for (const [childName] of node.children) {
        walk(path === '/' ? `/${childName}` : `${path}/${childName}`);
      }
    }
  }

  walk(resolvedPath);
  return results.join('\n') + '\n';
};

commands['du'] = async (ctx) => {
  const target = ctx.args.find(a => !a.startsWith('-')) || ctx.cwd;
  const path = ctx.fs.normalizePath(target, ctx.cwd);

  function getSize(p: string): number {
    const node = ctx.fs.getNode(p);
    if (!node) return 0;
    if (node.type === 'file') return node.content.length;
    let total = 0;
    for (const [name] of node.children) {
      total += getSize(p === '/' ? `/${name}` : `${p}/${name}`);
    }
    return total;
  }

  const size = getSize(path);
  return `${size}\t${target}\n`;
};

commands['df'] = async () => {
  return `Filesystem      1K-blocks   Used Available Use% Mounted on
virtual                 0      0         0   0% /
\n`;
};
