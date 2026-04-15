/**
 * Core entity schemas for Lore v2.
 *
 * All entities are `Readonly` — mutations produce new values rather than
 * modifying in place. Entity IDs use branded types (see `./ids.ts`) to
 * prevent compile-time confusion between entities of different kinds.
 *
 * ## Entity hierarchy
 * ```
 * Project ──< Session ──< Message
 *                    ──< Checkpoint (references message_state_hash)
 *                    ──< Decision   (derived_from: Provenance)
 *                    ──< Todo       (derived_from: Provenance)
 *                    ──< Blocker    (derived_from: Provenance)
 *                    ──< Learning   (derived_from: Provenance)
 * ```
 *
 * @see ADR-0002 — Branded ULID Types
 * @see ADR-0003 — RFC 8785 Canonical JSON (updated_at excluded from hashes)
 * @since 0.2.0
 */

import { z } from 'zod';
import { SHA256Hex, EpochMs, UsdMicros } from './primitives';
import {
  SessionId,
  MessageId,
  CheckpointId,
  DecisionId,
  TodoId,
  BlockerId,
  LearningId,
  ProjectId,
} from './ids';
import { ContentBlock } from './content';
import { Provenance } from './provenance';

// Re-export for convenience — callers can import everything from './entities'
// or from the barrel './index'.
export { Provenance } from './provenance';
export { ContentBlock, TextBlock, ToolUseBlock, ToolResultBlock, ThinkingBlock } from './content';

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * A single AI conversation session, potentially spanning multiple messages
 * across one or more providers.
 *
 * Sessions are the top-level unit of data in Lore v2. They belong to at most
 * one {@link Project} and contain an ordered DAG of {@link Message} nodes.
 *
 * @example
 * ```ts
 * const session = Session.parse({
 *   id: ulid() as SessionId,
 *   project_id: null,
 *   title: 'Implementing canonical JSON',
 *   started_at: Date.now(),
 *   ended_at: null,
 *   primary_provider: 'anthropic',
 *   source: 'paste',
 *   schema_version: 2,
 *   created_at: Date.now(),
 * });
 * ```
 *
 * @since 0.2.0
 */
export const Session = z.object({
  /** Unique session identifier. */
  id: SessionId,
  /** Project this session belongs to, or `null` for unassigned sessions. */
  project_id: ProjectId.nullable(),
  /** Human-readable title derived from the first user message or set manually. */
  title: z.string().max(500),
  /** When the session started (epoch ms). */
  started_at: EpochMs,
  /** When the session ended, or `null` if still in progress. */
  ended_at: EpochMs.nullable(),
  /** The primary AI provider used in this session. */
  primary_provider: z.enum(['anthropic', 'openai', 'google', 'local', 'mixed']),
  /** How this session's content was ingested into Lore. */
  source: z.enum(['paste', 'chatgpt_export', 'claude_code_file', 'mcp_client', 'manual']),
  /**
   * Schema version sentinel. Always `2` for v2 entities.
   * Used to detect and reject accidentally migrated v1 data.
   */
  schema_version: z.literal(2),
  /** When this record was created in the local DB (epoch ms). */
  created_at: EpochMs,
});

export type Session = Readonly<z.infer<typeof Session>>;

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

/**
 * A single message turn within a {@link Session}.
 *
 * Messages form a DAG (not a flat array): `parent_message_id` enables
 * representing branching conversations. A `null` parent means this is
 * the root of a session.
 *
 * @example
 * ```ts
 * const msg = Message.parse({
 *   id: ulid() as MessageId,
 *   session_id: sessionId,
 *   parent_message_id: null,
 *   role: 'user',
 *   provider: 'anthropic',
 *   model: 'claude-opus-4-6',
 *   content_blocks: [{ type: 'text', text: 'Hello' }],
 *   tokens: { input: 10, output: 0, cache_read: 0, cache_write: 0 },
 *   cost_usd_micros: 150,
 *   latency_ms: 42,
 *   created_at: Date.now(),
 * });
 * ```
 *
 * @since 0.2.0
 */
export const Message = z.object({
  /** Unique message identifier. */
  id: MessageId,
  /** Session this message belongs to. */
  session_id: SessionId,
  /**
   * ID of the preceding message in the conversation DAG.
   * `null` for the session root message.
   */
  parent_message_id: MessageId.nullable(),
  /** Speaker role for this message turn. */
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  /**
   * AI provider that generated this message.
   * `null` for user/system messages (no provider involved).
   */
  provider: z.enum(['anthropic', 'openai', 'google', 'local']).nullable(),
  /**
   * Model identifier (e.g. `"claude-opus-4-6"`).
   * `null` for user/system messages.
   */
  model: z.string().nullable(),
  /**
   * Ordered content blocks comprising this message.
   * At least one block is required — an empty message is not valid.
   */
  content_blocks: z.array(ContentBlock).min(1),
  /** Token counts for this message turn. */
  tokens: z.object({
    /** Input (prompt) tokens billed. */
    input: z.number().int().nonnegative(),
    /** Output (completion) tokens billed. */
    output: z.number().int().nonnegative(),
    /** Tokens served from prompt cache (not billed at full rate). */
    cache_read: z.number().int().nonnegative().default(0),
    /** Tokens written to prompt cache. */
    cache_write: z.number().int().nonnegative().default(0),
  }),
  /**
   * Total cost of this message in USD microdollars (1 USD = 1,000,000).
   * Integer to satisfy RFC 8785 canonical JSON constraints.
   */
  cost_usd_micros: UsdMicros,
  /** End-to-end latency for this message in milliseconds. */
  latency_ms: z.number().int().nonnegative(),
  /** When this message was created (epoch ms). */
  created_at: EpochMs,
});

export type Message = Readonly<z.infer<typeof Message>>;

// ---------------------------------------------------------------------------
// Checkpoint
// ---------------------------------------------------------------------------

/**
 * A named snapshot of session state at a point in time.
 *
 * Checkpoints provide tamper detection via two SHA-256 state hashes:
 * - `message_state_hash`: hash of all messages reachable from this checkpoint
 * - `extraction_state_hash`: hash of all active extracted entities (decisions, todos, etc.)
 *
 * In Lore v2 MVP, checkpoints are linear (no branching). The `parent_checkpoint_id`
 * forms a singly-linked list back to the session start.
 *
 * @see {@link computeMessageStateHash} and {@link computeExtractionStateHash}
 * @see ADR-0003 — RFC 8785 Canonical JSON
 * @since 0.2.0
 */
export const Checkpoint = z.object({
  /** Unique checkpoint identifier. */
  id: CheckpointId,
  /** Session this checkpoint belongs to. */
  session_id: SessionId,
  /** Previous checkpoint in the linear chain, or `null` for the first. */
  parent_checkpoint_id: CheckpointId.nullable(),
  /**
   * SHA-256 of the canonical JSON of all messages reachable from this checkpoint,
   * sorted by ID, with thinking blocks and tool_use IDs excluded.
   */
  message_state_hash: SHA256Hex,
  /**
   * SHA-256 of the canonical JSON of all active extracted entities at this point,
   * sorted by ID, with `updated_at` fields excluded.
   */
  extraction_state_hash: SHA256Hex,
  /**
   * Optional human-readable label. Present on manual checkpoints,
   * `null` on auto-generated ones.
   */
  label: z.string().max(200).nullable(),
  /**
   * Whether this checkpoint was created automatically (every 10 messages)
   * or manually by the user.
   */
  auto: z.boolean(),
  /** LLM-generated summary of the session state at this point. */
  summary: z.string().max(1000),
  /** Number of messages reachable from this checkpoint. */
  message_count: z.number().int().nonnegative(),
  /** When this checkpoint was created (epoch ms). */
  created_at: EpochMs,
  /** What triggered the checkpoint creation. */
  created_by: z.enum(['auto_interval', 'manual_user', 'mcp_client', 'session_end']),
});

export type Checkpoint = Readonly<z.infer<typeof Checkpoint>>;

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

/**
 * An architectural or technical decision extracted from session messages.
 *
 * The `derived_from` field is **mandatory** — Lore's core invariant is that
 * every extracted entity traces back to at least one source message.
 * Decisions without provenance cannot be created at the schema level.
 *
 * @example
 * ```ts
 * const decision = Decision.parse({
 *   id: ulid() as DecisionId,
 *   session_id: sessionId,
 *   project_id: projectId,
 *   first_checkpoint_id: checkpointId,
 *   title: 'Use RFC 8785 for canonical JSON',
 *   rationale: 'Deterministic key ordering required for hash stability',
 *   derived_from: provenance,
 *   created_at: Date.now(),
 *   updated_at: Date.now(),
 * });
 * ```
 *
 * @since 0.2.0
 */
export const Decision = z.object({
  /** Unique decision identifier. */
  id: DecisionId,
  /** Session in which this decision was made. */
  session_id: SessionId,
  /** Project this decision belongs to, or `null`. */
  project_id: ProjectId.nullable(),
  /** The checkpoint at which this decision first appeared. */
  first_checkpoint_id: CheckpointId,
  /** Short descriptive title. Non-empty, max 500 chars. */
  title: z.string().min(1).max(500),
  /** Explanation of why this decision was made. Max 10,000 chars. */
  rationale: z.string().max(10000),
  /** Other options that were considered and rejected. */
  alternatives_considered: z.array(z.object({
    /** The alternative option description. */
    option: z.string().max(500),
    /** Why this option was not chosen. */
    reason_rejected: z.string().max(1000),
  })).default([]),
  /** Current lifecycle status of this decision. Defaults to `'active'`. */
  status: z.enum(['active', 'superseded', 'reverted']).default('active'),
  /**
   * ID of the decision that supersedes this one.
   * Only set when `status === 'superseded'`.
   */
  superseded_by: DecisionId.nullable().default(null),
  /**
   * Provenance linking this decision to its source messages.
   * Required — cannot be omitted or have zero message_ids.
   */
  derived_from: Provenance,
  /** When this decision was first extracted (epoch ms). */
  created_at: EpochMs,
  /**
   * When this decision was last updated (epoch ms).
   * **Excluded from canonical hashes** — only content changes should affect
   * the extraction_state_hash, not bookkeeping mutations.
   */
  updated_at: EpochMs,
});

export type Decision = Readonly<z.infer<typeof Decision>>;

// ---------------------------------------------------------------------------
// Todo
// ---------------------------------------------------------------------------

/**
 * An action item extracted from session messages.
 *
 * Like all derived entities, requires `derived_from` provenance.
 * Todos can reference blocking {@link Blocker} entities via `blocker_ids`.
 *
 * @since 0.2.0
 */
export const Todo = z.object({
  /** Unique todo identifier. */
  id: TodoId,
  /** Session in which this todo was identified. */
  session_id: SessionId,
  /** Project this todo belongs to, or `null`. */
  project_id: ProjectId.nullable(),
  /** The checkpoint at which this todo first appeared. */
  first_checkpoint_id: CheckpointId,
  /** Short descriptive title. Non-empty, max 500 chars. */
  title: z.string().min(1).max(500),
  /** Optional longer description or acceptance criteria. Max 5,000 chars. */
  body: z.string().max(5000).default(''),
  /** Current completion status. Defaults to `'open'`. */
  status: z.enum(['open', 'in_progress', 'done', 'dropped']).default('open'),
  /** Priority level. Defaults to `'medium'`. */
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  /** Optional deadline as epoch ms. */
  due_at: EpochMs.nullable().default(null),
  /** IDs of {@link Blocker} entities that block completion of this todo. */
  blocker_ids: z.array(BlockerId).default([]),
  /**
   * Provenance linking this todo to its source messages.
   * Required — cannot be omitted or have zero message_ids.
   */
  derived_from: Provenance,
  /** When this todo was completed, or `null` if not yet done. */
  completed_at: EpochMs.nullable().default(null),
  /** When this todo was first extracted (epoch ms). */
  created_at: EpochMs,
  /**
   * When this todo was last updated (epoch ms).
   * Excluded from canonical hashes.
   */
  updated_at: EpochMs,
});

export type Todo = Readonly<z.infer<typeof Todo>>;

// ---------------------------------------------------------------------------
// Blocker
// ---------------------------------------------------------------------------

/**
 * An impediment or risk extracted from session messages.
 *
 * Blockers are linked from {@link Todo} entities via `blocker_ids`.
 * Like all derived entities, requires `derived_from` provenance.
 *
 * @since 0.2.0
 */
export const Blocker = z.object({
  /** Unique blocker identifier. */
  id: BlockerId,
  /** Session in which this blocker was identified. */
  session_id: SessionId,
  /** Project this blocker belongs to, or `null`. */
  project_id: ProjectId.nullable(),
  /** The checkpoint at which this blocker first appeared. */
  first_checkpoint_id: CheckpointId,
  /** Short descriptive title. Non-empty, max 500 chars. */
  title: z.string().min(1).max(500),
  /** Detailed description of the blocker. Max 5,000 chars. */
  description: z.string().max(5000),
  /** Severity level. Defaults to `'medium'`. */
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  /** Current resolution status. Defaults to `'open'`. */
  status: z.enum(['open', 'resolved', 'accepted_risk']).default('open'),
  /**
   * Provenance linking this blocker to its source messages.
   * Required — cannot be omitted or have zero message_ids.
   */
  derived_from: Provenance,
  /** When this blocker was resolved, or `null` if still open. */
  resolved_at: EpochMs.nullable().default(null),
  /** When this blocker was first extracted (epoch ms). */
  created_at: EpochMs,
  /**
   * When this blocker was last updated (epoch ms).
   * Excluded from canonical hashes.
   */
  updated_at: EpochMs,
});

export type Blocker = Readonly<z.infer<typeof Blocker>>;

// ---------------------------------------------------------------------------
// Learning
// ---------------------------------------------------------------------------

/**
 * A reusable insight or lesson extracted from session messages.
 *
 * Learnings are the most durable extracted entity — they capture knowledge
 * that should inform future sessions. Like all derived entities, requires
 * `derived_from` provenance.
 *
 * @since 0.2.0
 */
export const Learning = z.object({
  /** Unique learning identifier. */
  id: LearningId,
  /** Session in which this learning was identified. */
  session_id: SessionId,
  /** Project this learning belongs to, or `null`. */
  project_id: ProjectId.nullable(),
  /** The checkpoint at which this learning first appeared. */
  first_checkpoint_id: CheckpointId,
  /** Short descriptive title. Non-empty, max 500 chars. */
  title: z.string().min(1).max(500),
  /** The learning content. Max 10,000 chars. */
  content: z.string().max(10000),
  /** Freeform tags for cross-session search. Each tag max 50 chars. */
  tags: z.array(z.string().max(50)).default([]),
  /**
   * Provenance linking this learning to its source messages.
   * Required — cannot be omitted or have zero message_ids.
   */
  derived_from: Provenance,
  /** When this learning was extracted (epoch ms). */
  created_at: EpochMs,
});

export type Learning = Readonly<z.infer<typeof Learning>>;

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

/**
 * A project groups related {@link Session} entities and their derived entities
 * (decisions, todos, blockers, learnings) under a named context.
 *
 * @example
 * ```ts
 * const project = Project.parse({
 *   id: ulid() as ProjectId,
 *   name: 'Lore v2',
 *   description: 'Provenance-first session tracking',
 *   color: '#6366f1',
 *   created_at: Date.now(),
 *   updated_at: Date.now(),
 * });
 * ```
 *
 * @since 0.2.0
 */
export const Project = z.object({
  /** Unique project identifier. */
  id: ProjectId,
  /** Display name. Non-empty, max 200 chars. */
  name: z.string().min(1).max(200),
  /** Optional project description. Max 2,000 chars. */
  description: z.string().max(2000).default(''),
  /** Optional hex color for UI display (e.g. `"#6366f1"`). */
  color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().default(null),
  /** Optional emoji or single-character icon. Max 10 chars. */
  icon: z.string().max(10).nullable().default(null),
  /** Whether this project is archived (hidden from active views). */
  archived: z.boolean().default(false),
  /** When this project was created (epoch ms). */
  created_at: EpochMs,
  /**
   * When this project was last updated (epoch ms).
   * Excluded from canonical hashes.
   */
  updated_at: EpochMs,
});

export type Project = Readonly<z.infer<typeof Project>>;

// Re-export ID types for consumers that import from this file
export type {
  SessionId,
  MessageId,
  CheckpointId,
  DecisionId,
  TodoId,
  BlockerId,
  LearningId,
  ProjectId,
} from './ids';
