/**
 * Tests for MigrationExecutor (spec §5 tests #7 and #8).
 *
 * Uses fake-indexeddb for the Dexie layer and injected fixed clock +
 * sequential ID generator for determinism.
 *
 * #7 — v1→v2 migration preserves all LogEntry data
 * #8 — migration is idempotent (re-run no-op)
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LoreV2DB } from '../../db';
import { MigrationExecutor } from '../../migrations/v1-to-v2/executor';
import { fixedClock, sequentialIdGenerator } from '../../ports';
import { createMemoryLogger } from '../../logger';
import type { V1LogEntry } from '../../migrations/v1-to-v2/converter';

import allFixtures from '../fixtures/v1-log-entries.json';
import simpleFixture from '../../migrations/v1-to-v2/__fixtures__/simple.json';

const FIXED_NOW = 1_713_168_000_000;

let dbCounter = 0;

function makeExecutor(db: LoreV2DB) {
  return new MigrationExecutor(
    db,
    fixedClock(FIXED_NOW),
    sequentialIdGenerator(),
    createMemoryLogger(),
  );
}

function freshDb() {
  return new LoreV2DB(`lore_v2_executor_test_${++dbCounter}`);
}

// ---- spec #7: data preservation ----

describe('MigrationExecutor — spec #7: data preservation', () => {
  let db: LoreV2DB;

  beforeEach(async () => {
    db = freshDb();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('migrates all 10 fixture logs without failure', async () => {
    const executor = makeExecutor(db);
    const result = await executor.run(allFixtures as V1LogEntry[]);
    expect(result.failed).toBe(0);
    expect(result.migrated).toBe(10);
  });

  it('creates one Session per LogEntry', async () => {
    await makeExecutor(db).run(allFixtures as V1LogEntry[]);
    expect(await db.sessions.count()).toBe(10);
  });

  it('creates one Message per LogEntry (synthetic)', async () => {
    await makeExecutor(db).run(allFixtures as V1LogEntry[]);
    expect(await db.messages.count()).toBe(10);
  });

  it('creates one Checkpoint per LogEntry', async () => {
    await makeExecutor(db).run(allFixtures as V1LogEntry[]);
    expect(await db.checkpoints.count()).toBe(10);
  });

  it('creates expected number of Decisions', async () => {
    await makeExecutor(db).run(allFixtures as V1LogEntry[]);
    const decisions = await db.decisions.toArray();
    // 1+2+2+2+2+0+0+1+0+2 = 12
    expect(decisions.length).toBe(12);
  });

  it('creates expected number of Todos', async () => {
    await makeExecutor(db).run(allFixtures as V1LogEntry[]);
    const todos = await db.todos.toArray();
    // 2+2+2+2+2+2+0+2+0+2 = 16
    expect(todos.length).toBe(16);
  });

  it('creates expected number of Blockers', async () => {
    await makeExecutor(db).run(allFixtures as V1LogEntry[]);
    const blockers = await db.blockers.toArray();
    // 1+0+1+0+1+0+2+1+0+0 = 6
    expect(blockers.length).toBe(6);
  });

  it('all provenance message_ids have length >= 1', async () => {
    await makeExecutor(db).run(allFixtures as V1LogEntry[]);
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
    await makeExecutor(db).run(allFixtures as V1LogEntry[]);
    const sessions = await db.sessions.toArray();
    for (const s of sessions) {
      expect(s.schema_version).toBe(2);
    }
  });

  it('v1 raw data archived in meta key "v1_archive"', async () => {
    await makeExecutor(db).run(allFixtures as V1LogEntry[]);
    const meta = await db.meta.get('v1_archive');
    expect(meta).toBeDefined();
    expect(Array.isArray(meta!.value)).toBe(true);
    expect((meta!.value as unknown[]).length).toBe(10);
  });

  it('migration_log has success entries for all 10 logs', async () => {
    await makeExecutor(db).run(allFixtures as V1LogEntry[]);
    const log = await db.migration_log.toArray();
    const successful = log.filter((r) => r.success);
    expect(successful.length).toBe(10);
  });

  it('logs migration events to the logger', async () => {
    const logger = createMemoryLogger();
    const executor = new MigrationExecutor(db, fixedClock(FIXED_NOW), sequentialIdGenerator(), logger);
    await executor.run(allFixtures as V1LogEntry[]);
    const infoEvents = logger.entries.filter((e) => e.level === 'info').map((e) => e.event);
    expect(infoEvents).toContain('migration.started');
    expect(infoEvents).toContain('migration.completed');
  });
});

// ---- spec #8: idempotency ----

describe('MigrationExecutor — spec #8: idempotency', () => {
  let db: LoreV2DB;

  beforeEach(async () => {
    db = freshDb();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('second run migrates 0 additional logs (complete no-op)', async () => {
    const first = await makeExecutor(db).run(allFixtures as V1LogEntry[]);
    expect(first.migrated).toBe(10);

    const second = await makeExecutor(db).run(allFixtures as V1LogEntry[]);
    expect(second.migrated).toBe(0);
    expect(second.skipped).toBe(10);
    expect(second.failed).toBe(0);
  });

  it('second run does not duplicate sessions', async () => {
    await makeExecutor(db).run(allFixtures as V1LogEntry[]);
    await makeExecutor(db).run(allFixtures as V1LogEntry[]);
    expect(await db.sessions.count()).toBe(10);
  });

  it('second run does not duplicate decisions', async () => {
    await makeExecutor(db).run(allFixtures as V1LogEntry[]);
    const firstCount = await db.decisions.count();
    await makeExecutor(db).run(allFixtures as V1LogEntry[]);
    expect(await db.decisions.count()).toBe(firstCount);
  });

  it('partial run then full run completes remaining logs', async () => {
    const partial = await makeExecutor(db).run(
      (allFixtures as V1LogEntry[]).slice(0, 3),
    );
    expect(partial.migrated).toBe(3);

    const full = await makeExecutor(db).run(allFixtures as V1LogEntry[]);
    expect(full.migrated).toBe(7);
    expect(full.skipped).toBe(3);

    expect(await db.sessions.count()).toBe(10);
  });
});

// ---- failure handling ----

describe('MigrationExecutor — failure handling', () => {
  let db: LoreV2DB;

  beforeEach(async () => {
    db = freshDb();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('records failure in migration_log for null entry', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await makeExecutor(db).run([null as any]);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);

    const log = await db.migration_log.toArray();
    const failed = log.filter((r) => !r.success);
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toBeTruthy();
  });

  it('continues processing remaining logs after a single failure', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await makeExecutor(db).run([null as any, simpleFixture as V1LogEntry]);
    expect(result.failed).toBe(1);
    expect(result.migrated).toBe(1);
  });

  it('handles empty log array without error', async () => {
    const result = await makeExecutor(db).run([]);
    expect(result.migrated).toBe(0);
    expect(result.failed).toBe(0);
  });
});
