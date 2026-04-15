# ADR 0004: Repository Pattern over Direct Dexie Access

## Status
Accepted

## Context

Lore v2 introduces a Dexie-backed IndexedDB schema (`lore_v2`) with 10 tables.
Early prototypes called `db.sessions.put(...)` directly from service functions.
This made:

- Unit testing impossible without a full fake-indexeddb setup
- The service layer tightly coupled to Dexie's API surface
- Future storage backends (SQLite mirror for MCP server, in-memory for tests)
  require forking every call site

The migration service (`MigrationExecutor`) in particular benefits from this
separation: its pure conversion logic (`converter.ts`) must be testable without
any DB at all, and its I/O layer (`executor.ts`) must be swappable.

## Decision

All domain-layer code must access data through the repository interfaces defined
in `src/v2/repositories/interfaces.ts`:

- `SessionRepository`, `MessageRepository`, `CheckpointRepository`
- `DecisionRepository`, `TodoRepository`, `BlockerRepository`
- `LearningRepository`, `ProjectRepository`

Two adapter families are provided:

1. **`repositories/dexie/`** — production adapters backed by `LoreV2DB` (Dexie)
2. **`repositories/in-memory/`** — test adapters using plain Maps

The `LoreV2DB` instance is injected into Dexie adapters at construction time
(not imported as a module-level singleton in service code).

The pure migration converter (`converter.ts`) has zero repository dependencies —
it is a plain function `(V1LogEntry, Clock, IdGenerator) → Result<ConvertedLog>`.
Only the executor writes to the DB.

## Consequences

**Good:**
- Service tests use in-memory repositories with no fake-indexeddb overhead
- The converter is tested as a pure function with zero setup
- Swapping the storage backend requires only a new adapter, no service changes
- The `PROVENANCE_INVALID` invariant is enforced at the repository boundary
  (`DecisionRepository.save` rejects empty `message_ids`) rather than scattered
  throughout callers

**Bad:**
- More files for a relatively small codebase at this stage
- Dexie adapters have thin wrappers that add marginal complexity
- Compound index queries (e.g. `[project_id+status]`) must be replicated in
  in-memory adapters with `Array.filter` — divergence risk if indexes change

**Neutral:**
- The `db` singleton in `db.ts` remains for browser use; tests always construct
  named instances (`new LoreV2DB('lore_v2_test_N')`) to avoid contamination

## Alternatives Considered

### A. Direct Dexie calls throughout (rejected)
Fast to write, but untestable in unit tests and couples all service logic to
IndexedDB. Rejected because WS-C (CheckpointService) and WS-D (MCP server)
both need testable domain logic.

### B. Full ORM / data-mapper library (rejected)
Libraries like MikroORM add significant bundle size and setup for a PWA. Dexie
with hand-rolled repository interfaces gives equivalent type safety at a fraction
of the cost.

### C. React Query / TanStack Query as the data layer (rejected)
Appropriate for server-state synchronization but not for local IndexedDB
mutations. Would not eliminate the coupling problem.

## Related

- ADR-0002 — Branded ULID Types (IDs used in repository interfaces)
- `src/v2/repositories/interfaces.ts`
- `src/v2/repositories/dexie/`
- `src/v2/repositories/in-memory/`
- `src/v2/migrations/v1-to-v2/converter.ts`
- `src/v2/migrations/v1-to-v2/executor.ts`
