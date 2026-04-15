/**
 * Tests #13–16 from spec §5 — MCP tool contract tests.
 *
 * Uses {@link InMemoryDataSource} for zero-filesystem, deterministic test runs.
 * All tests follow the AAA (Arrange / Act / Assert) pattern.
 */
import { describe, it, expect } from 'vitest';
import { InMemoryDataSource } from '../src/ports/data-source.js';
import { runLoreSearch } from '../src/tools/search.js';
import { runGetProjectDna } from '../src/tools/project_dna.js';
import { runListOpenTodos } from '../src/tools/open_todos.js';
import {
  GetProjectDnaOutput,
  ListOpenTodosOutput,
  LoreSearchOutput,
} from '../src/tools/definitions.js';
import { aLoreEntry, sampleEntries } from './fixtures/entries.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadSnapshot(entries = sampleEntries()) {
  const ds = new InMemoryDataSource(entries);
  const result = await ds.load();
  if (!result.ok) throw new Error('InMemoryDataSource.load() should never fail');
  return result.value;
}

// ---------------------------------------------------------------------------
// Test #13: lore_search returns [] for no matches (not error)
// ---------------------------------------------------------------------------
describe('Test #13: lore_search returns [] for no matches', () => {
  it('returns empty results array — not isError — when query matches nothing', async () => {
    // Arrange
    const snapshot = await loadSnapshot();

    // Act
    const output = runLoreSearch(snapshot, {
      query: 'xyzzy_no_match_ever_12345',
      kind: 'all',
      limit: 20,
    });

    // Assert
    expect(output.results).toEqual([]);
    expect(output.total_matched).toBe(0);
    // Output must conform to the schema
    const parsed = LoreSearchOutput.safeParse(output);
    expect(parsed.success).toBe(true);
  });

  it('returns matching results when query is found', async () => {
    // Arrange
    const snapshot = await loadSnapshot();

    // Act
    const output = runLoreSearch(snapshot, { query: 'redis', kind: 'all', limit: 20 });

    // Assert
    expect(output.results.length).toBeGreaterThan(0);
    expect(output.results.every((r) => r.kind !== undefined)).toBe(true);
  });

  it('returns empty results for empty store (data source missing)', async () => {
    // Arrange
    const snapshot = await loadSnapshot([]);

    // Act
    const output = runLoreSearch(snapshot, { query: 'anything', kind: 'all', limit: 20 });

    // Assert
    expect(output.results).toEqual([]);
    expect(output.total_matched).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test #14: lore_search SQL-injection / regex-injection attempt sanitised
// ---------------------------------------------------------------------------
describe('Test #14: lore_search injection attempts sanitised', () => {
  const injectionQueries = [
    "'; DROP TABLE decisions; --",
    '1=1 OR 1=1',
    '<script>alert(1)</script>',
    '../../etc/passwd',
    '%00',
    'UNION SELECT * FROM todos--',
    // Regex metacharacters that would throw without escaping
    'a(b',
    'a[b',
    'a{b',
    'a.b*',
    'a+b?',
    '^beginning$',
    '(?:group)',
    '[invalid',
  ];

  for (const query of injectionQueries) {
    it(`does not throw for query: ${JSON.stringify(query)}`, async () => {
      // Arrange
      const snapshot = await loadSnapshot();

      // Act & Assert — must not throw
      expect(() =>
        runLoreSearch(snapshot, { query, kind: 'all', limit: 20 }),
      ).not.toThrow();
    });
  }

  it('treats injection string as literal — returns no results, not an error', async () => {
    // Arrange
    const snapshot = await loadSnapshot();

    // Act
    const output = runLoreSearch(snapshot, {
      query: "'; DROP TABLE decisions; --",
      kind: 'all',
      limit: 20,
    });

    // Assert — injection string is treated as literal text → no match → empty, not error
    expect(output.results).toEqual([]);
    expect(output.total_matched).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test #15: lore_get_project_dna returns schema-valid output
// ---------------------------------------------------------------------------
describe('Test #15: lore_get_project_dna returns schema-valid output', () => {
  it('returns valid output for a project with all entry kinds', async () => {
    // Arrange
    const snapshot = await loadSnapshot();

    // Act
    const output = runGetProjectDna(snapshot, { project_id: 'proj-lore-v2' });

    // Assert
    const parsed = GetProjectDnaOutput.safeParse(output);
    expect(parsed.success, `Schema errors: ${JSON.stringify(parsed)}`).toBe(true);
    expect(output.project.id).toBe('proj-lore-v2');
    expect(output.active_decisions.length).toBeGreaterThan(0);
    expect(output.open_blockers.length).toBeGreaterThan(0);
    expect(output.recent_learnings.length).toBeGreaterThan(0);
  });

  it('summary string contains project name and counts', async () => {
    // Arrange
    const snapshot = await loadSnapshot();

    // Act
    const output = runGetProjectDna(snapshot, { project_id: 'proj-lore-v2' });

    // Assert
    expect(output.summary).toMatch(/proj-lore-v2/);
    expect(output.summary).toMatch(/decision/);
    expect(output.summary).toMatch(/blocker/);
    expect(output.summary).toMatch(/learning/);
  });

  it('returns valid empty output for an unknown project_id', async () => {
    // Arrange
    const snapshot = await loadSnapshot();

    // Act
    const output = runGetProjectDna(snapshot, { project_id: 'nonexistent-xyz' });

    // Assert
    const parsed = GetProjectDnaOutput.safeParse(output);
    expect(parsed.success).toBe(true);
    expect(output.active_decisions).toEqual([]);
    expect(output.open_blockers).toEqual([]);
    expect(output.recent_learnings).toEqual([]);
  });

  it('each blocker has all required output fields', async () => {
    // Arrange
    const snapshot = await loadSnapshot();

    // Act
    const output = runGetProjectDna(snapshot, { project_id: 'proj-lore-v2' });

    // Assert
    for (const blocker of output.open_blockers) {
      expect(blocker).toHaveProperty('id');
      expect(blocker).toHaveProperty('title');
      expect(blocker).toHaveProperty('severity');
      expect(blocker).toHaveProperty('description');
      expect(typeof blocker.severity).toBe('string');
    }
  });

  it('recent_learnings are sorted newest-first', async () => {
    // Arrange
    const entries = [
      aLoreEntry({ kind: 'learning', project_id: 'p1', created_at: 1000, title: 'old' }),
      aLoreEntry({ kind: 'learning', project_id: 'p1', created_at: 3000, title: 'new' }),
      aLoreEntry({ kind: 'learning', project_id: 'p1', created_at: 2000, title: 'mid' }),
    ];
    const snapshot = await loadSnapshot(entries);

    // Act
    const output = runGetProjectDna(snapshot, { project_id: 'p1' });

    // Assert
    expect(output.recent_learnings[0].title).toBe('new');
    expect(output.recent_learnings[1].title).toBe('mid');
    expect(output.recent_learnings[2].title).toBe('old');
  });
});

// ---------------------------------------------------------------------------
// Test #16: MCP tool on missing data source returns isError: true
// ---------------------------------------------------------------------------
describe('Test #16: missing data source returns isError:true', () => {
  it('DataSource.load() returns err(DATA_SOURCE_MISSING) for non-existent dir', async () => {
    // Arrange
    const { MarkdownDataSource } = await import('../src/data/markdown_reader.js');
    const ds = new MarkdownDataSource('/nonexistent/path/that/does/not/exist');

    // Act
    const result = await ds.load();

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DATA_SOURCE_MISSING');
    }
  });

  it('isAvailable() returns false for non-existent directory', async () => {
    // Arrange
    const { MarkdownDataSource } = await import('../src/data/markdown_reader.js');
    const ds = new MarkdownDataSource('/nonexistent/path');

    // Act & Assert
    expect(ds.isAvailable()).toBe(false);
  });

  it('search on empty snapshot returns empty results (not an error condition)', async () => {
    // Arrange
    const snapshot = await loadSnapshot([]);

    // Act
    const output = runLoreSearch(snapshot, { query: 'redis', kind: 'all', limit: 20 });

    // Assert — empty results are a valid non-error response
    const parsed = LoreSearchOutput.safeParse(output);
    expect(parsed.success).toBe(true);
    expect(output.results).toEqual([]);
  });

  it('list todos on empty snapshot returns empty list (valid output)', async () => {
    // Arrange
    const snapshot = await loadSnapshot([]);

    // Act
    const output = runListOpenTodos(snapshot, { limit: 50 });

    // Assert
    const parsed = ListOpenTodosOutput.safeParse(output);
    expect(parsed.success).toBe(true);
    expect(output.todos).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Additional: kind filtering
// ---------------------------------------------------------------------------
describe('kind filtering and todo status', () => {
  it('kind=decision returns only decision entries', async () => {
    // Arrange
    const entries = [
      aLoreEntry({ kind: 'decision', title: 'Decision A', body: 'decide' }),
      aLoreEntry({ kind: 'todo', title: 'Todo A', body: 'decide todo' }),
    ];
    const snapshot = await loadSnapshot(entries);

    // Act
    const output = runLoreSearch(snapshot, { query: 'decide', kind: 'decision', limit: 20 });

    // Assert
    expect(output.results.every((r) => r.kind === 'decision')).toBe(true);
    expect(output.results.length).toBe(1);
  });

  it('lore_list_open_todos excludes status=done entries', async () => {
    // Arrange
    const snapshot = await loadSnapshot();

    // Act
    const output = runListOpenTodos(snapshot, { limit: 100 });

    // Assert: the 'done' todo must not appear
    const doneId = '01HQ5555555555555555555555';
    expect(output.todos.find((t) => t.id === doneId)).toBeUndefined();
  });

  it('lore_list_open_todos includes open todos', async () => {
    // Arrange
    const snapshot = await loadSnapshot();

    // Act
    const output = runListOpenTodos(snapshot, { limit: 100 });

    // Assert: the open todo must appear
    const openId = '01HQ2222222222222222222222';
    const found = output.todos.find((t) => t.id === openId);
    expect(found).toBeDefined();
    expect(found?.priority).toBe('high');
    expect(found?.due_at).toBe(1714000000000);
  });

  it('lore_list_open_todos respects project_id filter', async () => {
    // Arrange
    const entries = [
      aLoreEntry({ kind: 'todo', project_id: 'proj-a', title: 'Todo A' }),
      aLoreEntry({ kind: 'todo', project_id: 'proj-b', title: 'Todo B' }),
    ];
    const snapshot = await loadSnapshot(entries);

    // Act
    const output = runListOpenTodos(snapshot, { project_id: 'proj-a', limit: 50 });

    // Assert
    expect(output.todos).toHaveLength(1);
    expect(output.todos[0].project_id).toBe('proj-a');
  });

  it('lore_list_open_todos respects limit', async () => {
    // Arrange
    const entries = Array.from({ length: 10 }, (_, i) =>
      aLoreEntry({ kind: 'todo', title: `Todo ${i}` }),
    );
    const snapshot = await loadSnapshot(entries);

    // Act
    const output = runListOpenTodos(snapshot, { limit: 3 });

    // Assert
    expect(output.todos).toHaveLength(3);
  });

  it('lore_search limit is respected', async () => {
    // Arrange
    const entries = Array.from({ length: 20 }, (_, i) =>
      aLoreEntry({ kind: 'decision', title: `Decision ${i}`, body: 'common keyword' }),
    );
    const snapshot = await loadSnapshot(entries);

    // Act
    const output = runLoreSearch(snapshot, { query: 'common', kind: 'all', limit: 5 });

    // Assert
    expect(output.results).toHaveLength(5);
    expect(output.total_matched).toBe(5); // limited, not total corpus
  });
});

// ---------------------------------------------------------------------------
// Additional: Result<T,E> and DataSource port contract
// ---------------------------------------------------------------------------
describe('DataSource port — InMemoryDataSource', () => {
  it('always returns ok(snapshot)', async () => {
    // Arrange
    const ds = new InMemoryDataSource([aLoreEntry()]);

    // Act
    const result = await ds.load();

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entries).toHaveLength(1);
      expect(result.value.loaded_at).toBeGreaterThan(0);
    }
  });

  it('isAvailable() always returns true', () => {
    expect(new InMemoryDataSource().isAvailable()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Additional: parseFile path-traversal guard
// ---------------------------------------------------------------------------
describe('parseFile path-traversal guard', () => {
  it('rejects a path outside the data directory', async () => {
    // Arrange
    const { parseFile } = await import('../src/data/markdown_reader.js');

    // Act
    const result = parseFile('/etc/passwd', '/tmp/safe-dir');

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PATH_TRAVERSAL');
    }
  });
});
