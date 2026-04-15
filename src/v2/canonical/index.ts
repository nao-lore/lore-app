/**
 * Canonical JSON and state hash utilities for Lore v2.
 *
 * This module implements RFC 8785 JSON Canonicalization Scheme (JCS) and
 * SHA-256 state hashes used by the {@link Checkpoint} tamper-detection system.
 *
 * ## Quick start
 * ```ts
 * import { computeMessageStateHash, computeExtractionStateHash } from './canonical';
 *
 * const msgHash = computeMessageStateHash(messages);
 * const extHash = computeExtractionStateHash({ decisions, todos, blockers, learnings });
 * ```
 *
 * ## Module structure
 * - `jcs.ts` — Pure RFC 8785 serializer (`canonicalJSONStringify`)
 * - `hash.ts` — SHA-256 wrapper (`sha256Hex`)
 * - `state-hashes.ts` — Checkpoint hash computation (`computeMessageStateHash`, `computeExtractionStateHash`)
 *
 * @see ADR-0003 — RFC 8785 Canonical JSON
 * @since 0.2.0
 */

export { canonicalJSONStringify } from './jcs';
export { sha256Hex } from './hash';
export {
  computeMessageStateHash,
  computeExtractionStateHash,
  withoutUpdatedAt,
} from './state-hashes';
