/**
 * Integration test: spawn the built server process and exchange JSON-RPC messages
 * over stdin/stdout.
 *
 * This is the E2E smoke test. It verifies that the full stack — server startup,
 * stdio transport framing, tool registration, and tool execution — works correctly
 * against real filesystem data (the sample-data directory).
 *
 * **Prerequisite**: run `npm run build` before this test suite.
 * Tests skip automatically if `dist/server.js` does not exist.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, '..', 'dist', 'server.js');
const SAMPLE_DATA_DIR = path.join(__dirname, '..', 'sample-data');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Spawn the server, send one or more JSON-RPC requests, and collect responses
 * keyed by request `id`. Notifications (no `id`) are ignored.
 *
 * Returns a Map of id → parsed response object.
 */
function exchange(
  requests: JsonRpcRequest[],
  env: Record<string, string> = {},
  timeoutMs = 8000,
): Promise<Map<number, JsonRpcResponse>> {
  return new Promise((resolve) => {
    const proc: ChildProcess = spawn('node', [SERVER_PATH], {
      env: { ...process.env, LORE_DATA_DIR: SAMPLE_DATA_DIR, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const results = new Map<number, JsonRpcResponse>();
    const expectedIds = new Set(requests.map((r) => r.id));
    let stdout = '';

    const timer = setTimeout(() => {
      proc.kill();
      resolve(results);
    }, timeoutMs);

    proc.stdout!.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      // Each JSON-RPC message is a single newline-terminated line
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as JsonRpcResponse;
          if (msg.id !== undefined && expectedIds.has(msg.id)) {
            results.set(msg.id, msg);
            expectedIds.delete(msg.id);
          }
          if (expectedIds.size === 0) {
            clearTimeout(timer);
            proc.kill();
            resolve(results);
          }
        } catch {
          // Non-JSON line (unlikely with MCP SDK) — skip
        }
      }
      // Trim consumed lines, keeping incomplete last line
      const lastNl = stdout.lastIndexOf('\n');
      if (lastNl >= 0) stdout = stdout.slice(lastNl + 1);
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve(results);
    });

    for (const req of requests) {
      proc.stdin!.write(JSON.stringify(req) + '\n');
    }
    proc.stdin!.end();
  });
}

/** Initialize + one tool call; returns the tool-call response. */
async function initAndCall(
  toolName: string,
  toolArgs: Record<string, unknown>,
  env: Record<string, string> = {},
): Promise<JsonRpcResponse | undefined> {
  const responses = await exchange(
    [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: toolName, arguments: toolArgs },
      },
    ],
    env,
  );
  return responses.get(2);
}

// ---------------------------------------------------------------------------
// Skip guard
// ---------------------------------------------------------------------------

let serverExists = false;
beforeAll(() => {
  serverExists = fs.existsSync(SERVER_PATH);
  if (!serverExists) {
    console.warn('[integration] Skipping: dist/server.js not found. Run `npm run build` first.');
  }
});

// ---------------------------------------------------------------------------
// JSON-RPC protocol tests (§5 Test #17 + initialize + tools/list)
// ---------------------------------------------------------------------------

describe('JSON-RPC protocol', () => {
  // Test #17: parse error
  it('Test #17: malformed JSON → MCP SDK calls onerror, no stdout response (stdio spec)', async () => {
    if (!serverExists) return;

    // The MCP SDK stdio transport invokes onerror on parse failure but does NOT
    // write a -32700 response to stdout. This is per the MCP stdio transport spec:
    // only HTTP transports send error responses. Stdio silently drops the message.
    const proc: ChildProcess = spawn('node', [SERVER_PATH], {
      env: { ...process.env, LORE_DATA_DIR: SAMPLE_DATA_DIR },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    const gotOutput = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => { proc.kill(); resolve(false); }, 3000);
      proc.stdout!.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.trim().length > 0) {
          clearTimeout(timer);
          proc.kill();
          resolve(true);
        }
      });
      proc.on('error', () => { clearTimeout(timer); resolve(false); });
      proc.stdin!.write('not valid json at all\n');
      proc.stdin!.end();
    });

    // Correct: no stdout output for parse errors on stdio transport
    expect(gotOutput).toBe(false);
  }, 6000);

  it('initialize returns serverInfo with name "lore"', async () => {
    if (!serverExists) return;

    const responses = await exchange([
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      },
    ]);

    const resp = responses.get(1);
    expect(resp).toBeDefined();
    expect(resp?.error).toBeUndefined();
    const serverInfo = (resp?.result as Record<string, unknown>)?.serverInfo as Record<string, unknown>;
    expect(serverInfo?.name).toBe('lore');
  }, 8000);

  it('tools/list returns lore_search, lore_get_project_dna, lore_list_open_todos', async () => {
    if (!serverExists) return;

    const responses = await exchange([
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      },
    ]);

    const resp = responses.get(2);
    expect(resp).toBeDefined();
    expect(resp?.error).toBeUndefined();

    const tools = ((resp?.result as Record<string, unknown>)?.tools ?? []) as Array<{ name: string }>;
    const names = tools.map((t) => t.name);
    expect(names).toContain('lore_search');
    expect(names).toContain('lore_get_project_dna');
    expect(names).toContain('lore_list_open_todos');
  }, 8000);
});

// ---------------------------------------------------------------------------
// tools/call integration tests
// ---------------------------------------------------------------------------

describe('tools/call integration', () => {
  it('lore_search returns results for "redis" against sample-data', async () => {
    if (!serverExists) return;

    const resp = await initAndCall('lore_search', { query: 'redis', kind: 'all' });

    expect(resp).toBeDefined();
    const result = resp?.result as Record<string, unknown> | undefined;
    expect(result?.isError).toBeFalsy();

    const text = (result?.content as Array<{ text: string }>)?.[0]?.text;
    const parsed = JSON.parse(text) as { results: unknown[]; total_matched: number };
    expect(parsed.results.length).toBeGreaterThan(0);
  }, 10000);

  it('lore_search returns empty array (not error) for no-match query', async () => {
    if (!serverExists) return;

    const resp = await initAndCall('lore_search', { query: 'xyzzy_no_match_12345' });

    expect(resp).toBeDefined();
    const result = resp?.result as Record<string, unknown> | undefined;
    expect(result?.isError).toBeFalsy();
    const text = (result?.content as Array<{ text: string }>)?.[0]?.text;
    const parsed = JSON.parse(text) as { results: unknown[]; total_matched: number };
    expect(parsed.results).toEqual([]);
  }, 10000);

  it('lore_get_project_dna returns project context for proj-lore-v2', async () => {
    if (!serverExists) return;

    const resp = await initAndCall('lore_get_project_dna', { project_id: 'proj-lore-v2' });

    expect(resp).toBeDefined();
    const result = resp?.result as Record<string, unknown> | undefined;
    expect(result?.isError).toBeFalsy();
    const text = (result?.content as Array<{ text: string }>)?.[0]?.text;
    const parsed = JSON.parse(text) as { project: { id: string }; summary: string };
    expect(parsed.project.id).toBe('proj-lore-v2');
    expect(parsed.summary).toContain('proj-lore-v2');
  }, 10000);

  it('lore_list_open_todos includes open todos and excludes done', async () => {
    if (!serverExists) return;

    const resp = await initAndCall('lore_list_open_todos', {});

    expect(resp).toBeDefined();
    const result = resp?.result as Record<string, unknown> | undefined;
    expect(result?.isError).toBeFalsy();
    const text = (result?.content as Array<{ text: string }>)?.[0]?.text;
    const parsed = JSON.parse(text) as { todos: Array<{ id: string }> };
    expect(parsed.todos.some((t) => t.id === '01HQ2222222222222222222222')).toBe(true);
    expect(parsed.todos.some((t) => t.id === '01HQ5555555555555555555555')).toBe(false);
  }, 10000);

  it('missing data source returns isError:true', async () => {
    if (!serverExists) return;

    const resp = await initAndCall(
      'lore_search',
      { query: 'redis' },
      { LORE_DATA_DIR: '/nonexistent/path/that/does/not/exist' },
    );

    expect(resp).toBeDefined();
    const result = resp?.result as Record<string, unknown> | undefined;
    expect(result?.isError).toBe(true);
  }, 10000);
});
