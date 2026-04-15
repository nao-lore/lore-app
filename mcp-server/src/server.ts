#!/usr/bin/env node
/**
 * Lore MCP Server — entry point.
 *
 * Exposes three read-only tools via stdio transport (JSON-RPC 2.0):
 *   - `lore_search`           — full-text search across all entry kinds
 *   - `lore_get_project_dna`  — project context: decisions, blockers, learnings
 *   - `lore_list_open_todos`  — open todos, optionally scoped to a project
 *
 * Data source: `~/.lore/projects/*.md` (override with `LORE_DATA_DIR`).
 * Stdout is reserved for JSON-RPC messages; all logging goes to stderr.
 *
 * @see README.md for Claude Desktop / Cursor configuration.
 * @see docs/adr/0006-mcp-markdown-reader-for-mvp.md for data source choice.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MarkdownDataSource } from './data/markdown_reader.js';
import {
  LoreSearchInput,
  LoreSearchOutput,
  GetProjectDnaInput,
  GetProjectDnaOutput,
  ListOpenTodosInput,
  ListOpenTodosOutput,
} from './tools/definitions.js';
import { runLoreSearch } from './tools/search.js';
import { runGetProjectDna } from './tools/project_dna.js';
import { runListOpenTodos } from './tools/open_todos.js';
import { formatMcpError } from './errors.js';
import type { LogLevel } from './logger.js';
import { createStderrLogger } from './logger.js';
import type { DataSource } from './ports/data-source.js';

// Validate LORE_LOG_LEVEL at startup — invalid value causes immediate failure.
const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error'] as const);
const rawLogLevel = process.env['LORE_LOG_LEVEL'] ?? 'info';
const logLevelResult = LogLevelSchema.safeParse(rawLogLevel);
if (!logLevelResult.success) {
  process.stderr.write(
    `Fatal: invalid LORE_LOG_LEVEL "${rawLogLevel}". Must be one of: debug, info, warn, error\n`,
  );
  process.exit(1);
}
const log = createStderrLogger(logLevelResult.data as LogLevel);

/**
 * Build and wire the MCP server.
 *
 * Accepts an optional `dataSource` for dependency injection in tests.
 * Production code uses the default {@link MarkdownDataSource}.
 */
export function createServer(dataSource?: DataSource): McpServer {
  const ds: DataSource = dataSource ?? new MarkdownDataSource();
  const server = new McpServer({ name: 'lore', version: '0.1.0' });

  // ---- lore_search ----
  server.tool(
    'lore_search',
    'Search Lore project context: decisions, todos, blockers, learnings, and messages.',
    {
      query: z.string().min(1).max(500).describe('Literal search string (case-insensitive)'),
      kind: z
        .enum(['all', 'decision', 'todo', 'blocker', 'learning', 'message'])
        .default('all')
        .describe('Filter by entry kind; "all" searches every kind'),
      project_id: z.string().optional().describe('Restrict results to a single project ID'),
      limit: z
        .number().int().min(1).max(50).default(20)
        .describe('Maximum number of results to return'),
    },
    async (rawInput) => {
      const parsed = LoreSearchInput.safeParse(rawInput);
      if (!parsed.success) {
        log.warn('tool.lore_search.invalid_input', { error: parsed.error.message });
        return {
          content: [{ type: 'text', text: `Invalid input: ${parsed.error.message}` }],
          isError: true,
        };
      }

      log.debug('tool.lore_search.called', { query: parsed.data.query, kind: parsed.data.kind });

      const loadResult = await ds.load();
      if (!loadResult.ok) {
        log.warn('tool.lore_search.data_source_unavailable', { error: loadResult.error.code });
        return {
          content: [{ type: 'text', text: formatMcpError(loadResult.error) }],
          isError: true,
        };
      }

      const rawOutput = runLoreSearch(loadResult.value, parsed.data);
      const outputParsed = LoreSearchOutput.safeParse(rawOutput);
      if (!outputParsed.success) {
        log.error('tool.lore_search.output_validation_failed', { error: outputParsed.error.message });
        return {
          content: [{ type: 'text', text: 'Output validation failed' }],
          isError: true,
        };
      }
      log.info('tool.lore_search.ok', { total_matched: outputParsed.data.total_matched });
      return {
        content: [{ type: 'text', text: JSON.stringify(outputParsed.data, null, 2) }],
        structuredContent: outputParsed.data,
      };
    },
  );

  // ---- lore_get_project_dna ----
  server.tool(
    'lore_get_project_dna',
    'Get full project context: active decisions, open blockers, and recent learnings.',
    {
      project_id: z.string().describe('The project ID to retrieve context for'),
    },
    async (rawInput) => {
      const parsed = GetProjectDnaInput.safeParse(rawInput);
      if (!parsed.success) {
        log.warn('tool.lore_get_project_dna.invalid_input', { error: parsed.error.message });
        return {
          content: [{ type: 'text', text: `Invalid input: ${parsed.error.message}` }],
          isError: true,
        };
      }

      log.debug('tool.lore_get_project_dna.called', { project_id: parsed.data.project_id });

      const loadResult = await ds.load();
      if (!loadResult.ok) {
        log.warn('tool.lore_get_project_dna.data_source_unavailable', { error: loadResult.error.code });
        return {
          content: [{ type: 'text', text: formatMcpError(loadResult.error) }],
          isError: true,
        };
      }

      const rawOutput = runGetProjectDna(loadResult.value, parsed.data);
      const outputParsed = GetProjectDnaOutput.safeParse(rawOutput);
      if (!outputParsed.success) {
        log.error('tool.lore_get_project_dna.output_validation_failed', { error: outputParsed.error.message });
        return {
          content: [{ type: 'text', text: 'Output validation failed' }],
          isError: true,
        };
      }
      log.info('tool.lore_get_project_dna.ok', { project_id: parsed.data.project_id });
      return {
        content: [{ type: 'text', text: JSON.stringify(outputParsed.data, null, 2) }],
        structuredContent: outputParsed.data,
      };
    },
  );

  // ---- lore_list_open_todos ----
  server.tool(
    'lore_list_open_todos',
    'List open todos from Lore project context, optionally filtered by project.',
    {
      project_id: z.string().optional().describe('Filter by project ID'),
      limit: z
        .number().int().min(1).max(100).default(50)
        .describe('Maximum number of todos to return'),
    },
    async (rawInput) => {
      const parsed = ListOpenTodosInput.safeParse(rawInput);
      if (!parsed.success) {
        log.warn('tool.lore_list_open_todos.invalid_input', { error: parsed.error.message });
        return {
          content: [{ type: 'text', text: `Invalid input: ${parsed.error.message}` }],
          isError: true,
        };
      }

      log.debug('tool.lore_list_open_todos.called', { project_id: parsed.data.project_id });

      const loadResult = await ds.load();
      if (!loadResult.ok) {
        log.warn('tool.lore_list_open_todos.data_source_unavailable', { error: loadResult.error.code });
        return {
          content: [{ type: 'text', text: formatMcpError(loadResult.error) }],
          isError: true,
        };
      }

      const rawOutput = runListOpenTodos(loadResult.value, parsed.data);
      const outputParsed = ListOpenTodosOutput.safeParse(rawOutput);
      if (!outputParsed.success) {
        log.error('tool.lore_list_open_todos.output_validation_failed', { error: outputParsed.error.message });
        return {
          content: [{ type: 'text', text: 'Output validation failed' }],
          isError: true,
        };
      }
      log.info('tool.lore_list_open_todos.ok', { count: outputParsed.data.todos.length });
      return {
        content: [{ type: 'text', text: JSON.stringify(outputParsed.data, null, 2) }],
        structuredContent: outputParsed.data,
      };
    },
  );

  return server;
}

// ---- Main entrypoint ----

/** Graceful shutdown: close the MCP server cleanly on SIGTERM/SIGINT. */
async function shutdown(server: McpServer, signal: string): Promise<void> {
  log.info('server.shutdown', { signal });
  try {
    await server.close();
  } catch (cause) {
    log.error('server.shutdown.error', { cause: cause instanceof Error ? cause.message : String(cause) });
  }
  process.exit(0);
}

/**
 * Entry point — gated behind import.meta.url check so that importing this
 * module in tests does not start the server.
 */
async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  process.on('SIGTERM', () => void shutdown(server, 'SIGTERM'));
  process.on('SIGINT', () => void shutdown(server, 'SIGINT'));

  await server.connect(transport);
  log.info('server.started', { version: '0.1.0' });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    log.error('server.fatal', { cause: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
