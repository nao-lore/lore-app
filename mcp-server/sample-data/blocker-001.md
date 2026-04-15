---
kind: blocker
id: 01HQ3333333333333333333333
project_id: proj-lore-v2
session_id: sess-001
derived_from_message_ids:
  - msg-ddd
created_at: 1713168200000
severity: critical
status: open
---
# IndexedDB not accessible from Node.js

Browser IndexedDB API is not available in Node.js context. This blocks the MCP server from reading live data directly.

Resolution plan: Use SQLite mirror written by the PWA, or Markdown export as MVP fallback.
