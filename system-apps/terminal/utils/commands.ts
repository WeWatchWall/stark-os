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
  /** Prompt the user for text input (interactive terminal sequences) */
  prompt?: (message: string) => Promise<string>;
  /** Prompt the user for password input (hidden characters) */
  promptPassword?: (message: string) => Promise<string>;
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

commands['rmdir'] = async (ctx) => {
  if (ctx.args.length === 0) return 'rmdir: missing operand\n';
  const parents = ctx.args.includes('-p') || ctx.args.includes('--parents');
  const paths = ctx.args.filter(a => !a.startsWith('-'));
  const results: string[] = [];
  for (const target of paths) {
    const path = normalizePath(target, ctx.cwd);
    try {
      await ctx.fs.rmdir(path, false);
      if (parents) {
        let parent = path.split('/').slice(0, -1).join('/') || '/';
        while (parent && parent !== '/') {
          try {
            const entries = await ctx.fs.readdir(parent);
            if (entries.length === 0) await ctx.fs.rmdir(parent, false);
            else break;
          } catch { break; }
          parent = parent.split('/').slice(0, -1).join('/') || '/';
        }
      }
    } catch (err) {
      results.push(`rmdir: failed to remove '${target}': ${err instanceof Error ? err.message : 'Directory not empty'}\n`);
    }
  }
  return results.join('');
};

// ============================================================================
// Path Utility Commands
// ============================================================================

commands['basename'] = async (ctx) => {
  if (ctx.args.length === 0) return 'basename: missing operand\n';
  const name = ctx.args[0]!;
  const suffix = ctx.args[1];
  let base = name.split('/').pop() || name;
  if (suffix && base.endsWith(suffix)) base = base.slice(0, -suffix.length);
  return base + '\n';
};

commands['dirname'] = async (ctx) => {
  if (ctx.args.length === 0) return 'dirname: missing operand\n';
  const name = ctx.args[0]!;
  const idx = name.lastIndexOf('/');
  return (idx <= 0 ? (name.startsWith('/') ? '/' : '.') : name.slice(0, idx)) + '\n';
};

commands['readlink'] = async (ctx) => {
  if (ctx.args.length === 0) return 'readlink: missing operand\n';
  const target = ctx.args.find(a => !a.startsWith('-')) || ctx.args[0]!;
  const path = normalizePath(target, ctx.cwd);
  const exists = await ctx.fs.exists(path);
  if (!exists) return `readlink: ${target}: No such file or directory\n`;
  return path + '\n';
};

commands['realpath'] = async (ctx) => {
  if (ctx.args.length === 0) return 'realpath: missing operand\n';
  const results: string[] = [];
  for (const target of ctx.args) {
    const path = normalizePath(target, ctx.cwd);
    const exists = await ctx.fs.exists(path);
    if (!exists) results.push(`realpath: ${target}: No such file or directory\n`);
    else results.push(path + '\n');
  }
  return results.join('');
};

commands['relpath'] = async (ctx) => {
  if (ctx.args.length === 0) return 'relpath: missing operand\n';
  const target = normalizePath(ctx.args[0]!, ctx.cwd);
  const from = ctx.args[1] ? normalizePath(ctx.args[1], ctx.cwd) : ctx.cwd;
  const targetParts = target.split('/').filter(Boolean);
  const fromParts = from.split('/').filter(Boolean);
  let common = 0;
  while (common < targetParts.length && common < fromParts.length && targetParts[common] === fromParts[common]) common++;
  const ups = fromParts.length - common;
  const remaining = targetParts.slice(common);
  const rel = [...Array(ups).fill('..'), ...remaining].join('/') || '.';
  return rel + '\n';
};

// ============================================================================
// Additional File Operations
// ============================================================================

commands['link'] = async (ctx) => {
  if (ctx.args.length < 2) return 'link: missing operand\n';
  const src = normalizePath(ctx.args[0]!, ctx.cwd);
  const dst = normalizePath(ctx.args[1]!, ctx.cwd);
  try { await ctx.fs.copyFile(src, dst); } catch { return `link: cannot create link '${ctx.args[1]}': No such file or directory\n`; }
  return '';
};

commands['ln'] = async (ctx) => {
  const symbolic = ctx.args.includes('-s') || ctx.args.includes('--symbolic');
  const paths = ctx.args.filter(a => !a.startsWith('-'));
  if (paths.length < 2) return 'ln: missing operand\n';
  const src = normalizePath(paths[0]!, ctx.cwd);
  const dst = normalizePath(paths[1]!, ctx.cwd);
  try { await ctx.fs.copyFile(src, dst); } catch { return `ln: cannot create ${symbolic ? 'symbolic ' : ''}link '${paths[1]}': No such file or directory\n`; }
  return '';
};

commands['mktemp'] = async (ctx) => {
  const dir = ctx.args.includes('-d');
  const template = ctx.args.find(a => !a.startsWith('-')) || 'tmp.XXXXXXXXXX';
  const name = template.replace(/X+/g, () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const arr = new Uint8Array(10);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(arr);
    } else {
      for (let j = 0; j < arr.length; j++) arr[j] = Math.floor(Math.random() * 256);
    }
    let r = '';
    for (let j = 0; j < 10; j++) r += chars[arr[j]! % chars.length];
    return r;
  });
  const path = normalizePath(`/tmp/${name}`, ctx.cwd);
  try {
    if (dir) { await ctx.fs.mkdir(path, true); } else { await ctx.fs.writeFile(path, ''); }
  } catch { /* ignore */ }
  return path + '\n';
};

commands['shred'] = async (ctx) => {
  if (ctx.args.length === 0) return 'shred: missing operand\n';
  const remove = ctx.args.includes('-u') || ctx.args.includes('--remove');
  const paths = ctx.args.filter(a => !a.startsWith('-'));
  for (const target of paths) {
    const path = normalizePath(target, ctx.cwd);
    try {
      const stat = await ctx.fs.stat(path);
      await ctx.fs.writeFile(path, '\0'.repeat(stat.size));
      if (remove) await ctx.fs.unlink(path);
    } catch { return `shred: ${target}: No such file or directory\n`; }
  }
  return '';
};

commands['truncate'] = async (ctx) => {
  const sIdx = ctx.args.indexOf('-s');
  const size = sIdx !== -1 ? parseInt(ctx.args[sIdx + 1] || '0', 10) : 0;
  const file = ctx.args.find((a, i) => !a.startsWith('-') && i !== sIdx + 1);
  if (!file) return 'truncate: missing operand\n';
  const path = normalizePath(file, ctx.cwd);
  try {
    if (size === 0) { await ctx.fs.writeFile(path, ''); }
    else {
      let content = '';
      try { content = await ctx.fs.readFile(path); } catch { /* new file */ }
      if (content.length > size) content = content.slice(0, size);
      else while (content.length < size) content += '\0';
      await ctx.fs.writeFile(path, content);
    }
  } catch { return `truncate: cannot open '${file}': Error\n`; }
  return '';
};

commands['split'] = async (ctx) => {
  const lIdx = ctx.args.indexOf('-l');
  const lines = lIdx !== -1 ? parseInt(ctx.args[lIdx + 1] || '1000', 10) : 1000;
  const positionals = ctx.args.filter((a, i) => !a.startsWith('-') && i !== lIdx + 1);
  const file = positionals[0];
  const prefix = positionals[1] || 'x';
  let content: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `split: cannot open '${file}': No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return 'split: missing operand\n';
  }
  const allLines = content.split('\n');
  let chunk = 0;
  for (let i = 0; i < allLines.length; i += lines) {
    const suffix = String.fromCharCode(97 + Math.floor(chunk / 26)) + String.fromCharCode(97 + (chunk % 26));
    const chunkPath = normalizePath(`${prefix}${suffix}`, ctx.cwd);
    await ctx.fs.writeFile(chunkPath, allLines.slice(i, i + lines).join('\n'));
    chunk++;
  }
  return '';
};

// ============================================================================
// Encoding Commands
// ============================================================================

commands['base64'] = async (ctx) => {
  const decode = ctx.args.includes('-d') || ctx.args.includes('--decode');
  const file = ctx.args.find(a => !a.startsWith('-'));
  let input: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { input = await ctx.fs.readFile(path); } catch { return `base64: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    input = ctx.stdin;
  } else {
    return 'base64: missing operand\n';
  }
  if (decode) {
    try { return atob(input.trim()) + '\n'; } catch { return 'base64: invalid input\n'; }
  }
  return btoa(input) + '\n';
};

commands['base32'] = async (ctx) => {
  const decode = ctx.args.includes('-d') || ctx.args.includes('--decode');
  const file = ctx.args.find(a => !a.startsWith('-'));
  let input: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { input = await ctx.fs.readFile(path); } catch { return `base32: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    input = ctx.stdin;
  } else {
    return 'base32: missing operand\n';
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  if (decode) {
    const cleaned = input.replace(/[^A-Z2-7]/gi, '');
    let bits = '';
    for (const c of cleaned) { const idx = alphabet.indexOf(c.toUpperCase()); if (idx >= 0) bits += idx.toString(2).padStart(5, '0'); }
    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    return new TextDecoder().decode(new Uint8Array(bytes)) + '\n';
  }
  const bytes = new TextEncoder().encode(input);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  while (bits.length % 5 !== 0) bits += '0';
  let result = '';
  for (let i = 0; i < bits.length; i += 5) result += alphabet[parseInt(bits.slice(i, i + 5), 2)];
  while (result.length % 8 !== 0) result += '=';
  return result + '\n';
};

// ============================================================================
// Additional Text Processing Commands
// ============================================================================

commands['tac'] = async (ctx) => {
  const file = ctx.args.find(a => !a.startsWith('-'));
  let content: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `tac: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return 'tac: missing operand\n';
  }
  return content.split('\n').reverse().join('\n') + '\n';
};

commands['nl'] = async (ctx) => {
  const file = ctx.args.find(a => !a.startsWith('-'));
  let content: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `nl: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return '';
  }
  return content.split('\n').map((line, i) => line ? `${(i + 1).toString().padStart(6)}\t${line}` : '').join('\n') + '\n';
};

commands['expand'] = async (ctx) => {
  const tIdx = ctx.args.indexOf('-t');
  const tabSize = tIdx !== -1 ? parseInt(ctx.args[tIdx + 1] || '8', 10) : 8;
  const file = ctx.args.find((a, i) => !a.startsWith('-') && i !== tIdx + 1);
  let content: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `expand: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return '';
  }
  return content.replace(/\t/g, ' '.repeat(tabSize));
};

commands['unexpand'] = async (ctx) => {
  const tIdx = ctx.args.indexOf('-t');
  const tabSize = tIdx !== -1 ? parseInt(ctx.args[tIdx + 1] || '8', 10) : 8;
  const file = ctx.args.find((a, i) => !a.startsWith('-') && i !== tIdx + 1);
  let content: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `unexpand: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return '';
  }
  const spaces = ' '.repeat(tabSize);
  return content.replace(new RegExp(spaces, 'g'), '\t');
};

commands['fold'] = async (ctx) => {
  const wIdx = ctx.args.indexOf('-w');
  const width = wIdx !== -1 ? parseInt(ctx.args[wIdx + 1] || '80', 10) : 80;
  const file = ctx.args.find((a, i) => !a.startsWith('-') && i !== wIdx + 1);
  let content: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `fold: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return '';
  }
  const lines = content.split('\n');
  const result: string[] = [];
  for (const line of lines) {
    if (line.length === 0) { result.push(''); continue; }
    for (let i = 0; i < line.length; i += width) result.push(line.slice(i, i + width));
  }
  return result.join('\n');
};

commands['fmt'] = async (ctx) => {
  const wIdx = ctx.args.indexOf('-w');
  const width = wIdx !== -1 ? parseInt(ctx.args[wIdx + 1] || '75', 10) : 75;
  const file = ctx.args.find((a, i) => !a.startsWith('-') && i !== wIdx + 1);
  let content: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `fmt: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return '';
  }
  const words = content.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    if (currentLine.length + word.length + 1 > width && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.join('\n') + '\n';
};

commands['comm'] = async (ctx) => {
  const suppress1 = ctx.args.includes('-1');
  const suppress2 = ctx.args.includes('-2');
  const suppress3 = ctx.args.includes('-3');
  const files = ctx.args.filter(a => !a.startsWith('-'));
  if (files.length < 2) return 'comm: missing operand\n';
  const path1 = normalizePath(files[0]!, ctx.cwd);
  const path2 = normalizePath(files[1]!, ctx.cwd);
  let content1: string, content2: string;
  try { content1 = await ctx.fs.readFile(path1); } catch { return `comm: ${files[0]}: No such file or directory\n`; }
  try { content2 = await ctx.fs.readFile(path2); } catch { return `comm: ${files[1]}: No such file or directory\n`; }
  const lines1 = content1.split('\n').filter(Boolean);
  const lines2 = content2.split('\n').filter(Boolean);
  const result: string[] = [];
  let i = 0, j = 0;
  while (i < lines1.length && j < lines2.length) {
    if (lines1[i]! < lines2[j]!) {
      if (!suppress1) result.push(lines1[i]!);
      i++;
    } else if (lines1[i]! > lines2[j]!) {
      if (!suppress2) result.push(`\t${lines2[j]!}`);
      j++;
    } else {
      if (!suppress3) result.push(`\t\t${lines1[i]!}`);
      i++; j++;
    }
  }
  while (i < lines1.length) { if (!suppress1) result.push(lines1[i]!); i++; }
  while (j < lines2.length) { if (!suppress2) result.push(`\t${lines2[j]!}`); j++; }
  return result.join('\n') + '\n';
};

commands['join'] = async (ctx) => {
  const files = ctx.args.filter(a => !a.startsWith('-'));
  if (files.length < 2) return 'join: missing operand\n';
  const path1 = normalizePath(files[0]!, ctx.cwd);
  const path2 = normalizePath(files[1]!, ctx.cwd);
  let content1: string, content2: string;
  try { content1 = await ctx.fs.readFile(path1); } catch { return `join: ${files[0]}: No such file or directory\n`; }
  try { content2 = await ctx.fs.readFile(path2); } catch { return `join: ${files[1]}: No such file or directory\n`; }
  const lines1 = content1.split('\n').filter(Boolean);
  const lines2 = content2.split('\n').filter(Boolean);
  const map2 = new Map<string, string[]>();
  for (const line of lines2) {
    const parts = line.split(/\s+/);
    map2.set(parts[0]!, parts.slice(1));
  }
  const result: string[] = [];
  for (const line of lines1) {
    const parts = line.split(/\s+/);
    if (map2.has(parts[0]!)) {
      result.push(`${parts[0]!} ${parts.slice(1).join(' ')} ${map2.get(parts[0]!)!.join(' ')}`);
    }
  }
  return result.join('\n') + (result.length > 0 ? '\n' : '');
};

commands['paste'] = async (ctx) => {
  const dIdx = ctx.args.indexOf('-d');
  const delimiter = dIdx !== -1 ? ctx.args[dIdx + 1] || '\t' : '\t';
  const files = ctx.args.filter((a, i) => !a.startsWith('-') && i !== dIdx + 1);
  if (files.length === 0 && ctx.stdin !== undefined) return ctx.stdin;
  const contents: string[][] = [];
  for (const file of files) {
    const path = normalizePath(file, ctx.cwd);
    try {
      const content = await ctx.fs.readFile(path);
      contents.push(content.split('\n'));
    } catch { return `paste: ${file}: No such file or directory\n`; }
  }
  const maxLines = Math.max(...contents.map(c => c.length));
  const result: string[] = [];
  for (let i = 0; i < maxLines; i++) {
    result.push(contents.map(c => c[i] || '').join(delimiter));
  }
  return result.join('\n') + '\n';
};

commands['od'] = async (ctx) => {
  const hex = ctx.args.includes('-x');
  const file = ctx.args.find(a => !a.startsWith('-'));
  let content: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `od: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return 'od: missing operand\n';
  }
  const bytes = new TextEncoder().encode(content);
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const offset = i.toString(8).padStart(7, '0');
    const chunk = Array.from(bytes.slice(i, i + 16));
    const values = hex
      ? chunk.map(b => b.toString(16).padStart(2, '0')).join(' ')
      : chunk.map(b => b.toString(8).padStart(3, '0')).join(' ');
    lines.push(`${offset} ${values}`);
  }
  lines.push(bytes.length.toString(8).padStart(7, '0'));
  return lines.join('\n') + '\n';
};

commands['more'] = async (ctx) => {
  const file = ctx.args.find(a => !a.startsWith('-'));
  let content: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `more: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return '';
  }
  return content + (content.endsWith('\n') ? '' : '\n');
};

commands['shuf'] = async (ctx) => {
  const file = ctx.args.find(a => !a.startsWith('-'));
  let content: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `shuf: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return '';
  }
  const lines = content.split('\n').filter(Boolean);
  for (let i = lines.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lines[i], lines[j]] = [lines[j]!, lines[i]!];
  }
  return lines.join('\n') + '\n';
};

commands['tsort'] = async (ctx) => {
  const file = ctx.args.find(a => !a.startsWith('-'));
  let content: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `tsort: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return '';
  }
  const tokens = content.split(/\s+/).filter(Boolean);
  const edges: Array<[string, string]> = [];
  const nodes = new Set<string>();
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    edges.push([tokens[i]!, tokens[i + 1]!]);
    nodes.add(tokens[i]!);
    nodes.add(tokens[i + 1]!);
  }
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) { inDegree.set(n, 0); adj.set(n, []); }
  for (const [from, to] of edges) {
    adj.get(from)!.push(to);
    inDegree.set(to, (inDegree.get(to) || 0) + 1);
  }
  const queue = [...nodes].filter(n => inDegree.get(n) === 0);
  const result: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    for (const next of adj.get(node) || []) {
      inDegree.set(next, (inDegree.get(next) || 0) - 1);
      if (inDegree.get(next) === 0) queue.push(next);
    }
  }
  if (result.length < nodes.size) return 'tsort: input contains a loop\n';
  return result.join('\n') + '\n';
};

commands['csplit'] = async (ctx) => {
  const positionals = ctx.args.filter(a => !a.startsWith('-'));
  if (positionals.length < 2) return 'csplit: missing operand\n';
  const file = positionals[0]!;
  const pattern = positionals[1]!;
  const path = normalizePath(file, ctx.cwd);
  let content: string;
  try { content = await ctx.fs.readFile(path); } catch { return `csplit: ${file}: No such file or directory\n`; }
  const lines = content.split('\n');
  const regex = new RegExp(pattern.replace(/^\/|\/$/g, ''));
  const chunks: string[][] = [[]];
  for (const line of lines) {
    if (regex.test(line) && chunks[chunks.length - 1]!.length > 0) chunks.push([]);
    chunks[chunks.length - 1]!.push(line);
  }
  for (let i = 0; i < chunks.length; i++) {
    const chunkPath = normalizePath(`xx${i.toString().padStart(2, '0')}`, ctx.cwd);
    await ctx.fs.writeFile(chunkPath, chunks[i]!.join('\n'));
  }
  return chunks.map(c => c.join('\n').length.toString()).join('\n') + '\n';
};

commands['printf'] = async (ctx) => {
  if (ctx.args.length === 0) return '';
  const format = ctx.args[0]!;
  const fmtArgs = ctx.args.slice(1);
  let result = format;
  let argIdx = 0;
  result = result.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
  result = result.replace(/%s/g, () => fmtArgs[argIdx++] || '');
  result = result.replace(/%d/g, () => String(parseInt(fmtArgs[argIdx++] || '0', 10)));
  result = result.replace(/%f/g, () => String(parseFloat(fmtArgs[argIdx++] || '0')));
  return result;
};

commands['printenv'] = async (ctx) => {
  if (ctx.args.length === 0) return Object.entries(ctx.env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  const val = ctx.env[ctx.args[0]!];
  return val !== undefined ? val + '\n' : '';
};

commands['ptx'] = async (ctx) => {
  const file = ctx.args.find(a => !a.startsWith('-'));
  let content: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `ptx: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return '';
  }
  const lines = content.split('\n').filter(Boolean);
  const result: string[] = [];
  for (const line of lines) {
    const words = line.split(/\s+/);
    for (const word of words) {
      result.push(`${word.padEnd(20)} ${line}`);
    }
  }
  return result.join('\n') + '\n';
};

commands['dircolors'] = async (ctx) => {
  if (ctx.args.includes('-p') || ctx.args.includes('--print-database')) {
    return '# Terminal color database\nTERM xterm-256color\n.txt 00;32\n.js  00;33\n.ts  00;36\n';
  }
  return "LS_COLORS='di=01;34:ln=01;36:ex=01;32:*.txt=00;32:*.js=00;33:*.ts=00;36';\nexport LS_COLORS\n";
};

// ============================================================================
// Math/Logic Commands
// ============================================================================

commands['factor'] = async (ctx) => {
  if (ctx.args.length === 0) return 'factor: missing operand\n';
  const results: string[] = [];
  for (const arg of ctx.args) {
    let n = parseInt(arg, 10);
    if (isNaN(n) || n < 1) { results.push(`factor: '${arg}' is not a valid positive integer\n`); continue; }
    const factors: number[] = [];
    for (let d = 2; d * d <= n; d++) { while (n % d === 0) { factors.push(d); n /= d; } }
    if (n > 1) factors.push(n);
    results.push(`${arg}: ${factors.join(' ')}\n`);
  }
  return results.join('');
};

commands['expr'] = async (ctx) => {
  if (ctx.args.length === 0) return '\n';
  if (ctx.args.length === 3) {
    const a = parseInt(ctx.args[0]!, 10);
    const op = ctx.args[1]!;
    const b = parseInt(ctx.args[2]!, 10);
    if (!isNaN(a) && !isNaN(b)) {
      switch (op) {
        case '+': return (a + b) + '\n';
        case '-': return (a - b) + '\n';
        case '*': return (a * b) + '\n';
        case '/': return b !== 0 ? Math.floor(a / b) + '\n' : 'expr: division by zero\n';
        case '%': return b !== 0 ? (a % b) + '\n' : 'expr: division by zero\n';
        case '<': return (a < b ? 1 : 0) + '\n';
        case '>': return (a > b ? 1 : 0) + '\n';
        case '=': return (a === b ? 1 : 0) + '\n';
        case '!=': return (a !== b ? 1 : 0) + '\n';
      }
    }
    if (op === ':' || op === 'match') {
      const str = ctx.args[0]!;
      const pattern = ctx.args[2]!;
      const match = str.match(new RegExp(pattern));
      return (match ? match[0] || '0' : '0') + '\n';
    }
  }
  if (ctx.args.length === 2 && ctx.args[0] === 'length') {
    return ctx.args[1]!.length + '\n';
  }
  return (ctx.args[0] || '0') + '\n';
};

commands['test'] = async (ctx) => {
  if (ctx.args.length === 0) throw new Error('');

  const checkFile = async (flag: string, path: string): Promise<boolean> => {
    const resolved = normalizePath(path, ctx.cwd);
    switch (flag) {
      case '-e': return ctx.fs.exists(resolved);
      case '-f': return ctx.fs.isFile(resolved);
      case '-d': return ctx.fs.isDirectory(resolved);
      case '-s': { try { const s = await ctx.fs.stat(resolved); return s.size > 0; } catch { return false; } }
      default: return false;
    }
  };

  if (ctx.args.length === 2 && ctx.args[0]!.startsWith('-')) {
    const flag = ctx.args[0]!;
    const value = ctx.args[1]!;
    if (['-e', '-f', '-d', '-s'].includes(flag)) {
      if (await checkFile(flag, value)) return '';
      throw new Error('');
    }
    if (flag === '-z') { if (value.length === 0) return ''; throw new Error(''); }
    if (flag === '-n') { if (value.length > 0) return ''; throw new Error(''); }
  }

  if (ctx.args.length === 3) {
    const [a, op, b] = ctx.args;
    const numA = parseInt(a!, 10);
    const numB = parseInt(b!, 10);
    let result = false;
    switch (op) {
      case '=': case '==': result = a === b; break;
      case '!=': result = a !== b; break;
      case '-eq': result = numA === numB; break;
      case '-ne': result = numA !== numB; break;
      case '-lt': result = numA < numB; break;
      case '-le': result = numA <= numB; break;
      case '-gt': result = numA > numB; break;
      case '-ge': result = numA >= numB; break;
    }
    if (result) return '';
    throw new Error('');
  }

  if (ctx.args[0]!.length > 0) return '';
  throw new Error('');
};

// ============================================================================
// Checksum and Hash Commands
// ============================================================================

async function webCryptoHash(algorithm: string, data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(algorithm, data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function makeHashCommand(cmdName: string, algorithm: string): CommandHandler {
  return async (ctx) => {
    const check = ctx.args.includes('-c') || ctx.args.includes('--check');
    const files = ctx.args.filter(a => !a.startsWith('-'));

    if (check && files.length > 0) {
      const path = normalizePath(files[0]!, ctx.cwd);
      let checkContent: string;
      try { checkContent = await ctx.fs.readFile(path); } catch { return `${cmdName}: ${files[0]}: No such file or directory\n`; }
      const lines = checkContent.split('\n').filter(Boolean);
      const results: string[] = [];
      for (const line of lines) {
        const [expectedHash, fname] = line.split(/\s+/);
        if (!expectedHash || !fname) continue;
        const cleanName = fname.replace(/^\*/, '');
        const fpath = normalizePath(cleanName, ctx.cwd);
        try {
          const content = await ctx.fs.readFile(fpath);
          const data = new TextEncoder().encode(content);
          const hash = await webCryptoHash(algorithm, data);
          results.push(`${cleanName}: ${hash === expectedHash ? 'OK' : 'FAILED'}\n`);
        } catch {
          results.push(`${cleanName}: FAILED open or read\n`);
        }
      }
      return results.join('');
    }

    if (files.length === 0 && ctx.stdin !== undefined) {
      const data = new TextEncoder().encode(ctx.stdin);
      try {
        const hash = await webCryptoHash(algorithm, data);
        return `${hash}  -\n`;
      } catch { return `${cmdName}: algorithm not supported\n`; }
    }

    if (files.length === 0) return `${cmdName}: missing file operand\n`;

    const results: string[] = [];
    for (const file of files) {
      const path = normalizePath(file, ctx.cwd);
      try {
        const content = await ctx.fs.readFile(path);
        const data = new TextEncoder().encode(content);
        const hash = await webCryptoHash(algorithm, data);
        results.push(`${hash}  ${file}\n`);
      } catch { results.push(`${cmdName}: ${file}: No such file or directory\n`); }
    }
    return results.join('');
  };
}

commands['sha1sum'] = makeHashCommand('sha1sum', 'SHA-1');
commands['sha256sum'] = makeHashCommand('sha256sum', 'SHA-256');
commands['sha384sum'] = makeHashCommand('sha384sum', 'SHA-384');
commands['sha512sum'] = makeHashCommand('sha512sum', 'SHA-512');

commands['sha224sum'] = async (ctx) => {
  const files = ctx.args.filter(a => !a.startsWith('-'));
  const getContent = async (): Promise<{ content: string; name: string }> => {
    if (files.length > 0) {
      const path = normalizePath(files[0]!, ctx.cwd);
      return { content: await ctx.fs.readFile(path), name: files[0]! };
    }
    if (ctx.stdin !== undefined) return { content: ctx.stdin, name: '-' };
    throw new Error('missing file operand');
  };
  try {
    const { content, name } = await getContent();
    const data = new TextEncoder().encode(content);
    const hash = await webCryptoHash('SHA-256', data);
    return `${hash.slice(0, 56)}  ${name}\n`;
  } catch (err) {
    return `sha224sum: ${err instanceof Error ? err.message : 'error'}\n`;
  }
};

commands['md5sum'] = async (ctx) => {
  return 'md5sum: MD5 is not supported in the browser Web Crypto API\n';
};

function makeUnsupportedHashCmd(name: string): CommandHandler {
  return async () => `${name}: SHA-3/SHAKE algorithms are not supported in the browser Web Crypto API\n`;
}

commands['sha3sum'] = makeUnsupportedHashCmd('sha3sum');
commands['sha3-224sum'] = makeUnsupportedHashCmd('sha3-224sum');
commands['sha3-256sum'] = makeUnsupportedHashCmd('sha3-256sum');
commands['sha3-384sum'] = makeUnsupportedHashCmd('sha3-384sum');
commands['sha3-512sum'] = makeUnsupportedHashCmd('sha3-512sum');
commands['shake128sum'] = makeUnsupportedHashCmd('shake128sum');
commands['shake256sum'] = makeUnsupportedHashCmd('shake256sum');

commands['hashsum'] = async (ctx) => {
  const algoIdx = ctx.args.indexOf('--algorithm');
  const algo = algoIdx !== -1 ? ctx.args[algoIdx + 1] : 'sha256';
  const restArgs = ctx.args.filter((a, i) => a !== '--algorithm' && i !== algoIdx + 1);
  const algoMap: Record<string, string> = {
    sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512',
  };
  const webAlgo = algoMap[algo || 'sha256'];
  if (!webAlgo) return `hashsum: unsupported algorithm '${algo}'\n`;
  const handler = makeHashCommand('hashsum', webAlgo);
  return handler({ ...ctx, args: restArgs });
};

commands['cksum'] = async (ctx) => {
  const file = ctx.args.find(a => !a.startsWith('-'));
  let content: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `cksum: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return 'cksum: missing operand\n';
  }
  const bytes = new TextEncoder().encode(content);
  let crc = 0xFFFFFFFF;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  let len = bytes.length;
  while (len > 0) {
    crc ^= (len & 0xFF);
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    len >>>= 8;
  }
  crc = (crc ^ 0xFFFFFFFF) >>> 0;
  return `${crc} ${bytes.length}${file ? ' ' + file : ''}\n`;
};

commands['sum'] = async (ctx) => {
  const sysv = ctx.args.includes('-s') || ctx.args.includes('--sysv');
  const file = ctx.args.find(a => !a.startsWith('-'));
  let content: string;
  if (file) {
    const path = normalizePath(file, ctx.cwd);
    try { content = await ctx.fs.readFile(path); } catch { return `sum: ${file}: No such file or directory\n`; }
  } else if (ctx.stdin !== undefined) {
    content = ctx.stdin;
  } else {
    return 'sum: missing operand\n';
  }
  const bytes = new TextEncoder().encode(content);
  if (sysv) {
    let s = 0;
    for (const b of bytes) s += b;
    s = (s & 0xFFFF) + ((s >> 16) & 0xFFFF);
    const blocks = Math.ceil(bytes.length / 512);
    return `${s} ${blocks}${file ? ' ' + file : ''}\n`;
  }
  let s = 0;
  for (const b of bytes) { s = ((s >> 1) + ((s & 1) << 15) + b) & 0xFFFF; }
  const blocks = Math.ceil(bytes.length / 1024);
  return `${s.toString().padStart(5, '0')} ${blocks.toString().padStart(5, ' ')}${file ? ' ' + file : ''}\n`;
};

// ============================================================================
// Stark Orchestrator CLI Command
// ============================================================================

// Plain-text formatting helpers that mirror packages/cli/src/output.ts
// No chalk in the browser — we emit plain Unicode symbols.

function statusBadge(status: string): string {
  const s = (status || '').toLowerCase();
  if (['running', 'healthy', 'active', 'ready'].includes(s)) return `● ${status}`;
  if (['pending', 'scheduling', 'starting'].includes(s)) return `◐ ${status}`;
  if (['failed', 'error', 'unhealthy', 'dead'].includes(s)) return `✗ ${status}`;
  if (['stopped', 'terminated', 'completed'].includes(s)) return `○ ${status}`;
  return `● ${status}`;
}

function relativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

function fmtTable<T extends Record<string, unknown>>(
  data: T[],
  columns?: Array<{ key: keyof T; header: string; width?: number }>,
): string {
  if (data.length === 0) return 'No data to display\n';
  const cols = columns ?? Object.keys(data[0]!).map((key) => ({
    key: key as keyof T,
    header: key.charAt(0).toUpperCase() + key.slice(1),
  }));
  const widths = cols.map((col) => {
    const hw = col.header.length;
    const mw = Math.max(...data.map((row) => String(row[col.key] ?? '').length));
    return col.width ?? Math.max(hw, mw, 4);
  });
  const lines: string[] = [];
  lines.push(cols.map((col, i) => col.header.padEnd(widths[i]!)).join('  '));
  lines.push(widths.map((w) => '─'.repeat(w)).join('──'));
  for (const row of data) {
    lines.push(cols.map((col, i) => String(row[col.key] ?? '').padEnd(widths[i]!)).join('  '));
  }
  return lines.join('\n') + '\n';
}

function fmtKeyValue(data: Record<string, unknown>): string {
  const maxKeyLen = Math.max(...Object.keys(data).map((k) => k.length));
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    const fv = value === null || value === undefined ? '(none)'
      : typeof value === 'object' ? JSON.stringify(value)
      : String(value);
    lines.push(`${key.padEnd(maxKeyLen)}  ${fv}`);
  }
  return lines.join('\n') + '\n';
}

commands['stark'] = async (ctx) => {
  const [subcmd, action, ...rest] = ctx.args;

  // Lazy import to avoid bundling browser-runtime at module load time
  const { createStarkAPI, resolveApiUrl, loadApiCredentials, clearApiCredentials, isApiAuthenticated, createBrowserAgent, getBrowserAccessToken } = await import('@stark-o/browser-runtime');

  const api = createStarkAPI();

  const parseOpts = (args: string[]) => {
    const positionals: string[] = [];
    const options: Record<string, string | boolean> = {};
    for (let i = 0; i < args.length; i++) {
      const a = args[i]!;
      if (a.startsWith('--')) {
        const key = a.slice(2);
        const next = args[i + 1];
        if (next && !next.startsWith('-')) { options[key] = next; i++; } else { options[key] = true; }
      } else if (a.startsWith('-') && a.length === 2) {
        const key = a.slice(1);
        const next = args[i + 1];
        if (next && !next.startsWith('-')) { options[key] = next; i++; } else { options[key] = true; }
      } else { positionals.push(a); }
    }
    return { positionals, options };
  };

  if (!subcmd || subcmd === 'help') {
    return 'Stark Orchestrator CLI\n\n' +
      'Commands:\n' +
      '  stark auth        Authentication (login, logout, whoami, status, setup, add-user)\n' +
      '  stark pack        Pack management (list, versions, info, delete)\n' +
      '  stark node        Node management (list, status, agent start)\n' +
      '  stark pod         Pod management (create, list, status, stop, rollback, history)\n' +
      '  stark service     Service management (create, list, status)\n' +
      '  stark namespace   Namespace management (create, list, get, delete, use, current)\n' +
      '  stark secret      Secret management (list, get)\n' +
      '  stark volume      Volume management (create, list, download, sync)\n' +
      '  stark chaos       Chaos testing (status, enable, disable, scenarios)\n' +
      '  stark network     Network management (policies, registry)\n' +
      '  stark config      Show/set CLI configuration\n' +
      '  stark status      Show cluster status\n' +
      '  stark help        Show this help\n';
  }

  try {
    switch (subcmd) {
      case 'auth': {
        const { positionals: _authPos, options } = parseOpts(rest);
        switch (action) {
          case 'login': {
            const creds = loadApiCredentials();
            if (creds && creds.expiresAt && new Date(creds.expiresAt) > new Date()) {
              if (ctx.prompt) {
                ctx.write(`Already logged in as ${creds.email}\n`);
                const proceed = await ctx.prompt('Do you want to log out and log in again? (y/N) ');
                if (proceed.toLowerCase() !== 'y') return '';
              }
              clearApiCredentials();
            }
            let email = options['email'] || options['e'];
            if (!email && ctx.prompt) email = await ctx.prompt('Email: ');
            if (!email) return 'Usage: stark auth login --email <email> --password <password>\n';
            let password = options['password'] || options['p'];
            if (!password && ctx.promptPassword) password = await ctx.promptPassword('Password: ');
            if (!password) return 'Password is required.\n';
            ctx.write('Authenticating...\n');
            const result = await api.auth.login(String(email), String(password));
            ctx.env['USER'] = result.user.email.split('@')[0];
            return `✓ Logged in as ${result.user.email}\n`;
          }
          case 'logout':
            api.auth.logout();
            ctx.env['USER'] = 'user';
            return '✓ Logged out.\n';
          case 'whoami': {
            const info = api.auth.whoami();
            if (!info) return 'Not authenticated.\n';
            return `Email: ${info.email}\nUser ID: ${info.userId}\n`;
          }
          case 'status': {
            const s = api.auth.status();
            return `Authenticated: ${s.authenticated ? 'Yes' : 'No'}\n${s.authenticated && s.email ? `Email: ${s.email}\nExpires: ${s.expiresAt}\n` : ''}`;
          }
          case 'setup': {
            ctx.write('Checking if setup is needed...\n');
            const statusResult = await api.auth.setupStatus();
            if (!statusResult.needsSetup) return 'Setup has already been completed.\nTo add new users, login as admin and use `stark auth add-user`.\n';
            ctx.write('No users exist. Setting up initial admin account.\n');
            let email = options['email'] || options['e'];
            if (!email && ctx.prompt) email = await ctx.prompt('Admin Email: ');
            if (!email || !String(email).includes('@')) return 'Invalid email address.\n';
            let password: string | undefined;
            if (ctx.promptPassword) password = await ctx.promptPassword('Password: ');
            if (!password) return 'Password is required.\n';
            if (password.length < 8) return 'Password must be at least 8 characters.\n';
            if (ctx.promptPassword) {
              const confirm = await ctx.promptPassword('Confirm Password: ');
              if (confirm !== password) return 'Passwords do not match.\n';
            }
            let displayName = '';
            if (ctx.prompt) displayName = await ctx.prompt('Display Name (optional): ');
            ctx.write('Creating admin account...\n');
            const setupResult = await api.auth.setup(String(email), password, displayName || undefined);
            ctx.env['USER'] = setupResult.user.email.split('@')[0];
            return `✓ Admin account created and logged in as ${setupResult.user.email}\n`;
          }
          case 'add-user': {
            if (!isApiAuthenticated()) return 'Not authenticated. Run `stark auth login` first.\n';
            let email = options['email'] || options['e'];
            if (!email && ctx.prompt) email = await ctx.prompt('New User Email: ');
            if (!email || !String(email).includes('@')) return 'Invalid email address.\n';
            let password: string | undefined;
            if (ctx.promptPassword) password = await ctx.promptPassword('Password for new user: ');
            if (!password) return 'Password is required.\n';
            if (password.length < 8) return 'Password must be at least 8 characters.\n';
            let displayName = '';
            if (ctx.prompt) displayName = await ctx.prompt('Display Name (optional): ');
            let roles: string[] = [];
            const roleOpt = options['role'] || options['r'];
            if (roleOpt && typeof roleOpt === 'string') {
              roles = roleOpt.split(',').map(r => r.trim()).filter(Boolean);
            }
            if (roles.length === 0 && ctx.prompt) {
              ctx.write('Available roles: admin, operator, developer, viewer\n');
              const rolesInput = await ctx.prompt('Roles (comma-separated, default: viewer): ');
              roles = rolesInput ? rolesInput.split(',').map(r => r.trim()).filter(Boolean) : ['viewer'];
            }
            if (roles.length === 0) roles = ['viewer'];
            ctx.write('Creating user...\n');
            const addResult = await api.auth.addUser(String(email), password, { displayName: displayName || undefined, roles });
            const newUser = addResult.user;
            return `✓ User created: ${newUser.email}\nUser ID: ${newUser.id}\nRoles: ${newUser.roles?.join(', ') ?? 'viewer'}\n`;
          }
          case 'list-users': case 'users': {
            if (!isApiAuthenticated()) return 'Not authenticated. Run `stark auth login` first.\n';
            const data = await api.auth.listUsers() as { users?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
            const users = Array.isArray(data) ? data : ((data as { users?: Array<Record<string, unknown>> }).users ?? []);
            if (users.length === 0) return 'ℹ No users found\n';
            return fmtTable(
              users.map((u: Record<string, unknown>) => ({
                email: String(u.email ?? ''),
                id: String(u.id ?? ''),
                roles: Array.isArray(u.roles) ? u.roles.join(', ') : String(u.roles ?? ''),
              })),
              [
                { key: 'email', header: 'Email', width: 30 },
                { key: 'id', header: 'User ID', width: 38 },
                { key: 'roles', header: 'Roles', width: 25 },
              ],
            );
          }
          default: return `Unknown auth subcommand: ${action}\nAvailable: login, logout, whoami, status, setup, add-user, list-users\n`;
        }
      }
      case 'pack': {
        const { positionals } = parseOpts(rest);
        switch (action) {
          case 'list': case 'ls': {
            const data = await api.pack.list() as { packs?: Array<Record<string, unknown>>; total?: number } | Array<Record<string, unknown>>;
            const packs = Array.isArray(data) ? data : (data.packs ?? []);
            const total = Array.isArray(data) ? packs.length : (data.total ?? packs.length);
            if (packs.length === 0) return 'ℹ No packs found\n';
            return `\nPacks (${packs.length} of ${total})\n\n` + fmtTable(
              packs.map((p: Record<string, unknown>) => ({
                name: String(p.name ?? ''),
                version: String(p.version ?? ''),
                runtime: String(p.runtimeTag ?? ''),
                description: truncate(String(p.description ?? ''), 30),
                created: p.createdAt ? relativeTime(String(p.createdAt)) : '',
              })),
              [
                { key: 'name', header: 'Name', width: 25 },
                { key: 'version', header: 'Version', width: 12 },
                { key: 'runtime', header: 'Runtime', width: 12 },
                { key: 'description', header: 'Description', width: 30 },
                { key: 'created', header: 'Created', width: 15 },
              ],
            );
          }
          case 'versions': {
            const n = positionals[0]; if (!n) return 'Usage: stark pack versions <name>\n';
            const data = await api.pack.versions(n) as { versions?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
            const versions = Array.isArray(data) ? data : (data.versions ?? []);
            if (versions.length === 0) return `ℹ No versions found for pack: ${n}\n`;
            return `\nVersions of ${n}\n\n` + fmtTable(
              versions.map((v: Record<string, unknown>, i: number) => ({
                version: String(v.version ?? ''),
                created: v.createdAt ? relativeTime(String(v.createdAt)) : '',
                latest: i === 0 ? '✓' : '',
              })),
              [
                { key: 'version', header: 'Version', width: 15 },
                { key: 'created', header: 'Created', width: 20 },
                { key: 'latest', header: 'Latest', width: 8 },
              ],
            );
          }
          case 'info': {
            const n = positionals[0]; if (!n) return 'Usage: stark pack info <name>\n';
            const pack = await api.pack.info(n) as Record<string, unknown>;
            return `\nPack: ${pack.name}\n\n` + fmtKeyValue({
              'ID': pack.id,
              'Name': pack.name,
              'Version': pack.version,
              'Runtime': pack.runtimeTag,
              'Description': pack.description ?? '(none)',
              'Owner ID': pack.ownerId,
              'Bundle Path': pack.bundlePath,
              'Created': pack.createdAt ? new Date(String(pack.createdAt)).toLocaleString() : '(none)',
              'Updated': pack.updatedAt ? new Date(String(pack.updatedAt)).toLocaleString() : '(none)',
            });
          }
          case 'delete': case 'rm': { const n = positionals[0]; if (!n) return 'Usage: stark pack delete <name>\n'; await api.pack.delete(n); return `✓ Pack deleted: ${n}\n`; }
          default: return `Unknown pack subcommand: ${action}\nAvailable: list, versions, info, delete\n`;
        }
      }
      case 'node': {
        const { positionals, options } = parseOpts(rest);
        switch (action) {
          case 'list': case 'ls': {
            const data = await api.node.list() as { nodes?: Array<Record<string, unknown>>; total?: number } | Array<Record<string, unknown>>;
            const nodes = Array.isArray(data) ? data : (data.nodes ?? []);
            const total = Array.isArray(data) ? nodes.length : (data.total ?? nodes.length);
            if (nodes.length === 0) return 'ℹ No nodes found\n';
            return `\nNodes (${nodes.length} of ${total})\n\n` + fmtTable(
              nodes.map((n: Record<string, unknown>) => {
                const alloc = (n.allocated ?? {}) as Record<string, number>;
                const cap = (n.allocatable ?? {}) as Record<string, number>;
                const mid = n.machineId ? String(n.machineId).slice(0, 8) : '—';
                return {
                  name: String(n.name ?? ''),
                  runtime: String(n.runtimeType ?? ''),
                  status: statusBadge(String(n.status ?? '')),
                  machine: mid,
                  cpu: cap.cpu ? `${alloc.cpu ?? 0}/${cap.cpu}` : '-',
                  memory: cap.memory ? `${alloc.memory ?? 0}/${cap.memory}` : '-',
                  pods: cap.pods ? `${alloc.pods ?? 0}/${cap.pods}` : '-',
                  heartbeat: n.lastHeartbeat ? relativeTime(String(n.lastHeartbeat)) : 'never',
                };
              }),
              [
                { key: 'name', header: 'Name', width: 25 },
                { key: 'runtime', header: 'Runtime', width: 10 },
                { key: 'status', header: 'Status', width: 15 },
                { key: 'machine', header: 'Machine', width: 10 },
                { key: 'cpu', header: 'CPU', width: 8 },
                { key: 'memory', header: 'Memory', width: 8 },
                { key: 'pods', header: 'Pods', width: 10 },
                { key: 'heartbeat', header: 'Last Seen', width: 15 },
              ],
            );
          }
          case 'status': case 'info': {
            const n = positionals[0]; if (!n) return 'Usage: stark node status <name>\n';
            const node = await api.node.status(n) as Record<string, unknown>;
            const alloc = (node.allocated ?? {}) as Record<string, number>;
            const cap = (node.allocatable ?? {}) as Record<string, number>;
            let out = `\nNode: ${node.name}\n\n`;
            out += 'General\n';
            out += fmtKeyValue({
              'ID': node.id,
              'Name': node.name,
              'Runtime': node.runtimeType,
              'Status': statusBadge(String(node.status ?? '')),
              'Machine ID': node.machineId ?? 'unknown',
              'Registered By': node.registeredBy,
              'Last Heartbeat': node.lastHeartbeat
                ? `${relativeTime(String(node.lastHeartbeat))} (${new Date(String(node.lastHeartbeat)).toLocaleString()})`
                : 'never',
            });
            out += '\nResources\n';
            out += fmtKeyValue({
              'CPU': `${alloc.cpu ?? 0}/${cap.cpu ?? 0}`,
              'Memory': `${formatBytes(alloc.memory ?? 0)}/${formatBytes(cap.memory ?? 0)}`,
              'Storage': `${formatBytes(alloc.storage ?? 0)}/${formatBytes(cap.storage ?? 0)}`,
              'Pods': `${alloc.pods ?? 0}/${cap.pods ?? 0}`,
            });
            const labels = (node.labels ?? {}) as Record<string, string>;
            if (Object.keys(labels).length > 0) {
              out += '\nLabels\n';
              for (const [key, value] of Object.entries(labels)) out += `  ${key}: ${value}\n`;
            }
            const taints = (node.taints ?? []) as Array<Record<string, string>>;
            if (taints.length > 0) {
              out += '\nTaints\n';
              for (const t of taints) out += `  ${t.key}${t.value ? '=' + t.value : ''}:${t.effect}\n`;
            }
            out += '\nTimestamps\n';
            out += fmtKeyValue({
              'Created': node.createdAt ? new Date(String(node.createdAt)).toLocaleString() : '(none)',
              'Updated': node.updatedAt ? new Date(String(node.updatedAt)).toLocaleString() : '(none)',
            });
            return out;
          }
          case 'agent': {
            const [agentSub, ...agentArgs] = rest;
            if (agentSub !== 'start') return 'Usage: stark node agent start [options]\n';
            const { options: agentOpts } = parseOpts(agentArgs);
            const agentName = String(agentOpts['name'] || agentOpts['n'] || `browser-${Date.now()}`);
            const agentUrl = String(agentOpts['url'] || agentOpts['u'] || 'wss://localhost:443/ws');
            let authToken = agentOpts['token'] ? String(agentOpts['token']) : undefined;
            if (!authToken) {
              const browserToken = getBrowserAccessToken();
              if (browserToken) authToken = browserToken;
            }
            if (!authToken) return '✗ Authentication required. Please provide a token or login first.\n';
            ctx.write(`ℹ Starting browser node agent: ${agentName}\n`);
            ctx.write(`Orchestrator: ${agentUrl}\n`);
            const agentConfig = {
              orchestratorUrl: agentUrl,
              authToken,
              nodeName: agentName,
              autoRegister: true,
              heartbeatInterval: agentOpts['heartbeat'] ? parseInt(String(agentOpts['heartbeat']), 10) * 1000 : 15000,
              debug: agentOpts['debug'] === true,
              persistState: true,
              resumeExisting: true,
            };
            const agent = createBrowserAgent(agentConfig);
            await agent.start();
            return '✓ Browser node agent started.\n';
          }
          default: return `Unknown node subcommand: ${action}\nAvailable: list, status, agent\n`;
        }
      }
      case 'pod': {
        const { positionals, options } = parseOpts(rest);
        switch (action) {
          case 'list': case 'ls': {
            const ns = options['namespace'] || options['n'];
            const st = options['status'] || options['s'];
            const data = await api.pod.list({
              namespace: ns ? String(ns) : undefined,
              status: st ? String(st) : undefined,
            }) as { pods?: Array<Record<string, unknown>>; total?: number } | Array<Record<string, unknown>>;
            const STALE_POD_THRESHOLD_MS = 5 * 60 * 1000;
            const allPods = Array.isArray(data) ? data : (data.pods ?? []);
            // Filter out pods that have been non-running for more than 5 minutes
            const pods = allPods.filter((p: Record<string, unknown>) => {
              const status = String(p.status ?? '');
              if (!['stopped', 'failed', 'evicted'].includes(status)) return true;
              if (!p.stoppedAt) return true;
              const stoppedTime = new Date(String(p.stoppedAt)).getTime();
              return Date.now() - stoppedTime < STALE_POD_THRESHOLD_MS;
            });
            const total = Array.isArray(data) ? pods.length : (data.total ?? pods.length);
            if (pods.length === 0) return 'ℹ No pods found\n';
            return `\nPods (${pods.length} of ${total})\n\n` + fmtTable(
              pods.map((p: Record<string, unknown>) => ({
                id: String(p.id ?? ''),
                pack: String(p.packId ?? ''),
                version: String(p.packVersion ?? ''),
                node: String(p.nodeId ?? 'pending'),
                status: statusBadge(String(p.status ?? '')),
                namespace: String(p.namespace ?? ''),
                age: p.createdAt ? relativeTime(String(p.createdAt)) : '',
              })),
              [
                { key: 'id', header: 'Pod ID', width: 38 },
                { key: 'pack', header: 'Pack', width: 38 },
                { key: 'version', header: 'Version', width: 12 },
                { key: 'node', header: 'Node', width: 38 },
                { key: 'status', header: 'Status', width: 15 },
                { key: 'namespace', header: 'Namespace', width: 12 },
                { key: 'age', header: 'Age', width: 12 },
              ],
            );
          }
          case 'status': {
            const id = positionals[0]; if (!id) return 'Usage: stark pod status <podId>\n';
            const pod = await api.pod.status(id) as Record<string, unknown>;
            let out = `\nPod: ${pod.id}\n\n`;
            out += fmtKeyValue({
              'Status': statusBadge(String(pod.status ?? '')),
              'Message': pod.statusMessage ?? '(none)',
              'Pack ID': pod.packId,
              'Pack Version': pod.packVersion,
              'Node ID': pod.nodeId ?? '(not scheduled)',
              'Namespace': pod.namespace,
              'Priority': pod.priority,
              'Created By': pod.createdBy,
              'Created': pod.createdAt ? new Date(String(pod.createdAt)).toLocaleString() : '(none)',
              'Started': pod.startedAt ? new Date(String(pod.startedAt)).toLocaleString() : '(not started)',
              'Stopped': pod.stoppedAt ? new Date(String(pod.stoppedAt)).toLocaleString() : '(running)',
            });
            const labels = (pod.labels ?? {}) as Record<string, string>;
            if (Object.keys(labels).length > 0) {
              out += '\nLabels\n';
              for (const [key, value] of Object.entries(labels)) out += `  ${key}: ${value}\n`;
            }
            return out + '\n';
          }
          case 'create': case 'run': {
            const pack = positionals[0] || options['pack'];
            if (!pack) return 'Usage: stark pod create <pack> [options]\n';
            const result = await api.pod.create(String(pack), {
              namespace: String(options['namespace'] || options['n'] || 'default'),
            }) as { pod?: Record<string, unknown> } | Record<string, unknown>;
            const pod = (result as { pod?: Record<string, unknown> }).pod ?? result as Record<string, unknown>;
            let out = `✓ Deployed 1 pod(s)\n\n`;
            out += fmtTable(
              [{
                id: String(pod.id ?? ''),
                pack: String(pack),
                version: String(pod.packVersion ?? ''),
                node: String(pod.nodeId ?? 'pending'),
                status: statusBadge(String(pod.status ?? '')),
                namespace: String(pod.namespace ?? ''),
              }],
              [
                { key: 'id', header: 'Pod ID', width: 38 },
                { key: 'pack', header: 'Pack', width: 20 },
                { key: 'version', header: 'Version', width: 12 },
                { key: 'node', header: 'Node', width: 38 },
                { key: 'status', header: 'Status', width: 15 },
                { key: 'namespace', header: 'Namespace', width: 15 },
              ],
            );
            out += `\nℹ Use 'stark pod status <pod-id>' to check service status\n`;
            return out;
          }
          case 'stop': {
            const id = positionals[0]; if (!id) return 'Usage: stark pod stop <podId>\n';
            await api.pod.stop(id);
            return `✓ Pod ${id} stopped\n`;
          }
          case 'rollback': {
            const id = positionals[0]; if (!id) return 'Usage: stark pod rollback <podId>\n';
            const pod = await api.pod.rollback(id) as Record<string, unknown>;
            return `✓ Rolled back to version ${pod.packVersion ?? 'unknown'}\n` +
              fmtKeyValue({ 'Pod ID': pod.id, 'New Version': pod.packVersion, 'Status': statusBadge(String(pod.status ?? '')) });
          }
          case 'history': {
            const id = positionals[0]; if (!id) return 'Usage: stark pod history <podId>\n';
            const data = await api.pod.history(id) as { history?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
            const history = Array.isArray(data) ? data : (data.history ?? []);
            if (history.length === 0) return 'ℹ No history entries found\n';
            return `\nPod History: ${id}\n\n` + fmtTable(
              history.map((h: Record<string, unknown>) => ({
                action: String(h.action ?? ''),
                status: `${h.previousStatus ?? '-'} → ${h.newStatus ?? '-'}`,
                version: String(h.newVersion ?? h.previousVersion ?? '-'),
                reason: String(h.reason ?? '-'),
                when: h.createdAt ? relativeTime(String(h.createdAt)) : '',
              })),
              [
                { key: 'action', header: 'Action', width: 15 },
                { key: 'status', header: 'Status Change', width: 25 },
                { key: 'version', header: 'Version', width: 12 },
                { key: 'reason', header: 'Reason', width: 20 },
                { key: 'when', header: 'When', width: 15 },
              ],
            );
          }
          default: return `Unknown pod subcommand: ${action}\nAvailable: create, list, status, stop, rollback, history\n`;
        }
      }
      case 'service': {
        const { positionals, options } = parseOpts(rest);
        switch (action) {
          case 'list': case 'ls': {
            const ns = options['namespace'] || options['n'];
            const data = await api.service.list({ namespace: ns ? String(ns) : undefined }) as { services?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
            const services = Array.isArray(data) ? data : (data.services ?? []);
            if (services.length === 0) return 'ℹ No services found\n';
            return `\nServices (${services.length})\n\n` + fmtTable(
              services.map((d: Record<string, unknown>) => ({
                name: String(d.name ?? ''),
                pack: String(d.packVersion ?? ''),
                replicas: d.replicas === 0 ? 'DaemonSet' : `${d.readyReplicas ?? 0}/${d.replicas}`,
                status: statusBadge(String(d.status ?? '')),
                namespace: String(d.namespace ?? ''),
              })),
              [
                { key: 'name', header: 'Name', width: 25 },
                { key: 'pack', header: 'Version', width: 15 },
                { key: 'replicas', header: 'Ready', width: 12 },
                { key: 'status', header: 'Status', width: 12 },
                { key: 'namespace', header: 'Namespace', width: 15 },
              ],
            );
          }
          case 'status': {
            const n = positionals[0]; if (!n) return 'Usage: stark service status <name>\n';
            const svc = await api.service.status(n) as Record<string, unknown>;
            const replicaDisplay = svc.replicas === 0 ? 'DaemonSet (all nodes)' : String(svc.replicas);
            return `\nService: ${svc.name}\n\n` + fmtKeyValue({
              'ID': svc.id,
              'Status': statusBadge(String(svc.status ?? '')),
              'Message': svc.statusMessage ?? '(none)',
              'Pack ID': svc.packId,
              'Pack Version': svc.packVersion,
              'Namespace': svc.namespace,
              'Replicas': replicaDisplay,
              'Ready': `${svc.readyReplicas ?? 0}/${svc.replicas === 0 ? 'N/A' : svc.replicas}`,
              'Available': svc.availableReplicas,
              'Updated': svc.updatedReplicas,
              'Created': svc.createdAt ? new Date(String(svc.createdAt)).toLocaleString() : '(none)',
              'Updated At': svc.updatedAt ? new Date(String(svc.updatedAt)).toLocaleString() : '(none)',
            });
          }
          case 'create': {
            const pack = positionals[0] || options['pack'];
            if (!pack) return 'Usage: stark service create <pack> [options]\n';
            const svc = await api.service.create(String(pack), {
              namespace: String(options['namespace'] || 'default'),
              replicas: parseInt(String(options['replicas'] || '1'), 10),
            }) as { service?: Record<string, unknown> } | Record<string, unknown>;
            const service = (svc as { service?: Record<string, unknown> }).service ?? svc as Record<string, unknown>;
            let out = `✓ Service '${service.name ?? pack}' created\n\n`;
            out += fmtKeyValue({
              'ID': service.id,
              'Name': service.name,
              'Pack Version': service.packVersion,
              'Namespace': service.namespace,
              'Replicas': service.replicas === 0 ? 'DaemonSet (all nodes)' : String(service.replicas),
              'Status': statusBadge(String(service.status ?? '')),
            });
            out += `\nℹ The service controller will create pods automatically.\n`;
            out += `ℹ Use 'stark service status ${service.name ?? pack}' to check progress.\n`;
            return out;
          }
          default: return `Unknown service subcommand: ${action}\nAvailable: create, list, status\n`;
        }
      }
      case 'namespace': case 'ns': {
        const { positionals } = parseOpts(rest);
        switch (action) {
          case 'list': case 'ls': {
            const data = await api.namespace.list() as { namespaces?: Array<Record<string, unknown>>; total?: number } | Array<Record<string, unknown>>;
            const namespaces = Array.isArray(data) ? data : (data.namespaces ?? []);
            const total = Array.isArray(data) ? namespaces.length : (data.total ?? namespaces.length);
            if (namespaces.length === 0) return 'ℹ No namespaces found\n';
            return `\nNamespaces (${namespaces.length} of ${total})\n\n` + fmtTable(
              namespaces.map((ns: Record<string, unknown>) => ({
                name: String(ns.name ?? ''),
                phase: statusBadge(String(ns.phase ?? '')),
                maxPods: (ns.resourceQuota as Record<string, unknown>)?.maxPods ?? '∞',
                maxMemory: (ns.resourceQuota as Record<string, unknown>)?.maxMemory
                  ? formatBytes(Number((ns.resourceQuota as Record<string, unknown>).maxMemory)) : '∞',
                age: ns.createdAt ? relativeTime(String(ns.createdAt)) : '',
              })),
              [
                { key: 'name', header: 'Name', width: 25 },
                { key: 'phase', header: 'Phase', width: 15 },
                { key: 'maxPods', header: 'Max Pods', width: 12 },
                { key: 'maxMemory', header: 'Max Memory', width: 12 },
                { key: 'age', header: 'Age', width: 15 },
              ],
            );
          }
          case 'get': {
            const n = positionals[0]; if (!n) return 'Usage: stark namespace get <name>\n';
            const ns = await api.namespace.get(n) as Record<string, unknown>;
            let out = `\nNamespace: ${ns.name}\n\n`;
            out += 'General\n';
            out += fmtKeyValue({
              'ID': ns.id,
              'Name': ns.name,
              'Phase': statusBadge(String(ns.phase ?? '')),
              'Created By': ns.createdBy,
              'Created': ns.createdAt ? new Date(String(ns.createdAt)).toLocaleString() : '(none)',
              'Updated': ns.updatedAt ? new Date(String(ns.updatedAt)).toLocaleString() : '(none)',
            });
            const rq = ns.resourceQuota as Record<string, unknown> | undefined;
            if (rq) {
              out += '\nResource Quota\n';
              out += fmtKeyValue({
                'Max Pods': rq.maxPods ?? 'unlimited',
                'Max CPU': rq.maxCpu ?? 'unlimited',
                'Max Memory': rq.maxMemory ? formatBytes(Number(rq.maxMemory)) : 'unlimited',
                'Max Storage': rq.maxStorage ? formatBytes(Number(rq.maxStorage)) : 'unlimited',
              });
            }
            const labels = (ns.labels ?? {}) as Record<string, string>;
            if (Object.keys(labels).length > 0) {
              out += '\nLabels\n';
              for (const [key, value] of Object.entries(labels)) out += `  ${key}: ${value}\n`;
            }
            return out;
          }
          case 'create': {
            const n = positionals[0]; if (!n) return 'Usage: stark namespace create <name>\n';
            const ns = await api.namespace.create(n) as Record<string, unknown>;
            return `✓ Namespace created: ${ns.name ?? n}\n` + fmtKeyValue({
              'ID': ns.id,
              'Name': ns.name,
              'Phase': statusBadge(String(ns.phase ?? '')),
              'Created': ns.createdAt ? new Date(String(ns.createdAt)).toLocaleString() : '(none)',
            });
          }
          case 'delete': case 'rm': { const n = positionals[0]; if (!n) return 'Usage: stark namespace delete <name>\n'; await api.namespace.delete(n); return `✓ Namespace deleted: ${n}\n`; }
          case 'current': return `ℹ Current namespace: ${api.namespace.current()}\n`;
          case 'use': {
            const n = positionals[0]; if (!n) return 'Usage: stark namespace use <name>\n';
            api.namespace.use(n);
            return `✓ Default namespace set to: ${n}\n`;
          }
          default: return `Unknown namespace subcommand: ${action}\nAvailable: create, list, get, delete, current, use\n`;
        }
      }
      case 'secret': {
        const { positionals, options } = parseOpts(rest);
        switch (action) {
          case 'list': case 'ls': {
            const ns = options['namespace'] || options['n'];
            const data = await api.secret.list({ namespace: ns ? String(ns) : undefined }) as { secrets?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
            const secrets = Array.isArray(data) ? data : (data.secrets ?? []);
            if (secrets.length === 0) return 'ℹ No secrets found\n';
            return `\nSecrets (${secrets.length})\n\n` + fmtTable(
              secrets.map((s: Record<string, unknown>) => ({
                name: String(s.name ?? ''),
                type: String(s.type ?? ''),
                keys: String(s.keyCount ?? 0),
                version: `v${s.version ?? 0}`,
                namespace: String(s.namespace ?? ''),
              })),
              [
                { key: 'name', header: 'Name', width: 25 },
                { key: 'type', header: 'Type', width: 18 },
                { key: 'keys', header: 'Keys', width: 6 },
                { key: 'version', header: 'Ver', width: 6 },
                { key: 'namespace', header: 'Namespace', width: 15 },
              ],
            );
          }
          case 'get': {
            const n = positionals[0]; if (!n) return 'Usage: stark secret get <name>\n';
            const ns = String(options['namespace'] || options['n'] || 'default');
            const secret = await api.secret.get(n, ns) as Record<string, unknown>;
            let out = `\nSecret: ${secret.name}\n\n`;
            out += fmtKeyValue({
              'ID': secret.id,
              'Name': secret.name,
              'Type': secret.type,
              'Namespace': secret.namespace,
              'Keys': secret.keyCount,
              'Version': secret.version,
              'Created By': secret.createdBy,
              'Created': secret.createdAt ? new Date(String(secret.createdAt)).toLocaleString() : '(none)',
              'Updated': secret.updatedAt ? new Date(String(secret.updatedAt)).toLocaleString() : '(none)',
            });
            out += '\n⚠ Secret values are encrypted and never displayed.\n';
            return out;
          }
          default: return `Unknown secret subcommand: ${action}\nAvailable: list, get\n`;
        }
      }
      case 'volume': {
        const { positionals, options } = parseOpts(rest);
        switch (action) {
          case 'list': case 'ls': {
            const node = options['node'] || options['n'];
            const data = await api.volume.list({ nodeNameOrId: node ? String(node) : undefined }) as { volumes?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
            const volumes = Array.isArray(data) ? data : (data.volumes ?? []);
            if (volumes.length === 0) return 'ℹ No volumes found\n';
            return `\nVolumes (${volumes.length})\n\n` + fmtTable(
              volumes.map((v: Record<string, unknown>) => ({
                name: String(v.name ?? ''),
                node: String(v.nodeId ?? ''),
                age: v.createdAt ? relativeTime(String(v.createdAt)) : '',
              })),
              [
                { key: 'name', header: 'Name', width: 25 },
                { key: 'node', header: 'Node', width: 40 },
                { key: 'age', header: 'Age', width: 15 },
              ],
            );
          }
          case 'create': {
            const n = positionals[0] || options['name'];
            const node = options['node'] || options['n'];
            if (!n || !node) return 'Usage: stark volume create <name> --node <nodeNameOrId>\n';
            const vol = await api.volume.create(String(n), String(node)) as Record<string, unknown>;
            return `✓ Volume '${vol.name ?? n}' created\n\n` + fmtKeyValue({
              'ID': vol.id,
              'Name': vol.name,
              'Node': vol.nodeId,
              'Created': vol.createdAt ? new Date(String(vol.createdAt)).toLocaleString() : '(none)',
            });
          }
          case 'download': {
            const n = positionals[0] || options['name'];
            const node = options['node'] || options['n'];
            if (!n || !node) return 'Usage: stark volume download <name> --node <nodeNameOrId>\n';
            ctx.write(`ℹ Downloading volume '${n}' from node ${node}\n`);
            const zipData = await api.volume.downloadAsZip(String(n), String(node));
            // Save the zip to OPFS
            const outFile = String(options['O'] || options['out-file'] || `/tmp/${n}.zip`);
            const outPath = normalizePath(outFile, ctx.cwd);
            // Ensure parent dir exists
            const parentDir = outPath.substring(0, outPath.lastIndexOf('/'));
            if (parentDir) try { await ctx.fs.mkdir(parentDir, true); } catch { /* ok */ }
            await ctx.fs.writeFile(outPath, zipData);
            return `✓ Volume '${n}' downloaded to ${outPath} (${zipData.byteLength} bytes)\n`;
          }
          case 'sync': {
            ctx.write('Fetching volumes from orchestrator...\n');
            const volData = await api.volume.list() as Array<Record<string, unknown>> | undefined;
            if (!volData || !Array.isArray(volData) || volData.length === 0) return 'No volumes found.\n';
            let synced = 0;
            for (const vol of volData) {
              const name = vol.name as string;
              if (name) {
                try { await ctx.fs.mkdir(`/volumes/${name}`, true); synced++; } catch { /* dir may exist */ }
              }
            }
            return `✓ Synced ${synced} volume directories into /volumes/.\n`;
          }
          default: return `Unknown volume subcommand: ${action}\nAvailable: list, create, download, sync\n`;
        }
      }
      case 'chaos': {
        switch (action) {
          case 'status': {
            const status = await api.chaos.status() as Record<string, unknown>;
            let out = '\n🔥 Chaos Status\n\n';
            out += fmtKeyValue({
              'Enabled': status.enabled ? 'Yes' : 'No',
              'Current Scenario': status.currentScenario || 'None',
              'Run Count': String(status.runCount ?? 0),
            });
            const stats = status.stats as Record<string, unknown> | undefined;
            if (stats) {
              out += '\n📊 Statistics\n\n';
              out += fmtKeyValue({
                'Messages Processed': String(stats.messagesProcessed ?? 0),
                'Messages Dropped': String(stats.messagesDropped ?? 0),
                'Latency Injections': String(stats.latencyInjected ?? 0),
                'Connections Paused': String(stats.connectionsPaused ?? 0),
                'Active Partitions': String(stats.partitionsActive ?? 0),
              });
            }
            return out;
          }
          case 'enable': { await api.chaos.enable(); return '✓ Chaos mode enabled\n⚠ Chaos testing can disrupt service. Use with caution.\n'; }
          case 'disable': { await api.chaos.disable(); return '✓ Chaos mode disabled\n'; }
          case 'scenarios': {
            const scenarios = await api.chaos.scenarios() as Array<Record<string, unknown>>;
            if (!Array.isArray(scenarios) || scenarios.length === 0) return 'ℹ No scenarios available\n';
            let out = '\n🎭 Available Chaos Scenarios\n\n';
            for (const scenario of scenarios) {
              out += `  ${scenario.id}\n`;
              out += `    ${scenario.description}\n`;
              const opts = scenario.options as Record<string, Record<string, unknown>> | undefined;
              if (opts && Object.keys(opts).length > 0) {
                out += '    Options:\n';
                for (const [key, opt] of Object.entries(opts)) {
                  out += `      --${key}: ${opt.description} (default: ${opt.default})\n`;
                }
              }
              out += '\n';
            }
            return out;
          }
          case 'connections': {
            const result = await api.chaos.connections() as { count?: number; connections?: Array<Record<string, unknown>> };
            const conns = result.connections ?? [];
            if (conns.length === 0) return 'ℹ No active connections\n';
            return `\n🔌 Active Connections (${result.count ?? conns.length})\n\n` + fmtTable(
              conns.map((c: Record<string, unknown>) => ({
                ID: String(c.id ?? '').slice(0, 12) + '...',
                Nodes: Array.isArray(c.nodeIds) ? c.nodeIds.join(', ') : '-',
                User: String(c.userId || '-'),
                IP: String(c.ipAddress || '-'),
                Auth: c.isAuthenticated ? '✓' : '✗',
                Connected: c.connectedAt ? relativeTime(String(c.connectedAt)) : '',
              })),
            );
          }
          case 'nodes': {
            const result = await api.chaos.nodes() as { count?: number; nodes?: Array<Record<string, unknown>> };
            const nodes = result.nodes ?? [];
            if (nodes.length === 0) return 'ℹ No nodes connected\n';
            return `\n🖥️  Connected Nodes (${result.count ?? nodes.length})\n\n` + fmtTable(
              nodes.map((n: Record<string, unknown>) => ({
                'Node ID': String(n.nodeId ?? ''),
                'Connection ID': String(n.connectionId ?? '').slice(0, 12) + '...',
                User: String(n.userId || '-'),
                Connected: n.connectedAt ? relativeTime(String(n.connectedAt)) : '',
              })),
            );
          }
          case 'events': return JSON.stringify(await api.chaos.events(), null, 2) + '\n';
          case 'reset': { await api.chaos.reset(); return '✓ Chaos state reset\n'; }
          default: return `Unknown chaos subcommand: ${action}\nAvailable: status, enable, disable, scenarios, connections, nodes, events, reset\n`;
        }
      }
      case 'network': {
        switch (action) {
          case 'policies': case 'list': {
            const data = await api.network.policies() as Record<string, unknown>;
            return JSON.stringify(data, null, 2) + '\n';
          }
          case 'registry': {
            const data = await api.network.registry() as Record<string, unknown>;
            return JSON.stringify(data, null, 2) + '\n';
          }
          default: return `Unknown network subcommand: ${action}\nAvailable: policies, registry\n`;
        }
      }
      case 'server-config': {
        switch (action) {
          case 'get': {
            const data = await api.serverConfig.get() as Record<string, unknown>;
            return JSON.stringify(data, null, 2) + '\n';
          }
          default: return `Unknown server-config subcommand: ${action}\nAvailable: get\n`;
        }
      }
      case 'config': {
        const { positionals: cfgPos } = parseOpts(rest);
        if (action === 'set') {
          const key = cfgPos[0] || rest[0];
          const value = cfgPos[1] || rest[1];
          if (!key || !value) {
            const allowedKeys = ['apiUrl', 'supabaseUrl', 'supabaseAnonKey', 'defaultNamespace'];
            return `Usage: stark config set <key> <value>\n  Keys: ${allowedKeys.join(', ')}\n`;
          }
          api.config.set(String(key), String(value));
          return `✓ Config ${key} set to ${value}\n`;
        }
        return JSON.stringify(api.config.get(), null, 2) + '\n';
      }
      case 'status': {
        const s = api.auth.status();
        const apiUrl = resolveApiUrl();
        return `Authenticated: ${s.authenticated ? 'Yes' : 'No'}\nAPI: ${apiUrl}\n`;
      }
      default:
        return `Unknown command: ${subcmd}\nRun 'stark help' for available commands.\n`;
    }
  } catch (err) {
    return `stark: ${err instanceof Error ? err.message : 'Network error — is the orchestrator running?'}\n`;
  }
};
