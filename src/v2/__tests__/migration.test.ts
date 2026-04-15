/**
 * Tests for migrateV1toV2 (src/v2/migrations/v1_to_v2.ts)
 *
 * Covers spec §5 tests #7 and #8:
 * #7 — v1→v2 migration preserves all LogEntry data
 * #8 — migration is idempotent (re-run no-op)
 *
 * Additional coverage:
 * - Session, Messages, Checkpoint, Decisions, Todos, Blockers generated
 * - Provenance message_ids never empty (min 1)
 * - Failure recorded in migration_log
 * - v1 archive stored in meta
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LoreV2DB } from '../db';
import { migrateV1toV2 } from '../migrations/v1_to_v2';

import fixtureData from './fixtures/v1-log-entries.json';

// ---- helpers ----

let dbCount = 0;

function freshDb(): LoreV2DB {
  return new LoreV2DB(`lore_v2_migration_test_${++dbCount}`);
}

// ---- tests ----

describe('migrateV1toV2 — basic migration (spec #7)', () => {
  let db: LoreV2DB;

  beforeEach(async () => {
    db = freshDb();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('migrates all 10 fixture logs without failure', async () => {
    const result = await migrateV1toV2(db, fixtureData as never);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.migrated).toBe(10);
  });

  it('creates one Session per LogEntry', async () => {
    await migrateV1toV2(db, fixtureData as never);
    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(10);
  });

  it('creates one Message per LogEntry (synthetic)', async () => {
    await migrateV1toV2(db, fixtureData as never);
    const messages = await db.messages.toArray();
    expect(messages).toHaveLength(10);
  });

  it('creates one Checkpoint per LogEntry', async () => {
    await migrateV1toV2(db, fixtureData as never);
    const checkpoints = await db.checkpoints.toArray();
    expect(checkpoints).toHaveLength(10);
  });

  it('creates Decisions from decisions[] and decisionRationales[]', async () => {
    await migrateV1toV2(db, fixtureData as never);
    const decisions = await db.decisions.toArray();
    // fixture has:
    //   log-001: 1 decision (string)
    //   log-002: 2 decisionRationales
    //   log-003: 2 decisions
    //   log-004: 2 decisions
    //   log-005: 2 decisions
    //   log-006: 0
    //   log-007: 0
    //   log-008: 1 decisionRationale
    //   log-009: 0
    //   log-010: 2 decisions
    // total = 1+2+2+2+2+0+0+1+0+2 = 12
    expect(decisions.length).toBe(12);
  });

  it('creates Todos from todo[]', async () => {
    await migrateV1toV2(db, fixtureData as never);
    const todos = await db.todos.toArray();
    // 2+2+2+2+2+2+0+2+0+2 = 16
    expect(todos.length).toBe(16);
  });

  it('creates Blockers from blockers[]', async () => {
    await migrateV1toV2(db, fixtureData as never);
    const blockers = await db.blockers.toArray();
    // 1+0+1+0+1+0+2+1+0+0 = 6
    expect(blockers.length).toBe(6);
  });

  it('all Provenance message_ids have length >= 1 (never empty)', async () => {
    await migrateV1toV2(db, fixtureData as never);

    const decisions = await db.decisions.toArray();
    const todos = await db.todos.toArray();
    const blockers = await db.blockers.toArray();

    for (const d of decisions) {
      expect(d.derived_from.message_ids.length).toBeGreaterThanOrEqual(1);
    }
    for (const t of todos) {
      expect(t.derived_from.message_ids.length).toBeGreaterThanOrEqual(1);
    }
    for (const b of blockers) {
      expect(b.derived_from.message_ids.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('session.schema_version is 2 for all migrated sessions', async () => {
    await migrateV1toV2(db, fixtureData as never);
    const sessions = await db.sessions.toArray();
    for (const s of sessions) {
      expect(s.schema_version).toBe(2);
    }
  });

  it('session started_at matches v1 log createdAt', async () => {
    await migrateV1toV2(db, fixtureData as never);
    const sessions = await db.sessions.toArray();
    // log-001 createdAt = "2025-03-10T09:00:00.000Z" → 1741597200000
    const log001Session = sessions.find((s) => s.title === 'Lore MVP kickoff');
    expect(log001Session).toBeDefined();
    expect(log001Session!.started_at).toBe(new Date('2025-03-10T09:00:00.000Z').getTime());
  });

  it('v1 raw data archived in meta key "v1_archive"', async () => {
    await migrateV1toV2(db, fixtureData as never);
    const meta = await db.meta.get('v1_archive');
    expect(meta).toBeDefined();
    expect(Array.isArray(meta!.value)).toBe(true);
    expect((meta!.value as unknown[]).length).toBe(10);
  });

  it('migration_log has success entries for all 10 logs', async () => {
    await migrateV1toV2(db, fixtureData as never);
    const log = await db.migration_log.toArray();
    const successful = log.filter((r) => r.success);
    expect(successful.length).toBe(10);
  });

  it('message content uses sourceText when present', async () => {
    await migrateV1toV2(db, fixtureData as never);

    // log-003 has sourceText: "User: Can you build a session summarizer?..."
    // title is not indexed — use filter()
    const log003Sessions = await db.sessions.filter((s) => s.title === 'Transform pipeline spike').toArray();
    expect(log003Sessions).toHaveLength(1);

    const msgs = await db.messages.where('session_id').equals(log003Sessions[0].id).toArray();
    expect(msgs).toHaveLength(1);
    const textBlock = msgs[0].content_blocks.find((b) => b.type === 'text') as { type: 'text'; text: string } | undefined;
    expect(textBlock?.text).toContain('session summarizer');
  });

  it('message content uses placeholder when sourceText absent', async () => {
    await migrateV1toV2(db, fixtureData as never);
    // log-001 has no sourceText — title not indexed, use filter()
    const sessions = await db.sessions.filter((s) => s.title === 'Lore MVP kickoff').toArray();
    const msgs = await db.messages.where('session_id').equals(sessions[0].id).toArray();
    const textBlock = msgs[0].content_blocks.find((b) => b.type === 'text') as { type: 'text'; text: string } | undefined;
    expect(textBlock?.text).toBe('[migrated from v1]');
  });
});

describe('migrateV1toV2 — idempotency (spec #8)', () => {
  let db: LoreV2DB;

  beforeEach(async () => {
    db = freshDb();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('second run migrates 0 additional logs (complete no-op)', async () => {
    const first = await migrateV1toV2(db, fixtureData as never);
    expect(first.migrated).toBe(10);

    const second = await migrateV1toV2(db, fixtureData as never);
    expect(second.migrated).toBe(0);
    expect(second.failed).toBe(0);
  });

  it('second run does not duplicate sessions', async () => {
    await migrateV1toV2(db, fixtureData as never);
    await migrateV1toV2(db, fixtureData as never);

    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(10);
  });

  it('second run does not duplicate decisions', async () => {
    await migrateV1toV2(db, fixtureData as never);
    const firstCount = (await db.decisions.toArray()).length;

    await migrateV1toV2(db, fixtureData as never);
    const secondCount = (await db.decisions.toArray()).length;

    expect(secondCount).toBe(firstCount);
  });

  it('partial run then full run completes remaining logs', async () => {
    // Migrate only first 3 logs
    const partial = await migrateV1toV2(db, (fixtureData as never[]).slice(0, 3));
    expect(partial.migrated).toBe(3);

    // Migrate all 10 — should only migrate the remaining 7
    const full = await migrateV1toV2(db, fixtureData as never);
    expect(full.migrated).toBe(7);

    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(10);
  });
});

describe('migrateV1toV2 — failure handling', () => {
  let db: LoreV2DB;

  beforeEach(async () => {
    db = freshDb();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('records failure in migration_log when a log causes an error', async () => {
    // Pass a null entry which will cause an error inside the loop.
    const badLog = null as unknown as never;
    const result = await migrateV1toV2(db, [badLog]);

    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);

    const log = await db.migration_log.toArray();
    const failed = log.filter((r) => !r.success);
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toBeTruthy();
  });

  it('continues processing remaining logs after a single failure', async () => {
    const badLog = null as unknown as never;
    const goodLog = (fixtureData as never[])[0];

    // bad first, good second
    const result = await migrateV1toV2(db, [badLog, goodLog]);

    expect(result.failed).toBe(1);
    expect(result.migrated).toBe(1);
  });
});

describe('migrateV1toV2 — edge cases', () => {
  let db: LoreV2DB;

  beforeEach(async () => {
    db = freshDb();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('handles empty log array without error', async () => {
    const result = await migrateV1toV2(db, []);
    expect(result.migrated).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('handles log with empty decisions/todo/blockers arrays', async () => {
    const emptyLog = {
      id: 'log-009-iiiiiiiiiiiiiiiiiiii',
      createdAt: '2025-03-18T12:00:00.000Z',
      title: 'Empty log entry (edge case)',
      decisions: [],
      todo: [],
      blockers: [],
      tags: [],
    };
    const result = await migrateV1toV2(db, [emptyLog] as never);
    expect(result.migrated).toBe(1);

    const decisions = await db.decisions.toArray();
    const todos = await db.todos.toArray();
    const blockers = await db.blockers.toArray();
    expect(decisions).toHaveLength(0);
    expect(todos).toHaveLength(0);
    expect(blockers).toHaveLength(0);

    // Session and message still created
    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(1);
  });

  it('skips blank-string decision items', async () => {
    const log = {
      id: 'log-blank-decisions',
      createdAt: '2025-03-20T10:00:00.000Z',
      title: 'Blank strings test',
      decisions: ['', '  ', 'Valid decision'],
      todo: [],
      blockers: [],
    };
    await migrateV1toV2(db, [log] as never);
    const decisions = await db.decisions.toArray();
    expect(decisions).toHaveLength(1);
    expect(decisions[0].title).toBe('Valid decision');
  });
});
