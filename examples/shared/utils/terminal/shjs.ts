/**
 * .sh.js Script Executor
 *
 * Executes .sh.js scripts in a sandboxed AsyncFunction constructor,
 * exposing a Terminal API object for terminal I/O, shell commands,
 * and filesystem operations.
 *
 * @module @stark-o/terminal/utils/shjs
 */

import { commands, commandDescriptions, normalizePath, unwrapResult, type TerminalFS, type CommandInfo } from './commands';
import { parseCommandLine, executePlan, type ShellState } from './shell';

/**
 * A callable command function exposed via Terminal.commands.
 *
 * Returns the command's **structured data** (a plain JS object).
 * Use `Terminal.run()` instead if you want the formatted CLI text.
 *
 * Inspect `.name`, `.description`, `.usage` for programmatic help.
 *
 * @example
 *   const entries = await Terminal.commands.ls("-l", "/home");
 *   Terminal.writeln(JSON.stringify(entries));
 *
 *   const result = await Terminal.commands.stark("pod", "ls");
 *   Terminal.writeln('Pods: ' + JSON.stringify(result));
 */
export interface TerminalCommand {
  (...args: string[]): Promise<unknown>;
  /** Command name */
  readonly name: string;
  /** Human-readable description */
  readonly description: string;
  /** Usage / synopsis string */
  readonly usage: string;
}

/**
 * Terminal API exposed to .sh.js scripts as the `Terminal` global.
 */
export interface ShJsTerminalAPI {
  write(text: string): void;
  writeln(text: string): void;
  /** Execute a shell command string. Returns the **formatted CLI text** output. */
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
  /**
   * All available terminal commands as callable async functions.
   *
   * Each function accepts positional string arguments (same as the CLI) and
   * returns the command's **structured data** as a JS object.
   * Use `Terminal.run()` if you want formatted CLI text instead.
   *
   * Help metadata is available on the function itself:
   *
   * @example
   *   // Call a command programmatically — returns structured data
   *   const entries = await Terminal.commands.ls("/home");
   *   Terminal.writeln(JSON.stringify(entries));
   *
   *   // Contrast with Terminal.run — returns CLI text
   *   const text = await Terminal.run("ls /home");
   *   Terminal.writeln(text); // formatted columns
   *
   *   // Inspect help
   *   Terminal.writeln(Terminal.commands.ls.description); // "List directory contents"
   *   Terminal.writeln(Terminal.commands.ls.usage);       // "ls [-a] [-l] [path]"
   *
   *   // Enumerate all commands
   *   for (const [name, cmd] of Object.entries(Terminal.commands)) {
   *     Terminal.writeln(`${name} — ${cmd.description}`);
   *   }
   */
  commands: Record<string, TerminalCommand>;
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

  // Build callable Terminal.commands — each returns structured data (JS object)
  const terminalCommands: Record<string, TerminalCommand> = {};
  for (const [cmdName, handler] of Object.entries(commands)) {
    const info = commandDescriptions[cmdName];
    const fn = async (...callArgs: string[]): Promise<unknown> => {
      const noop = () => {};
      const ctx = {
        args: callArgs,
        cwd: state.cwd,
        write: noop,
        writeError: noop,
        fs: state.fs,
        env: state.env,
        setCwd: (path: string) => { state.cwd = path; if (state.setCwd) state.setCwd(path); },
        prompt: state.prompt,
        promptPassword: state.promptPassword,
      };
      const raw = await handler(ctx);
      return unwrapResult(raw).data;
    };
    Object.defineProperties(fn, {
      name:        { value: cmdName,                 configurable: true, enumerable: true },
      description: { value: info?.description ?? '', enumerable: true },
      usage:       { value: info?.usage ?? cmdName,  enumerable: true },
    });
    terminalCommands[cmdName] = fn as TerminalCommand;
  }

  const terminalAPI: ShJsTerminalAPI = {
    args,

    commands: terminalCommands,

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
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction('Terminal', scriptCode)(terminalAPI);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    write(`\x1B[31msh.js error: ${msg}\x1B[0m\r\n`);
  }

  return '';
}
