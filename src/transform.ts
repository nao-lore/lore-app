import type { TransformResult, HandoffResult, BothResult, DecisionWithRationale, NextActionItem, ResumeChecklistItem, HandoffMeta, LogEntry } from './types';
import { getApiKey, getLang } from './storage';
import { shouldUseBuiltinApi, callProvider, callProviderStream, getActiveProvider } from './provider';
import type { StreamCallback } from './provider';
import { normalizeDecisions as normalizeDecisionsUtil } from './utils/decisions';
import { SYSTEM_PROMPT, HANDOFF_PROMPT, HANDOFF_PROMPT_COMPACT, BOTH_PROMPT, TODO_ONLY_PROMPT } from './prompts';
import { parseJsonInWorker } from './workers/parseHelper';
import { safeParse, WorklogResultSchema, HandoffResultSchema, TodoOnlyResultSchema } from './schemas';
import { AIError } from './errors';
import { parseJsonWithRepair } from './utils/jsonRepair';
import { fuzzyDedupStrings } from './utils/fuzzyDedup';
import { normalizeInput } from './utils/normalizeInput';
import { callWithRetry } from './utils/retryManager';

/** Safely coerce an unknown value to string[], filtering out non-strings. */
function toStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is string => typeof v === 'string');
}

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
  // Match CJK characters including Extension B (U+20000-U+2A6DF) via Unicode property escapes
  const jaPattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF]|\p{Script=Han}/gu;
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

/**
 * Validate and fix handoff-style parsed result.
 * Mutates the object in-place for efficiency.
 */
function validateHandoffResult(
  parsed: {
    title?: string;
    currentStatus?: string[];
    resumeChecklist?: { action?: string; whyNow?: string | null; ifSkipped?: string | null }[];
    nextActions?: unknown[];
    completed?: string[];
    tags?: string[];
  },
  sourceText: string,
): void {
  const charLen = sourceText.length;

  // Fix generic / empty titles (reuse GENERIC_TITLE_PATTERNS)
  const title = parsed.title?.trim() || '';
  if (!title || GENERIC_TITLE_PATTERNS.some((p) => p.test(title))) {
    const fallback = extractFallbackTitle(sourceText);
    if (fallback) {
      parsed.title = fallback;
    }
  }

  // Validate currentStatus for non-trivial conversations
  if (parsed.currentStatus && parsed.currentStatus.length === 0 && charLen > 2000) {
    logValidationWarning(`currentStatus is empty for ${charLen}-char input — expected at least 1 item`);
  }

  // Warn if currentStatus contains past-tense language (should be present-tense only)
  if (parsed.currentStatus) {
    // English past tense patterns: simple past, present perfect, passive voice
    const englishPastTense = /\b(completed|implemented|added|fixed|updated|changed|created|resolved|was completed|has been|have been|were?\s+\w+ed)\b/i;
    // Japanese past tense patterns: た form, ました, された (passive past)
    const japanesePastTense = /済み|した$|しました|された|完了した|修正した|追加した|実装した|変更した/;
    for (const item of parsed.currentStatus) {
      if (englishPastTense.test(item)) {
        logValidationWarning(`currentStatus contains past-tense language: "${item.slice(0, 60)}" — should be present-tense or moved to completed`);
      }
      if (japanesePastTense.test(item)) {
        logValidationWarning(`currentStatus contains past-tense Japanese: "${item.slice(0, 60)}" — should be present-tense or moved to completed`);
      }
    }
  }

  // Validate resumeChecklist items have required whyNow/ifSkipped
  if (Array.isArray(parsed.resumeChecklist)) {
    for (const item of parsed.resumeChecklist) {
      if (!item.whyNow || !item.whyNow.trim()) {
        logValidationWarning(`resumeChecklist item "${item.action}" has empty whyNow`);
      }
      if (!item.ifSkipped || !item.ifSkipped.trim()) {
        logValidationWarning(`resumeChecklist item "${item.action}" has empty ifSkipped`);
      }
    }
  }

  // Validate nextActions for non-trivial conversations
  if (parsed.nextActions && Array.isArray(parsed.nextActions) && parsed.nextActions.length === 0 && charLen > 2000) {
    logValidationWarning(`nextActions is empty for ${charLen}-char input — expected at least 1 item`);
  }

  // Validate completed for non-trivial conversations
  if (parsed.completed && parsed.completed.length === 0 && charLen > 2000) {
    logValidationWarning(`completed is empty for ${charLen}-char input — expected at least 1 item`);
  }

  // Validate tag count
  if (parsed.tags && parsed.tags.length < 3 && charLen > 500) {
    logValidationWarning(`tags.length=${parsed.tags.length} for ${charLen}-char input — expected >= 3`);
  }
}

/** Log validation warning — always logs in DEV, reports to Sentry in production if available */
function logValidationWarning(msg: string): void {
  const fullMsg = `[Transform Validation] ${msg}`;
  if (import.meta.env.DEV) {
    console.warn(fullMsg);
  }
  // Report to Sentry in production if available
  if (typeof window !== 'undefined' && (window as Record<string, unknown>).Sentry) {
    const Sentry = (window as Record<string, unknown>).Sentry as { captureMessage?: (msg: string, level?: string) => void };
    Sentry.captureMessage?.(fullMsg, 'warning');
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
  if (start === -1) throw new AIError('PARSE_ERROR', '[Parse Error] No JSON found');

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
  throw new AIError('TRUNCATED', '[Truncated] レスポンスが長すぎて途中で切れました。入力を短くして再試行してください。 / Response was truncated. Try shorter input.', true);
}

/**
 * Extract and parse JSON from raw AI text.
 * For large responses (>10 KB), offloads to a Web Worker to avoid blocking the main thread.
 * Falls back to synchronous parsing for small responses.
 */
async function extractAndParse(rawText: string): Promise<Record<string, unknown>> {
  if (rawText.length > WORKER_PARSE_THRESHOLD) {
    return parseJsonInWorker(rawText) as Promise<Record<string, unknown>>;
  }
  const jsonText = extractJson(rawText);
  try {
    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    // Attempt JSON repair before giving up
    return parseJsonWithRepair(jsonText) as Record<string, unknown>;
  }
}

/**
 * Retry wrapper for transform calls.
 * Retries up to 3 times for PARSE_ERROR and rate limit errors (429/503).
 * Uses retryManager for rate limit handling, adds PARSE_ERROR retry on top.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callWithRetry(fn, 0); // delegate rate limit retries to retryManager
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      const isParseError = err instanceof AIError && err.code === 'PARSE_ERROR';
      const isRateLimit = err instanceof Error && (
        err.message.includes('429') || err.message.includes('503') ||
        err.message.includes('[Overloaded]') || err.message.includes('[Rate Limit]')
      );
      if (!isParseError && !isRateLimit) throw err;
      if (import.meta.env.DEV) console.warn(`[${label}] ${isParseError ? 'Parse' : 'Rate limit'} error, retry ${attempt + 1}/${MAX_RETRIES}...`);
      const delayMatch = err instanceof Error ? err.message.match(/\[Rate Limit:(\d+)\]/) : null;
      const delay = delayMatch ? parseInt(delayMatch[1], 10) * 1000 : 1000 * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
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
  return withRetry(() => transformTextOnce(sourceText, opts), 'transformText');
}

async function transformTextOnce(sourceText: string, opts?: { onStream?: StreamCallback }): Promise<TransformResult> {
  sourceText = normalizeInput(sourceText);
  const apiKey = getApiKey();
  if (!apiKey && !shouldUseBuiltinApi()) {
    throw new AIError('API_KEY_MISSING', '[API Key] Not set. Go to Settings and enter your API key.');
  }

  const lang = resolveLang(sourceText);
  const langInstruction = getLangInstruction(lang);

  const userMessage = `${langInstruction}\n\nExtract a work log from the following conversation. Only include what is explicitly stated.\n\nCHAT:\n${sourceText}`;

  const req = { apiKey, system: SYSTEM_PROMPT, userMessage, maxTokens: 8192 };
  const rawText = opts?.onStream
    ? await callProviderStream(req, opts.onStream)
    : await callProvider(req);

  try {
    const raw = await extractAndParse(rawText) as Record<string, unknown>;
    const parsed = safeParse(WorklogResultSchema, raw, 'worklog');
    validateWorklogResult(parsed, sourceText);
    warnOutputLanguageMismatch(parsed, lang);
    return {
      title: parsed.title || 'Untitled',
      today: fuzzyDedupStrings(parsed.today || []),
      decisions: parsed.decisions || [],
      todo: parsed.todo || [],
      relatedProjects: parsed.relatedProjects || [],
      tags: parsed.tags || [],
    };
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[Transform] Parse error:', error);
    throw new AIError('PARSE_ERROR', '[Parse Error] AI response was not valid JSON. Check console for details.');
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
  totalDecisionsBeforeCap: number;
} {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { decisions: [], decisionRationales: [], totalDecisionsBeforeCap: 0 };
  }
  const MAX_DECISIONS = 6;
  // Check if first element is an object (new format)
  if (typeof raw[0] === 'object' && raw[0] !== null && 'decision' in raw[0]) {
    const allRationales: DecisionWithRationale[] = raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((obj) => ({
        decision: String(obj.decision || ''),
        rationale: typeof obj.rationale === 'string' ? obj.rationale : null,
      }))
      .filter(dr => dr.decision.trim());
    const totalDecisionsBeforeCap = allRationales.length;
    const decisionRationales = allRationales.slice(0, MAX_DECISIONS);
    const decisions = decisionRationales.map(dr => dr.decision);
    return { decisions, decisionRationales, totalDecisionsBeforeCap };
  }
  // Legacy string format fallback
  const allDecisions = raw.map(s => String(s)).filter(s => s.trim());
  const totalDecisionsBeforeCap = allDecisions.length;
  const decisions = allDecisions.slice(0, MAX_DECISIONS);
  const decisionRationales = decisions.map(d => ({ decision: d, rationale: null }));
  return { decisions, decisionRationales, totalDecisionsBeforeCap };
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
    const nextActionItems: NextActionItem[] = raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((obj) => {
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
    items = raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((obj) => ({
        action: String(obj.action || ''),
        whyNow: typeof obj.whyNow === 'string' ? obj.whyNow : null,
        ifSkipped: typeof obj.ifSkipped === 'string' ? obj.ifSkipped : null,
      }))
      .filter(r => r.action.trim());
  } else {
    // Legacy string[] fallback
    items = raw
      .map(s => String(s)).filter(s => s.trim())
      .map(s => ({ action: s, whyNow: null, ifSkipped: null }));
  }
  // Hard cap: max 3 items
  return items.slice(0, 3);
}

/**
 * Warn in DEV if the output language doesn't match the expected language.
 */
function warnOutputLanguageMismatch(result: { title?: string | unknown }, expectedLang: string): void {
  if (!import.meta.env.DEV) return;
  const title = typeof result.title === 'string' ? result.title : '';
  if (!title) return;
  const actualLang = detectLanguage(title);
  if (actualLang !== expectedLang && title.length > 10) {
    console.warn(`[Transform] Output language mismatch: expected=${expectedLang}, detected=${actualLang}, title="${title.slice(0, 40)}"`);
  }
}

/** Normalize handoffMeta from AI response. */
export function normalizeHandoffMeta(raw: unknown): HandoffMeta {
  const defaults: HandoffMeta = { sessionFocus: null, whyThisSession: null, timePressure: null };
  if (!raw || typeof raw !== 'object') return defaults;
  const obj = raw as { sessionFocus?: unknown; whyThisSession?: unknown; timePressure?: unknown };
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
 * Normalize all handoff-specific fields from a parsed AI response.
 * Centralizes the repeated pattern of normalizing decisions, nextActions,
 * resumeChecklist, actionBacklog, handoffMeta, and array fields with
 * type coercion, dedup, and overflow enforcement.
 */
export function normalizeHandoffFields(parsed: Record<string, unknown>): {
  decisions: string[];
  decisionRationales: DecisionWithRationale[];
  totalDecisionsBeforeCap: number;
  nextActions: string[];
  nextActionItems: NextActionItem[];
  resumeChecklist: ResumeChecklistItem[];
  actionBacklog: NextActionItem[];
  handoffMeta: HandoffMeta;
  currentStatus: string[];
  completed: string[];
  blockers: string[];
  constraints: string[];
  tags: string[];
} {
  const rawDecisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
  const { decisions, decisionRationales, totalDecisionsBeforeCap } = normalizeDecisions(rawDecisions);
  const rawNextActions = Array.isArray(parsed.nextActions) ? parsed.nextActions : [];
  const { nextActionItems: allNextActionItems } = normalizeNextActions(rawNextActions);
  const resumeChecklist = normalizeResumeChecklist(parsed.resumeChecklist);
  const rawActionBacklog = normalizeActionBacklog(parsed.actionBacklog);
  const handoffMeta = normalizeHandoffMeta(parsed.handoffMeta);

  // Enforce max 4 nextActions — items beyond the cap overflow into actionBacklog.
  // This ensures the "immediate actions" list stays focused while preserving
  // lower-priority items in the backlog (capped at 7 total).
  const finalNextActionItems = allNextActionItems.slice(0, 4);
  const overflowToBacklog = allNextActionItems.slice(4);
  const finalActionBacklog = [...overflowToBacklog, ...rawActionBacklog].slice(0, 7);
  const nextActionItems = finalNextActionItems;
  const nextActions = nextActionItems.map(i => i.action);

  // Deduplicate actionBacklog against nextActions (remove items already in nextActions)
  const nextActionSet = new Set(nextActions.map(a => a.toLowerCase().trim()));
  const actionBacklog = finalActionBacklog.filter(item => !nextActionSet.has(item.action.toLowerCase().trim()));
  // Normalize remaining array fields with type coercion and dedup
  const completed = fuzzyDedupStrings(toStringArray(parsed.completed));
  const currentStatus = fuzzyDedupStrings(toStringArray(parsed.currentStatus));
  const blockers = fuzzyDedupStrings(
    filterResolvedBlockers(toStringArray(parsed.blockers), completed, decisions),
  );
  const constraints = toStringArray(parsed.constraints);
  const tags = toStringArray(parsed.tags);

  // #67: Tag language validation — detect if tags are in a different language than the content
  if (tags.length > 0 && (currentStatus.length > 0 || completed.length > 0 || decisions.length > 0)) {
    const contentSample = [...currentStatus, ...completed, ...decisions].join(' ').slice(0, 2000);
    const contentLang = detectLanguage(contentSample);
    const tagsSample = tags.join(' ');
    const tagsLang = detectLanguage(tagsSample);
    if (contentLang !== tagsLang && tagsSample.length > 10) {
      logValidationWarning(`Tag language mismatch: content=${contentLang}, tags=${tagsLang}. Tags: [${tags.slice(0, 5).join(', ')}]`);
    }
  }

  return { decisions, decisionRationales, totalDecisionsBeforeCap, nextActions, nextActionItems, resumeChecklist, actionBacklog, handoffMeta, currentStatus, completed, blockers, constraints, tags };
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
  return withRetry(() => transformHandoffOnce(sourceText, opts), 'transformHandoff');
}

async function transformHandoffOnce(sourceText: string, opts?: { onStream?: StreamCallback }): Promise<HandoffResult> {
  sourceText = normalizeInput(sourceText);
  const apiKey = getApiKey();
  if (!apiKey && !shouldUseBuiltinApi()) {
    throw new AIError('API_KEY_MISSING', '[API Key] Not set. Go to Settings and enter your API key.');
  }

  const lang = resolveLang(sourceText);
  const langInstruction = getLangInstruction(lang);

  const userMessage = `${langInstruction}\n\nExtract a restart memo from the following conversation. Focus on where to resume, what's done, next actions, and unresolved issues.\n\nCHAT:\n${sourceText}`;

  // Use compact prompt for Gemini (large context window, handles instructions well with less guidance)
  const handoffSystemPrompt = getActiveProvider() === 'gemini' ? HANDOFF_PROMPT_COMPACT : HANDOFF_PROMPT;
  const req = { apiKey, system: handoffSystemPrompt, userMessage, maxTokens: 8192 };
  const rawText = opts?.onStream
    ? await callProviderStream(req, opts.onStream)
    : await callProvider(req);

  try {
    const raw = await extractAndParse(rawText) as Record<string, unknown>;
    const parsed = safeParse(HandoffResultSchema, raw, 'handoff');
    // Validate handoff fields (title, currentStatus, resumeChecklist, nextActions, completed, tags)
    validateHandoffResult(parsed, sourceText);
    warnOutputLanguageMismatch(parsed, lang);
    const { decisions, decisionRationales, totalDecisionsBeforeCap, nextActions, nextActionItems, resumeChecklist, actionBacklog, handoffMeta, currentStatus, completed, blockers, constraints, tags } = normalizeHandoffFields(parsed as Record<string, unknown>);
    return {
      title: parsed.title || 'Untitled',
      handoffMeta,
      currentStatus,
      resumeChecklist,
      resumeContext: resumeChecklist.length > 0
        ? resumeChecklist.map(r => r.action)
        : [],
      nextActions,
      nextActionItems,
      actionBacklog: actionBacklog.length > 0 ? actionBacklog : undefined,
      completed,
      blockers,
      decisions,
      decisionRationales,
      totalDecisionsBeforeCap: totalDecisionsBeforeCap > decisions.length ? totalDecisionsBeforeCap : undefined,
      constraints,
      tags,
    };
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[Transform] Parse error:', error);
    throw new AIError('PARSE_ERROR', '[Parse Error] AI response was not valid JSON. Check console for details.');
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
  return withRetry(() => transformTodoOnlyOnce(sourceText, opts), 'transformTodoOnly');
}

async function transformTodoOnlyOnce(sourceText: string, opts?: { onStream?: StreamCallback }): Promise<TodoOnlyResult> {
  sourceText = normalizeInput(sourceText);
  const apiKey = getApiKey();
  if (!apiKey && !shouldUseBuiltinApi()) {
    throw new AIError('API_KEY_MISSING', '[API Key] Not set. Go to Settings and enter your API key.');
  }

  const lang = resolveLang(sourceText);
  const langInstruction = getLangInstruction(lang);

  const userMessage = `${langInstruction}\n\nExtract a TODO list from the following conversation. Only include actions the user explicitly committed to.\n\nCHAT:\n${sourceText}`;

  const req = { apiKey, system: TODO_ONLY_PROMPT, userMessage, maxTokens: 8192 };
  const rawText = opts?.onStream
    ? await callProviderStream(req, opts.onStream)
    : await callProvider(req);

  try {
    const raw = await extractAndParse(rawText) as Record<string, unknown>;
    const parsed = safeParse(TodoOnlyResultSchema, raw, 'todo_only');
    const todos: TodoOnlyItem[] = (parsed.todos || []).map((t) => ({
      title: t.title || '',
      priority: t.priority || 'medium',
      dueDate: typeof t.dueDate === 'string' && t.dueDate ? t.dueDate : undefined,
    })).filter((t) => t.title.trim());
    return { todos };
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[Transform] Parse error:', error);
    throw new AIError('PARSE_ERROR', '[Parse Error] AI response was not valid JSON. Check console for details.');
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
  sourceText = normalizeInput(sourceText);
  const { onStream, projects } = opts || {};
  const apiKey = getApiKey();
  if (!apiKey && !shouldUseBuiltinApi()) {
    throw new AIError('API_KEY_MISSING', '[API Key] Not set. Go to Settings and enter your API key.');
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
    warnOutputLanguageMismatch(w, lang);

    const c = parsed.classification;
    const result: BothResult = {
      worklog: {
        title: typeof w.title === 'string' ? w.title || 'Untitled' : 'Untitled',
        today: fuzzyDedupStrings(toStringArray(w.today)),
        decisions: toStringArray(w.decisions),
        todo: toStringArray(w.todo),
        relatedProjects: toStringArray(w.relatedProjects),
        tags: toStringArray(w.tags),
      },
      handoff: (() => {
        // Validate handoff fields (title, currentStatus, resumeChecklist, nextActions, completed, tags)
        validateHandoffResult(h, sourceText);
        warnOutputLanguageMismatch(h, lang);
        const hFields = normalizeHandoffFields(h);
        const hTitle = typeof h.title === 'string' ? h.title : '';
        const wTitle = typeof w.title === 'string' ? w.title : '';
        // For tags, fall back to worklog tags if handoff has none
        const hTags = hFields.tags.length > 0 ? hFields.tags : toStringArray(w.tags);
        return {
          title: hTitle || wTitle || 'Untitled',
          handoffMeta: hFields.handoffMeta,
          currentStatus: hFields.currentStatus,
          resumeChecklist: hFields.resumeChecklist,
          resumeContext: hFields.resumeChecklist.length > 0
            ? hFields.resumeChecklist.map(r => r.action)
            : toStringArray(h.resumeContext),
          nextActions: hFields.nextActions,
          nextActionItems: hFields.nextActionItems,
          actionBacklog: hFields.actionBacklog.length > 0 ? hFields.actionBacklog : undefined,
          completed: hFields.completed,
          blockers: hFields.blockers,
          decisions: hFields.decisions,
          decisionRationales: hFields.decisionRationales,
          totalDecisionsBeforeCap: hFields.totalDecisionsBeforeCap > hFields.decisions.length ? hFields.totalDecisionsBeforeCap : undefined,
          constraints: hFields.constraints,
          tags: hTags,
        };
      })(),
      classification: c && typeof c === 'object' ? (() => {
        const cl = c as { projectId?: unknown; confidence?: unknown };
        return {
          projectId: typeof cl.projectId === 'string' ? cl.projectId : null,
          confidence: typeof cl.confidence === 'number' ? Math.max(0, Math.min(1, cl.confidence)) : 0,
        };
      })() : undefined,
    };
    return result;
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[Transform] Parse error:', error);
    throw new AIError('PARSE_ERROR', '[Parse Error] AI response was not valid JSON. Check console for details.');
  }
}
