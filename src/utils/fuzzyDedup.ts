/**
 * Fuzzy deduplication — removes items that share significant keyword overlap.
 * Works for both Japanese and English text.
 *
 * Uses Jaccard similarity on extracted keywords. Threshold is configurable:
 * - 0.6 (default): good balance for merge dedup in chunk engine
 * - 0.4-0.5: aggressive dedup for user-facing lists
 * - 0.7-0.8: conservative, only removes near-exact matches
 */

/** Default similarity threshold for fuzzy dedup */
export const DEFAULT_FUZZY_THRESHOLD = 0.6;

/** Extract significant keywords from text (2+ chars for CJK, filtered by stop words) */
function extractKeywords(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[()（）「」『』、。,.;:：・\-–—[\]{}!?！？]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 1);

  // Filter stop words, then remove single-char non-CJK tokens (English articles etc.)
  // CJK single-char tokens that aren't stop words are kept as they carry meaning
  return new Set(tokens.filter(w => {
    if (STOP_WORDS.has(w)) return false;
    // Keep CJK single-char tokens (they carry meaning), filter short ASCII tokens
    if (w.length < 2) {
      const code = w.charCodeAt(0);
      return code >= 0x3000; // Keep CJK range (hiragana, katakana, kanji, etc.)
    }
    return true;
  }));
}

/** Stop words for English and CJK languages */
const STOP_WORDS = new Set([
  // English function words
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was',
  'will', 'has', 'have', 'been', 'not', 'but', 'also', 'into',
  'more', 'some', 'when', 'than', 'then', 'just', 'only',
  // Japanese basic particles (single-char)
  'は', 'が', 'を', 'に', 'へ', 'で', 'と', 'も', 'の', 'や',
  // Japanese particles and auxiliaries
  'する', 'した', 'して', 'ている', 'ない', 'ある', 'いる',
  'これ', 'それ', 'この', 'その', 'など', 'として', 'について', 'ため',
  'から', 'まで', 'より', 'ので', 'けど', 'でも', 'だが', 'しかし',
  'ところ', 'こと', 'もの', 'よう', 'ほう', 'ほど', 'くらい',
  'られる', 'される', 'できる', 'なる', 'おく', 'みる', 'いく',
  'という', 'といった', 'における', 'に対して', 'に関して',
  // Chinese common function words
  '的', '了', '在', '是', '我', '他', '她', '它', '们',
  '这', '那', '有', '和', '与', '或', '但', '而', '也',
  // Korean common particles
  '은', '는', '이', '가', '을', '를', '에', '의', '와', '과',
]);

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
