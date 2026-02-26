/**
 * Log Rotator
 * @module @stark-o/shared/logging/log-rotator
 *
 * Manages size-based and time-based log file rotation with segment
 * retention. Uses the platform-agnostic {@link IStorageAdapter} so it
 * works on both Node.js (FsAdapter) and browsers (OPFS adapter).
 *
 * Rotation policy:
 *   - Rotate when the current segment exceeds {@link MAX_SEGMENT_BYTES} (10 MB).
 *   - Rotate when the current segment is older than {@link MAX_SEGMENT_AGE_MS} (1 h).
 *   - Keep at most {@link MAX_SEGMENTS} segments (default 5).
 *
 * File naming: `<dir>/log-<ISO-timestamp>.jsonl`
 */

import type { IStorageAdapter } from '../types/storage-adapter.js';
import type { LogEntry } from './logger.js';

/** 10 MB per segment. */
export const MAX_SEGMENT_BYTES = 10 * 1024 * 1024;

/** 1 hour per segment. */
export const MAX_SEGMENT_AGE_MS = 60 * 60 * 1000;

/** Number of retained segments. */
export const MAX_SEGMENTS = 5;

/**
 * Configuration for {@link LogRotator}.
 */
export interface LogRotatorConfig {
  /** Directory where log segments are written (relative to storage root). */
  directory: string;
  /** Storage adapter to use for file I/O. */
  storage: IStorageAdapter;
  /** Maximum segment size in bytes. Defaults to {@link MAX_SEGMENT_BYTES}. */
  maxSegmentBytes?: number;
  /** Maximum segment age in ms. Defaults to {@link MAX_SEGMENT_AGE_MS}. */
  maxSegmentAgeMs?: number;
  /** Maximum number of retained segments. Defaults to {@link MAX_SEGMENTS}. */
  maxSegments?: number;
}

/**
 * Manages rotated log segments on disk / OPFS.
 */
export class LogRotator {
  private readonly directory: string;
  private readonly storage: IStorageAdapter;
  private readonly maxSegmentBytes: number;
  private readonly maxSegmentAgeMs: number;
  private readonly maxSegments: number;

  /** Name of the current segment file (relative to directory). */
  private currentSegment: string | null = null;
  /** Byte size of the current segment (tracked in memory). */
  private currentSize = 0;
  /** Timestamp when the current segment was started. */
  private segmentStartTime = 0;

  private initialized = false;

  constructor(config: LogRotatorConfig) {
    this.directory = config.directory;
    this.storage = config.storage;
    this.maxSegmentBytes = config.maxSegmentBytes ?? MAX_SEGMENT_BYTES;
    this.maxSegmentAgeMs = config.maxSegmentAgeMs ?? MAX_SEGMENT_AGE_MS;
    this.maxSegments = config.maxSegments ?? MAX_SEGMENTS;
  }

  /**
   * Ensure the log directory exists.
   * Must be called before the first {@link write}.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.storage.mkdir(this.directory, true);
    this.initialized = true;
  }

  /**
   * Write a batch of log entries, handling rotation as needed.
   */
  async write(entries: LogEntry[]): Promise<void> {
    if (entries.length === 0) return;
    if (!this.initialized) await this.initialize();

    const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    const lineBytes = new TextEncoder().encode(lines).byteLength;

    // Rotate if necessary before writing.
    if (this.needsRotation(lineBytes)) {
      await this.rotate();
    }

    // Open a new segment if none is active.
    if (!this.currentSegment) {
      this.openNewSegment();
    }

    const segmentPath = `${this.directory}/${this.currentSegment}`;
    await this.storage.appendFile(segmentPath, lines);
    this.currentSize += lineBytes;
  }

  /**
   * Retrieve all log lines across retained segments (oldest first).
   * Optionally limit the total number of lines returned.
   */
  async readAll(limit?: number): Promise<LogEntry[]> {
    if (!this.initialized) await this.initialize();

    const files = await this.listSegments();
    const entries: LogEntry[] = [];

    for (const file of files) {
      const content = await this.storage.readFile(`${this.directory}/${file}`);
      const lines = content.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line) as LogEntry);
        } catch {
          // skip malformed lines
        }
      }
    }

    if (limit !== undefined && limit > 0) {
      return entries.slice(-limit);
    }
    return entries;
  }

  /**
   * Return the sorted list of segment file names (oldest first).
   */
  async listSegments(): Promise<string[]> {
    try {
      const files = await this.storage.readdir(this.directory);
      return files
        .filter((f) => f.startsWith('log-') && f.endsWith('.jsonl'))
        .sort();
    } catch {
      return [];
    }
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private needsRotation(pendingBytes: number): boolean {
    if (!this.currentSegment) return false;
    if (this.currentSize + pendingBytes > this.maxSegmentBytes) return true;
    if (Date.now() - this.segmentStartTime > this.maxSegmentAgeMs) return true;
    return false;
  }

  private async rotate(): Promise<void> {
    this.currentSegment = null;
    this.currentSize = 0;
    this.segmentStartTime = 0;

    // Prune old segments beyond the retention limit.
    const segments = await this.listSegments();
    // -1 because we're about to create a new one.
    const excess = segments.length - (this.maxSegments - 1);
    if (excess > 0) {
      for (let i = 0; i < excess; i++) {
        try {
          await this.storage.unlink(`${this.directory}/${segments[i]}`);
        } catch {
          // best-effort cleanup
        }
      }
    }
  }

  private openNewSegment(): void {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    this.currentSegment = `log-${ts}.jsonl`;
    this.currentSize = 0;
    this.segmentStartTime = Date.now();
  }
}
