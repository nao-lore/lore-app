/**
 * Fuzzy deduplication — removes items that share significant keyword overlap.
 * Works for both Japanese and English text.
 */

/** Extract significant keywords from text (2+ chars for CJK, filtered by stop words) */
function extractKeywords(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[()（）「」『』、。,.;:：・\-–—[\]{}!?！？]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);

  const stops = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was',
    'will', 'has', 'have', 'been',
    'する', 'した', 'して', 'ている', 'ない', 'ある', 'いる',
    'これ', 'それ', 'この', 'その', 'など', 'として', 'について', 'ため',
  ]);

  return new Set(tokens.filter(w => !stops.has(w)));
}

/** Calculate Jaccard similarity between two keyword sets */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) {
    if (b.has(w)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Remove fuzzy duplicates from a string array.
 * Items with Jaccard similarity > threshold are considered duplicates.
 * The first occurrence is kept.
 */
export function fuzzyDedupStrings(items: string[], threshold = 0.6): string[] {
  if (items.length <= 1) return items;

  const keywordSets = items.map(extractKeywords);
  const result: string[] = [];
  const kept: number[] = [];

  for (let i = 0; i < items.length; i++) {
    let isDuplicate = false;
    for (const k of kept) {
      if (jaccardSimilarity(keywordSets[i], keywordSets[k]) > threshold) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      result.push(items[i]);
      kept.push(i);
    }
  }

  return result;
}

/** Fuzzy dedup for objects with a text field */
export function fuzzyDedupByField<T>(items: T[], getField: (item: T) => string, threshold = 0.6): T[] {
  if (items.length <= 1) return items;

  const texts = items.map(getField);
  const keywordSets = texts.map(extractKeywords);
  const result: T[] = [];
  const kept: number[] = [];

  for (let i = 0; i < items.length; i++) {
    let isDuplicate = false;
    for (const k of kept) {
      if (jaccardSimilarity(keywordSets[i], keywordSets[k]) > threshold) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      result.push(items[i]);
      kept.push(i);
    }
  }

  return result;
}
