/**
 * normalizeInput — basic text normalization applied before AI processing.
 *
 * Ensures consistent Unicode form and cleans up common formatting noise
 * that can waste tokens or confuse AI models.
 */

/**
 * Normalize input text before sending to AI:
 * 1. Unicode NFC normalization (canonical decomposition + composition)
 * 2. Collapse 3+ consecutive blank lines into 2 (preserves paragraph breaks)
 * 3. Convert common smart quotes/dashes to ASCII equivalents
 */
export function normalizeInput(text: string): string {
  // 1. Unicode NFC normalization — ensures consistent character representation
  let result = text.normalize('NFC');

  // 2. Collapse 3+ consecutive blank lines into 2 (keeps paragraph structure)
  result = result.replace(/\n{3,}/g, '\n\n');

  // 3. Smart quotes → ASCII quotes (common in copy-paste from Word/macOS)
  result = result
    .replace(/[\u2018\u2019\u201A]/g, "'")   // ', ', ‚ → '
    .replace(/[\u201C\u201D\u201E]/g, '"')   // ", ", „ → "
    .replace(/[\u2013\u2014]/g, '-')          // –, — → -
    .replace(/\u2026/g, '...');               // … → ...

  return result;
}
