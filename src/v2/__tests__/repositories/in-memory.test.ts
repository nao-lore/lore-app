/**
 * Tests for in-memory repository implementations.
 *
 * Validates that the in-memory implementations correctly implement the
 * repository interfaces — particularly the provenance invariant on Decision.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemorySessionRepository,
  InMemoryMessageRepository,
  InMemoryDecisionRepository,
  InMemoryLearningRepository,
} from '../../repositories/in-memory';
import type { Session, Message, Decision, Learning } from '../../schemas/entities';
import type { SessionId, MessageId, ProjectId, DecisionId, LearningId } from '../../schemas/ids';

const NOW = 1_713_168_000_000;
const PLACEHOLDER_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function makeSession(id: string, projectId?: string): Session {
  return {
    id: id as SessionId,
    project_id: (projectId ?? null) as SessionId | null,
    title: 'Test',
    started_at: NOW,
    ended_at: null,
    primary_provider: 'anthropic',
    source: 'paste',
    schema_version: 2,
    created_at: NOW,
  };
}

function makeMessage(id: string, sessionId: string): Message {
  return {
    id: id as MessageId,
    session_id: sessionId as SessionId,
    parent_message_id: null,
    role: 'user',
    provider: null,
    model: null,
    content_blocks: [{ type: 'text', text: 'hello' }],
    tokens: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    cost_usd_micros: 0,
    latency_ms: 0,
    created_at: NOW,
  };
}

function makeDecision(id: string, projectId: string | null, messageIds: string[]): Decision {
  return {
    id: id as DecisionId,
    session_id: 'SESSION0000000000000000001' as SessionId,
    project_id: projectId as ProjectId | null,
    first_checkpoint_id: 'CHECKPT0000000000000000001' as never,
    title: 'Test decision',
    rationale: '',
    alternatives_considered: [],
    status: 'active',
    superseded_by: null,
    derived_from: {
      message_ids: messageIds,
      extractor_model: 'test',
      extractor_prompt_hash: PLACEHOLDER_HASH,
      confidence: 0.9,
      extracted_at: NOW,
    },
    created_at: NOW,
    updated_at: NOW,
  };
}

function makeLearning(id: string, tags: string[]): Learning {
  return {
    id: id as LearningId,
    session_id: 'SESSION0000000000000000001' as SessionId,
    project_id: null,
    first_checkpoint_id: 'CHECKPT0000000000000000001' as never,
    title: 'Test learning',
    content: 'content',
    tags,
    derived_from: {
      message_ids: ['MSG00000000000000000000001'],
      extractor_model: 'test',
      extractor_prompt_hash: PLACEHOLDER_HASH,
      confidence: 0.9,
      extracted_at: NOW,
    },
    created_at: NOW,
  };
}

// ---- SessionRepository ----

describe('InMemorySessionRepository', () => {
  let repo: InMemorySessionRepository;
  beforeEach(() => { repo = new InMemorySessionRepository(); });

  it('findById returns SESSION_NOT_FOUND for missing id', async () => {
    const r = await repo.findById('NOTFOUND0000000000000000001' as SessionId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('SESSION_NOT_FOUND');
  });

  it('save and findById roundtrip', async () => {
    const s = makeSession('SESSION0000000000000000001');
    await repo.save(s);
    const r = await repo.findById('SESSION0000000000000000001' as SessionId);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.title).toBe('Test');
  });

  it('listByProject returns only sessions for that project', async () => {
    await repo.save(makeSession('SESSION0000000000000000001', 'PROJ1'));
    await repo.save(makeSession('SESSION0000000000000000002', 'PROJ1'));
    await repo.save(makeSession('SESSION0000000000000000003', 'PROJ2'));
    const list = await repo.listByProject('PROJ1' as ProjectId);
    expect(list.length).toBe(2);
  });

  it('saveMany persists all sessions', async () => {
    const sessions = [
      makeSession('SESSION0000000000000000001'),
      makeSession('SESSION0000000000000000002'),
    ];
    await repo.saveMany(sessions);
    expect(repo.all().length).toBe(2);
  });
});

// ---- MessageRepository ----

describe('InMemoryMessageRepository', () => {
  let repo: InMemoryMessageRepository;
  beforeEach(() => { repo = new InMemoryMessageRepository(); });

  it('listBySession returns messages in created_at order', async () => {
    const m1 = makeMessage('MSG00000000000000000000001', 'SESS');
    const m2 = { ...makeMessage('MSG00000000000000000000002', 'SESS'), created_at: NOW + 1 };
    await repo.saveMany([m2, m1]); // insert out of order
    const list = await repo.listBySession('SESS' as SessionId);
    expect(list[0].id).toBe('MSG00000000000000000000001');
    expect(list[1].id).toBe('MSG00000000000000000000002');
  });
});

// ---- DecisionRepository (provenance invariant) ----

describe('InMemoryDecisionRepository — provenance invariant', () => {
  let repo: InMemoryDecisionRepository;
  beforeEach(() => { repo = new InMemoryDecisionRepository(); });

  it('save rejects decision with empty message_ids', async () => {
    const d = makeDecision('DEC00000000000000000000001', null, []);
    const r = await repo.save(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('PROVENANCE_INVALID');
  });

  it('save accepts decision with one message_id', async () => {
    const d = makeDecision('DEC00000000000000000000001', null, ['MSG00000000000000000000001']);
    const r = await repo.save(d);
    expect(r.ok).toBe(true);
  });

  it('saveMany rejects batch if any decision has empty message_ids', async () => {
    const good = makeDecision('DEC00000000000000000000001', null, ['MSG00000000000000000000001']);
    const bad  = makeDecision('DEC00000000000000000000002', null, []);
    const r = await repo.saveMany([good, bad]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('PROVENANCE_INVALID');
  });

  it('listByProject with status filter returns correct subset', async () => {
    const active = makeDecision('DEC00000000000000000000001', 'PROJ1', ['MSG1']);
    const superseded = {
      ...makeDecision('DEC00000000000000000000002', 'PROJ1', ['MSG1']),
      status: 'superseded' as const,
    };
    await repo.saveMany([active, superseded]);
    const list = await repo.listByProject('PROJ1' as ProjectId, 'active');
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('DEC00000000000000000000001');
  });
});

// ---- LearningRepository (tag index) ----

describe('InMemoryLearningRepository', () => {
  let repo: InMemoryLearningRepository;
  beforeEach(() => { repo = new InMemoryLearningRepository(); });

  it('listByTag returns only learnings with that tag', async () => {
    await repo.save(makeLearning('LEARN000000000000000000001', ['dexie', 'indexeddb']));
    await repo.save(makeLearning('LEARN000000000000000000002', ['react']));
    const results = await repo.listByTag('dexie');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('LEARN000000000000000000001');
  });
});
