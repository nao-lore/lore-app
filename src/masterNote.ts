import type { LogEntry, MasterNote, LogSummary, SourcedItem } from './types';
import { callProvider } from './provider';
import { getApiKey, getLogSummary, saveLogSummary } from './storage';

// ---------------------------------------------------------------------------
// Step 1: Extract structured summary from a single log (cached)
// ---------------------------------------------------------------------------

const EXTRACT_PROMPT = `Extract structured project information from this work log.

Return JSON only:
{
  "summary": "1-2 sentence summary of what was done",
  "decisions": ["key decisions made"],
  "issues": ["open issues, blockers, unresolved problems"],
  "actions": ["next actions, pending tasks"]
}

Rules:
- Be concise — one sentence per item
- Only include items that exist in the log
- Empty arrays for missing sections
- Match the language of the input (Japanese or English)`;

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
  return parts.join('\n');
}

async function extractLogSummary(log: LogEntry, apiKey: string): Promise<LogSummary> {
  const cached = getLogSummary(log.id);
  if (cached) {
    if (import.meta.env.DEV) console.log('[MasterNote] extractLogSummary cache hit:', log.id);
    return cached;
  }

  if (import.meta.env.DEV) console.log('[MasterNote] extractLogSummary API call:', log.id);
  const rawText = await callProvider({
    apiKey,
    system: EXTRACT_PROMPT,
    userMessage: logToInputText(log),
    maxTokens: 8192,
  });

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[MasterNote] extractLogSummary parse failed, raw:', rawText.slice(0, 200));
    throw new Error('[Parse Error] Could not extract JSON from response.');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const summary: LogSummary = {
    logId: log.id,
    summary: parsed.summary || '',
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    cachedAt: Date.now(),
  };

  if (import.meta.env.DEV) console.log('[MasterNote] extractLogSummary done:', log.id, { summary: summary.summary.slice(0, 50) });
  saveLogSummary(summary);
  return summary;
}

// ---------------------------------------------------------------------------
// Step 2: Merge summaries into a MasterNote (with source log references)
// ---------------------------------------------------------------------------

const MERGE_PROMPT = `You are creating a concise human-readable project summary.

Synthesize the following log summaries into a high-level overview for a human reader.
The goal is quick understanding, not completeness.

Return JSON only:
{
  "overview": "2-3 sentence summary: what this project is and where it stands now",
  "decisions": [
    { "text": "...", "sourceLogIds": ["logId_1"] }
  ],
  "openIssues": [
    { "text": "...", "sourceLogIds": ["logId_2"] }
  ],
  "nextActions": [
    { "text": "...", "sourceLogIds": ["logId_3"] }
  ]
}

Rules:
- decisions: max 5 items. Most impactful decisions only. Drop superseded or minor ones.
- openIssues: max 4 items. Blockers and high-risk items only.
- nextActions: max 3 items. Immediate next steps only. Drop backlog items.
- Each item: one clear sentence. No sub-bullets.
- Drop anything completed, obsolete, or low priority.
- Prioritize recency — later logs override earlier ones.
- Match the language of the input (Japanese or English)
- sourceLogIds MUST use the exact logId values provided in the input`;

function summariesToMergeInput(
  summaries: LogSummary[],
  existing: MasterNote | undefined,
): string {
  const parts: string[] = [];

  for (const s of summaries) {
    const lines = [
      `--- Log Summary (logId: ${s.logId}) ---`,
      `Summary: ${s.summary}`,
    ];
    if (s.decisions.length) lines.push(`Decisions: ${s.decisions.join('; ')}`);
    if (s.issues.length) lines.push(`Issues: ${s.issues.join('; ')}`);
    if (s.actions.length) lines.push(`Actions: ${s.actions.join('; ')}`);
    parts.push(lines.join('\n'));
  }

  let text = `${summaries.length} log summaries:\n\n${parts.join('\n\n')}`;

  if (existing) {
    text += `\n\n---\n\nEXISTING master note (update and improve, remove obsolete items):\n`;
    text += `Overview: ${existing.overview}\n`;
    if (existing.decisions.length) {
      text += `Decisions: ${existing.decisions.map((d) => d.text).join('; ')}\n`;
    }
    if (existing.openIssues.length) {
      text += `Open Issues: ${existing.openIssues.map((d) => d.text).join('; ')}\n`;
    }
    if (existing.nextActions.length) {
      text += `Next Actions: ${existing.nextActions.map((d) => d.text).join('; ')}\n`;
    }
  }

  return text;
}

function parseSourcedItems(raw: unknown): SourcedItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    // Handle both { text, sourceLogIds } and plain string (backward compat)
    if (typeof item === 'string') return { text: item, sourceLogIds: [] };
    return {
      text: item?.text || '',
      sourceLogIds: Array.isArray(item?.sourceLogIds) ? item.sourceLogIds : [],
    };
  }).filter((item) => item.text);
}

// ---------------------------------------------------------------------------
// Step 3: Refine an existing MasterNote with user instructions
// ---------------------------------------------------------------------------

const REFINE_PROMPT = `You are refining a project summary based on user feedback.

You will receive:
1. The current project summary (JSON)
2. A user instruction describing what to change

Apply the user's requested changes to the summary and return the updated JSON.

Return JSON only:
{
  "overview": "2-3 sentence summary: what this project is and where it stands now",
  "decisions": [
    { "text": "...", "sourceLogIds": ["logId_1"] }
  ],
  "openIssues": [
    { "text": "...", "sourceLogIds": ["logId_2"] }
  ],
  "nextActions": [
    { "text": "...", "sourceLogIds": ["logId_3"] }
  ]
}

Rules:
- Preserve sourceLogIds from the original summary
- Only change what the user requested
- Keep unchanged sections as-is
- decisions: max 5, openIssues: max 4, nextActions: max 3
- Write concisely — each item should be one clear sentence
- Match the language of the existing summary`;

export async function refineMasterNote(
  note: MasterNote,
  instruction: string,
): Promise<MasterNote> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('[API Key] Not set. Go to Settings and enter your API key.');

  const currentJson = JSON.stringify({
    overview: note.overview,
    decisions: note.decisions,
    openIssues: note.openIssues,
    nextActions: note.nextActions,
  }, null, 2);

  const rawText = await callProvider({
    apiKey,
    system: REFINE_PROMPT,
    userMessage: `Current summary:\n${currentJson}\n\nUser instruction:\n${instruction}`,
    maxTokens: 8192,
  });

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('[Parse Error] Could not extract JSON from response.');

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    ...note,
    overview: parsed.overview || note.overview,
    currentStatus: '',
    decisions: parseSourcedItems(parsed.decisions),
    openIssues: parseSourcedItems(parsed.openIssues),
    nextActions: parseSourcedItems(parsed.nextActions),
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GenerateProgress {
  phase: 'extract' | 'merge' | 'aiContext';
  current: number;
  total: number;
}

export async function generateMasterNote(
  projectId: string,
  logs: LogEntry[],
  existing: MasterNote | undefined,
  onProgress?: (p: GenerateProgress) => void,
): Promise<MasterNote> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('[API Key] Not set. Go to Settings and enter your API key.');
  if (logs.length === 0) throw new Error('No logs to generate from.');

  const sorted = [...logs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  // Step 1: Extract summaries (sequential with rate-limit delay)
  const summaries: LogSummary[] = [];
  for (let i = 0; i < sorted.length; i++) {
    onProgress?.({ phase: 'extract', current: i + 1, total: sorted.length });
    const summary = await extractLogSummary(sorted[i], apiKey);
    summaries.push(summary);
    // Delay between non-cached API calls to avoid rate limiting
    if (i < sorted.length - 1 && !summary.cachedAt) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Step 2: Merge into MasterNote
  onProgress?.({ phase: 'merge', current: 0, total: 1 });
  if (import.meta.env.DEV) console.log('[MasterNote] Starting merge with', summaries.length, 'summaries');

  const mergeInput = summariesToMergeInput(summaries, existing);

  const rawText = await callProvider({
    apiKey,
    system: MERGE_PROMPT,
    userMessage: mergeInput,
    maxTokens: 8192,
  });

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[MasterNote] Merge parse failed, raw:', rawText.slice(0, 300));
    throw new Error('[Parse Error] Could not extract JSON from merge response.');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    console.error('[MasterNote] Merge JSON.parse error:', parseErr, 'raw:', jsonMatch[0].slice(0, 300));
    throw new Error('[Parse Error] Invalid JSON in merge response.');
  }

  if (import.meta.env.DEV) console.log('[MasterNote] Merge parsed:', {
    overview: typeof parsed.overview === 'string' ? parsed.overview.slice(0, 50) : parsed.overview,
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions.length : parsed.decisions,
    openIssues: Array.isArray(parsed.openIssues) ? parsed.openIssues.length : parsed.openIssues,
    nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions.length : parsed.nextActions,
  });

  onProgress?.({ phase: 'merge', current: 1, total: 1 });

  const note: MasterNote = {
    id: existing?.id || crypto.randomUUID(),
    projectId,
    overview: parsed.overview as string || '',
    currentStatus: '',
    decisions: parseSourcedItems(parsed.decisions),
    openIssues: parseSourcedItems(parsed.openIssues),
    nextActions: parseSourcedItems(parsed.nextActions),
    relatedLogIds: sorted.map((l) => l.id),
    updatedAt: Date.now(),
  };

  if (import.meta.env.DEV) console.log('[MasterNote] Final note:', {
    id: note.id,
    overview: note.overview.slice(0, 50),
    decisions: note.decisions.length,
    openIssues: note.openIssues.length,
    nextActions: note.nextActions.length,
  });

  return note;
}
