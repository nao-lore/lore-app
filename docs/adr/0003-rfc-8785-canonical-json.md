# ADR 0003: RFC 8785 Canonical JSON for State Hashes

## Status

Accepted — 2026-04-15

## Context

Lore v2 Checkpoints carry two SHA-256 state hashes (`message_state_hash`, `extraction_state_hash`) that let us detect tampering and verify replay consistency. For those hashes to be useful they must be:

1. **Deterministic** — the same logical state must produce the same hash across runs, platforms, JS engines, and object property insertion orders.
2. **Round-trippable** — a dataset written on one device and hashed on another must agree.
3. **Audit-explainable** — an external reviewer must be able to re-compute the hash from the canonical representation.

Native `JSON.stringify` is insufficient on all three counts: property order is implementation-defined, number formatting varies subtly at the edges (e.g. `-0`), and there is no normalization of strings with Unicode composition differences.

## Decision

Implement RFC 8785 — JSON Canonicalization Scheme (JCS) — with the following additional project-specific constraints:

1. **Object keys sorted by UTF-16 code-unit order** (RFC 8785 §3.2.3).
2. **Strings NFC-normalized** before serialization (RFC 8785 §3.2.2). Without this, `"café"` composed as `U+00E9` vs decomposed `"cafe\u0301"` would hash differently.
3. **Floating-point numbers rejected** at serialization time — Lore v2 stores every numeric field as an integer (`EpochMs`, `UsdMicros`, `tokens.*`, `confidence` in basis-points). This is stricter than RFC 8785, which permits floats via the ECMAScript 6.1 algorithm, but sidesteps the entire "exactly which float string representation is canonical" class of bugs and keeps our hashes defensible without depending on ES-numeric edge cases.
4. **`NaN` / `Infinity` rejected** (as per RFC 8785).
5. **`undefined`, functions, symbols rejected** (programmer-error guard).

Hash function is SHA-256 via `@noble/hashes/sha2` — a pure-JS, audited, zero-WASM implementation that works identically in browser and Node.js. Verified against the NIST FIPS 180-4 known-answer test vectors.

For checkpoint hashing we further canonicalize the input entity set:

- Messages: sorted by `id`; `updated_at` stripped; `content_blocks` of `type: 'thinking'` stripped; `id` fields of `type: 'tool_use'` stripped (see §1.3 of the v2 spec).
- Extractions (Decisions / Todos / Blockers / Learnings): sorted by `id`; `updated_at` stripped.

## Consequences

### Good

- Cross-device checkpoint hashes agree bit-for-bit.
- Tamper detection: any modification to a message or extraction changes the checkpoint hash.
- Audit-friendly — a reviewer can serialize the entities independently and verify the hash.
- Float rejection surfaces accidental non-integer data at write time rather than as a hash mismatch at replay time.

### Neutral

- Our `confidence` field was re-modeled from `[0, 1]` float to `[0, 10000]` integer basis-points. Semantically equivalent; explicitly documented in `Provenance`'s TSDoc.

### Bad

- Slightly stricter than RFC 8785. Another implementation following only the RFC would accept floats that we reject — fine for our first-party use, but an external MCP client sending floats would hit a runtime error. Mitigated by returning structured `LoreError.code = 'CANONICAL_FLOAT_NOT_ALLOWED'` with the offending path.
- Requires NFC normalization path, which costs a string pass per serialized string. Negligible for realistic checkpoint sizes (<10k messages).

## Alternatives Considered

1. **Native `JSON.stringify` with sorted keys helper** — rejected: doesn't normalize Unicode; doesn't standardize number formatting; non-deterministic across Node versions.
2. **Protobuf / CBOR with deterministic encoding** — rejected: introduces a binary format and code-gen pipeline for a problem we can solve in ~100 lines of JS. Also loses human-readable audit.
3. **RFC 8785 exactly as specified (accepting floats)** — rejected: our data model has no float fields. Rejecting them at the canonicalizer prevents a class of bug where a rounding error in a JSON path changes the hash without changing the observable value.
4. **JSON-LD with signed-documents profile** — rejected: vastly over-engineered; requires vocabulary registration and context documents for single-app use.
5. **Custom order-preserving serializer** — rejected: RFC 8785 is an IETF standard with multiple independent implementations and published test vectors. Reinventing loses standards-compatibility for no gain.

## References

- RFC 8785 — JSON Canonicalization Scheme: <https://datatracker.ietf.org/doc/html/rfc8785>
- RFC 8785 Appendix B test vectors
- NIST FIPS 180-4 §6.2 test vectors for SHA-256
- Noble hashes: <https://github.com/paulmillr/noble-hashes>
- Implementation: `src/v2/canonical/`
