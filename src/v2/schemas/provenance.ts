/**
 * Provenance — the core concept of Lore v2.
 *
 * Every extracted entity (Decision, Todo, Blocker, Learning) carries a
 * `derived_from: Provenance` field that links it back to the source messages
 * it was extracted from. This is the structural feature that separates Lore
 * from plain markdown notes: the provenance chain is enforced at the Zod
 * schema level, not just by convention.
 *
 * ## Invariants
 * - `message_ids.length >= 1` — an extraction with zero source messages
 *   is meaningless and rejected at parse time.
 * - `confidence` is an integer in `[0, 10000]` basis-points (0 = never, 10000 = certain).
 *   Stored as integer to preserve determinism under RFC 8785 canonical JSON hashing
 *   (floats are rejected by the canonical serializer — see ADR-0003).
 * - `extractor_prompt_hash` is a SHA-256 hex of the exact prompt used, enabling
 *   reproducibility audits when prompts change.
 *
 * @see ADR-0003 — RFC 8785 Canonical JSON (provenance participates in extraction_state_hash)
 * @since 0.2.0
 */

import { z } from 'zod';
import { SHA256Hex, EpochMs } from './primitives';
import { MessageId } from './ids';

/**
 * Provenance metadata attached to every derived entity.
 *
 * Records which messages the entity was extracted from, which model/prompt
 * version performed the extraction, and the extractor's confidence.
 *
 * @example
 * ```ts
 * const provenance: Provenance = {
 *   message_ids: ['01ABCDEFGHJKMNPQRSTVWXYZ01' as MessageId],
 *   extractor_model: 'claude-opus-4-6',
 *   extractor_prompt_hash: 'a3f1...',  // sha256 of the extraction prompt
 *   confidence: 9200,  // 92.00% in basis-points
 *   extracted_at: Date.now(),
 * };
 * ```
 */
export const Provenance = z.object({
  /**
   * IDs of the messages this entity was derived from.
   * At least one message ID is required — zero-source extractions are invalid.
   */
  message_ids: z.array(MessageId).min(1),
  /**
   * Identifier of the model that performed extraction (e.g. `"claude-opus-4-6"`).
   * Non-empty string; used for auditing prompt version drift.
   */
  extractor_model: z.string().min(1),
  /**
   * SHA-256 hex of the exact extraction prompt text.
   * Enables detection of prompt changes that might affect extraction quality.
   */
  extractor_prompt_hash: SHA256Hex,
  /**
   * Model-reported confidence in the extraction, as integer basis-points in
   * the range `[0, 10000]`. `10000` = certain, `0` = completely uncertain.
   *
   * Integer (not float) so that Provenance participates in RFC 8785 canonical
   * JSON hashing without violating the "integers only" rule. See ADR-0003.
   */
  confidence: z.number().int().min(0).max(10000),
  /**
   * When the extraction was performed, as epoch milliseconds.
   */
  extracted_at: EpochMs,
});

export type Provenance = z.infer<typeof Provenance>;
