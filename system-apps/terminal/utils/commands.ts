/**
 * Unix Commands for Stark OS Terminal
 *
 * Implements common unix commands for the in-browser terminal.
 * Uses OPFS (Origin Private File System) via the IStorageAdapter for
 * real persistent file system operations. Volumes stored in OPFS are visible.
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
 * - Reimplemented as pure JavaScript/TypeScript commands instead of WASI bindings
 * - Adapted for Stark OS OPFS-backed filesystem with volumes visible at /volumes/
 * - Added Stark CLI integration for orchestrator commands
 * - Added pipe, &, and && operator support
 * @module @stark-o/terminal/utils/commands
 */

/**
 * Minimal filesystem interface for terminal commands.
 * Compatible with IStorageAdapter from @stark-o/shared.
 */
export interface TerminalFS {
  readFile(path: string, encoding?: string): Promise<string>;
  writeFile(path: string, content: string | Uint8Array, encoding?: string): Promise<void>;
  appendFile(path: string, content: string | Uint8Array, encoding?: string): Promise<void>;
  mkdir(path: string, recursive?: boolean): Promise<void>;
  readdir(path: string): Promise<string[]>;
  readdirWithTypes(path: string): Promise<Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>>;
  rmdir(path: string, recursive?: boolean): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<{ size: number; mtime: Date }>;
  unlink(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  copyFile(src: string, dest: string): Promise<void>;
  isFile(path: string): Promise<boolean>;
  isDirectory(path: string): Promise<boolean>;
}

/**
 * Normalize a path (resolve . and ..)
 */
export function normalizePath(path: string, cwd: string): string {
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
 * Command context passed to each command handler
 */
export interface CommandContext {
  args: string[];
  cwd: string;
  write: (text: string) => void;
  writeError: (text: string) => void;
  stdin?: string;
  fs: TerminalFS;
  env: Record<string, string>;
  setCwd: (path: string) => void;
}

/**
 * Command handler function — all async since OPFS is async
 */
export type CommandHandler = (ctx: CommandContext) => Promise<string>;

/**
 * Registry of all available commands
 */
export const commands: Record<string, CommandHandler> = {};

// ============================================================================
// File System Commands (all async, backed by OPFS)
// ============================================================================

commands['ls'] = async (ctx) => {
  const showAll = ctx.args.includes('-a') || ctx.args.includes('-la') || ctx.args.includes('-al');
  const longFormat = ctx.args.includes('-l') || ctx.args.includes('-la') || ctx.args.includes('-al');
  const pathArgs = ctx.args.filter(a => !a.startsWith('-'));
  const target = pathArgs[0] || ctx.cwd;
  const resolvedPath = normalizePath(target, ctx.cwd);

  try {
    const isDir = await ctx.fs.isDirectory(resolvedPath);
    if (!isDir) {
      const isF = await ctx.fs.isFile(resolvedPath);
      if (isF) return `${target}\n`;
      return `ls: cannot access '${target}': No such file or directory\n`;
    }

    const entries = await ctx.fs.readdirWithTypes(resolvedPath);
    const names = entries.map(e => e.name);
    const filtered = showAll ? ['.', '..', ...names] : names;

    if (longFormat) {
      const lines: string[] = [];
      for (const name of filtered) {
        if (name === '.' || name === '..') {
          lines.push(`drwxr-xr-x  -  ${name}`);
          continue;
        }
        const entry = entries.find(e => e.name === name)!;
        const typeChar = entry.isDirectory() ? 'd' : '-';
        const perms = entry.isDirectory() ? 'rwxr-xr-x' : 'rw-r--r--';
        let size = '     -';
        let date = new Date().toLocaleDateString();
        if (entry.isFile()) {
          try {
            const entryPath = resolvedPath === '/' ? `/${name}` : `${resolvedPath}/${name}`;
            const stat = await ctx.fs.stat(entryPath);
            size = stat.size.toString().padStart(6);
            date = stat.mtime.toLocaleDateString();
          } catch { /* ignore stat errors */ }
        }
        lines.push(`${typeChar}${perms}  ${size}  ${date}  ${name}`);
      }
      return lines.join('\n') + '\n';
    }

    return filtered.join('  ') + '\n';
  } catch {
    return `ls: cannot access '${target}': No such file or directory\n`;
  }
};

commands['cd'] = async (ctx) => {
  const target = ctx.args[0];
  if (!target) {
    ctx.setCwd(ctx.env['HOME'] || '/');
    return '';
  }
  const path = normalizePath(target, ctx.cwd);
  try {
    const isDir = await ctx.fs.isDirectory(path);
    if (!isDir) {
      const isF = await ctx.fs.isFile(path);
      if (isF) return `cd: ${target}: Not a directory\n`;
      return `cd: ${target}: No such file or directory\n`;
    }
    ctx.setCwd(path);
    return '';
  } catch {
    return `cd: ${target}: No such file or directory\n`;
  }
};

commands['pwd'] = async (ctx) => ctx.cwd + '\n';

commands['mkdir'] = async (ctx) => {
  if (ctx.args.length === 0) return 'mkdir: missing operand\n';
  const createParents = ctx.args.includes('-p');
  const paths = ctx.args.filter(a => !a.startsWith('-'));
  const results: string[] = [];
  for (const target of paths) {
    const path = normalizePath(target, ctx.cwd);
    try {
      await ctx.fs.mkdir(path, createParents);
    } catch (err) {
      results.push(`mkdir: cannot create directory '${target}': ${err instanceof Error ? err.message : 'Error'}\n`);
    }
  }
  return results.join('');
};

commands['touch'] = async (ctx) => {
  if (ctx.args.length === 0) return 'touch: missing file operand\n';
  for (const target of ctx.args) {
    const path = normalizePath(target, ctx.cwd);
    const fileExists = await ctx.fs.exists(path);
    if (!fileExists) {
      const parentPath = path.split('/').slice(0, -1).join('/') || '/';
      try { await ctx.fs.mkdir(parentPath, true); } catch { /* ignore */ }
      await ctx.fs.writeFile(path, '');
    }
  }
  return '';
};

commands['cat'] = async (ctx) => {
  if (ctx.args.length === 0 && ctx.stdin !== undefined) return ctx.stdin;
  if (ctx.args.length === 0) return 'cat: missing file operand\n';
  const results: string[] = [];
  for (const target of ctx.args) {
    const path = normalizePath(target, ctx.cwd);
    try {
      results.push(await ctx.fs.readFile(path));
    } catch {
      results.push(`cat: ${target}: No such file or directory\n`);
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
  if (ctx.args.length === 0) return 'rm: missing operand\n';
  const recursive = ctx.args.includes('-r') || ctx.args.includes('-rf') || ctx.args.includes('-fr');
  const force = ctx.args.includes('-f') || ctx.args.includes('-rf') || ctx.args.includes('-fr');
  const paths = ctx.args.filter(a => !a.startsWith('-'));
  const results: string[] = [];
  for (const target of paths) {
    const path = normalizePath(target, ctx.cwd);
    try {
      const isDir = await ctx.fs.isDirectory(path);
      if (isDir) {
        if (!recursive && !force) { results.push(`rm: cannot remove '${target}': Is a directory\n`); continue; }
        await ctx.fs.rmdir(path, true);
      } else {
        await ctx.fs.unlink(path);
      }
    } catch {
      if (!force) results.push(`rm: cannot remove '${target}': No such file or directory\n`);
    }
  }
  return results.join('');
};

commands['cp'] = async (ctx) => {
  if (ctx.args.length < 2) return 'cp: missing file operand\n';
  const src = normalizePath(ctx.args[0]!, ctx.cwd);
  const dst = normalizePath(ctx.args[1]!, ctx.cwd);
  try {
    await ctx.fs.copyFile(src, dst);
  } catch {
    return `cp: cannot stat '${ctx.args[0]}': No such file or directory\n`;
  }
  return '';
};

commands['mv'] = async (ctx) => {
  if (ctx.args.length < 2) return 'mv: missing file operand\n';
  const src = normalizePath(ctx.args[0]!, ctx.cwd);
  const dst = normalizePath(ctx.args[1]!, ctx.cwd);
  try {
    await ctx.fs.rename(src, dst);
  } catch {
    return `mv: cannot stat '${ctx.args[0]}': No such file or directory\n`;
  }
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
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `head: cannot open '${file}': No such file or directory\n`; }
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
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `tail: cannot open '${file}': No such file or directory\n`; }
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
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `wc: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return 'wc: missing file operand\n';
  }
  const lineCount = content.split('\n').length;
  const words = content.split(/\s+/).filter(Boolean).length;
  const chars = content.length;
  return `  ${lineCount}  ${words}  ${chars}${file ? '  ' + file : ''}\n`;
};

commands['grep'] = async (ctx) => {
  if (ctx.args.length === 0) return 'grep: missing pattern\n';
  const caseInsensitive = ctx.args.includes('-i');
  const showLineNumbers = ctx.args.includes('-n');
  const positionalArgs = ctx.args.filter(a => !a.startsWith('-'));
  const pattern = positionalArgs[0]!;
  const file = positionalArgs[1];
  let content: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `grep: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return 'grep: missing file operand\n';
  }
  const flags = caseInsensitive ? 'i' : '';
  let regex: RegExp;
  try { regex = new RegExp(pattern, flags); } catch { return `grep: Invalid pattern '${pattern}'\n`; }
  const lines = content.split('\n');
  const matches: string[] = [];
  lines.forEach((line, i) => { if (regex.test(line)) matches.push(showLineNumbers ? `${i + 1}:${line}` : line); });
  return matches.join('\n') + (matches.length > 0 ? '\n' : '');
};

commands['sort'] = async (ctx) => {
  const reverse = ctx.args.includes('-r');
  const numeric = ctx.args.includes('-n');
  const file = ctx.args.find(a => !a.startsWith('-'));
  let content: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `sort: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return '';
  }
  let lines = content.split('\n').filter(Boolean);
  if (numeric) { lines.sort((a, b) => parseFloat(a) - parseFloat(b)); } else { lines.sort(); }
  if (reverse) lines.reverse();
  return lines.join('\n') + '\n';
};

commands['uniq'] = async (ctx) => {
  const file = ctx.args.find(a => !a.startsWith('-'));
  let content: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `uniq: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return '';
  }
  const lines = content.split('\n');
  const unique: string[] = [];
  for (const line of lines) {
    if (unique.length === 0 || unique[unique.length - 1] !== line) unique.push(line);
  }
  return unique.join('\n');
};

commands['tee'] = async (ctx) => {
  const file = ctx.args.find(a => !a.startsWith('-'));
  const input = ctx.stdin ?? '';
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    if (ctx.args.includes('-a')) {
      await ctx.fs.appendFile(path, input);
    } else {
      await ctx.fs.writeFile(path, input);
    }
  }
  return input;
};

// ============================================================================
// Information Commands
// ============================================================================

commands['date'] = async () => new Date().toString() + '\n';

commands['whoami'] = async (ctx) => (ctx.env['USER'] || 'user') + '\n';

commands['hostname'] = async (ctx) => (ctx.env['HOSTNAME'] || 'stark-os') + '\n';

commands['uname'] = async (ctx) => {
  if (ctx.args.includes('-a')) return 'StarkOS 1.0.0 JavaScript browser x86_64 StarkOS\n';
  return 'StarkOS\n';
};

commands['uptime'] = async () => {
  const upMs = performance.now();
  const upSec = Math.floor(upMs / 1000);
  const hours = Math.floor(upSec / 3600);
  const mins = Math.floor((upSec % 3600) / 60);
  return `up ${hours}:${mins.toString().padStart(2, '0')}\n`;
};

commands['env'] = async (ctx) => Object.entries(ctx.env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';

commands['export'] = async (ctx) => {
  for (const arg of ctx.args) {
    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) { ctx.env[arg.slice(0, eqIdx)] = arg.slice(eqIdx + 1); }
  }
  return '';
};

commands['which'] = async (ctx) => {
  if (ctx.args.length === 0) return '';
  const cmd = ctx.args[0]!;
  return commands[cmd] ? `/usr/bin/${cmd}\n` : `${cmd} not found\n`;
};

commands['type'] = async (ctx) => {
  if (ctx.args.length === 0) return '';
  const cmd = ctx.args[0]!;
  return commands[cmd] ? `${cmd} is a shell builtin\n` : `${cmd}: not found\n`;
};

commands['true'] = async () => '';
commands['false'] = async () => { throw new Error(''); };

commands['sleep'] = async (ctx) => {
  const seconds = parseFloat(ctx.args[0] || '1');
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  return '';
};

commands['clear'] = async (ctx) => { ctx.write('\x1B[2J\x1B[H'); return ''; };

commands['history'] = async () => 'History is available via up/down arrow keys.\n';

commands['help'] = async () => {
  const cmds = Object.keys(commands).sort();
  let result = 'Available commands:\n\n';
  const columns = 4;
  const colWidth = 16;
  for (let i = 0; i < cmds.length; i += columns) {
    const row = cmds.slice(i, i + columns).map(c => c.padEnd(colWidth)).join('');
    result += '  ' + row + '\n';
  }
  result += '\nFilesystem is backed by OPFS. Volumes are visible at /volumes/<name>.\n';
  result += 'Pipe with |, run in background with &, chain with &&\n';
  return result;
};

// ============================================================================
// Text Processing
// ============================================================================

commands['tr'] = async (ctx) => {
  const input = ctx.stdin ?? '';
  if (ctx.args.length < 2) return 'tr: missing operand\n';
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
  if (args.length === 1) { end = args[0]!; }
  else if (args.length === 2) { start = args[0]!; end = args[1]!; }
  else if (args.length >= 3) { start = args[0]!; step = args[1]!; end = args[2]!; }
  const result: number[] = [];
  if (step > 0) { for (let i = start; i <= end; i += step) result.push(i); }
  else if (step < 0) { for (let i = start; i >= end; i += step) result.push(i); }
  return result.join('\n') + '\n';
};

commands['yes'] = async (ctx) => {
  const text = ctx.args.join(' ') || 'y';
  return Array(10).fill(text).join('\n') + '\n';
};

commands['xargs'] = async (ctx) => {
  const input = ctx.stdin ?? '';
  const cmd = ctx.args[0];
  if (!cmd) return '';
  const items = input.trim().split(/\s+/);
  const handler = commands[cmd];
  if (!handler) return `xargs: ${cmd}: command not found\n`;
  return handler({ ...ctx, args: [...ctx.args.slice(1), ...items], stdin: undefined });
};

commands['find'] = async (ctx) => {
  const searchPath = ctx.args[0] || ctx.cwd;
  const nameIdx = ctx.args.indexOf('-name');
  const pattern = nameIdx !== -1 ? ctx.args[nameIdx + 1] : undefined;
  const resolvedPath = normalizePath(searchPath, ctx.cwd);
  const results: string[] = [];
  async function walk(path: string) {
    const name = path.split('/').pop() || '';
    if (!pattern || name.includes(pattern.replace(/\*/g, ''))) results.push(path);
    try {
      const isDir = await ctx.fs.isDirectory(path);
      if (isDir) {
        const entries = await ctx.fs.readdir(path);
        for (const childName of entries) {
          await walk(path === '/' ? `/${childName}` : `${path}/${childName}`);
        }
      }
    } catch { /* skip inaccessible */ }
  }
  await walk(resolvedPath);
  return results.join('\n') + '\n';
};

commands['du'] = async (ctx) => {
  const target = ctx.args.find(a => !a.startsWith('-')) || ctx.cwd;
  const path = normalizePath(target, ctx.cwd);
  async function getSize(p: string): Promise<number> {
    try {
      const isDir = await ctx.fs.isDirectory(p);
      if (!isDir) { const stat = await ctx.fs.stat(p); return stat.size; }
      let total = 0;
      const entries = await ctx.fs.readdir(p);
      for (const name of entries) { total += await getSize(p === '/' ? `/${name}` : `${p}/${name}`); }
      return total;
    } catch { return 0; }
  }
  const size = await getSize(path);
  return `${size}\t${target}\n`;
};

commands['df'] = async () => `Filesystem      1K-blocks   Used Available Use% Mounted on\nopfs                    0      0         0   0% /\n`;
