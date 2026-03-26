import type { LogEntry, KnowledgeBase, KnowledgeEntry, SourcedItem } from './types';
import { callProvider, shouldUseBuiltinApi } from './provider';
import { getApiKey, getLogSummary, saveLogSummary } from './storage';
import { resolveLangInstruction } from './transform';
import { EXTRACT_PROMPT } from './prompts';

function logToInputText(log: LogEntry): string {
  const parts: string[] = [];
  parts.push(`## ${log.title} (${log.createdAt})`);
  parts.push(`Type: ${log.outputMode || 'worklog'}`);

  if (log.outputMode === 'handoff') {
    if (log.currentStatus?.length) parts.push(`Status: ${log.currentStatus.join('; ')}`);
    if (log.nextActions?.length) parts.push(`Next: ${log.nextActions.join('; ')}`);
    if (log.completed?.length) parts.push(`Done: ${log.completed.join('; ')}`);
    if (log.blockers?.length) parts.push(`Issues: ${log.blockers.join('; ')}`);
    if (log.constraints?.length) parts.push(`Constraints: ${log.constraints.join('; ')}`);
  } else {
    if (log.today.length) parts.push(`Today: ${log.today.join('; ')}`);
    if (log.todo.length) parts.push(`TODO: ${log.todo.join('; ')}`);
  }
  if (log.decisions.length) parts.push(`Decisions: ${log.decisions.join('; ')}`);
  if (log.tags.length) parts.push(`Tags: ${log.tags.join(', ')}`);
  return parts.join('\n');
}

async function ensureLogSummary(log: LogEntry, apiKey: string) {
  const cached = getLogSummary(log.id);
  if (cached) return cached;

  const inputText = logToInputText(log);
  const langInstruction = resolveLangInstruction(inputText);
  const rawText = await callProvider({
    apiKey,
    system: EXTRACT_PROMPT.replace('{LANG_OVERRIDE}', langInstruction),
    userMessage: inputText,
    maxTokens: 8192,
  });

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('[Parse Error] Could not extract JSON from response.');

  const parsed = JSON.parse(jsonMatch[0]);
  const summary = {
    logId: log.id,
    summary: parsed.summary || '',
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    cachedAt: Date.now(),
  };

  saveLogSummary(summary);
  return summary;
}

// ---------------------------------------------------------------------------
// Knowledge Base generation prompt
// ---------------------------------------------------------------------------

const KB_PROMPT = `You are analyzing a project's log history to extract a knowledge base.
Your goal: find RECURRING patterns — problems that appeared multiple times and their solutions,
decisions that were made repeatedly, and best practices that emerged.

You will receive summaries from multiple logs with their logIds.

Return JSON only:
{
  "patterns": [
    {
      "problem": "A recurring problem that appeared in multiple logs",
      "solution": "How it was resolved or the workaround used",
      "sourceLogIds": ["logId_1", "logId_2"],
      "frequency": 3
    }
  ],
  "bestPractices": [
    "A best practice or lesson learned that emerged from the project"
  ],
  "commonDecisions": [
    {
      "text": "A decision that was made and referenced multiple times",
      "sourceLogIds": ["logId_1", "logId_3"]
    }
  ]
}

Rules:
- Focus on RECURRING themes — things mentioned in 2+ logs
- patterns: pair each recurring problem with its solution. If no solution was found, say "未解決" / "Unresolved"
- frequency: number of distinct logs where this pattern appeared
- bestPractices: actionable lessons distilled from the logs (3-8 items)
- commonDecisions: decisions that shaped the project direction
- sourceLogIds MUST use exact logId values from the input
- Write concisely — each item should be one clear sentence
- Sort patterns by frequency (most frequent first)
{LANG_OVERRIDE}`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface KBProgress {
  phase: 'extract' | 'analyze';
  current: number;
  total: number;
}

export async function generateKnowledgeBase(
  projectId: string,
  logs: LogEntry[],
  onProgress?: (p: KBProgress) => void,
): Promise<KnowledgeBase> {
  const apiKey = getApiKey();
  if (!apiKey && !shouldUseBuiltinApi()) throw new Error('[API Key] Not set. Go to Settings and enter your API key.');
  if (logs.length === 0) throw new Error('No logs to analyze.');

  const sorted = [...logs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  // Step 1: Extract summaries (cached per log)
  const summaries = [];
  for (let i = 0; i < sorted.length; i++) {
    onProgress?.({ phase: 'extract', current: i + 1, total: sorted.length });
    const summary = await ensureLogSummary(sorted[i], apiKey);
    summaries.push(summary);
  }

  // Step 2: Analyze for recurring patterns
  onProgress?.({ phase: 'analyze', current: 0, total: 1 });

  const parts: string[] = [];
  for (const s of summaries) {
    const lines = [`--- Log Summary (logId: ${s.logId}) ---`, `Summary: ${s.summary}`];
    if (s.decisions.length) lines.push(`Decisions: ${s.decisions.join('; ')}`);
    if (s.issues.length) lines.push(`Issues: ${s.issues.join('; ')}`);
    if (s.actions.length) lines.push(`Actions: ${s.actions.join('; ')}`);
    parts.push(lines.join('\n'));
  }

  const input = `${summaries.length} log summaries from the project:\n\n${parts.join('\n\n')}`;
  const langInstruction = resolveLangInstruction(input);

  const rawText = await callProvider({
    apiKey,
    system: KB_PROMPT.replace('{LANG_OVERRIDE}', langInstruction),
    userMessage: input,
    maxTokens: 8192,
  });

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('[Parse Error] Could not extract JSON from response.');

  const parsed = JSON.parse(jsonMatch[0]);

  onProgress?.({ phase: 'analyze', current: 1, total: 1 });

  const patterns: KnowledgeEntry[] = Array.isArray(parsed.patterns)
    ? parsed.patterns.map((p: Record<string, unknown>) => ({
        problem: String(p.problem || ''),
        solution: String(p.solution || ''),
        sourceLogIds: Array.isArray(p.sourceLogIds) ? p.sourceLogIds : [],
        frequency: typeof p.frequency === 'number' ? p.frequency : 1,
      })).filter((p: KnowledgeEntry) => p.problem)
    : [];

  const bestPractices: string[] = Array.isArray(parsed.bestPractices)
    ? parsed.bestPractices.filter((s: unknown) => typeof s === 'string' && s)
    : [];

  const commonDecisions: SourcedItem[] = Array.isArray(parsed.commonDecisions)
    ? parsed.commonDecisions.map((d: Record<string, unknown>) => ({
        text: String(d.text || ''),
        sourceLogIds: Array.isArray(d.sourceLogIds) ? d.sourceLogIds : [],
      })).filter((d: SourcedItem) => d.text)
    : [];

  return {
    id: crypto.randomUUID(),
    projectId,
    patterns,
    bestPractices,
    commonDecisions,
    generatedAt: Date.now(),
    logCount: sorted.length,
  };
}
