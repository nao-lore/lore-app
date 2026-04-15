/**
 * Regex utilities for the Lore MCP Server.
 *
 * @since 0.1.0
 */

/**
 * Escapes all regex metacharacters in a string so it can be used as a
 * literal match pattern in `new RegExp(...)`.
 *
 * Prevents regex-injection when user-supplied query strings are used directly
 * in regular expressions.
 *
 * @param s - Raw string to escape
 * @returns String with all `[.*+?^${}()|[\]\\]` characters escaped
 *
 * @example
 * ```ts
 * const pattern = new RegExp(escapeRegExp('price (USD)'), 'i');
 * pattern.test('total price (USD): 42'); // true
 * ```
 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
