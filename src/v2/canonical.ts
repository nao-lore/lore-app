/**
 * @deprecated Import from `./canonical/` instead.
 *
 * This file is a backward-compatibility re-export shim. The canonical
 * implementation has been split into focused modules:
 * - `./canonical/jcs.ts`          — RFC 8785 serializer
 * - `./canonical/hash.ts`         — sha256Hex wrapper
 * - `./canonical/state-hashes.ts` — computeMessageStateHash / computeExtractionStateHash
 *
 * @since 0.2.0
 */

export {
  canonicalJSONStringify,
  sha256Hex,
  computeMessageStateHash,
  computeExtractionStateHash,
  withoutUpdatedAt,
} from './canonical/index';
