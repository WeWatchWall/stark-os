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
 * - All filesystem operations are async (OPFS-backed)
 * @module @stark-o/terminal/utils/shell
 */

import { commands, normalizePath, type CommandContext, type TerminalFS } from './commands';

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
    if (escaped) { current += char; escaped = false; continue; }
    if (char === '\\' && !inSingleQuote) { escaped = true; continue; }
    if (char === "'" && !inDoubleQuote) { inSingleQuote = !inSingleQuote; continue; }
    if (char === '"' && !inSingleQuote) { inDoubleQuote = !inDoubleQuote; continue; }
    if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current) { tokens.push(current); current = ''; }
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

interface ParsedCommand {
  tokens: string[];
  redirectStdout?: string;
  appendStdout?: string;
}

interface Pipeline { commands: ParsedCommand[]; }

interface ExecutionPlan {
  steps: Array<{ pipeline: Pipeline; chainType?: '&&' | '&'; }>;
}

/**
 * Parse a full command line into an execution plan.
 */
export function parseCommandLine(line: string): ExecutionPlan {
  const steps: ExecutionPlan['steps'] = [];
  const segments: Array<{ text: string; chainType?: '&&' | '&' }> = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i]!;
    if (char === "'" && !inDoubleQuote) { inSingleQuote = !inSingleQuote; current += char; i++; continue; }
    if (char === '"' && !inSingleQuote) { inDoubleQuote = !inDoubleQuote; current += char; i++; continue; }
    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '&' && line[i + 1] === '&') {
        segments.push({ text: current.trim(), chainType: '&&' }); current = ''; i += 2; continue;
      }
      if (char === '&') {
        segments.push({ text: current.trim(), chainType: '&' }); current = ''; i++; continue;
      }
    }
    current += char; i++;
  }
  if (current.trim()) segments.push({ text: current.trim() });

  for (const segment of segments) {
    steps.push({ pipeline: parsePipeline(segment.text), chainType: segment.chainType });
  }
  return { steps };
}

function parsePipeline(text: string): Pipeline {
  const parts: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (const char of text) {
    if (char === "'" && !inDoubleQuote) { inSingleQuote = !inSingleQuote; current += char; continue; }
    if (char === '"' && !inSingleQuote) { inDoubleQuote = !inDoubleQuote; current += char; continue; }
    if (char === '|' && !inSingleQuote && !inDoubleQuote) { parts.push(current.trim()); current = ''; continue; }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return { commands: parts.map(parseRedirections) };
}

function parseRedirections(text: string): ParsedCommand {
  const tokens = tokenize(text);
  let redirectStdout: string | undefined;
  let appendStdout: string | undefined;
  const filteredTokens: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === '>>') { appendStdout = tokens[++i]; continue; }
    if (token === '>') { redirectStdout = tokens[++i]; continue; }
    if (token.startsWith('>>')) { appendStdout = token.slice(2); continue; }
    if (token.startsWith('>') && token.length > 1) { redirectStdout = token.slice(1); continue; }
    filteredTokens.push(token);
  }
  return { tokens: filteredTokens, redirectStdout, appendStdout };
}

/**
 * Shell state — filesystem backed by OPFS
 */
export interface ShellState {
  cwd: string;
  fs: TerminalFS;
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
      try { await executePipeline(step.pipeline, state, write); } catch { success = false; }
      return success;
    };
    if (isBackground) { runPipeline().catch(() => {}); continue; }
    const success = await runPipeline();
    if (step.chainType === '&&' && !success) break;
  }
}

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
    if (!handler) { write(`${commandName}: command not found\n`); throw new Error(`Command not found: ${commandName}`); }

    const ctx: CommandContext = {
      args, cwd: state.cwd,
      write: isLast ? write : () => {},
      writeError: write, stdin,
      fs: state.fs, env: state.env,
      setCwd: (path: string) => { state.cwd = path; },
    };

    let output: string;
    try { output = await handler(ctx); } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg) write(`${commandName}: ${msg}\n`);
      throw err;
    }

    // Handle output redirection (async — OPFS)
    if (cmd.redirectStdout) {
      const filePath = normalizePath(cmd.redirectStdout, state.cwd);
      await state.fs.writeFile(filePath, output);
      output = '';
    } else if (cmd.appendStdout) {
      const filePath = normalizePath(cmd.appendStdout, state.cwd);
      await state.fs.appendFile(filePath, output);
      output = '';
    }

    if (isLast) { if (output) write(output); }
    else { stdin = output; }
  }
}
