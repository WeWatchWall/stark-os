/**
 * Shell Parser and Executor
 *
 * Parses command lines with support for:
 * - Pipe operator (|)
 * - Background operator (&)
 * - Sequential AND operator (&&)
 * - Output redirection (>, >>)
 * - Quoted strings
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
 * - Reimplemented parser from scratch for the Stark OS terminal
 * - Added &&, & (background), and pipe operators
 * - No WASI bindings; uses pure JS command implementations
 * @module @stark-o/terminal/shell
 */

import { commands, type CommandContext, type CommandHandler, VirtualFS } from './commands.js';

/**
 * Parse a command string into tokens, respecting quotes.
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      escaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) tokens.push(current);

  return tokens;
}

/**
 * Represents a single command in a pipeline or chain.
 */
interface ParsedCommand {
  tokens: string[];
  redirectStdout?: string;  // > file
  appendStdout?: string;    // >> file
}

/**
 * Represents a pipeline (commands connected by |)
 */
interface Pipeline {
  commands: ParsedCommand[];
}

/**
 * Represents an execution plan with chaining (&&, &)
 */
interface ExecutionPlan {
  /** Each element is a pipeline + chain type */
  steps: Array<{
    pipeline: Pipeline;
    /** How this step connects to the next: '&&', '&', or undefined (end) */
    chainType?: '&&' | '&';
  }>;
}

/**
 * Parse a full command line into an execution plan.
 */
export function parseCommandLine(line: string): ExecutionPlan {
  const steps: ExecutionPlan['steps'] = [];

  // Split on && and & operators (but not within quotes)
  const segments: Array<{ text: string; chainType?: '&&' | '&' }> = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i]!;

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += char;
      i++;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      i++;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      // Check for &&
      if (char === '&' && line[i + 1] === '&') {
        segments.push({ text: current.trim(), chainType: '&&' });
        current = '';
        i += 2;
        continue;
      }

      // Check for single &  (background)
      if (char === '&') {
        segments.push({ text: current.trim(), chainType: '&' });
        current = '';
        i++;
        continue;
      }
    }

    current += char;
    i++;
  }

  if (current.trim()) {
    segments.push({ text: current.trim() });
  }

  // Parse each segment into a pipeline
  for (const segment of segments) {
    const pipeline = parsePipeline(segment.text);
    steps.push({ pipeline, chainType: segment.chainType });
  }

  return { steps };
}

/**
 * Parse a segment into a pipeline of commands separated by |
 */
function parsePipeline(text: string): Pipeline {
  const pipeCommands: ParsedCommand[] = [];

  // Split on | operator (but not within quotes)
  const parts: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (const char of text) {
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      continue;
    }
    if (char === '|' && !inSingleQuote && !inDoubleQuote) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());

  for (const part of parts) {
    const parsed = parseRedirections(part);
    pipeCommands.push(parsed);
  }

  return { commands: pipeCommands };
}

/**
 * Parse a single command for output redirections (>, >>)
 */
function parseRedirections(text: string): ParsedCommand {
  const tokens = tokenize(text);
  let redirectStdout: string | undefined;
  let appendStdout: string | undefined;

  // Look for > and >> operators
  const filteredTokens: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === '>>') {
      appendStdout = tokens[++i];
      continue;
    }
    if (token === '>') {
      redirectStdout = tokens[++i];
      continue;
    }
    // Handle >file (no space)
    if (token.startsWith('>>')) {
      appendStdout = token.slice(2);
      continue;
    }
    if (token.startsWith('>') && token.length > 1) {
      redirectStdout = token.slice(1);
      continue;
    }
    filteredTokens.push(token);
  }

  return { tokens: filteredTokens, redirectStdout, appendStdout };
}

/**
 * Shell state
 */
export interface ShellState {
  cwd: string;
  fs: VirtualFS;
  env: Record<string, string>;
}

/**
 * Execute an execution plan
 */
export async function executePlan(
  plan: ExecutionPlan,
  state: ShellState,
  write: (text: string) => void,
): Promise<void> {
  for (const step of plan.steps) {
    const isBackground = step.chainType === '&';

    const runPipeline = async () => {
      let success = true;
      try {
        await executePipeline(step.pipeline, state, write);
      } catch {
        success = false;
      }
      return success;
    };

    if (isBackground) {
      // Run in background (fire and forget)
      runPipeline().catch(() => { /* background error */ });
      continue;
    }

    const success = await runPipeline();

    // For && chains, stop if the previous command failed
    if (step.chainType === '&&' && !success) {
      break;
    }
  }
}

/**
 * Execute a pipeline of commands
 */
async function executePipeline(
  pipeline: Pipeline,
  state: ShellState,
  write: (text: string) => void,
): Promise<void> {
  let stdin: string | undefined;

  for (let i = 0; i < pipeline.commands.length; i++) {
    const cmd = pipeline.commands[i]!;
    const isLast = i === pipeline.commands.length - 1;

    if (cmd.tokens.length === 0) continue;

    const [commandName, ...args] = cmd.tokens;
    const handler = commands[commandName!];

    if (!handler) {
      write(`${commandName}: command not found\n`);
      throw new Error(`Command not found: ${commandName}`);
    }

    const ctx: CommandContext = {
      args,
      cwd: state.cwd,
      write: isLast ? write : () => {},
      writeError: write,
      stdin,
      fs: state.fs,
      env: state.env,
      setCwd: (path: string) => { state.cwd = path; },
    };

    let output: string;
    try {
      output = await handler(ctx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg) write(`${commandName}: ${msg}\n`);
      throw err;
    }

    // Handle output redirection
    if (cmd.redirectStdout) {
      const path = state.fs.normalizePath(cmd.redirectStdout, state.cwd);
      state.fs.writeFile(path, output);
      output = '';
    } else if (cmd.appendStdout) {
      const path = state.fs.normalizePath(cmd.appendStdout, state.cwd);
      const existing = state.fs.readFile(path) ?? '';
      state.fs.writeFile(path, existing + output);
      output = '';
    }

    if (isLast) {
      // Write final output
      if (output) write(output);
    } else {
      // Pass output as stdin to next command
      stdin = output;
    }
  }
}
