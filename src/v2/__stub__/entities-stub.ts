/**
 * Temporary type stubs for WS-A entities (src/v2/schemas/entities.ts).
 * This file exists only because WS-A (feat/v2-schemas-canonical) is not yet merged.
 * DELETE this file after WS-A merges and update imports in db.ts and migrations/v1_to_v2.ts
 * to point to '../schemas/entities' instead of '../__stub__/entities-stub'.
 */

export type ULID = string;
export type SHA256Hex = string;
export type EpochMs = number;

export interface Provenance {
  message_ids: ULID[];         // min(1) — enforced at runtime
  extractor_model: string;
  extractor_prompt_hash: SHA256Hex;
  confidence: number;          // 0..1
  extracted_at: EpochMs;
}

export type ContentBlockType = 'text' | 'tool_use' | 'tool_result' | 'thinking';

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: unknown;
  is_error: boolean;
}

export interface ThinkingBlock {
  type: 'thinking';
  text: string;
  signature?: string;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ThinkingBlock;

export interface Session {
  id: ULID;
  project_id: ULID | null;
  title: string;
  started_at: EpochMs;
  ended_at: EpochMs | null;
  primary_provider: 'anthropic' | 'openai' | 'google' | 'local' | 'mixed';
  source: 'paste' | 'chatgpt_export' | 'claude_code_file' | 'mcp_client' | 'manual';
  schema_version: 2;
  created_at: EpochMs;
}

export interface Message {
  id: ULID;
  session_id: ULID;
  parent_message_id: ULID | null;
  role: 'user' | 'assistant' | 'system' | 'tool';
  provider: 'anthropic' | 'openai' | 'google' | 'local' | null;
  model: string | null;
  content_blocks: ContentBlock[];
  tokens: {
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
  };
  cost_usd_micros: number;
  latency_ms: number;
  created_at: EpochMs;
}

export interface Checkpoint {
  id: ULID;
  session_id: ULID;
  parent_checkpoint_id: ULID | null;
  message_state_hash: SHA256Hex;
  extraction_state_hash: SHA256Hex;
  label: string | null;
  auto: boolean;
  summary: string;
  message_count: number;
  created_at: EpochMs;
  created_by: 'auto_interval' | 'manual_user' | 'mcp_client' | 'session_end';
}

export interface Decision {
  id: ULID;
  session_id: ULID;
  project_id: ULID | null;
  first_checkpoint_id: ULID;
  title: string;
  rationale: string;
  alternatives_considered: Array<{ option: string; reason_rejected: string }>;
  status: 'active' | 'superseded' | 'reverted';
  superseded_by: ULID | null;
  derived_from: Provenance;
  created_at: EpochMs;
  updated_at: EpochMs;
}

export interface Todo {
  id: ULID;
  session_id: ULID;
  project_id: ULID | null;
  first_checkpoint_id: ULID;
  title: string;
  body: string;
  status: 'open' | 'in_progress' | 'done' | 'dropped';
  priority: 'low' | 'medium' | 'high';
  due_at: EpochMs | null;
  blocker_ids: ULID[];
  derived_from: Provenance;
  completed_at: EpochMs | null;
  created_at: EpochMs;
  updated_at: EpochMs;
}

export interface Blocker {
  id: ULID;
  session_id: ULID;
  project_id: ULID | null;
  first_checkpoint_id: ULID;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'resolved' | 'accepted_risk';
  derived_from: Provenance;
  resolved_at: EpochMs | null;
  created_at: EpochMs;
  updated_at: EpochMs;
}

export interface Learning {
  id: ULID;
  session_id: ULID;
  project_id: ULID | null;
  first_checkpoint_id: ULID;
  title: string;
  content: string;
  tags: string[];
  derived_from: Provenance;
  created_at: EpochMs;
}

export interface Project {
  id: ULID;
  name: string;
  description: string;
  color: string | null;
  icon: string | null;
  archived: boolean;
  created_at: EpochMs;
  updated_at: EpochMs;
}
