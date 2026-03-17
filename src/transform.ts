import type { TransformResult, HandoffResult, BothResult, DecisionWithRationale, NextActionItem, ResumeChecklistItem, HandoffMeta, LogEntry } from './types';
import { getApiKey, getLang } from './storage';
import { shouldUseBuiltinApi } from './provider';
import { callProvider, callProviderStream } from './provider';
import type { StreamCallback } from './provider';
import { normalizeDecisions as normalizeDecisionsUtil } from './utils/decisions';

const SYSTEM_PROMPT = `You extract a factual work log from an AI chat history.
You are strict and conservative. You only extract what the USER explicitly stated.

CORE PRINCIPLE:
Assistant suggestions are NOT decisions or TODOs unless the user explicitly accepts them.
If the assistant proposes something and the user does not clearly confirm it, EXCLUDE it.

Output format: ONLY valid JSON. No markdown. No code fences. No explanation.

Schema:
{
  "title": "string",
  "today": ["string"],
  "decisions": ["string"],
  "todo": ["string"],
  "relatedProjects": ["string"],
  "tags": ["string"]
}

DECISIONS rules:
- ONLY include what the user explicitly committed to with a clear finality marker.
- Finality markers (EN): "decided", "will go with", "fixed on", "confirmed", "settled on", "let's do"
- Finality markers (JA): "に決めた", "でいく", "を固定する", "にする", "で確定", "これでいこう"
- These are NOT decisions (move to Today instead):
  - "considered X" / "Xを検討した" -> Today
  - "discussed X" / "Xについて話した" -> Today
  - "compared A and B" / "AとBを比較した" -> Today
  - "reviewed X" / "Xを確認した" -> Today
  - "X looks good" / "良さそう" / "いいと思う" -> Today (not firm enough)
  - "maybe X" / "Xかも" / "候補としてX" -> Today
- Ambiguous agreement to assistant suggestions is NOT a decision.
  - User saying "OK" or "sure" to an assistant idea without restating commitment is NOT enough.
  - "OK sure, X sounds fine" → NOT a decision. User must RESTATE commitment.
  - User must show clear ownership: "よし、それでいく" or "Let's go with that" counts.
- If zero items meet this bar, return []. Do NOT fill with weaker items.

TODO rules:
- ONLY include actions the user explicitly committed to doing NEXT.
- Look for user statements like: "will do", "next step", "need to", "tomorrow I'll", "明日やる", "次にやる", "を作る", "を試す", "実装する", "修正する", "依頼する"
- EXCLUDE completed items: if the conversation later says "完了した", "解決した", "対応済み", "done", "fixed", "resolved" about an action, it is NOT a TODO.
- EXCLUDE concluded investigations: if "調べる" or "考える" appears but a conclusion was reached in the conversation, it is NOT a TODO.
- EXCLUDE vague/aspirational items: "〜が必要かも", "〜したい", "〜かもしれない", "might need", "would be nice" are NOT TODOs.
- Each TODO must be ONE specific, executable action. BAD: "UIの改善" (abstract). GOOD: "TodoViewにソート機能を追加する" (concrete).
- If the assistant recommended an action and the user did NOT confirm it, EXCLUDE it.
- If zero items meet this bar, return []. Do NOT fill with weaker items.

RELATED PROJECTS rules:
- ONLY include actual project names, product names, or client engagement names.
- These are things the user is building or working on.
- EXCLUDE tool names (ChatGPT, Claude, Gemini, Notion, Slack, VS Code, etc.)
- EXCLUDE competitor names unless the user is actively working on that competitor's project.
- EXCLUDE platform/community names (Reddit, Product Hunt, Twitter, Hacker News, etc.)
- EXCLUDE generic technology names (React, Python, API, etc.)
- If no real project names are found, return [].

TODAY rules:
- What was actually done or discussed in this conversation.
- Keep items short and work-log style (1 line each).
- Include discussions, comparisons, reviews, and explorations here.
- Items that almost-but-didn't-quite become Decisions belong in Today.
- Deferred items: "Discussed X but deferred to later"
- today MUST NOT be empty for conversations with 5+ messages.
- Items discussed but not decided belong in today.
- Do not editorialize or add interpretation.

TITLE rules:
- 20-40 characters. Concise and descriptive.
- Summarize the MAIN work topic, not the conversation itself.
- title MUST be specific. NEVER generic like "Restart Memo" or "Session Summary". Extract the main topic.
- Japanese input → Japanese title. English input → English title.
- Use specific nouns and actions: "Lore拡張UI改善", "レート制限リトライ実装", "検索モジュール統合"
- BAD: "会話ログ", "AIとの議論", "作業メモ" → TOO VAGUE
- BAD: "extension-capture.json" → FILE NAMES ARE NOT TITLES

TAGS rules:
- Generate two types:
  A. CATEGORY tags (2-3): broad work categories. Examples: 開発, UI, 設計, バグ修正, テスト, リファクタ, 調査, 戦略, 営業, 自動化, インフラ, ドキュメント
  B. TOPIC tags (2-4): specific tools, features, or concepts discussed. Examples: React, IndexedDB, rate-limit, i18n, CSS変数
- Total 4-7 tags.
- tags MUST contain at least 3 items for any non-trivial conversation.
- IMPORTANT: Tags MUST match the input language. Japanese input → Japanese tags. English input → English tags. Category tag examples: EN: development, UI, design, bugfix, testing, refactor, research, strategy. JA: 開発, UI, 設計, バグ修正, テスト, リファクタ, 調査, 戦略. Keep widely-recognized technical proper nouns as-is (React, TypeScript, Supabase, etc.).
- AVOID vague tags like "productivity", "improvement", "work", "AI", "development", "code", "programming".
- Each tag should help filter and distinguish this log from others.

OUTPUT LANGUAGE RULE:
You MUST output in the same language as the input.
- Japanese input -> ALL fields in Japanese.
- English input -> ALL fields in English.`;

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
export async function transformText(sourceText: string): Promise<TransformResult> {
  const apiKey = getApiKey();
  if (!apiKey && !shouldUseBuiltinApi()) {
    throw new Error('[API Key] Not set. Go to Settings and enter your API key.');
  }

  const lang = resolveLang(sourceText);
  const langInstruction = getLangInstruction(lang);

  const userMessage = `${langInstruction}\n\nExtract a work log from the following conversation. Only include what is explicitly stated.\n\nCHAT:\n${sourceText}`;

  const rawText = await callProvider({
    apiKey,
    system: SYSTEM_PROMPT,
    userMessage,
    maxTokens: 8192,
  });

  try {
    const jsonText = extractJson(rawText);
    const parsed = JSON.parse(jsonText);
    return {
      title: parsed.title || 'Untitled',
      today: parsed.today || [],
      decisions: parsed.decisions || [],
      todo: parsed.todo || [],
      relatedProjects: parsed.relatedProjects || [],
      tags: parsed.tags || [],
    };
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[Transform] Parse error:', error);
    throw new Error('[Parse Error] AI response was not valid JSON. Check console for details.');
  }
}

// --- Handoff mode ---

const HANDOFF_PROMPT = `You extract a structured RESTART MEMO from an AI chat history.
This is NOT a report or summary. It is a control document — like a cockpit checklist for resuming work.
The reader is a future AI or future-self who needs to pick up exactly where things left off.
Prioritize: what state is the work in, what to do next, what NOT to do, what to watch out for.
Skip background explanation. Be direct and operationally precise.
You only extract what the USER explicitly stated or confirmed.

Output format: ONLY valid JSON. No markdown. No code fences. No explanation.

Schema:
{
  "title": "string",
  "handoffMeta": {
    "sessionFocus": "string or null",
    "whyThisSession": "string or null",
    "timePressure": "string or null"
  },
  "currentStatus": ["string"],
  "resumeChecklist": [{"action": "string", "whyNow": "string (REQUIRED)", "ifSkipped": "string (REQUIRED)"}],
  "nextActions": [{"action": "string", "whyImportant": "string (infer from context)", "priorityReason": "string or null", "dueBy": "string or null", "dependsOn": ["string"] or null}],
  "actionBacklog": [{"action": "string", "whyImportant": "string (why in backlog?)", "priorityReason": "string or null", "dueBy": "string or null", "dependsOn": ["string"] or null}],
  "completed": ["string"],
  "blockers": ["string"],
  "decisions": [{"decision": "string", "rationale": "string (infer if not stated)"}],
  "constraints": ["string"],
  "tags": ["string"]
}

TITLE rules:
- 20-40 characters. Concise and descriptive.
- Summarize the MAIN work topic, not the conversation itself.
- title MUST be specific. NEVER generic like "Restart Memo" or "Session Summary". Extract the main topic.
- Japanese input → Japanese title. English input → English title.
- Use specific nouns and actions: "Lore拡張UI改善", "レート制限リトライ実装", "検索モジュール統合"
- BAD: "会話ログ", "AIとの議論", "作業メモ" → TOO VAGUE
- BAD: "extension-capture.json" → FILE NAMES ARE NOT TITLES

CURRENT STATUS (今どこ？): Describe the PROJECT STATE right now — at this exact moment. Answer "Where exactly are we?" NOT "What happened." Target: 3-5 bullets. HIGHEST PRIORITY.
  - currentStatus MUST use present tense ONLY. NEVER use past tense (completed/完了した). Past items belong in 'completed' array, not currentStatus.
  - ONLY present-tense state descriptions: what IS working, what IS partially done, what IS broken, what IS blocked.
  - ABSOLUTELY FORBIDDEN in currentStatus: past-tense/completed actions. Any sentence with "〜済み", "〜した", "〜完了", "〜修正した", "〜追加した", "〜実装した", "fixed", "added", "implemented", "updated", "changed", "created", "resolved" belongs in COMPLETED, not here.
  - BAD: "The header redesign was completed" → WRONG (past tense). GOOD: "Header redesign is done, focus is now on responsive layout" → CORRECT
  - If a name, setting, or value was CHANGED during the conversation, output the LATEST version only. Do NOT output the old name/value.
  - BAD: "Worked on the UI redesign" → PAST TENSE → goes to COMPLETED
  - BAD: "maxTokensを8192に修正した" → COMPLETED ACTION → goes to COMPLETED
  - BAD: "エラーハンドリングを追加済み" → COMPLETED ACTION → goes to COMPLETED
  - GOOD: "Theme system is live (light/dark/system). JSON import parser exists but is not yet wired into UI."
  - GOOD: "検索機能は動作中。フィルタUIは未実装。"
  - GOOD: "chunkEngine.tsのmerge処理は安定動作。resumeContext生成は未対応。"

HANDOFF META: Session-level context for the next person/AI resuming work. These fields are CRITICAL for the reader to understand context. Fill all three whenever possible.
  - "sessionFocus": 1 sentence. What was this session trying to advance? Infer from the main topics discussed. null only if the session had no coherent focus (very rare).
  - "whyThisSession": 1 sentence. Why is this work important right now? Infer from context — what larger goal, phase, or dependency makes this session matter? null only if truly unknowable.
  - "timePressure": 1 sentence. Phase-level urgency, NOT a deadline.
    GOOD: "ベータユーザー獲得が最優先フェーズ", "公開前に導線確定が必要", "次回テスト前にこの修正が必要"
    FORBIDDEN: vague words alone ("急ぎ", "重要", "urgent"). Must state WHAT creates the pressure.
    INFERENCE ALLOWED: If the chat mentions "今週中に", "早めに", "〜の前に" etc., convert to a concrete phase statement. Example: "早めにやりたい" + context about launch → "ローンチ前にこの機能が必要".
    Japanese extraction examples:
      "来週月曜までに" → "Deadline: next Monday (来週月曜)"
      "今週中に" → "Must complete this week"
      "急ぎで" → "Urgent, needs immediate attention"
    null ONLY if no time pressure is mentioned or inferable at all.

RESUME CHECKLIST (再開チェックリスト): What to check, verify, or decide FIRST when resuming. Max 3 items.
  - NOT a copy of nextActions. This is about "confirm → decide" entry points.
  - Allowed verbs: confirm, verify, check, decide, fix, review — not just "確認する".
  - Each item MUST be an object with "action", "whyNow", and "ifSkipped".
  - "whyNow": MANDATORY — never null. Why this check/action is the first thing to do. Infer from context: what downstream task depends on this? What decision is waiting on this?
  - "ifSkipped": MANDATORY — never null. What specific failure, delay, or wrong decision happens if skipped. Be concrete: name the downstream task or decision that breaks.
  - GOOD: {"action": "Xアカウントのシャドーバン状態を確認する", "whyNow": "LP公開後の集客導線判断に直結するため", "ifSkipped": "DM送信方針と流入導線の判断がブレる"}
  - BAD: {"action": "テスト実行", "whyNow": null, "ifSkipped": null} — whyNow/ifSkipped must never be null

NEXT ACTIONS (次何やる？ — immediate only, max 4): Tasks that MUST be done now or the next decision/task is blocked.
  - Selection criteria: this task is a prerequisite for other work, an input to a pending decision, or unblocks a blocker.
  - Each item MUST be an object with "action", "whyImportant", "priorityReason", "dueBy", and "dependsOn" fields.
  - "action": "VERB + FILE/FUNCTION NAME + SPECIFIC CHANGE".
  - "whyImportant": Infer from chat context. A task listed as next action always has a reason — state it. What work depends on this? What breaks without it? null ONLY if truly no context exists (rare).
  - "priorityReason": Why NOW or before others. Infer from ordering, dependencies, or conversation flow. null only if all tasks are equally urgent with no ordering signal.
  - "dueBy": Only explicit deadlines. null if not stated.
  - "dependsOn": Only explicit dependencies. null if none.
  - Tasks that are important but NOT blocking → actionBacklog.
  - ABSOLUTELY FORBIDDEN: "続きを進める", "着手する", "Continue working"
  - Max 4 items. If more exist, move non-blocking items to actionBacklog.

ACTION BACKLOG (そのうちやるもの, max 7): Important tasks needed soon but NOT the immediate resume starting point.
  - Same object format as nextActions. whyImportant should be filled — why is this task in the backlog at all?
  - Selection criteria: needed within next 1-3 sessions, but won't block today's work if deferred.
  - Max 7 items. If more exist, prioritize by importance and drop the rest.
  - FORBIDDEN: listing 20+ items. This is a curated backlog, not a full task dump.
  - actionBacklog must ONLY contain items the user explicitly mentioned as future work. Do NOT include assistant suggestions that the user did not acknowledge.

COMPLETED (終わったこと): MANDATORY. All completed work. Target: 2-6 bullets.
  - Any action with "〜済み", "〜した", "fixed", "added", "implemented" MUST go here.
  - FORBIDDEN: "確認した", "特定した", "reviewed" — not deliverables.

BLOCKERS (注意・リスク): Risks, concerns, gotchas still unresolved at END. 0-3 bullets.
  - NOT constraints. NOT tasks. EXCLUDE resolved issues.

DECISIONS (決定事項 — active only, max 6): ONLY decisions that STILL constrain future work.
  - HARD LIMIT: Maximum 6 decisions. If more than 6 qualify, keep only the 6 most significant.
  - Each MUST be {"decision": "string", "rationale": "string or null"}.
  - EXCLUDE: completed/overturned decisions, task-level content, URLs.
  - rationale: extract if stated. If not stated explicitly, infer from context (what was the alternative? what problem did this solve?). null only if no context exists at all.
  - Finality markers (EN): "decided", "will go with", "settled on"
  - Finality markers (JA): "に決めた", "でいく", "にする", "で確定"
  - NOT a decision: "OK that schema looks good" → no restated commitment, just acknowledgement.
  - NOT a decision: "OK sure, X sounds fine" → NOT a decision. User must RESTATE commitment.
  - NOT a decision: "Maybe later, not a priority now" → deferral, not commitment.
  - NOT a decision: "もう少し調べてから判断する" → explicit deferral, not a decision.

CONSTRAINTS (前提・制約): Stable rules that persist. 0-3 bullets.
  - NOT risks (→ blockers). NOT tasks (→ nextActions/actionBacklog).

TAGS rules:
- Generate two types:
  A. CATEGORY tags (2-3): broad work categories. Examples: 開発, UI, 設計, バグ修正, テスト, リファクタ, 調査, 戦略
  B. TOPIC tags (2-4): specific tools, features, or concepts. Examples: React, IndexedDB, レート制限, i18n
- Total 4-7 tags.
- tags MUST contain at least 3 items for any non-trivial conversation.
- IMPORTANT: Tags MUST match the input language. Japanese input → Japanese tags. English input → English tags. Keep widely-recognized technical proper nouns as-is (React, TypeScript, Supabase, etc.).
- AVOID vague tags like "productivity", "improvement", "work", "AI", "development".

OUTPUT LANGUAGE RULE:
- Japanese input → output in Japanese. BUT keep file names (chunkEngine.ts), code identifiers (currentStatus, parseConversationJson), API names, and technical terms (API, JSON, chunk, retry) in English.
- English input → output in English.
- Style: Japanese sentences with English technical terms inline. Example: "Workspace.tsx のerror handling を修正済み。rate limit時のretry loopが安定動作する。"`;

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

export async function transformHandoff(sourceText: string): Promise<HandoffResult> {
  const apiKey = getApiKey();
  if (!apiKey && !shouldUseBuiltinApi()) {
    throw new Error('[API Key] Not set. Go to Settings and enter your API key.');
  }

  const lang = resolveLang(sourceText);
  const langInstruction = getLangInstruction(lang);

  const userMessage = `${langInstruction}\n\nExtract a restart memo from the following conversation. Focus on where to resume, what's done, next actions, and unresolved issues.\n\nCHAT:\n${sourceText}`;

  const rawText = await callProvider({
    apiKey,
    system: HANDOFF_PROMPT,
    userMessage,
    maxTokens: 8192,
  });

  try {
    const jsonText = extractJson(rawText);
    const parsed = JSON.parse(jsonText);
    const completed = parsed.completed || [];
    const rawDecisions = parsed.decisions || [];
    const { decisions, decisionRationales } = normalizeDecisions(rawDecisions);
    const rawNextActions = parsed.nextActions || [];
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
      title: parsed.title || 'Untitled',
      handoffMeta,
      currentStatus: parsed.currentStatus || [],
      resumeChecklist,
      resumeContext: resumeChecklist.length > 0
        ? resumeChecklist.map(r => r.action)
        : (typeof parsed.resumeContext === 'string'
          ? (parsed.resumeContext.trim() ? [parsed.resumeContext.trim()] : [])
          : (parsed.resumeContext || [])),
      nextActions,
      nextActionItems,
      actionBacklog: actionBacklog.length > 0 ? actionBacklog : undefined,
      completed,
      blockers: filterResolvedBlockers(parsed.blockers || [], completed, decisions),
      decisions,
      decisionRationales,
      constraints: parsed.constraints || [],
      tags: parsed.tags || [],
    };
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[Transform] Parse error:', error);
    throw new Error('[Parse Error] AI response was not valid JSON. Check console for details.');
  }
}

// --- Combined "both" mode — single API call for worklog + handoff ---

const BOTH_PROMPT = `You extract BOTH a work log AND a restart memo from an AI chat history in a single pass.
You are strict and conservative. You only extract what the USER explicitly stated or confirmed.

Output format: ONLY valid JSON. No markdown. No code fences. No explanation.

Schema:
{
  "worklog": {
    "title": "string",
    "today": ["string"],
    "decisions": ["string"],
    "todo": ["string"],
    "relatedProjects": ["string"],
    "tags": ["string"]
  },
  "handoff": {
    "title": "string",
    "handoffMeta": {"sessionFocus": "string or null", "whyThisSession": "string or null", "timePressure": "string or null"},
    "currentStatus": ["string"],
    "resumeChecklist": [{"action": "string", "whyNow": "string (REQUIRED)", "ifSkipped": "string (REQUIRED)"}],
    "nextActions": [{"action": "string", "whyImportant": "string (infer from context)", "priorityReason": "string or null", "dueBy": "string or null", "dependsOn": ["string"] or null}],
    "actionBacklog": [{"action": "string", "whyImportant": "string (why in backlog?)", "priorityReason": "string or null", "dueBy": "string or null", "dependsOn": ["string"] or null}],
    "completed": ["string"],
    "blockers": ["string"],
    "decisions": [{"decision": "string", "rationale": "string (infer if not stated)"}],
    "constraints": ["string"],
    "tags": ["string"]
  },
  "classification": {
    "projectId": "string or null",
    "confidence": 0.0
  }
}

=== WORKLOG RULES ===
TITLE: 20-40 chars, specific nouns and actions. Match input language. title MUST be specific. NEVER generic like "Restart Memo" or "Session Summary". Extract the main topic.
TODAY: What was actually done. 3-8 items. Include file names, values, parameters. today MUST NOT be empty for conversations with 5+ messages. Items discussed but not decided belong in today. Deferred items: "Discussed X but deferred to later".
DECISIONS: Only explicit commitments with finality markers ("decided", "でいく", "にする", "settled on"). "OK sure, X sounds fine" → NOT a decision. User must RESTATE commitment. Empty [] if none.
TODO: Only actions the user explicitly committed to doing NEXT. EXCLUDE items completed/resolved later in the conversation. EXCLUDE concluded investigations ("調べる"/"考える" with conclusion reached). EXCLUDE vague aspirations ("〜かも", "〜したい"). Each TODO = ONE concrete executable action. Empty [] if none.
RELATED PROJECTS: Only actual project/product names. Exclude tool names (Claude, VS Code). Empty [] if none.
TAGS: 4-7 tags. tags MUST contain at least 3 items for any non-trivial conversation. Tags MUST match the input language. Japanese input → Japanese tags (開発, UI, バグ修正). English input → English tags (development, UI, bugfix). Keep proper nouns as-is (React, TypeScript, Supabase).

=== HANDOFF RULES ===
This is a RESTART MEMO — a cockpit checklist for resuming work, NOT a report.
TITLE: Same as worklog title (reuse). title MUST be specific. NEVER generic like "Restart Memo" or "Session Summary". Extract the main topic.
HANDOFF META: sessionFocus (1 sentence: what to move forward), whyThisSession (1 sentence: why this matters now — infer from context), timePressure (1 sentence: phase-level urgency; FORBIDDEN: vague "急ぎ"/"重要" alone — must state WHAT creates pressure; INFERENCE ALLOWED: convert weak expressions like "今週中に"/"早めに" into concrete phase statements using context; Japanese examples: "来週月曜までに" → "Deadline: next Monday (来週月曜)", "今週中に" → "Must complete this week", "急ぎで" → "Urgent, needs immediate attention"; null ONLY if no pressure mentioned or inferable).
CURRENT STATUS (今どこ？): PROJECT STATE right now. 3-5 bullets. ONLY present-tense — NO completed actions → COMPLETED. currentStatus MUST use present tense ONLY. NEVER use past tense (completed/完了した). Past items belong in 'completed' array, not currentStatus. BAD: "The header redesign was completed" → WRONG. GOOD: "Header redesign is done, focus is now on responsive layout".
RESUME CHECKLIST (max 3): What to check/verify/decide FIRST when resuming. Each {"action":"string","whyNow":"string","ifSkipped":"string"}. whyNow and ifSkipped are MANDATORY — NEVER null. Infer from context: what downstream task depends on this? What breaks if skipped? NOT a copy of nextActions.
NEXT ACTIONS (immediate only, max 4): Tasks that MUST be done now or next work is blocked. Same object format. whyImportant: infer from context (what depends on this?), null only if truly no context. priorityReason: infer ordering signal. Non-blocking tasks → actionBacklog.
ACTION BACKLOG (max 7): Important but not immediately blocking. Same object format. whyImportant: why is this in the backlog? FORBIDDEN: 20+ items. actionBacklog must ONLY contain items the user explicitly mentioned as future work. Do NOT include assistant suggestions that the user did not acknowledge.
COMPLETED (終わったこと): MANDATORY. All completed work. 2-6 bullets. FORBIDDEN: "確認した", "特定した".
BLOCKERS: Risks still unresolved at end. 0-3 bullets.
DECISIONS (active only, max 6): Only decisions still constraining future work. HARD LIMIT: Maximum 6 decisions. If more than 6 qualify, keep only the 6 most significant. Each {"decision":"string","rationale":"string or null"}. rationale: extract if stated; infer from context if not (what was the alternative?). EXCLUDE completed/overturned decisions.
  - NOT a decision: "OK that schema looks good" → no restated commitment, just acknowledgement.
  - NOT a decision: "OK sure, X sounds fine" → NOT a decision. User must RESTATE commitment.
  - NOT a decision: "Maybe later, not a priority now" → deferral, not commitment.
  - NOT a decision: "もう少し調べてから判断する" → explicit deferral, not a decision.
CONSTRAINTS: Stable rules. 0-3 bullets.
TAGS: Can reuse worklog tags. tags MUST contain at least 3 items for any non-trivial conversation.

=== CLASSIFICATION RULES ===
If a PROJECTS list is provided, match the log to the best project.
- projectId: the project ID that best matches, or null if no match.
- confidence: 0.0-1.0 (0.8+ = strong match, 0.5-0.7 = possible, below 0.5 = weak).
- Only use project IDs from the provided list.
- If no PROJECTS list is provided in the user message, you MUST set projectId to null and confidence to 0. Do NOT infer project names from conversation content.

=== SHARED RULES ===
- Assistant suggestions are NOT decisions/TODOs unless user explicitly accepts them.
- Japanese input → Japanese output (keep file names and code terms in English).
- English input → English output.
- Output the ENTIRE JSON object. Start with { and end with }.`;

// --- TODO-only mode ---

export interface TodoOnlyItem {
  title: string;
  priority: 'high' | 'medium' | 'low';
  dueDate?: string;
}

export interface TodoOnlyResult {
  todos: TodoOnlyItem[];
}

const TODO_ONLY_PROMPT = `You extract a TODO list from an AI chat history.
You are strict and conservative. You only extract what the USER explicitly committed to doing.

CORE PRINCIPLE:
Assistant suggestions are NOT TODOs unless the user explicitly accepts them.
If the assistant proposes something and the user does not clearly confirm it, EXCLUDE it.

Output format: ONLY valid JSON. No markdown. No code fences. No explanation.

Schema:
{
  "todos": [
    { "title": "string", "priority": "high" | "medium" | "low", "dueDate": "YYYY-MM-DD or null" }
  ]
}

TODO EXTRACTION rules:
- ONLY include actions the user explicitly committed to doing NEXT.
- Look for user statements like: "will do", "next step", "need to", "tomorrow I'll", "明日やる", "次にやる", "を作る", "を試す", "実装する", "修正する", "依頼する"
- EXCLUDE completed items: if the conversation later says "完了した", "解決した", "対応済み", "done", "fixed", "resolved" about an action, it is NOT a TODO.
- EXCLUDE concluded investigations: if "調べる" or "考える" appears but a conclusion was reached in the conversation, it is NOT a TODO.
- EXCLUDE vague/aspirational items: "〜が必要かも", "〜したい", "〜かもしれない", "might need", "would be nice" are NOT TODOs.
- Each TODO must be ONE specific, executable action. BAD: "UIの改善" (abstract). GOOD: "TodoViewにソート機能を追加する" (concrete).
- If the assistant recommended an action and the user did NOT confirm it, EXCLUDE it.
- If zero items meet this bar, return { "todos": [] }. Do NOT fill with weaker items.

PRIORITY rules:
- "high": User explicitly said it's urgent, critical, or must be done first / immediately. Keywords: "最優先", "すぐ", "急ぎ", "urgent", "critical", "ASAP", "first"
- "medium": Normal tasks that need to be done but no urgency stated. This is the DEFAULT.
- "low": User said it's optional, nice-to-have, or low priority. Keywords: "余裕があれば", "後で", "eventually", "nice to have", "low priority"

DUE DATE rules:
- Only set dueDate if the user explicitly mentioned a date or timeframe.
- "明日" / "tomorrow" → next calendar day. "今週中" / "this week" → end of current week (Sunday). "来週" / "next week" → next Monday.
- If no date/timeframe is mentioned, set dueDate to null.

OUTPUT LANGUAGE RULE:
- Japanese input → Japanese output. English input → English output.`;

export async function transformTodoOnly(sourceText: string): Promise<TodoOnlyResult> {
  const apiKey = getApiKey();
  if (!apiKey && !shouldUseBuiltinApi()) {
    throw new Error('[API Key] Not set. Go to Settings and enter your API key.');
  }

  const lang = resolveLang(sourceText);
  const langInstruction = getLangInstruction(lang);

  const userMessage = `${langInstruction}\n\nExtract a TODO list from the following conversation. Only include actions the user explicitly committed to.\n\nCHAT:\n${sourceText}`;

  const rawText = await callProvider({
    apiKey,
    system: TODO_ONLY_PROMPT,
    userMessage,
    maxTokens: 8192,
  });

  try {
    const jsonText = extractJson(rawText);
    const parsed = JSON.parse(jsonText);
    const todos: TodoOnlyItem[] = (parsed.todos || []).map((t: Record<string, unknown>) => ({
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

export async function transformHandoffTodo(sourceText: string): Promise<HandoffTodoResult> {
  // Step 1: Generate handoff
  const handoff = await transformHandoff(sourceText);
  // Step 2: Extract TODOs
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
    const jsonText = extractJson(rawText);
    const parsed = JSON.parse(jsonText);

    const w = parsed.worklog || parsed;
    const h = parsed.handoff || parsed;

    const c = parsed.classification;
    const result: BothResult = {
      worklog: {
        title: w.title || 'Untitled',
        today: w.today || [],
        decisions: w.decisions || [],
        todo: w.todo || [],
        relatedProjects: w.relatedProjects || [],
        tags: w.tags || [],
      },
      handoff: (() => {
        const hCompleted = h.completed || [];
        const rawHDecisions = h.decisions || [];
        const { decisions: hDecisions, decisionRationales: hDecisionRationales } = normalizeDecisions(rawHDecisions);
        const rawHNextActions = h.nextActions || [];
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
          title: h.title || w.title || 'Untitled',
          handoffMeta: hHandoffMeta,
          currentStatus: h.currentStatus || [],
          resumeChecklist: hResumeChecklist,
          resumeContext: hResumeChecklist.length > 0
            ? hResumeChecklist.map(r => r.action)
            : (typeof h.resumeContext === 'string'
              ? (h.resumeContext.trim() ? [h.resumeContext.trim()] : [])
              : (h.resumeContext || [])),
          nextActions: hNextActions,
          nextActionItems: hNextActionItems,
          actionBacklog: hActionBacklog.length > 0 ? hActionBacklog : undefined,
          completed: hCompleted,
          blockers: filterResolvedBlockers(h.blockers || [], hCompleted, hDecisions),
          decisions: hDecisions,
          decisionRationales: hDecisionRationales,
          constraints: h.constraints || [],
          tags: h.tags || w.tags || [],
        };
      })(),
      classification: c ? {
        projectId: c.projectId || null,
        confidence: typeof c.confidence === 'number' ? Math.max(0, Math.min(1, c.confidence)) : 0,
      } : undefined,
    };
    return result;
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[Transform] Parse error:', error);
    throw new Error('[Parse Error] AI response was not valid JSON. Check console for details.');
  }
}
