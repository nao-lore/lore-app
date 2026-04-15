---
kind: learning
id: 01HQ4444444444444444444444
project_id: proj-lore-v2
session_id: sess-001
derived_from_message_ids:
  - msg-eee
created_at: 1713168300000
tags:
  - mcp
  - stdio
---
# MCP stdio transport requires line-delimited JSON-RPC

Each JSON-RPC message must be a single line terminated by newline. The SDK handles framing automatically but custom transports must respect this constraint.

Reference: https://spec.modelcontextprotocol.io/specification/basic/transports/
