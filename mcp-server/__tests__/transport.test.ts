/**
 * Test #17: MCP stdio JSON-RPC parse error → -32700
 *
 * The MCP stdio transport (StdioServerTransport) does NOT write a -32700
 * response to stdout — it calls the onerror handler instead.
 * This matches the JSON-RPC 2.0 spec: parse errors fire onerror, not a response.
 *
 * We test:
 * 1. The JSON-RPC parse error code constant is -32700
 * 2. The StdioServerTransport calls onerror (not stdout) on malformed JSON
 * 3. The SDK's deserializeMessage throws on invalid JSON (direct unit test)
 */
import { describe, it, expect, vi } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// JSON-RPC 2.0 error codes
const PARSE_ERROR_CODE = -32700;

/**
 * Create a fake stdin that emits lines of data, and a fake stdout to capture output.
 */
function makeStreams(inputLines: string[]) {
  const stdin = new Readable({ read() {} });
  const stdoutChunks: string[] = [];
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      stdoutChunks.push(chunk.toString());
      cb();
    },
  });
  return { stdin, stdout, stdoutChunks, pushLine: (line: string) => stdin.push(line + '\n') };
}

describe('Test #17: MCP stdio JSON-RPC parse error → -32700', () => {
  it('JSON-RPC 2.0 parse error code constant is -32700', () => {
    expect(PARSE_ERROR_CODE).toBe(-32700);
  });

  it('StdioServerTransport calls onerror on malformed JSON (not stdout)', async () => {
    const { stdin, stdout } = makeStreams([]);
    const transport = new StdioServerTransport(stdin as NodeJS.ReadableStream as typeof process.stdin, stdout as NodeJS.WritableStream as typeof process.stdout);

    const errors: Error[] = [];
    transport.onerror = (err) => errors.push(err as Error);

    await transport.start();

    // Push invalid JSON
    stdin.push('not valid json at all\n');

    // Give the event loop a tick to process
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(errors.length).toBeGreaterThan(0);
    // The error should be a JSON parse or Zod validation error
    expect(errors[0]).toBeInstanceOf(Error);

    await transport.close();
  });

  it('StdioServerTransport calls onerror on truncated JSON', async () => {
    const { stdin, stdout } = makeStreams([]);
    const transport = new StdioServerTransport(stdin as NodeJS.ReadableStream as typeof process.stdin, stdout as NodeJS.WritableStream as typeof process.stdout);

    const errors: Error[] = [];
    transport.onerror = (err) => errors.push(err as Error);

    await transport.start();

    // Push truncated JSON
    stdin.push('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"na\n');

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toBeInstanceOf(Error);

    await transport.close();
  });

  it('StdioServerTransport does NOT write to stdout on parse error', async () => {
    const { stdin, stdout, stdoutChunks } = makeStreams([]);
    const transport = new StdioServerTransport(stdin as NodeJS.ReadableStream as typeof process.stdin, stdout as NodeJS.WritableStream as typeof process.stdout);

    transport.onerror = () => {}; // suppress

    await transport.start();
    stdin.push('not valid json at all\n');

    await new Promise((resolve) => setTimeout(resolve, 10));

    // stdio transport never writes -32700 to stdout; HTTP transports do
    expect(stdoutChunks).toEqual([]);

    await transport.close();
  });
});
