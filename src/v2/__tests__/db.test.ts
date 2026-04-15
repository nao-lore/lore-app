/**
 * Tests for LoreV2DB (src/v2/db.ts)
 *
 * Covers:
 * - DB instantiation with correct name and version
 * - All tables are accessible
 * - Basic insert + query on each table
 * - Compound index queries work
 * - Multi-entry index queries work
 * - Unique primary key constraint enforced
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LoreV2DB } from '../db';
import type {
  Session,
  Message,
  Checkpoint,
  Decision,
  Todo,
  Blocker,
  Learning,
  Project,
} from '../__stub__/entities-stub';

// ---- helpers ----

let db: LoreV2DB;
let dbCount = 0;

function freshDb(): LoreV2DB {
  // Each test gets a unique DB name to avoid cross-test contamination.
  return new LoreV2DB(`lore_v2_test_db_${++dbCount}`);
}

const NOW = 1_700_000_000_000;

const PLACEHOLDER_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function makeProvenance(msgId: string) {
  return {
    message_ids: [msgId],
    extractor_model: 'test-model',
    extractor_prompt_hash: PLACEHOLDER_HASH,
    confidence: 0.9,
    extracted_at: NOW,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'SESSION01AAAAAAAAAAAAAAAAAA',
    project_id: null,
    title: 'Test session',
    started_at: NOW,
    ended_at: null,
    primary_provider: 'anthropic',
    source: 'paste',
    schema_version: 2,
    created_at: NOW,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'MESSAGE01AAAAAAAAAAAAAAAAAA',
    session_id: 'SESSION01AAAAAAAAAAAAAAAAAA',
    parent_message_id: null,
    role: 'user',
    provider: null,
    model: null,
    content_blocks: [{ type: 'text', text: 'hello' }],
    tokens: { input: 10, output: 0, cache_read: 0, cache_write: 0 },
    cost_usd_micros: 0,
    latency_ms: 0,
    created_at: NOW,
    ...overrides,
  };
}

function makeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    id: 'CHECKPT01AAAAAAAAAAAAAAAAA',
    session_id: 'SESSION01AAAAAAAAAAAAAAAAAA',
    parent_checkpoint_id: null,
    message_state_hash: PLACEHOLDER_HASH,
    extraction_state_hash: PLACEHOLDER_HASH,
    label: null,
    auto: true,
    summary: 'auto checkpoint',
    message_count: 1,
    created_at: NOW,
    created_by: 'auto_interval',
    ...overrides,
  };
}

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  const msgId = overrides.derived_from?.message_ids?.[0] ?? 'MESSAGE01AAAAAAAAAAAAAAAAAA';
  return {
    id: 'DECISION01AAAAAAAAAAAAAAAAA',
    session_id: 'SESSION01AAAAAAAAAAAAAAAAAA',
    project_id: null,
    first_checkpoint_id: 'CHECKPT01AAAAAAAAAAAAAAAAA',
    title: 'Use Dexie',
    rationale: 'structured queries',
    alternatives_considered: [],
    status: 'active',
    superseded_by: null,
    derived_from: makeProvenance(msgId),
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  const msgId = overrides.derived_from?.message_ids?.[0] ?? 'MESSAGE01AAAAAAAAAAAAAAAAAA';
  return {
    id: 'TODO0001AAAAAAAAAAAAAAAAAAA',
    session_id: 'SESSION01AAAAAAAAAAAAAAAAAA',
    project_id: null,
    first_checkpoint_id: 'CHECKPT01AAAAAAAAAAAAAAAAA',
    title: 'Write tests',
    body: '',
    status: 'open',
    priority: 'medium',
    due_at: null,
    blocker_ids: [],
    derived_from: makeProvenance(msgId),
    completed_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeBlocker(overrides: Partial<Blocker> = {}): Blocker {
  const msgId = overrides.derived_from?.message_ids?.[0] ?? 'MESSAGE01AAAAAAAAAAAAAAAAAA';
  return {
    id: 'BLOCKER1AAAAAAAAAAAAAAAAAAA',
    session_id: 'SESSION01AAAAAAAAAAAAAAAAAA',
    project_id: null,
    first_checkpoint_id: 'CHECKPT01AAAAAAAAAAAAAAAAA',
    title: 'API keys missing',
    description: '',
    severity: 'high',
    status: 'open',
    derived_from: makeProvenance(msgId),
    resolved_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeLearning(overrides: Partial<Learning> = {}): Learning {
  const msgId = overrides.derived_from?.message_ids?.[0] ?? 'MESSAGE01AAAAAAAAAAAAAAAAAA';
  return {
    id: 'LEARNING1AAAAAAAAAAAAAAAAAA',
    session_id: 'SESSION01AAAAAAAAAAAAAAAAAA',
    project_id: null,
    first_checkpoint_id: 'CHECKPT01AAAAAAAAAAAAAAAAA',
    title: 'Dexie multiEntry indexes',
    content: 'Use * prefix in store definition',
    tags: ['dexie', 'indexeddb'],
    derived_from: makeProvenance(msgId),
    created_at: NOW,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'PROJECT1AAAAAAAAAAAAAAAAAAA',
    name: 'Lore',
    description: 'PWA session tracker',
    color: null,
    icon: null,
    archived: false,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

// ---- tests ----

describe('LoreV2DB — schema and tables', () => {
  beforeEach(() => {
    db = freshDb();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('opens with DB name lore_v2 (default)', () => {
    const defaultDb = new LoreV2DB();
    expect(defaultDb.name).toBe('lore_v2');
    defaultDb.close();
  });

  it('has all 10 required tables', () => {
    const tableNames = db.tables.map((t) => t.name).sort();
    expect(tableNames).toEqual(
      [
        'blockers',
        'checkpoints',
        'decisions',
        'learnings',
        'messages',
        'meta',
        'migration_log',
        'projects',
        'sessions',
        'todos',
      ].sort(),
    );
  });

  it('is on schema version 1', async () => {
    // Open forces the upgrade transaction.
    await db.open();
    expect(db.verno).toBe(1);
    db.close();
  });
});

describe('LoreV2DB — CRUD: sessions', () => {
  beforeEach(async () => {
    db = freshDb();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('inserts and retrieves a session by id', async () => {
    const s = makeSession();
    await db.sessions.put(s);
    const got = await db.sessions.get(s.id);
    expect(got?.title).toBe('Test session');
    expect(got?.schema_version).toBe(2);
  });

  it('enforces unique primary key', async () => {
    const s = makeSession();
    await db.sessions.add(s);
    await expect(db.sessions.add(s)).rejects.toThrow();
  });

  it('queries by project_id + started_at compound index', async () => {
    const s1 = makeSession({ id: 'SESS1AAAAAAAAAAAAAAAAAAAAAA', project_id: 'PROJ1AAAAAAAAAAAAAAAAAAAAAA', started_at: NOW });
    const s2 = makeSession({ id: 'SESS2AAAAAAAAAAAAAAAAAAAAAA', project_id: 'PROJ1AAAAAAAAAAAAAAAAAAAAAA', started_at: NOW + 1000 });
    const s3 = makeSession({ id: 'SESS3AAAAAAAAAAAAAAAAAAAAAA', project_id: 'PROJ2AAAAAAAAAAAAAAAAAAAAAA', started_at: NOW });
    await db.sessions.bulkPut([s1, s2, s3]);

    const results = await db.sessions
      .where('[project_id+started_at]')
      .between(
        ['PROJ1AAAAAAAAAAAAAAAAAAAAAA', Dexie.minKey],
        ['PROJ1AAAAAAAAAAAAAAAAAAAAAA', Dexie.maxKey],
      )
      .toArray();

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id).sort()).toEqual(['SESS1AAAAAAAAAAAAAAAAAAAAAA', 'SESS2AAAAAAAAAAAAAAAAAAAAAA'].sort());
  });
});

describe('LoreV2DB — CRUD: messages', () => {
  beforeEach(async () => {
    db = freshDb();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('inserts and retrieves a message', async () => {
    const m = makeMessage();
    await db.messages.put(m);
    const got = await db.messages.get(m.id);
    expect(got?.role).toBe('user');
  });

  it('queries messages by session_id', async () => {
    const m1 = makeMessage({ id: 'MSG1AAAAAAAAAAAAAAAAAAAAAA', session_id: 'SESSION01AAAAAAAAAAAAAAAAAA' });
    const m2 = makeMessage({ id: 'MSG2AAAAAAAAAAAAAAAAAAAAAA', session_id: 'SESSION01AAAAAAAAAAAAAAAAAA' });
    const m3 = makeMessage({ id: 'MSG3AAAAAAAAAAAAAAAAAAAAAA', session_id: 'OTHER_SESSION_AAAAAAAAAAAAAA' });
    await db.messages.bulkPut([m1, m2, m3]);

    const results = await db.messages.where('session_id').equals('SESSION01AAAAAAAAAAAAAAAAAA').toArray();
    expect(results).toHaveLength(2);
  });
});

describe('LoreV2DB — CRUD: checkpoints', () => {
  beforeEach(async () => {
    db = freshDb();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('inserts and retrieves a checkpoint', async () => {
    const c = makeCheckpoint();
    await db.checkpoints.put(c);
    const got = await db.checkpoints.get(c.id);
    expect(got?.auto).toBe(true);
    expect(got?.created_by).toBe('auto_interval');
  });

  it('queries checkpoints by message_state_hash index', async () => {
    const hash = 'abcd000000000000000000000000000000000000000000000000000000000000';
    const c = makeCheckpoint({ message_state_hash: hash });
    await db.checkpoints.put(c);

    const results = await db.checkpoints.where('message_state_hash').equals(hash).toArray();
    expect(results).toHaveLength(1);
  });
});

describe('LoreV2DB — CRUD: decisions', () => {
  beforeEach(async () => {
    db = freshDb();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('inserts and retrieves a decision', async () => {
    const d = makeDecision();
    await db.decisions.put(d);
    const got = await db.decisions.get(d.id);
    expect(got?.title).toBe('Use Dexie');
    expect(got?.derived_from.message_ids).toHaveLength(1);
  });

  it('queries decisions by [project_id+status] compound index', async () => {
    const projId = 'PROJ1AAAAAAAAAAAAAAAAAAAAAA';
    const d1 = makeDecision({ id: 'DEC1AAAAAAAAAAAAAAAAAAAAAA', project_id: projId, status: 'active' });
    const d2 = makeDecision({ id: 'DEC2AAAAAAAAAAAAAAAAAAAAAA', project_id: projId, status: 'superseded' });
    const d3 = makeDecision({ id: 'DEC3AAAAAAAAAAAAAAAAAAAAAA', project_id: 'OTHER', status: 'active' });
    await db.decisions.bulkPut([d1, d2, d3]);

    const active = await db.decisions
      .where('[project_id+status]')
      .equals([projId, 'active'])
      .toArray();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('DEC1AAAAAAAAAAAAAAAAAAAAAA');
  });
});

describe('LoreV2DB — CRUD: todos', () => {
  beforeEach(async () => {
    db = freshDb();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('inserts and retrieves a todo', async () => {
    const t = makeTodo();
    await db.todos.put(t);
    const got = await db.todos.get(t.id);
    expect(got?.status).toBe('open');
  });
});

describe('LoreV2DB — CRUD: blockers', () => {
  beforeEach(async () => {
    db = freshDb();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('inserts and retrieves a blocker', async () => {
    const b = makeBlocker();
    await db.blockers.put(b);
    const got = await db.blockers.get(b.id);
    expect(got?.severity).toBe('high');
  });
});

describe('LoreV2DB — CRUD: learnings', () => {
  beforeEach(async () => {
    db = freshDb();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('inserts and retrieves a learning with tags', async () => {
    const l = makeLearning();
    await db.learnings.put(l);
    const got = await db.learnings.get(l.id);
    expect(got?.tags).toEqual(['dexie', 'indexeddb']);
  });

  it('queries learnings by tag via multi-entry index', async () => {
    const l1 = makeLearning({ id: 'LEARN1AAAAAAAAAAAAAAAAAAAAAA', tags: ['dexie', 'indexeddb'] });
    const l2 = makeLearning({ id: 'LEARN2AAAAAAAAAAAAAAAAAAAAAA', tags: ['react'] });
    await db.learnings.bulkPut([l1, l2]);

    // Multi-entry index is defined with * prefix in store config but queried without *.
    const results = await db.learnings.where('tags').equals('dexie').toArray();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('LEARN1AAAAAAAAAAAAAAAAAAAAAA');
  });
});

describe('LoreV2DB — CRUD: projects', () => {
  beforeEach(async () => {
    db = freshDb();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('inserts and retrieves a project', async () => {
    const p = makeProject();
    await db.projects.put(p);
    const got = await db.projects.get(p.id);
    expect(got?.name).toBe('Lore');
    expect(got?.archived).toBe(false);
  });

  it('queries archived projects', async () => {
    const p1 = makeProject({ id: 'PROJ1AAAAAAAAAAAAAAAAAAAAAA', archived: false });
    const p2 = makeProject({ id: 'PROJ2AAAAAAAAAAAAAAAAAAAAAA', archived: true });
    await db.projects.bulkPut([p1, p2]);

    // Boolean indexing in Dexie/IndexedDB: use filter() for reliable boolean queries.
    const archived = await db.projects.filter((p) => p.archived === true).toArray();
    expect(archived).toHaveLength(1);
    expect(archived[0].id).toBe('PROJ2AAAAAAAAAAAAAAAAAAAAAA');
  });
});

describe('LoreV2DB — meta and migration_log', () => {
  beforeEach(async () => {
    db = freshDb();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('stores and retrieves meta key-value', async () => {
    await db.meta.put({ key: 'v1_archive', value: [{ id: 'x' }] });
    const got = await db.meta.get('v1_archive');
    expect(Array.isArray(got?.value)).toBe(true);
  });

  it('stores and retrieves migration_log entry', async () => {
    await db.migration_log.put({
      id: 'v1_migrated:log-001',
      from_version: 1,
      to_version: 2,
      at: NOW,
      success: true,
    });
    const got = await db.migration_log.get('v1_migrated:log-001');
    expect(got?.success).toBe(true);
  });
});

// Import Dexie for minKey/maxKey in compound queries.
import Dexie from 'dexie';
