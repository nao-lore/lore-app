/**
 * JSON repair utilities — fix common AI response issues.
 *
 * Contains both the simple repairJson (used by transform.ts) and the
 * more sophisticated tryRepairJson / balanceBrackets / fixTruncatedStrings
 * (extracted from chunkEngine.ts).
 */

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

  // Balance unclosed brackets/braces (string-aware)
  s = balanceBrackets(s);

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

// =============================================================================
// Advanced JSON repair (extracted from chunkEngine.ts)
// =============================================================================

/** Find the index of the closing '}' that matches the first '{' via bracket-counting */
export function findMatchingBrace(text: string): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth === 0) return i; }
  }
  return -1; // no matching brace found (incomplete JSON)
}

/** Balance unclosed brackets/braces for incomplete JSON */
export function balanceBrackets(text: string): string {
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') braceCount++;
    else if (ch === '}') braceCount--;
    else if (ch === '[') bracketCount++;
    else if (ch === ']') bracketCount--;
  }
  // If we're still inside a string, close it
  let result = text;
  if (inString) result += '"';
  while (bracketCount > 0) { result += ']'; bracketCount--; }
  while (braceCount > 0) { result += '}'; braceCount--; }
  return result;
}

/** Fix truncated string values — if the last token is an unclosed string, close it */
export function fixTruncatedStrings(text: string): string {
  // Remove trailing incomplete key-value pairs
  // e.g., {"a":"b","c":"trun  -> {"a":"b"}
  let result = text;
  // Try closing an open string and removing trailing incomplete content
  const lastQuote = result.lastIndexOf('"');
  if (lastQuote > 0) {
    // Check if this quote opens a string (odd number of unescaped quotes after it)
    const after = result.slice(lastQuote + 1);
    // If after the last quote there are only whitespace/brackets, string is closed
    // If there's non-bracket content, the string might be truncated
    if (after.trim() && !/^[}\],\s]*$/.test(after.trim())) {
      // Truncated mid-string — close the string and balance
      result = result + '"';
      result = balanceBrackets(result);
    }
  }
  return result;
}

/**
 * Lightweight local JSON repair — fixes common model output issues without API call.
 * Returns a parsed object on success, null if repair is not possible.
 */
export function tryRepairJson(raw: string): Record<string, unknown> | null {
  let text = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Find the first '{'
  const start = text.indexOf('{');
  if (start === -1) return null;
  text = text.slice(start);

  // Strip trailing text after valid JSON using bracket-counting
  // This handles: trailing prose, multiple concatenated JSON objects
  const end = findMatchingBrace(text);
  if (end !== -1) {
    text = text.slice(0, end + 1);
  } else {
    // No matching close brace found — incomplete JSON, balance brackets
    text = balanceBrackets(text);
  }

  // Fix trailing commas before } or ]
  text = text.replace(/,\s*([}\]])/g, '$1');

  // Fix unescaped newlines inside string values
  text = text.replace(/:\s*"([^"]*)\n([^"]*)"/g, (_m, a, b) => `: "${a}\\n${b}"`);

  // Fix single quotes used as string delimiters (common LLM mistake)
  // Only replace when it looks like a JSON key/value pattern
  text = text.replace(/(?<=[:,[{]\s*)'([^']*)'/g, '"$1"');

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Second attempt: try to fix truncated string values
    // If JSON ends mid-string (no closing quote), close it
    const fixedTruncated = fixTruncatedStrings(text);
    if (fixedTruncated !== text) {
      try {
        const parsed = JSON.parse(fixedTruncated);
        if (typeof parsed === 'object' && parsed !== null) {
          return parsed as Record<string, unknown>;
        }
      } catch { /* fall through */ }
    }
    if (import.meta.env.DEV) console.warn('[jsonRepair] JSON repair failed');
  }
  return null;
}
