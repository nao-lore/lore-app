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
  GetProjectDnaInput,
  ListOpenTodosInput,
} from './tools/definitions.js';
import { runLoreSearch } from './tools/search.js';
import { runGetProjectDna } from './tools/project_dna.js';
import { runListOpenTodos } from './tools/open_todos.js';
import { formatMcpError } from './errors.js';
import { createStderrLogger } from './logger.js';
import type { DataSource } from './ports/data-source.js';

const log = createStderrLogger(
  (process.env['LOG_LEVEL'] as 'debug' | 'info' | 'warn' | 'error' | undefined) ?? 'info',
);

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

      const output = runLoreSearch(loadResult.value, parsed.data);
      log.info('tool.lore_search.ok', { total_matched: output.total_matched });
      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
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

      const output = runGetProjectDna(loadResult.value, parsed.data);
      log.info('tool.lore_get_project_dna.ok', { project_id: parsed.data.project_id });
      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
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

      const output = runListOpenTodos(loadResult.value, parsed.data);
      log.info('tool.lore_list_open_todos.ok', { count: output.todos.length });
      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    },
  );

  return server;
}

// ---- Main entrypoint ----
const server = createServer();
const transport = new StdioServerTransport();

/** Graceful shutdown: close the MCP server cleanly on SIGTERM/SIGINT. */
async function shutdown(signal: string): Promise<void> {
  log.info('server.shutdown', { signal });
  try {
    await server.close();
  } catch (cause) {
    log.error('server.shutdown.error', { cause: cause instanceof Error ? cause.message : String(cause) });
  }
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await server.connect(transport);
log.info('server.started', { version: '0.1.0' });
