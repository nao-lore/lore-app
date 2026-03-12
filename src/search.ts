import type { LogEntry, Project, Todo, MasterNote } from './types';

// ─── Types ───

export type SearchResultType = 'log' | 'project' | 'todo' | 'summary';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string;
  snippet?: string;       // matched context
  targetId?: string;      // navigation target (e.g. logId for todo, projectId for summary)
}

// ─── Log search ───

/** Build a single searchable string from a log, including handoff fields */
function logSearchText(log: LogEntry): string {
  const parts = [
    log.title,
    ...log.today,
    ...log.decisions,
    ...log.todo,
    ...log.relatedProjects,
    ...log.tags,
  ];
  if (log.memo) parts.push(log.memo);
  // Handoff-specific fields
  if (log.currentStatus) parts.push(...log.currentStatus);
  if (log.nextActions) parts.push(...log.nextActions);
  if (log.completed) parts.push(...log.completed);
  if (log.blockers) parts.push(...log.blockers);
  if (log.constraints) parts.push(...log.constraints);
  if (log.resumeContext) parts.push(...log.resumeContext);
  return parts.join(' ');
}

export function matchesLogQuery(log: LogEntry, query: string): boolean {
  return logSearchText(log).toLowerCase().includes(query.toLowerCase());
}

/** Find the first field that matched and return a snippet */
function logSnippet(log: LogEntry, q: string): string | undefined {
  const fields = [
    ...log.today,
    ...log.decisions,
    ...log.todo,
    ...(log.currentStatus || []),
    ...(log.nextActions || []),
    ...(log.completed || []),
    ...(log.blockers || []),
    ...(log.memo ? [log.memo] : []),
  ];
  for (const f of fields) {
    if (f.toLowerCase().includes(q)) {
      return truncSnippet(f, 80);
    }
  }
  return undefined;
}

// ─── MasterNote search ───

function masterNoteSearchText(note: MasterNote): string {
  const parts = [
    note.overview,
    note.currentStatus,
    ...note.decisions.map((d) => d.text),
    ...note.openIssues.map((d) => d.text),
    ...note.nextActions.map((d) => d.text),
  ];
  return parts.join(' ');
}

function masterNoteSnippet(note: MasterNote, q: string): string | undefined {
  const fields = [
    note.overview,
    note.currentStatus,
    ...note.decisions.map((d) => d.text),
    ...note.openIssues.map((d) => d.text),
    ...note.nextActions.map((d) => d.text),
  ];
  for (const f of fields) {
    if (f.toLowerCase().includes(q)) {
      return truncSnippet(f, 80);
    }
  }
  return undefined;
}

// ─── Unified search ───

export interface SearchInput {
  logs: LogEntry[];
  projects: Project[];
  todos: Todo[];
  masterNotes: MasterNote[];
  projectMap: Map<string, Project>;
}

export function search(query: string, data: SearchInput, limit = 30): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const results: SearchResult[] = [];

  // Projects (name match)
  for (const p of data.projects) {
    if (p.name.toLowerCase().includes(q)) {
      results.push({
        type: 'project',
        id: p.id,
        title: p.name,
      });
    }
  }

  // Master Notes / Project Summaries
  for (const mn of data.masterNotes) {
    const text = masterNoteSearchText(mn);
    if (text.toLowerCase().includes(q)) {
      const proj = data.projectMap.get(mn.projectId);
      results.push({
        type: 'summary',
        id: mn.id,
        title: proj?.name || mn.projectId,
        subtitle: 'Project Summary',
        snippet: masterNoteSnippet(mn, q),
        targetId: mn.projectId,
      });
    }
  }

  // Logs
  for (const log of data.logs) {
    if (results.length >= limit) break;
    const text = logSearchText(log);
    if (text.toLowerCase().includes(q)) {
      const proj = log.projectId ? data.projectMap.get(log.projectId) : undefined;
      results.push({
        type: 'log',
        id: log.id,
        title: log.title,
        subtitle: [
          log.outputMode === 'handoff' ? 'Handoff' : 'Worklog',
          proj?.name,
        ].filter(Boolean).join(' · '),
        snippet: log.title.toLowerCase().includes(q) ? undefined : logSnippet(log, q),
      });
    }
  }

  // Todos
  for (const td of data.todos) {
    if (results.length >= limit) break;
    if (td.text.toLowerCase().includes(q)) {
      results.push({
        type: 'todo',
        id: td.id,
        title: td.text,
        subtitle: td.done ? '✓' : '○',
        targetId: td.logId || undefined,
      });
    }
  }

  return results;
}

// ─── Helpers ───

function truncSnippet(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}
