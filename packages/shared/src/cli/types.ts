/**
 * CLI Command Data Types
 *
 * Data-driven command definitions that can be consumed by
 * both Node.js CLI (commander) and browser CLI implementations.
 * @module @stark-o/shared/cli/types
 */

/**
 * Describes a single CLI option (flag)
 */
export interface CliOptionDef {
  /** Short and long flag, e.g. '-n, --name <value>' */
  flags: string;
  /** Human-readable description */
  description: string;
  /** Default value (if any) */
  defaultValue?: string | boolean | number;
  /** Whether this option is required */
  required?: boolean;
  /** Env variable fallback */
  envVar?: string;
}

/**
 * Describes a single subcommand
 */
export interface CliSubcommandDef {
  /** Command name, e.g. 'list' */
  name: string;
  /** Positional argument(s), e.g. '[name]' or '<bundle>' */
  argument?: string;
  /** Argument description */
  argumentDescription?: string;
  /** Command alias, e.g. 'ls' */
  alias?: string;
  /** Human-readable description */
  description: string;
  /** Options for this subcommand */
  options?: CliOptionDef[];
  /** API method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' */
  apiMethod?: string;
  /** API path template (may include :params), e.g. '/api/pods' */
  apiPath?: string;
  /** Whether authentication is required */
  requiresAuth?: boolean;
  /** Nested subcommands (e.g., node agent start) */
  subcommands?: CliSubcommandDef[];
}

/**
 * Top-level command group definition
 */
export interface CliCommandDef {
  /** Command name, e.g. 'pack' */
  name: string;
  /** Command alias, e.g. 'ns' for namespace */
  alias?: string;
  /** Human-readable description */
  description: string;
  /** Subcommands */
  subcommands: CliSubcommandDef[];
}

/**
 * Complete CLI definition — all command groups
 */
export interface CliDefinition {
  /** Program name */
  name: string;
  /** Program version */
  version: string;
  /** Program description */
  description: string;
  /** Global options */
  globalOptions: CliOptionDef[];
  /** Command groups */
  commands: CliCommandDef[];
}
