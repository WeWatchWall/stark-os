/**
 * Pod Log Sink
 * @module @stark-o/shared/logging/pod-log-sink
 * 
 * Routes stdout/stderr from pod execution to console with pod metadata.
 * Optionally persists entries via a {@link LogManager} for buffered,
 * rotated, file-backed logging.
 */

import type { LogManager } from './log-manager.js';
import type { LogEntry, LogLevel } from './logger.js';

/**
 * Stream type for distinguishing stdout vs stderr
 */
export type LogStream = 'out' | 'err';

/**
 * Pod metadata for log sink
 */
export interface PodLogSinkMeta {
  podId: string;
  packId: string;
  packVersion: string;
  executionId: string;
}

/**
 * PodLogSink routes stdout/stderr from a pod to console with metadata prefix.
 * When a {@link LogManager} is attached, entries are also persisted to
 * rotated log files.
 * 
 * Must be closed when the pod exits or is killed to release resources
 * and allow cleanup.
 */
export class PodLogSink {
  private readonly meta: PodLogSinkMeta;
  private closed = false;
  private logManager: LogManager | null = null;

  constructor(meta: PodLogSinkMeta, logManager?: LogManager) {
    this.meta = meta;
    this.logManager = logManager ?? null;
  }

  /**
   * Get the pod ID
   */
  get podId(): string {
    return this.meta.podId;
  }

  /**
   * Check if the sink is closed
   */
  get isClosed(): boolean {
    return this.closed;
  }

  /**
   * Attach a LogManager for persistent logging.
   */
  setLogManager(manager: LogManager): void {
    this.logManager = manager;
  }

  /**
   * Write to stdout stream
   */
  stdout(message: string): void {
    this.write('out', message);
  }

  /**
   * Write to stderr stream
   */
  stderr(message: string): void {
    this.write('err', message);
  }

  /**
   * Internal write method
   */
  private write(stream: LogStream, message: string): void {
    if (this.closed) {
      return; // Silently drop messages after close
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}][${this.meta.podId}:${stream}]`;
    
    // Route to appropriate console method
    if (stream === 'err') {
      console.error(prefix, message);
    } else {
      console.log(prefix, message);
    }

    // Persist via LogManager when available
    if (this.logManager) {
      const level: LogLevel = stream === 'err' ? 'error' : 'info';
      const entry: LogEntry = {
        timestamp,
        level,
        message,
        meta: {
          podId: this.meta.podId,
          packId: this.meta.packId,
          stream,
        },
      };
      this.logManager.log(entry);
    }
  }

  /**
   * Close the sink. Must be called when the pod exits or is killed.
   * After close, all writes are silently dropped.
   * Also destroys the attached LogManager (flushes remaining entries).
   */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.logManager) {
      this.logManager.destroy();
    }
  }
}

/**
 * Create a PodLogSink for a pod execution
 */
export function createPodLogSink(meta: PodLogSinkMeta): PodLogSink {
  return new PodLogSink(meta);
}

/**
 * Console-like interface that can be injected into pack execution context.
 * Routes console methods through the PodLogSink.
 */
export interface PodConsole {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

/**
 * Format arguments for logging (exported for reuse in serializable contexts).
 * Converts unknown values to strings suitable for log output.
 */
export function formatLogArgs(args: unknown[]): string {
  return args.map(arg => {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }).join(' ');
}

/**
 * Create a console-like object that routes through a PodLogSink.
 * Useful for injecting into sandboxed pack execution.
 */
export function createPodConsole(sink: PodLogSink): PodConsole {
  return {
    log: (...args: unknown[]) => sink.stdout(formatLogArgs(args)),
    info: (...args: unknown[]) => sink.stdout(formatLogArgs(args)),
    warn: (...args: unknown[]) => sink.stderr(formatLogArgs(args)),
    error: (...args: unknown[]) => sink.stderr(formatLogArgs(args)),
    debug: (...args: unknown[]) => sink.stdout(formatLogArgs(args)),
  };
}

/**
 * Returns JavaScript code that patches console methods to route through pod logging
 * with an embedded in-memory buffer that flushes entries via `postMessage` (browser)
 * or `process.send` (Node.js subprocess).
 * 
 * The code is fully self-contained – no imports, no non-cloneable references.
 * It can be executed via eval() or new Function() inside Web Workers or
 * child processes.
 * 
 * @param podId - The pod ID to include in log prefixes
 * @returns JavaScript code string that patches console methods
 */
export function getPodConsolePatchCode(podId: string): string {
  // Escape podId for safe embedding in string
  const safePodId = podId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  
  return `
(function() {
  var podId = '${safePodId}';
  var originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };
  
  var formatArgs = function(args) {
    return Array.prototype.map.call(args, function(arg) {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return arg.name + ': ' + arg.message;
      try {
        return JSON.stringify(arg);
      } catch (e) {
        return String(arg);
      }
    }).join(' ');
  };

  // ── Embedded log buffer (flush every 5 s, immediate on fatal) ──
  var logBuffer = [];
  var FLUSH_INTERVAL = 5000;

  var flushBuffer = function() {
    if (logBuffer.length === 0) return;
    var batch = logBuffer;
    logBuffer = [];
    // Emit batch via structured-clone-safe message
    try {
      if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof WorkerGlobalScope !== 'undefined') {
        self.postMessage({ type: 'pod-log-batch', podId: podId, entries: batch });
      } else if (typeof process !== 'undefined' && typeof process.send === 'function') {
        process.send({ type: 'pod-log-batch', podId: podId, entries: batch });
      }
    } catch (e) { /* best-effort */ }
  };

  var bufferTimer = setInterval(flushBuffer, FLUSH_INTERVAL);
  if (typeof bufferTimer === 'object' && bufferTimer && typeof bufferTimer.unref === 'function') {
    bufferTimer.unref();
  }

  var addToBuffer = function(level, stream, message) {
    logBuffer.push({
      timestamp: new Date().toISOString(),
      level: level,
      message: message,
      meta: { podId: podId, stream: stream }
    });
    if (level === 'fatal') flushBuffer();
  };

  console.log = function() {
    var msg = formatArgs(arguments);
    originalConsole.log('[' + new Date().toISOString() + '][' + podId + ':out]', msg);
    addToBuffer('info', 'out', msg);
  };
  console.info = function() {
    var msg = formatArgs(arguments);
    originalConsole.log('[' + new Date().toISOString() + '][' + podId + ':out]', msg);
    addToBuffer('info', 'out', msg);
  };
  console.debug = function() {
    var msg = formatArgs(arguments);
    originalConsole.log('[' + new Date().toISOString() + '][' + podId + ':out]', msg);
    addToBuffer('debug', 'out', msg);
  };
  console.warn = function() {
    var msg = formatArgs(arguments);
    originalConsole.error('[' + new Date().toISOString() + '][' + podId + ':err]', msg);
    addToBuffer('warn', 'err', msg);
  };
  console.error = function() {
    var msg = formatArgs(arguments);
    originalConsole.error('[' + new Date().toISOString() + '][' + podId + ':err]', msg);
    addToBuffer('error', 'err', msg);
  };
  
  // Return restore function (also flushes the buffer)
  return function restoreConsole() {
    flushBuffer();
    clearInterval(bufferTimer);
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  };
})()
`.trim();
}
