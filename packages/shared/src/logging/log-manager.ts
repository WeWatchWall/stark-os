/**
 * Log Manager
 * @module @stark-o/shared/logging/log-manager
 *
 * Composes {@link LogBuffer} and {@link LogRotator} into a single facade that
 * provides buffered, rotated, persistent logging for a node or pod.
 *
 * Each entity (node / pod) gets its own subdirectory named by its ID:
 *   `<basePath>/nodes/<nodeId>/`
 *   `<basePath>/pods/<podId>/`
 *
 * The LogManager is self-contained and can be created inside workers /
 * subprocesses without needing to clone any non-serializable objects.
 *
 * Usage:
 * ```ts
 * const manager = new LogManager({
 *   entityType: 'pod',
 *   entityId: podId,
 *   basePath: '/logs',
 *   storage: storageAdapter,
 * });
 * await manager.initialize();
 * manager.log({ timestamp: '...', level: 'info', message: 'hello' });
 * // later…
 * const entries = await manager.readLogs();
 * manager.destroy();
 * ```
 */

import type { IStorageAdapter } from '../types/storage-adapter.js';
import type { LogEntry } from './logger.js';
import { LogBuffer, type FlushCallback, FLUSH_INTERVAL_MS } from './log-buffer.js';
import { LogRotator, MAX_SEGMENT_BYTES, MAX_SEGMENT_AGE_MS, MAX_SEGMENTS } from './log-rotator.js';

/**
 * Entity types that own a log directory.
 */
export type LogEntityType = 'node' | 'pod';

/**
 * Configuration for {@link LogManager}.
 */
export interface LogManagerConfig {
  /** Whether this is a node or pod log directory. */
  entityType: LogEntityType;
  /** Unique ID of the node or pod. */
  entityId: string;
  /** Base path under which log directories are created (e.g. `/logs`). */
  basePath: string;
  /** Storage adapter used for file I/O. */
  storage: IStorageAdapter;

  // Optional overrides (mostly for testing)
  flushIntervalMs?: number;
  maxSegmentBytes?: number;
  maxSegmentAgeMs?: number;
  maxSegments?: number;
}

/**
 * High-level log manager that buffers entries in memory and persists them
 * to rotated, per-entity log files via a storage adapter.
 */
export class LogManager {
  private buffer: LogBuffer;
  private rotator: LogRotator;
  private initialized = false;
  private readonly directory: string;

  constructor(config: LogManagerConfig) {
    const dir = `${config.basePath}/${config.entityType}s/${config.entityId}`;
    this.directory = dir;

    this.rotator = new LogRotator({
      directory: dir,
      storage: config.storage,
      maxSegmentBytes: config.maxSegmentBytes ?? MAX_SEGMENT_BYTES,
      maxSegmentAgeMs: config.maxSegmentAgeMs ?? MAX_SEGMENT_AGE_MS,
      maxSegments: config.maxSegments ?? MAX_SEGMENTS,
    });

    // The flush callback is synchronous in the LogBuffer API but may
    // call an async rotator.  We fire-and-forget here – the rotator
    // will queue writes internally.
    const onFlush: FlushCallback = (entries) => {
      void this.rotator.write(entries);
    };

    this.buffer = new LogBuffer({
      flushIntervalMs: config.flushIntervalMs ?? FLUSH_INTERVAL_MS,
      onFlush,
    });
  }

  /**
   * Initialize the underlying rotator (ensures the log directory exists).
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.rotator.initialize();
    this.initialized = true;
  }

  /**
   * Buffer a single log entry.
   * Fatal entries are flushed immediately.
   */
  log(entry: LogEntry): void {
    this.buffer.add(entry);
  }

  /**
   * Read all persisted log entries (across rotated segments).
   * Optionally limit the total number returned (most-recent).
   */
  async readLogs(limit?: number): Promise<LogEntry[]> {
    // Flush pending entries so they're visible in the read.
    this.buffer.flush();
    // Small delay to allow the async rotator write to complete.
    await new Promise((r) => setTimeout(r, 50));
    return this.rotator.readAll(limit);
  }

  /**
   * Return the log directory path for external tools (e.g. CLIs).
   */
  getDirectory(): string {
    return this.directory;
  }

  /**
   * Stop the flush timer and flush remaining entries.
   */
  destroy(): void {
    this.buffer.destroy();
  }
}

/** Default stale-pod threshold: 5 minutes. */
export const STALE_POD_LOG_AGE_MS = 5 * 60 * 1000;

/**
 * Remove pod log directories whose newest segment is older than `maxAgeMs`.
 *
 * Scans `<basePath>/pods/` for subdirectories, checks the mtime of the
 * newest `log-*.jsonl` segment inside each, and deletes the entire directory
 * when all segments are older than the threshold.
 *
 * Directories that belong to pods with an active LogManager (i.e. still
 * running) should be excluded via `activePodIds`.
 *
 * @param storage      Platform storage adapter
 * @param basePath     Base log path (e.g. '' for Node, '/home/.stark/nodes/logs' for browser)
 * @param activePodIds Set of pod IDs that are still running and should not be cleaned
 * @param maxAgeMs     Maximum age in ms for the newest segment before cleanup (default 5 min)
 */
export async function cleanupStalePodLogs(
  storage: IStorageAdapter,
  basePath: string,
  activePodIds: Set<string>,
  maxAgeMs: number = STALE_POD_LOG_AGE_MS,
): Promise<void> {
  const podsDir = `${basePath}/pods`;
  let podDirs: string[];
  try {
    podDirs = await storage.readdir(podsDir);
  } catch {
    return; // pods/ directory doesn't exist yet – nothing to clean
  }

  const now = Date.now();
  for (const podId of podDirs) {
    if (activePodIds.has(podId)) continue;

    const podDir = `${podsDir}/${podId}`;
    try {
      // Check if this is actually a directory
      if (!(await storage.isDirectory(podDir))) continue;

      // Find the newest log segment mtime
      const files = await storage.readdir(podDir);
      const segments = files.filter((f) => f.startsWith('log-') && f.endsWith('.jsonl'));

      if (segments.length === 0) {
        // Empty directory – remove it
        await storage.rmdir(podDir, true);
        continue;
      }

      let newestMtime = 0;
      for (const seg of segments) {
        try {
          const st = await storage.stat(`${podDir}/${seg}`);
          const mt = st.mtime.getTime();
          if (mt > newestMtime) newestMtime = mt;
        } catch {
          // skip unreadable files
        }
      }

      if (newestMtime > 0 && now - newestMtime > maxAgeMs) {
        await storage.rmdir(podDir, true);
      }
    } catch {
      // best-effort – skip problematic directories
    }
  }
}

/**
 * Convenience factory.
 */
export function createLogManager(config: LogManagerConfig): LogManager {
  return new LogManager(config);
}
