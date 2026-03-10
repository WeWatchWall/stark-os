/**
 * Convenience re-export for git utilities.
 *
 * This file is deliberately kept OUT of the main barrel (index.ts) because
 * git.ts pulls in `isomorphic-git`, `buffer`, and `diff` at import time —
 * heavy deps with top-level side-effects that prevent tree-shaking.
 *
 * Only apps that actually need git (e.g. Monaco/Stark Code) should import
 * from this module:
 *
 *   import { gitClone, gitLog } from '../../shared/utils/git';
 */
export {
  buildGitFs,
  gitInit,
  gitClone,
  gitAdd,
  gitRemove,
  gitCommit,
  gitPush,
  gitPull,
  gitFetch,
  gitCurrentBranch,
  gitLog,
  gitStatusMatrix,
  gitIsRepo,
  gitReadBlob,
  gitDiffFiles,
  gitDiffFileContent,
  gitDiffWorkingFile,
  gitListRemotes,
  gitSetConfig,
  gitListBranches,
  gitCreateBranch,
  gitCheckout,
  gitDeleteBranch,
  gitMerge,
  type GitAuthor,
  type GitAuth,
  type GitLogEntry,
  type GitDiffFile,
  type GitFileDiff,
  type GitStatusRow,
} from './lib/git';
