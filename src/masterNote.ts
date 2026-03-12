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
  if (cached) return cached;

  const rawText = await callProvider({
    apiKey,
    system: EXTRACT_PROMPT,
    userMessage: logToInputText(log),
    maxTokens: 8192,
  });

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('[Parse Error] Could not extract JSON from response.');

  const parsed = JSON.parse(jsonMatch[0]);
  const summary: LogSummary = {
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
// Step 2: Merge summaries into a MasterNote (with source log references)
// ---------------------------------------------------------------------------

const MERGE_PROMPT = `You are summarizing a project's current state.

Combine the following log summaries into a single project overview.
For each item in decisions, openIssues, and nextActions, attach the logIds that support the statement.

Return JSON only:
{
  "overview": "1-3 sentence project summary",
  "currentStatus": "Current state of the project in 1-3 sentences",
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
- sourceLogIds MUST use the exact logId values provided in the input
- An item may reference multiple logIds if it was mentioned in several logs
- Merge and deduplicate across all summaries
- Drop items that are clearly completed or obsolete
- currentStatus should reflect the LATEST state
- nextActions should only include items NOT yet done
- Write concisely — each item should be one clear sentence
- Match the language of the input (Japanese or English)`;

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
    text += `Status: ${existing.currentStatus}\n`;
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
  "overview": "...",
  "currentStatus": "...",
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
    currentStatus: note.currentStatus,
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
    currentStatus: parsed.currentStatus || note.currentStatus,
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

// ---------------------------------------------------------------------------
// AI Context generation — compressed context block from a MasterNote
// ---------------------------------------------------------------------------

const AI_CONTEXT_PROMPT = `以下のProject Summaryから、AIアシスタントに渡すための最小限のコンテキストを生成してください。
以下のフォーマットで出力してください。余計な説明は不要です。

## AI Context
- Project: {プロジェクト名}
- Goal: {目的を1行で}
- Stack: {技術スタック（あれば）}
- Current Status: {現在の状態を2〜3行で}
- Key Decisions: {重要な決定事項を箇条書き、最大5件}
- Open Issues: {未解決の問題を箇条書き、最大5件}

Rules:
- Match the language of the input (Japanese or English)
- Keep technical terms (file names, function names, library names) in English
- Be extremely concise — this is a compressed context block, not a report`;

export async function generateAiContext(
  note: MasterNote,
  projectName: string,
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('[API Key] Not set.');

  const input = [
    `Project: ${projectName}`,
    `Overview: ${note.overview}`,
    `Current Status: ${note.currentStatus}`,
    note.decisions.length > 0 ? `Decisions:\n${note.decisions.map((d) => `- ${d.text}`).join('\n')}` : '',
    note.openIssues.length > 0 ? `Open Issues:\n${note.openIssues.map((d) => `- ${d.text}`).join('\n')}` : '',
    note.nextActions.length > 0 ? `Next Actions:\n${note.nextActions.map((d) => `- ${d.text}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  const rawText = await callProvider({
    apiKey,
    system: AI_CONTEXT_PROMPT,
    userMessage: input,
    maxTokens: 8192,
  });

  return rawText.trim();
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

  // Step 1: Extract summaries (cached per log)
  const summaries: LogSummary[] = [];
  for (let i = 0; i < sorted.length; i++) {
    onProgress?.({ phase: 'extract', current: i + 1, total: sorted.length });
    const summary = await extractLogSummary(sorted[i], apiKey);
    summaries.push(summary);
  }

  // Step 2: Merge into MasterNote
  onProgress?.({ phase: 'merge', current: 0, total: 1 });

  const mergeInput = summariesToMergeInput(summaries, existing);

  const rawText = await callProvider({
    apiKey,
    system: MERGE_PROMPT,
    userMessage: mergeInput,
    maxTokens: 8192,
  });

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('[Parse Error] Could not extract JSON from response.');

  const parsed = JSON.parse(jsonMatch[0]);

  onProgress?.({ phase: 'merge', current: 1, total: 1 });

  const note: MasterNote = {
    id: existing?.id || crypto.randomUUID(),
    projectId,
    overview: parsed.overview || '',
    currentStatus: parsed.currentStatus || '',
    decisions: parseSourcedItems(parsed.decisions),
    openIssues: parseSourcedItems(parsed.openIssues),
    nextActions: parseSourcedItems(parsed.nextActions),
    relatedLogIds: sorted.map((l) => l.id),
    updatedAt: Date.now(),
  };

  return note;
}
