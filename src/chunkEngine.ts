import type { TransformResult, HandoffResult, BothResult, OutputMode, DecisionWithRationale, NextActionItem } from './types';
import type { ChunkSession, PartialResult } from './chunkDb';
import { computeSourceHash, loadSession, saveSession, deleteSession } from './chunkDb';
import { getLang } from './storage';
import { callProvider, callProviderStream, getActiveProvider } from './provider';
import type { StreamCallback } from './provider';
import { filterResolvedBlockers, normalizeNextActions, normalizeResumeChecklist, normalizeHandoffMeta, normalizeActionBacklog } from './transform';
import { dedupStrings, dedupDecisions } from './utils/decisions';

// =============================================================================
// Worklog prompts
// =============================================================================

const WORKLOG_EXTRACT_PROMPT = `You are a JSON extraction machine. You read chat logs and output structured JSON. Nothing else.

CRITICAL RULES — VIOLATION = FAILURE:
1. Output ONLY a single JSON object. No text before or after.
2. No markdown. No code fences. No explanations. No greetings. No questions.
3. Do NOT respond to the chat content. Do NOT continue the conversation. EXTRACT only.
4. If the input contains casual chat, opinions, or greetings — SKIP them. Extract only work items.

WHAT TO EXTRACT (priority order):
- Implementation actions (code changes, config changes, file edits)
- Technical decisions with specific parameters
- Explicit next steps / TODOs the user committed to
- Bug fixes, test results, deployment actions

WHAT TO SKIP:
- Greetings, thanks, encouragement, opinions, feelings
- General discussion without concrete outcomes
- Assistant explanations or suggestions the user did not confirm
- UI reviews or feedback without specific action taken

Schema — output EXACTLY this structure:
{"title":"string","today":["string"],"decisions":["string"],"todo":["string"]}

Field rules:
- title: 1 short phrase summarizing the main work topic
- today: 3-8 specific action items. Include file names, values, parameters. BAD: "Worked on UI" GOOD: "Changed CHUNK_TARGET from 25k to 15k in chunkEngine.ts"
- decisions: Only items with explicit commitment markers ("decided", "でいく", "にする"). Empty [] if none.
- todo: Only next actions the user explicitly committed to. Empty [] if none.

Language: Match input language. Japanese input → Japanese output. English → English.`;

// =============================================================================
// Handoff prompts — optimized for completion reliability
// =============================================================================

const HANDOFF_EXTRACT_PROMPT = `You are a JSON extraction machine. You read chat logs and output structured JSON. Nothing else.

CRITICAL RULES — VIOLATION = FAILURE:
1. Output ONLY a single JSON object. No text before or after.
2. No markdown. No code fences. No explanations. No greetings. No questions.
3. Do NOT respond to the chat content. Do NOT continue the conversation. EXTRACT only.
4. If the input contains casual chat, opinions, or greetings — SKIP them. Extract only work state.

This is a RESTART MEMO — a cockpit checklist for resuming work. Not a report.

WHAT TO EXTRACT (priority order):
- Current system state (what works, what is partial, what is broken)
- Next concrete actions to take on resume
- Decisions (technical judgments and policy changes ONLY)
- Constraints and scope boundaries
- Blockers or risks

NOTE: Do NOT extract completed items here. Completed work is collected separately.

WHAT TO SKIP:
- Greetings, thanks, encouragement, opinions
- General discussion without concrete outcomes
- Background explanations

Schema — output EXACTLY this structure:
{"title":"string","currentStatus":["string"],"nextActions":[{"action":"string","whyImportant":"string or null","priorityReason":"string or null","dueBy":"string or null","dependsOn":["string"] or null}],"actionBacklog":[{"action":"string","whyImportant":"string or null","priorityReason":"string or null","dueBy":"string or null","dependsOn":["string"] or null}],"decisions":[{"decision":"string","rationale":"string or null"}],"blockers":["string"],"constraints":["string"]}

Field rules:
- title: 1 short phrase, max 8 words
- currentStatus: 3-5 bullets. PROJECT STATE right now — ONLY present-tense. NO completed actions → skip.
- nextActions (immediate only, max 4): Tasks that MUST be done now or next work is blocked. Each MUST be {"action":"string","whyImportant":"string or null","priorityReason":"string or null","dueBy":"string or null","dependsOn":["string"] or null}. Non-blocking tasks → actionBacklog.
  - whyImportant: Infer from context — what depends on this task? What breaks without it? Almost always fillable. null only if truly no context.
  - priorityReason: Infer ordering signal from conversation flow. null only if all tasks equally urgent.
- actionBacklog (max 7): Important but not immediately blocking. Same format. whyImportant should explain why this task is in the backlog.
- decisions (active only, max 6): Only decisions still constraining future work. Each {"decision":"string","rationale":"string or null"}. EXCLUDE completed/overturned decisions.
- blockers: Risks still unresolved at end. 0-3 bullets.
- constraints: Stable rules. 0-3 bullets.

NOTE: Do NOT output handoffMeta or resumeChecklist — those are generated at final merge.

Language: Match input. Japanese → Japanese (keep file names/code terms in English). English → English.`;

// Light/Ultra handoff — same minimal schema, even shorter output
export const HANDOFF_EXTRACT_LIGHT_PROMPT = HANDOFF_EXTRACT_PROMPT;

const HANDOFF_EXTRACT_ULTRA_PROMPT = `JSON extraction machine. Output ONLY valid JSON. No text before/after. No markdown.

{"title":"string","currentStatus":["string"],"nextActions":[{"action":"string","whyImportant":"string or null","priorityReason":"string or null","dueBy":"string or null","dependsOn":["string"] or null}],"actionBacklog":[{"action":"string","whyImportant":"string or null","priorityReason":"string or null","dueBy":"string or null","dependsOn":["string"] or null}],"decisions":[{"decision":"string","rationale":"string or null"}],"blockers":["string"],"constraints":["string"]}

Do NOT extract completed items — they are collected separately.
Do NOT output handoffMeta or resumeChecklist — those are generated at final merge.

Field rules:
- currentStatus: present-tense state ONLY. NO past actions → skip.
- nextActions (immediate only, max 4): blocking tasks only. Non-blocking → actionBacklog. whyImportant: infer from context (what depends on this?). priorityReason: infer ordering signal. Both should be filled when possible.
- actionBacklog (max 7): important but not blocking now. Same format. whyImportant: why is this in the backlog?
- decisions (active only, max 6): still-active decisions only. Each {"decision":"string","rationale":"string or null"}.
- blockers: risks, concerns still unresolved.
- constraints: stable rules.

Skip chat, greetings, opinions. Extract only work-related information.
Japanese input → Japanese (keep code terms in English). English → English.`;


// =============================================================================
// Combined "both" extraction prompt (single API call for worklog + handoff)
// =============================================================================

const BOTH_EXTRACT_PROMPT = `You are a JSON extraction machine. You read chat logs and output structured JSON. Nothing else.

CRITICAL RULES — VIOLATION = FAILURE:
1. Output ONLY a single JSON object. No text before or after.
2. No markdown. No code fences. No explanations. No greetings. No questions.
3. Do NOT respond to the chat content. Do NOT continue the conversation. EXTRACT only.
4. If the input contains casual chat, opinions, or greetings — SKIP them. Extract only work items.

Schema — output EXACTLY this structure:
{"worklog":{"title":"string","today":["string"],"decisions":["string"],"todo":["string"],"relatedProjects":["string"],"tags":["string"]},"handoff":{"title":"string","currentStatus":["string"],"nextActions":[{"action":"string","whyImportant":"string or null","priorityReason":"string or null","dueBy":"string or null","dependsOn":["string"] or null}],"actionBacklog":[{"action":"string","whyImportant":"string or null","priorityReason":"string or null","dueBy":"string or null","dependsOn":["string"] or null}],"decisions":[{"decision":"string","rationale":"string or null"}],"blockers":["string"],"constraints":["string"]}}

worklog field rules:
- title: 1 short phrase summarizing the main work topic
- today: 3-8 specific action items with file names, values, parameters
- decisions: ONE decision per bullet. Only items with explicit commitment markers. Empty [] if none.
- todo: Only next actions the user explicitly committed to. Empty [] if none.
- relatedProjects: Actual project/product names being built. Exclude tool names (ChatGPT, VS Code). Empty [] if none.
- tags: 4-7 tags matching input language. Category (development, UI, bugfix / 開発, UI, バグ修正) + Topic (React, Supabase). Keep proper nouns as-is.

handoff field rules:
- title: reuse worklog title
- currentStatus: PROJECT STATE right now. 3-5 bullets. ONLY present-tense.
- nextActions (immediate only, max 4): Blocking tasks only. Non-blocking → actionBacklog. whyImportant: infer from context (what depends on this?). priorityReason: infer ordering signal. Both should be filled when possible.
- actionBacklog (max 7): Important but not blocking now. Same format. whyImportant: why is this in the backlog?
- decisions (active only, max 6): Still-active decisions only. Each {"decision":"string","rationale":"string or null"}.
- blockers: Risks or issues still unresolved at end. 0-3 bullets. Empty [] if none.
- constraints: Stable rules. 0-3 bullets.
- Do NOT output handoffMeta or resumeChecklist — those are generated at final merge.

Language: Match input language. Japanese input → Japanese output. English → English.`;

// =============================================================================
// Chunk splitting — mode-aware
// =============================================================================

// Chunk targets per provider — Claude has strict input token limits
const CHUNK_TARGETS = {
  anthropic: { worklog: 12_000, handoff: 10_000 },
  gemini:    { worklog: 60_000, handoff: 50_000 },
  openai:    { worklog: 30_000, handoff: 25_000 },
} as const;

function getChunkTargets() {
  const provider = getActiveProvider();
  return CHUNK_TARGETS[provider] ?? CHUNK_TARGETS.gemini;
}

function splitIntoChunks(text: string, chunkTarget: number): string[] {
  const fileSeparator = /(?=--- FILE: .+ ---\n)/g;
  const segments = text.split(fileSeparator).filter((s) => s.trim());

  if (segments.length > 1) {
    return groupSegments(segments, chunkTarget);
  }

  const paragraphs = text.split(/\n{2,}/);
  return groupSegments(paragraphs.map((p) => p + '\n\n'), chunkTarget);
}

/** Hard cap: no single chunk may exceed this in extract phase */
const EXTRACT_MAX_CHARS = 60_000;

function groupSegments(segments: string[], target: number): string[] {
  // First pass: split any oversized segment at line boundaries
  const split: string[] = [];
  for (const seg of segments) {
    if (seg.length <= EXTRACT_MAX_CHARS) {
      split.push(seg);
    } else {
      // Force-split at newlines to stay under the cap
      const lines = seg.split('\n');
      let buf = '';
      for (const line of lines) {
        if (buf.length + line.length + 1 > EXTRACT_MAX_CHARS && buf.length > 0) {
          split.push(buf);
          buf = line + '\n';
        } else {
          buf += line + '\n';
        }
      }
      if (buf.trim()) split.push(buf);
    }
  }

  // Second pass: group small segments up to target size
  const chunks: string[] = [];
  let current = '';

  for (const seg of split) {
    if (seg.length > target * 1.5 && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    if (current.length + seg.length > target && current.length > 0) {
      chunks.push(current.trim());
      current = seg;
    } else {
      current += seg;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// =============================================================================
// Language detection
// =============================================================================

function detectLanguage(text: string): 'ja' | 'en' {
  const jaPattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g;
  const jaMatches = text.match(jaPattern);
  const jaRatio = (jaMatches?.length ?? 0) / text.length;
  return jaRatio > 0.1 ? 'ja' : 'en';
}

// =============================================================================
// JSON extraction
// =============================================================================

function extractJson(raw: string): string {
  // 1. Strip markdown code fences (handle ```json ... ``` wrapping)
  let stripped = raw;
  stripped = stripped.replace(/^[\s\S]*?```json\s*/i, '');
  stripped = stripped.replace(/```\s*/g, '');
  stripped = stripped.trim();

  // 2. Find first '{' and its matching '}'  via bracket counting
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
// Fallback reformatter — sends prose back to model to get JSON
// =============================================================================

async function reformatToJson(
  apiKey: string,
  proseText: string,
  schemaHint: string,
): Promise<PartialResult> {
  if (import.meta.env.DEV) console.warn(`[Reformat Fallback] Sending ${proseText.length} chars of prose back for JSON conversion`);

  const rawText = await callProvider({
    apiKey,
    system: 'You convert text into structured JSON. Output ONLY a valid JSON object. No prose, no explanation, no markdown.',
    userMessage: `Convert the following text into the required JSON schema. Output JSON only.\n\nRequired schema:\n${schemaHint}\n\nText to convert:\n${proseText}`,
    maxTokens: 8192,
  });

  const jsonText = extractJson(rawText);
  return JSON.parse(jsonText) as PartialResult;
}

/** Lightweight local JSON repair — fixes common model output issues without API call */
function tryRepairJson(raw: string): PartialResult | null {
  let text = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Find the first '{'
  const start = text.indexOf('{');
  if (start === -1) return null;
  text = text.slice(start);

  // Strip trailing prose after the last '}'
  const lastBrace = text.lastIndexOf('}');
  if (lastBrace === -1) {
    // No closing brace — try adding one
    text = text + '}';
  } else {
    text = text.slice(0, lastBrace + 1);
  }

  // Fix trailing commas before } or ]
  text = text.replace(/,\s*([}\]])/g, '$1');

  // Fix unescaped newlines inside string values
  text = text.replace(/:\s*"([^"]*)\n([^"]*)"/g, (_m, a, b) => `: "${a}\\n${b}"`);

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as PartialResult;
    }
  } catch { /* repair failed */ }
  return null;
}

// Detect schema type from system prompt to provide the right hint
function extractSchemaHint(system: string): string {
  const match = system.match(/Schema:\s*\n(\{[\s\S]*?\n\})/);
  return match ? match[1] : '{ "title": "string" }';
}

// =============================================================================
// API call — returns raw parsed JSON
// =============================================================================

async function callApiRaw(
  apiKey: string,
  system: string,
  userMessage: string,
  maxTokens = 8192,
  skipReformat = false,
  onStream?: StreamCallback,
): Promise<PartialResult> {
  const req = { apiKey, system, userMessage, maxTokens };
  const rawText = onStream
    ? await callProviderStream(req, onStream)
    : await callProvider(req);

  // Step 1: Try local JSON repair first (no API call)
  const repaired = tryRepairJson(rawText);
  if (repaired) return repaired;

  // Step 2: Detect non-JSON — no '{' at all, model returned prose
  const firstBrace = rawText.indexOf('{');
  if (firstBrace === -1) {
    // Fallback: ask the model to convert prose into JSON (skip for long handoff to save API calls)
    if (!skipReformat) {
      try {
        const schemaHint = extractSchemaHint(system);
        return await reformatToJson(apiKey, rawText, schemaHint);
      } catch {
        // reformat fallback failed
      }
    }
    throw new Error('[Non-JSON Response]');
  }

  // Step 3: Has '{' but extractJson / JSON.parse failed
  try {
    const jsonText = extractJson(rawText);
    return JSON.parse(jsonText) as PartialResult;
  } catch {
    const stripped = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    const hasCloseBrace = stripped.lastIndexOf('}') > stripped.indexOf('{');
    if (!hasCloseBrace) {
      throw new Error('[Truncated]');
    }
    // Malformed JSON — try reformat fallback (skip for long handoff)
    if (!skipReformat) {
      try {
        const schemaHint = extractSchemaHint(system);
        return await reformatToJson(apiKey, rawText, schemaHint);
      } catch {
        // reformat fallback failed
      }
    }
    throw new Error('[Parse Error]');
  }
}

// =============================================================================
// Result converters
// =============================================================================

function toWorklog(raw: PartialResult): TransformResult {
  return {
    title: (raw.title as string) || 'Untitled',
    today: (raw.today as string[]) || [],
    decisions: (raw.decisions as string[]) || [],
    todo: (raw.todo as string[]) || [],
    relatedProjects: (raw.relatedProjects as string[]) || [],
    tags: (raw.tags as string[]) || [],  // may be empty from simplified schema
  };
}

function toHandoff(raw: PartialResult): HandoffResult {
  const completed = (raw.completed as string[]) || [];
  const decisions = (raw.decisions as string[]) || [];
  const decisionRationales = Array.isArray(raw.decisionRationales)
    ? (raw.decisionRationales as DecisionWithRationale[])
    : undefined;
  const rawNextActions = (raw.nextActions as unknown[]) || [];
  let { nextActions, nextActionItems } = normalizeNextActions(rawNextActions);
  const resumeChecklist = normalizeResumeChecklist(raw.resumeChecklist);
  let actionBacklog = normalizeActionBacklog(raw.actionBacklog);
  const handoffMeta = normalizeHandoffMeta(raw.handoffMeta);
  if (import.meta.env.DEV) {
    console.log('[Chunk toHandoff] raw resumeChecklist:', JSON.stringify(raw.resumeChecklist));
    console.log('[Chunk toHandoff] normalized resumeChecklist:', JSON.stringify(resumeChecklist));
    console.log('[Chunk toHandoff] raw handoffMeta:', JSON.stringify(raw.handoffMeta));
    console.log('[Chunk toHandoff] normalized handoffMeta:', JSON.stringify(handoffMeta));
    console.log('[Chunk toHandoff] nextActionItems count:', nextActionItems.length, 'actionBacklog count:', actionBacklog.length);
  }
  // Enforce max 4 nextActions — overflow goes to actionBacklog
  if (nextActionItems.length > 4) {
    const overflow = nextActionItems.slice(4);
    nextActionItems = nextActionItems.slice(0, 4);
    nextActions = nextActionItems.map(i => i.action);
    actionBacklog = [...overflow, ...actionBacklog].slice(0, 7);
  }
  if (import.meta.env.DEV) {
    console.log('[Chunk toHandoff] AFTER cap: nextActionItems:', nextActionItems.length, 'actionBacklog:', actionBacklog.length);
  }
  // resumeContext: derived from resumeChecklist, fallback to raw
  let resumeContext: string[];
  if (resumeChecklist.length > 0) {
    resumeContext = resumeChecklist.map(r => r.action);
  } else if (typeof raw.resumeContext === 'string') {
    resumeContext = raw.resumeContext.trim() ? [raw.resumeContext.trim()] : [];
  } else if (Array.isArray(raw.resumeContext)) {
    resumeContext = raw.resumeContext as string[];
  } else {
    resumeContext = [];
  }
  return {
    title: (raw.title as string) || 'Untitled',
    handoffMeta,
    currentStatus: (raw.currentStatus as string[]) || [],
    resumeChecklist,
    resumeContext,
    nextActions,
    nextActionItems,
    actionBacklog: actionBacklog.length > 0 ? actionBacklog : undefined,
    completed,
    blockers: filterResolvedBlockers((raw.blockers as string[]) || [], completed, decisions),
    decisions,
    decisionRationales,
    constraints: (raw.constraints as string[]) || [],
    tags: (raw.tags as string[]) || [],
  };
}

// =============================================================================
// Mode-specific config
// =============================================================================

interface ModeConfig {
  extractPrompt: string;
  extractInstruction: string;
  chunkTarget: number;
  extractMaxTokens: number;
  skipReformatFallback: boolean; // skip prose-to-JSON reformat call (saves API calls)
}

// =============================================================================
// Size tiers: normal / long / extralong
// =============================================================================

export type SizeMode = 'normal' | 'long' | 'extralong';

const LONG_THRESHOLD = 120_000;
const EXTRALONG_THRESHOLD = 200_000;

export function getSizeMode(sourceLength: number): SizeMode {
  if (sourceLength > EXTRALONG_THRESHOLD) return 'extralong';
  if (sourceLength > LONG_THRESHOLD) return 'long';
  return 'normal';
}

// =============================================================================
// Local merge — combine partial results in JS, no API call
// =============================================================================

/** @deprecated Use dedupStrings from utils/decisions instead — kept as alias */
function dedup(arr: string[]): string[] {
  // Filter non-strings first (AI may return objects), then deduplicate
  return dedupStrings(arr.filter((s): s is string => typeof s === 'string'));
}

function collectStrings(partials: PartialResult[], key: string): string[] {
  return partials.flatMap((p) => {
    const v = p[key];
    if (!Array.isArray(v)) return [];
    // Coerce non-string items (e.g. {text:"..."} objects from AI) to strings
    return v.map((item) =>
      typeof item === 'string' ? item
      : typeof item === 'object' && item !== null && 'text' in item ? String((item as Record<string, unknown>).text)
      : String(item)
    ).filter((s) => s && s !== 'undefined' && s !== 'null' && s !== '[object Object]');
  });
}

/** Flatten combined "both" partials — extract nested worklog/handoff fields to top level */
function flattenBothPartials(partials: PartialResult[]): PartialResult[] {
  return partials.map((p) => {
    const w = p.worklog as PartialResult | undefined;
    const h = p.handoff as PartialResult | undefined;
    if (!w && !h) return p; // already flat
    return {
      title: w?.title || h?.title || p.title,
      today: w?.today, decisions: w?.decisions, todo: w?.todo,
      relatedProjects: w?.relatedProjects, tags: w?.tags || h?.tags,
      currentStatus: h?.currentStatus, nextActions: h?.nextActions,
      nextActionItems: h?.nextActionItems, actionBacklog: h?.actionBacklog,
      completed: h?.completed, blockers: h?.blockers,
      constraints: h?.constraints, resumeContext: h?.resumeContext,
      // Pass handoff decisions as decisionRationales (they may be objects from chunk prompts)
      decisionRationales: h?.decisionRationales || h?.decisions,
    } as PartialResult;
  });
}

/** Take items from the last chunk that has non-empty values for the given key */
function collectLastChunk(partials: PartialResult[], key: string): string[] {
  for (let i = partials.length - 1; i >= 0; i--) {
    const v = partials[i][key];
    if (Array.isArray(v) && v.length > 0) return v as string[];
    if (typeof v === 'string' && v.trim()) return [v];
  }
  return [];
}

/** Union two nullable string arrays, deduplicating. Returns null if both are null/empty. */
function mergeStringArrays(a: string[] | null | undefined, b: string[] | null | undefined): string[] | null {
  const combined = [...(a || []), ...(b || [])];
  if (combined.length === 0) return null;
  return [...new Set(combined)];
}

function localMerge(partials: PartialResult[], isBothMode = false): PartialResult {
  const flat = isBothMode ? flattenBothPartials(partials) : partials;
  // title: take the last non-empty (latest state)
  const title = [...flat].reverse().find((p) => p.title && String(p.title).trim())?.title || 'Untitled';

  const merged: PartialResult = {
    title,
    // Worklog fields — collect from all chunks (均等マージ)
    today:           dedup(collectStrings(flat, 'today')),
    decisions:       dedup(collectStrings(flat, 'decisions')),
    todo:            dedup(collectStrings(flat, 'todo')),
    relatedProjects: dedup(collectStrings(flat, 'relatedProjects')),
    tags:            dedup(collectStrings(flat, 'tags')),
    // Handoff: last-chunk-wins for state/resume (末尾が最新状態)
    currentStatus:   collectLastChunk(flat, 'currentStatus'),
    nextActions:     [],  // populated below by mergeNextActionItems
    resumeContext:   collectLastChunk(flat, 'resumeContext'),
    // Handoff: collect from all chunks for accumulated items (均等マージ)
    completed:       dedup(collectStrings(flat, 'completed')),
    blockers:        dedup(collectStrings(flat, 'blockers')),
    constraints:     dedup(collectStrings(flat, 'constraints')),
  };

  // Merge decisionRationales from all chunks, deduplicate by decision text
  // Chunks may return decisions as objects (new format) — normalize to decisionRationales
  const allRationales: DecisionWithRationale[] = [];
  for (const chunk of flat) {
    // Check explicit decisionRationales first
    const dr = chunk.decisionRationales;
    if (Array.isArray(dr)) {
      allRationales.push(...(dr as DecisionWithRationale[]));
    }
    // Also check decisions array — may contain {decision, rationale} objects from chunk prompts
    const decs = chunk.decisions;
    if (Array.isArray(decs)) {
      for (const item of decs) {
        if (typeof item === 'object' && item !== null && 'decision' in (item as Record<string, unknown>)) {
          const obj = item as Record<string, unknown>;
          allRationales.push({
            decision: String(obj.decision || ''),
            rationale: typeof obj.rationale === 'string' ? obj.rationale : null,
          });
        }
      }
    }
  }
  merged.decisionRationales = dedupDecisions(allRationales);
  // Backward compat: populate legacy decisions from merged decisionRationales
  if (allRationales.length > 0) {
    merged.decisions = (merged.decisionRationales as DecisionWithRationale[]).map(dr => dr.decision);
  }

  // Merge nextActionItems across chunks: action-level merge, latest chunk order wins
  // Earlier chunks fill in missing metadata; dependsOn is union + dedup
  {
    const allChunkItems: { items: NextActionItem[]; chunkIndex: number }[] = [];
    for (let ci = 0; ci < flat.length; ci++) {
      const raw = flat[ci].nextActions;
      if (Array.isArray(raw) && raw.length > 0) {
        const { nextActionItems: items } = normalizeNextActions(raw as unknown[]);
        allChunkItems.push({ items, chunkIndex: ci });
      }
    }
    // Build a map keyed by action text; later chunks override earlier ones
    const actionMap = new Map<string, { item: NextActionItem; chunkIndex: number }>();
    for (const { items, chunkIndex } of allChunkItems) {
      for (const item of items) {
        const key = item.action;
        const existing = actionMap.get(key);
        if (existing) {
          // Merge: latest wins for scalar fields, earlier fills gaps
          const merged_item: NextActionItem = {
            action: key,
            whyImportant: item.whyImportant ?? existing.item.whyImportant,
            priorityReason: item.priorityReason ?? existing.item.priorityReason,
            dueBy: item.dueBy ?? existing.item.dueBy,
            dependsOn: mergeStringArrays(existing.item.dependsOn, item.dependsOn),
          };
          actionMap.set(key, { item: merged_item, chunkIndex });
        } else {
          actionMap.set(key, { item: { ...item }, chunkIndex });
        }
      }
    }
    // Order: use the latest chunk that has nextActions, preserve its order, then append earlier-only items
    // latestChunkIndex used for ordering reference
    void (allChunkItems.length > 0 ? allChunkItems[allChunkItems.length - 1].chunkIndex : -1);
    const latestActions = allChunkItems.length > 0 ? allChunkItems[allChunkItems.length - 1].items.map(i => i.action) : [];
    const orderedItems: NextActionItem[] = [];
    const seen = new Set<string>();
    // First: items in latest chunk order
    for (const action of latestActions) {
      const entry = actionMap.get(action);
      if (entry) { orderedItems.push(entry.item); seen.add(action); }
    }
    // Then: items from earlier chunks not in latest
    for (const [action, entry] of actionMap) {
      if (!seen.has(action)) { orderedItems.push(entry.item); }
    }
    merged.nextActionItems = orderedItems;
    merged.nextActions = orderedItems.map(i => i.action);
  }

  // Merge actionBacklog across chunks (same action-level merge as nextActionItems)
  {
    const allBacklogItems: { items: NextActionItem[]; chunkIndex: number }[] = [];
    for (let ci = 0; ci < flat.length; ci++) {
      const raw = flat[ci].actionBacklog;
      if (Array.isArray(raw) && raw.length > 0) {
        const items = normalizeActionBacklog(raw);
        allBacklogItems.push({ items, chunkIndex: ci });
      }
    }
    const backlogMap = new Map<string, NextActionItem>();
    for (const { items } of allBacklogItems) {
      for (const item of items) {
        const existing = backlogMap.get(item.action);
        if (existing) {
          backlogMap.set(item.action, {
            action: item.action,
            whyImportant: item.whyImportant ?? existing.whyImportant,
            priorityReason: item.priorityReason ?? existing.priorityReason,
            dueBy: item.dueBy ?? existing.dueBy,
            dependsOn: mergeStringArrays(existing.dependsOn, item.dependsOn),
          });
        } else {
          backlogMap.set(item.action, { ...item });
        }
      }
    }
    // Latest chunk order for backlog too
    const latestBacklog = allBacklogItems.length > 0 ? allBacklogItems[allBacklogItems.length - 1].items.map(i => i.action) : [];
    const orderedBacklog: NextActionItem[] = [];
    const seenBacklog = new Set<string>();
    for (const action of latestBacklog) {
      const entry = backlogMap.get(action);
      if (entry) { orderedBacklog.push(entry); seenBacklog.add(action); }
    }
    for (const [action, entry] of backlogMap) {
      if (!seenBacklog.has(action)) orderedBacklog.push(entry);
    }
    if (orderedBacklog.length > 0) merged.actionBacklog = orderedBacklog.slice(0, 7);
  }

  // resumeContext/resumeChecklist/handoffMeta are NOT merged from chunks —
  // they are generated by final summarization after localMerge

  // For "both" mode, reconstruct nested structure so processBoth can split it
  if (isBothMode) {
    merged.worklog = {
      title: merged.title,
      today: merged.today, decisions: merged.decisions,
      todo: merged.todo, relatedProjects: merged.relatedProjects, tags: merged.tags,
    } as PartialResult;
    merged.handoff = {
      title: merged.title,
      currentStatus: merged.currentStatus, nextActions: merged.nextActions,
      nextActionItems: merged.nextActionItems, actionBacklog: merged.actionBacklog,
      completed: merged.completed, blockers: merged.blockers,
      decisions: merged.decisions, decisionRationales: merged.decisionRationales,
      constraints: merged.constraints,
      tags: merged.tags,
    } as PartialResult;
  }

  return merged;
}

// Retry config
const RETRY_DELAY_429 = 5;   // 429 fallback when no Retry-After header
const RETRY_DELAY_503 = 2;   // 503 server overload — short retry
const RETRY_MAX = 5;

type ExtractMode = OutputMode | 'both';

function getModeConfig(mode: ExtractMode, sourceLength: number): ModeConfig {
  const tier = getSizeMode(sourceLength);

  const targets = getChunkTargets();

  const handoffBase = {
    extractPrompt: HANDOFF_EXTRACT_PROMPT,
    extractInstruction: 'Extract restart info from the chat below. Output the JSON object ONLY. First character must be {. Last character must be }.',
    chunkTarget: targets.handoff,
    extractMaxTokens: 2048,
  };

  const worklogBase = {
    extractPrompt: WORKLOG_EXTRACT_PROMPT,
    extractInstruction: 'Extract work items from the chat below. Output the JSON object ONLY. First character must be {. Last character must be }.',
    chunkTarget: targets.worklog,
    extractMaxTokens: 4096,
  };

  const bothBase = {
    extractPrompt: BOTH_EXTRACT_PROMPT,
    extractInstruction: 'Extract both worklog AND handoff from the chat below into a single JSON object. First character must be {. Last character must be }.',
    chunkTarget: targets.worklog, // use worklog (smaller) target for safety
    extractMaxTokens: 8192,       // larger output needed for combined schema
  };

  const jsonOnlyInstruction = 'Output the JSON object ONLY. First character must be {. Last character must be }.';

  if (mode === 'both') {
    return { ...bothBase, skipReformatFallback: false };
  }

  if (mode === 'handoff') {
    if (tier === 'extralong') {
      return { ...handoffBase,
        extractPrompt: HANDOFF_EXTRACT_ULTRA_PROMPT,
        extractInstruction: jsonOnlyInstruction,
        chunkTarget: 35_000,
        extractMaxTokens: 2048,
        skipReformatFallback: true };
    }
    if (tier === 'long') {
      return { ...handoffBase,
        extractPrompt: HANDOFF_EXTRACT_ULTRA_PROMPT,
        extractInstruction: jsonOnlyInstruction,
        chunkTarget: 30_000,
        extractMaxTokens: 2048,
        skipReformatFallback: true };
    }
    return { ...handoffBase, skipReformatFallback: false };
  }

  // Worklog
  return { ...worklogBase, skipReformatFallback: false };
}

// Expose chunk targets for Workspace.tsx to compute estimated chunks
export function getChunkTarget(mode: OutputMode): number {
  const targets = getChunkTargets();
  return mode === 'handoff' ? targets.handoff : targets.worklog;
}

// Expose concurrency for Workspace.tsx estimation
export function getEngineConcurrency(): number {
  return getActiveProvider() === 'anthropic' ? 1 : 2;
}

// =============================================================================
// Progress types
// =============================================================================

export interface EngineProgress {
  phase: 'extract' | 'merge' | 'completed' | 'consistency' | 'waiting' | 'paused' | 'summarization';
  current: number;
  total: number;
  savedCount: number;
  retryIn?: number;
  retryAttempt?: number;
  retryMax?: number;
  message: string;
  autoPaused?: boolean;  // true when auto-paused after max retries
  estimatedMinutes?: number;  // estimated total runtime in minutes
}

export type ProgressCallback = (p: EngineProgress) => void;

// =============================================================================
// Post-merge consistency check prompt
// =============================================================================

const COMPLETED_EXTRACT_PROMPT = `You extract completed work items from a chat log. Output ONLY valid JSON. No markdown. No explanation.

Schema: {"completed":["string"]}

WHAT TO INCLUDE — items that produced a DELIVERABLE or CHANGED STATE:
- Code/config actually written, modified, or deleted (file edits, function changes, bug fixes)
- Features actually implemented and working
- UI/UX changes actually applied
- Settings/values actually changed
- Documents/pages actually created as a final deliverable (e.g. landing page, README)

WHAT TO EXCLUDE — items with NO deliverable or state change:
- Investigation/analysis: "確認した", "特定した", "検討した", "調べた", "reviewed", "identified", "investigated"
- Preparation/planning: "指示を作成した", "依頼を作成した", "文章を作成した", "プロンプトを作成した", "drafted instructions", "wrote a prompt"
- Intermediate steps: anything done AS A MEANS to something else (e.g. "〇〇するために△△を調べた", "Claude Codeに送る指示を作った")
- Delegation: "〇〇を依頼した", "〇〇に送った", "asked someone to do X"
- Discussion/decision only: "〇〇に決めた" (decisions go elsewhere), "〇〇について話した"

KEY PRINCIPLE: Ask "did this produce a tangible output or change the state of the system?" If NO → exclude.

FORMAT:
- Each bullet = ONE specific action with file names, function names, values where mentioned.
- If there are 20+ qualifying items, output ALL of them. Never truncate.

Language: Match input. Japanese → Japanese (keep code terms in English). English → English.`;

const CONSISTENCY_CHECK_PROMPT = `You are a strict editor. You receive a merged handoff memo (JSON) that was assembled from multiple chunks. Your job is to clean it up and output the final, consistent version.

FIELD-SPECIFIC RULES:

"completed": Keep the most recent 50 items. If more than 50 exist, drop the oldest (items appearing earlier in the list). Do NOT drop items from currentStatus/nextActions/decisions to compensate.
"resumeContext": MANDATORY output. Copy "nextActions" as-is. Never output empty resumeContext.
"currentStatus": Latest state only. Present-tense. Target: 3-5 items. No count limit.
"nextActions": Latest tasks only. Future actions. No count limit.
"decisions": Keep all. No count limit.

CLEANUP RULES:

1. completed vs currentStatus SEPARATION:
   - Completed actions ("〜済み", "〜修正した", "fixed", "added", "implemented") → "completed". Remove from "currentStatus".
   - "currentStatus" = present-tense state ONLY.

2. DECISION QUALITY: Keep only technical judgments, architecture choices, policy changes. Remove task-level items.

3. blockers vs constraints SEPARATION:
   - "blockers" = temporary risks, concerns, gotchas, known bugs.
   - "constraints" = stable, ongoing rules (tech stack, budget, scope).

4. blockers vs completed CONTRADICTION CHECK — THIS IS THE HIGHEST PRIORITY RULE:
   You MUST cross-check EVERY blocker against the ENTIRE completed list before outputting.
   Process: For each blocker, scan all completed items. If ANY completed item addresses, resolves, fixes, or implements what the blocker describes → DELETE that blocker.
   Match semantically, not just by exact words:
     - "〜がない" / "〜is missing" / "no 〜" in blockers + "〜を実装した" / "〜を追加した" / "added 〜" / "implemented 〜" in completed → DELETE blocker
     - "〜が壊れている" / "〜is broken" in blockers + "〜を修正した" / "fixed 〜" in completed → DELETE blocker
     - "〜が不安定" / "〜is unstable" in blockers + "〜を安定化した" / "stabilized 〜" in completed → DELETE blocker
   If in doubt whether a completed item resolves a blocker, DELETE the blocker (err on the side of removal).
   After this check, only blockers with ZERO matching completed items may remain.

5. DEDUPLICATION: Same work in "completed" and "nextActions" → keep in "completed" only.

6. nextActions CLEANUP: Only future tasks. No risks (→ blockers), no constraints (→ constraints), no completed work (→ completed).

Output format: ONLY the cleaned JSON object. Same schema as input. No markdown. No explanation. Start with { end with }.`;

// =============================================================================
// Final summarization — generates session-wide handoffMeta, resumeChecklist,
// and compresses decisions to active-only (max 6).
// Runs post-merge as a parallel promise alongside completed + consistency.
// =============================================================================

const FINAL_SUMMARIZATION_PROMPT = `You are a session summarizer. You receive a merged handoff memo (JSON) assembled from multiple chunks. Your job is to generate three session-wide fields that require holistic context — they CANNOT be extracted per-chunk.

Output ONLY valid JSON with this exact schema:
{
  "handoffMeta": {
    "sessionFocus": "string or null",
    "whyThisSession": "string or null",
    "timePressure": "string or null"
  },
  "resumeChecklist": [
    {"action": "string", "whyNow": "string (REQUIRED)", "ifSkipped": "string (REQUIRED)"}
  ],
  "activeDecisions": [
    {"decision": "string", "rationale": "string (infer if not stated)"}
  ]
}

FIELD RULES:

handoffMeta — each field is 1 sentence max:
- sessionFocus: What was this session trying to advance? (1 sentence) null only if the session had no coherent focus.
- whyThisSession: Why is this work important right now? (1 sentence) Infer from context — what larger goal does this session serve? null only if truly unknowable.
- timePressure: What SPECIFIC phase, deadline, or dependency creates time pressure?
  GOOD: "Phase 3実装がリリースブランチ切り(3/15)までに必要"
  GOOD: "API migration must complete before v2 deprecation on April 1"
  BAD: "急ぎ", "重要", "urgent" (vague words alone — must state WHAT creates the pressure)
  INFERENCE ALLOWED: Convert weak expressions ("今週中に", "早めに", "〜の前に") into concrete phase statements using session context.
  Example: chat says "早めにやりたい" + session is about launch prep → "ローンチ前にこの機能完成が必要"
  null ONLY if no time pressure is mentioned or inferable at all.

resumeChecklist — max 3 items. These are the FIRST things the next person (or future you) should do when resuming:
- action: Use specific verbs — confirm, verify, decide, fix, implement, test, run. NOT just "確認する".
  GOOD: "chunkEngine.tsのfinalSummarizationPromiseがhandoffMeta/resumeChecklistを正しくマージ結果に反映しているかテスト実行で確認"
  BAD: "テストする", "確認する" (too vague)
- whyNow: MANDATORY — NEVER null. Why is this the first thing to do? What downstream task or decision depends on this being done first? Infer from context.
- ifSkipped: MANDATORY — NEVER null. What specific failure, delay, or wrong decision results from skipping this? Name the concrete consequence.
  GOOD: {"action": "テスト実行でPhase 3変更のリグレッションを確認", "whyNow": "formatHandoff.tsの構造変更がCopy Handoff出力に影響するため、デプロイ前に検証必須", "ifSkipped": "resumeChecklistが表示されない・actionBacklogがCopy Handoffに混入するバグが本番流出"}
  BAD: {"action": "テスト実行", "whyNow": null, "ifSkipped": null}

activeDecisions — max 6. ONLY decisions that are STILL ACTIVE and affect future work:
- Drop resolved, superseded, or one-time decisions
- rationale: Why was this decided? What was the alternative? Infer from context when not explicitly stated.
- If the input has decisionRationales, prefer those. If it only has decisions (string[]), infer rationale from context or set null.

Language: Match input. Japanese → Japanese (keep code terms in English). English → English.
No markdown. No explanation. Start with { end with }.`;

// =============================================================================
// Engine
// =============================================================================

export class ChunkEngine {
  private _paused = false;
  private _cancelled = false;
  private _pauseResolve: (() => void) | null = null;
  private _pausePromise: Promise<void> | null = null;
  /** Adaptive inter-chunk delay — starts low, grows on rate-limit hits */
  private _chunkDelay = 3;  // seconds, initial value
  private _onStream?: StreamCallback;

  get isPaused(): boolean { return this._paused; }
  get isCancelled(): boolean { return this._cancelled; }

  pause(): void {
    if (this._paused) return;
    this._paused = true;
    this._pausePromise = new Promise((r) => { this._pauseResolve = r; });
  }

  resume(): void {
    if (!this._paused) return;
    this._paused = false;
    this._pauseResolve?.();
    this._pausePromise = null;
    this._pauseResolve = null;
  }

  cancel(): void {
    this._cancelled = true;
    this.resume(); // unblock if paused
  }

  private async checkPause(onProgress: ProgressCallback, session: ChunkSession, current: number, total: number): Promise<void> {
    if (this._cancelled) throw new Error('[Cancelled]');
    if (this._paused) {
      const saved = Object.keys(session.partials).length;
      onProgress({
        phase: 'paused', current, total, savedCount: saved,
        message: `paused:${saved}`,
      });
      await this._pausePromise;
      if (this._cancelled) throw new Error('[Cancelled]');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Interruptible wait — checks cancel/pause every 200ms */
  private async waitInterruptible(ms: number): Promise<void> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (this._cancelled) throw new Error('[Cancelled]');
      if (this._paused) return; // exit immediately, caller will handle pause
      await this.sleep(Math.min(200, end - Date.now()));
    }
  }

  private async callWithRetry(
    apiKey: string,
    system: string,
    userMessage: string,
    onProgress: ProgressCallback,
    session: ChunkSession,
    current: number,
    total: number,
    maxTokens = 8192,
    skipReformat = false,
  ): Promise<PartialResult> {
    let effectiveMaxTokens = maxTokens;
    const label = `[Chunk ${current}/${total}]`;
    for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
      try {
        const result = await callApiRaw(apiKey, system, userMessage, effectiveMaxTokens, skipReformat, this._onStream);
        // Successful call — reduce delay toward minimum (adaptive cooldown)
        if (this._chunkDelay > 3) {
          this._chunkDelay = Math.max(3, this._chunkDelay * 0.7);
        }
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isRateLimit = msg.includes('[Rate Limit]') || msg.includes('[Overloaded]');
        // Extract API-requested retry delay from error message (e.g. "[Rate Limit:30]")
        const apiRetryMatch = msg.match(/\[Rate Limit:(\d+)\]/);
        const apiRetrySec = apiRetryMatch ? parseInt(apiRetryMatch[1], 10) : 0;
        // Adaptive: grow delay on rate limit
        if (isRateLimit) {
          this._chunkDelay = Math.min(30, this._chunkDelay * 2);
        }
        const isTruncated = msg.includes('[Truncated]');
        const isParseError = msg.includes('[Parse Error]');
        const isNonJson = msg.includes('[Non-JSON Response]');
        const isRetryable = isRateLimit || isTruncated || isParseError || isNonJson;

        // Truncated responses: bump maxTokens (up to 2 times)
        if (isTruncated && attempt < 2) {
          const prev = effectiveMaxTokens;
          effectiveMaxTokens = Math.min(Math.ceil(effectiveMaxTokens * 1.5), 8192);
          if (import.meta.env.DEV) console.warn(`${label} retry #${attempt + 1} after Truncated (maxTokens: ${prev}→${effectiveMaxTokens})`);
          await this.waitInterruptible(2000);
          continue;
        }

        // Non-JSON / Parse errors: quick retry (up to 2 times)
        if ((isNonJson || isParseError) && attempt < 2) {
          if (import.meta.env.DEV) console.warn(`${label} retry #${attempt + 1} after ${isNonJson ? 'Non-JSON' : 'Parse Error'} (delay=3s)`);
          await this.waitInterruptible(3000);
          continue;
        }

        // Rate limit / retryable errors: 429 uses Retry-After or 5s, 503 uses 2s
        if (isRetryable && attempt < RETRY_MAX) {
          const saved = Object.keys(session.partials).length;
          const is503 = msg.includes('[Overloaded]');
          const delaySec = apiRetrySec > 0 ? apiRetrySec : is503 ? RETRY_DELAY_503 : RETRY_DELAY_429;
          if (import.meta.env.DEV) console.warn(`${label} retry #${attempt + 1} after ${isRateLimit ? (is503 ? '503' : '429') : msg.slice(0, 30)} (delay=${delaySec}s${apiRetrySec > 0 ? ' from API' : ''})`);

          const waitEnd = Date.now() + delaySec * 1000;
          while (Date.now() < waitEnd) {
            if (this._cancelled) throw new Error('[Cancelled]');
            if (this._paused) {
              await this.checkPause(onProgress, session, current, total);
            }
            const secLeft = Math.ceil((waitEnd - Date.now()) / 1000);
            onProgress({
              phase: 'waiting', current, total, savedCount: saved,
              retryIn: secLeft, retryAttempt: attempt + 1, retryMax: RETRY_MAX,
              message: `waiting:${secLeft}`,
            });
            await this.sleep(Math.min(200, waitEnd - Date.now()));
          }
          continue;
        }

        // Retry budget exhausted — auto-pause so progress is preserved
        if (isRetryable) {
          const saved = Object.keys(session.partials).length;
          this._paused = true;
          this._pausePromise = new Promise((r) => { this._pauseResolve = r; });
          onProgress({
            phase: 'paused', current, total, savedCount: saved,
            message: `auto-paused:${saved}`,
            autoPaused: true,
          });
          await this._pausePromise;
          if (this._cancelled) throw new Error('[Cancelled]');
          return this.callWithRetry(apiKey, system, userMessage, onProgress, session, current, total, maxTokens, skipReformat);
        }
        throw err;
      }
    }
    throw new Error('Unexpected: retry loop exited without result.');
  }

  // --- Worklog processing (backward-compatible) ---

  async process(
    sourceText: string,
    apiKey: string,
    onProgress: ProgressCallback,
    onStream?: StreamCallback,
  ): Promise<TransformResult> {
    this._onStream = onStream;
    const raw = await this.processGeneric(sourceText, apiKey, onProgress, 'worklog');
    this._onStream = undefined;
    return toWorklog(raw);
  }

  // --- Handoff processing ---

  async processHandoff(
    sourceText: string,
    apiKey: string,
    onProgress: ProgressCallback,
    onStream?: StreamCallback,
  ): Promise<HandoffResult> {
    this._onStream = onStream;
    const raw = await this.processGeneric(sourceText, apiKey, onProgress, 'handoff');
    this._onStream = undefined;
    return toHandoff(raw);
  }

  // --- Combined "both" processing — single API call per chunk ---

  async processBoth(
    sourceText: string,
    apiKey: string,
    onProgress: ProgressCallback,
    onStream?: StreamCallback,
  ): Promise<BothResult> {
    this._onStream = onStream;
    const raw = await this.processGeneric(sourceText, apiKey, onProgress, 'both');
    this._onStream = undefined;

    // raw contains { worklog: {...}, handoff: {...} } from combined prompt
    const w = (raw as Record<string, unknown>).worklog as Record<string, unknown> | undefined;
    const h = (raw as Record<string, unknown>).handoff as Record<string, unknown> | undefined;

    const result = {
      worklog: toWorklog(w || raw),
      handoff: toHandoff(h || raw),
    };
    return result;
  }

  // --- Generic processing (shared pipeline) ---

  /** Max concurrent API calls — 1 for Claude (rate limit), 2 for others */
  private static getConcurrency(): number {
    return getActiveProvider() === 'anthropic' ? 1 : 2;
  }

  private async processGeneric(
    sourceText: string,
    apiKey: string,
    onProgress: ProgressCallback,
    mode: ExtractMode,
  ): Promise<PartialResult> {
    this._paused = false;
    this._cancelled = false;
    const config = getModeConfig(mode, sourceText.length);
    const hash = computeSourceHash(sourceText);
    let session = await loadSession(hash);
    const freshChunks = splitIntoChunks(sourceText, config.chunkTarget);

    // Resume or create new session
    if (session && session.chunks.length === freshChunks.length && session.status === 'active') {
      // Resume — reuse stored chunks
    } else {
      if (session) await deleteSession(hash);
      session = {
        sourceHash: hash,
        chunks: freshChunks,
        partials: {},
        status: 'active',
        createdAt: Date.now(),
      };
      await saveSession(session);
    }

    const chunks = session.chunks;
    const pref = getLang();
    const lang = pref !== 'auto' ? pref : detectLanguage(sourceText.slice(0, 5000));
    const CHUNK_LANG_MAP: Record<string, string> = {
      ja: 'Output in Japanese. Keep file names and code terms in English.',
      en: 'Output in English.',
      es: 'Output in Spanish. Keep file names and code terms in English.',
      fr: 'Output in French. Keep file names and code terms in English.',
      de: 'Output in German. Keep file names and code terms in English.',
      zh: 'Output in Simplified Chinese. Keep file names and code terms in English.',
      ko: 'Output in Korean. Keep file names and code terms in English.',
      pt: 'Output in Portuguese. Keep file names and code terms in English.',
    };
    const langInstruction = CHUNK_LANG_MAP[lang] || CHUNK_LANG_MAP.en;

    // --- Extract phase — parallel with concurrency limit ---
    // Build work items (skip already-completed chunks)
    const workItems: number[] = [];
    for (let i = 0; i < chunks.length; i++) {
      if (!session.partials[String(i)]) {
        workItems.push(i);
      }
    }

    const completedCount = chunks.length - workItems.length;

    // Report initial progress
    onProgress({
      phase: 'extract', current: completedCount, total: chunks.length,
      savedCount: completedCount,
      message: `extract:${completedCount}:${chunks.length}`,
    });

    // Process in parallel with concurrency limit
    let finished = completedCount;
    const processChunk = async (i: number): Promise<void> => {
      if (this._cancelled) throw new Error('[Cancelled]');
      if (this._paused) {
        await this.checkPause(onProgress, session, finished, chunks.length);
      }

      const userMsg = `${langInstruction}\n\nPart ${i + 1}/${chunks.length}. ${config.extractInstruction}\n\n---BEGIN CHAT LOG---\n${chunks[i]}\n---END CHAT LOG---\n\nRemember: Output ONLY the JSON object. Start with { and end with }. No other text.`;
      const result = await this.callWithRetry(
        apiKey, config.extractPrompt,
        userMsg,
        onProgress, session, i + 1, chunks.length, config.extractMaxTokens,
        config.skipReformatFallback,
      );
      session.partials[String(i)] = result;
      finished++;
      await saveSession(session);

      onProgress({
        phase: 'extract', current: finished, total: chunks.length,
        savedCount: finished,
        message: `extract:${finished}:${chunks.length}`,
      });

      // Adaptive inter-chunk cooldown for Claude to avoid TPM rate limits
      if (getActiveProvider() === 'anthropic' && finished < chunks.length) {
        const jitter = (Math.random() - 0.5) * 2; // ±1s jitter
        const delaySec = Math.max(1, this._chunkDelay + jitter);
        onProgress({
          phase: 'waiting', current: finished, total: chunks.length,
          savedCount: finished,
          message: `waiting:${Math.round(delaySec)}`,
        });
        await new Promise(r => setTimeout(r, delaySec * 1000));
      }
    };

    // Concurrency-limited parallel execution
    if (workItems.length > 0) {
      await this.runParallel(workItems, processChunk, ChunkEngine.getConcurrency());
    }

    // Collect all partials in order — filter out any undefined entries from corrupted cache
    const allPartials = chunks.map((_, i) => session!.partials[String(i)]).filter(Boolean);

    if (allPartials.length === 1) {
      // Single chunk — still need completed extraction + final summarization for handoff/both
      if (mode === 'handoff' || mode === 'both') {
        try {
          // Build compact input from the single partial (NOT full sourceText)
          const partial = allPartials[0];
          const singlePartialText = Object.entries(partial)
            .filter(([key]) => key !== 'title' && key !== 'worklog' && key !== 'handoff')
            .map(([key, val]) => {
              if (Array.isArray(val) && val.length > 0) return `${key}: ${val.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(' / ')}`;
              if (typeof val === 'string' && val.trim()) return `${key}: ${val}`;
              return null;
            }).filter(Boolean).join('\n');

          // 1. Completed extraction
          const completedPromise = (async (): Promise<string[]> => {
            onProgress({
              phase: 'completed', current: 1, total: 2, savedCount: finished,
              message: 'completed:extract',
            });
            try {
              const sLang = detectLanguage(singlePartialText.slice(0, 3000));
              const sLangHint = sLang === 'ja'
                ? 'Input is Japanese. Output in Japanese (keep code terms in English).'
                : 'Output in English.';
              const cResult = await callApiRaw(
                apiKey,
                COMPLETED_EXTRACT_PROMPT,
                `${sLangHint}\n\nExtract ALL completed work from this chunk extraction result:\n\n${singlePartialText}`,
                4096,
                true,
              );
              const cItems = (cResult as Record<string, unknown>).completed;
              if (Array.isArray(cItems) && cItems.length > 0) {
                const MAX_COMPLETED = 50;
                return cItems.length > MAX_COMPLETED ? (cItems.slice(-MAX_COMPLETED) as string[]) : (cItems as string[]);
              }
              return [];
            } catch {
              return [];
            }
          })();

          // 2. Final summarization — handoffMeta + resumeChecklist + active decisions
          const finalSumPromise = (async (): Promise<PartialResult | null> => {
            onProgress({
              phase: 'summarization', current: 2, total: 2, savedCount: finished,
              message: 'summarization:final',
            });
            try {
              const handoffData = mode === 'both'
                ? (partial as Record<string, unknown>).handoff as PartialResult | undefined ?? partial
                : partial;
              const summaryInput: Record<string, unknown> = {};
              for (const key of ['currentStatus', 'nextActions', 'nextActionItems', 'actionBacklog', 'blockers', 'completed', 'decisions', 'decisionRationales', 'constraints', 'title'] as const) {
                if ((handoffData as Record<string, unknown>)[key] != null) {
                  summaryInput[key] = (handoffData as Record<string, unknown>)[key];
                }
              }
              const inputJson = JSON.stringify(summaryInput);
              const fsLang = detectLanguage(inputJson.slice(0, 3000));
              const fsLangHint = fsLang === 'ja'
                ? 'Input is Japanese. Output in Japanese (keep code terms in English).'
                : 'Output in English.';
              return await callApiRaw(
                apiKey,
                FINAL_SUMMARIZATION_PROMPT,
                `${fsLangHint}\n\nGenerate session-wide summary fields from this merged handoff:\n\n${inputJson}`,
                4096,
                true,
              );
            } catch {
              return null;
            }
          })();

          const [completedItems, finalSummary] = await Promise.all([completedPromise, finalSumPromise]);

          // Apply completed
          if (completedItems.length > 0) {
            allPartials[0].completed = completedItems;
            if (mode === 'both') {
              const h = (allPartials[0] as Record<string, unknown>).handoff as PartialResult | undefined;
              if (h) h.completed = completedItems;
            }
          }

          // Apply final summarization
          if (finalSummary) {
            const fs = finalSummary as Record<string, unknown>;
            const meta = normalizeHandoffMeta(fs.handoffMeta);
            const checklist = normalizeResumeChecklist(fs.resumeChecklist);
            const derivedResumeContext = checklist.map(item => item.action);

            let activeDecisions: DecisionWithRationale[] | undefined;
            if (Array.isArray(fs.activeDecisions) && fs.activeDecisions.length > 0) {
              activeDecisions = dedupDecisions(
                (fs.activeDecisions as Record<string, unknown>[])
                  .filter(d => typeof d === 'object' && d !== null && 'decision' in d)
                  .map(d => ({
                    decision: String(d.decision || ''),
                    rationale: typeof d.rationale === 'string' ? d.rationale : null,
                  }))
              ).slice(0, 6);
            }

            const applyToTarget = (target: PartialResult) => {
              target.handoffMeta = meta;
              target.resumeChecklist = checklist;
              target.resumeContext = derivedResumeContext;
              if (activeDecisions && activeDecisions.length > 0) {
                target.decisionRationales = activeDecisions;
                target.decisions = activeDecisions.map(d => d.decision);
              }
            };

            applyToTarget(allPartials[0]);
            if (mode === 'both') {
              const h = (allPartials[0] as Record<string, unknown>).handoff as PartialResult | undefined;
              if (h) applyToTarget(h);
            }

            if (import.meta.env.DEV) {
              console.log('[SingleChunk FinalSummarization] handoffMeta:', JSON.stringify(meta));
              console.log('[SingleChunk FinalSummarization] resumeChecklist:', JSON.stringify(checklist));
            }
          }
        } catch (err) {
          if (import.meta.env.DEV) console.warn('[SingleChunk] post-extraction failed:', err);
        }
      }
      await deleteSession(hash);
      return allPartials[0];
    }

    // --- Local merge (no API call) ---
    onProgress({
      phase: 'merge', current: 1, total: 1, savedCount: finished,
      message: 'merge:local',
    });
    let mergedResult: PartialResult = localMerge(allPartials, mode === 'both');

    // --- Post-merge: completed extraction + consistency check (handoff/both only) ---
    if (mode === 'handoff' || mode === 'both') {

      try {
        // Build compact input for completed extraction from chunk partials (NOT full sourceText)
        const partialsText = allPartials.map((p, i) => {
          const lines: string[] = [];
          for (const [key, val] of Object.entries(p)) {
            if (key === 'title' || key === 'worklog' || key === 'handoff') continue;
            if (Array.isArray(val) && val.length > 0) {
              lines.push(`${key}: ${val.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(' / ')}`);
            } else if (typeof val === 'string' && val.trim()) {
              lines.push(`${key}: ${val}`);
            }
          }
          return `[Chunk ${i + 1}]\n${lines.join('\n')}`;
        }).join('\n\n');
        // 1. Completed extraction — from chunk extraction results (compact)
        const completedPromise = (async (): Promise<string[]> => {
          onProgress({
            phase: 'completed', current: 1, total: 2, savedCount: finished,
            message: 'completed:extract',
          });
          try {
            const cLang = detectLanguage(partialsText.slice(0, 3000));
            const langHint = cLang === 'ja'
              ? 'Input is Japanese. Output in Japanese (keep code terms in English).'
              : 'Output in English.';
            const result = await callApiRaw(
              apiKey,
              COMPLETED_EXTRACT_PROMPT,
              `${langHint}\n\nExtract ALL completed work from these chunk extraction results:\n\n${partialsText}`,
              4096,
              true,
            );
            const items = (result as Record<string, unknown>).completed;
            if (Array.isArray(items) && items.length > 0) {
              return items as string[];
            }
            return [];
          } catch {
            return [];
          }
        })();

        // 2. Consistency check — on merged handoff (without completed, which comes from step 1)
        const consistencyPromise = (async (): Promise<PartialResult | null> => {
          onProgress({
            phase: 'consistency', current: 2, total: 2, savedCount: finished,
            message: 'consistency:check',
          });
          try {
            const handoffData = mode === 'both'
              ? (mergedResult as Record<string, unknown>).handoff as PartialResult | undefined
              : mergedResult;

            if (handoffData) {
              // Trim decisions to latest 10 to reduce output size and avoid token limit truncation
              const MAX_DECISIONS_FOR_CHECK = 10;
              const fullDecisions = (handoffData as PartialResult).decisions;
              let trimmedDecisions: string[] | undefined;
              if (Array.isArray(fullDecisions) && fullDecisions.length > MAX_DECISIONS_FOR_CHECK) {
                trimmedDecisions = fullDecisions.slice(-MAX_DECISIONS_FOR_CHECK);
              }
              const checkPayload = trimmedDecisions
                ? { ...handoffData, decisions: trimmedDecisions }
                : handoffData;
              const handoffJson = JSON.stringify(checkPayload);
              return await callApiRaw(
                apiKey,
                CONSISTENCY_CHECK_PROMPT,
                `Clean up and output the final handoff JSON:\n\n${handoffJson}`,
                8192,
                true,
              );
            }
            return null;
          } catch {
            return null;
          }
        })();

        // 3. Final summarization — handoffMeta + resumeChecklist + active decisions (session-wide)
        const finalSummarizationPromise = (async (): Promise<PartialResult | null> => {
          onProgress({
            phase: 'summarization', current: 3, total: 3, savedCount: finished,
            message: 'summarization:final',
          });
          try {
            const handoffData = mode === 'both'
              ? (mergedResult as Record<string, unknown>).handoff as PartialResult | undefined
              : mergedResult;
            if (!handoffData) return null;
            // Build compact payload: only fields needed for summarization
            const summaryInput: Record<string, unknown> = {};
            for (const key of ['currentStatus', 'nextActions', 'nextActionItems', 'actionBacklog', 'blockers', 'completed', 'decisions', 'decisionRationales', 'constraints', 'title'] as const) {
              if ((handoffData as Record<string, unknown>)[key] != null) {
                summaryInput[key] = (handoffData as Record<string, unknown>)[key];
              }
            }
            const inputJson = JSON.stringify(summaryInput);
            const sLang = detectLanguage(inputJson.slice(0, 3000));
            const langHint = sLang === 'ja'
              ? 'Input is Japanese. Output in Japanese (keep code terms in English).'
              : 'Output in English.';
            return await callApiRaw(
              apiKey,
              FINAL_SUMMARIZATION_PROMPT,
              `${langHint}\n\nGenerate session-wide summary fields from this merged handoff:\n\n${inputJson}`,
              4096,
              true,
            );
          } catch {
            return null;
          }
        })();

        // Await all three in parallel
        const [completedItems, checkedRaw, finalSummary] = await Promise.all([completedPromise, consistencyPromise, finalSummarizationPromise]);
        // Apply consistency check result — but keep original decisions (consistency check only received trimmed subset)
        if (checkedRaw) {
          const originalDecisions = mergedResult.decisions;
          if (mode === 'both') {
            (mergedResult as Record<string, unknown>).handoff = checkedRaw;
            mergedResult.currentStatus = (checkedRaw as PartialResult).currentStatus;
            mergedResult.nextActions = (checkedRaw as PartialResult).nextActions;
            mergedResult.blockers = (checkedRaw as PartialResult).blockers;
            mergedResult.constraints = (checkedRaw as PartialResult).constraints;
            mergedResult.resumeContext = (checkedRaw as PartialResult).resumeContext;
            // Restore original full decisions (not the trimmed version from consistency check)
            mergedResult.decisions = originalDecisions;
            const handoffRef = (mergedResult as Record<string, unknown>).handoff as PartialResult | undefined;
            if (handoffRef) handoffRef.decisions = originalDecisions;
          } else {
            mergedResult = checkedRaw;
            // Restore original full decisions
            mergedResult.decisions = originalDecisions;
          }
        }

        // Apply completed items (from dedicated extraction — overrides any partial completed data)
        // Keep only the most recent 50 items (last items = most recent in conversation order)
        if (completedItems.length > 0) {
          const MAX_COMPLETED = 50;
          const trimmed = completedItems.length > MAX_COMPLETED
            ? completedItems.slice(-MAX_COMPLETED)
            : completedItems;
          mergedResult.completed = trimmed;
          if (mode === 'both') {
            const handoff = (mergedResult as Record<string, unknown>).handoff as PartialResult | undefined;
            if (handoff) handoff.completed = trimmed;
          }
        }

        // Apply final summarization — handoffMeta, resumeChecklist, active decisions
        if (import.meta.env.DEV) {
          console.log('[FinalSummarization] raw result:', finalSummary ? JSON.stringify(finalSummary).slice(0, 500) : 'null');
        }
        if (finalSummary) {
          const fs = finalSummary as Record<string, unknown>;
          const meta = normalizeHandoffMeta(fs.handoffMeta);
          const checklist = normalizeResumeChecklist(fs.resumeChecklist);
          // Derive resumeContext from resumeChecklist
          const derivedResumeContext = checklist.map(item => item.action);

          // Compress decisions: use activeDecisions from final summarization (max 6)
          let activeDecisions: DecisionWithRationale[] | undefined;
          if (Array.isArray(fs.activeDecisions) && fs.activeDecisions.length > 0) {
            activeDecisions = dedupDecisions(
              (fs.activeDecisions as Record<string, unknown>[])
                .filter(d => typeof d === 'object' && d !== null && 'decision' in d)
                .map(d => ({
                  decision: String(d.decision || ''),
                  rationale: typeof d.rationale === 'string' ? d.rationale : null,
                }))
            ).slice(0, 6);
          }

          // Apply to mergedResult
          const applyToTarget = (target: PartialResult) => {
            target.handoffMeta = meta;
            target.resumeChecklist = checklist;
            target.resumeContext = derivedResumeContext;
            if (activeDecisions && activeDecisions.length > 0) {
              target.decisionRationales = activeDecisions;
              target.decisions = activeDecisions.map(d => d.decision);
            }
          };

          applyToTarget(mergedResult);
          if (mode === 'both') {
            const handoff = (mergedResult as Record<string, unknown>).handoff as PartialResult | undefined;
            if (handoff) applyToTarget(handoff);
          }
          if (import.meta.env.DEV) {
            console.log('[FinalSummarization] applied handoffMeta:', JSON.stringify(meta));
            console.log('[FinalSummarization] applied resumeChecklist:', JSON.stringify(checklist));
            if (activeDecisions) console.log('[FinalSummarization] applied activeDecisions:', activeDecisions.length);
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[chunkEngine] post-merge failed:', err);
      }

    }

    session.status = 'completed';
    await deleteSession(hash);
    return mergedResult;
  }

  /** Run tasks with a concurrency limit */
  private async runParallel<T>(
    items: T[],
    fn: (item: T) => Promise<void>,
    concurrency: number,
  ): Promise<void> {
    let index = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (index < items.length) {
        if (this._cancelled) throw new Error('[Cancelled]');
        const i = index++;
        await fn(items[i]);
      }
    });
    await Promise.all(workers);
  }
}
