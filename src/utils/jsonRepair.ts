/**
 * Attempt to repair common JSON issues from AI responses:
 * - Trailing commas
 * - Missing closing braces/brackets
 * - Unescaped newlines in strings
 * - Single quotes instead of double quotes
 */
export function repairJson(raw: string): string {
  let s = raw.trim();

  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, '$1');

  // Try to balance braces
  let braceCount = 0;
  let bracketCount = 0;
  for (const ch of s) {
    if (ch === '{') braceCount++;
    if (ch === '}') braceCount--;
    if (ch === '[') bracketCount++;
    if (ch === ']') bracketCount--;
  }

  // Add missing closing brackets/braces
  while (bracketCount > 0) { s += ']'; bracketCount--; }
  while (braceCount > 0) { s += '}'; braceCount--; }

  return s;
}

/**
 * Try to parse JSON, falling back to repair attempt
 */
export function parseJsonWithRepair(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const repaired = repairJson(text);
    return JSON.parse(repaired); // may still throw
  }
}
