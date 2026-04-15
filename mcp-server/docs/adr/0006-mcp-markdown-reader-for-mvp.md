# ADR 0006: MCP Markdown Reader for MVP

## Status

Accepted

## Context

The Lore MCP Server needs to read project context data (decisions, todos, blockers,
learnings) from somewhere the Node.js process can access.

The primary data store is browser IndexedDB, which is a browser-only API — inaccessible
from Node.js without significant bridging work. Three data source strategies were
evaluated for the MVP.

**Constraints:**
- 2-week implementation budget (84h total across 7 workstreams)
- MCP server is an independent package: no shared runtime with the PWA
- WS-A (Zod entities) and WS-B (Dexie v2 DB) run in parallel — no cross-dependency allowed
- Data must be readable by Claude Desktop and other MCP clients with zero configuration

## Decision

**MVP data source: Markdown export reader** (`~/.lore/projects/*.md`).

The Lore PWA exports its IndexedDB state to per-entry markdown files with YAML frontmatter
on visibility change and on a 5-minute interval. The MCP server reads these files on each
tool call (stateless, no caching beyond the current request).

The DataSource is exposed as an **interface** (`ports/data-source.ts`) following Ports &
Adapters, so the implementation can be swapped to SQLite (v1.1) or any other backend
without changing tool logic.

## Alternatives Considered

### Option α: SQLite Mirror

The PWA writes to `~/.lore/lore-export.sqlite`; the MCP server opens it read-only.

**Rejected for MVP because:**
- Requires `better-sqlite3` or `sql.js` (native build or WASM)
- SQLite write from browser requires a Service Worker + File System Access API, which has
  limited iOS/Safari support
- Adds WAL/lock complexity between concurrent PWA writes and MCP reads
- Estimated +10h over Markdown approach within the 84h budget

**Planned for v1.1** — the `DataSource` interface makes this a drop-in swap.

### Option γ: JSON Export Reader

The PWA writes `~/.lore/projects.json`; the MCP server parses it.

**Rejected because:**
- A single large JSON file requires full parse on every tool call (no streaming)
- Harder for humans to inspect/debug than per-entry Markdown files
- No structural advantage over Markdown + gray-matter for the read-only MCP use case

## Consequences

### Good

- **Zero native dependencies**: gray-matter is pure JS; no node-gyp, no WASM
- **Human-readable**: operators can inspect and manually edit `~/.lore/projects/*.md`
- **Robust partial failure**: a single malformed file is skipped; the rest load normally
- **Test isolation**: `LORE_DATA_DIR` env var overrides the directory for tests
- **Interface-first**: `DataSource` port makes migration to SQLite a contained adapter swap

### Bad

- **Full-text search is O(n)**: linear scan over all entries on every query. Acceptable
  for MVP (hundreds of entries), not for production scale
- **No structured queries**: filtering by project, kind, and status are all done in-memory
  after loading the full dataset
- **Eventual consistency**: PWA export is periodic, not real-time; MCP reads may lag by up
  to 5 minutes

### Neutral

- File count scales linearly with entries — filesystem directory listing is fast enough
  up to ~10,000 files on macOS/Linux

## Migration Path to SQLite (v1.1)

1. Implement `SqliteDataSource implements DataSource` in `src/data/sqlite_reader.ts`
2. Update `server.ts` to choose the adapter via `DATA_SOURCE=sqlite` env var
3. No changes to `src/tools/*.ts` — they depend only on the `DataSource` port

## References

- `src/ports/data-source.ts` — DataSource port interface
- `src/data/markdown_reader.ts` — MarkdownDataSource adapter
- Spec §3.1 "なぜ Node 側に別途 SQLite" — original problem statement
- Spec §6 Q3 — data source format alternatives
