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
const GLOBAL_DAILY_LIMIT = 500;

const ipCounts = new Map<string, { count: number; day: string }>();
let globalCounter = { count: 0, day: '' };

function today(): string {
  return new Date().toISOString().slice(0, 10);
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

// ---------------------------------------------------------------------------
// Gemini models (same order as frontend — try newest first)
// ---------------------------------------------------------------------------

// 2.5-flash固定 — 旧モデルは出力フォーマットが不安定
const GEMINI_MODELS = ['gemini-2.5-flash'];

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = [
  'https://lore-app.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
];

function corsHeaders(origin: string): Record<string, string> {
  const allowed = ALLOWED_ORIGINS.some((o) => origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

  // Rate limit
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const { allowed, remaining } = checkRateLimit(ip);
  if (!allowed) {
    return new Response(
      JSON.stringify({
        error: 'Daily limit reached. Set up your own free Gemini API key in Settings for unlimited use.',
      }),
      { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  // Parse body
  let body: { system?: string; userMessage?: string; maxTokens?: number; stream?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  const { system, userMessage, maxTokens = 8192, stream = false } = body;
  if (!system || !userMessage) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: system, userMessage' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
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
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (stream) {
      // Pass through SSE stream
      return new Response(res.body, {
        headers: {
          ...cors,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-RateLimit-Remaining': String(remaining),
        },
      });
    } else {
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: {
          ...cors,
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': String(remaining),
        },
      });
    }
  }

  return new Response(
    JSON.stringify({ error: 'No Gemini models available.' }),
    { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } },
  );
}
