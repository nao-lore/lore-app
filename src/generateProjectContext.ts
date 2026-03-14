import type { ProjectContext, MasterNote, LogEntry, DecisionWithRationale } from './types';
import { dedupStrings, dedupDecisions } from './utils/decisions';

/**
 * Generate a ProjectContext from a MasterNote and its related logs.
 * This is a pure function — no side effects, no storage writes.
 * The result is for preview/formatting only until user Accepts.
 */
export function generateProjectContext(
  masterNote: MasterNote,
  logs: LogEntry[],
  projectName: string,
): ProjectContext {
  // Extract from MasterNote
  const overview = masterNote.overview || '';
  const currentState: string[] = [];

  // Collect decisions from all related logs
  const allDecisions: DecisionWithRationale[] = [];
  const allConstraints: string[] = [];
  const allOpenIssues: string[] = [];
  const allNextActions: string[] = [];

  // From MasterNote sourced items
  for (const item of masterNote.decisions || []) {
    allDecisions.push({ decision: item.text, rationale: null });
  }
  for (const item of masterNote.openIssues || []) {
    allOpenIssues.push(item.text);
  }
  for (const item of masterNote.nextActions || []) {
    allNextActions.push(item.text);
  }

  // From related logs - enrich with rationale if available
  const relatedLogs = logs.filter(l => masterNote.relatedLogIds?.includes(l.id));
  for (const log of relatedLogs) {
    if (log.decisionRationales) {
      allDecisions.push(...log.decisionRationales);
    } else if (log.decisions) {
      allDecisions.push(...log.decisions.map(d => ({ decision: d, rationale: null })));
    }
    if (log.constraints) allConstraints.push(...log.constraints);
    if (log.blockers) allOpenIssues.push(...log.blockers);
  }

  // Deduplicate
  const keyDecisions = dedupDecisions(allDecisions);
  const constraints = dedupStrings(allConstraints);
  const openIssuesDeduped = dedupStrings(allOpenIssues);
  const nextActions = dedupStrings(allNextActions);

  return {
    projectId: masterNote.projectId,
    projectName,
    overview,
    currentState,
    keyDecisions,
    constraints,
    openIssues: openIssuesDeduped,
    nextActions,
    sourceLogIds: masterNote.relatedLogIds || [],
    generatedAt: Date.now(),
  };
}
