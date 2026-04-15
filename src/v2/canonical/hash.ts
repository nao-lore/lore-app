/**
 * SHA-256 hashing utilities for Lore v2 canonical state hashes.
 *
 * Uses `@noble/hashes/sha2.js` — a pure-JS, audited, zero-WASM implementation
 * that works in both browser and Node.js without build-tool special-casing.
 *
 * ## Why @noble/hashes
 * - Pure JS: no native bindings, no WASM, works in all environments
 * - Audited: has undergone external security audits
 * - Tree-shakeable: imports only the sha256 function
 * - Faster than WebCrypto for small inputs (<1KB) due to zero async overhead
 *
 * @see https://github.com/paulmillr/noble-hashes
 * @see ADR-0003 — RFC 8785 Canonical JSON
 * @since 0.2.0
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { SHA256Hex } from '../schemas/primitives';

/**
 * Computes the SHA-256 digest of a UTF-8 string or raw byte array,
 * returning a 64-character lowercase hexadecimal string.
 *
 * Synchronous — suitable for main-thread use with small inputs.
 * For inputs exceeding ~10MB, consider moving to a Worker.
 *
 * @param input - UTF-8 string or raw bytes to hash
 * @returns 64-char lowercase hex SHA-256 digest
 *
 * @example
 * ```ts
 * sha256Hex('');
 * // 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
 *
 * sha256Hex('hello');
 * // '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
 *
 * sha256Hex(new TextEncoder().encode('hello'));
 * // same as above
 * ```
 *
 * @since 0.2.0
 */
export function sha256Hex(input: string | Uint8Array): SHA256Hex {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : input;
  return bytesToHex(sha256(bytes)) as SHA256Hex;
}
