/**
 * Structured logging interface for Lore v2.
 *
 * `console.log` is prohibited in v2 code. Use this logger instead.
 * The production implementation emits JSON-formatted lines to the console.
 * Tests use the in-memory collector to assert on log output.
 *
 * @since 0.2.0
 *
 * @example
 * ```ts
 * import { consoleLogger } from './logger';
 * consoleLogger.info('migration.started', { total: logs.length });
 * ```
 */

// ---- Interface ----

/**
 * Structured logger interface. All fields in `fields` must be JSON-serializable.
 *
 * @example
 * ```ts
 * const logger: Logger = consoleLogger;
 * logger.info('session.created', { sessionId: 'abc', title: 'My session' });
 * ```
 */
export interface Logger {
  debug(event: string, fields: Record<string, unknown>): void;
  info(event: string, fields: Record<string, unknown>): void;
  warn(event: string, fields: Record<string, unknown>): void;
  error(event: string, fields: Record<string, unknown>): void;
}

// ---- Log entry type ----

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly level: LogLevel;
  readonly event: string;
  readonly fields: Record<string, unknown>;
  readonly ts: number;
}

// ---- Production implementation ----

function makeEntry(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown>,
): LogEntry {
  return { level, event, fields, ts: Date.now() };
}

/**
 * Production logger that writes JSON lines to the browser console.
 * Uses `console.error` / `console.warn` / `console.info` / `console.debug`
 * so browser DevTools log-level filters apply.
 *
 * @example
 * ```ts
 * consoleLogger.error('db.quota_exceeded', { context: 'migration' });
 * ```
 */
export const consoleLogger: Logger = {
  debug(event, fields) {
    // eslint-disable-next-line no-console
    console.debug(JSON.stringify(makeEntry('debug', event, fields)));
  },
  info(event, fields) {
    // eslint-disable-next-line no-console
    console.info(JSON.stringify(makeEntry('info', event, fields)));
  },
  warn(event, fields) {
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify(makeEntry('warn', event, fields)));
  },
  error(event, fields) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(makeEntry('error', event, fields)));
  },
};

// ---- No-op (silent) logger ----

/**
 * A logger that discards all output. Useful when a Logger is required but
 * output is not desired (e.g. benchmark tests).
 */
export const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

// ---- In-memory collector (for tests) ----

/**
 * An in-memory logger that collects all log entries for assertion in tests.
 *
 * @example
 * ```ts
 * const { logger, entries } = createMemoryLogger();
 * service.doWork(logger);
 * expect(entries).toContainEqual(expect.objectContaining({ event: 'migration.completed' }));
 * ```
 */
export interface MemoryLogger extends Logger {
  readonly entries: LogEntry[];
  clear(): void;
}

export function createMemoryLogger(): MemoryLogger {
  const entries: LogEntry[] = [];
  function record(level: LogLevel, event: string, fields: Record<string, unknown>): void {
    entries.push(makeEntry(level, event, fields));
  }
  return {
    get entries() { return entries; },
    clear() { entries.length = 0; },
    debug: (e, f) => record('debug', e, f),
    info:  (e, f) => record('info',  e, f),
    warn:  (e, f) => record('warn',  e, f),
    error: (e, f) => record('error', e, f),
  };
}
