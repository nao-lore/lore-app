import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';
import {
  ULID,
  SHA256Hex,
  EpochMs,
  ISO8601UTC,
  UsdMicros,
} from '../schemas/primitives';
import {
  Provenance,
  Session,
  Message,
  Checkpoint,
  Decision,
  Todo,
  Blocker,
  Learning,
  Project,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  ContentBlock,
} from '../schemas/entities';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const NOW = Date.now();
const VALID_ULID = ulid();
const VALID_ULID_2 = ulid();
const VALID_SHA256 = 'a'.repeat(64);
const VALID_PROVENANCE = {
  message_ids: [VALID_ULID],
  extractor_model: 'claude-3-5-sonnet',
  extractor_prompt_hash: VALID_SHA256,
  confidence: 9500,
  extracted_at: NOW,
};

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

describe('ULID primitive', () => {
  it('accepts a valid ULID', () => {
    expect(ULID.safeParse(ulid()).success).toBe(true);
  });

  it('rejects wrong length string', () => {
    expect(ULID.safeParse('tooshort').success).toBe(false);
  });

  it('rejects lowercase ULID characters', () => {
    // lowercase letters not in Crockford base32
    expect(ULID.safeParse('a'.repeat(26)).success).toBe(false);
  });

  it('rejects non-string', () => {
    expect(ULID.safeParse(12345).success).toBe(false);
  });
});

describe('SHA256Hex primitive', () => {
  it('accepts 64 lowercase hex chars', () => {
    expect(SHA256Hex.safeParse('a'.repeat(64)).success).toBe(true);
  });

  it('rejects uppercase hex', () => {
    expect(SHA256Hex.safeParse('A'.repeat(64)).success).toBe(false);
  });

  it('rejects 63-char string', () => {
    expect(SHA256Hex.safeParse('a'.repeat(63)).success).toBe(false);
  });
});

describe('EpochMs primitive', () => {
  it('accepts positive integer', () => {
    expect(EpochMs.safeParse(NOW).success).toBe(true);
  });

  it('rejects zero', () => {
    expect(EpochMs.safeParse(0).success).toBe(false);
  });

  it('rejects float', () => {
    expect(EpochMs.safeParse(1234567890.5).success).toBe(false);
  });

  it('rejects negative', () => {
    expect(EpochMs.safeParse(-1).success).toBe(false);
  });
});

describe('ISO8601UTC primitive', () => {
  it('accepts valid UTC datetime', () => {
    expect(ISO8601UTC.safeParse('2026-04-15T10:00:00.000Z').success).toBe(true);
  });

  it('rejects offset datetime', () => {
    expect(ISO8601UTC.safeParse('2026-04-15T10:00:00+09:00').success).toBe(false);
  });

  it('rejects plain date string', () => {
    expect(ISO8601UTC.safeParse('2026-04-15').success).toBe(false);
  });
});

describe('UsdMicros primitive', () => {
  it('accepts zero', () => {
    expect(UsdMicros.safeParse(0).success).toBe(true);
  });

  it('accepts positive integer', () => {
    expect(UsdMicros.safeParse(1_000_000).success).toBe(true);
  });

  it('rejects negative', () => {
    expect(UsdMicros.safeParse(-1).success).toBe(false);
  });

  it('rejects float', () => {
    expect(UsdMicros.safeParse(0.5).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Content blocks
// ---------------------------------------------------------------------------

describe('ContentBlock discriminated union', () => {
  it('accepts TextBlock', () => {
    expect(ContentBlock.safeParse({ type: 'text', text: 'hello' }).success).toBe(true);
  });

  it('accepts ToolUseBlock', () => {
    expect(ContentBlock.safeParse({
      type: 'tool_use',
      id: 'tool_abc',
      name: 'bash',
      input: { cmd: 'ls' },
    }).success).toBe(true);
  });

  it('accepts ToolResultBlock with default is_error=false', () => {
    const result = ToolResultBlock.safeParse({
      type: 'tool_result',
      tool_use_id: 'tool_abc',
      content: 'result text',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.is_error).toBe(false);
  });

  it('accepts ThinkingBlock without signature', () => {
    expect(ContentBlock.safeParse({
      type: 'thinking',
      text: 'I am thinking...',
    }).success).toBe(true);
  });

  it('rejects unknown block type', () => {
    expect(ContentBlock.safeParse({ type: 'unknown_type', text: 'x' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

describe('Provenance', () => {
  it('accepts valid provenance', () => {
    expect(Provenance.safeParse(VALID_PROVENANCE).success).toBe(true);
  });

  it('rejects empty message_ids array', () => {
    expect(Provenance.safeParse({
      ...VALID_PROVENANCE,
      message_ids: [],
    }).success).toBe(false);
  });

  it('rejects confidence > 10000', () => {
    expect(Provenance.safeParse({
      ...VALID_PROVENANCE,
      confidence: 10001,
    }).success).toBe(false);
  });

  it('rejects non-integer confidence', () => {
    expect(Provenance.safeParse({
      ...VALID_PROVENANCE,
      confidence: 9500.5,
    }).success).toBe(false);
  });

  it('rejects confidence < 0', () => {
    expect(Provenance.safeParse({
      ...VALID_PROVENANCE,
      confidence: -1,
    }).success).toBe(false);
  });

  it('rejects empty extractor_model', () => {
    expect(Provenance.safeParse({
      ...VALID_PROVENANCE,
      extractor_model: '',
    }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

describe('Session', () => {
  const VALID_SESSION = {
    id: VALID_ULID,
    project_id: null,
    title: 'My session',
    started_at: NOW,
    ended_at: null,
    primary_provider: 'anthropic',
    source: 'paste',
    schema_version: 2 as const,
    created_at: NOW,
  };

  it('accepts valid session', () => {
    expect(Session.safeParse(VALID_SESSION).success).toBe(true);
  });

  it('rejects schema_version !== 2', () => {
    expect(Session.safeParse({ ...VALID_SESSION, schema_version: 1 }).success).toBe(false);
  });

  it('rejects unknown provider', () => {
    expect(Session.safeParse({ ...VALID_SESSION, primary_provider: 'mistral' }).success).toBe(false);
  });

  it('rejects title > 500 chars', () => {
    expect(Session.safeParse({ ...VALID_SESSION, title: 'a'.repeat(501) }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

describe('Message', () => {
  const VALID_MESSAGE = {
    id: VALID_ULID,
    session_id: VALID_ULID,
    parent_message_id: null,
    role: 'user',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet',
    content_blocks: [{ type: 'text', text: 'Hello' }],
    tokens: { input: 10, output: 20, cache_read: 0, cache_write: 0 },
    cost_usd_micros: 500,
    latency_ms: 1200,
    created_at: NOW,
  };

  it('accepts valid message', () => {
    expect(Message.safeParse(VALID_MESSAGE).success).toBe(true);
  });

  it('rejects empty content_blocks', () => {
    expect(Message.safeParse({ ...VALID_MESSAGE, content_blocks: [] }).success).toBe(false);
  });

  it('rejects unknown role', () => {
    expect(Message.safeParse({ ...VALID_MESSAGE, role: 'bot' }).success).toBe(false);
  });

  it('rejects negative tokens', () => {
    expect(Message.safeParse({
      ...VALID_MESSAGE,
      tokens: { ...VALID_MESSAGE.tokens, input: -1 },
    }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Decision (provenance enforced)
// ---------------------------------------------------------------------------

describe('Decision', () => {
  const VALID_DECISION = {
    id: VALID_ULID,
    session_id: VALID_ULID,
    project_id: null,
    first_checkpoint_id: VALID_ULID,
    title: 'Use RFC 8785',
    rationale: 'Deterministic hashing requires canonical JSON',
    derived_from: VALID_PROVENANCE,
    created_at: NOW,
    updated_at: NOW,
  };

  it('accepts valid decision', () => {
    expect(Decision.safeParse(VALID_DECISION).success).toBe(true);
  });

  it('rejects missing derived_from', () => {
    const { derived_from: _removed, ...rest } = VALID_DECISION;
    expect(Decision.safeParse(rest).success).toBe(false);
  });

  it('rejects empty title', () => {
    expect(Decision.safeParse({ ...VALID_DECISION, title: '' }).success).toBe(false);
  });

  it('rejects title > 500 chars', () => {
    expect(Decision.safeParse({ ...VALID_DECISION, title: 'a'.repeat(501) }).success).toBe(false);
  });

  it('defaults status to active', () => {
    const result = Decision.safeParse(VALID_DECISION);
    expect(result.success && result.data.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// Todo (provenance enforced)
// ---------------------------------------------------------------------------

describe('Todo', () => {
  const VALID_TODO = {
    id: VALID_ULID,
    session_id: VALID_ULID,
    project_id: null,
    first_checkpoint_id: VALID_ULID,
    title: 'Write tests',
    derived_from: VALID_PROVENANCE,
    created_at: NOW,
    updated_at: NOW,
  };

  it('accepts valid todo', () => {
    expect(Todo.safeParse(VALID_TODO).success).toBe(true);
  });

  it('rejects empty title', () => {
    expect(Todo.safeParse({ ...VALID_TODO, title: '' }).success).toBe(false);
  });

  it('rejects missing derived_from (provenance enforced)', () => {
    const { derived_from: _removed, ...rest } = VALID_TODO;
    expect(Todo.safeParse(rest).success).toBe(false);
  });

  it('rejects derived_from with empty message_ids', () => {
    expect(Todo.safeParse({
      ...VALID_TODO,
      derived_from: { ...VALID_PROVENANCE, message_ids: [] },
    }).success).toBe(false);
  });

  it('defaults status to open', () => {
    const result = Todo.safeParse(VALID_TODO);
    expect(result.success && result.data.status).toBe('open');
  });
});

// ---------------------------------------------------------------------------
// Blocker (provenance enforced)
// ---------------------------------------------------------------------------

describe('Blocker', () => {
  const VALID_BLOCKER = {
    id: VALID_ULID,
    session_id: VALID_ULID,
    project_id: null,
    first_checkpoint_id: VALID_ULID,
    title: 'DB migration unclear',
    description: 'v1 schema differs from v2 in 3 places',
    derived_from: VALID_PROVENANCE,
    created_at: NOW,
    updated_at: NOW,
  };

  it('accepts valid blocker', () => {
    expect(Blocker.safeParse(VALID_BLOCKER).success).toBe(true);
  });

  it('rejects empty title', () => {
    expect(Blocker.safeParse({ ...VALID_BLOCKER, title: '' }).success).toBe(false);
  });

  it('rejects missing derived_from', () => {
    const { derived_from: _removed, ...rest } = VALID_BLOCKER;
    expect(Blocker.safeParse(rest).success).toBe(false);
  });

  it('rejects invalid severity', () => {
    expect(Blocker.safeParse({ ...VALID_BLOCKER, severity: 'extreme' }).success).toBe(false);
  });

  it('defaults severity to medium', () => {
    const result = Blocker.safeParse(VALID_BLOCKER);
    expect(result.success && result.data.severity).toBe('medium');
  });
});

// ---------------------------------------------------------------------------
// Learning (provenance enforced)
// ---------------------------------------------------------------------------

describe('Learning', () => {
  const VALID_LEARNING = {
    id: VALID_ULID,
    session_id: VALID_ULID,
    project_id: null,
    first_checkpoint_id: VALID_ULID,
    title: 'RFC 8785 key sorting',
    content: 'Keys must be sorted by UTF-16 code unit order',
    derived_from: VALID_PROVENANCE,
    created_at: NOW,
  };

  it('accepts valid learning', () => {
    expect(Learning.safeParse(VALID_LEARNING).success).toBe(true);
  });

  it('rejects missing derived_from', () => {
    const { derived_from: _removed, ...rest } = VALID_LEARNING;
    expect(Learning.safeParse(rest).success).toBe(false);
  });

  it('rejects derived_from with empty message_ids', () => {
    expect(Learning.safeParse({
      ...VALID_LEARNING,
      derived_from: { ...VALID_PROVENANCE, message_ids: [] },
    }).success).toBe(false);
  });

  it('rejects tag > 50 chars', () => {
    expect(Learning.safeParse({
      ...VALID_LEARNING,
      tags: ['a'.repeat(51)],
    }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

describe('Project', () => {
  const VALID_PROJECT = {
    id: VALID_ULID,
    name: 'Lore v2',
    created_at: NOW,
    updated_at: NOW,
  };

  it('accepts valid project', () => {
    expect(Project.safeParse(VALID_PROJECT).success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(Project.safeParse({ ...VALID_PROJECT, name: '' }).success).toBe(false);
  });

  it('rejects invalid color format', () => {
    expect(Project.safeParse({ ...VALID_PROJECT, color: 'red' }).success).toBe(false);
  });

  it('accepts valid hex color', () => {
    expect(Project.safeParse({ ...VALID_PROJECT, color: '#ff0000' }).success).toBe(true);
  });

  it('defaults archived to false', () => {
    const result = Project.safeParse(VALID_PROJECT);
    expect(result.success && result.data.archived).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Checkpoint
// ---------------------------------------------------------------------------

describe('Checkpoint', () => {
  const VALID_CHECKPOINT = {
    id: VALID_ULID,
    session_id: VALID_ULID,
    parent_checkpoint_id: null,
    message_state_hash: VALID_SHA256,
    extraction_state_hash: VALID_SHA256,
    label: null,
    auto: true,
    summary: 'Auto checkpoint at message 10',
    message_count: 10,
    created_at: NOW,
    created_by: 'auto_interval',
  };

  it('accepts valid checkpoint', () => {
    expect(Checkpoint.safeParse(VALID_CHECKPOINT).success).toBe(true);
  });

  it('rejects invalid message_state_hash (non-hex)', () => {
    expect(Checkpoint.safeParse({
      ...VALID_CHECKPOINT,
      message_state_hash: 'z'.repeat(64),
    }).success).toBe(false);
  });

  it('rejects unknown created_by value', () => {
    expect(Checkpoint.safeParse({
      ...VALID_CHECKPOINT,
      created_by: 'unknown_trigger',
    }).success).toBe(false);
  });

  it('rejects label > 200 chars', () => {
    expect(Checkpoint.safeParse({
      ...VALID_CHECKPOINT,
      label: 'a'.repeat(201),
    }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cross-entity: multiple message_ids in provenance
// ---------------------------------------------------------------------------

describe('Provenance with multiple message_ids', () => {
  it('accepts provenance with two message_ids', () => {
    expect(Provenance.safeParse({
      ...VALID_PROVENANCE,
      message_ids: [VALID_ULID, VALID_ULID_2],
    }).success).toBe(true);
  });
});
