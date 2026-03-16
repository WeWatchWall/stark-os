/**
 * Terminal Commands – re-export from the shared layer.
 *
 * The canonical implementation lives in examples/shared/utils/terminal/commands.ts.
 * This file simply re-exports everything so that the system-app test suite can
 * continue to import from '../utils/commands'.
 *
 * @module @stark-o/terminal/utils/commands
 */
export {
  commands,
  normalizePath,
  type TerminalFS,
  type CommandContext,
  type CommandHandler,
} from '../../../examples/shared/utils/terminal/commands';
