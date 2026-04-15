/**
 * Structured JSON logger for the Lore MCP Server.
 *
 * Writes to **stderr** exclusively. stdout is reserved for JSON-RPC messages
 * and must not receive any non-protocol output.
 *
 * In production, each log line is a JSON object with at minimum:
 * `{ "level": "info", "event": "tool.called", "ts": 1713168000000, ... }`
 *
 * In tests, use {@link createInMemoryLogger} to capture log output without
 * side effects.
 *
 * @example
 * ```ts
 * const log = createStderrLogger('info');
 * log.info('tool.called', { tool: 'lore_search', query: 'redis' });
 * log.error('tool.failed', { tool: 'lore_search', error: 'DATA_SOURCE_MISSING' });
 * ```
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Logger interface — injectable for testing. */
export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Creates a logger that writes JSON lines to stderr.
 *
 * @param minLevel - Minimum level to emit. Defaults to `'info'`.
 *
 * @example
 * ```ts
 * const log = createStderrLogger('debug');
 * log.debug('server.start', { version: '0.1.0' });
 * ```
 */
export function createStderrLogger(minLevel: LogLevel = 'info'): Logger {
  const minLevelNum = LEVELS[minLevel];

  function write(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
    if (LEVELS[level] < minLevelNum) return;
    const line = JSON.stringify({ level, event, ts: Date.now(), ...fields });
    process.stderr.write(line + '\n');
  }

  return {
    debug: (event, fields) => write('debug', event, fields),
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
}

/** Captured log entry for testing. */
export interface LogEntry {
  readonly level: LogLevel;
  readonly event: string;
  readonly fields: Record<string, unknown>;
}

/**
 * Creates a logger that captures entries in memory — for use in tests.
 *
 * @example
 * ```ts
 * const { logger, entries } = createInMemoryLogger();
 * logger.info('test.event', { x: 1 });
 * expect(entries).toHaveLength(1);
 * expect(entries[0].event).toBe('test.event');
 * ```
 */
export function createInMemoryLogger(): { logger: Logger; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  const logger: Logger = {
    debug: (event, fields = {}) => entries.push({ level: 'debug', event, fields }),
    info: (event, fields = {}) => entries.push({ level: 'info', event, fields }),
    warn: (event, fields = {}) => entries.push({ level: 'warn', event, fields }),
    error: (event, fields = {}) => entries.push({ level: 'error', event, fields }),
  };
  return { logger, entries };
}
