import type { TransformResult, HandoffResult, LogEntry } from './types';

export function logToMarkdown(log: TransformResult | LogEntry): string {
  // Check if this is a handoff-mode log
  if ('outputMode' in log && log.outputMode === 'handoff') {
    return handoffToMarkdown(log as LogEntry);
  }

  const lines: string[] = [];

  lines.push(`# ${log.title}`, '');

  if (log.today.length > 0) {
    lines.push('## Today', '');
    log.today.forEach((item) => lines.push(`- ${item}`));
    lines.push('');
  }

  if (log.decisions.length > 0) {
    lines.push('## Decisions', '');
    log.decisions.forEach((item) => lines.push(`- ${item}`));
    lines.push('');
  }

  if (log.todo.length > 0) {
    lines.push('## TODO', '');
    log.todo.forEach((item) => lines.push(`- ${item}`));
    lines.push('');
  }

  if (log.relatedProjects.length > 0) {
    lines.push('## Related Projects', '');
    log.relatedProjects.forEach((item) => lines.push(`- ${item}`));
    lines.push('');
  }

  if (log.tags.length > 0) {
    lines.push('## Tags', '');
    lines.push(log.tags.join(', '));
    lines.push('');
  }

  return lines.join('\n');
}

export function handoffResultToMarkdown(log: HandoffResult): string {
  const lines: string[] = [];
  lines.push(`# ${log.title}`, '');

  // Resume Context first — as paragraph, not bullets
  if (log.resumeContext.length > 0) {
    lines.push('## Resume Checklist', '');
    lines.push(log.resumeContext.join('\n'));
    lines.push('');
  }

  const sections: [string, string[]][] = [
    ['Current Status', log.currentStatus],
    ['Next Actions', log.nextActions],
    ['Completed', log.completed],
    ['Decisions', log.decisions],
    ['Cautions & Open Issues', log.blockers],
    ['Constraints & Scope', log.constraints],
  ];

  for (const [title, items] of sections) {
    if (items.length > 0) {
      lines.push(`## ${title}`, '');
      items.forEach((item) => lines.push(`- ${item}`));
      lines.push('');
    }
  }

  if (log.tags.length > 0) {
    lines.push('## Tags', '');
    lines.push(log.tags.join(', '));
    lines.push('');
  }

  return lines.join('\n');
}

function handoffToMarkdown(log: LogEntry): string {
  const lines: string[] = [];
  lines.push(`# ${log.title}`, '');

  // Resume Context first — as paragraph
  const resumeItems = log.resumeContext || (log.resumePoint ? [log.resumePoint] : undefined);
  if (resumeItems && resumeItems.length > 0) {
    lines.push('## Resume Checklist', '');
    lines.push(resumeItems.join('\n'));
    lines.push('');
  }

  const sections: [string, string[] | undefined][] = [
    ['Current Status', log.currentStatus || log.inProgress],
    ['Next Actions', log.nextActions],
    ['Completed', log.completed],
    ['Decisions', log.decisions],
    ['Cautions & Open Issues', log.blockers],
    ['Constraints & Scope', log.constraints],
  ];

  for (const [title, items] of sections) {
    if (items && items.length > 0) {
      lines.push(`## ${title}`, '');
      items.forEach((item) => lines.push(`- ${item}`));
      lines.push('');
    }
  }

  if (log.tags.length > 0) {
    lines.push('## Tags', '');
    lines.push(log.tags.join(', '));
    lines.push('');
  }

  return lines.join('\n');
}
