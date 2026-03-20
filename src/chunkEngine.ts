/**
 * ChunkEngine — orchestrates chunked AI processing for large inputs.
 *
 * Splitting logic is co-located here, merging logic in chunkMerger.ts.
 * This file contains the engine class, mode config, and API call coordination.
 */

import type { TransformResult, HandoffResult, BothResult, OutputMode, DecisionWithRationale } from './types';
import type { ChunkSession, PartialResult } from './chunkDb';
import { computeSourceHash, loadSession, saveSession, deleteSession } from './chunkDb';
import { getLang } from './storage';
import { callProvider, callProviderStream, getActiveProvider } from './provider';
import type { StreamCallback } from './provider';
import { normalizeResumeChecklist, normalizeHandoffMeta, normalizeHandoffFields, detectLanguage, extractJson } from './transform';
import { dedupDecisions } from './utils/decisions';
import {
  CHUNK_HANDOFF_EXTRACT_PROMPT as HANDOFF_EXTRACT_PROMPT,
  CHUNK_HANDOFF_EXTRACT_ULTRA_PROMPT as HANDOFF_EXTRACT_ULTRA_PROMPT,
  CHUNK_BOTH_EXTRACT_PROMPT as BOTH_EXTRACT_PROMPT,
  CHUNK_COMPLETED_EXTRACT_PROMPT as COMPLETED_EXTRACT_PROMPT,
  CHUNK_CONSISTENCY_CHECK_PROMPT as CONSISTENCY_CHECK_PROMPT,
  CHUNK_FINAL_SUMMARIZATION_PROMPT as FINAL_SUMMARIZATION_PROMPT,
  CHUNK_WORKLOG_EXTRACT_PROMPT as WORKLOG_EXTRACT_PROMPT,
  CHUNK_POST_MERGE_PROMPT as POST_MERGE_PROMPT,
} from './prompts';

import { asString, asStringArray, localMerge } from './chunkMerger';
import { normalizeInput } from './utils/normalizeInput';
import { recordMetric } from './aiMetrics';
import { estimateTokens as _estimateTokens, tokenTargetToCharLimit as _tokenTargetToCharLimit, isCJK as _isCJK } from './utils/tokenEstimation';
import { tryRepairJson as _tryRepairJson, balanceBrackets as _balanceBrackets, fixTruncatedStrings as _fixTruncatedStrings, findMatchingBrace as _findMatchingBrace } from './utils/jsonRepair';

// Re-export for backward compat (used by tests and other modules)
export const estimateTokens = _estimateTokens;

// =============================================================================
// Chunk splitting — mode-aware
// =============================================================================

// Chunk targets per provider (in estimated tokens).
// Anthropic Claude: strict ~100K input token limit, but prompt + response overhead
//   means we keep extract chunks small (10-12K tokens) for reliable JSON output.
// Gemini: 1M+ context window — large chunks reduce API calls and merging overhead.
// OpenAI: 128K context for gpt-4o-mini — moderate chunk size balances cost and quality.
const CHUNK_TARGETS = {
  anthropic: { worklog: 12_000, handoff: 10_000 },
  gemini:    { worklog: 60_000, handoff: 50_000 },
  openai:    { worklog: 30_000, handoff: 25_000 },
} as const;

function getChunkTargets() {
  const provider = getActiveProvider();
  return CHUNK_TARGETS[provider] ?? CHUNK_TARGETS.gemini;
}

/** Threshold for splitting long paragraphs at sentence boundaries */
const LONG_PARAGRAPH_CHARS = 10_000;

/**
 * Split a very long paragraph (>10K chars) at sentence boundaries.
 * Handles English sentence-ending punctuation (.!?) and CJK sentence markers (。！？).
 * Falls back to mid-point split for text with no sentence boundaries.
 */
export function splitLongParagraph(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  // Split at sentence boundaries: . ! ? followed by space/newline, or CJK sentence-end marks
  const sentencePattern = /(?<=[.!?])\s+|(?<=[。！？])/g;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sentencePattern.exec(text)) !== null) {
    sentences.push(text.slice(lastIndex, match.index + match[0].length));
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    sentences.push(text.slice(lastIndex));
  }

  // If no sentence boundaries found, force-split at maxLen
  if (sentences.length <= 1) {
    const result: string[] = [];
    for (let i = 0; i < text.length; i += maxLen) {
      result.push(text.slice(i, i + maxLen));
    }
    return result;
  }

  // Group sentences up to maxLen
  const result: string[] = [];
  let buf = '';
  for (const sentence of sentences) {
    if (buf.length + sentence.length > maxLen && buf.length > 0) {
      result.push(buf);
      buf = sentence;
    } else {
      buf += sentence;
    }
  }
  if (buf) result.push(buf);
  return result;
}

export function splitIntoChunks(text: string, chunkTarget: number): string[] {
  // Convert token target to character limit based on the text's language mix
  const charLimit = _tokenTargetToCharLimit(text, chunkTarget);

  const fileSeparator = /(?=--- FILE: .+ ---\n)/g;
  const segments = text.split(fileSeparator).filter((s) => s.trim());

  if (segments.length > 1) {
    return dedupChunks(groupSegments(segments, charLimit));
  }

  const paragraphs = text.split(/\n{2,}/);

  // Secondary split: break very long paragraphs at sentence boundaries
  const refined: string[] = [];
  for (const p of paragraphs) {
    const withTrailing = p + '\n\n';
    if (p.length > LONG_PARAGRAPH_CHARS) {
      const subParts = splitLongParagraph(p, LONG_PARAGRAPH_CHARS);
      for (const sub of subParts) {
        refined.push(sub + '\n\n');
      }
    } else {
      refined.push(withTrailing);
    }
  }

  return dedupChunks(groupSegments(refined, charLimit));
}

/** Remove exact-duplicate chunks that can arise from repeated sections in input */
function dedupChunks(chunks: string[]): string[] {
  const seen = new Set<string>();
  return chunks.filter(chunk => {
    const key = chunk.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Hard cap: no single chunk may exceed this in extract phase.
 * Provider-dependent because context windows differ significantly:
 * - Anthropic: ~100K input tokens but needs room for prompt + response → 40K chars
 * - Gemini: 1M+ context → 120K chars for fewer API calls
 * - OpenAI: 128K context → 80K chars as a balanced middle ground
 */
const EXTRACT_MAX_CHARS_BY_PROVIDER = {
  anthropic: 40_000,
  gemini:    120_000,
  openai:    80_000,
} as const;

function getExtractMaxChars(): number {
  const provider = getActiveProvider();
  return EXTRACT_MAX_CHARS_BY_PROVIDER[provider] ?? 60_000;
}

function groupSegments(segments: string[], target: number): string[] {
  const maxChars = getExtractMaxChars();
  // First pass: split any oversized segment at line boundaries
  const split: string[] = [];
  for (const seg of segments) {
    if (seg.length <= maxChars) {
      split.push(seg);
    } else {
      // Force-split at newlines to stay under the cap
      const lines = seg.split('\n');
      let buf = '';
      for (const line of lines) {
        if (buf.length + line.length + 1 > maxChars && buf.length > 0) {
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

// detectLanguage and extractJson are imported from ./transform

// =============================================================================
// Fallback reformatter — sends prose back to model to get JSON
// =============================================================================

async function reformatToJson(
  apiKey: string,
  proseText: string,
  schemaHint: string,
): Promise<PartialResult> {
  // Skip AI call if input is too short to contain useful content
  if (proseText.trim().length < 20) {
    throw new Error('[Reformat Skip] Input too short for meaningful conversion');
  }

  // Try local JSON repair first — the prose might actually contain JSON that
  // was missed by the caller's simple '{' check (e.g., leading whitespace quirks)
  const localRepair = tryRepairJson(proseText);
  if (localRepair) return localRepair;

  _reformatCallCount++;
  if (import.meta.env.DEV) console.warn(`[Reformat Fallback #${_reformatCallCount}] Sending ${proseText.length} chars of prose back for JSON conversion`);
  recordMetric({
    timestamp: Date.now(),
    action: 'reformatToJson',
    inputLength: proseText.length,
    outputValid: true, // will be updated if parse fails
    decisionsCount: 0,
    todosCount: 0,
    durationMs: 0,
    cached: false,
  });

  const rawText = await callProvider({
    apiKey,
    system: 'You convert text into structured JSON. Output ONLY a valid JSON object. No prose, no explanation, no markdown.',
    userMessage: `Convert the following text into the required JSON schema. Output JSON only.\n\nRequired schema:\n${schemaHint}\n\nText to convert:\n${proseText}`,
    maxTokens: 8192,
  });

  const jsonText = extractJson(rawText);
  return JSON.parse(jsonText) as PartialResult;
}

/** DEV-only counter for reformatToJson calls (for cost monitoring) */
let _reformatCallCount = 0;
export function getReformatCallCount(): number { return _reformatCallCount; }
export function resetReformatCallCount(): void { _reformatCallCount = 0; }

// tryRepairJson, findMatchingBrace, balanceBrackets, fixTruncatedStrings
// are now imported from ./utils/jsonRepair
function tryRepairJson(raw: string): PartialResult | null {
  return _tryRepairJson(raw) as PartialResult | null;
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
    // No JSON at all — single-attempt reformat fallback (skip for long handoff)
    if (!skipReformat) {
      try {
        const schemaHint = extractSchemaHint(system);
        return await reformatToJson(apiKey, rawText, schemaHint);
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[chunkEngine] reformat fallback failed:', err);
      }
    }
    throw new Error('[Non-JSON Response]');
  }

  // Step 3: Has '{' but extractJson / JSON.parse failed
  try {
    const jsonText = extractJson(rawText);
    return JSON.parse(jsonText) as PartialResult;
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[chunkEngine] extractJson/parse failed:', err);
    const stripped = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    const hasCloseBrace = stripped.lastIndexOf('}') > stripped.indexOf('{');
    if (!hasCloseBrace) {
      throw new Error('[Truncated]');
    }
    // Malformed JSON — do NOT call reformatToJson again; tryRepairJson already
    // attempted local repair, and reformatToJson is reserved as a single-attempt
    // fallback for the "no JSON at all" case above.
    throw new Error('[Parse Error]');
  }
}

// =============================================================================
// Result converters
// =============================================================================

function toWorklog(raw: PartialResult): TransformResult {
  return {
    title: asString(raw.title) || 'Untitled',
    today: asStringArray(raw.today),
    decisions: asStringArray(raw.decisions),
    todo: asStringArray(raw.todo),
    relatedProjects: asStringArray(raw.relatedProjects),
    tags: asStringArray(raw.tags),
  };
}

function toHandoff(raw: PartialResult): HandoffResult {
  const { decisions, decisionRationales, totalDecisionsBeforeCap, nextActions, nextActionItems, resumeChecklist, actionBacklog, handoffMeta, currentStatus, completed, blockers, constraints, tags } = normalizeHandoffFields(raw);
  let resumeContext: string[];
  if (resumeChecklist.length > 0) {
    resumeContext = resumeChecklist.map(r => r.action);
  } else if (typeof raw.resumeContext === 'string') {
    resumeContext = raw.resumeContext.trim() ? [raw.resumeContext.trim()] : [];
  } else if (Array.isArray(raw.resumeContext)) {
    resumeContext = asStringArray(raw.resumeContext);
  } else {
    resumeContext = [];
  }
  return {
    title: asString(raw.title) || 'Untitled',
    handoffMeta,
    currentStatus,
    resumeChecklist,
    resumeContext,
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
}

// =============================================================================
// Mode-specific config
// =============================================================================

interface ModeConfig {
  extractPrompt: string;
  extractInstruction: string;
  chunkTarget: number;
  extractMaxTokens: number;
  skipReformatFallback: boolean;
}

// =============================================================================
// Size tiers: normal / long / extralong
// =============================================================================

export type SizeMode = 'normal' | 'long' | 'extralong';

const LONG_THRESHOLD = 120_000;
const EXTRALONG_THRESHOLD = 200_000;

/** Determine the size tier for the given source length */
export function getSizeMode(sourceLength: number): SizeMode {
  if (sourceLength > EXTRALONG_THRESHOLD) return 'extralong';
  if (sourceLength > LONG_THRESHOLD) return 'long';
  return 'normal';
}

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
    chunkTarget: targets.worklog,
    extractMaxTokens: 8192,
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

  return { ...worklogBase, skipReformatFallback: false };
}

/** Get chunk target for a given output mode */
export function getChunkTarget(mode: OutputMode): number {
  const targets = getChunkTargets();
  return mode === 'handoff' ? targets.handoff : targets.worklog;
}

/** Get engine concurrency for the active provider */
export function getEngineConcurrency(): number {
  return getActiveProvider() === 'anthropic' ? 1 : 2;
}

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
  autoPaused?: boolean;
  estimatedMinutes?: number;
  /** Current API call number (extract chunks + post-processing) */
  apiCallCurrent?: number;
  /** Total expected API calls (extract chunks + post-processing) */
  apiCallTotal?: number;
  /** Auto-resume countdown in seconds (shown during auto-pause) */
  autoResumeIn?: number;
}

export type ProgressCallback = (p: EngineProgress) => void;

// Retry config
const RETRY_DELAY_429 = 5;
const RETRY_DELAY_503 = 2;
const RETRY_MAX = 5;

// =============================================================================
// Engine
// =============================================================================

export class ChunkEngine {
  private _paused = false;
  private _cancelled = false;
  private _pauseResolve: (() => void) | null = null;
  private _pausePromise: Promise<void> | null = null;
  private _chunkDelay = 1;
  private _onStream?: StreamCallback;
  /** Tracks total API calls made during this engine run */
  private _apiCallCount = 0;
  /** Total expected API calls (chunks + post-processing) */
  private _apiCallTotal = 0;

  get isPaused(): boolean { return this._paused; }
  get isCancelled(): boolean { return this._cancelled; }
  /** Total API calls made during this engine run */
  get apiCallCount(): number { return this._apiCallCount; }

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
    this.resume();
  }

  private async checkPause(onProgress: ProgressCallback, session: ChunkSession, current: number, total: number): Promise<void> {
    if (this._cancelled) throw new Error('[Cancelled]');
    if (this._paused) {
      const saved = Object.keys(session.partials).length;
      onProgress({ phase: 'paused', current, total, savedCount: saved, message: `paused:${saved}` });
      await this._pausePromise;
      if (this._cancelled) throw new Error('[Cancelled]');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async waitInterruptible(ms: number): Promise<void> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (this._cancelled) throw new Error('[Cancelled]');
      if (this._paused) return;
      await this.sleep(Math.min(200, end - Date.now()));
    }
  }

  /** Maximum depth for recursive truncation splits to prevent infinite recursion */
  private static readonly MAX_SPLIT_DEPTH = 3;

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
    splitDepth = 0,
  ): Promise<PartialResult> {
    const effectiveUserMessage = userMessage;
    const effectiveMaxTokens = maxTokens;
    const label = `[Chunk ${current}/${total}]`;
    for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
      try {
        const result = await callApiRaw(apiKey, system, effectiveUserMessage, effectiveMaxTokens, skipReformat, this._onStream);
        if (this._chunkDelay > 1) {
          this._chunkDelay = Math.max(1, this._chunkDelay * 0.7);
        }
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isRateLimit = msg.includes('[Rate Limit]') || msg.includes('[Overloaded]');
        const apiRetryMatch = msg.match(/\[Rate Limit:(\d+)\]/);
        const apiRetrySec = apiRetryMatch ? parseInt(apiRetryMatch[1], 10) : 0;
        if (isRateLimit) {
          this._chunkDelay = Math.min(30, this._chunkDelay * 2);
        }
        const isTruncated = msg.includes('[Truncated]');
        const isParseError = msg.includes('[Parse Error]');
        const isNonJson = msg.includes('[Non-JSON Response]');
        const isRetryable = isRateLimit || isTruncated || isParseError || isNonJson;

        if (isTruncated && attempt < 2 && splitDepth < ChunkEngine.MAX_SPLIT_DEPTH) {
          // Truncation is an input length problem — split into two halves
          // and process both to avoid losing data from the second half.
          const halfLen = Math.ceil(effectiveUserMessage.length / 2);
          const splitIdx = effectiveUserMessage.lastIndexOf('\n', halfLen);
          const cutPoint = splitIdx > effectiveUserMessage.length * 0.25 ? splitIdx : halfLen;
          const firstHalf = effectiveUserMessage.slice(0, cutPoint);
          const secondHalf = effectiveUserMessage.slice(cutPoint);

          if (splitDepth + 1 >= ChunkEngine.MAX_SPLIT_DEPTH) {
            if (import.meta.env.DEV) console.warn(`${label} WARNING: Maximum split depth (${ChunkEngine.MAX_SPLIT_DEPTH}) reached. Input chunk may be too large for reliable extraction.`);
          }
          if (import.meta.env.DEV) console.warn(`${label} split after Truncated (depth=${splitDepth + 1}, first=${firstHalf.length} chars, second=${secondHalf.length} chars)`);
          await this.waitInterruptible(2000);

          // Process first half
          const firstResult = await this.callWithRetry(
            apiKey, system, firstHalf, onProgress, session,
            current, total, maxTokens, skipReformat, splitDepth + 1,
          );

          // Process second half — if it fails, log warning but return first half
          let secondResult: PartialResult | null = null;
          if (secondHalf.trim().length > 0) {
            onProgress({
              phase: 'extract', current, total,
              savedCount: Object.keys(session.partials).length,
              message: `extract:${current}:${total}:split-recovery`,
            });
            try {
              secondResult = await this.callWithRetry(
                apiKey, system, secondHalf, onProgress, session,
                current, total, maxTokens, skipReformat, splitDepth + 1,
              );
            } catch (secondErr) {
              if (import.meta.env.DEV) console.warn(`${label} second half failed after split (depth=${splitDepth + 1}), partial data may be lost:`, secondErr);
            }
          }

          // Merge both halves if second succeeded, with deduplication via localMerge
          if (secondResult) {
            return localMerge([firstResult, secondResult]);
          }
          // Second half failed — mark result as partial and notify user
          onProgress({
            phase: 'extract', current, total,
            savedCount: Object.keys(session.partials).length,
            message: 'extract:partial-recovery',
          });
          return { ...firstResult, _partialRecovery: true };
        }

        if ((isNonJson || isParseError) && attempt < 2) {
          if (import.meta.env.DEV) console.warn(`${label} retry #${attempt + 1} after ${isNonJson ? 'Non-JSON' : 'Parse Error'} (delay=3s)`);
          await this.waitInterruptible(3000);
          continue;
        }

        if (isRetryable && attempt < RETRY_MAX) {
          const saved = Object.keys(session.partials).length;
          const is503 = msg.includes('[Overloaded]');
          const baseDelay = is503 ? RETRY_DELAY_503 : RETRY_DELAY_429;
          // Use retry-after from API as minimum delay, falling back to default backoff
          const delaySec = apiRetrySec > 0 ? Math.max(apiRetrySec, baseDelay) : baseDelay;
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

        if (isRetryable) {
          const saved = Object.keys(session.partials).length;
          this._paused = true;
          this._pausePromise = new Promise((r) => { this._pauseResolve = r; });

          // Auto-resume after 60 seconds if user doesn't act
          const AUTO_RESUME_TIMEOUT = 60;
          let countdown = AUTO_RESUME_TIMEOUT;
          const countdownInterval = setInterval(() => {
            if (!this._paused || this._cancelled) {
              clearInterval(countdownInterval);
              return;
            }
            countdown--;
            onProgress({
              phase: 'paused', current, total, savedCount: saved,
              message: `auto-paused:${saved}:resume-in:${countdown}`,
              autoPaused: true,
            });
            if (countdown <= 0) {
              clearInterval(countdownInterval);
              this.resume();
            }
          }, 1000);

          onProgress({
            phase: 'paused', current, total, savedCount: saved,
            message: `auto-paused:${saved}:resume-in:${AUTO_RESUME_TIMEOUT}`,
            autoPaused: true,
          });
          await this._pausePromise;
          clearInterval(countdownInterval);
          if (this._cancelled) throw new Error('[Cancelled]');
          return this.callWithRetry(apiKey, system, userMessage, onProgress, session, current, total, maxTokens, skipReformat);
        }
        throw err;
      }
    }
    throw new Error('Unexpected: retry loop exited without result.');
  }

  /** Process worklog extraction */
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

  /** Process handoff extraction */
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

  /** Process combined worklog + handoff extraction */
  async processBoth(
    sourceText: string,
    apiKey: string,
    onProgress: ProgressCallback,
    onStream?: StreamCallback,
  ): Promise<BothResult> {
    this._onStream = onStream;
    const raw = await this.processGeneric(sourceText, apiKey, onProgress, 'both');
    this._onStream = undefined;

    const w = raw.worklog as PartialResult | undefined;
    const h = raw.handoff as PartialResult | undefined;

    return {
      worklog: toWorklog(w || raw),
      handoff: toHandoff(h || raw),
    };
  }

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
    sourceText = normalizeInput(sourceText);
    const config = getModeConfig(mode, sourceText.length);
    const hash = computeSourceHash(sourceText);
    let session = await loadSession(hash);
    const freshChunks = splitIntoChunks(sourceText, config.chunkTarget);

    if (session && session.chunks.length === freshChunks.length && session.status === 'active') {
      // Resume
    } else {
      if (session) {
        await deleteSession(hash).catch((err) => {
          if (import.meta.env.DEV) console.error('[chunkEngine] deleteSession failed during init:', err);
        });
      }
      session = {
        sourceHash: hash,
        chunks: freshChunks,
        partials: {},
        status: 'active',
        createdAt: Date.now(),
      };
      await saveSession(session).catch((err) => {
        if (import.meta.env.DEV) console.error('[chunkEngine] saveSession failed during init:', err);
      });
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

    const workItems: number[] = [];
    for (let i = 0; i < chunks.length; i++) {
      if (!session.partials[String(i)]) {
        workItems.push(i);
      }
    }

    const completedCount = chunks.length - workItems.length;
    let finished = completedCount;

    // Calculate total API calls: extract chunks + post-processing
    // Post-processing: 1 combined call for multi-chunk, 2 for single-chunk (completed + finalSummary)
    const postProcessCalls = chunks.length === 1 ? 2 : 1;
    const isHandoffMode = mode === 'handoff' || mode === 'both';
    this._apiCallTotal = chunks.length + (isHandoffMode ? postProcessCalls : 0);
    this._apiCallCount = completedCount;

    onProgress({
      phase: 'extract', current: completedCount, total: chunks.length,
      savedCount: completedCount,
      message: `extract:${completedCount}:${chunks.length}`,
      apiCallCurrent: this._apiCallCount,
      apiCallTotal: this._apiCallTotal,
    });

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
      this._apiCallCount++;
      await saveSession(session).catch((err) => {
        if (import.meta.env.DEV) console.error('[chunkEngine] saveSession failed during extract:', err);
      });

      onProgress({
        phase: 'extract', current: finished, total: chunks.length,
        savedCount: finished,
        message: `extract:${finished}:${chunks.length}`,
        apiCallCurrent: this._apiCallCount,
        apiCallTotal: this._apiCallTotal,
      });

      if (getActiveProvider() === 'anthropic' && finished < chunks.length) {
        const jitter = (Math.random() - 0.5) * 2;
        const delaySec = Math.max(1, this._chunkDelay + jitter);
        onProgress({
          phase: 'waiting', current: finished, total: chunks.length,
          savedCount: finished,
          message: `waiting:${Math.round(delaySec)}`,
        });
        await new Promise(r => setTimeout(r, delaySec * 1000));
      }
    };

    if (workItems.length > 0) {
      try {
        await this.runParallel(workItems, processChunk, ChunkEngine.getConcurrency());
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('[Cancelled]')) {
          // Check if we have any completed partials to salvage
          const savedPartials = chunks.map((_, i) => session!.partials[String(i)]).filter(Boolean);
          if (savedPartials.length > 0) {
            if (import.meta.env.DEV) console.log(`[chunkEngine] Cancelled with ${savedPartials.length}/${chunks.length} partials — returning merged partial results`);
            // Session stays in IndexedDB for potential resume; merge what we have
            const merged = localMerge(savedPartials, mode === 'both');
            return merged;
          }
        }
        throw err;
      }
    }

    const allPartials = chunks.map((_, i) => session!.partials[String(i)]).filter(Boolean);

    if (allPartials.length === 1) {
      if (mode === 'handoff' || mode === 'both') {
        try {
          const partial = allPartials[0];
          const singlePartialText = Object.entries(partial)
            .filter(([key]) => key !== 'title' && key !== 'worklog' && key !== 'handoff')
            .map(([key, val]) => {
              if (Array.isArray(val) && val.length > 0) return `${key}: ${val.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(' / ')}`;
              if (typeof val === 'string' && val.trim()) return `${key}: ${val}`;
              return null;
            }).filter(Boolean).join('\n');

          const completedPromise = this.extractCompleted(apiKey, singlePartialText, onProgress, finished, 2);
          const finalSumPromise = this.extractFinalSummary(apiKey, partial, mode, onProgress, finished, 2);

          const [completedItems, finalSummary] = await Promise.all([completedPromise, finalSumPromise]);

          if (completedItems.length > 0) {
            allPartials[0].completed = completedItems;
            if (mode === 'both') {
              const h = allPartials[0].handoff as PartialResult | undefined;
              if (h) h.completed = completedItems;
            }
          }

          if (finalSummary) {
            this.applyFinalSummary(finalSummary, allPartials[0], mode);
          }
        } catch (err) {
          if (import.meta.env.DEV) console.warn('[SingleChunk] post-extraction failed:', err);
        }
      }
      await deleteSession(hash).catch((err) => {
        if (import.meta.env.DEV) console.error('[chunkEngine] deleteSession failed after single-chunk:', err);
      });
      return allPartials[0];
    }

    // --- Local merge ---
    onProgress({ phase: 'merge', current: 1, total: 1, savedCount: finished, message: 'merge:local' });
    const mergedResult: PartialResult = localMerge(allPartials, mode === 'both');

    // --- Post-merge: single combined finalization call (replaces 3 separate calls) ---
    if (mode === 'handoff' || mode === 'both') {
      try {
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

        const postMergeResult = await this.runPostMergeFinalization(
          apiKey, mergedResult, partialsText, mode, onProgress, finished,
        );

        if (postMergeResult) {
          this.applyPostMergeResult(postMergeResult, mergedResult, mode);
        }
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[chunkEngine] post-merge failed:', err);
      }
    }

    session.status = 'completed';
    await deleteSession(hash).catch((err) => {
      if (import.meta.env.DEV) console.error('[chunkEngine] deleteSession failed after merge:', err);
    });
    return mergedResult;
  }

  /** Combined post-merge finalization — replaces 3 separate API calls with 1 (#55-57) */
  private async runPostMergeFinalization(
    apiKey: string, mergedResult: PartialResult, partialsText: string,
    mode: ExtractMode, onProgress: ProgressCallback, savedCount: number,
  ): Promise<PartialResult | null> {
    onProgress({ phase: 'consistency', current: 1, total: 1, savedCount, message: 'post-merge:finalization' });
    try {
      const handoffData: PartialResult | undefined = mode === 'both'
        ? mergedResult.handoff as PartialResult | undefined
        : mergedResult;
      if (!handoffData) return null;

      const MAX_DECISIONS_FOR_CHECK = 10;
      const fullDecisions = handoffData.decisions;
      let trimmedDecisions: unknown[] | undefined;
      if (Array.isArray(fullDecisions) && fullDecisions.length > MAX_DECISIONS_FOR_CHECK) {
        trimmedDecisions = fullDecisions.slice(-MAX_DECISIONS_FOR_CHECK);
      }
      const checkPayload = trimmedDecisions ? { ...handoffData, decisions: trimmedDecisions } : handoffData;
      const handoffJson = JSON.stringify(checkPayload);

      const sLang = detectLanguage(handoffJson.slice(0, 3000));
      const langHint = sLang === 'ja'
        ? 'Input is Japanese. Output in Japanese (keep code terms in English).'
        : 'Output in English.';

      return await callApiRaw(
        apiKey, POST_MERGE_PROMPT,
        `${langHint}\n\nMERGED HANDOFF:\n${handoffJson}\n\nCHUNK EXTRACTION TEXT (for completed items):\n${partialsText}`,
        8192, true,
      );
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[chunkEngine] post-merge finalization failed:', err);
      return null;
    }
  }

  /** Apply combined post-merge result to the merged result */
  private applyPostMergeResult(postMerge: PartialResult, mergedResult: PartialResult, mode: ExtractMode): void {
    const originalDecisions = mergedResult.decisions;

    // Apply cleaned handoff fields
    const cleaned = postMerge.cleanedHandoff as PartialResult | undefined;
    if (cleaned) {
      if (mode === 'both') {
        mergedResult.handoff = { ...(mergedResult.handoff as PartialResult), ...cleaned };
        mergedResult.currentStatus = cleaned.currentStatus ?? mergedResult.currentStatus;
        mergedResult.nextActions = cleaned.nextActions ?? mergedResult.nextActions;
        mergedResult.blockers = cleaned.blockers ?? mergedResult.blockers;
        mergedResult.constraints = cleaned.constraints ?? mergedResult.constraints;
        mergedResult.resumeContext = cleaned.resumeContext ?? mergedResult.resumeContext;
        mergedResult.decisions = originalDecisions;
        const handoffRef = mergedResult.handoff as PartialResult | undefined;
        if (handoffRef) handoffRef.decisions = originalDecisions;
      } else {
        Object.assign(mergedResult, cleaned);
        mergedResult.decisions = originalDecisions;
      }
    }

    // Apply completed items
    const completedItems = postMerge.completed;
    if (Array.isArray(completedItems) && completedItems.length > 0) {
      const MAX_COMPLETED = 50;
      const strings = completedItems.filter((x): x is string => typeof x === 'string');
      const trimmed = strings.length > MAX_COMPLETED ? strings.slice(-MAX_COMPLETED) : strings;
      mergedResult.completed = trimmed;
      if (mode === 'both') {
        const handoff = mergedResult.handoff as PartialResult | undefined;
        if (handoff) handoff.completed = trimmed;
      }
    }

    // Apply final summary (handoffMeta, resumeChecklist, activeDecisions)
    this.applyFinalSummary(postMerge, mergedResult, mode);
  }

  /** Extract completed items from chunk text */
  private async extractCompleted(
    apiKey: string, inputText: string, onProgress: ProgressCallback, savedCount: number, total: number,
  ): Promise<string[]> {
    onProgress({ phase: 'completed', current: 1, total, savedCount, message: 'completed:extract' });
    try {
      const cLang = detectLanguage(inputText.slice(0, 3000));
      const langHint = cLang === 'ja'
        ? 'Input is Japanese. Output in Japanese (keep code terms in English).'
        : 'Output in English.';
      const result = await callApiRaw(
        apiKey, COMPLETED_EXTRACT_PROMPT,
        `${langHint}\n\nExtract ALL completed work from these chunk extraction results:\n\n${inputText}`,
        4096, true,
      );
      const items = result.completed;
      if (Array.isArray(items) && items.length > 0) {
        const MAX_COMPLETED = 50;
        const strings = items.filter((x): x is string => typeof x === 'string');
        return strings.length > MAX_COMPLETED ? strings.slice(-MAX_COMPLETED) : strings;
      }
      return [];
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[chunkEngine] completed extraction failed:', err);
      return [];
    }
  }

  /** Run consistency check on merged handoff */
  private async runConsistencyCheck(
    apiKey: string, mergedResult: PartialResult, mode: ExtractMode, onProgress: ProgressCallback, savedCount: number,
  ): Promise<PartialResult | null> {
    onProgress({ phase: 'consistency', current: 2, total: 2, savedCount, message: 'consistency:check' });
    try {
      const handoffData: PartialResult | undefined = mode === 'both'
        ? mergedResult.handoff as PartialResult | undefined
        : mergedResult;

      if (handoffData) {
        const MAX_DECISIONS_FOR_CHECK = 10;
        const fullDecisions = handoffData.decisions;
        let trimmedDecisions: unknown[] | undefined;
        if (Array.isArray(fullDecisions) && fullDecisions.length > MAX_DECISIONS_FOR_CHECK) {
          trimmedDecisions = fullDecisions.slice(-MAX_DECISIONS_FOR_CHECK);
        }
        const checkPayload = trimmedDecisions ? { ...handoffData, decisions: trimmedDecisions } : handoffData;
        const handoffJson = JSON.stringify(checkPayload);
        return await callApiRaw(
          apiKey, CONSISTENCY_CHECK_PROMPT,
          `Clean up and output the final handoff JSON:\n\n${handoffJson}`,
          8192, true,
        );
      }
      return null;
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[chunkEngine] consistency check failed:', err);
      return null;
    }
  }

  /** Extract final summary (handoffMeta + resumeChecklist + activeDecisions) */
  private async extractFinalSummary(
    apiKey: string, source: PartialResult, mode: ExtractMode, onProgress: ProgressCallback, savedCount: number, total: number,
  ): Promise<PartialResult | null> {
    onProgress({ phase: 'summarization', current: total, total, savedCount, message: 'summarization:final' });
    try {
      const handoffData: PartialResult | undefined = mode === 'both'
        ? (source.handoff as PartialResult | undefined) ?? source
        : source;
      if (!handoffData) return null;

      const summaryInput: Record<string, unknown> = {};
      for (const key of ['currentStatus', 'nextActions', 'nextActionItems', 'actionBacklog', 'blockers', 'completed', 'decisions', 'decisionRationales', 'constraints', 'title'] as const) {
        if (handoffData[key] != null) {
          summaryInput[key] = handoffData[key];
        }
      }
      const inputJson = JSON.stringify(summaryInput);
      const sLang = detectLanguage(inputJson.slice(0, 3000));
      const langHint = sLang === 'ja'
        ? 'Input is Japanese. Output in Japanese (keep code terms in English).'
        : 'Output in English.';
      return await callApiRaw(
        apiKey, FINAL_SUMMARIZATION_PROMPT,
        `${langHint}\n\nGenerate session-wide summary fields from this merged handoff:\n\n${inputJson}`,
        4096, true,
      );
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[chunkEngine] final summarization failed:', err);
      return null;
    }
  }

  /** Apply final summary results to a target partial */
  private applyFinalSummary(finalSummary: PartialResult, target: PartialResult, mode: ExtractMode): void {
    const meta = normalizeHandoffMeta(finalSummary.handoffMeta);
    const checklist = normalizeResumeChecklist(finalSummary.resumeChecklist);
    const derivedResumeContext = checklist.map(item => item.action);

    let activeDecisions: DecisionWithRationale[] | undefined;
    const rawActiveDecisions = finalSummary.activeDecisions;
    if (Array.isArray(rawActiveDecisions) && rawActiveDecisions.length > 0) {
      activeDecisions = dedupDecisions(
        rawActiveDecisions
          .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null && 'decision' in d)
          .map(d => ({
            decision: String(d.decision || ''),
            rationale: typeof d.rationale === 'string' ? d.rationale : null,
          }))
      ).slice(0, 6);
    }

    const applyToTarget = (t: PartialResult) => {
      t.handoffMeta = meta;
      t.resumeChecklist = checklist;
      t.resumeContext = derivedResumeContext;
      if (activeDecisions && activeDecisions.length > 0) {
        t.decisionRationales = activeDecisions;
        t.decisions = activeDecisions.map(d => d.decision);
      }
    };

    applyToTarget(target);
    if (mode === 'both') {
      const h = target.handoff as PartialResult | undefined;
      if (h) applyToTarget(h);
    }

    if (import.meta.env.DEV) {
      console.log('[FinalSummarization] applied handoffMeta:', JSON.stringify(meta));
      console.log('[FinalSummarization] applied resumeChecklist:', JSON.stringify(checklist));
      if (activeDecisions) console.log('[FinalSummarization] applied activeDecisions:', activeDecisions.length);
    }
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

// =============================================================================
// Test-only exports — used by unit tests, not part of public API
// =============================================================================
export const _testOnly = {
  splitIntoChunks,
  splitLongParagraph,
  tryRepairJson,
  localMerge,
  estimateTokens: _estimateTokens,
  tokenTargetToCharLimit: _tokenTargetToCharLimit,
};
