import type { LogEntry } from '../types';

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '\u2026' : text;
}

export function buildPreview(log: LogEntry): string {
  const parts: string[] = [];
  if (log.outputMode === 'handoff') {
    const status = log.currentStatus || log.inProgress;
    if (status && status.length > 0) parts.push(status[0]);
    if (log.nextActions && log.nextActions.length > 0) parts.push('Next: ' + log.nextActions[0]);
  } else {
    if (log.today.length > 0) parts.push(log.today[0]);
    if (log.decisions.length > 0) parts.push(log.decisions[0]);
    if (log.todo.length > 0) parts.push('TODO: ' + log.todo[0]);
  }
  return truncate(parts.join(' / '), 140);
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export { downloadFile } from '../utils/downloadFile';
