import type { LogEntry, Todo, WeeklyReport } from './types';
import { getApiKey } from './storage';
import { callProvider, shouldUseBuiltinApi } from './provider';
import type { ProviderRequest } from './provider';
import { extractJson } from './transform';

const SYSTEM_PROMPT = `You are a weekly report generator. Given a set of work logs and TODO items from a week, generate a structured weekly report in JSON format.

Rules:
- Write in the same language as the input logs (auto-detect: Japanese or English).
- Be concise but comprehensive. Each bullet should be a single clear sentence.
- "summary" should be 3-5 sentences summarizing the entire week.
- "achievements" lists completed work and progress made.
- "decisions" consolidates all decisions made during the week (deduplicate).
- "openItems" lists unresolved issues, blockers, and items carried over.
- "completedTodos" and "pendingTodos" list the actual TODO texts.
- "nextWeek" suggests concrete next actions based on the week's context.
- Do NOT fabricate information. Only summarize what appears in the logs.

Output ONLY a valid JSON object with this exact structure:
{
  "summary": "string",
  "achievements": ["string"],
  "decisions": ["string"],
  "openItems": ["string"],
  "completedTodos": ["string"],
  "pendingTodos": ["string"],
  "nextWeek": ["string"]
}`;

function formatLogForPrompt(log: LogEntry): string {
  const lines: string[] = [];
  lines.push(`## ${log.title} (${log.createdAt.slice(0, 10)}) [${log.outputMode === 'handoff' ? 'Handoff' : 'Worklog'}]`);

  if (log.outputMode === 'handoff') {
    if (log.currentStatus?.length) lines.push('Current Status: ' + log.currentStatus.join('; '));
    if (log.nextActions?.length) lines.push('Next Actions: ' + log.nextActions.join('; '));
    if (log.completed?.length) lines.push('Completed: ' + log.completed.join('; '));
    if (log.blockers?.length) lines.push('Blockers: ' + log.blockers.join('; '));
    if (log.constraints?.length) lines.push('Constraints: ' + log.constraints.join('; '));
  } else {
    if (log.today.length) lines.push('Today: ' + log.today.join('; '));
    if (log.decisions.length) lines.push('Decisions: ' + log.decisions.join('; '));
    if (log.todo.length) lines.push('TODO: ' + log.todo.join('; '));
    if (log.relatedProjects.length) lines.push('Related: ' + log.relatedProjects.join(', '));
  }
  if (log.tags.length) lines.push('Tags: ' + log.tags.join(', '));
  return lines.join('\n');
}

export interface GenerateWeeklyReportOptions {
  logs: LogEntry[];
  todos: Todo[];
  weekStart: string;
  weekEnd: string;
  projectId?: string;
  projectName?: string;
  onProgress?: (phase: 'preparing' | 'generating' | 'done') => void;
}

export async function generateWeeklyReport(opts: GenerateWeeklyReportOptions): Promise<WeeklyReport> {
  const apiKey = getApiKey();
  if (!apiKey && !shouldUseBuiltinApi()) throw new Error('[API Key] Not set. Go to Settings and enter your API key.');

  opts.onProgress?.('preparing');

  const { logs, todos, weekStart, weekEnd, projectId, projectName } = opts;

  // Build user message
  const parts: string[] = [];
  parts.push(`Weekly Report: ${weekStart} to ${weekEnd}`);
  if (projectName) parts.push(`Project: ${projectName}`);
  parts.push(`\n--- LOGS (${logs.length}) ---\n`);
  for (const log of logs) {
    parts.push(formatLogForPrompt(log));
    parts.push('');
  }

  // Add TODO context
  const weekTodos = todos.filter((td) => {
    const created = new Date(td.createdAt).toISOString().slice(0, 10);
    return created >= weekStart && created <= weekEnd;
  });
  if (weekTodos.length > 0) {
    parts.push(`--- TODOs (${weekTodos.length}) ---`);
    for (const td of weekTodos) {
      parts.push(`[${td.done ? 'x' : ' '}] ${td.text}`);
    }
  }

  const userMessage = parts.join('\n');

  // Stats
  const worklogCount = logs.filter((l) => l.outputMode !== 'handoff').length;
  const handoffCount = logs.filter((l) => l.outputMode === 'handoff').length;
  const completedTodos = weekTodos.filter((t) => t.done).length;
  const todoCompletionRate = weekTodos.length > 0 ? Math.round((completedTodos / weekTodos.length) * 100) : 0;

  // Average workload
  const workloadLevels = logs.filter((l) => l.workloadLevel).map((l) => l.workloadLevel!);
  let averageWorkload: string | undefined;
  if (workloadLevels.length > 0) {
    const scores = workloadLevels.map((w) => w === 'high' ? 3 : w === 'medium' ? 2 : 1);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    averageWorkload = avg >= 2.5 ? 'high' : avg >= 1.5 ? 'medium' : 'low';
  }

  opts.onProgress?.('generating');

  const req: ProviderRequest = {
    apiKey,
    system: SYSTEM_PROMPT,
    userMessage,
    maxTokens: 8192,
  };

  const response = await callProvider(req);

  // Extract JSON using robust bracket-matching parser
  const jsonText = extractJson(response);
  const parsed = JSON.parse(jsonText);

  opts.onProgress?.('done');

  return {
    id: crypto.randomUUID(),
    weekStart,
    weekEnd,
    projectId,
    summary: parsed.summary || '',
    achievements: parsed.achievements || [],
    decisions: parsed.decisions || [],
    openItems: parsed.openItems || [],
    completedTodos: parsed.completedTodos || [],
    pendingTodos: parsed.pendingTodos || [],
    nextWeek: parsed.nextWeek || [],
    stats: {
      logCount: logs.length,
      worklogCount,
      handoffCount,
      todoCompletionRate,
      averageWorkload,
    },
    generatedAt: Date.now(),
  };
}

export function weeklyReportToMarkdown(report: WeeklyReport, projectName?: string): string {
  const lines: string[] = [];
  const header = projectName
    ? `# Weekly Report: ${report.weekStart} ~ ${report.weekEnd} (${projectName})`
    : `# Weekly Report: ${report.weekStart} ~ ${report.weekEnd}`;
  lines.push(header, '');

  lines.push('## Summary', '', report.summary, '');

  if (report.achievements.length) {
    lines.push('## Achievements');
    for (const a of report.achievements) lines.push(`- ${a}`);
    lines.push('');
  }

  if (report.decisions.length) {
    lines.push('## Decisions');
    for (const d of report.decisions) lines.push(`- ${d}`);
    lines.push('');
  }

  if (report.openItems.length) {
    lines.push('## Open Items');
    for (const o of report.openItems) lines.push(`- ${o}`);
    lines.push('');
  }

  if (report.completedTodos.length) {
    lines.push('## Completed TODOs');
    for (const t of report.completedTodos) lines.push(`- [x] ${t}`);
    lines.push('');
  }

  if (report.pendingTodos.length) {
    lines.push('## Pending TODOs');
    for (const t of report.pendingTodos) lines.push(`- [ ] ${t}`);
    lines.push('');
  }

  if (report.nextWeek.length) {
    lines.push('## Next Week');
    for (const n of report.nextWeek) lines.push(`- ${n}`);
    lines.push('');
  }

  lines.push('## Stats');
  lines.push(`- Logs: ${report.stats.logCount} (Worklog: ${report.stats.worklogCount}, Handoff: ${report.stats.handoffCount})`);
  lines.push(`- TODO completion: ${report.stats.todoCompletionRate}%`);
  if (report.stats.averageWorkload) {
    const wLabel = report.stats.averageWorkload === 'high' ? 'High' : report.stats.averageWorkload === 'medium' ? 'Medium' : 'Low';
    lines.push(`- Average workload: ${wLabel}`);
  }
  lines.push('');

  return lines.join('\n');
}
