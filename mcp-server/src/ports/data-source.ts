/**
 * DataSource port — the primary abstraction between MCP tools and storage backends.
 *
 * Following the Ports & Adapters (Hexagonal Architecture) pattern:
 * - This file defines the **port** (interface contract).
 * - {@link ../data/markdown_reader.ts} implements the **adapter** for MVP Markdown files.
 * - A future `SqliteDataSource` can replace the adapter without changing any tool logic.
 *
 * @see docs/adr/0006-mcp-markdown-reader-for-mvp.md
 *
 * @example
 * ```ts
 * // Inject in tests
 * const ds: DataSource = new MarkdownDataSource('/tmp/test-data');
 * const store = await ds.load();
 *
 * // Or use the in-memory adapter for unit tests
 * const ds: DataSource = new InMemoryDataSource([aLoreEntry({ kind: 'decision' })]);
 * ```
 */

import type { Result } from '../result.js';
import type { LoreMcpError } from '../errors.js';
import type { LoreEntry } from '../data/types.js';

/** Snapshot of all entries loaded from the backing store. */
export interface DataSnapshot {
  /** All parsed entries, in file-system discovery order. */
  readonly entries: readonly LoreEntry[];
  /** Unix epoch ms at which this snapshot was taken. */
  readonly loaded_at: number;
}

/**
 * Port interface for Lore data backends.
 *
 * Implementations must be **read-only** — MCP tools never write.
 *
 * @example
 * ```ts
 * class MarkdownDataSource implements DataSource {
 *   constructor(private readonly dir: string) {}
 *   async load(): Promise<Result<DataSnapshot, LoreMcpError>> { ... }
 *   isAvailable(): boolean { return fs.existsSync(this.dir); }
 * }
 * ```
 */
export interface DataSource {
  /**
   * Load all entries from the backing store.
   *
   * Returns `ok(snapshot)` on success (even if there are zero entries).
   * Returns `err(LoreMcpError)` only on unrecoverable I/O failure.
   *
   * @example
   * ```ts
   * const result = await dataSource.load();
   * if (!result.ok) {
   *   return { content: [{ type: 'text', text: formatMcpError(result.error) }], isError: true };
   * }
   * const { entries } = result.value;
   * ```
   */
  load(): Promise<Result<DataSnapshot, LoreMcpError>>;

  /**
   * Returns `true` if the backing store exists and is readable.
   * Used for fast availability checks before calling {@link load}.
   *
   * @example
   * ```ts
   * if (!dataSource.isAvailable()) {
   *   return err({ code: 'DATA_SOURCE_MISSING', dir: this.dir });
   * }
   * ```
   */
  isAvailable(): boolean;
}

/**
 * In-memory DataSource for use in unit tests.
 * Pre-loads a fixed set of entries without touching the filesystem.
 *
 * @example
 * ```ts
 * const ds = new InMemoryDataSource([
 *   aLoreEntry({ kind: 'decision', title: 'Use Redis' }),
 * ]);
 * const result = await ds.load();
 * expect(result.ok).toBe(true);
 * ```
 */
export class InMemoryDataSource implements DataSource {
  constructor(private readonly _entries: readonly LoreEntry[] = []) {}

  async load(): Promise<Result<DataSnapshot, LoreMcpError>> {
    return {
      ok: true,
      value: { entries: this._entries, loaded_at: Date.now() },
    };
  }

  isAvailable(): boolean {
    return true;
  }
}
