/**
 * Tests for the pure v1→v2 converter.
 *
 * No DB, no Dexie, no fake-indexeddb — pure function tests only.
 * Uses injected fixed clock and sequential ID generator.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { convertLog, type V1LogEntry } from '../../migrations/v1-to-v2/converter';
import { fixedClock, sequentialIdGenerator } from '../../ports';
import simpleFixture from '../../migrations/v1-to-v2/__fixtures__/simple.json';
import withDecisionsFixture from '../../migrations/v1-to-v2/__fixtures__/with-decisions.json';
import legacyFixture from '../../migrations/v1-to-v2/__fixtures__/legacy-format.json';
import corruptedFixtureFile from '../../migrations/v1-to-v2/__fixtures__/corrupted.json';

const FIXED_NOW = 1_713_168_000_000;
const clock = fixedClock(FIXED_NOW);

// The corrupted fixture stores entries in an array under .entries
const corruptedEntries = (corruptedFixtureFile as { entries: V1LogEntry[] }).entries;

// ---- helpers ----

function convert(log: V1LogEntry) {
  return convertLog(log, clock, sequentialIdGenerator());
}

// ---- basic conversion ----

describe('convertLog — simple fixture', () => {
  it('returns ok', () => {
    const result = convert(simpleFixture as V1LogEntry);
    expect(result.ok).toBe(true);
  });

  it('produces a Session with schema_version 2', () => {
    const result = convert(simpleFixture as V1LogEntry);
    if (!result.ok) throw new Error('unexpected error');
    expect(result.value.session.schema_version).toBe(2);
  });

  it('session.started_at matches log createdAt', () => {
    const result = convert(simpleFixture as V1LogEntry);
    if (!result.ok) throw new Error('unexpected error');
    expect(result.value.session.started_at).toBe(
      new Date(simpleFixture.createdAt).getTime(),
    );
  });

  it('session.project_id matches log projectId', () => {
    const result = convert(simpleFixture as V1LogEntry);
    if (!result.ok) throw new Error('unexpected error');
    expect(result.value.session.project_id).toBe(simpleFixture.projectId);
  });

  it('produces one synthetic message', () => {
    const result = convert(simpleFixture as V1LogEntry);
    if (!result.ok) throw new Error('unexpected error');
    expect(result.value.message.role).toBe('user');
    expect(result.value.message.session_id).toBe(result.value.session.id);
  });

  it('message uses [migrated from v1] placeholder when no sourceText', () => {
    const result = convert(simpleFixture as V1LogEntry);
    if (!result.ok) throw new Error('unexpected error');
    const block = result.value.message.content_blocks[0];
    expect(block.type).toBe('text');
    if (block.type === 'text') expect(block.text).toBe('[migrated from v1]');
  });

  it('produces one checkpoint', () => {
    const result = convert(simpleFixture as V1LogEntry);
    if (!result.ok) throw new Error('unexpected error');
    expect(result.value.checkpoint.auto).toBe(true);
    expect(result.value.checkpoint.session_id).toBe(result.value.session.id);
  });

  it('converts decisions[] to Decision entities', () => {
    const result = convert(simpleFixture as V1LogEntry);
    if (!result.ok) throw new Error('unexpected error');
    expect(result.value.decisions).toHaveLength(1);
    expect(result.value.decisions[0].title).toBe('Use React + Vite over Next.js for PWA simplicity');
  });

  it('converts todo[] to Todo entities', () => {
    const result = convert(simpleFixture as V1LogEntry);
    if (!result.ok) throw new Error('unexpected error');
    expect(result.value.todos).toHaveLength(2);
  });

  it('converts blockers[] to Blocker entities', () => {
    const result = convert(simpleFixture as V1LogEntry);
    if (!result.ok) throw new Error('unexpected error');
    expect(result.value.blockers).toHaveLength(1);
  });

  it('all derived entities have non-empty provenance.message_ids', () => {
    const result = convert(simpleFixture as V1LogEntry);
    if (!result.ok) throw new Error('unexpected error');
    const { decisions, todos, blockers } = result.value;
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
});

describe('convertLog — with-decisions fixture (decisionRationales)', () => {
  it('uses decisionRationales when present', () => {
    const result = convert(withDecisionsFixture as V1LogEntry);
    if (!result.ok) throw new Error('unexpected error');
    expect(result.value.decisions).toHaveLength(3);
  });

  it('preserves rationale text', () => {
    const result = convert(withDecisionsFixture as V1LogEntry);
    if (!result.ok) throw new Error('unexpected error');
    const d = result.value.decisions.find((x) => x.title.includes('Dexie'));
    expect(d?.rationale).toContain('Structured queries');
  });

  it('handles decision with only .decision field (no .title)', () => {
    const result = convert(withDecisionsFixture as V1LogEntry);
    if (!result.ok) throw new Error('unexpected error');
    const d = result.value.decisions.find((x) => x.title.includes('Repository pattern'));
    expect(d).toBeDefined();
  });
});

describe('convertLog — legacy-format fixture', () => {
  it('ignores deprecated fields (inProgress, resumePoint)', () => {
    const result = convert(legacyFixture as unknown as V1LogEntry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Deprecated fields do not appear in v2 entities
    expect((result.value.session as Record<string, unknown>)['inProgress']).toBeUndefined();
  });

  it('uses sourceText when present', () => {
    const result = convert(legacyFixture as unknown as V1LogEntry);
    if (!result.ok) throw new Error('unexpected error');
    const block = result.value.message.content_blocks[0];
    if (block.type === 'text') {
      expect(block.text).toContain('chunking strategy');
    }
  });
});

describe('convertLog — corrupted fixture entries', () => {
  it('returns VALIDATION_FAILED for unparseable createdAt', () => {
    const entry = corruptedEntries.find((e) => e.id.includes('bad-date'));
    expect(entry).toBeDefined();
    const result = convert(entry!);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_FAILED');
  });

  it('handles entry with empty title (uses fallback)', () => {
    const entry = corruptedEntries.find((e) => e.id.includes('empty-title'));
    expect(entry).toBeDefined();
    const result = convert(entry!);
    expect(result.ok).toBe(true);
  });

  it('skips blank-string decision/todo/blocker items', () => {
    const entry = corruptedEntries.find((e) => e.id.includes('blank-items'));
    expect(entry).toBeDefined();
    const result = convert(entry!);
    if (!result.ok) throw new Error('unexpected error');
    expect(result.value.decisions).toHaveLength(1);
    expect(result.value.todos).toHaveLength(1);
    expect(result.value.blockers).toHaveLength(0);
  });

  it('handles entry with no projectId (project_id is null)', () => {
    const entry = corruptedEntries.find((e) => e.id.includes('no-project'));
    expect(entry).toBeDefined();
    const result = convert(entry!);
    if (!result.ok) throw new Error('unexpected error');
    expect(result.value.session.project_id).toBeNull();
    expect(result.value.decisions[0].project_id).toBeNull();
  });
});

describe('convertLog — determinism (idempotency of IDs)', () => {
  it('produces same session/message/checkpoint IDs for same input regardless of clock', () => {
    const log = simpleFixture as V1LogEntry;
    const r1 = convertLog(log, fixedClock(1_000_000), sequentialIdGenerator());
    const r2 = convertLog(log, fixedClock(9_999_999), sequentialIdGenerator());
    if (!r1.ok || !r2.ok) throw new Error('unexpected error');
    // Session/message/checkpoint IDs are derived deterministically from log.id
    expect(r1.value.session.id).toBe(r2.value.session.id);
    expect(r1.value.message.id).toBe(r2.value.message.id);
    expect(r1.value.checkpoint.id).toBe(r2.value.checkpoint.id);
  });
});

// ---- property-based tests ----

describe('convertLog — property-based tests', () => {
  /**
   * Property: For any valid v1 log entry, the converter either succeeds
   * or returns a typed error — it never throws.
   */
  it('never throws for arbitrary input shapes', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 40 }),
          createdAt: fc.oneof(
            fc.constantFrom('2025-01-01T00:00:00.000Z', '2024-06-15T12:00:00.000Z'),
            fc.string({ maxLength: 30 }),
          ),
          title: fc.string({ maxLength: 500 }),
          decisions: fc.array(fc.string({ maxLength: 500 }), { maxLength: 20 }),
          todo: fc.array(fc.string({ maxLength: 500 }), { maxLength: 20 }),
          blockers: fc.array(fc.string({ maxLength: 500 }), { maxLength: 10 }),
        }),
        (log) => {
          // Should never throw — always returns a Result
          const result = convertLog(
            log as V1LogEntry,
            fixedClock(FIXED_NOW),
            sequentialIdGenerator(),
          );
          // Result is either ok or a typed error — both are acceptable
          return typeof result.ok === 'boolean';
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Property: When conversion succeeds, all derived entities
   * have non-empty derived_from.message_ids.
   */
  it('all derived entities always have provenance.message_ids.length >= 1 on success', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 40 }),
          createdAt: fc.constant('2025-01-01T00:00:00.000Z'),
          title: fc.string({ minLength: 1, maxLength: 200 }),
          decisions: fc.array(fc.string({ minLength: 1, maxLength: 200 }), { maxLength: 10 }),
          todo: fc.array(fc.string({ minLength: 1, maxLength: 200 }), { maxLength: 10 }),
          blockers: fc.array(fc.string({ minLength: 1, maxLength: 200 }), { maxLength: 5 }),
        }),
        (log) => {
          const result = convertLog(
            log as V1LogEntry,
            fixedClock(FIXED_NOW),
            sequentialIdGenerator(),
          );
          if (!result.ok) return true; // validation error is fine
          const { decisions, todos, blockers } = result.value;
          return (
            decisions.every((d) => d.derived_from.message_ids.length >= 1) &&
            todos.every((t) => t.derived_from.message_ids.length >= 1) &&
            blockers.every((b) => b.derived_from.message_ids.length >= 1)
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  /**
   * Property: Session IDs are deterministic — same log.id always produces
   * the same session.id regardless of other fields or clock.
   */
  it('session ID is stable across different clocks and titles for the same log.id', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        (logId, title1, title2) => {
          const base = {
            id: logId,
            createdAt: '2025-01-01T00:00:00.000Z',
            decisions: [],
            todo: [],
            blockers: [],
          };
          const r1 = convertLog({ ...base, title: title1 } as V1LogEntry, fixedClock(1000), sequentialIdGenerator());
          const r2 = convertLog({ ...base, title: title2 } as V1LogEntry, fixedClock(9999), sequentialIdGenerator());
          if (!r1.ok || !r2.ok) return true;
          return r1.value.session.id === r2.value.session.id;
        },
      ),
      { numRuns: 200 },
    );
  });
});
