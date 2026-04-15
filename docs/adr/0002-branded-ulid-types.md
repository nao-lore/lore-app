# ADR 0002: Branded ULID Types for Entity IDs

## Status

Accepted — 2026-04-15

## Context

Lore v2 introduces eight entity types (`Session`, `Message`, `Checkpoint`, `Decision`, `Todo`, `Blocker`, `Learning`, `Project`), each identified by a ULID — a 26-character lexicographically sortable string.

With plain `string` or a single shared `ULID` alias, TypeScript silently allows mixing IDs from different entities. A function that expects a `SessionId` will accept a `MessageId` because both are `string`. Bugs only surface at runtime when repository queries return nothing or write the wrong record — exactly the kind of failure that is expensive to diagnose and impossible to bisect.

We need compile-time separation between ID namespaces without heavy wrapper objects or runtime overhead.

## Decision

Use Zod's `.brand<T>()` mechanism to create structurally-distinct types at the type-system level while keeping the runtime value a plain string:

```ts
export const SessionId = z.string().length(26).brand<'SessionId'>();
export type  SessionId = z.infer<typeof SessionId>;

export const MessageId = z.string().length(26).brand<'MessageId'>();
export type  MessageId = z.infer<typeof MessageId>;
// …six more
```

Call sites use `as SessionId` to narrow a validated string into the branded type, or `SessionId.parse(raw)` for runtime-validated ingress.

## Consequences

### Good

- Function signatures catch ID mix-ups at compile time:
  ```ts
  function getSession(id: SessionId): Promise<Session> { … }
  getSession(msgId); // TS2345: 'MessageId' is not assignable to 'SessionId'
  ```
- Zero runtime cost — branded types compile to plain strings.
- Documents intent in type signatures without comments.
- Repository interfaces encode which ID each method accepts, making misuse impossible.

### Neutral

- Test fixtures must import the correct branded type and use `as SessionId` assertions. One line of ceremony per fixture is acceptable for the safety gained.

### Bad

- Interop with external data (JSON imports, MCP tool payloads) requires an explicit `SessionId.parse(raw)` step. This is the correct boundary discipline but adds a line of code at each ingress point.
- Developers new to Zod branding may be surprised by the `as SessionId` requirement for string literals in tests. Mitigated by ID-builder helpers in `__tests__/builders/`.

## Alternatives Considered

1. **Plain `string` alias** — rejected: no compile-time protection, defeats the purpose of moving to TypeScript-strict.
2. **Nominal type wrapper classes** (`class SessionId { constructor(readonly value: string) {} }`) — rejected: adds runtime allocation, requires `.value` unwrapping everywhere, hostile to JSON serialization.
3. **Opaque type via type intersection** (`type SessionId = string & { __brand: 'SessionId' }`) — rejected: equivalent to Zod branding but loses the one-stop-shop benefit of having schema + type in the same declaration.
4. **Runtime UUID objects via `ts-brand` / `type-fest` `Opaque`** — rejected: same shape as Zod branding but introduces a second library for a single-feature purpose. Zod is already a core dependency.

## Readonly Depth Note

Entity types use `Readonly<z.infer<typeof Schema>>` which applies **shallow** immutability only.
Nested objects (e.g. `tokens`, `content_blocks`, `alternatives_considered`) are not recursively
readonly at the type level. This is a deliberate trade-off:

- Deep-readonly helpers (e.g. `DeepReadonly<T>` from `type-fest`) introduce a third-party
  dependency and produce unwieldy types in IDE hover output.
- In practice, domain code treats entities as immutable by convention: mutations produce new
  values via `{ ...entity, field: newValue }` rather than in-place updates.
- If a specific nested field requires strong immutability guarantees, annotate it explicitly
  in the Zod schema (e.g. `z.array(...).readonly()`).

**Summary**: `readonly` in this codebase is a surface-level type-level constraint, not a
deep-immutability guarantee. Reviewers should not treat missing deep-readonly as a defect.

## References

- Zod brand docs: <https://zod.dev/?id=brand>
- ULID spec: <https://github.com/ulid/spec>
- Implementation: `src/v2/schemas/ids.ts`
