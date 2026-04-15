---
kind: todo
id: 01HQ2222222222222222222222
project_id: proj-lore-v2
session_id: sess-001
derived_from_message_ids:
  - msg-ccc
created_at: 1713168100000
priority: high
status: open
due_at: 1714000000000
---
# Implement SQLite export from IndexedDB

The PWA needs to export its IndexedDB data to ~/.lore/lore-export.sqlite periodically so the MCP server can read it.

Steps:
1. Add visibility change listener
2. Add 5-minute interval timer
3. Write SQLite export function using sql.js
