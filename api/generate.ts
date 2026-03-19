/**
 * Vercel Serverless Function — Gemini API Proxy
 *
 * Provides built-in AI without requiring users to bring their own API key.
 * Rate-limited per IP to control costs.
 */

export const config = { runtime: 'edge' };

// ---------------------------------------------------------------------------
// Rate limiting (in-memory, resets on cold start — acceptable for beta)
// ---------------------------------------------------------------------------

const DAILY_LIMIT_PER_IP = 20;
const GLOBAL_DAILY_LIMIT = 5000;
const DEBOUNCE_WINDOW_MS = 2_000; // reject duplicate requests within 2s

const ipCounts = new Map<string, { count: number; day: string }>();
let globalCounter = { count: 0, day: '' };

/** Track recent request hashes per IP to prevent rapid duplicate submissions */
const recentRequests = new Map<string, number>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Simple string hash (FNV-1a 32-bit) for deduplication */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const d = today();

  // Reset global counter on new day
  if (globalCounter.day !== d) {
    globalCounter = { count: 0, day: d };
    ipCounts.clear();
  }

  if (globalCounter.count >= GLOBAL_DAILY_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  const entry = ipCounts.get(ip);
  if (!entry || entry.day !== d) {
    ipCounts.set(ip, { count: 1, day: d });
    globalCounter.count++;
    return { allowed: true, remaining: DAILY_LIMIT_PER_IP - 1 };
  }

  if (entry.count >= DAILY_LIMIT_PER_IP) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  globalCounter.count++;
  return { allowed: true, remaining: DAILY_LIMIT_PER_IP - entry.count };
}

/** Check if this is a duplicate request within the debounce window */
function isDuplicateRequest(ip: string, bodyText: string): boolean {
  const key = `${ip}:${fnv1a(bodyText)}`;
  const now = Date.now();
  const lastSeen = recentRequests.get(key);
  if (lastSeen && now - lastSeen < DEBOUNCE_WINDOW_MS) {
    return true;
  }
  recentRequests.set(key, now);
  // Periodic cleanup: remove stale entries when map grows
  if (recentRequests.size > 1000) {
    for (const [k, ts] of recentRequests) {
      if (now - ts > DEBOUNCE_WINDOW_MS) recentRequests.delete(k);
    }
  }
  return false;
}

/** Build rate limit headers */
function rateLimitHeaders(remaining: number): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(DAILY_LIMIT_PER_IP),
    'X-RateLimit-Remaining': String(remaining),
  };
}

// ---------------------------------------------------------------------------
// Gemini models (same order as frontend — try newest first)
// ---------------------------------------------------------------------------

// 2.5-flash固定 — 旧モデルは出力フォーマットが不安定
const GEMINI_MODELS = ['gemini-2.5-flash'];

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = [
  'https://loresync.dev',
  'https://lore-app.vercel.app',
  'https://lore-lp-one.vercel.app',
];

function corsHeaders(origin: string): Record<string, string> {
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin') || '';
  const cors = corsHeaders(origin);

  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Built-in API not configured on server.' }),
      { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  // Extract IP — x-forwarded-for may contain multiple IPs; use the leftmost (client)
  // Also handle x-real-ip as fallback (some proxies use this instead)
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'unknown';

  // Rate limit
  const { allowed, remaining } = checkRateLimit(ip);
  const rlHeaders = rateLimitHeaders(remaining);
  if (!allowed) {
    return new Response(
      JSON.stringify({
        error: 'Daily limit reached. Set up your own free Gemini API key in Settings for unlimited use.',
      }),
      {
        status: 429,
        headers: {
          ...cors,
          ...rlHeaders,
          'Content-Type': 'application/json',
          'Retry-After': '86400',
        },
      },
    );
  }

  // Parse body
  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Failed to read request body' }),
      { status: 400, headers: { ...cors, ...rlHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Debounce: reject rapid duplicate requests from the same IP
  if (isDuplicateRequest(ip, bodyText)) {
    return new Response(
      JSON.stringify({ error: 'Duplicate request — please wait a moment before retrying.' }),
      { status: 429, headers: { ...cors, ...rlHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let body: { system?: string; userMessage?: string; maxTokens?: number; stream?: boolean };
  try {
    body = JSON.parse(bodyText);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...cors, ...rlHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { system, userMessage, maxTokens = 8192, stream = false } = body;
  if (!system || !userMessage) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: system, userMessage' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  if (typeof system !== 'string' || typeof userMessage !== 'string') {
    return new Response(
      JSON.stringify({ error: 'system and userMessage must be strings' }),
      { status: 400, headers: { ...cors, ...rlHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Input size validation
  const MAX_SYSTEM_BYTES = 10 * 1024; // 10 KB
  const MAX_USER_MESSAGE_BYTES = 100 * 1024; // 100 KB
  const MIN_MAX_TOKENS = 100;
  const MAX_MAX_TOKENS = 16384;

  if (new TextEncoder().encode(system).length > MAX_SYSTEM_BYTES) {
    return new Response(
      JSON.stringify({ error: `System prompt exceeds maximum size of ${MAX_SYSTEM_BYTES / 1024}KB.` }),
      { status: 400, headers: { ...cors, ...rlHeaders, 'Content-Type': 'application/json' } },
    );
  }
  if (new TextEncoder().encode(userMessage).length > MAX_USER_MESSAGE_BYTES) {
    return new Response(
      JSON.stringify({ error: `User message exceeds maximum size of ${MAX_USER_MESSAGE_BYTES / 1024}KB.` }),
      { status: 400, headers: { ...cors, ...rlHeaders, 'Content-Type': 'application/json' } },
    );
  }
  if (typeof maxTokens === 'number' && (maxTokens < MIN_MAX_TOKENS || maxTokens > MAX_MAX_TOKENS)) {
    return new Response(
      JSON.stringify({ error: `maxTokens must be between ${MIN_MAX_TOKENS} and ${MAX_MAX_TOKENS}.` }),
      { status: 400, headers: { ...cors, ...rlHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const geminiBody = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  // Try each model in order, fall back on 404
  for (const model of GEMINI_MODELS) {
    const endpoint = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpoint}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(geminiBody),
    });

    if (res.status === 404) continue; // model not available, try next

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return new Response(text, {
        status: res.status,
        headers: { ...cors, ...rlHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (stream) {
      // Pass through SSE stream
      return new Response(res.body, {
        headers: {
          ...cors,
          ...rlHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });
    } else {
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: {
          ...cors,
          ...rlHeaders,
          'Content-Type': 'application/json',
        },
      });
    }
  }

  return new Response(
    JSON.stringify({ error: 'No Gemini models available.' }),
    { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } },
  );
}
