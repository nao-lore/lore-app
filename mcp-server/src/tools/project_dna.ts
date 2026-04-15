/**
 * Implementation of the `lore_get_project_dna` MCP tool.
 *
 * Aggregates all context for a given project ID:
 * - Active decisions (kind = 'decision')
 * - Open blockers (kind = 'blocker')
 * - Recent learnings (kind = 'learning', sorted newest-first)
 *
 * A generated `summary` string gives a one-line project health snapshot.
 *
 * @example
 * ```ts
 * const output = runGetProjectDna(snapshot, { project_id: 'proj-lore-v2' });
 * console.log(output.summary);
 * // 'Project "proj-lore-v2": 3 decision(s), 1 open blocker(s), 2 recent learning(s).'
 * ```
 */

import type { DataSnapshot } from '../ports/data-source.js';
import type { GetProjectDnaInput, GetProjectDnaOutput } from './definitions.js';

/**
 * Execute the `lore_get_project_dna` tool against a loaded data snapshot.
 *
 * Returns a valid {@link GetProjectDnaOutput} even when the project has no
 * entries — all arrays will be empty and the summary reflects zero counts.
 *
 * @param snapshot - Pre-loaded data snapshot from {@link DataSource.load}.
 * @param input    - Validated tool input (already Zod-parsed).
 *
 * @example
 * ```ts
 * const output = runGetProjectDna(snapshot, { project_id: 'proj-abc' });
 * if (output.open_blockers.length > 0) {
 *   console.warn('Project has open blockers:', output.open_blockers.map(b => b.title));
 * }
 * ```
 */
export function runGetProjectDna(
  snapshot: DataSnapshot,
  input: GetProjectDnaInput,
): GetProjectDnaOutput {
  const projectEntries = snapshot.entries.filter(
    (e) => e.project_id === input.project_id,
  );

  const projectName =
    (projectEntries[0]?.extra?.['project_name'] as string | undefined) ??
    input.project_id;
  const projectDescription =
    (projectEntries[0]?.extra?.['project_description'] as string | undefined) ?? '';

  const active_decisions = projectEntries
    .filter((e) => e.kind === 'decision')
    .slice(0, 20)
    .map((e) => ({
      id: e.id,
      title: e.title,
      rationale: e.body,
      created_at: e.created_at,
    }));

  const open_blockers = projectEntries
    .filter((e) => e.kind === 'blocker')
    .slice(0, 10)
    .map((e) => ({
      id: e.id,
      title: e.title,
      severity: (e.extra?.['severity'] as string | undefined) ?? 'medium',
      description: e.body,
    }));

  const recent_learnings = projectEntries
    .filter((e) => e.kind === 'learning')
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 10)
    .map((e) => ({
      id: e.id,
      title: e.title,
      content: e.body,
      created_at: e.created_at,
    }));

  const summary =
    `Project "${projectName}": ` +
    `${active_decisions.length} decision(s), ` +
    `${open_blockers.length} open blocker(s), ` +
    `${recent_learnings.length} recent learning(s).`;

  return {
    project: {
      id: input.project_id,
      name: projectName,
      description: projectDescription,
    },
    active_decisions,
    open_blockers,
    recent_learnings,
    summary,
  };
}
