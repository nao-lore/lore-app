/**
 * Pure v1 → v2 conversion logic.
 *
 * This module has **zero** I/O dependencies. It takes v1 data as input and
 * returns v2 entity graphs. All side effects (DB writes, timestamps, ID
 * generation) are handled by `executor.ts` via injected ports.
 *
 * Separation rationale:
 * - Pure functions are trivially testable without mocking
 * - Conversion logic can be unit-tested with fixed clocks and deterministic IDs
 * - I/O failures in `executor.ts` do not contaminate conversion correctness
 *
 * @see executor.ts for the DB-writing counterpart
 * @see ADR-0004
 * @since 0.2.0
 *
 * @example
 * ```ts
 * import { convertLog } from './converter';
 * import { fixedClock, sequentialIdGenerator } from '../../ports';
 *
 * const result = convertLog(
 *   v1Log,
 *   fixedClock(1_713_168_000_000),
 *   sequentialIdGenerator(),
 * );
 * if (!result.ok) throw new Error(result.error.cause);
 * const { session, message, checkpoint, decisions, todos, blockers } = result.value;
 * ```
 */

import type { Clock, IdGenerator } from '../../ports';
import { ok, err, type Result } from '../../result';
import type { LoreError } from '../../errors';
import type {
  Session,
  Message,
  Checkpoint,
  Decision,
  Todo,
  Blocker,
  Provenance,
} from '../../schemas/entities';

// ---- v1 types (internal to migration, not imported from src/types.ts) ----

interface V1DecisionWithRationale {
  title?: string;
  rationale?: string;
  decision?: string;
}

/**
 * Minimal shape of a v1 `LogEntry` as read from IndexedDB or fixture files.
 * Only the fields consumed by migration are typed; others are allowed via index.
 */
export interface V1LogEntry {
  readonly id: string;
  readonly createdAt: string;
  readonly title: string;
  readonly projectId?: string;
  readonly sourceText?: string;
  readonly decisions?: readonly string[];
  readonly decisionRationales?: readonly V1DecisionWithRationale[];
  readonly todo?: readonly string[];
  readonly blockers?: readonly string[];
  readonly [key: string]: unknown;
}

// ---- Output type ----

/**
 * The complete v2 entity graph produced for a single v1 log entry.
 * All entities share the same `sessionId` and reference the same
 * `checkpointId` as their `first_checkpoint_id`.
 */
export interface ConvertedLog {
  readonly session: Session;
  readonly message: Message;
  readonly checkpoint: Checkpoint;
  readonly decisions: readonly Decision[];
  readonly todos: readonly Todo[];
  readonly blockers: readonly Blocker[];
}

// ---- Placeholder hash ----

const PLACEHOLDER_HASH =
  '0000000000000000000000000000000000000000000000000000000000000000' as const;

// ---- Deterministic ID derivation ----

/**
 * Derive a stable, deterministic 26-char ID from a v1 log ID and a role prefix.
 *
 * Guarantees: same input → same output across runs (idempotency).
 * Collision probability: negligible for expected dataset sizes (<1M entries).
 */
function deriveId(logId: string, role: 'S' | 'M' | 'C'): string {
  const raw = `${role}1${logId.replace(/[^A-Z0-9]/gi, '')}`;
  return raw.slice(0, 26).padEnd(26, '0').toUpperCase();
}

// ---- Provenance builder ----

function makeProvenance(messageId: string, now: number): Provenance {
  return {
    message_ids: [messageId],
    extractor_model: 'v1_migration',
    extractor_prompt_hash: PLACEHOLDER_HASH,
    confidence: 0.5,
    extracted_at: now,
  };
}

// ---- Main converter ----

/**
 * Convert a single v1 `LogEntry` to a set of v2 entities.
 *
 * The converter is pure: it derives IDs deterministically from `logEntry.id`
 * and uses the injected `clock` and `idGenerator` for non-deterministic values.
 *
 * @param logEntry   - The v1 log entry to convert
 * @param clock      - Injected clock for `created_at` timestamps
 * @param idGenerator - Injected generator for Decision/Todo/Blocker IDs
 * @returns `Result<ConvertedLog, LoreError>` — never throws
 *
 * @example
 * ```ts
 * const result = convertLog(entry, systemClock, cryptoIdGenerator);
 * if (!result.ok) return err(result.error);
 * ```
 */
export function convertLog(
  logEntry: V1LogEntry,
  clock: Clock,
  idGenerator: IdGenerator,
): Result<ConvertedLog, LoreError> {
  const now = clock.now();
  const startedAt = logEntry.createdAt
    ? new Date(logEntry.createdAt).getTime()
    : now;

  if (!Number.isFinite(startedAt)) {
    return err({
      code: 'VALIDATION_FAILED',
      field: 'createdAt',
      reason: `Cannot parse date: ${String(logEntry.createdAt)}`,
    });
  }

  const sessionId = deriveId(logEntry.id, 'S');
  const messageId = deriveId(logEntry.id, 'M');
  const checkpointId = deriveId(logEntry.id, 'C');

  // ---- Session ----
  const session: Session = {
    id: sessionId,
    project_id: logEntry.projectId ?? null,
    title: String(logEntry.title ?? '[migrated from v1]').slice(0, 500),
    started_at: startedAt,
    ended_at: startedAt,
    primary_provider: 'mixed',
    source: 'paste',
    schema_version: 2,
    created_at: now,
  };

  // ---- Synthetic message ----
  const messageText =
    typeof logEntry.sourceText === 'string' && logEntry.sourceText.length > 0
      ? logEntry.sourceText.slice(0, 50_000)
      : '[migrated from v1]';

  const message: Message = {
    id: messageId,
    session_id: sessionId,
    parent_message_id: null,
    role: 'user',
    provider: null,
    model: null,
    content_blocks: [{ type: 'text', text: messageText }],
    tokens: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    cost_usd_micros: 0,
    latency_ms: 0,
    created_at: startedAt,
  };

  // ---- Checkpoint ----
  const checkpoint: Checkpoint = {
    id: checkpointId,
    session_id: sessionId,
    parent_checkpoint_id: null,
    message_state_hash: PLACEHOLDER_HASH,
    extraction_state_hash: PLACEHOLDER_HASH,
    label: 'v1 migration checkpoint',
    auto: true,
    summary: `Migrated from v1 log: ${logEntry.title ?? logEntry.id}`,
    message_count: 1,
    created_at: now,
    created_by: 'auto_interval',
  };

  const provenance = makeProvenance(messageId, now);

  // ---- Decisions ----
  const decisions: Decision[] = [];
  if (
    logEntry.decisionRationales &&
    logEntry.decisionRationales.length > 0
  ) {
    for (const dr of logEntry.decisionRationales) {
      const title = String(dr.title ?? dr.decision ?? '').trim();
      if (!title) continue;
      decisions.push({
        id: idGenerator.next(),
        session_id: sessionId,
        project_id: logEntry.projectId ?? null,
        first_checkpoint_id: checkpointId,
        title: title.slice(0, 500),
        rationale: String(dr.rationale ?? '').slice(0, 10_000),
        alternatives_considered: [],
        status: 'active',
        superseded_by: null,
        derived_from: provenance,
        created_at: startedAt,
        updated_at: startedAt,
      });
    }
  } else if (logEntry.decisions && logEntry.decisions.length > 0) {
    for (const d of logEntry.decisions) {
      const title = String(d).trim();
      if (!title) continue;
      decisions.push({
        id: idGenerator.next(),
        session_id: sessionId,
        project_id: logEntry.projectId ?? null,
        first_checkpoint_id: checkpointId,
        title: title.slice(0, 500),
        rationale: '',
        alternatives_considered: [],
        status: 'active',
        superseded_by: null,
        derived_from: provenance,
        created_at: startedAt,
        updated_at: startedAt,
      });
    }
  }

  // ---- Todos ----
  const todos: Todo[] = [];
  if (logEntry.todo && logEntry.todo.length > 0) {
    for (const t of logEntry.todo) {
      const title = String(t).trim();
      if (!title) continue;
      todos.push({
        id: idGenerator.next(),
        session_id: sessionId,
        project_id: logEntry.projectId ?? null,
        first_checkpoint_id: checkpointId,
        title: title.slice(0, 500),
        body: '',
        status: 'open',
        priority: 'medium',
        due_at: null,
        blocker_ids: [],
        derived_from: provenance,
        completed_at: null,
        created_at: startedAt,
        updated_at: startedAt,
      });
    }
  }

  // ---- Blockers ----
  const blockers: Blocker[] = [];
  if (logEntry.blockers && logEntry.blockers.length > 0) {
    for (const b of logEntry.blockers) {
      const title = String(b).trim();
      if (!title) continue;
      blockers.push({
        id: idGenerator.next(),
        session_id: sessionId,
        project_id: logEntry.projectId ?? null,
        first_checkpoint_id: checkpointId,
        title: title.slice(0, 500),
        description: '',
        severity: 'medium',
        status: 'open',
        derived_from: provenance,
        resolved_at: null,
        created_at: startedAt,
        updated_at: startedAt,
      });
    }
  }

  return ok({ session, message, checkpoint, decisions, todos, blockers });
}
