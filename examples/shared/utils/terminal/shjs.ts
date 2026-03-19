/**
 * .sh.js Script Executor
 *
 * Executes .sh.js scripts in a sandboxed AsyncFunction constructor,
 * exposing a Terminal API object for terminal I/O, shell commands,
 * and filesystem operations.
 *
 * @module @stark-o/terminal/utils/shjs
 */

import { normalizePath, type TerminalFS } from './commands';
import { parseCommandLine, executePlan, type ShellState } from './shell';

/**
 * Terminal API exposed to .sh.js scripts as the `Terminal` global.
 */
export interface ShJsTerminalAPI {
  write(text: string): void;
  writeln(text: string): void;
  run(command: string): Promise<string>;
  prompt(message: string): Promise<string>;
  promptPassword(message: string): Promise<string>;
  cwd(): string;
  cd(path: string): Promise<void>;
  env(): Record<string, string>;
  setEnv(key: string, value: string): void;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  args: string[];
}

/**
 * Execute a .sh.js script file.
 *
 * @param scriptPath - Resolved absolute OPFS path to the .sh.js file
 * @param args - Arguments passed to the script (argv[1..])
 * @param state - The live shell state (cwd, fs, env, prompt, promptPassword)
 * @param write - Direct terminal write function
 * @returns Empty string (output is written directly via write)
 */
export async function executeShJs(
  scriptPath: string,
  args: string[],
  state: ShellState,
  write: (text: string) => void,
): Promise<string> {
  let scriptCode: string;
  try {
    scriptCode = await state.fs.readFile(scriptPath);
  } catch {
    write(`\x1B[31msh.js: cannot open '${scriptPath}': No such file or directory\x1B[0m\r\n`);
    return '';
  }

  const terminalAPI: ShJsTerminalAPI = {
    args,

    write(text: string) {
      write(text.replaceAll('\n', '\r\n'));
    },

    writeln(text: string) {
      write(text.replaceAll('\n', '\r\n') + '\r\n');
    },

    async run(command: string): Promise<string> {
      let buffer = '';
      const captureWrite = (text: string) => { buffer += text; };
      const plan = parseCommandLine(command);
      await executePlan(plan, state, captureWrite);
      return buffer;
    },

    async prompt(message: string): Promise<string> {
      if (!state.prompt) {
        write(message.replaceAll('\n', '\r\n'));
        return '';
      }
      return state.prompt(message);
    },

    async promptPassword(message: string): Promise<string> {
      if (!state.promptPassword) {
        write(message.replaceAll('\n', '\r\n'));
        return '';
      }
      return state.promptPassword(message);
    },

    cwd(): string {
      return state.cwd;
    },

    async cd(path: string): Promise<void> {
      const resolved = normalizePath(path, state.cwd);
      const isDir = await state.fs.isDirectory(resolved);
      if (!isDir) {
        throw new Error(`cd: ${path}: No such file or directory`);
      }
      state.cwd = resolved;
      if (state.setCwd) state.setCwd(resolved);
    },

    env(): Record<string, string> {
      return { ...state.env };
    },

    setEnv(key: string, value: string) {
      state.env[key] = value;
    },

    async readFile(path: string): Promise<string> {
      const resolved = normalizePath(path, state.cwd);
      return state.fs.readFile(resolved);
    },

    async writeFile(path: string, content: string): Promise<void> {
      const resolved = normalizePath(path, state.cwd);
      await state.fs.writeFile(resolved, content);
    },

    async readdir(path: string): Promise<string[]> {
      const resolved = normalizePath(path, state.cwd);
      return state.fs.readdir(resolved);
    },
  };

  try {
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    await new AsyncFunction('Terminal', scriptCode)(terminalAPI);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    write(`\x1B[31msh.js error: ${msg}\x1B[0m\r\n`);
  }

  return '';
}
