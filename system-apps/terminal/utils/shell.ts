/**
 * Shell Parser and Executor – re-export from the shared layer.
 *
 * The canonical implementation lives in examples/shared/utils/terminal/shell.ts.
 * This file simply re-exports everything so that the system-app test suite can
 * continue to import from '../utils/shell'.
 *
 * @module @stark-o/terminal/utils/shell
 */
export {
  tokenize,
  parseCommandLine,
  executePlan,
  type ShellState,
} from '../../../examples/shared/utils/terminal/shell';
