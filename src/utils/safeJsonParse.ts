/**
 * Safe JSON parsing — returns a fallback value instead of throwing on invalid input.
 * Use this instead of raw try/catch JSON.parse blocks in storage modules.
 */
export function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; }
  catch { return fallback; }
}
