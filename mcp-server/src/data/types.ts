/**
 * Internal entity types for the Lore MCP Server.
 *
 * `LoreEntry` is the normalised in-memory representation of a single
 * `~/.lore/projects/*.md` file after parsing.
 */

/** All recognised entry kinds from the Lore data model. */
export type EntryKind = 'decision' | 'todo' | 'blocker' | 'learning' | 'message';

/**
 * Normalised representation of a single Lore markdown entry.
 *
 * All fields except `extra` are extracted from well-known frontmatter keys.
 * Additional frontmatter fields (e.g. `severity`, `priority`, `status`) are
 * captured in `extra` for tool-layer use.
 *
 * @example
 * ```ts
 * const entry: LoreEntry = {
 *   kind: 'decision',
 *   id: '01HQ1111111111111111111111',
 *   project_id: 'proj-lore-v2',
 *   session_id: 'sess-001',
 *   title: 'Use Redis for caching',
 *   body: 'We evaluated Redis vs Memcached...',
 *   extra: { severity: 'high' },
 *   derived_from_message_ids: ['msg-aaa'],
 *   created_at: 1713168000000,
 *   source_file: '/Users/nn/.lore/projects/decision-001.md',
 * };
 * ```
 */
export interface LoreEntry {
  readonly kind: EntryKind;
  readonly id: string;
  readonly project_id: string | null;
  readonly session_id: string;
  readonly title: string;
  readonly body: string;
  /** Frontmatter fields beyond the well-known set. Includes status, priority, severity, etc. */
  readonly extra: Readonly<Record<string, unknown>>;
  readonly derived_from_message_ids: readonly string[];
  readonly created_at: number;
  /** Absolute path of the source `.md` file, for debugging only. */
  readonly source_file: string;
}
