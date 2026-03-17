import type { TransformResult, HandoffResult, BothResult, DecisionWithRationale, NextActionItem, ResumeChecklistItem, HandoffMeta, LogEntry } from './types';
import { getApiKey, getLang } from './storage';
import { shouldUseBuiltinApi } from './provider';
import { callProvider, callProviderStream } from './provider';
import type { StreamCallback } from './provider';
import { normalizeDecisions as normalizeDecisionsUtil } from './utils/decisions';
import { SYSTEM_PROMPT, HANDOFF_PROMPT, BOTH_PROMPT, TODO_ONLY_PROMPT } from './prompts';
import { parseJsonInWorker } from './workers/parseHelper';

// Prompts (SYSTEM_PROMPT, HANDOFF_PROMPT, BOTH_PROMPT, TODO_ONLY_PROMPT) are
// defined in ./prompts.ts with PROMPT_VERSION for tracking.

// Threshold for offloading JSON parsing to a Web Worker (10 KB)
const WORKER_PARSE_THRESHOLD = 10_000;

// =============================================================================
// Blocker dedup — remove blockers that overlap with completed/decisions
// =============================================================================

/** Extract significant keywords (3+ chars, lowercased) from a sentence */
function extractKeywords(text: string): Set<string> {
  // Split on whitespace, punctuation, particles
  return new Set(
    text
      .toLowerCase()
      .replace(/[()（）「」『』、。,.;:：・\-–—]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3)
  );
}

/** Check if two items share enough keywords to be considered overlapping */
function isOverlapping(blocker: string, resolved: string): boolean {
  const bKeys = extractKeywords(blocker);
  const rKeys = extractKeywords(resolved);
  if (bKeys.size === 0 || rKeys.size === 0) return false;
  let shared = 0;
  for (const k of bKeys) {
    if (rKeys.has(k)) shared++;
  }
  // Overlap if ≥50% of blocker's keywords appear in the resolved item
  return shared / bKeys.size >= 0.5;
}

/** Filter out blockers that are already covered by completed or decisions */
export function filterResolvedBlockers(
  blockers: string[],
  completed: string[],
  decisions: string[],
): string[] {
  const resolved = [...completed, ...decisions];
  if (resolved.length === 0) return blockers;
  return blockers.filter(
    (b) => !resolved.some((r) => isOverlapping(b, r)),
  );
}

export function detectLanguage(text: string): 'ja' | 'en' {
  const jaPattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g;
  const jaMatches = text.match(jaPattern);
  const jaRatio = (jaMatches?.length ?? 0) / text.length;
  return jaRatio > 0.1 ? 'ja' : 'en';
}

// =============================================================================
// Post-parse validation — runtime sanity checks on AI output
// =============================================================================

const GENERIC_TITLE_PATTERNS = [
  /^restart\s*memo$/i,
  /^session\s*summary$/i,
  /^chat\s*log$/i,
  /^会話ログ$/,
  /^作業メモ$/,
  /^AIとの議論$/,
  /^セッションまとめ$/,
  /^untitled$/i,
];

/** Extract a fallback title from the first user message in the conversation text */
function extractFallbackTitle(sourceText: string): string | null {
  // Look for "User:" or "Human:" prefix patterns
  const userMsgMatch = sourceText.match(/(?:^|\n)(?:User|Human|ユーザー)\s*[:：]\s*(.+)/i);
  if (userMsgMatch) {
    const line = userMsgMatch[1].trim();
    if (line.length > 0) return line.slice(0, 50);
  }
  // Fallback: first non-empty line
  const firstLine = sourceText.split('\n').find((l) => l.trim().length > 5);
  if (firstLine) return firstLine.trim().slice(0, 50);
  return null;
}

/**
 * Validate and fix worklog-style parsed result.
 * Mutates the object in-place for efficiency.
 */
function validateWorklogResult(
  parsed: { title?: string; today?: string[]; decisions?: string[]; tags?: string[] },
  sourceText: string,
): void {
  const charLen = sourceText.length;

  // Cap decisions at 6
  if (parsed.decisions && parsed.decisions.length > 6) {
    parsed.decisions = parsed.decisions.slice(0, 6);
  }

  // Warn if too few tags for non-trivial conversations
  if (import.meta.env.DEV && parsed.tags && parsed.tags.length < 3 && charLen > 500) {
    console.warn(`[Transform Validation] tags.length=${parsed.tags.length} for ${charLen}-char input — expected >= 3`);
  }

  // Warn if today is empty for long conversations
  if (import.meta.env.DEV && parsed.today && parsed.today.length === 0 && charLen > 2000) {
    console.warn(`[Transform Validation] today is empty for ${charLen}-char input — expected at least 1 item`);
  }

  // Fix generic / empty titles
  const title = parsed.title?.trim() || '';
  if (!title || GENERIC_TITLE_PATTERNS.some((p) => p.test(title))) {
    const fallback = extractFallbackTitle(sourceText);
    if (fallback) {
      parsed.title = fallback;
    }
  }
}

export function extractJson(raw: string): string {
  // 1. Strip markdown code fences (handle ```json ... ``` wrapping)
  let stripped = raw;
  // Remove opening ```json or ``` fence
  stripped = stripped.replace(/^[\s\S]*?```json\s*/i, '');
  // Remove any remaining ``` fences
  stripped = stripped.replace(/```\s*/g, '');
  stripped = stripped.trim();

  // 2. Find first '{' and its matching '}' via bracket counting
  const start = stripped.indexOf('{');
  if (start === -1) throw new Error('[Parse Error] No JSON found');

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
    if (ch === '}') { depth--; if (depth === 0) return stripped.slice(start, i + 1); }
  }

  // Bracket matching failed — truncated JSON
  throw new Error('[Truncated] レスポンスが長すぎて途中で切れました。入力を短くして再試行してください。 / Response was truncated. Try shorter input.');
}

/**
 * Extract and parse JSON from raw AI text.
 * For large responses (>10 KB), offloads to a Web Worker to avoid blocking the main thread.
 * Falls back to synchronous parsing for small responses.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extractAndParse(rawText: string): Promise<any> {
  if (rawText.length > WORKER_PARSE_THRESHOLD) {
    return parseJsonInWorker(rawText);
  }
  const jsonText = extractJson(rawText);
  return JSON.parse(jsonText);
}

// =============================================================================
// Size policy — configurable limits
// =============================================================================

/** Below this: single API call */
export const CHUNK_THRESHOLD = 40_000;
/** Show "getting long" warning */
export const CHAR_WARN = 30_000;
/** Above CHUNK_THRESHOLD but below this: long mode (chunked processing) */
export const LONG_MODE_LIMIT = 300_000;
/** Above this: blocked in MVP (too many API calls for BYOK rate limits) */
export const INPUT_HARD_LIMIT = LONG_MODE_LIMIT;

export function needsChunking(text: string): boolean {
  return text.length > CHUNK_THRESHOLD;
}

export function isOverLimit(text: string): boolean {
  return text.length > INPUT_HARD_LIMIT;
}

const LANG_INSTRUCTIONS: Record<string, string> = {
  ja: 'The input is Japanese. You MUST output ALL fields in Japanese. Keep file names, code identifiers, API names, and technical terms in English.',
  en: 'The input is English. You MUST output ALL fields in English.',
  es: 'You MUST output ALL fields in Spanish (Español). Keep file names, code identifiers, API names, and technical terms in English.',
  fr: 'You MUST output ALL fields in French (Français). Keep file names, code identifiers, API names, and technical terms in English.',
  de: 'You MUST output ALL fields in German (Deutsch). Keep file names, code identifiers, API names, and technical terms in English.',
  zh: 'You MUST output ALL fields in Simplified Chinese (中文). Keep file names, code identifiers, API names, and technical terms in English.',
  ko: 'You MUST output ALL fields in Korean (한국어). Keep file names, code identifiers, API names, and technical terms in English.',
  pt: 'You MUST output ALL fields in Portuguese (Português). Keep file names, code identifiers, API names, and technical terms in English.',
};

function resolveLang(sourceText: string): string {
  const pref = getLang();
  if (pref !== 'auto') return pref;
  return detectLanguage(sourceText);
}

function getLangInstruction(lang: string): string {
  return LANG_INSTRUCTIONS[lang] || LANG_INSTRUCTIONS.en;
}

// Single-call transform for texts ≤ CHUNK_THRESHOLD
export async function transformText(sourceText: string, opts?: { onStream?: StreamCallback }): Promise<TransformResult> {
  const apiKey = getApiKey();
  if (!apiKey && !shouldUseBuiltinApi()) {
    throw new Error('[API Key] Not set. Go to Settings and enter your API key.');
  }

  const lang = resolveLang(sourceText);
  const langInstruction = getLangInstruction(lang);

  const userMessage = `${langInstruction}\n\nExtract a work log from the following conversation. Only include what is explicitly stated.\n\nCHAT:\n${sourceText}`;

  const req = { apiKey, system: SYSTEM_PROMPT, userMessage, maxTokens: 8192 };
  const rawText = opts?.onStream
    ? await callProviderStream(req, opts.onStream)
    : await callProvider(req);

  try {
    const parsed = await extractAndParse(rawText) as Record<string, unknown>;
    validateWorklogResult(parsed, sourceText);
    return {
      title: (parsed.title as string) || 'Untitled',
      today: (parsed.today as string[]) || [],
      decisions: (parsed.decisions as string[]) || [],
      todo: (parsed.todo as string[]) || [],
      relatedProjects: (parsed.relatedProjects as string[]) || [],
      tags: (parsed.tags as string[]) || [],
    };
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[Transform] Parse error:', error);
    throw new Error('[Parse Error] AI response was not valid JSON. Check console for details.');
  }
}

// --- Handoff mode ---


/**
 * Normalize decisions from AI response: handles both new object format and legacy string format.
 * Returns both legacy `decisions: string[]` and new `decisionRationales` array.
 */
function normalizeDecisions(raw: unknown[]): {
  decisions: string[];
  decisionRationales: DecisionWithRationale[];
} {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { decisions: [], decisionRationales: [] };
  }
  const MAX_DECISIONS = 6;
  // Check if first element is an object (new format)
  if (typeof raw[0] === 'object' && raw[0] !== null && 'decision' in raw[0]) {
    const decisionRationales: DecisionWithRationale[] = raw.map((item: unknown) => {
      const obj = item as Record<string, unknown>;
      return {
        decision: String(obj.decision || ''),
        rationale: typeof obj.rationale === 'string' ? obj.rationale : null,
      };
    }).filter(dr => dr.decision.trim()).slice(0, MAX_DECISIONS);
    const decisions = decisionRationales.map(dr => dr.decision);
    return { decisions, decisionRationales };
  }
  // Legacy string format fallback
  const decisions = raw.map(s => String(s)).filter(s => s.trim()).slice(0, MAX_DECISIONS);
  const decisionRationales = decisions.map(d => ({ decision: d, rationale: null }));
  return { decisions, decisionRationales };
}

/**
 * Normalize nextActions from AI response: handles both new object format and legacy string format.
 * Returns both legacy `nextActions: string[]` and new `nextActionItems` array.
 * Both arrays are always the same length and order, with nextActions[i] === nextActionItems[i].action.
 */
export function normalizeNextActions(raw: unknown[]): {
  nextActions: string[];
  nextActionItems: NextActionItem[];
} {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { nextActions: [], nextActionItems: [] };
  }
  // Check if first element is an object with `action` field (new format)
  if (typeof raw[0] === 'object' && raw[0] !== null && 'action' in raw[0]) {
    const nextActionItems: NextActionItem[] = raw.map((item: unknown) => {
      const obj = item as Record<string, unknown>;
      const depRaw = obj.dependsOn;
      const dependsOn = Array.isArray(depRaw)
        ? depRaw.filter((d): d is string => typeof d === 'string' && d.trim() !== '')
        : null;
      return {
        action: String(obj.action || ''),
        whyImportant: typeof obj.whyImportant === 'string' ? obj.whyImportant : null,
        priorityReason: typeof obj.priorityReason === 'string' ? obj.priorityReason : null,
        dueBy: typeof obj.dueBy === 'string' ? obj.dueBy : null,
        dependsOn: dependsOn && dependsOn.length > 0 ? dependsOn : null,
      };
    }).filter(nai => nai.action.trim());
    const nextActions = nextActionItems.map(nai => nai.action);
    return { nextActions, nextActionItems };
  }
  // Legacy string format fallback
  const nextActions = raw.map(s => String(s)).filter(s => s.trim());
  const nextActionItems = nextActions.map(a => ({ action: a, whyImportant: null, priorityReason: null, dueBy: null, dependsOn: null }));
  return { nextActions, nextActionItems };
}

/**
 * Normalize resumeChecklist from AI response.
 * Handles both new object format and legacy string format.
 */
export function normalizeResumeChecklist(raw: unknown): ResumeChecklistItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  let items: ResumeChecklistItem[];
  if (typeof raw[0] === 'object' && raw[0] !== null && 'action' in raw[0]) {
    items = raw.map((item: unknown) => {
      const obj = item as Record<string, unknown>;
      return {
        action: String(obj.action || ''),
        whyNow: typeof obj.whyNow === 'string' ? obj.whyNow : null,
        ifSkipped: typeof obj.ifSkipped === 'string' ? obj.ifSkipped : null,
      };
    }).filter(r => r.action.trim());
  } else {
    // Legacy string[] fallback
    items = raw
      .map(s => String(s)).filter(s => s.trim())
      .map(s => ({ action: s, whyNow: null, ifSkipped: null }));
  }
  // Hard cap: max 3 items
  return items.slice(0, 3);
}

/** Normalize handoffMeta from AI response. */
export function normalizeHandoffMeta(raw: unknown): HandoffMeta {
  const defaults: HandoffMeta = { sessionFocus: null, whyThisSession: null, timePressure: null };
  if (!raw || typeof raw !== 'object') return defaults;
  const obj = raw as Record<string, unknown>;
  return {
    sessionFocus: typeof obj.sessionFocus === 'string' && obj.sessionFocus.trim() ? obj.sessionFocus : null,
    whyThisSession: typeof obj.whyThisSession === 'string' && obj.whyThisSession.trim() ? obj.whyThisSession : null,
    timePressure: typeof obj.timePressure === 'string' && obj.timePressure.trim() ? obj.timePressure : null,
  };
}

/** Normalize actionBacklog — same shape as nextActionItems but capped at 7. */
export function normalizeActionBacklog(raw: unknown): NextActionItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const { nextActionItems } = normalizeNextActions(raw);
  return nextActionItems.slice(0, 7);
}

/**
 * Build a LogEntry from HandoffResult + context.
 * Centralizes field assembly so Workspace.tsx only triggers save.
 */
export function buildHandoffLogEntry(
  result: HandoffResult,
  opts: {
    projectId?: string;
    sourceReference?: LogEntry['sourceReference'];
  },
): LogEntry {
  const { decisions, decisionRationales } = normalizeDecisionsUtil(result.decisionRationales, result.decisions);
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    importedAt: new Date().toISOString(),
    title: result.title,
    projectId: opts.projectId,
    sourceReference: opts.sourceReference,
    outputMode: 'handoff',
    today: [],
    decisions,
    decisionRationales,
    todo: [],
    relatedProjects: [],
    tags: result.tags || [],
    currentStatus: result.currentStatus || [],
    nextActions: result.nextActions,
    nextActionItems: result.nextActionItems,
    actionBacklog: result.actionBacklog,
    completed: result.completed || [],
    blockers: result.blockers || [],
    constraints: result.constraints || [],
    resumeContext: result.resumeContext,
    resumeChecklist: result.resumeChecklist,
    handoffMeta: result.handoffMeta,
  };
}

export async function transformHandoff(sourceText: string, opts?: { onStream?: StreamCallback }): Promise<HandoffResult> {
  const apiKey = getApiKey();
  if (!apiKey && !shouldUseBuiltinApi()) {
    throw new Error('[API Key] Not set. Go to Settings and enter your API key.');
  }

  const lang = resolveLang(sourceText);
  const langInstruction = getLangInstruction(lang);

  const userMessage = `${langInstruction}\n\nExtract a restart memo from the following conversation. Focus on where to resume, what's done, next actions, and unresolved issues.\n\nCHAT:\n${sourceText}`;

  const req = { apiKey, system: HANDOFF_PROMPT, userMessage, maxTokens: 8192 };
  const rawText = opts?.onStream
    ? await callProviderStream(req, opts.onStream)
    : await callProvider(req);

  try {
    const parsed = await extractAndParse(rawText) as Record<string, unknown>;
    // Validate handoff title (reuse generic-title check)
    validateWorklogResult(parsed, sourceText);
    const completed = (parsed.completed || []) as string[];
    const rawDecisions = (parsed.decisions || []) as unknown[];
    const { decisions, decisionRationales } = normalizeDecisions(rawDecisions);
    const rawNextActions = (parsed.nextActions || []) as unknown[];
    let { nextActions, nextActionItems } = normalizeNextActions(rawNextActions);
    const resumeChecklist = normalizeResumeChecklist(parsed.resumeChecklist);
    let actionBacklog = normalizeActionBacklog(parsed.actionBacklog);
    const handoffMeta = normalizeHandoffMeta(parsed.handoffMeta);
    if (import.meta.env.DEV) {
      console.log('[Handoff Debug] raw resumeChecklist:', JSON.stringify(parsed.resumeChecklist));
      console.log('[Handoff Debug] normalized resumeChecklist:', JSON.stringify(resumeChecklist));
      console.log('[Handoff Debug] raw handoffMeta:', JSON.stringify(parsed.handoffMeta));
      console.log('[Handoff Debug] normalized handoffMeta:', JSON.stringify(handoffMeta));
      console.log('[Handoff Debug] nextActionItems count:', nextActionItems.length, 'actionBacklog count:', actionBacklog.length);
    }
    // Enforce max 4 nextActions — overflow goes to actionBacklog
    if (nextActionItems.length > 4) {
      const overflow = nextActionItems.slice(4);
      nextActionItems = nextActionItems.slice(0, 4);
      nextActions = nextActionItems.map(i => i.action);
      actionBacklog = [...overflow, ...actionBacklog].slice(0, 7);
    }
    return {
      title: (parsed.title as string) || 'Untitled',
      handoffMeta,
      currentStatus: (parsed.currentStatus || []) as string[],
      resumeChecklist,
      resumeContext: resumeChecklist.length > 0
        ? resumeChecklist.map(r => r.action)
        : (typeof parsed.resumeContext === 'string'
          ? (parsed.resumeContext.trim() ? [parsed.resumeContext.trim()] : [])
          : ((parsed.resumeContext || []) as string[])),
      nextActions,
      nextActionItems,
      actionBacklog: actionBacklog.length > 0 ? actionBacklog : undefined,
      completed,
      blockers: filterResolvedBlockers((parsed.blockers || []) as string[], completed, decisions),
      decisions,
      decisionRationales,
      constraints: (parsed.constraints || []) as string[],
      tags: (parsed.tags || []) as string[],
    };
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[Transform] Parse error:', error);
    throw new Error('[Parse Error] AI response was not valid JSON. Check console for details.');
  }
}

// --- Combined "both" mode — single API call for worklog + handoff ---


// --- TODO-only mode ---

export interface TodoOnlyItem {
  title: string;
  priority: 'high' | 'medium' | 'low';
  dueDate?: string;
}

export interface TodoOnlyResult {
  todos: TodoOnlyItem[];
}


export async function transformTodoOnly(sourceText: string, opts?: { onStream?: StreamCallback }): Promise<TodoOnlyResult> {
  const apiKey = getApiKey();
  if (!apiKey && !shouldUseBuiltinApi()) {
    throw new Error('[API Key] Not set. Go to Settings and enter your API key.');
  }

  const lang = resolveLang(sourceText);
  const langInstruction = getLangInstruction(lang);

  const userMessage = `${langInstruction}\n\nExtract a TODO list from the following conversation. Only include actions the user explicitly committed to.\n\nCHAT:\n${sourceText}`;

  const req = { apiKey, system: TODO_ONLY_PROMPT, userMessage, maxTokens: 8192 };
  const rawText = opts?.onStream
    ? await callProviderStream(req, opts.onStream)
    : await callProvider(req);

  try {
    const parsed = await extractAndParse(rawText) as Record<string, unknown>;
    const todos: TodoOnlyItem[] = ((parsed.todos as Record<string, unknown>[]) || []).map((t: Record<string, unknown>) => ({
      title: String(t.title || ''),
      priority: (['high', 'medium', 'low'].includes(t.priority as string) ? t.priority : 'medium') as 'high' | 'medium' | 'low',
      dueDate: typeof t.dueDate === 'string' && t.dueDate ? t.dueDate : undefined,
    })).filter((t: TodoOnlyItem) => t.title.trim());
    return { todos };
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[Transform] Parse error:', error);
    throw new Error('[Parse Error] AI response was not valid JSON. Check console for details.');
  }
}

// --- Handoff + TODO mode — two sequential API calls (no worklog) ---

export interface HandoffTodoResult {
  handoff: HandoffResult;
  todos: TodoOnlyItem[];
}

export async function transformHandoffTodo(sourceText: string, opts?: { onStream?: StreamCallback }): Promise<HandoffTodoResult> {
  // Step 1: Generate handoff (with streaming for the main call)
  const handoff = await transformHandoff(sourceText, opts);
  // Step 2: Extract TODOs (no streaming — secondary call)
  const todoResult = await transformTodoOnly(sourceText);
  return { handoff, todos: todoResult.todos };
}

export interface TransformBothOptions {
  onStream?: StreamCallback;
  /** Projects for inline classification. If provided, classification is included in the response. */
  projects?: { id: string; name: string }[];
}

export async function transformBoth(sourceText: string, opts?: TransformBothOptions): Promise<BothResult> {
  const { onStream, projects } = opts || {};
  const apiKey = getApiKey();
  if (!apiKey && !shouldUseBuiltinApi()) {
    throw new Error('[API Key] Not set. Go to Settings and enter your API key.');
  }

  const lang = resolveLang(sourceText);
  const langInstruction = getLangInstruction(lang);

  const projectsBlock = projects && projects.length > 0
    ? `\n\nPROJECTS (for classification):\n${projects.map(p => `- "${p.name}" (id: ${p.id})`).join('\n')}`
    : '';

  const userMessage = `${langInstruction}\n\nExtract both a work log AND a restart memo from the following conversation in a single JSON response.${projectsBlock}\n\nCHAT:\n${sourceText}`;

  const rawText = onStream
    ? await callProviderStream({ apiKey, system: BOTH_PROMPT, userMessage, maxTokens: 8192 }, onStream)
    : await callProvider({ apiKey, system: BOTH_PROMPT, userMessage, maxTokens: 8192 });

  try {
    const parsed = await extractAndParse(rawText) as Record<string, unknown>;

    const w = (parsed.worklog || parsed) as Record<string, unknown>;
    const h = (parsed.handoff || parsed) as Record<string, unknown>;

    // Validate worklog part
    validateWorklogResult(w, sourceText);

    const c = parsed.classification;
    const result: BothResult = {
      worklog: {
        title: (w.title as string) || 'Untitled',
        today: (w.today || []) as string[],
        decisions: (w.decisions || []) as string[],
        todo: (w.todo || []) as string[],
        relatedProjects: (w.relatedProjects || []) as string[],
        tags: (w.tags || []) as string[],
      },
      handoff: (() => {
        // Validate handoff title
        validateWorklogResult(h, sourceText);
        const hCompleted = (h.completed || []) as string[];
        const rawHDecisions = (h.decisions || []) as unknown[];
        const { decisions: hDecisions, decisionRationales: hDecisionRationales } = normalizeDecisions(rawHDecisions);
        const rawHNextActions = (h.nextActions || []) as unknown[];
        let { nextActions: hNextActions, nextActionItems: hNextActionItems } = normalizeNextActions(rawHNextActions);
        const hResumeChecklist = normalizeResumeChecklist(h.resumeChecklist);
        let hActionBacklog = normalizeActionBacklog(h.actionBacklog);
        const hHandoffMeta = normalizeHandoffMeta(h.handoffMeta);
        if (import.meta.env.DEV) {
          console.log('[Both Handoff Debug] raw resumeChecklist:', JSON.stringify(h.resumeChecklist));
          console.log('[Both Handoff Debug] normalized resumeChecklist:', JSON.stringify(hResumeChecklist));
          console.log('[Both Handoff Debug] raw handoffMeta:', JSON.stringify(h.handoffMeta));
          console.log('[Both Handoff Debug] normalized handoffMeta:', JSON.stringify(hHandoffMeta));
          console.log('[Both Handoff Debug] nextActionItems count:', hNextActionItems.length, 'actionBacklog count:', hActionBacklog.length);
        }
        // Enforce max 4 nextActions — overflow goes to actionBacklog
        if (hNextActionItems.length > 4) {
          const overflow = hNextActionItems.slice(4);
          hNextActionItems = hNextActionItems.slice(0, 4);
          hNextActions = hNextActionItems.map(i => i.action);
          hActionBacklog = [...overflow, ...hActionBacklog].slice(0, 7);
        }
        return {
          title: (h.title as string) || (w.title as string) || 'Untitled',
          handoffMeta: hHandoffMeta,
          currentStatus: (h.currentStatus || []) as string[],
          resumeChecklist: hResumeChecklist,
          resumeContext: hResumeChecklist.length > 0
            ? hResumeChecklist.map(r => r.action)
            : (typeof h.resumeContext === 'string'
              ? (h.resumeContext.trim() ? [h.resumeContext.trim()] : [])
              : ((h.resumeContext || []) as string[])),
          nextActions: hNextActions,
          nextActionItems: hNextActionItems,
          actionBacklog: hActionBacklog.length > 0 ? hActionBacklog : undefined,
          completed: hCompleted,
          blockers: filterResolvedBlockers((h.blockers || []) as string[], hCompleted, hDecisions),
          decisions: hDecisions,
          decisionRationales: hDecisionRationales,
          constraints: (h.constraints || []) as string[],
          tags: ((h.tags || w.tags || []) as string[]),
        };
      })(),
      classification: c ? {
        projectId: (c as Record<string, unknown>).projectId as string || null,
        confidence: typeof (c as Record<string, unknown>).confidence === 'number' ? Math.max(0, Math.min(1, (c as Record<string, unknown>).confidence as number)) : 0,
      } : undefined,
    };
    return result;
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[Transform] Parse error:', error);
    throw new Error('[Parse Error] AI response was not valid JSON. Check console for details.');
  }
}
