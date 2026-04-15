/**
 * Test data builders for {@link LoreEntry}.
 *
 * Use these instead of inline object literals to get type-safe, minimal fixtures
 * that can be overridden per-test.
 *
 * @example
 * ```ts
 * const entry = aLoreEntry({ kind: 'decision', title: 'Use Redis' });
 * const todo  = aLoreEntry({ kind: 'todo', extra: { status: 'open', priority: 'high' } });
 * ```
 */

import type { LoreEntry, EntryKind } from '../../src/data/types.js';

let _seq = 0;
function nextId(prefix: string): string {
  _seq++;
  return `${prefix}-${String(_seq).padStart(4, '0')}`;
}

/**
 * Build a minimal valid {@link LoreEntry} with sensible defaults.
 * Pass `overrides` to customise any field.
 *
 * @example
 * ```ts
 * aLoreEntry({ kind: 'blocker', extra: { severity: 'critical' } })
 * ```
 */
export function aLoreEntry(overrides: Partial<LoreEntry> = {}): LoreEntry {
  const kind: EntryKind = overrides.kind ?? 'decision';
  return {
    kind,
    id: overrides.id ?? nextId(kind),
    project_id: overrides.project_id ?? 'proj-test',
    session_id: overrides.session_id ?? 'sess-test',
    title: overrides.title ?? `Test ${kind} entry`,
    body: overrides.body ?? `Body text for ${kind} entry.`,
    extra: overrides.extra ?? {},
    derived_from_message_ids: overrides.derived_from_message_ids ?? ['msg-001'],
    created_at: overrides.created_at ?? 1713168000000,
    source_file: overrides.source_file ?? `/tmp/test-${kind}.md`,
  };
}

/** Build a set of sample entries mirroring the sample-data directory. */
export function sampleEntries(): LoreEntry[] {
  return [
    aLoreEntry({
      kind: 'decision',
      id: '01HQ1111111111111111111111',
      project_id: 'proj-lore-v2',
      title: 'Use Redis for caching',
      body: 'We evaluated Redis vs Memcached vs in-process LRU. Redis was chosen.',
      derived_from_message_ids: ['msg-aaa', 'msg-bbb'],
      created_at: 1713168000000,
    }),
    aLoreEntry({
      kind: 'todo',
      id: '01HQ2222222222222222222222',
      project_id: 'proj-lore-v2',
      title: 'Implement SQLite export from IndexedDB',
      body: 'The PWA needs to export its IndexedDB data to ~/.lore/lore-export.sqlite.',
      extra: { priority: 'high', status: 'open', due_at: 1714000000000 },
      derived_from_message_ids: ['msg-ccc'],
      created_at: 1713168100000,
    }),
    aLoreEntry({
      kind: 'blocker',
      id: '01HQ3333333333333333333333',
      project_id: 'proj-lore-v2',
      title: 'IndexedDB not accessible from Node.js',
      body: 'Browser IndexedDB API is not available in Node.js context.',
      extra: { severity: 'critical', status: 'open' },
      derived_from_message_ids: ['msg-ddd'],
      created_at: 1713168200000,
    }),
    aLoreEntry({
      kind: 'learning',
      id: '01HQ4444444444444444444444',
      project_id: 'proj-lore-v2',
      title: 'MCP stdio transport requires line-delimited JSON-RPC',
      body: 'Each JSON-RPC message must be a single line terminated by newline.',
      derived_from_message_ids: ['msg-eee'],
      created_at: 1713168300000,
    }),
    aLoreEntry({
      kind: 'todo',
      id: '01HQ5555555555555555555555',
      project_id: 'proj-lore-v2',
      title: 'Set up vitest for mcp-server',
      body: 'Configure vitest in the independent mcp-server package.',
      extra: { priority: 'medium', status: 'done' },
      derived_from_message_ids: ['msg-fff'],
      created_at: 1713168400000,
    }),
  ];
}
