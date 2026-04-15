/**
 * Checkpoint state hash computation for Lore v2.
 *
 * Two state hashes are computed for each {@link Checkpoint}:
 *
 * ### message_state_hash
 * `sha256(canonicalJSON(messages_sorted_by_id))`
 *
 * Covers all messages reachable from the checkpoint. Exclusions:
 * - `content_blocks` of type `'thinking'` (non-reproducible across retries — spec Q1)
 * - `content_blocks[*].id` on `tool_use` blocks (ephemeral provider IDs)
 *
 * ### extraction_state_hash
 * `sha256(canonicalJSON({ decisions, todos, blockers, learnings }))`
 *
 * Each array is sorted by entity ID before hashing. Exclusions:
 * - `updated_at` on all entities (bookkeeping mutation, not semantic change)
 *
 * ## Hash stability guarantee
 * The same logical state will always produce the same hash, regardless of:
 * - Array insertion order
 * - When `updated_at` was last touched
 * - Which thinking blocks were emitted (non-deterministic across retries)
 * - Which ephemeral tool_use IDs were assigned
 *
 * @see ADR-0003 — RFC 8785 Canonical JSON
 * @since 0.2.0
 */

import { canonicalJSONStringify } from './jcs';
import { sha256Hex } from './hash';
import type { Message, Decision, Todo, Blocker, Learning } from '../schemas/entities';
import type { SHA256Hex } from '../schemas/primitives';

// ---------------------------------------------------------------------------
// Internal: canonical preparation helpers
// ---------------------------------------------------------------------------

/**
 * Strips `updated_at` from any entity object before canonicalization.
 * `updated_at` changes on every write and would cause spurious hash changes
 * unrelated to semantic content.
 *
 * @param obj - Entity object that may have an `updated_at` field
 * @returns A copy of `obj` without `updated_at`
 * @since 0.2.0
 */
export function withoutUpdatedAt<T extends object>(obj: T): Omit<T, 'updated_at'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { updated_at: _excluded, ...rest } = obj as T & { updated_at?: unknown };
  return rest as Omit<T, 'updated_at'>;
}

/**
 * Prepares a single {@link Message} for canonical hashing.
 *
 * Transformations applied:
 * 1. `thinking` blocks removed entirely
 * 2. `id` field removed from `tool_use` blocks
 *
 * @param msg - Message to prepare
 * @returns A plain object safe to pass to {@link canonicalJSONStringify}
 */
function prepareMessageForHash(msg: Message): unknown {
  const contentBlocks = msg.content_blocks
    .filter(block => block.type !== 'thinking')
    .map(block => {
      if (block.type === 'tool_use') {
        // Remove ephemeral provider-assigned id — only name and input are semantic
        const { id: _excluded, ...rest } = block;
        return rest;
      }
      return block;
    });

  return {
    id: msg.id,
    session_id: msg.session_id,
    parent_message_id: msg.parent_message_id,
    role: msg.role,
    provider: msg.provider,
    model: msg.model,
    content_blocks: contentBlocks,
    tokens: msg.tokens,
    cost_usd_micros: msg.cost_usd_micros,
    latency_ms: msg.latency_ms,
    created_at: msg.created_at,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes the `message_state_hash` for a {@link Checkpoint}.
 *
 * Hash is stable regardless of the input array order — messages are sorted
 * by ID before canonicalization. Thinking blocks and `tool_use.id` are
 * excluded per spec §1.3.
 *
 * @param messages - All messages reachable from the checkpoint, in any order.
 *   Pass an empty array to get the hash of an empty session.
 * @returns 64-char lowercase hex SHA-256 digest
 * @throws {Error} If any message contains a floating-point number
 *   (data model violation — all numeric fields must be integers)
 *
 * @example
 * ```ts
 * const hash = computeMessageStateHash([msg1, msg2]);
 * // '1a2b3c4d...' (64 hex chars)
 * ```
 *
 * @since 0.2.0
 */
export function computeMessageStateHash(messages: readonly Message[]): SHA256Hex {
  const sorted = [...messages].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  const prepared = sorted.map(prepareMessageForHash);
  const json = canonicalJSONStringify(prepared);
  return sha256Hex(json);
}

/**
 * Computes the `extraction_state_hash` for a {@link Checkpoint}.
 *
 * Hash is stable regardless of array order — each category is sorted by
 * entity ID before canonicalization. `updated_at` is excluded from all
 * entities so bookkeeping mutations don't invalidate the hash.
 *
 * @param input - The active extracted entities at this checkpoint.
 * @param input.decisions - Active decisions (any status)
 * @param input.todos - Open todos
 * @param input.blockers - Open blockers
 * @param input.learnings - Learnings in the session
 * @returns 64-char lowercase hex SHA-256 digest
 * @throws {Error} If any entity contains a floating-point number
 *
 * @example
 * ```ts
 * const hash = computeExtractionStateHash({
 *   decisions: [decision1, decision2],
 *   todos: [todo1],
 *   blockers: [],
 *   learnings: [learning1],
 * });
 * ```
 *
 * @since 0.2.0
 */
export function computeExtractionStateHash(input: {
  readonly decisions: readonly Decision[];
  readonly todos: readonly Todo[];
  readonly blockers: readonly Blocker[];
  readonly learnings: readonly Learning[];
}): SHA256Hex {
  const sortById = <T extends { readonly id: string }>(arr: readonly T[]): T[] =>
    [...arr].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const payload = {
    decisions: sortById(input.decisions).map(withoutUpdatedAt),
    todos: sortById(input.todos).map(withoutUpdatedAt),
    blockers: sortById(input.blockers).map(withoutUpdatedAt),
    // Learning has no updated_at — identity mapping is fine
    learnings: sortById(input.learnings),
  };

  const json = canonicalJSONStringify(payload);
  return sha256Hex(json);
}
