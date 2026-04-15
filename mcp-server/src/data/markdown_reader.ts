/**
 * MarkdownDataSource — Ports & Adapters adapter for `~/.lore/projects/*.md`.
 *
 * Implements the {@link DataSource} port for the MVP Markdown export format.
 * Each `.md` file has YAML frontmatter (parsed by gray-matter) and a markdown body.
 *
 * **Security**: All resolved file paths are checked to remain within the configured
 * data directory, preventing path-traversal attacks via crafted filenames.
 *
 * **Override**: Set `LORE_DATA_DIR` environment variable to use a different directory.
 * This is the primary mechanism for test isolation.
 *
 * @see docs/adr/0006-mcp-markdown-reader-for-mvp.md
 *
 * @example
 * ```ts
 * const ds = new MarkdownDataSource('/custom/path');
 * if (!ds.isAvailable()) {
 *   console.error('No data directory found');
 * } else {
 *   const result = await ds.load();
 *   if (result.ok) {
 *     console.log(`Loaded ${result.value.entries.length} entries`);
 *   }
 * }
 * ```
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import matter from 'gray-matter';
import type { DataSource, DataSnapshot } from '../ports/data-source.js';
import type { Result } from '../result.js';
import { ok, err } from '../result.js';
import type { LoreMcpError } from '../errors.js';
import type { EntryKind, LoreEntry } from './types.js';

/**
 * Returns the configured data directory, preferring `LORE_DATA_DIR` env var
 * over the default `~/.lore/projects`.
 *
 * @example
 * ```ts
 * process.env['LORE_DATA_DIR'] = '/tmp/test';
 * const dir = getDataDir(); // '/tmp/test'
 * ```
 */
export function getDataDir(): string {
  return process.env['LORE_DATA_DIR'] ?? path.join(os.homedir(), '.lore', 'projects');
}

/** Parse a raw frontmatter value as epoch ms. Accepts number or ISO string. */
function parseEpochMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const n = Date.parse(value);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

/** Parse derived_from_message_ids from frontmatter — only string array items. */
function parseDerivedMessageIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

const VALID_KINDS = new Set<string>(['decision', 'todo', 'blocker', 'learning', 'message']);

function isValidKind(value: unknown): value is EntryKind {
  return typeof value === 'string' && VALID_KINDS.has(value);
}

/** Extract the first `# Heading` from markdown body as a title fallback. */
function extractTitleFromBody(body: string): string {
  const match = /^#\s+(.+)$/m.exec(body);
  return match ? match[1].trim() : '(untitled)';
}

const KNOWN_FRONTMATTER_KEYS = new Set([
  'kind', 'id', 'project_id', 'session_id', 'created_at',
  'derived_from_message_ids', 'title',
]);

/**
 * Parse a single `.md` file into a {@link LoreEntry}.
 *
 * Returns `err` if:
 * - The file cannot be read (I/O error)
 * - The YAML frontmatter is malformed
 * - The `kind` field is absent or not a recognised {@link EntryKind}
 * - The resolved path escapes the allowed `dataDir` (path traversal)
 *
 * @example
 * ```ts
 * const result = parseFile('/tmp/data/decision-001.md', '/tmp/data');
 * if (result.ok) {
 *   console.log(result.value.title);
 * }
 * ```
 */
export function parseFile(
  filePath: string,
  dataDir: string,
): Result<LoreEntry, LoreMcpError> {
  // Path-traversal guard: resolved path must stay inside dataDir
  const resolved = path.resolve(filePath);
  const resolvedDir = path.resolve(dataDir);
  if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
    return err({ code: 'PATH_TRAVERSAL', path: filePath });
  }

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (cause) {
    return err({
      code: 'INTERNAL_ERROR',
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch (cause) {
    return err({
      code: 'PARSE_ERROR',
      file: path.basename(filePath),
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }

  const fm = parsed.data as Record<string, unknown>;

  if (!isValidKind(fm['kind'])) {
    return err({
      code: 'PARSE_ERROR',
      file: path.basename(filePath),
      message: `Missing or invalid 'kind' field (got ${JSON.stringify(fm['kind'])})`,
    });
  }

  const kind = fm['kind'];
  const id = typeof fm['id'] === 'string' && fm['id'].length > 0
    ? fm['id']
    : path.basename(filePath, '.md');
  const project_id = typeof fm['project_id'] === 'string' ? fm['project_id'] : null;
  const session_id = typeof fm['session_id'] === 'string' ? fm['session_id'] : '';
  const created_at = parseEpochMs(fm['created_at']);
  const derived_from_message_ids = parseDerivedMessageIds(fm['derived_from_message_ids']);

  const body = parsed.content.trim();

  const title =
    typeof fm['title'] === 'string' && fm['title'].length > 0
      ? fm['title']
      : extractTitleFromBody(body);

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm)) {
    if (!KNOWN_FRONTMATTER_KEYS.has(k)) extra[k] = v;
  }

  return ok({
    kind,
    id,
    project_id,
    session_id,
    title,
    body,
    extra,
    derived_from_message_ids,
    created_at,
    source_file: filePath,
  });
}

/**
 * MCP data source adapter that reads `~/.lore/projects/*.md` files.
 *
 * Implements the {@link DataSource} port. Instantiate with an explicit directory
 * for test isolation; omit to use `LORE_DATA_DIR` env var or `~/.lore/projects`.
 *
 * @example
 * ```ts
 * const ds = new MarkdownDataSource(process.env['LORE_DATA_DIR']);
 * const result = await ds.load();
 * if (result.ok) {
 *   console.log(`${result.value.entries.length} entries loaded`);
 * }
 * ```
 */
export class MarkdownDataSource implements DataSource {
  private readonly dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? getDataDir();
  }

  /** Returns true if the directory exists and is accessible. */
  isAvailable(): boolean {
    try {
      return fs.statSync(this.dir).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Load all valid `.md` entries from the directory.
   *
   * Parse errors on individual files are logged as warnings but do not fail
   * the entire load — a single malformed file should not prevent other entries
   * from being served.
   *
   * @returns `ok(snapshot)` even when zero entries are found.
   *          `err(DATA_SOURCE_MISSING)` only if the directory does not exist.
   */
  async load(): Promise<Result<DataSnapshot, LoreMcpError>> {
    if (!this.isAvailable()) {
      return err({ code: 'DATA_SOURCE_MISSING', dir: this.dir });
    }

    let files: string[];
    try {
      files = fs.readdirSync(this.dir).filter((f) => f.endsWith('.md'));
    } catch (cause) {
      return err({
        code: 'INTERNAL_ERROR',
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }

    const entries: LoreEntry[] = [];
    for (const file of files) {
      const filePath = path.join(this.dir, file);
      const result = parseFile(filePath, this.dir);
      if (result.ok) {
        entries.push(result.value);
      }
      // Silently skip malformed files — individual parse errors don't fail the load
    }

    return ok({ entries, loaded_at: Date.now() });
  }
}

/**
 * Case-insensitive literal string search across entry title and body.
 *
 * The query is treated as a **literal** string (no regex metacharacters), which
 * prevents regex-injection attacks from user-supplied queries.
 *
 * @param snapshot - The loaded data snapshot to search within.
 * @param query    - Literal search string (metacharacters escaped automatically).
 * @param kind     - Entry kind filter; `'all'` disables kind filtering.
 * @param project_id - Optional project ID filter.
 * @param limit    - Maximum number of entries to return.
 * @returns Matching entries in discovery order, truncated to `limit`.
 *
 * @example
 * ```ts
 * const results = searchEntries(snapshot, 'redis', 'decision', undefined, 10);
 * ```
 */
export function searchEntries(
  snapshot: DataSnapshot,
  query: string,
  kind: string,
  project_id: string | undefined,
  limit: number,
): LoreEntry[] {
  // Escape all regex metacharacters so the query is treated as a literal string
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escapedQuery, 'i');

  const results: LoreEntry[] = [];
  for (const entry of snapshot.entries) {
    if (kind !== 'all' && entry.kind !== kind) continue;
    if (project_id !== undefined && entry.project_id !== project_id) continue;

    if (pattern.test(entry.title) || pattern.test(entry.body)) {
      results.push(entry);
      if (results.length >= limit) break;
    }
  }
  return results;
}
