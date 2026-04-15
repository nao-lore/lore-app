/**
 * Typed error hierarchy for Lore v2 domain operations.
 *
 * Use `LoreError` as the error type in `Result<T, LoreError>`.
 * Never leak raw Error objects or stack traces to callers — wrap them
 * in a typed code + cause.
 *
 * @example
 * ```ts
 * import type { LoreError } from './errors';
 * import { err } from './result';
 *
 * if (messageIds.length === 0) {
 *   return err({ code: 'PROVENANCE_INVALID', message_ids_count: 0 });
 * }
 * ```
 */

import type { SessionId } from './schemas/ids';

export type LoreError =
  /** A Zod or manual validation failure. */
  | { readonly code: 'VALIDATION_FAILED'; readonly field: string; readonly reason: string }
  /** The requested session does not exist in the DB. */
  | { readonly code: 'SESSION_NOT_FOUND'; readonly id: SessionId }
  /** A checkpoint hash read from the DB does not match the recomputed value. */
  | { readonly code: 'CHECKPOINT_HASH_MISMATCH'; readonly expected: string; readonly actual: string }
  /**
   * A Provenance object has zero message_ids.
   * All derived entities (Decision, Todo, Blocker, Learning) must have ≥1 source message.
   */
  | { readonly code: 'PROVENANCE_INVALID'; readonly message_ids_count: number }
  /** The migration from v1 to v2 failed for a specific entry. */
  | { readonly code: 'MIGRATION_FAILED'; readonly from: number; readonly to: number; readonly cause: string }
  /** IndexedDB storage quota was exceeded. */
  | { readonly code: 'DB_QUOTA_EXCEEDED' }
  /** A floating-point number was passed to the canonical JSON serializer. */
  | { readonly code: 'CANONICAL_FLOAT_NOT_ALLOWED'; readonly path: string }
  /** A repository operation failed at the storage layer. */
  | { readonly code: 'STORAGE_ERROR'; readonly cause: string };

/**
 * Exhaustive switch helper — ensures all LoreError codes are handled.
 *
 * @example
 * ```ts
 * switch (error.code) {
 *   case 'SESSION_NOT_FOUND': return notFound();
 *   // ... all cases
 *   default: return assertNeverError(error);
 * }
 * ```
 */
export function assertNeverError(error: never): never {
  throw new Error(`Unhandled LoreError: ${JSON.stringify(error)}`);
}
