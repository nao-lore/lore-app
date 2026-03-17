/**
 * prompts.ts — Centralized AI prompt definitions for transform operations.
 *
 * All prompt strings used by transform.ts are defined here so they can be
 * versioned, tracked, and updated independently of the transform logic.
 */

/** Prompt version — included in system prompts for tracking AI response quality. */
export const PROMPT_VERSION = '2.0';

const VERSION_HEADER = `[Prompt v${PROMPT_VERSION}]\n\n`;

export const SYSTEM_PROMPT = VERSION_HEADER + `You extract a factual work log from an AI chat history.
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

export const HANDOFF_PROMPT = VERSION_HEADER + `You extract a structured RESTART MEMO from an AI chat history.
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

export const BOTH_PROMPT = VERSION_HEADER + `You extract BOTH a work log AND a restart memo from an AI chat history in a single pass.
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

export const TODO_ONLY_PROMPT = VERSION_HEADER + `You extract a TODO list from an AI chat history.
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
