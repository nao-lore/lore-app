/**
 * Implementation of the `lore_search` MCP tool.
 *
 * Performs a case-insensitive literal-string search across all entry kinds
 * (decisions, todos, blockers, learnings, messages) loaded from the DataSource.
 *
 * @example
 * ```ts
 * const ds = new MarkdownDataSource();
 * const result = await ds.load();
 * if (result.ok) {
 *   const output = runLoreSearch(result.value, { query: 'redis', kind: 'all', limit: 10 });
 *   console.log(output.results.length); // number of matches
 * }
 * ```
 */

import type { LoreEntry } from '../data/types.js';
import type { DataSnapshot } from '../ports/data-source.js';
import { searchEntries } from '../data/markdown_reader.js';
import type { LoreSearchInput, LoreSearchOutput } from './definitions.js';

/**
 * Build a result object from a matched entry, including a context-aware snippet.
 *
 * The snippet shows up to 160 characters starting ~40 chars before the match.
 */
function entryToResult(
  entry: LoreEntry,
  escapedPattern: RegExp,
): LoreSearchOutput['results'][number] {
  const matchIndex = entry.body.search(escapedPattern);
  let snippet: string;
  if (matchIndex >= 0) {
    const start = Math.max(0, matchIndex - 40);
    const end = Math.min(entry.body.length, matchIndex + 160);
    snippet =
      (start > 0 ? '…' : '') +
      entry.body.slice(start, end) +
      (end < entry.body.length ? '…' : '');
  } else {
    snippet = entry.body.slice(0, 200);
  }

  return {
    kind: entry.kind,
    id: entry.id,
    title: entry.title,
    snippet,
    session_id: entry.session_id,
    project_id: entry.project_id,
    derived_from_message_ids: [...entry.derived_from_message_ids],
    created_at: entry.created_at,
  };
}

/**
 * Execute the `lore_search` tool against a loaded data snapshot.
 *
 * @param snapshot - Pre-loaded data snapshot from {@link DataSource.load}.
 * @param input    - Validated tool input (already Zod-parsed).
 * @returns Search results with context-aware snippets.
 *
 * @example
 * ```ts
 * const output = runLoreSearch(snapshot, { query: 'redis', kind: 'decision', limit: 5 });
 * // output.results → [{ kind: 'decision', title: 'Use Redis for caching', ... }]
 * ```
 */
export function runLoreSearch(
  snapshot: DataSnapshot,
  input: LoreSearchInput,
): LoreSearchOutput {
  const matched = searchEntries(
    snapshot,
    input.query,
    input.kind,
    input.project_id,
    input.limit,
  );

  // Build the regex once for snippet extraction (same escaping as searchEntries)
  const escapedQuery = input.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escapedQuery, 'i');

  return {
    results: matched.map((entry) => entryToResult(entry, pattern)),
    total_matched: matched.length,
  };
}
