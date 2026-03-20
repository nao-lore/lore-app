/**
 * Lore Extension — Transform Engine
 *
 * Lightweight port of the app's transform pipeline for in-extension processing.
 * Calls loresync.dev/api/generate (built-in Gemini, no API key needed).
 */

'use strict';

// ---------------------------------------------------------------------------
// Prompts (from src/prompts.ts — keep in sync)
// ---------------------------------------------------------------------------

const PROMPT_VERSION = '2.0';
const VERSION_HEADER = `[Prompt v${PROMPT_VERSION}]\n\n`;

const HANDOFF_PROMPT = VERSION_HEADER + `You extract a structured RESTART MEMO from an AI chat history.
This is a control document for resuming work — NOT a report. Be direct and operationally precise.
You only extract what the USER explicitly stated or confirmed.
Output format: ONLY valid JSON. No markdown. No code fences. No explanation.
Output language MUST match input. Japanese → Japanese (keep code terms in English). English → English.

Schema:
{"title":"string","handoffMeta":{"sessionFocus":"string or null","whyThisSession":"string or null","timePressure":"string or null"},"currentStatus":["string"],"resumeChecklist":[{"action":"string","whyNow":"string (REQUIRED)","ifSkipped":"string (REQUIRED)"}],"nextActions":[{"action":"string","whyImportant":"string","priorityReason":"string or null","dueBy":"string or null","dependsOn":["string"] or null}],"actionBacklog":[{"action":"string","whyImportant":"string","priorityReason":"string or null","dueBy":"string or null","dependsOn":["string"] or null}],"completed":["string"],"blockers":["string"],"decisions":[{"decision":"string","rationale":"string"}],"constraints":["string"],"tags":["string"]}

TITLE: 20-40 chars, specific nouns and actions. Match input language. NEVER generic ("Restart Memo","会話ログ").
CURRENT STATUS: 3-5 bullets. Present-tense ONLY.
HANDOFF META: Fill all three whenever possible.
RESUME CHECKLIST (max 3): First things to check/verify/decide when resuming. whyNow & ifSkipped: MANDATORY.
NEXT ACTIONS (max 4): Blocking tasks only. whyImportant: infer from context, never null.
ACTION BACKLOG (max 7): Important but not blocking.
COMPLETED: MANDATORY. 2-6 bullets.
BLOCKERS: 0-3 unresolved risks.
DECISIONS (max 6): Active decisions with rationale.
CONSTRAINTS: 0-3 stable rules.
TAGS: 4-7 tags.`;

const TODO_ONLY_PROMPT = VERSION_HEADER + `You extract a TODO list from an AI chat history.
You are strict and conservative. You only extract what the USER explicitly committed to doing.
Assistant suggestions are NOT TODOs unless the user explicitly accepts them.

Output format: ONLY valid JSON. No markdown. No code fences. No explanation.

Schema:
{"todos":[{"title":"string","priority":"high"|"medium"|"low","dueDate":"YYYY-MM-DD or null"}]}

TODO EXTRACTION rules:
- ONLY include actions the user explicitly committed to doing NEXT.
- EXCLUDE completed items, concluded investigations, vague aspirations.
- Each TODO = ONE specific, executable action.
- If zero items qualify, return {"todos":[]}.

PRIORITY: high = urgent/critical. medium = default. low = optional/nice-to-have.
DUE DATE: Only if explicitly mentioned. null otherwise.
Output language MUST match input language.`;

const BOTH_PROMPT = VERSION_HEADER + `You extract BOTH a work log AND a restart memo from an AI chat history in a single pass.
You are strict and conservative. You only extract what the USER explicitly stated or confirmed.

Output format: ONLY valid JSON. No markdown. No code fences. No explanation.

Schema:
{"worklog":{"title":"string","today":["string"],"decisions":["string"],"todo":["string"],"relatedProjects":["string"],"tags":["string"]},"handoff":{"title":"string","handoffMeta":{"sessionFocus":"string or null","whyThisSession":"string or null","timePressure":"string or null"},"currentStatus":["string"],"resumeChecklist":[{"action":"string","whyNow":"string (REQUIRED)","ifSkipped":"string (REQUIRED)"}],"nextActions":[{"action":"string","whyImportant":"string","priorityReason":"string or null","dueBy":"string or null","dependsOn":["string"] or null}],"actionBacklog":[{"action":"string","whyImportant":"string","priorityReason":"string or null","dueBy":"string or null","dependsOn":["string"] or null}],"completed":["string"],"blockers":["string"],"decisions":[{"decision":"string","rationale":"string"}],"constraints":["string"],"tags":["string"]},"classification":{"projectId":"string or null","confidence":0.0}}

=== WORKLOG RULES ===
TITLE: 20-40 chars, specific. TODAY: 3-8 items. DECISIONS: Only explicit commitments. TODO: Only committed next actions. TAGS: 4-7 tags.

=== HANDOFF RULES ===
TITLE: Reuse worklog title. CURRENT STATUS: 3-5 present-tense. RESUME CHECKLIST: max 3, whyNow & ifSkipped mandatory. NEXT ACTIONS: max 4, blocking only. ACTION BACKLOG: max 7. COMPLETED: 2-6 bullets. DECISIONS: max 6 with rationale. TAGS: 4-7.

=== CLASSIFICATION ===
If PROJECTS list provided, match to best project. Otherwise projectId=null, confidence=0.

Output language MUST match input.`;

// ---------------------------------------------------------------------------
// Language detection & instructions
// ---------------------------------------------------------------------------

const LANG_INSTRUCTIONS = {
  ja: 'The input is Japanese. You MUST output ALL fields in Japanese. Keep file names, code identifiers, API names, and technical terms in English.',
  en: 'The input is English. You MUST output ALL fields in English.',
  es: 'You MUST output ALL fields in Spanish. Keep technical terms in English.',
  fr: 'You MUST output ALL fields in French. Keep technical terms in English.',
  de: 'You MUST output ALL fields in German. Keep technical terms in English.',
  zh: 'You MUST output ALL fields in Simplified Chinese. Keep technical terms in English.',
  ko: 'You MUST output ALL fields in Korean. Keep technical terms in English.',
  pt: 'You MUST output ALL fields in Portuguese. Keep technical terms in English.',
};

function detectLanguage(text) {
  const sample = text.slice(0, 2000);
  const jaPattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF]/gu;
  const jaMatches = sample.match(jaPattern);
  const jaRatio = (jaMatches?.length ?? 0) / sample.length;
  return jaRatio > 0.15 ? 'ja' : 'en';
}

// ---------------------------------------------------------------------------
// JSON extraction (from transform.ts)
// ---------------------------------------------------------------------------

function extractJson(raw) {
  // Strip markdown fences
  let stripped = raw.replace(/^[\s\S]*?```json\s*/i, '').replace(/```[\s\S]*/g, '');
  if (!stripped.includes('{')) stripped = raw;

  const start = stripped.indexOf('{');
  if (start === -1) throw new Error('No JSON object found');

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return stripped.slice(start, i + 1);
    }
  }

  throw new Error('Incomplete JSON object');
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

const API_URL = 'https://loresync.dev/api/generate';

async function callApi(system, userMessage) {
  const body = JSON.stringify({
    system,
    userMessage,
    maxTokens: 8192,
  });

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const remaining = res.headers.get('X-RateLimit-Remaining');

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'API request failed' }));
    const error = new Error(err.error || `API error: ${res.status}`);
    error.remaining = remaining ? parseInt(remaining, 10) : null;
    error.status = res.status;
    throw error;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from API');

  return { text, remaining: remaining ? parseInt(remaining, 10) : null };
}

// ---------------------------------------------------------------------------
// Transform functions
// ---------------------------------------------------------------------------

function getPromptAndMessage(mode, conversationText, projectsList) {
  const lang = detectLanguage(conversationText);
  const langInstruction = LANG_INSTRUCTIONS[lang] || LANG_INSTRUCTIONS.en;

  let system, userMessage;

  if (mode === 'handoff') {
    system = HANDOFF_PROMPT;
    userMessage = `${langInstruction}\n\nExtract a restart memo from the following conversation.\n\nCHAT:\n${conversationText}`;
  } else if (mode === 'todo_only') {
    system = TODO_ONLY_PROMPT;
    userMessage = `${langInstruction}\n\nExtract TODOs from the following conversation.\n\nCHAT:\n${conversationText}`;
  } else {
    // handoff_todo → use BOTH prompt
    system = BOTH_PROMPT;
    const projectsSection = projectsList && projectsList.length > 0
      ? '\n\nPROJECTS:\n' + projectsList.map((p) => `- ${p.id}: ${p.name}`).join('\n')
      : '';
    userMessage = `${langInstruction}\n\nExtract a work log AND restart memo from the following conversation.${projectsSection}\n\nCHAT:\n${conversationText}`;
  }

  return { system, userMessage };
}

/**
 * Run transform via the built-in API.
 * Returns { result, remaining } where result is the parsed JSON.
 */
async function runTransform(mode, conversationText, projectsList) {
  const { system, userMessage } = getPromptAndMessage(mode, conversationText, projectsList);
  const { text: rawText, remaining } = await callApi(system, userMessage);

  const jsonStr = extractJson(rawText);
  const parsed = JSON.parse(jsonStr);

  return { result: parsed, remaining };
}

/**
 * Build a LogEntry from the transform result.
 */
function buildLogEntry(mode, result, projectId) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (mode === 'todo_only') {
    return {
      id,
      type: 'todo_only',
      todos: result.todos || [],
      projectId: projectId || undefined,
      createdAt: now,
    };
  }

  // For handoff_todo (both mode), extract handoff part
  const handoff = mode === 'handoff_todo' ? (result.handoff || result) : result;
  const worklog = mode === 'handoff_todo' ? (result.worklog || {}) : {};

  // Normalize decisions
  const rawDecisions = handoff.decisions || [];
  const decisions = [];
  const decisionRationales = [];
  for (const d of rawDecisions) {
    if (typeof d === 'object' && d !== null && d.decision) {
      decisions.push(d.decision);
      decisionRationales.push({ decision: d.decision, rationale: d.rationale || null });
    } else if (typeof d === 'string') {
      decisions.push(d);
      decisionRationales.push({ decision: d, rationale: null });
    }
  }

  // Normalize nextActions
  const rawNextActions = handoff.nextActions || [];
  const nextActionItems = [];
  const nextActions = [];
  for (const a of rawNextActions.slice(0, 4)) {
    if (typeof a === 'object' && a !== null && a.action) {
      nextActions.push(a.action);
      nextActionItems.push({
        action: a.action,
        whyImportant: a.whyImportant || null,
        priorityReason: a.priorityReason || null,
        dueBy: a.dueBy || null,
        dependsOn: a.dependsOn || null,
      });
    } else if (typeof a === 'string') {
      nextActions.push(a);
      nextActionItems.push({ action: a, whyImportant: null, priorityReason: null, dueBy: null, dependsOn: null });
    }
  }

  // Normalize actionBacklog
  const rawBacklog = handoff.actionBacklog || [];
  const actionBacklog = [];
  for (const a of rawBacklog.slice(0, 7)) {
    if (typeof a === 'object' && a !== null && a.action) {
      actionBacklog.push({
        action: a.action,
        whyImportant: a.whyImportant || null,
        priorityReason: a.priorityReason || null,
        dueBy: a.dueBy || null,
        dependsOn: a.dependsOn || null,
      });
    }
  }

  // Normalize resumeChecklist
  const rawChecklist = handoff.resumeChecklist || [];
  const resumeChecklist = [];
  for (const r of rawChecklist.slice(0, 3)) {
    if (typeof r === 'object' && r !== null && r.action) {
      resumeChecklist.push({
        action: r.action,
        whyNow: r.whyNow || null,
        ifSkipped: r.ifSkipped || null,
      });
    }
  }

  const toArr = (v) => Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];

  const entry = {
    id,
    createdAt: now,
    importedAt: now,
    title: handoff.title || 'Untitled',
    projectId: projectId || undefined,
    sourceReference: { source: 'extension-transform' },
    outputMode: 'handoff',
    today: toArr(worklog.today),
    decisions,
    decisionRationales,
    todo: toArr(worklog.todo),
    relatedProjects: toArr(worklog.relatedProjects),
    tags: toArr(handoff.tags),
    currentStatus: toArr(handoff.currentStatus),
    nextActions,
    nextActionItems,
    actionBacklog: actionBacklog.length > 0 ? actionBacklog : undefined,
    completed: toArr(handoff.completed),
    blockers: toArr(handoff.blockers),
    constraints: toArr(handoff.constraints),
    resumeContext: resumeChecklist.map((r) => r.action),
    resumeChecklist,
    handoffMeta: {
      sessionFocus: handoff.handoffMeta?.sessionFocus || null,
      whyThisSession: handoff.handoffMeta?.whyThisSession || null,
      timePressure: handoff.handoffMeta?.timePressure || null,
    },
  };

  // Auto-classification from BOTH mode
  if (mode === 'handoff_todo' && result.classification?.projectId) {
    entry.projectId = result.classification.projectId;
  }

  return entry;
}

/**
 * Format a log entry as Markdown for clipboard.
 */
function formatLogAsMarkdown(entry) {
  const lines = [];
  lines.push(`## ${entry.title || 'Untitled'}`);

  if (entry.handoffMeta?.sessionFocus) {
    lines.push(`**Focus:** ${entry.handoffMeta.sessionFocus}`);
  }

  if (entry.currentStatus?.length > 0) {
    lines.push('', '### Current Status');
    for (const s of entry.currentStatus) lines.push(`- ${s}`);
  }

  if (entry.resumeChecklist?.length > 0) {
    lines.push('', '### Resume Checklist');
    for (const r of entry.resumeChecklist) {
      lines.push(`- [ ] ${r.action}`);
      if (r.whyNow) lines.push(`  - Why now: ${r.whyNow}`);
    }
  }

  if (entry.nextActionItems?.length > 0) {
    lines.push('', '### Next Actions');
    for (const a of entry.nextActionItems) {
      lines.push(`- ${a.action}`);
      if (a.whyImportant) lines.push(`  - ${a.whyImportant}`);
    }
  }

  if (entry.completed?.length > 0) {
    lines.push('', '### Completed');
    for (const c of entry.completed) lines.push(`- ${c}`);
  }

  if (entry.decisions?.length > 0) {
    lines.push('', '### Decisions');
    const rationales = entry.decisionRationales || [];
    for (let i = 0; i < entry.decisions.length; i++) {
      lines.push(`- ${entry.decisions[i]}`);
      if (rationales[i]?.rationale) lines.push(`  - Rationale: ${rationales[i].rationale}`);
    }
  }

  if (entry.blockers?.length > 0) {
    lines.push('', '### Blockers');
    for (const b of entry.blockers) lines.push(`- ${b}`);
  }

  if (entry.today?.length > 0) {
    lines.push('', '### Today');
    for (const t of entry.today) lines.push(`- ${t}`);
  }

  if (entry.tags?.length > 0) {
    lines.push('', `**Tags:** ${entry.tags.join(', ')}`);
  }

  return lines.join('\n');
}

// Export for use in background.js via importScripts
// eslint-disable-next-line no-unused-vars
const LoreTransform = { runTransform, buildLogEntry, detectLanguage, formatLogAsMarkdown };
