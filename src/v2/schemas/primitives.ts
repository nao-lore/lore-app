/**
 * Primitive scalar types shared across the Lore v2 data model.
 *
 * These are the building blocks for all entity schemas. Import from
 * `./schemas` (barrel) rather than this file directly.
 *
 * @see {@link ./ids} for branded entity ID types
 * @since 0.2.0
 */

import { z } from 'zod';

/**
 * Crockford Base32 ULID — 26 uppercase characters from the restricted
 * alphabet `0-9A-HJKMNP-TV-Z` (excludes I, L, O, U to reduce transcription errors).
 *
 * Used as the unbranded base for entity-specific branded IDs in `./ids.ts`.
 * Prefer the branded variants (e.g. {@link SessionId}) for function parameters
 * so the compiler rejects accidental cross-entity ID substitution.
 *
 * @example
 * ```ts
 * ULID.parse('01ABCDEFGHJKMNPQRSTVWXYZ01'); // ok
 * ULID.parse('tooshort');                    // throws ZodError
 * ```
 */
export const ULID = z.string().length(26).regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

/**
 * 64-character lowercase hexadecimal string representing a SHA-256 digest.
 *
 * Used for `message_state_hash` and `extraction_state_hash` on
 * {@link Checkpoint}, and for `extractor_prompt_hash` on {@link Provenance}.
 *
 * @example
 * ```ts
 * SHA256Hex.parse('a'.repeat(64)); // ok
 * SHA256Hex.parse('A'.repeat(64)); // throws — uppercase not allowed
 * ```
 */
export const SHA256Hex = z.string().length(64).regex(/^[a-f0-9]{64}$/);

/**
 * Unix epoch timestamp in milliseconds as a positive integer.
 *
 * All date/time fields in Lore v2 use epoch ms (not ISO strings) for
 * consistent serialization and canonical JSON hashing. Convert via
 * `Date.now()` or `new Date(iso).getTime()`.
 *
 * @example
 * ```ts
 * EpochMs.parse(Date.now()); // ok
 * EpochMs.parse(0);          // throws — must be positive
 * EpochMs.parse(1234.5);     // throws — must be integer
 * ```
 */
export const EpochMs = z.number().int().positive();

/**
 * ISO 8601 UTC datetime string with no timezone offset.
 * Must end in `Z` (e.g. `"2026-04-15T10:00:00.000Z"`).
 *
 * Used for human-readable display fields only; internal timestamps
 * use {@link EpochMs}.
 *
 * @example
 * ```ts
 * ISO8601UTC.parse('2026-04-15T10:00:00.000Z'); // ok
 * ISO8601UTC.parse('2026-04-15T10:00:00+09:00'); // throws — offset not allowed
 * ```
 */
export const ISO8601UTC = z.string().datetime({ offset: false });

/**
 * Non-negative integer representing a USD amount in microdollars.
 * 1 USD = 1,000,000 micros. Avoids floating-point imprecision
 * and satisfies the RFC 8785 integer-only constraint for canonical hashing.
 *
 * @example
 * ```ts
 * UsdMicros.parse(1_000_000); // ok — $1.00
 * UsdMicros.parse(0);         // ok — free
 * UsdMicros.parse(-1);        // throws — must be non-negative
 * UsdMicros.parse(0.5);       // throws — must be integer
 * ```
 */
export const UsdMicros = z.number().int().nonnegative();

export type ULID = z.infer<typeof ULID>;
export type SHA256Hex = z.infer<typeof SHA256Hex>;
export type EpochMs = z.infer<typeof EpochMs>;
export type ISO8601UTC = z.infer<typeof ISO8601UTC>;
export type UsdMicros = z.infer<typeof UsdMicros>;
