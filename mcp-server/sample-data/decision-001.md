---
kind: decision
id: 01HQ1111111111111111111111
project_id: proj-lore-v2
session_id: sess-001
derived_from_message_ids:
  - msg-aaa
  - msg-bbb
created_at: 1713168000000
severity: high
---
# Use Redis for caching

We evaluated Redis vs Memcached vs in-process LRU. Redis was chosen for its persistence options and pub/sub support needed for future real-time features.

Alternatives considered:
- Memcached: simpler but no persistence
- In-process LRU: no cross-instance sharing
