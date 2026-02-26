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

/**
 * Convenience factory.
 */
export function createLogManager(config: LogManagerConfig): LogManager {
  return new LogManager(config);
}
