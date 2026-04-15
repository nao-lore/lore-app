# Lore MCP Server

A read-only MCP (Model Context Protocol) server that exposes Lore project context to Claude Desktop, Cursor, Windsurf, and other MCP clients.

## Tools

| Tool | Description |
|---|---|
| `lore_search` | Full-text search across decisions, todos, blockers, learnings, messages |
| `lore_get_project_dna` | Get full project context: active decisions, open blockers, recent learnings |
| `lore_list_open_todos` | List open todos, optionally filtered by project |

## Data Source

**MVP**: Reads `~/.lore/projects/*.md` files exported by the Lore PWA.

Each file uses YAML frontmatter + markdown body:

```markdown
---
kind: decision
id: 01HQ...
project_id: 01HQ...
session_id: 01HQ...
derived_from_message_ids: [01HQ..., 01HQ...]
created_at: 1713168000000
---
# Use Redis for caching

Rationale: ...
```

Supported `kind` values: `decision`, `todo`, `blocker`, `learning`, `message`.

## Setup

### 1. Build

```bash
npm install
npm run build
```

### 2. Configure Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lore": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/lore/mcp-server/dist/server.js"]
    }
  }
}
```

Replace `/Users/YOUR_USERNAME/lore` with the actual path to this repository.

### 3. Configure Cursor

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` in your project root (project-scoped):

```json
{
  "mcpServers": {
    "lore": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/lore/mcp-server/dist/server.js"]
    }
  }
}
```

Then restart Cursor and enable the `lore` MCP server in **Cursor Settings → MCP**.

### 4. Configure Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "lore": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/lore/mcp-server/dist/server.js"]
    }
  }
}
```

### 5. Configure other MCP clients

For `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "lore": {
      "command": "node",
      "args": ["/absolute/path/to/lore/mcp-server/dist/server.js"]
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LORE_DATA_DIR` | `~/.lore/projects` | Path to the directory containing `.md` export files |

Override for testing or custom data locations:

```json
{
  "mcpServers": {
    "lore": {
      "command": "node",
      "args": ["/path/to/lore/mcp-server/dist/server.js"],
      "env": {
        "LORE_DATA_DIR": "/custom/path/to/lore-data"
      }
    }
  }
}
```

## Development

```bash
npm run dev          # Run with tsx (no build needed)
npm run build        # Compile TypeScript
npm test             # Run tests
npm run typecheck    # Type check without building
```

## Testing manually (stdio)

After building, you can test the server manually by sending JSON-RPC over stdin:

```bash
node dist/server.js <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
EOF
```

## Architecture

```
mcp-server/
├── src/
│   ├── server.ts              # Entry point, stdio transport, tool registration, graceful shutdown
│   ├── errors.ts              # LoreMcpError union + assertNever + formatMcpError
│   ├── result.ts              # Result<T,E> monad (ok / err)
│   ├── logger.ts              # Structured JSON logger → stderr
│   ├── ports/
│   │   └── data-source.ts     # DataSource port interface + InMemoryDataSource
│   ├── tools/
│   │   ├── definitions.ts     # Zod schemas for tool inputs/outputs
│   │   ├── search.ts          # lore_search implementation
│   │   ├── project_dna.ts     # lore_get_project_dna implementation
│   │   └── open_todos.ts      # lore_list_open_todos implementation
│   └── data/
│       ├── types.ts           # LoreEntry, EntryKind
│       └── markdown_reader.ts # MarkdownDataSource adapter + parseFile + searchEntries
├── __tests__/
│   ├── fixtures/entries.ts    # aLoreEntry() builder + sampleEntries()
│   ├── tools.test.ts          # Tests #13-16: tool contracts (36 tests)
│   ├── transport.test.ts      # Test #17: JSON-RPC parse error via StdioServerTransport
│   └── integration.test.ts    # E2E: spawn server, exchange JSON-RPC (8 tests)
├── docs/adr/
│   └── 0006-mcp-markdown-reader-for-mvp.md
└── sample-data/               # Example .md files for manual testing
```

**Ports & Adapters**: tools depend only on the `DataSource` port.
Replacing `MarkdownDataSource` with a future `SqliteDataSource` requires zero tool changes.

## Troubleshooting

### "Run Lore PWA first to export data" error

The `~/.lore/projects/` directory does not exist. Open the Lore PWA, navigate to any
project, and wait for the automatic export (triggered on tab focus and every 5 minutes).

You can also override the path for testing:

```bash
LORE_DATA_DIR=/path/to/your/data node dist/server.js
```

### Server starts but returns no results

Check that your `.md` files have a `kind` field in their YAML frontmatter:

```yaml
---
kind: decision   # required: decision | todo | blocker | learning | message
id: 01HQ...
project_id: your-project-id
---
```

### Logs / debugging

The server writes structured JSON logs to **stderr** (stdout is reserved for JSON-RPC).
To see debug logs:

```bash
LOG_LEVEL=debug node dist/server.js
```

Each log line is a JSON object:
```json
{"level":"info","event":"tool.lore_search.ok","ts":1713168000000,"total_matched":3}
```

### Server does not appear in Claude Desktop

1. Verify the path in `claude_desktop_config.json` is absolute and correct
2. Run `node /path/to/mcp-server/dist/server.js` manually — it should block waiting for stdin
3. Check Claude Desktop logs: `~/Library/Logs/Claude/mcp-server-lore.log`
4. Restart Claude Desktop after config changes

## Post-MVP Roadmap

- SQLite mirror (`~/.lore/lore-export.sqlite`) for structured queries — see ADR-0006
- OAuth device flow for multi-user machine security
- Write tools for creating decisions/todos from MCP clients
- MCP Registry submission
