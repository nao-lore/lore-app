/**
 * LoreV2DB — Dexie-based IndexedDB for Lore v2.
 *
 * DB name: `lore_v2` — intentionally separate from v1 `lore` to enable
 * side-by-side operation and safe rollback.
 *
 * Schema version 1 defines all 10 tables with indexes per §2 of the spec.
 * Compound and multi-entry indexes follow Dexie conventions:
 * - `&` — unique primary key
 * - `*` prefix — multi-entry (array) index
 * - `[a+b]` — compound index
 *
 * @see ADR-0004 — Repository Pattern over Direct Dexie
 * @since 0.2.0
 *
 * @example
 * ```ts
 * import { db } from './db';
 * const session = await db.sessions.get(sessionId);
 * ```
 */
import Dexie, { type Table } from 'dexie';
import type {
  Session,
  Message,
  Checkpoint,
  Decision,
  Todo,
  Blocker,
  Learning,
  Project,
} from './schemas/entities';

// ---- Migration log row ----

/**
 * A record of one migration attempt (success or failure).
 * Keyed by `v1_migrated:<v1LogId>` for idempotency checks.
 */
export interface MigrationLogRow {
  readonly id: string;
  readonly from_version: number;
  readonly to_version: number;
  readonly at: number;
  readonly success: boolean;
  readonly error?: string;
}

// ---- Meta row ----

/**
 * Generic key-value store for internal metadata (e.g. `v1_archive`).
 */
export interface MetaRow {
  readonly key: string;
  readonly value: unknown;
}

// ---- DB class ----

/**
 * Dexie subclass representing the Lore v2 IndexedDB database.
 *
 * Consumers should use repository interfaces rather than accessing tables
 * directly. The `db` singleton is for Dexie adapter implementations only.
 *
 * @example
 * ```ts
 * const db = new LoreV2DB('lore_v2_test');
 * await db.open();
 * await db.sessions.put(session);
 * await db.delete();
 * ```
 */
export class LoreV2DB extends Dexie {
  projects!: Table<Project, string>;
  sessions!: Table<Session, string>;
  messages!: Table<Message, string>;
  checkpoints!: Table<Checkpoint, string>;
  decisions!: Table<Decision, string>;
  todos!: Table<Todo, string>;
  blockers!: Table<Blocker, string>;
  learnings!: Table<Learning, string>;
  meta!: Table<MetaRow, string>;
  migration_log!: Table<MigrationLogRow, string>;

  constructor(name = 'lore_v2') {
    super(name);
    this.version(1).stores({
      // Primary key first (&id = unique), then indexed fields.
      // Multi-entry (array) indexes use * prefix.
      // Compound indexes use [a+b] syntax.
      projects:     '&id, name, archived, updated_at',
      sessions:     '&id, project_id, source, started_at, [project_id+started_at]',
      messages:
        '&id, session_id, parent_message_id, role, created_at, [session_id+created_at]',
      checkpoints:
        '&id, session_id, parent_checkpoint_id, created_at, message_state_hash, [session_id+created_at]',
      decisions:
        '&id, session_id, project_id, first_checkpoint_id, status, *derived_from.message_ids, [project_id+status]',
      todos:
        '&id, session_id, project_id, first_checkpoint_id, status, due_at, *blocker_ids, *derived_from.message_ids, [project_id+status]',
      blockers:
        '&id, session_id, project_id, first_checkpoint_id, status, severity, *derived_from.message_ids, [project_id+status]',
      learnings:
        '&id, session_id, project_id, first_checkpoint_id, *tags, *derived_from.message_ids, [project_id+created_at]',
      meta:          '&key',
      migration_log: '&id, at',
    });
  }
}

/** Singleton for browser use. Tests create their own instances via `new LoreV2DB(name)`. */
export const db = new LoreV2DB();
