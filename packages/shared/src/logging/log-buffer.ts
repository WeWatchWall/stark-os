/**
 * Log Buffer
 * @module @stark-o/shared/logging/log-buffer
 *
 * In-memory buffer for log entries with periodic flushing.
 * Buffers entries and flushes them via a callback every {@link FLUSH_INTERVAL_MS}
 * milliseconds. A fatal-level entry triggers an immediate flush.
 *
 * Designed to work identically in Node.js main threads, child processes,
 * browser main threads, and Web Workers – no non-cloneable references.
 */

import type { LogEntry } from './logger.js';

/** Default flush interval in milliseconds (5 s). */
export const FLUSH_INTERVAL_MS = 5_000;

/**
 * Callback invoked when the buffer needs to be persisted.
 * Receives the batch of entries accumulated since the last flush.
 */
export type FlushCallback = (entries: LogEntry[]) => void | Promise<void>;

/**
 * Configuration for {@link LogBuffer}.
 */
export interface LogBufferConfig {
  /** Flush interval in milliseconds. Defaults to {@link FLUSH_INTERVAL_MS}. */
  flushIntervalMs?: number;
  /** Callback invoked on each flush. */
  onFlush: FlushCallback;
}

/**
 * In-memory buffer that accumulates {@link LogEntry} objects and
 * periodically flushes them via the configured callback.
 *
 * - Flushes every `flushIntervalMs` (default 5 s).
 * - Force-flushes immediately when a `fatal` entry is added.
 * - Flushes remaining entries on {@link destroy}.
 */
export class LogBuffer {
  private buffer: LogEntry[] = [];
  private readonly flushIntervalMs: number;
  private readonly onFlush: FlushCallback;
  private timer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(config: LogBufferConfig) {
    this.flushIntervalMs = config.flushIntervalMs ?? FLUSH_INTERVAL_MS;
    this.onFlush = config.onFlush;
    this.startTimer();
  }

  /**
   * Add a log entry to the buffer.
   * If the entry level is `fatal`, the buffer is flushed immediately.
   */
  add(entry: LogEntry): void {
    if (this.destroyed) return;
    this.buffer.push(entry);

    if (entry.level === 'fatal') {
      this.flush();
    }
  }

  /**
   * Flush all buffered entries via the configured callback.
   * No-op when the buffer is empty.
   */
  flush(): void {
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    try {
      this.onFlush(batch);
    } catch {
      // Best-effort – avoid crashing the process on flush errors.
    }
  }

  /**
   * Return the number of entries currently buffered (useful for tests).
   */
  get size(): number {
    return this.buffer.length;
  }

  /**
   * Stop the flush timer and flush remaining entries.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopTimer();
    this.flush();
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private startTimer(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
    // Allow the process / worker to exit even if the timer is still active.
    if (typeof this.timer === 'object' && 'unref' in this.timer) {
      (this.timer as NodeJS.Timeout).unref();
    }
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
