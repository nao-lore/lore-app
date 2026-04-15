/**
 * Implementation of the `lore_list_open_todos` MCP tool.
 *
 * Returns todos in discovery order, filtered to exclude entries with
 * `status: 'done'` or `status: 'dropped'` in their frontmatter.
 * Entries with no explicit status are treated as open.
 *
 * @example
 * ```ts
 * const output = runListOpenTodos(snapshot, { limit: 10 });
 * console.log(output.todos.map(t => t.title));
 * ```
 */

import type { DataSnapshot } from '../ports/data-source.js';
import type { ListOpenTodosInput, ListOpenTodosOutput } from './definitions.js';

/** Frontmatter statuses that are considered closed. */
const CLOSED_STATUSES = new Set(['done', 'dropped']);

/**
 * Execute the `lore_list_open_todos` tool against a loaded data snapshot.
 *
 * @param snapshot - Pre-loaded data snapshot from {@link DataSource.load}.
 * @param input    - Validated tool input (already Zod-parsed).
 * @returns Open todos, optionally scoped to a project, up to `input.limit`.
 *
 * @example
 * ```ts
 * // All open todos across all projects
 * const all = runListOpenTodos(snapshot, { limit: 50 });
 *
 * // Only for a specific project
 * const proj = runListOpenTodos(snapshot, { project_id: 'proj-lore-v2', limit: 10 });
 * ```
 */
export function runListOpenTodos(
  snapshot: DataSnapshot,
  input: ListOpenTodosInput,
): ListOpenTodosOutput {
  const todos = snapshot.entries
    .filter((e) => {
      if (e.kind !== 'todo') return false;
      if (input.project_id !== undefined && e.project_id !== input.project_id) return false;
      const status = e.extra?.['status'];
      if (typeof status === 'string' && CLOSED_STATUSES.has(status)) return false;
      return true;
    })
    .slice(0, input.limit)
    .map((e) => ({
      id: e.id,
      title: e.title,
      body: e.body,
      priority: (e.extra?.['priority'] as string | undefined) ?? 'medium',
      due_at: typeof e.extra?.['due_at'] === 'number' ? e.extra['due_at'] : null,
      project_id: e.project_id,
    }));

  return { todos };
}
