/**
 * AI Provider adapter — abstracts Anthropic / Gemini / OpenAI API differences.
 *
 * All callers use callProvider() which dispatches to the active provider.
 * Provider and per-provider API keys are stored in localStorage.
 *
 * When no API key is configured, requests are routed through the built-in
 * server-side proxy (/api/generate) which uses a shared Gemini key.
 */

import { safeGetItem, safeSetItem, safeRemoveItem } from './storage';
import { callWithRetry } from './utils/retryManager';
import { parseSSEStream, extractGeminiText, extractAnthropicText, extractOpenAIText } from './utils/streamParser';
import { encrypt, decrypt, isEncrypted, setCachedKey, readKeyForSlot } from './utils/crypto';
import { acquire as acquireRateLimit } from './utils/rateLimiter';

export type ProviderName = 'anthropic' | 'gemini' | 'openai';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash-latest',
];
const GEMINI_MODEL = GEMINI_MODELS[0];
const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const OPENAI_MODEL = 'gpt-4o-mini';

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  anthropic: 'Claude',
  gemini: 'Gemini',
  openai: 'OpenAI',
};

export const PROVIDER_MODEL_LABELS: Record<ProviderName, string> = {
  anthropic: ANTHROPIC_MODEL,
  gemini: GEMINI_MODEL,
  openai: OPENAI_MODEL,
};

export const PROVIDER_KEY_PLACEHOLDER: Record<ProviderName, string> = {
  anthropic: 'sk-ant-...',
  gemini: 'AIza...',
  openai: 'sk-...',
};

// ---------------------------------------------------------------------------
// Common request shape (what callers provide)
// ---------------------------------------------------------------------------

export interface ProviderRequest {
  apiKey: string;
  system: string;
  userMessage: string;
  maxTokens: number;
  /** When true, disable Gemini thinking (thinkingBudget: 0). Defaults to true for speed. */
  disableThinking?: boolean;
}

export type StreamCallback = (chunk: string, accumulated: string) => void;

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

async function callAnthropic(req: ProviderRequest): Promise<string> {
  await acquireRateLimit('anthropic');
  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: [{ role: 'user', content: req.userMessage }],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': req.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      handleHttpError(res.status, text);
    }

    const data = await res.json();
    const output = data.content?.[0]?.text ?? '';
    if (!output) throw new Error('[AI Response] Empty response from API. Try again.');
    return output;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

async function callGeminiWithModel(req: ProviderRequest, model: string): Promise<Response> {
  await acquireRateLimit('gemini');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: req.maxTokens,
    responseMimeType: 'application/json',
  };
  // Disable thinking by default for speed; allow callers to enable it (e.g. classification)
  if (req.disableThinking !== false) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const body = {
    system_instruction: {
      parts: [{ text: req.system }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: req.userMessage }],
      },
    ],
    generationConfig,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': req.apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGemini(req: ProviderRequest): Promise<string> {
  let res: Response | null = null;

  // Try each model in order; only fall back on 404 (model not found)
  for (const model of GEMINI_MODELS) {
    res = await callGeminiWithModel(req, model);
    if (res.status === 404) {
      // model returned 404, try next fallback
      continue;
    }
    break;
  }

  if (!res) throw new Error('[Gemini] No models available.');

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    handleHttpError(res.status, text);
  }

  const data = await res.json();
  const output = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!output) {
    throw new Error('[AI Response] Empty response from Gemini. Try again.');
  }
  return output;
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

async function callOpenAI(req: ProviderRequest): Promise<string> {
  await acquireRateLimit('openai');
  const body = {
    model: OPENAI_MODEL,
    max_tokens: req.maxTokens,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.userMessage },
    ],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${req.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      handleHttpError(res.status, text);
    }

    const data = await res.json();
    const output = data.choices?.[0]?.message?.content ?? '';
    if (!output) throw new Error('[AI Response] Empty response from OpenAI. Try again.');
    return output;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Gemini Streaming
// ---------------------------------------------------------------------------

async function callGeminiStreamWithModel(req: ProviderRequest, model: string, onChunk: StreamCallback): Promise<string> {
  await acquireRateLimit('gemini');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

  const streamGenerationConfig: Record<string, unknown> = {
    maxOutputTokens: req.maxTokens,
  };
  if (req.disableThinking !== false) {
    streamGenerationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const body = {
    system_instruction: {
      parts: [{ text: req.system }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: req.userMessage }],
      },
    ],
    generationConfig: streamGenerationConfig,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': req.apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // Return empty to signal fallback needed for 404
      if (res.status === 404) return '';
      // Gemini stream error
      handleHttpError(res.status, text);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('[Stream] ReadableStream not supported');

    return await parseSSEStream(reader, extractGeminiText, onChunk);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('[Stream] Request timed out. Please try again.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGeminiStream(req: ProviderRequest, onChunk: StreamCallback): Promise<string> {
  for (const model of GEMINI_MODELS) {
    const result = await callGeminiStreamWithModel(req, model, onChunk);
    if (result === '' && model !== GEMINI_MODELS[GEMINI_MODELS.length - 1]) {
      // model returned 404, try next fallback
      continue;
    }
    if (!result) throw new Error('[AI Response] Empty streaming response from Gemini. Try again.');
    return result;
  }
  throw new Error('[Gemini] No models available.');
}

// ---------------------------------------------------------------------------
// Anthropic Streaming
// ---------------------------------------------------------------------------

async function callAnthropicStream(req: ProviderRequest, onChunk: StreamCallback): Promise<string> {
  await acquireRateLimit('anthropic');
  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: req.maxTokens,
    stream: true,
    system: req.system,
    messages: [{ role: 'user', content: req.userMessage }],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': req.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      handleHttpError(res.status, text);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('[Stream] ReadableStream not supported');

    const accumulated = await parseSSEStream(reader, extractAnthropicText, onChunk);
    if (!accumulated) throw new Error('[AI Response] Empty streaming response from API. Try again.');
    return accumulated;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('[Stream] Request timed out. Please try again.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// OpenAI Streaming
// ---------------------------------------------------------------------------

async function callOpenAIStream(req: ProviderRequest, onChunk: StreamCallback): Promise<string> {
  await acquireRateLimit('openai');
  const body = {
    model: OPENAI_MODEL,
    max_tokens: req.maxTokens,
    stream: true,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.userMessage },
    ],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${req.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      handleHttpError(res.status, text);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('[Stream] ReadableStream not supported');

    const accumulated = await parseSSEStream(reader, extractOpenAIText, onChunk);
    if (!accumulated) throw new Error('[AI Response] Empty streaming response from OpenAI. Try again.');
    return accumulated;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('[Stream] Request timed out. Please try again.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Shared error handling
// ---------------------------------------------------------------------------

function handleHttpError(status: number, body: string): never {
  // Parse error message if JSON
  let errorMessage = '';
  let retryDelaySec = 0;
  try {
    const errJson = JSON.parse(body);
    errorMessage = errJson?.error?.message || '';
    // Extract retryDelay from Gemini 429 responses
    // Format: { error: { details: [{ retryDelay: "30s" }] } }
    const details = errJson?.error?.details;
    if (Array.isArray(details)) {
      for (const d of details) {
        const rd = d?.retryDelay;
        if (typeof rd === 'string') {
          const match = rd.match(/^(\d+)s$/);
          if (match) retryDelaySec = parseInt(match[1], 10);
        }
      }
    }
    // Also check Retry-After style in message (e.g. "retry after 30s")
    if (!retryDelaySec && errorMessage) {
      const msgMatch = errorMessage.match(/retry\s+after\s+(\d+)/i);
      if (msgMatch) retryDelaySec = parseInt(msgMatch[1], 10);
    }
  } catch (err) { if (import.meta.env.DEV) console.warn('[provider] handleHttpError JSON parse:', err); }

  if (status === 401 || status === 403) throw new Error('[API Key] Invalid or expired. Check your key in Settings.');
  if (status === 429) {
    if (retryDelaySec > 0) {
      throw new Error(`[Rate Limit:${retryDelaySec}]`);
    }
    throw new Error('[Rate Limit]');
  }
  if (status === 500 || status === 503 || status === 529) throw new Error('[Overloaded]');
  if (status === 413 || body.includes('too long') || body.includes('too large')) {
    throw new Error('[Too Long] Input too large for the API.');
  }
  if (import.meta.env.DEV) console.error(`[provider] API Error ${status}:`, (errorMessage || body).slice(0, 500));
  throw new Error(`[API Error] ${status}`);
}

// ---------------------------------------------------------------------------
// Built-in API (server-side Gemini proxy at /api/generate)
// ---------------------------------------------------------------------------

const BUILTIN_USAGE_KEY = 'threadlog_builtin_usage';
const BUILTIN_DAILY_LIMIT = 20;

function saveBuiltinUsage(remaining: number): void {
  try {
    const today = new Date().toISOString().slice(0, 10);
    safeSetItem(BUILTIN_USAGE_KEY, JSON.stringify({ remaining, date: today }));
  } catch (err) { if (import.meta.env.DEV) console.warn('[provider] saveBuiltinUsage:', err); }
}

/** Get built-in API usage for today: { used, limit, remaining } */
export function getBuiltinUsage(): { used: number; limit: number; remaining: number } {
  try {
    const raw = safeGetItem(BUILTIN_USAGE_KEY);
    if (raw) {
      const { remaining, date } = JSON.parse(raw);
      const today = new Date().toISOString().slice(0, 10);
      if (date === today) {
        return { used: BUILTIN_DAILY_LIMIT - remaining, limit: BUILTIN_DAILY_LIMIT, remaining };
      }
    }
  } catch (err) { if (import.meta.env.DEV) console.warn('[provider] getBuiltinUsage:', err); }
  return { used: 0, limit: BUILTIN_DAILY_LIMIT, remaining: BUILTIN_DAILY_LIMIT };
}

function captureRateLimit(res: Response): void {
  const remaining = res.headers.get('X-RateLimit-Remaining');
  if (remaining !== null) {
    saveBuiltinUsage(parseInt(remaining, 10));
  }
}

async function callBuiltin(req: ProviderRequest): Promise<string> {
  await acquireRateLimit('builtin');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: req.system,
        userMessage: req.userMessage,
        maxTokens: req.maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // Handle built-in specific errors
      if (res.status === 429) {
        try {
          const err = JSON.parse(text);
          throw new Error(err.error || '[Rate Limit]');
        } catch (e) {
          if (e instanceof Error && e.message !== '[Rate Limit]') throw e;
          throw new Error('[Rate Limit]');
        }
      }
      handleHttpError(res.status, text);
    }

    captureRateLimit(res);
    const data = await res.json();
    const output = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!output) throw new Error('[AI Response] Empty response. Try again.');
    return output;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callBuiltinStream(req: ProviderRequest, onChunk: StreamCallback): Promise<string> {
  await acquireRateLimit('builtin');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: req.system,
        userMessage: req.userMessage,
        maxTokens: req.maxTokens,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 429) {
        try {
          const err = JSON.parse(text);
          throw new Error(err.error || '[Rate Limit]');
        } catch (e) {
          if (e instanceof Error && e.message !== '[Rate Limit]') throw e;
          throw new Error('[Rate Limit]');
        }
      }
      handleHttpError(res.status, text);
    }

    captureRateLimit(res);

    const reader = res.body?.getReader();
    if (!reader) throw new Error('[Stream] ReadableStream not supported');

    const accumulated = await parseSSEStream(reader, extractGeminiText, onChunk);
    if (!accumulated) throw new Error('[AI Response] Empty streaming response. Try again.');
    return accumulated;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('[Stream] Request timed out. Please try again.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Public API — single entry point
// ---------------------------------------------------------------------------

/** Get the active provider from localStorage */
export function getActiveProvider(): ProviderName {
  try {
    const v = safeGetItem('threadlog_provider');
    if (v === 'anthropic' || v === 'gemini' || v === 'openai') return v;
  } catch (err) { if (import.meta.env.DEV) console.warn('[provider] getActiveProvider:', err); }
  return 'gemini';
}

/** Set the active provider */
export function setActiveProvider(name: ProviderName): void {
  safeSetItem('threadlog_provider', name);
}

/**
 * Get API key for a specific provider (synchronous).
 * Returns from in-memory cache if available, or raw plaintext value.
 * Encrypted keys require initKeyCache() to have run first.
 */
export function getProviderApiKey(provider: ProviderName): string {
  const stored = safeGetItem(`threadlog_api_key_${provider}`) || '';
  const key = readKeyForSlot(provider, stored);
  // Cache plaintext keys on first read so subsequent sync reads are fast
  if (key && !isEncrypted(stored)) {
    setCachedKey(provider, key);
  }
  return key;
}

/**
 * Initialize the decrypted key cache on app startup.
 * Decrypts any encrypted keys and migrates plaintext keys to encrypted.
 * Call this once during app initialization.
 */
export async function initKeyCache(): Promise<void> {
  const providers: ProviderName[] = ['gemini', 'anthropic', 'openai'];
  for (const provider of providers) {
    const stored = safeGetItem(`threadlog_api_key_${provider}`) || '';
    if (!stored) {
      setCachedKey(provider, '');
      continue;
    }

    if (isEncrypted(stored)) {
      const plain = await decrypt(stored);
      setCachedKey(provider, plain);
    } else {
      // Plaintext legacy key — cache it and migrate to encrypted
      setCachedKey(provider, stored);
      const encrypted = await encrypt(stored);
      if (encrypted !== stored) {
        safeSetItem(`threadlog_api_key_${provider}`, encrypted);
      }
    }
  }
}

/** Set API key for a specific provider (encrypts before storing) */
export function setProviderApiKey(provider: ProviderName, key: string): void {
  // Update shared cache immediately so sync reads work
  setCachedKey(provider, key);

  if (!key) {
    safeSetItem(`threadlog_api_key_${provider}`, '');
    return;
  }

  // Store plaintext immediately as fallback, then encrypt
  safeSetItem(`threadlog_api_key_${provider}`, key);
  encrypt(key).then((encrypted) => {
    // Only overwrite if the plaintext value is still current
    const current = safeGetItem(`threadlog_api_key_${provider}`);
    if (current === key) {
      safeSetItem(`threadlog_api_key_${provider}`, encrypted);
    }
  }).catch(() => {
    // Encryption failed — plaintext remains, which is the legacy behavior
  });
}

/** Check if a raw stored key exists for a provider (plaintext or encrypted) */
function hasStoredKey(provider: ProviderName): boolean {
  const stored = safeGetItem(`threadlog_api_key_${provider}`) || '';
  return stored.length > 0;
}

/** Check if any user-provided API key is configured */
export function hasAnyApiKey(): boolean {
  return hasStoredKey('gemini') || hasStoredKey('anthropic') || hasStoredKey('openai');
}

/** Whether the current call should use the built-in API (no user key for active provider) */
export function shouldUseBuiltinApi(): boolean {
  const provider = getActiveProvider();
  return !hasStoredKey(provider);
}

/** Migrate: if old single key exists, move it to anthropic slot */
function migrateOldApiKey(): void {
  let old: string | null = null;
  old = safeGetItem('threadlog_api_key');
  if (!old) return;
  // Detect provider from key prefix
  if (old.startsWith('AIza')) {
    if (!getProviderApiKey('gemini')) setProviderApiKey('gemini', old);
  } else if (old.startsWith('sk-ant-')) {
    if (!getProviderApiKey('anthropic')) setProviderApiKey('anthropic', old);
  } else if (old.startsWith('sk-')) {
    if (!getProviderApiKey('openai')) setProviderApiKey('openai', old);
  } else {
    // Unknown prefix — put in current provider slot
    const active = getActiveProvider();
    if (!getProviderApiKey(active)) setProviderApiKey(active, old);
  }
  safeRemoveItem('threadlog_api_key');
}

// Run migration once on load
migrateOldApiKey();

export async function callProvider(req: ProviderRequest): Promise<string> {
  return callWithRetry(() => {
    // Use built-in API when no user key is configured
    if (shouldUseBuiltinApi()) {
      return callBuiltin(req);
    }

    const provider = getActiveProvider();
    switch (provider) {
      case 'anthropic':
        return callAnthropic(req);
      case 'openai':
        return callOpenAI(req);
      case 'gemini':
      default:
        return callGemini(req);
    }
  });
}

/** Streaming variant — calls onChunk with each text delta. Falls back to non-streaming for OpenAI. */
export async function callProviderStream(req: ProviderRequest, onChunk: StreamCallback): Promise<string> {
  return callWithRetry(() => {
    // Use built-in API when no user key is configured
    if (shouldUseBuiltinApi()) {
      return callBuiltinStream(req, onChunk);
    }

    const provider = getActiveProvider();
    if (provider === 'anthropic') {
      return callAnthropicStream(req, onChunk);
    }
    if (provider === 'gemini') {
      return callGeminiStream(req, onChunk);
    }
    // OpenAI streaming via SSE
    return callOpenAIStream(req, onChunk);
  });
}
