import type { TransformResult, HandoffResult, BothResult } from './types';
import { getApiKey, getLang } from './storage';
import { callProvider, callProviderStream } from './provider';
import type { StreamCallback } from './provider';

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
- Do not editorialize or add interpretation.

TITLE rules:
- 20-40 characters. Concise and descriptive.
- Summarize the MAIN work topic, not the conversation itself.
- Japanese input → Japanese title. English input → English title.
- Use specific nouns and actions: "Lore拡張UI改善", "レート制限リトライ実装", "検索モジュール統合"
- BAD: "会話ログ", "AIとの議論", "作業メモ" → TOO VAGUE
- BAD: "extension-capture.json" → FILE NAMES ARE NOT TITLES

TAGS rules:
- Generate two types:
  A. CATEGORY tags (2-3): broad work categories. Examples: 開発, UI, 設計, バグ修正, テスト, リファクタ, 調査, 戦略, 営業, 自動化, インフラ, ドキュメント
  B. TOPIC tags (2-4): specific tools, features, or concepts discussed. Examples: React, IndexedDB, rate-limit, i18n, CSS変数
- Total 4-7 tags.
- IMPORTANT: ALL tags MUST be in Japanese. Category tags are always Japanese. Topic tags: translate non-proper-noun terms to Japanese (e.g., "rate-limit" → "レート制限", "authentication" → "認証"). Only keep widely-recognized technical proper nouns as-is (React, TypeScript, IndexedDB, JSON, API, Claude, etc.).
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

function detectLanguage(text: string): 'ja' | 'en' {
  const jaPattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g;
  const jaMatches = text.match(jaPattern);
  const jaRatio = (jaMatches?.length ?? 0) / text.length;
  return jaRatio > 0.1 ? 'ja' : 'en';
}

function extractJson(raw: string): string {
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
  if (!apiKey) {
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
    console.log('RAW AI RESPONSE:', rawText);
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
    console.error('Raw AI response:', rawText);
    console.error('Parse error:', error);
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
  "currentStatus": ["string"],
  "nextActions": ["string"],
  "completed": ["string"],
  "blockers": ["string"],
  "decisions": ["string"],
  "constraints": ["string"],
  "resumeContext": "string",
  "tags": ["string"]
}

TITLE rules:
- 20-40 characters. Concise and descriptive.
- Summarize the MAIN work topic, not the conversation itself.
- Japanese input → Japanese title. English input → English title.
- Use specific nouns and actions: "Lore拡張UI改善", "レート制限リトライ実装", "検索モジュール統合"
- BAD: "会話ログ", "AIとの議論", "作業メモ" → TOO VAGUE
- BAD: "extension-capture.json" → FILE NAMES ARE NOT TITLES

CURRENT STATUS (今どこ？): Describe the PROJECT STATE right now — at this exact moment. Answer "Where exactly are we?" NOT "What happened." Target: 3-5 bullets. HIGHEST PRIORITY.
  - ONLY present-tense state descriptions: what IS working, what IS partially done, what IS broken, what IS blocked.
  - ABSOLUTELY FORBIDDEN in currentStatus: past-tense/completed actions. Any sentence with "〜済み", "〜した", "〜完了", "〜修正した", "〜追加した", "〜実装した", "fixed", "added", "implemented", "updated", "changed", "created", "resolved" belongs in COMPLETED, not here.
  - If a name, setting, or value was CHANGED during the conversation, output the LATEST version only. Do NOT output the old name/value.
  - BAD: "Worked on the UI redesign" → PAST TENSE → goes to COMPLETED
  - BAD: "maxTokensを8192に修正した" → COMPLETED ACTION → goes to COMPLETED
  - BAD: "エラーハンドリングを追加済み" → COMPLETED ACTION → goes to COMPLETED
  - GOOD: "Theme system is live (light/dark/system). JSON import parser exists but is not yet wired into UI."
  - GOOD: "検索機能は動作中。フィルタUIは未実装。"
  - GOOD: "chunkEngine.tsのmerge処理は安定動作。resumeContext生成は未対応。"

NEXT ACTIONS (次何やる？): Concrete tasks to do NEXT on resume, in priority order. ONLY future actions. Target: 1-4 bullets.
  - Each item MUST follow the format: "VERB + FILE/FUNCTION NAME + SPECIFIC CHANGE".
  - ONLY executable actions go here. Risks/concerns → blockers. Constraints/scope → constraints.
  - ABSOLUTELY FORBIDDEN: "続きを進める", "着手する", "開始する", "Continue working", "Start on", "Proceed with"
  - BAD: "Continue working on the feature" → NOT EXECUTABLE
  - BAD: "Improve the UI" → VAGUE
  - BAD: "Claude APIが不安定な点に注意" → THIS IS A CAUTION → goes to blockers
  - BAD: "SPA構成を維持する" → THIS IS A CONSTRAINT → goes to constraints
  - GOOD: "chunkEngine.tsのmergeResults()をフィールドごとに優先度を変えるよう修正する"
  - GOOD: "Wire parseConversationJson() into Workspace.tsx readFileContent() and update file input accept attribute"

COMPLETED (終わったこと): What was ACTUALLY IMPLEMENTED, CHANGED, or FIXED during this conversation. MANDATORY — always output this section. Target: 2-6 bullets.
  - This is the ONLY place for completed work. Any action described with "〜済み", "〜した", "〜修正した", "〜実装した", "〜追加した", "fixed", "added", "implemented", "updated", "created" MUST go here. Do NOT discard completed items — capture them all.
  - FORBIDDEN: "〜を決定した", "〜を確認した", "〜を特定した", "〜を検討した", "identified", "confirmed", "decided", "investigated", "reviewed" — these are not deliverables.
  - BAD: "バグを特定した" → INVESTIGATION IS NOT COMPLETION
  - BAD: "Reviewed the PR" → REVIEW IS NOT A DELIVERABLE
  - GOOD: "Workspaceのstate更新漏れを修正し、保存後にdetailビューへ遷移するようにした"
  - GOOD: "Added try-catch to all clipboard.writeText() calls in Workspace.tsx, MasterNoteView.tsx, ProjectHomeView.tsx"

BLOCKERS (注意・リスク): Risks, concerns, gotchas, known bugs, edge cases that could trip you up. Things the next person should be WARNED about. Target: 0-3 bullets.
  - This is for CAUTIONS and RISKS — not for constraints or next actions.
  - EXCLUDE issues that were RESOLVED or FIXED during the conversation. Only include what is STILL a risk at the END.
  - BAD: "SPA-only構成を維持する" → THIS IS A CONSTRAINT → goes to constraints
  - BAD: "検索UIにフィルタ機能を追加する" → THIS IS A NEXT ACTION → goes to nextActions
  - GOOD: "Claude APIのレート制限が頻発しており、大量変換時にタイムアウトする可能性あり"
  - GOOD: "localStorage quota may be exceeded if user stores 500+ logs with large memo fields"

DECISIONS (決定事項): ONLY technical judgments, architecture choices, and policy changes that constrain future work. Target: 0-5 bullets.
  - ONE decision per bullet. NEVER combine multiple decisions into a single item.
  - ONLY keep: technology choices, architecture decisions, design direction changes, feature scope decisions.
  - FORBIDDEN: task-level content ("AをBに修正した" → goes to completed), URLs, specific post content, concrete text passages, implementation details.
  - Finality markers (EN): "decided", "will go with", "fixed on", "confirmed", "settled on"
  - Finality markers (JA): "に決めた", "でいく", "を固定する", "にする", "で確定"
  - Ambiguous agreement is NOT a decision.
  - BAD: "LPのBYOK記述を削除した" → TASK-LEVEL → goes to completed
  - BAD: "https://example.com/path を参考にした" → URL → exclude
  - GOOD: "Gemini APIを内蔵し、BYOKオプションは提供しない方針に決定"
  - GOOD: "SPA構成を維持、バックエンド不使用"

CONSTRAINTS (前提・制約): Stable, ongoing constraints that do NOT change between sessions. Technology stack, budget, architecture decisions, scope boundaries. Target: 0-3 bullets.
  - This is for FIXED RULES that persist — not for risks (→ blockers) or tasks (→ nextActions).
  - Include explicit "do NOT" instructions if the user stated them.
  - BAD: "Focus on quality" → MEANINGLESS
  - BAD: "Claude APIが不安定" → THIS IS A RISK → goes to blockers
  - GOOD: "No backend/auth/payments — SPA-only for now"
  - GOOD: "React + Vite + TypeScript構成。外部DB不使用、localStorage永続化"

RESUME CONTEXT (再開入力): A short checklist of what to do next. MAX 3 items. Each item starts with a VERB and is one concrete sentence.
  - Format: one task per line, each starting with a verb (「追加する」「修正する」「実装する」 / "Add", "Fix", "Implement").
  - MUST include file names and function names where applicable.
  - BAD: "Check the codebase" → USELESS
  - BAD: long paragraph summarizing everything → TOO VERBOSE
  - BAD: more than 3 items → TOO MANY
  - GOOD: "chunkEngine.tsのlocalMerge()にresumeContextフォールバック処理を追加する\nWorkspace.tsxのHandoffResultDisplayでボタンを1つに統合する\nnpm run buildで型エラーがないか確認する"

TAGS rules:
- Generate two types:
  A. CATEGORY tags (2-3): broad work categories. Examples: 開発, UI, 設計, バグ修正, テスト, リファクタ, 調査, 戦略
  B. TOPIC tags (2-4): specific tools, features, or concepts. Examples: React, IndexedDB, レート制限, i18n
- Total 4-7 tags.
- IMPORTANT: ALL tags MUST be in Japanese. Category tags are always Japanese. Topic tags: translate non-proper-noun terms to Japanese. Only keep widely-recognized technical proper nouns as-is (React, TypeScript, IndexedDB, JSON, API, Claude, etc.).
- AVOID vague tags like "productivity", "improvement", "work", "AI", "development".

OUTPUT LANGUAGE RULE:
- Japanese input → output in Japanese. BUT keep file names (chunkEngine.ts), code identifiers (currentStatus, parseConversationJson), API names, and technical terms (API, JSON, chunk, retry) in English.
- English input → output in English.
- Style: Japanese sentences with English technical terms inline. Example: "Workspace.tsx のerror handling を修正済み。rate limit時のretry loopが安定動作する。"`;

export async function transformHandoff(sourceText: string): Promise<HandoffResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
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
    console.log('RAW AI RESPONSE:', rawText);
    const jsonText = extractJson(rawText);
    const parsed = JSON.parse(jsonText);
    const completed = parsed.completed || [];
    const decisions = parsed.decisions || [];
    return {
      title: parsed.title || 'Untitled',
      currentStatus: parsed.currentStatus || [],
      nextActions: parsed.nextActions || [],
      completed,
      blockers: filterResolvedBlockers(parsed.blockers || [], completed, decisions),
      decisions,
      constraints: parsed.constraints || [],
      resumeContext: typeof parsed.resumeContext === 'string'
        ? (parsed.resumeContext.trim() ? [parsed.resumeContext.trim()] : [])
        : (parsed.resumeContext || []),
      tags: parsed.tags || [],
    };
  } catch (error) {
    console.error('Raw AI response:', rawText);
    console.error('Parse error:', error);
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
    "currentStatus": ["string"],
    "nextActions": ["string"],
    "completed": ["string"],
    "blockers": ["string"],
    "decisions": ["string"],
    "constraints": ["string"],
    "resumeContext": "string",
    "tags": ["string"]
  },
  "classification": {
    "projectId": "string or null",
    "confidence": 0.0
  }
}

=== WORKLOG RULES ===
TITLE: 20-40 chars, specific nouns and actions. Match input language.
TODAY: What was actually done. 3-8 items. Include file names, values, parameters.
DECISIONS: Only explicit commitments with finality markers ("decided", "でいく", "にする", "settled on"). Empty [] if none.
TODO: Only actions the user explicitly committed to doing NEXT. EXCLUDE items completed/resolved later in the conversation. EXCLUDE concluded investigations ("調べる"/"考える" with conclusion reached). EXCLUDE vague aspirations ("〜かも", "〜したい"). Each TODO = ONE concrete executable action. Empty [] if none.
RELATED PROJECTS: Only actual project/product names. Exclude tool names (Claude, VS Code). Empty [] if none.
TAGS: 4-7 tags. ALL tags MUST be in Japanese. Category (開発, UI, バグ修正) + Topic (React, IndexedDB, レート制限). Only keep widely-recognized proper nouns as-is.

=== HANDOFF RULES ===
This is a RESTART MEMO — a cockpit checklist for resuming work, NOT a report.
TITLE: Same as worklog title (reuse).
CURRENT STATUS (今どこ？): PROJECT STATE right now. 3-5 bullets. ONLY present-tense — NO completed actions ("〜済み", "〜した", "fixed", "added" → COMPLETED). If a name/setting was changed, output only the LATEST version.
NEXT ACTIONS (次何やる？): ONLY future tasks. "VERB + FILE/FUNCTION + SPECIFIC CHANGE". FORBIDDEN: "続きを進める", "Continue working". Risks → blockers. Constraints → constraints. 1-4 bullets.
COMPLETED (終わったこと): MANDATORY — always output. All completed work ("〜済み", "〜した", "fixed", "added", "implemented"). Do NOT discard. FORBIDDEN: "確認した", "特定した", "reviewed". 2-6 bullets.
BLOCKERS (注意・リスク): Risks, concerns, gotchas, known bugs. NOT constraints (→ constraints), NOT tasks (→ nextActions). Only issues STILL unresolved at end. 0-3 bullets.
DECISIONS: ONE decision per bullet. ONLY technical judgments, architecture choices, policy changes. No task-level content, no URLs, no specific text passages. Same finality rules as worklog. 0-5 bullets.
CONSTRAINTS (前提・制約): STABLE, ONGOING constraints (tech stack, budget, scope). NOT risks (→ blockers), NOT tasks (→ nextActions). 0-3 bullets.
RESUME CONTEXT (再開入力): MAX 3 items, each starting with a VERB. Format: one task per line. "chunkEngine.tsのlocalMerge()にフォールバック処理を追加する\nWorkspace.tsxのボタンを統合する". Must include file/function names.
TAGS: Can reuse worklog tags.

=== CLASSIFICATION RULES ===
If a PROJECTS list is provided, match the log to the best project.
- projectId: the project ID that best matches, or null if no match.
- confidence: 0.0-1.0 (0.8+ = strong match, 0.5-0.7 = possible, below 0.5 = weak).
- Only use project IDs from the provided list.
- If no PROJECTS list is given, set projectId to null and confidence to 0.

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
  if (!apiKey) {
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
    console.log('RAW AI RESPONSE (todo_only):', rawText);
    const jsonText = extractJson(rawText);
    const parsed = JSON.parse(jsonText);
    const todos: TodoOnlyItem[] = (parsed.todos || []).map((t: Record<string, unknown>) => ({
      title: String(t.title || ''),
      priority: (['high', 'medium', 'low'].includes(t.priority as string) ? t.priority : 'medium') as 'high' | 'medium' | 'low',
      dueDate: typeof t.dueDate === 'string' && t.dueDate ? t.dueDate : undefined,
    })).filter((t: TodoOnlyItem) => t.title.trim());
    return { todos };
  } catch (error) {
    console.error('Raw AI response:', rawText);
    console.error('Parse error:', error);
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
  console.time('[transformBoth] total');
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('[API Key] Not set. Go to Settings and enter your API key.');
  }

  const lang = resolveLang(sourceText);
  const langInstruction = getLangInstruction(lang);

  const projectsBlock = projects && projects.length > 0
    ? `\n\nPROJECTS (for classification):\n${projects.map(p => `- "${p.name}" (id: ${p.id})`).join('\n')}`
    : '';

  const userMessage = `${langInstruction}\n\nExtract both a work log AND a restart memo from the following conversation in a single JSON response.${projectsBlock}\n\nCHAT:\n${sourceText}`;

  console.time('[transformBoth] API call');
  const rawText = onStream
    ? await callProviderStream({ apiKey, system: BOTH_PROMPT, userMessage, maxTokens: 8192 }, onStream)
    : await callProvider({ apiKey, system: BOTH_PROMPT, userMessage, maxTokens: 8192 });
  console.timeEnd('[transformBoth] API call');

  try {
    console.time('[transformBoth] JSON parse');
    console.log('RAW AI RESPONSE (both):', rawText.slice(0, 500), `(${rawText.length} chars total)`);
    const jsonText = extractJson(rawText);
    const parsed = JSON.parse(jsonText);
    console.timeEnd('[transformBoth] JSON parse');

    console.time('[transformBoth] build result');
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
        const hDecisions = h.decisions || [];
        return {
          title: h.title || w.title || 'Untitled',
          currentStatus: h.currentStatus || [],
          nextActions: h.nextActions || [],
          completed: hCompleted,
          blockers: filterResolvedBlockers(h.blockers || [], hCompleted, hDecisions),
          decisions: hDecisions,
          constraints: h.constraints || [],
          resumeContext: typeof h.resumeContext === 'string'
            ? (h.resumeContext.trim() ? [h.resumeContext.trim()] : [])
            : (h.resumeContext || []),
          tags: h.tags || w.tags || [],
        };
      })(),
      classification: c ? {
        projectId: c.projectId || null,
        confidence: typeof c.confidence === 'number' ? Math.max(0, Math.min(1, c.confidence)) : 0,
      } : undefined,
    };
    console.timeEnd('[transformBoth] build result');
    console.timeEnd('[transformBoth] total');
    return result;
  } catch (error) {
    console.timeEnd('[transformBoth] total');
    console.error('Raw AI response:', rawText);
    console.error('Parse error:', error);
    throw new Error('[Parse Error] AI response was not valid JSON. Check console for details.');
  }
}
