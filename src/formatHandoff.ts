import type { LogEntry, DecisionWithRationale, NextActionItem, ResumeChecklistItem, HandoffMeta, ProjectContext } from './types';
import { normalizeDecisions, dedupStrings, dedupDecisions } from './utils/decisions';
import { filterResolvedBlockers } from './transform';

export type { ProjectContext } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render a list of strings as Markdown bullet items. Returns empty string if list is empty. */
function bulletList(items: string[]): string {
  return items.map(item => `- ${item}`).join('\n');
}

/** Render decisions as bullet items. Null rationale = decision text only. */
function decisionBulletList(decisions: DecisionWithRationale[]): string {
  return decisions
    .map(dr =>
      dr.rationale !== null && dr.rationale !== undefined
        ? `- ${dr.decision}: ${dr.rationale}`
        : `- ${dr.decision}`,
    )
    .join('\n');
}

/** Render structured next action items as markdown bullets with optional sub-items. */
function nextActionBulletList(items: NextActionItem[]): string {
  return items
    .map(item => {
      const lines = [`- ${item.action}`];
      if (item.whyImportant) lines.push(`  - Why: ${item.whyImportant}`);
      if (item.priorityReason) lines.push(`  - Priority: ${item.priorityReason}`);
      if (item.dependsOn && item.dependsOn.length > 0) lines.push(`  - Depends on: ${item.dependsOn.join(', ')}`);
      if (item.dueBy) lines.push(`  - Due: ${item.dueBy}`);
      return lines.join('\n');
    })
    .join('\n');
}

/** Render structured resume checklist as markdown bullets with sub-items. */
function resumeChecklistBulletList(items: ResumeChecklistItem[]): string {
  return items
    .map(item => {
      const lines = [`- ${item.action}`];
      if (item.whyNow) lines.push(`  - Why now: ${item.whyNow}`);
      if (item.ifSkipped) lines.push(`  - If skipped: ${item.ifSkipped}`);
      return lines.join('\n');
    })
    .join('\n');
}

/** Render handoffMeta as compact key-value lines. */
function handoffMetaBlock(meta: HandoffMeta): string {
  const lines: string[] = [];
  if (meta.sessionFocus) lines.push(`- **Session Focus**: ${meta.sessionFocus}`);
  if (meta.whyThisSession) lines.push(`- **Why This Session**: ${meta.whyThisSession}`);
  if (meta.timePressure) lines.push(`- **Time Pressure**: ${meta.timePressure}`);
  return lines.join('\n');
}

type Section = { heading: string; body: string };

/** Build markdown from sections, omitting any with empty body. */
function renderSections(sections: Section[]): string {
  return sections
    .filter(s => s.body.length > 0)
    .map(s => `### ${s.heading}\n${s.body}`)
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Function 1: formatHandoffMarkdown
// ---------------------------------------------------------------------------

export function formatHandoffMarkdown(log: LogEntry): string {
  const { decisionRationales } = normalizeDecisions(
    log.decisionRationales,
    log.decisions,
  );

  // handoffMeta at the top (session context)
  const metaBody = log.handoffMeta ? handoffMetaBlock(log.handoffMeta) : '';

  // resumeChecklist: structured if available, fall back to resumeContext strings
  const resumeBody = log.resumeChecklist && log.resumeChecklist.length > 0
    ? resumeChecklistBulletList(log.resumeChecklist)
    : bulletList(log.resumeContext ?? []);

  const sections: Section[] = [
    { heading: 'Session Context', body: metaBody },
    { heading: 'Current State', body: bulletList(log.currentStatus ?? []) },
    { heading: 'What Was Done', body: bulletList(log.completed ?? []) },
    { heading: 'Active Decisions', body: decisionBulletList(decisionRationales) },
    { heading: 'Constraints', body: bulletList(log.constraints ?? []) },
    { heading: 'Open Issues', body: bulletList(log.blockers ?? []) },
    { heading: 'Next Actions', body: log.nextActionItems && log.nextActionItems.length > 0
      ? nextActionBulletList(log.nextActionItems)
      : bulletList(log.nextActions ?? []) },
    // Note: actionBacklog is NOT included in Copy Handoff (compressed version)
    { heading: 'Resume Checklist', body: resumeBody },
  ];

  const body = renderSections(sections);
  const parts = [`## Handoff: ${log.title}`];
  if (body) parts.push(body);
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Function 2: formatProjectContextMarkdown
// ---------------------------------------------------------------------------

export function formatProjectContextMarkdown(ctx: ProjectContext): string {
  const sections: Section[] = [
    { heading: 'Current State', body: bulletList(ctx.currentState) },
    { heading: 'Key Decisions', body: decisionBulletList(ctx.keyDecisions.slice(0, 7)) },
    { heading: 'Constraints', body: bulletList(ctx.constraints.slice(0, 10)) },
    { heading: 'Open Issues', body: bulletList(ctx.openIssues.slice(0, 5)) },
    { heading: 'Next Actions', body: bulletList(ctx.nextActions) },
  ];

  const body = renderSections(sections);
  const header = ctx.overview
    ? `## Project: ${ctx.projectName}\n\n${ctx.overview}`
    : `## Project: ${ctx.projectName}`;
  const parts = [header];
  if (body) parts.push(body);
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Function 3: formatFullAiContext
// ---------------------------------------------------------------------------

export function formatFullAiContext(
  ctx: ProjectContext,
  latestHandoff?: LogEntry,
): string {
  if (!latestHandoff) {
    return formatProjectContextMarkdown(ctx);
  }

  // --- Merge data ---

  const { decisionRationales: handoffDecisions } = normalizeDecisions(
    latestHandoff.decisionRationales,
    latestHandoff.decisions,
  );

  // currentState: union, deduped
  const mergedCurrentState = dedupStrings([
    ...ctx.currentState,
    ...(latestHandoff.currentStatus ?? []),
  ]);

  // keyDecisions: union, deduped by decision text — latest (handoff) first so they survive the cap
  const mergedDecisions = dedupDecisions([
    ...handoffDecisions,
    ...ctx.keyDecisions,
  ]).slice(0, 7);

  // constraints: union, deduped — latest first
  const mergedConstraints = dedupStrings([
    ...(latestHandoff.constraints ?? []),
    ...ctx.constraints,
  ]).slice(0, 10);

  // openIssues: union, deduped, then remove resolved
  const rawOpenIssues = dedupStrings([
    ...(latestHandoff.blockers ?? []),
    ...ctx.openIssues,
  ]);
  const mergedOpenIssues = filterResolvedBlockers(
    rawOpenIssues,
    latestHandoff.completed ?? [],
    (latestHandoff.decisions ?? []),
  ).slice(0, 5);

  // nextActions: latestHandoff only — use structured data when available
  const nextActionsBody = latestHandoff.nextActionItems && latestHandoff.nextActionItems.length > 0
    ? nextActionBulletList(latestHandoff.nextActionItems)
    : bulletList(latestHandoff.nextActions ?? []);

  // actionBacklog: included in Full Context only
  const backlogBody = latestHandoff.actionBacklog && latestHandoff.actionBacklog.length > 0
    ? nextActionBulletList(latestHandoff.actionBacklog)
    : '';

  // --- Build sections ---

  const projectSections: Section[] = [
    { heading: 'Current State', body: bulletList(mergedCurrentState) },
    { heading: 'Key Decisions', body: decisionBulletList(mergedDecisions) },
    { heading: 'Constraints', body: bulletList(mergedConstraints) },
    { heading: 'Open Issues', body: bulletList(mergedOpenIssues) },
    { heading: 'Next Actions', body: nextActionsBody },
    { heading: 'Action Backlog', body: backlogBody },
  ];

  const header = ctx.overview
    ? `## Project: ${ctx.projectName}\n\n${ctx.overview}`
    : `## Project: ${ctx.projectName}`;

  const projectBody = renderSections(projectSections);
  const parts = [header];
  if (projectBody) parts.push(projectBody);

  // --- Latest Session ---

  // handoffMeta at session level
  const metaBody = latestHandoff.handoffMeta ? handoffMetaBlock(latestHandoff.handoffMeta) : '';

  // resumeChecklist: structured if available, fall back to resumeContext strings
  const resumeBody = latestHandoff.resumeChecklist && latestHandoff.resumeChecklist.length > 0
    ? resumeChecklistBulletList(latestHandoff.resumeChecklist)
    : bulletList(latestHandoff.resumeContext ?? []);

  const sessionSections: Section[] = [
    { heading: 'Session Context', body: metaBody },
    { heading: 'What Was Done', body: bulletList(latestHandoff.completed ?? []) },
    { heading: 'Resume Checklist', body: resumeBody },
  ];

  const sessionBody = renderSections(sessionSections);
  if (sessionBody) {
    parts.push('---\n\n## Latest Session\n\n' + sessionBody);
  }

  return parts.join('\n\n');
}
