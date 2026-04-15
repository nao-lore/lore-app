/**
 * v1 LogEntry → v2 migration.
 *
 * Strategy:
 *   For each v1 LogEntry:
 *   1. Create Session
 *   2. Create a synthetic 'user' Message (sourceText absent or present)
 *   3. Create an auto Checkpoint at session end
 *   4. Convert decisions[] / decisionRationales[] → Decision[]
 *   5. Convert todo[] → Todo[]
 *   6. Convert blockers[] → Blocker[]
 *   7. Archive original v1 data under meta key 'v1_archive'
 *
 * Rollback: v1 DB ('lore') is never touched. v2 is a separate DB ('lore_v2').
 * Re-running is safe: idempotency is enforced by checking migration_log for
 * a successful run and skipping already-migrated sessions (keyed by v1 log id).
 */

import type { LoreV2DB, MigrationLogRow } from '../db';
import type {
  Session,
  Message,
  Checkpoint,
  Decision,
  Todo,
  Blocker,
  Provenance,
  ULID,
  SHA256Hex,
} from '../__stub__/entities-stub';

// ---- minimal v1 types (read-only, no import from src/types.ts to keep boundary clean) ----

interface V1DecisionWithRationale {
  title?: string;
  rationale?: string;
  decision?: string;
}

interface V1LogEntry {
  id: string;
  createdAt: string;
  updatedAt?: string;
  title: string;
  projectId?: string;
  sourceText?: string;
  decisions?: string[];
  decisionRationales?: V1DecisionWithRationale[];
  todo?: string[];
  blockers?: string[];
  [key: string]: unknown;
}

// ---- ID generation ----

/** Generate a 26-char ULID-like ID. Uses crypto.randomUUID padded to ULID format. */
function generateId(): ULID {
  // In browser, crypto.randomUUID() is available.
  // In test (fake-indexeddb / Node), crypto is also available via vitest's jsdom/node env.
  const uuid = crypto.randomUUID().replace(/-/g, '');
  // Pad/truncate to 26 chars to satisfy ULID length contract in stubs.
  // Real ULIDs require ulid library; for migration purposes a stable unique ID is sufficient.
  return uuid.slice(0, 26).toUpperCase();
}

/** Deterministic ID for a v1 log entry to allow idempotency checking. */
function sessionIdForLog(logId: string): ULID {
  // Use a stable prefix so re-runs produce the same session IDs.
  const padded = `V1${logId.replace(/-/g, '')}`.slice(0, 26).padEnd(26, '0').toUpperCase();
  return padded;
}

function checkpointIdForLog(logId: string): ULID {
  const padded = `C1${logId.replace(/-/g, '')}`.slice(0, 26).padEnd(26, '0').toUpperCase();
  return padded;
}

function syntheticMessageIdForLog(logId: string): ULID {
  const padded = `M1${logId.replace(/-/g, '')}`.slice(0, 26).padEnd(26, '0').toUpperCase();
  return padded;
}

// ---- placeholder hash (real hashing lives in WS-A canonical.ts) ----

const PLACEHOLDER_HASH: SHA256Hex =
  '0000000000000000000000000000000000000000000000000000000000000000';

// ---- provenance builder ----

function migrationProvenance(messageId: ULID): Provenance {
  return {
    message_ids: [messageId],          // min(1) satisfied
    extractor_model: 'v1_migration',
    extractor_prompt_hash: PLACEHOLDER_HASH,
    confidence: 0.5,
    extracted_at: Date.now(),
  };
}

// ---- main migration function ----

export interface MigrationResult {
  migrated: number;
  failed: number;
  errors: string[];
}

/**
 * Migrate all v1 LogEntries from the provided array into the v2 DB.
 *
 * @param v2db     - Target LoreV2DB instance.
 * @param v1Logs   - Array of v1 LogEntry objects (caller reads from v1 IndexedDB or fixture).
 * @returns        - { migrated, failed, errors }
 *
 * Idempotency: Checks migration_log for entries keyed 'v1_migrated:<logId>'.
 *              Already-migrated logs are skipped without error.
 *
 * Failure isolation: Each log is migrated in its own try/catch.
 *                    Failures are recorded in migration_log and do not abort others.
 */
export async function migrateV1toV2(
  v2db: LoreV2DB,
  v1Logs: V1LogEntry[],
): Promise<MigrationResult> {
  const result: MigrationResult = { migrated: 0, failed: 0, errors: [] };

  // Build set of already-migrated log IDs from migration_log.
  const existingLogs = await v2db.migration_log.toArray();
  const alreadyMigrated = new Set(
    existingLogs
      .filter((r) => r.success && r.id.startsWith('v1_migrated:'))
      .map((r) => r.id.replace('v1_migrated:', '')),
  );

  // Archive v1 raw data (idempotent — upsert).
  await v2db.meta.put({ key: 'v1_archive', value: v1Logs });

  for (const log of v1Logs) {
    // Guard against null/undefined entries (e.g. corrupt data).
    if (log == null || typeof log !== 'object') {
      const logRow: MigrationLogRow = {
        id: `v1_migrated:__null_${Date.now()}_${Math.random()}`,
        from_version: 1,
        to_version: 2,
        at: Date.now(),
        success: false,
        error: 'log entry is null or not an object',
      };
      await v2db.migration_log.put(logRow);
      result.failed++;
      result.errors.push('log entry is null or not an object');
      continue;
    }

    if (alreadyMigrated.has(log.id)) {
      // Already migrated — skip.
      continue;
    }

    const logRow: MigrationLogRow = {
      id: `v1_migrated:${log.id}`,
      from_version: 1,
      to_version: 2,
      at: Date.now(),
      success: false,
    };

    try {
      const now = Date.now();
      const startedAt = log.createdAt ? new Date(log.createdAt).getTime() : now;
      const sessionId = sessionIdForLog(log.id);
      const checkpointId = checkpointIdForLog(log.id);
      const syntheticMsgId = syntheticMessageIdForLog(log.id);

      // ---- 1. Session ----
      const session: Session = {
        id: sessionId,
        project_id: log.projectId ?? null,
        title: log.title ?? '[migrated from v1]',
        started_at: startedAt,
        ended_at: startedAt,
        primary_provider: 'mixed',
        source: 'paste',
        schema_version: 2,
        created_at: now,
      };

      // ---- 2. Synthetic message ----
      const messageText = log.sourceText
        ? log.sourceText.slice(0, 50000) // guard against huge blobs
        : '[migrated from v1]';

      const syntheticMessage: Message = {
        id: syntheticMsgId,
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

      // ---- 3. Checkpoint ----
      const checkpoint: Checkpoint = {
        id: checkpointId,
        session_id: sessionId,
        parent_checkpoint_id: null,
        message_state_hash: PLACEHOLDER_HASH,
        extraction_state_hash: PLACEHOLDER_HASH,
        label: 'v1 migration checkpoint',
        auto: true,
        summary: `Migrated from v1 log: ${log.title ?? log.id}`,
        message_count: 1,
        created_at: now,
        created_by: 'auto_interval',
      };

      // ---- 4. Decisions ----
      const decisions: Decision[] = [];
      const provenance = migrationProvenance(syntheticMsgId);

      if (log.decisionRationales && log.decisionRationales.length > 0) {
        for (const dr of log.decisionRationales) {
          const title = dr.title ?? dr.decision ?? '[untitled decision]';
          if (!title.trim()) continue;
          decisions.push({
            id: generateId(),
            session_id: sessionId,
            project_id: log.projectId ?? null,
            first_checkpoint_id: checkpointId,
            title: title.slice(0, 500),
            rationale: (dr.rationale ?? '').slice(0, 10000),
            alternatives_considered: [],
            status: 'active',
            superseded_by: null,
            derived_from: provenance,
            created_at: startedAt,
            updated_at: startedAt,
          });
        }
      } else if (log.decisions && log.decisions.length > 0) {
        for (const d of log.decisions) {
          if (!d.trim()) continue;
          decisions.push({
            id: generateId(),
            session_id: sessionId,
            project_id: log.projectId ?? null,
            first_checkpoint_id: checkpointId,
            title: d.slice(0, 500),
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

      // ---- 5. Todos ----
      const todos: Todo[] = [];
      if (log.todo && log.todo.length > 0) {
        for (const t of log.todo) {
          if (!t.trim()) continue;
          todos.push({
            id: generateId(),
            session_id: sessionId,
            project_id: log.projectId ?? null,
            first_checkpoint_id: checkpointId,
            title: t.slice(0, 500),
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

      // ---- 6. Blockers ----
      const blockers: Blocker[] = [];
      if (log.blockers && log.blockers.length > 0) {
        for (const b of log.blockers) {
          if (!b.trim()) continue;
          blockers.push({
            id: generateId(),
            session_id: sessionId,
            project_id: log.projectId ?? null,
            first_checkpoint_id: checkpointId,
            title: b.slice(0, 500),
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

      // ---- Write all in a transaction ----
      await v2db.transaction(
        'rw',
        [
          v2db.sessions,
          v2db.messages,
          v2db.checkpoints,
          v2db.decisions,
          v2db.todos,
          v2db.blockers,
        ],
        async () => {
          await v2db.sessions.put(session);
          await v2db.messages.put(syntheticMessage);
          await v2db.checkpoints.put(checkpoint);
          if (decisions.length > 0) await v2db.decisions.bulkPut(decisions);
          if (todos.length > 0) await v2db.todos.bulkPut(todos);
          if (blockers.length > 0) await v2db.blockers.bulkPut(blockers);
        },
      );

      logRow.success = true;
      result.migrated++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logRow.error = message;
      result.failed++;
      result.errors.push(`log ${log.id}: ${message}`);
    }

    // Record in migration_log (outside transaction so it persists even on failure).
    await v2db.migration_log.put(logRow);
  }

  return result;
}
