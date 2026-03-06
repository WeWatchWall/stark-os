/**
 * Structured JSON logger with correlation IDs
 * @module @stark-o/shared/logging/logger
 */

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Log level numeric values for comparison
 */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

/**
 * Snapshot of the original console methods captured at module load time.
 * This prevents the Logger from going through any console patches
 * applied later (e.g. by pod console interceptors), which would
 * otherwise cause duplicate prefixes.
 */
const ORIGINAL_CONSOLE = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

/**
 * Persist callback type for directing log entries to a secondary
 * destination (e.g. LogManager for file-based persistence).
 */
export type LogPersistFn = (entry: LogEntry) => void;

/**
 * Log entry metadata
 */
export interface LogMeta {
  /** Correlation ID for request tracing */
  correlationId?: string;
  /** Request ID */
  requestId?: string;
  /** User ID */
  userId?: string;
  /** Service name */
  service?: string;
  /** Component name */
  component?: string;
  /** Additional context */
  [key: string]: unknown;
}

/**
 * Structured log entry
 */
export interface LogEntry {
  /** ISO timestamp */
  timestamp: string;
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Metadata */
  meta?: LogMeta;
  /** Error details */
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string | number;
  };
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Minimum log level */
  level: LogLevel;
  /** Service name */
  service?: string;
  /** Component name */
  component?: string;
  /** Pretty print output (development) */
  pretty?: boolean;
  /** Enable timestamps */
  timestamps?: boolean;
  /** Custom output function */
  output?: (entry: LogEntry) => void;
  /** Persist callback for secondary output (e.g. LogManager file persistence) */
  persist?: LogPersistFn;
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  timestamps: true,
  pretty: false,
};

/**
 * Structured JSON logger
 */
export class Logger {
  private config: LoggerConfig;
  private meta: LogMeta;
  private _persist: LogPersistFn | null = null;

  constructor(config: Partial<LoggerConfig> = {}, meta: LogMeta = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.meta = {
      ...meta,
      service: config.service || meta.service,
      component: config.component || meta.component,
    };
    if (config.persist) {
      this._persist = config.persist;
    }
  }

  /**
   * Set or replace the persist callback.
   * Useful when the LogManager is initialised after the Logger is created.
   */
  setPersist(fn: LogPersistFn | null): void {
    this._persist = fn;
  }

  /**
   * Check if a log level is enabled
   */
  private isLevelEnabled(level: LogLevel): boolean {
    return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[this.config.level];
  }

  /**
   * Format and output a log entry
   */
  private log(level: LogLevel, message: string, meta?: LogMeta, error?: Error): void {
    if (!this.isLevelEnabled(level)) {
      return;
    }

    // Sanitize message to prevent log injection via newlines/control characters
    const sanitizedMessage = message.replace(/[\r\n]/g, ' ').replace(/[\x00-\x1f\x7f]/g, '');

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: sanitizedMessage,
    };

    // Merge metadata
    const mergedMeta = { ...this.meta, ...meta };
    if (Object.keys(mergedMeta).length > 0) {
      entry.meta = mergedMeta;
    }

    // Add error details
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
      // Include error code if available
      if ('code' in error) {
        entry.error.code = (error as Error & { code?: string | number }).code;
      }
    }

    // Output the entry (console / custom output)
    if (this.config.output) {
      this.config.output(entry);
    } else {
      this.defaultOutput(entry);
    }

    // Persist the entry (file / LogManager) if configured
    if (this._persist) {
      this._persist(entry);
    }
  }

  /**
   * Default output to console.
   * Uses original console references captured at module load time so that
   * pod-level console patches do not inject duplicate prefixes.
   */
  private defaultOutput(entry: LogEntry): void {
    const output = this.config.pretty ? this.formatPretty(entry) : JSON.stringify(entry);

    switch (entry.level) {
      case 'debug':
        ORIGINAL_CONSOLE.debug(output);
        break;
      case 'info':
        ORIGINAL_CONSOLE.info(output);
        break;
      case 'warn':
        ORIGINAL_CONSOLE.warn(output);
        break;
      case 'error':
      case 'fatal':
        ORIGINAL_CONSOLE.error(output);
        break;
    }
  }

  /**
   * Format log entry for pretty printing
   */
  private formatPretty(entry: LogEntry): string {
    const levelColors: Record<LogLevel, string> = {
      debug: '\x1b[90m', // Gray
      info: '\x1b[36m',  // Cyan
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m', // Red
      fatal: '\x1b[35m', // Magenta
    };
    const reset = '\x1b[0m';
    const color = levelColors[entry.level];
    const levelStr = entry.level.toUpperCase().padEnd(5);

    let output = `${entry.timestamp} ${color}${levelStr}${reset}`;

    if (entry.meta?.component) {
      output += ` ${color}[${entry.meta.component}]${reset}`;
    }

    output += ` ${entry.message}`;

    if (entry.meta?.correlationId) {
      output += ` ${color}[${entry.meta.correlationId}]${reset}`;
    }

    // Serialize remaining meta (exclude well-known fields already rendered)
    if (entry.meta) {
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(entry.meta)) {
        if (k !== 'component' && k !== 'correlationId' && k !== 'service' && v !== undefined) {
          extra[k] = v;
        }
      }
      if (Object.keys(extra).length > 0) {
        output += ` ${JSON.stringify(extra)}`;
      }
    }

    if (entry.error) {
      output += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\n${entry.error.stack}`;
      }
    }

    return output;
  }

  /**
   * Create a child logger with additional metadata
   */
  child(meta: LogMeta): Logger {
    const child = new Logger(this.config, { ...this.meta, ...meta });
    child._persist = this._persist;
    return child;
  }

  /**
   * Create a child logger with a correlation ID
   */
  withCorrelationId(correlationId: string): Logger {
    return this.child({ correlationId });
  }

  /**
   * Create a child logger with a request ID
   */
  withRequestId(requestId: string): Logger {
    return this.child({ requestId });
  }

  /**
   * Create a child logger with a user ID
   */
  withUserId(userId: string): Logger {
    return this.child({ userId });
  }

  /**
   * Log a debug message
   */
  debug(message: string, meta?: LogMeta): void {
    this.log('debug', message, meta);
  }

  /**
   * Log an info message
   */
  info(message: string, meta?: LogMeta): void {
    this.log('info', message, meta);
  }

  /**
   * Log a warning message
   */
  warn(message: string, meta?: LogMeta): void {
    this.log('warn', message, meta);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | LogMeta, meta?: LogMeta): void {
    if (error instanceof Error) {
      this.log('error', message, meta, error);
    } else {
      this.log('error', message, error);
    }
  }

  /**
   * Log a fatal error message
   */
  fatal(message: string, error?: Error | LogMeta, meta?: LogMeta): void {
    if (error instanceof Error) {
      this.log('fatal', message, meta, error);
    } else {
      this.log('fatal', message, error);
    }
  }
}

/**
 * Check if running in test environment
 */
export function isTestEnvironment(): boolean {
  return (
    process?.env?.NODE_ENV === 'test' ||
    process?.env?.VITEST === 'true' ||
    process?.env?.JEST_WORKER_ID !== undefined
  );
}

/**
 * Get the default log level based on environment
 */
function getDefaultLogLevel(): LogLevel {
  // In test environment, suppress logs unless explicitly set
  if (isTestEnvironment() && !process?.env?.LOG_LEVEL) {
    return 'fatal'; // Only show fatal errors during tests
  }
  return (process?.env?.LOG_LEVEL as LogLevel) || 'info';
}

/**
 * Silent output function for tests
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function silentOutput(_entry: LogEntry): void {
  // Intentionally empty - suppresses all output
}

/**
 * Create a new logger instance (basic, does not apply test environment detection)
 */
export function createLogger(config?: Partial<LoggerConfig>, meta?: LogMeta): Logger {
  return new Logger(config, meta);
}

/**
 * Create a logger instance with test environment detection
 * Automatically suppresses output during tests unless LOG_LEVEL is explicitly set
 */
export function createServiceLogger(config?: Partial<LoggerConfig>, meta?: LogMeta): Logger {
  const testConfig: Partial<LoggerConfig> = {};
  
  // In test environment, override to suppress logs unless LOG_LEVEL is set
  if (isTestEnvironment() && !process?.env?.LOG_LEVEL) {
    testConfig.level = 'fatal';
    testConfig.output = silentOutput;
  }
  
  return new Logger({ ...config, ...testConfig }, meta);
}

/**
 * Default logger instance
 */
export const logger = createLogger({
  level: getDefaultLogLevel(),
  pretty: process?.env?.NODE_ENV !== 'production',
  service: 'stark-orchestrator',
  // Use silent output in test environment unless LOG_LEVEL is explicitly set
  output: isTestEnvironment() && !process?.env?.LOG_LEVEL ? silentOutput : undefined,
});

/**
 * Generate a correlation ID
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}
