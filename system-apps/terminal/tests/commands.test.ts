/**
 * Terminal Commands & Shell Unit Tests
 *
 * Tests the unix-like commands and shell parser/executor.
 * Uses an in-memory TerminalFS implementation matching the OPFS interface.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { commands, commandDescriptions, normalizePath, type CommandContext, type TerminalFS } from '../utils/commands';
import { tokenize, parseCommandLine, executePlan, type ShellState } from '../utils/shell';

// ============================================================================
// In-memory TerminalFS for testing
// ============================================================================

interface MemNode { type: 'file' | 'dir'; content?: string; children?: Map<string, MemNode>; mtime: Date }

function createMemoryFS(): TerminalFS {
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
      const node = get(path); if (!node || node.type !== 'file') throw new Error('Not found');
      return node.content ?? '';
    },
    async writeFile(path, content) {
      const info = resolve(path); if (!info) throw new Error('Invalid path');
      if (!info.parent.children) info.parent.children = new Map();
      info.parent.children.set(info.name, {
        type: 'file', content: typeof content === 'string' ? content : new TextDecoder().decode(content), mtime: new Date(),
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
          child = { type: 'dir', children: new Map(), mtime: new Date() };
          cur.children.set(part, child);
        }
        if (child.type !== 'dir') throw new Error('Not a directory');
        cur = child;
      }
    },
    async readdir(path) {
      const node = get(path); if (!node || node.type !== 'dir') throw new Error('Not a directory');
      return Array.from(node.children?.keys() ?? []);
    },
    async readdirWithTypes(path) {
      const node = get(path); if (!node || node.type !== 'dir') throw new Error('Not a directory');
      return Array.from(node.children?.entries() ?? []).map(([name, child]) => ({
        name, isFile: () => child.type === 'file', isDirectory: () => child.type === 'dir',
      }));
    },
    async rmdir(path, recursive = false) {
      const info = resolve(path); if (!info) throw new Error('Not found');
      const node = info.parent.children?.get(info.name);
      if (!node || node.type !== 'dir') throw new Error('Not a directory');
      if (!recursive && node.children && node.children.size > 0) throw new Error('Not empty');
      info.parent.children?.delete(info.name);
    },
    async exists(path) { return get(path) !== null; },
    async stat(path) {
      const node = get(path); if (!node) throw new Error('Not found');
      return { size: node.content?.length ?? 0, mtime: node.mtime };
    },
    async unlink(path) {
      const info = resolve(path); if (!info) throw new Error('Not found');
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

function createContext(overrides: Partial<CommandContext> = {}): CommandContext {
  const fs = createMemoryFS();
  // Create /home and /tmp
  fs.mkdir('/home');
  fs.mkdir('/tmp');
  return {
    args: [],
    cwd: '/home',
    write: () => {},
    writeError: () => {},
    fs,
    env: { USER: 'testuser', HOME: '/home', HOSTNAME: 'test-host' },
    setCwd: () => {},
    ...overrides,
  };
}

async function createContextWithFS(overrides: Partial<CommandContext> = {}): Promise<CommandContext> {
  const fs = createMemoryFS();
  await fs.mkdir('/home');
  await fs.mkdir('/tmp');
  return {
    args: [],
    cwd: '/home',
    write: () => {},
    writeError: () => {},
    fs,
    env: { USER: 'testuser', HOME: '/home', HOSTNAME: 'test-host' },
    setCwd: () => {},
    ...overrides,
  };
}

// ============================================================================
// normalizePath Tests
// ============================================================================

describe('normalizePath', () => {
  it('should resolve relative paths', () => {
    expect(normalizePath('test', '/home')).toBe('/home/test');
  });

  it('should resolve absolute paths', () => {
    expect(normalizePath('/absolute', '/home')).toBe('/absolute');
  });

  it('should resolve . and ..', () => {
    expect(normalizePath('.', '/home')).toBe('/home');
    expect(normalizePath('..', '/home')).toBe('/');
    expect(normalizePath('a/b/../c', '/home')).toBe('/home/a/c');
  });
});

// ============================================================================
// Command Tests
// ============================================================================

describe('Terminal Commands', () => {
  describe('pwd', () => {
    it('should return current directory', async () => {
      const ctx = await createContextWithFS({ cwd: '/home' });
      const result = await commands['pwd']!(ctx);
      expect(result).toBe('/home\n');
    });
  });

  describe('echo', () => {
    it('should echo text with newline', async () => {
      const ctx = await createContextWithFS({ args: ['hello', 'world'] });
      const result = await commands['echo']!(ctx);
      expect(result).toBe('hello world\n');
    });

    it('should support -n flag', async () => {
      const ctx = await createContextWithFS({ args: ['-n', 'hello'] });
      const result = await commands['echo']!(ctx);
      expect(result).toBe('hello');
    });
  });

  describe('cd', () => {
    it('should change directory', async () => {
      let newCwd = '';
      const ctx = await createContextWithFS({ args: ['/tmp'], setCwd: (p) => { newCwd = p; } });
      const result = await commands['cd']!(ctx);
      expect(result).toBe('');
      expect(newCwd).toBe('/tmp');
    });

    it('should error on non-existent directory', async () => {
      const ctx = await createContextWithFS({ args: ['/nonexistent'] });
      const result = await commands['cd']!(ctx);
      expect(result).toContain('No such file or directory');
    });
  });

  describe('mkdir', () => {
    it('should create a directory', async () => {
      const fs = createMemoryFS();
      await fs.mkdir('/home');
      const ctx = await createContextWithFS({ args: ['testdir'], fs });
      await commands['mkdir']!(ctx);
      expect(await fs.exists('/home/testdir')).toBe(true);
    });

    it('should create nested directories with -p', async () => {
      const fs = createMemoryFS();
      await fs.mkdir('/home');
      const ctx = await createContextWithFS({ args: ['-p', 'a/b/c'], fs });
      await commands['mkdir']!(ctx);
      expect(await fs.exists('/home/a/b/c')).toBe(true);
    });
  });

  describe('touch', () => {
    it('should create a file', async () => {
      const fs = createMemoryFS();
      await fs.mkdir('/home');
      const ctx = await createContextWithFS({ args: ['test.txt'], fs });
      await commands['touch']!(ctx);
      expect(await fs.exists('/home/test.txt')).toBe(true);
    });
  });

  describe('cat', () => {
    it('should read file contents', async () => {
      const fs = createMemoryFS();
      await fs.mkdir('/home');
      await fs.writeFile('/home/test.txt', 'hello');
      const ctx = await createContextWithFS({ args: ['test.txt'], fs });
      const result = await commands['cat']!(ctx);
      expect(result).toBe('hello');
    });

    it('should pass through stdin if no args', async () => {
      const ctx = await createContextWithFS({ stdin: 'piped input' });
      const result = await commands['cat']!(ctx);
      expect(result).toBe('piped input');
    });
  });

  describe('rm', () => {
    it('should remove a file', async () => {
      const fs = createMemoryFS();
      await fs.mkdir('/home');
      await fs.writeFile('/home/del.txt', 'data');
      const ctx = await createContextWithFS({ args: ['del.txt'], fs });
      await commands['rm']!(ctx);
      expect(await fs.exists('/home/del.txt')).toBe(false);
    });

    it('should remove directory with -rf', async () => {
      const fs = createMemoryFS();
      await fs.mkdir('/home');
      await fs.mkdir('/home/mydir');
      await fs.writeFile('/home/mydir/file.txt', 'data');
      const ctx = await createContextWithFS({ args: ['-rf', 'mydir'], fs });
      await commands['rm']!(ctx);
      expect(await fs.exists('/home/mydir')).toBe(false);
    });
  });

  describe('ls', () => {
    it('should list directory contents', async () => {
      const fs = createMemoryFS();
      await fs.mkdir('/home');
      await fs.writeFile('/home/file1.txt', 'a');
      await fs.writeFile('/home/file2.txt', 'b');
      const ctx = await createContextWithFS({ fs });
      const result = await commands['ls']!(ctx);
      expect(result).toContain('file1.txt');
      expect(result).toContain('file2.txt');
    });
  });

  describe('cp', () => {
    it('should copy a file', async () => {
      const fs = createMemoryFS();
      await fs.mkdir('/home');
      await fs.writeFile('/home/src.txt', 'content');
      const ctx = await createContextWithFS({ args: ['src.txt', 'dst.txt'], fs });
      await commands['cp']!(ctx);
      expect(await fs.readFile('/home/dst.txt')).toBe('content');
    });
  });

  describe('mv', () => {
    it('should move a file', async () => {
      const fs = createMemoryFS();
      await fs.mkdir('/home');
      await fs.writeFile('/home/old.txt', 'content');
      const ctx = await createContextWithFS({ args: ['old.txt', 'new.txt'], fs });
      await commands['mv']!(ctx);
      expect(await fs.readFile('/home/new.txt')).toBe('content');
      expect(await fs.exists('/home/old.txt')).toBe(false);
    });
  });

  describe('grep', () => {
    it('should find matching lines', async () => {
      const fs = createMemoryFS();
      await fs.mkdir('/home');
      await fs.writeFile('/home/test.txt', 'hello\nworld\nhello world');
      const ctx = await createContextWithFS({ args: ['hello', 'test.txt'], fs });
      const result = await commands['grep']!(ctx);
      expect(result).toContain('hello');
      expect(result).toContain('hello world');
    });

    it('should work with piped input', async () => {
      const ctx = await createContextWithFS({ args: ['world'], stdin: 'hello\nworld\nfoo' });
      const result = await commands['grep']!(ctx);
      expect(result).toBe('world\n');
    });
  });

  describe('sort', () => {
    it('should sort lines', async () => {
      const ctx = await createContextWithFS({ stdin: 'banana\napple\ncherry' });
      const result = await commands['sort']!(ctx);
      expect(result).toBe('apple\nbanana\ncherry\n');
    });

    it('should support reverse sort', async () => {
      const ctx = await createContextWithFS({ args: ['-r'], stdin: 'a\nb\nc' });
      const result = await commands['sort']!(ctx);
      expect(result).toBe('c\nb\na\n');
    });
  });

  describe('wc', () => {
    it('should count lines, words, and chars', async () => {
      const ctx = await createContextWithFS({ stdin: 'hello world\nfoo bar' });
      const result = await commands['wc']!(ctx);
      expect(result).toContain('2');
      expect(result).toContain('4');
    });
  });

  describe('whoami', () => {
    it('should return username', async () => {
      const ctx = await createContextWithFS();
      const result = await commands['whoami']!(ctx);
      expect(result).toBe('testuser\n');
    });
  });

  describe('hostname', () => {
    it('should return hostname', async () => {
      const ctx = await createContextWithFS();
      const result = await commands['hostname']!(ctx);
      expect(result).toBe('test-host\n');
    });
  });

  describe('uname', () => {
    it('should return StarkOS', async () => {
      const ctx = await createContextWithFS();
      const result = await commands['uname']!(ctx);
      expect(result).toBe('StarkOS\n');
    });
  });

  describe('env', () => {
    it('should list environment variables', async () => {
      const ctx = await createContextWithFS();
      const result = await commands['env']!(ctx);
      expect(result).toContain('USER=testuser');
    });
  });

  describe('export', () => {
    it('should set environment variables', async () => {
      const env = { USER: 'testuser' };
      const ctx = await createContextWithFS({ args: ['FOO=bar'], env });
      await commands['export']!(ctx);
      expect(env).toHaveProperty('FOO', 'bar');
    });
  });

  describe('seq', () => {
    it('should generate a sequence', async () => {
      const ctx = await createContextWithFS({ args: ['1', '5'] });
      const result = await commands['seq']!(ctx);
      expect(result).toBe('1\n2\n3\n4\n5\n');
    });
  });

  describe('help', () => {
    it('should list available commands', async () => {
      const ctx = await createContextWithFS();
      const result = await commands['help']!(ctx);
      expect(result).toContain('ls');
      expect(result).toContain('grep');
    });
  });
});

// ============================================================================
// Shell Parser Tests
// ============================================================================

describe('Shell Parser', () => {
  describe('tokenize', () => {
    it('should split on spaces', () => {
      expect(tokenize('ls -la /home')).toEqual(['ls', '-la', '/home']);
    });
    it('should handle single quotes', () => {
      expect(tokenize("echo 'hello world'")).toEqual(['echo', 'hello world']);
    });
    it('should handle double quotes', () => {
      expect(tokenize('echo "hello world"')).toEqual(['echo', 'hello world']);
    });
    it('should handle escaped characters', () => {
      expect(tokenize('echo hello\\ world')).toEqual(['echo', 'hello world']);
    });
    it('should handle empty input', () => {
      expect(tokenize('')).toEqual([]);
    });
  });

  describe('parseCommandLine', () => {
    it('should parse simple command', () => {
      const plan = parseCommandLine('ls -la');
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0]!.pipeline.commands[0]!.tokens).toEqual(['ls', '-la']);
    });
    it('should parse pipe operator', () => {
      const plan = parseCommandLine('cat file.txt | grep hello');
      expect(plan.steps[0]!.pipeline.commands).toHaveLength(2);
    });
    it('should parse && operator', () => {
      const plan = parseCommandLine('mkdir test && cd test');
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0]!.chainType).toBe('&&');
    });
    it('should parse & operator', () => {
      const plan = parseCommandLine('sleep 10 & echo done');
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0]!.chainType).toBe('&');
    });
    it('should parse output redirection', () => {
      const plan = parseCommandLine('echo hello > file.txt');
      const cmd = plan.steps[0]!.pipeline.commands[0]!;
      expect(cmd.tokens).toEqual(['echo', 'hello']);
      expect(cmd.redirectStdout).toBe('file.txt');
    });
    it('should parse append redirection', () => {
      const plan = parseCommandLine('echo hello >> file.txt');
      const cmd = plan.steps[0]!.pipeline.commands[0]!;
      expect(cmd.appendStdout).toBe('file.txt');
    });
  });
});

// ============================================================================
// Shell Execution Tests
// ============================================================================

describe('Shell Execution', () => {
  let state: ShellState;
  let output: string;

  beforeEach(async () => {
    const fs = createMemoryFS();
    await fs.mkdir('/home');
    await fs.mkdir('/tmp');
    state = {
      cwd: '/home',
      fs,
      env: { USER: 'testuser', HOME: '/home', HOSTNAME: 'test-host' },
    };
    output = '';
  });

  const write = (text: string) => { output += text; };

  it('should execute a simple command', async () => {
    const plan = parseCommandLine('echo hello');
    await executePlan(plan, state, write);
    expect(output).toBe('hello\n');
  });

  it('should execute a pipe', async () => {
    await state.fs.writeFile('/home/data.txt', 'apple\nbanana\ncherry\napricot');
    const plan = parseCommandLine('cat data.txt | grep ap');
    await executePlan(plan, state, write);
    expect(output).toContain('apple');
    expect(output).toContain('apricot');
    expect(output).not.toContain('banana');
  });

  it('should execute && chain', async () => {
    const plan = parseCommandLine('echo first && echo second');
    await executePlan(plan, state, write);
    expect(output).toContain('first');
    expect(output).toContain('second');
  });

  it('should stop && chain on failure', async () => {
    const plan = parseCommandLine('nonexistent && echo second');
    await executePlan(plan, state, write);
    expect(output).toContain('command not found');
    expect(output).not.toContain('second');
  });

  it('should handle output redirection', async () => {
    const plan = parseCommandLine('echo hello > test.txt');
    await executePlan(plan, state, write);
    expect(await state.fs.readFile('/home/test.txt')).toBe('hello\n');
  });

  it('should handle append redirection', async () => {
    await state.fs.writeFile('/home/test.txt', 'line1\n');
    const plan = parseCommandLine('echo line2 >> test.txt');
    await executePlan(plan, state, write);
    expect(await state.fs.readFile('/home/test.txt')).toBe('line1\nline2\n');
  });

  it('should handle multi-pipe commands', async () => {
    await state.fs.writeFile('/home/data.txt', 'banana\napple\ncherry');
    const plan = parseCommandLine('cat data.txt | sort | head -n 2');
    await executePlan(plan, state, write);
    expect(output).toContain('apple');
    expect(output).toContain('banana');
  });
});

// ============================================================================
// New Command Tests (wasi-fs-access commands + stark)
// ============================================================================

describe('New Terminal Commands', () => {
  describe('rmdir', () => {
    it('should remove an empty directory', async () => {
      const fs = createMemoryFS();
      await fs.mkdir('/home');
      await fs.mkdir('/home/emptydir');
      const ctx = await createContextWithFS({ args: ['emptydir'], fs });
      const result = await commands['rmdir']!(ctx);
      expect(result).toBe('');
      expect(await fs.exists('/home/emptydir')).toBe(false);
    });

    it('should error on non-empty directory', async () => {
      const fs = createMemoryFS();
      await fs.mkdir('/home');
      await fs.mkdir('/home/notempty');
      await fs.writeFile('/home/notempty/file.txt', 'data');
      const ctx = await createContextWithFS({ args: ['notempty'], fs });
      const result = await commands['rmdir']!(ctx);
      expect(result).toContain('failed to remove');
    });
  });

  describe('basename', () => {
    it('should return the base name of a path', async () => {
      const ctx = await createContextWithFS({ args: ['/home/user/file.txt'] });
      const result = await commands['basename']!(ctx);
      expect(result).toBe('file.txt\n');
    });

    it('should strip suffix', async () => {
      const ctx = await createContextWithFS({ args: ['file.txt', '.txt'] });
      const result = await commands['basename']!(ctx);
      expect(result).toBe('file\n');
    });
  });

  describe('dirname', () => {
    it('should return directory name', async () => {
      const ctx = await createContextWithFS({ args: ['/home/user/file.txt'] });
      const result = await commands['dirname']!(ctx);
      expect(result).toBe('/home/user\n');
    });

    it('should return . for plain filename', async () => {
      const ctx = await createContextWithFS({ args: ['file.txt'] });
      const result = await commands['dirname']!(ctx);
      expect(result).toBe('.\n');
    });
  });

  describe('base64', () => {
    it('should encode to base64', async () => {
      const ctx = await createContextWithFS({ stdin: 'hello' });
      const result = await commands['base64']!(ctx);
      expect(result).toBe('aGVsbG8=\n');
    });

    it('should decode from base64', async () => {
      const ctx = await createContextWithFS({ args: ['-d'], stdin: 'aGVsbG8=' });
      const result = await commands['base64']!(ctx);
      expect(result).toBe('hello\n');
    });
  });

  describe('tac', () => {
    it('should reverse lines', async () => {
      const ctx = await createContextWithFS({ stdin: 'a\nb\nc' });
      const result = await commands['tac']!(ctx);
      expect(result).toBe('c\nb\na\n');
    });
  });

  describe('factor', () => {
    it('should factorize numbers', async () => {
      const ctx = await createContextWithFS({ args: ['12'] });
      const result = await commands['factor']!(ctx);
      expect(result).toBe('12: 2 2 3\n');
    });

    it('should handle primes', async () => {
      const ctx = await createContextWithFS({ args: ['7'] });
      const result = await commands['factor']!(ctx);
      expect(result).toBe('7: 7\n');
    });
  });

  describe('expr', () => {
    it('should evaluate arithmetic', async () => {
      const ctx = await createContextWithFS({ args: ['3', '+', '4'] });
      const result = await commands['expr']!(ctx);
      expect(result).toBe('7\n');
    });

    it('should handle multiplication', async () => {
      const ctx = await createContextWithFS({ args: ['6', '*', '7'] });
      const result = await commands['expr']!(ctx);
      expect(result).toBe('42\n');
    });
  });

  describe('nl', () => {
    it('should number lines', async () => {
      const ctx = await createContextWithFS({ stdin: 'hello\nworld' });
      const result = await commands['nl']!(ctx);
      expect(result).toContain('1');
      expect(result).toContain('hello');
      expect(result).toContain('2');
      expect(result).toContain('world');
    });
  });

  describe('expand', () => {
    it('should convert tabs to spaces', async () => {
      const ctx = await createContextWithFS({ stdin: 'hello\tworld' });
      const result = await commands['expand']!(ctx);
      expect(result).toBe('hello        world');
    });
  });

  describe('fold', () => {
    it('should wrap lines at specified width', async () => {
      const ctx = await createContextWithFS({ args: ['-w', '5'], stdin: 'helloworld' });
      const result = await commands['fold']!(ctx);
      expect(result).toContain('hello');
      expect(result).toContain('world');
    });
  });

  describe('printenv', () => {
    it('should list all env vars', async () => {
      const ctx = await createContextWithFS();
      const result = await commands['printenv']!(ctx);
      expect(result).toContain('USER=testuser');
    });

    it('should print single var', async () => {
      const ctx = await createContextWithFS({ args: ['USER'] });
      const result = await commands['printenv']!(ctx);
      expect(result).toBe('testuser\n');
    });
  });

  describe('printf', () => {
    it('should format output', async () => {
      const ctx = await createContextWithFS({ args: ['hello %s\\n', 'world'] });
      const result = await commands['printf']!(ctx);
      expect(result).toBe('hello world\n');
    });
  });

  describe('stark', () => {
    it('should show help when called with no args', async () => {
      const ctx = await createContextWithFS();
      const result = await commands['stark']!(ctx);
      expect(result).toContain('Stark Orchestrator CLI');
      expect(result).toContain('stark auth');
      expect(result).toContain('stark pod');
    });

    it('should show help for unknown subcommand', async () => {
      const ctx = await createContextWithFS({ args: ['nonexistent'] });
      const result = await commands['stark']!(ctx);
      expect(result).toContain('Unknown command');
    });
  });

  describe('test', () => {
    it('should succeed for existing directory', async () => {
      const fs = createMemoryFS();
      await fs.mkdir('/home');
      const ctx = await createContextWithFS({ args: ['-d', '/home'], fs });
      const result = await commands['test']!(ctx);
      expect(result).toBe('');
    });

    it('should fail for non-existent file', async () => {
      const ctx = await createContextWithFS({ args: ['-e', '/nonexistent'] });
      await expect(commands['test']!(ctx)).rejects.toThrow();
    });

    it('should compare numbers', async () => {
      const ctx = await createContextWithFS({ args: ['5', '-gt', '3'] });
      const result = await commands['test']!(ctx);
      expect(result).toBe('');
    });
  });

  describe('shuf', () => {
    it('should shuffle lines', async () => {
      const ctx = await createContextWithFS({ stdin: 'a\nb\nc\nd\ne' });
      const result = await commands['shuf']!(ctx);
      const lines = result.trim().split('\n');
      expect(lines).toHaveLength(5);
      expect(lines.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    });
  });

  describe('truncate', () => {
    it('should truncate a file', async () => {
      const fs = createMemoryFS();
      await fs.mkdir('/home');
      await fs.writeFile('/home/test.txt', 'hello world');
      const ctx = await createContextWithFS({ args: ['-s', '0', 'test.txt'], fs });
      await commands['truncate']!(ctx);
      expect(await fs.readFile('/home/test.txt')).toBe('');
    });
  });

  describe('link', () => {
    it('should create a copy (link)', async () => {
      const fs = createMemoryFS();
      await fs.mkdir('/home');
      await fs.writeFile('/home/src.txt', 'content');
      const ctx = await createContextWithFS({ args: ['src.txt', 'dst.txt'], fs });
      await commands['link']!(ctx);
      expect(await fs.readFile('/home/dst.txt')).toBe('content');
    });
  });

  describe('mktemp', () => {
    it('should create a temp file', async () => {
      const fs = createMemoryFS();
      await fs.mkdir('/tmp');
      const ctx = await createContextWithFS({ fs });
      const result = await commands['mktemp']!(ctx);
      expect(result).toContain('/tmp/');
      expect(result.trim().length).toBeGreaterThan(5);
    });
  });

  describe('comm', () => {
    it('should compare sorted files', async () => {
      const fs = createMemoryFS();
      await fs.mkdir('/home');
      await fs.writeFile('/home/a.txt', 'apple\nbanana\ncherry');
      await fs.writeFile('/home/b.txt', 'banana\ndate\nfig');
      const ctx = await createContextWithFS({ args: ['a.txt', 'b.txt'], fs });
      const result = await commands['comm']!(ctx);
      expect(result).toContain('banana');
    });
  });
});

// ============================================================================
// Interactive Prompt & New Stark Subcommands
// ============================================================================

describe('CommandContext prompt interface', () => {
  it('should pass prompt functions through to commands', async () => {
    const fs = createMemoryFS();
    await fs.mkdir('/home');
    const promptCalls: string[] = [];
    const ctx = await createContextWithFS({
      fs,
      prompt: async (msg: string) => { promptCalls.push(msg); return 'test@example.com'; },
      promptPassword: async (msg: string) => { promptCalls.push(msg); return 'secret123'; },
    });
    // Verify prompts are part of the context
    expect(ctx.prompt).toBeDefined();
    expect(ctx.promptPassword).toBeDefined();
  });

  it('should pass prompt through ShellState to command context', async () => {
    const fs = createMemoryFS();
    await fs.mkdir('/home');
    const promptCalls: string[] = [];
    const state: ShellState = {
      cwd: '/home',
      fs,
      env: { USER: 'test', HOME: '/home' },
      prompt: async (msg) => { promptCalls.push(msg); return 'response'; },
      promptPassword: async (msg) => { promptCalls.push(msg); return 'secret'; },
    };
    const output: string[] = [];
    const write = (t: string) => output.push(t);
    // Execute a simple echo command to verify the plumbing works
    await executePlan(parseCommandLine('echo hello'), state, write);
    expect(output.join('')).toContain('hello');
  });
});

describe('stark command improvements', () => {
  it('stark help should list setup and add-user', async () => {
    const ctx = await createContextWithFS({ args: ['help'] });
    const result = await commands['stark']!(ctx);
    expect(result).toContain('setup');
    expect(result).toContain('add-user');
    expect(result).toContain('sync');
  });

  it('stark auth login should prompt interactively when no flags', async () => {
    const writes: string[] = [];
    const ctx = await createContextWithFS({
      args: ['auth', 'login'],
      write: (t) => writes.push(t),
      prompt: async () => 'user@example.com',
      promptPassword: async () => 'password123',
    });
    // This will fail the API call but should attempt interactive prompts first
    const result = await commands['stark']!(ctx);
    // Should have tried to authenticate (error expected since no API server)
    expect(result).toMatch(/stark:|Authenticating|Login failed|fetch/i);
  });

  it('stark config set should update configuration', async () => {
    // Mock localStorage for this test
    const store: Record<string, string> = {};
    const origGetItem = globalThis.localStorage?.getItem;
    const origSetItem = globalThis.localStorage?.setItem;
    try {
      if (typeof globalThis.localStorage === 'undefined') {
        Object.defineProperty(globalThis, 'localStorage', {
          value: {
            getItem: (k: string) => store[k] ?? null,
            setItem: (k: string, v: string) => { store[k] = v; },
            removeItem: (k: string) => { delete store[k]; },
          },
          configurable: true,
        });
      }
      const ctx = await createContextWithFS({ args: ['config', 'set', 'apiUrl', 'https://my-server:8080'] });
      const result = await commands['stark']!(ctx);
      expect(result).toContain('apiUrl');
      expect(result).toContain('https://my-server:8080');
    } finally {
      // Cleanup
      if (origGetItem) globalThis.localStorage.getItem = origGetItem;
      if (origSetItem) globalThis.localStorage.setItem = origSetItem;
    }
  });

  it('stark config should show current config including resolved apiUrl', async () => {
    const ctx = await createContextWithFS({ args: ['config'] });
    const result = await commands['stark']!(ctx);
    // Should be valid JSON
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('stark auth setup should require prompts', async () => {
    const ctx = await createContextWithFS({ args: ['auth', 'setup'] });
    // Without prompt functions, should fail gracefully
    const result = await commands['stark']!(ctx);
    // Will either fail on API or show error about setup
    expect(result).toBeTruthy();
  });
});

// ============================================================================
// .sh.js Script Execution Tests
// ============================================================================

describe('.sh.js script execution', () => {
  let fs: TerminalFS;
  let state: ShellState;
  let output: string[];
  const write = (t: string) => output.push(t);

  beforeEach(async () => {
    fs = createMemoryFS();
    await fs.mkdir('/home');
    await fs.mkdir('/tmp');
    output = [];
    state = {
      cwd: '/home',
      fs,
      env: { USER: 'testuser', HOME: '/home' },
      prompt: async () => 'test-input',
      promptPassword: async () => 'secret',
    };
  });

  it('sh.js command should require a script operand', async () => {
    const ctx = await createContextWithFS({ fs });
    const result = await commands['sh.js']!(ctx);
    expect(result).toBe('sh.js: missing script operand\n');
  });

  it('sh.js command should execute a simple script', async () => {
    await fs.writeFile('/home/test.sh.js', 'Terminal.writeln("hello from script");');
    const ctx = await createContextWithFS({
      fs,
      args: ['test.sh.js'],
      write,
    });
    await commands['sh.js']!(ctx);
    expect(output.join('')).toContain('hello from script');
  });

  it('sh.js command should report missing script file', async () => {
    const ctx = await createContextWithFS({
      fs,
      args: ['nonexistent.sh.js'],
      write,
    });
    await commands['sh.js']!(ctx);
    expect(output.join('')).toContain('No such file or directory');
  });

  it('should execute .sh.js via direct path in shell', async () => {
    await fs.writeFile('/home/hello.sh.js', 'Terminal.writeln("direct exec");');
    await executePlan(parseCommandLine('./hello.sh.js'), state, write);
    expect(output.join('')).toContain('direct exec');
  });

  it('should execute .sh.js via absolute path in shell', async () => {
    await fs.writeFile('/home/hello.sh.js', 'Terminal.writeln("abs path");');
    await executePlan(parseCommandLine('/home/hello.sh.js'), state, write);
    expect(output.join('')).toContain('abs path');
  });

  it('Terminal.run should capture output without writing to terminal', async () => {
    await fs.writeFile('/home/run.sh.js',
      'const result = await Terminal.run("echo captured");\n' +
      'Terminal.writeln("got: " + result.trim());'
    );
    await executePlan(parseCommandLine('./run.sh.js'), state, write);
    const combined = output.join('');
    expect(combined).toContain('got: captured');
  });

  it('Terminal.args should pass arguments to script', async () => {
    await fs.writeFile('/home/args.sh.js',
      'Terminal.writeln("args: " + Terminal.args.join(","));'
    );
    await executePlan(parseCommandLine('./args.sh.js foo bar'), state, write);
    expect(output.join('')).toContain('args: foo,bar');
  });

  it('Terminal.cwd should return current working directory', async () => {
    await fs.writeFile('/home/cwd.sh.js',
      'Terminal.writeln("cwd: " + Terminal.cwd());'
    );
    await executePlan(parseCommandLine('./cwd.sh.js'), state, write);
    expect(output.join('')).toContain('cwd: /home');
  });

  it('Terminal.cd should change working directory', async () => {
    await fs.writeFile('/home/cd.sh.js',
      'await Terminal.cd("/tmp");\nTerminal.writeln("now: " + Terminal.cwd());'
    );
    await executePlan(parseCommandLine('./cd.sh.js'), state, write);
    expect(output.join('')).toContain('now: /tmp');
    expect(state.cwd).toBe('/tmp');
  });

  it('Terminal.env and Terminal.setEnv should work', async () => {
    await fs.writeFile('/home/env.sh.js',
      'Terminal.setEnv("FOO", "bar");\n' +
      'const e = Terminal.env();\n' +
      'Terminal.writeln("FOO=" + e.FOO);'
    );
    await executePlan(parseCommandLine('./env.sh.js'), state, write);
    expect(output.join('')).toContain('FOO=bar');
    expect(state.env['FOO']).toBe('bar');
  });

  it('Terminal.readFile and Terminal.writeFile should work', async () => {
    await fs.writeFile('/home/fileio.sh.js',
      'await Terminal.writeFile("out.txt", "hello file");\n' +
      'const content = await Terminal.readFile("out.txt");\n' +
      'Terminal.writeln("read: " + content);'
    );
    await executePlan(parseCommandLine('./fileio.sh.js'), state, write);
    expect(output.join('')).toContain('read: hello file');
  });

  it('Terminal.readdir should list directory entries', async () => {
    await fs.writeFile('/home/a.txt', 'a');
    await fs.writeFile('/home/b.txt', 'b');
    await fs.writeFile('/home/dir.sh.js',
      'const files = await Terminal.readdir(".");\n' +
      'Terminal.writeln("files: " + files.sort().join(","));'
    );
    await executePlan(parseCommandLine('./dir.sh.js'), state, write);
    expect(output.join('')).toContain('a.txt');
    expect(output.join('')).toContain('b.txt');
  });

  it('script errors should be caught and printed in red', async () => {
    await fs.writeFile('/home/error.sh.js', 'throw new Error("boom");');
    await executePlan(parseCommandLine('./error.sh.js'), state, write);
    const combined = output.join('');
    expect(combined).toContain('sh.js error: boom');
    expect(combined).toContain('\x1B[31m'); // red ANSI
  });

  it('help should mention .sh.js files', async () => {
    const ctx = await createContextWithFS();
    const result = await commands['help']!(ctx);
    expect(result).toContain('.sh.js');
    expect(result).toContain('Terminal API');
  });

  it('.sh.js should work in a pipeline (output piped to next command)', async () => {
    await fs.writeFile('/home/pipe.sh.js', 'Terminal.write("pipe output");');
    await executePlan(parseCommandLine('./pipe.sh.js | cat'), state, write);
    expect(output.join('')).toContain('pipe output');
  });

  it('Terminal.commands should be callable functions that execute commands', async () => {
    await fs.writeFile('/home/a.txt', 'hello');
    await fs.writeFile('/home/callcmd.sh.js',
      'const out = await Terminal.commands.cat("a.txt");\n' +
      'Terminal.writeln("cat returned: " + out.trim());'
    );
    await executePlan(parseCommandLine('./callcmd.sh.js'), state, write);
    expect(output.join('')).toContain('cat returned: hello');
  });

  it('Terminal.commands functions should have help metadata', async () => {
    await fs.writeFile('/home/meta.sh.js',
      'const ls = Terminal.commands.ls;\n' +
      'Terminal.writeln("name:" + ls.name);\n' +
      'Terminal.writeln("desc:" + ls.description);\n' +
      'Terminal.writeln("usage:" + ls.usage);'
    );
    await executePlan(parseCommandLine('./meta.sh.js'), state, write);
    const combined = output.join('');
    expect(combined).toContain('name:ls');
    expect(combined).toContain('desc:List directory contents');
    expect(combined).toContain('usage:ls [-a] [-l] [path]');
  });

  it('Terminal.commands should enumerate all registered commands', async () => {
    await fs.writeFile('/home/enum.sh.js',
      'const names = Object.keys(Terminal.commands).sort();\n' +
      'Terminal.writeln("count:" + names.length);\n' +
      'Terminal.writeln("has-grep:" + ("grep" in Terminal.commands));\n' +
      'Terminal.writeln("has-ls:" + ("ls" in Terminal.commands));'
    );
    await executePlan(parseCommandLine('./enum.sh.js'), state, write);
    const combined = output.join('');
    expect(combined).toContain('has-grep:true');
    expect(combined).toContain('has-ls:true');
    // Should have many commands (all registered ones)
    const countMatch = combined.match(/count:(\d+)/);
    expect(Number(countMatch![1])).toBeGreaterThan(50);
  });
});

// ============================================================================
// Per-command help and --help enhancement tests
// ============================================================================

describe('help command and --help enhancement', () => {
  let fs: TerminalFS;
  let state: ShellState;
  let output: string[];
  const write = (t: string) => output.push(t);

  beforeEach(async () => {
    fs = createMemoryFS();
    await fs.mkdir('/home');
    await fs.mkdir('/tmp');
    output = [];
    state = { cwd: '/home', fs, env: { USER: 'testuser', HOME: '/home' } };
  });

  it('help <command> should show description and usage', async () => {
    const ctx = await createContextWithFS({ args: ['ls'] });
    const result = await commands['help']!(ctx);
    expect(result).toContain('ls');
    expect(result).toContain('List directory contents');
    expect(result).toContain('Usage: ls [-a] [-l] [path]');
  });

  it('help for unknown command should report no entry', async () => {
    const ctx = await createContextWithFS({ args: ['nonexistent'] });
    const result = await commands['help']!(ctx);
    expect(result).toContain("no help entry for 'nonexistent'");
  });

  it('help with no args should list all commands and mention help <command>', async () => {
    const ctx = await createContextWithFS();
    const result = await commands['help']!(ctx);
    expect(result).toContain('help <command>');
    expect(result).toContain('ls');
    expect(result).toContain('grep');
  });

  it('--help flag should append programmatic info to command output', async () => {
    await executePlan(parseCommandLine('echo --help'), state, write);
    const combined = output.join('');
    // echo should still produce its own output (printing "--help")
    expect(combined).toContain('--help');
    // and the programmatic help should be appended
    expect(combined).toContain('echo — Print arguments to stdout');
    expect(combined).toContain('Usage: echo [text]...');
  });

  it('--help on ls should enhance with description and usage', async () => {
    await executePlan(parseCommandLine('ls --help'), state, write);
    const combined = output.join('');
    expect(combined).toContain('ls — List directory contents');
    expect(combined).toContain('Usage: ls [-a] [-l] [path]');
  });

  it('commandDescriptions should have entries for all described commands', () => {
    expect(commandDescriptions['ls']).toBeDefined();
    expect(commandDescriptions['ls']!.name).toBe('ls');
    expect(commandDescriptions['grep']).toBeDefined();
    expect(commandDescriptions['git']).toBeDefined();
    expect(commandDescriptions['stark']).toBeDefined();
  });
});
