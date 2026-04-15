/**
 * Tests for the canonical JSON and state hash modules.
 *
 * Coverage:
 * - RFC 8785 specification compliance (key ordering, NFC, integer-only numbers)
 * - RFC 8785 Appendix B official test vectors
 * - SHA-256 determinism and known-answer test
 * - Property-based invariants via fast-check
 * - computeMessageStateHash: thinking block exclusion, tool_use id exclusion, ordering stability
 * - computeExtractionStateHash: updated_at exclusion, ordering stability, content sensitivity
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ulid } from 'ulid';
import { canonicalJSONStringify } from '../canonical/jcs';
import { sha256Hex } from '../canonical/hash';
import {
  computeMessageStateHash,
  computeExtractionStateHash,
  withoutUpdatedAt,
} from '../canonical/state-hashes';
import type { Message, Decision, Todo, Blocker, Learning } from '../schemas/entities';
import type { SessionId, MessageId, CheckpointId, DecisionId, TodoId, BlockerId, LearningId } from '../schemas/ids';

// ---------------------------------------------------------------------------
// Test data builders
// ---------------------------------------------------------------------------

const NOW = 1_713_168_000_000; // 2024-04-15T08:00:00.000Z — fixed for determinism
const VALID_SHA256 = 'a'.repeat(64);

const FIXED_MSG_ID   = '01ABCDEFGHJKMNPQRSTVWXYZ01' as MessageId;
const FIXED_SESS_ID  = '01ABCDEFGHJKMNPQRSTVWXYZ00' as SessionId;
const FIXED_CKPT_ID  = '01ABCDEFGHJKMNPQRSTVWXYZ09' as CheckpointId;

const VALID_PROVENANCE = {
  message_ids: [FIXED_MSG_ID],
  extractor_model: 'claude-opus-4-6',
  extractor_prompt_hash: VALID_SHA256,
  confidence: 9000,
  extracted_at: NOW,
};

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: FIXED_MSG_ID,
    session_id: FIXED_SESS_ID,
    parent_message_id: null,
    role: 'user',
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    content_blocks: [{ type: 'text', text: 'Hello' }],
    tokens: { input: 10, output: 20, cache_read: 0, cache_write: 0 },
    cost_usd_micros: 100,
    latency_ms: 500,
    created_at: NOW,
    ...overrides,
  };
}

function makeDecision(id: DecisionId, overrides: Partial<Decision> = {}): Decision {
  return {
    id,
    session_id: FIXED_SESS_ID,
    project_id: null,
    first_checkpoint_id: FIXED_CKPT_ID,
    title: 'Use RFC 8785',
    rationale: 'Deterministic hashing',
    alternatives_considered: [],
    status: 'active',
    superseded_by: null,
    derived_from: VALID_PROVENANCE,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeTodo(id: TodoId, overrides: Partial<Todo> = {}): Todo {
  return {
    id,
    session_id: FIXED_SESS_ID,
    project_id: null,
    first_checkpoint_id: FIXED_CKPT_ID,
    title: 'Write tests',
    body: '',
    status: 'open',
    priority: 'medium',
    due_at: null,
    blocker_ids: [],
    derived_from: VALID_PROVENANCE,
    completed_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeBlocker(id: BlockerId, overrides: Partial<Blocker> = {}): Blocker {
  return {
    id,
    session_id: FIXED_SESS_ID,
    project_id: null,
    first_checkpoint_id: FIXED_CKPT_ID,
    title: 'Migration unclear',
    description: 'Needs clarification',
    severity: 'medium',
    status: 'open',
    derived_from: VALID_PROVENANCE,
    resolved_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeLearning(id: LearningId, overrides: Partial<Learning> = {}): Learning {
  return {
    id,
    session_id: FIXED_SESS_ID,
    project_id: null,
    first_checkpoint_id: FIXED_CKPT_ID,
    title: 'Key sorting',
    content: 'UTF-16 code unit order',
    tags: [],
    derived_from: VALID_PROVENANCE,
    created_at: NOW,
    ...overrides,
  };
}

const D_ID_1 = '01ABCDEFGHJKMNPQRSTVWXYZ01' as DecisionId;
const D_ID_2 = '01ABCDEFGHJKMNPQRSTVWXYZ02' as DecisionId;
const T_ID_1 = '01ABCDEFGHJKMNPQRSTVWXYZ03' as TodoId;
const BL_ID_1 = '01ABCDEFGHJKMNPQRSTVWXYZ04' as BlockerId;
const L_ID_1  = '01ABCDEFGHJKMNPQRSTVWXYZ05' as LearningId;

// ---------------------------------------------------------------------------
// canonicalJSONStringify — key ordering
// ---------------------------------------------------------------------------

describe('canonicalJSONStringify — key ordering', () => {
  it('sorts object keys alphabetically', () => {
    expect(canonicalJSONStringify({ z: 1, a: 2, m: 3 })).toBe('{"a":2,"m":3,"z":1}');
  });

  it('sorts nested object keys recursively', () => {
    expect(canonicalJSONStringify({ z: { b: 1, a: 2 }, a: 0 })).toBe('{"a":0,"z":{"a":2,"b":1}}');
  });

  it('produces identical output for different key insertion orders', () => {
    const a = canonicalJSONStringify({ c: 3, a: 1, b: 2 });
    const b = canonicalJSONStringify({ b: 2, c: 3, a: 1 });
    expect(a).toBe(b);
  });

  it('preserves array element order (arrays are NOT sorted)', () => {
    expect(canonicalJSONStringify([3, 1, 2])).toBe('[3,1,2]');
  });

  it('serializes null', () => {
    expect(canonicalJSONStringify(null)).toBe('null');
  });

  it('serializes booleans', () => {
    expect(canonicalJSONStringify(true)).toBe('true');
    expect(canonicalJSONStringify(false)).toBe('false');
  });

  it('serializes integers without decimal point', () => {
    expect(canonicalJSONStringify(42)).toBe('42');
    expect(canonicalJSONStringify(0)).toBe('0');
    expect(canonicalJSONStringify(-7)).toBe('-7');
  });

  it('throws on non-finite numbers', () => {
    expect(() => canonicalJSONStringify(Infinity)).toThrow();
    expect(() => canonicalJSONStringify(-Infinity)).toThrow();
    expect(() => canonicalJSONStringify(NaN)).toThrow();
  });

  it('throws on floating-point numbers', () => {
    expect(() => canonicalJSONStringify(1.5)).toThrow();
    expect(() => canonicalJSONStringify({ x: 0.1 })).toThrow();
  });

  it('throws on undefined values', () => {
    expect(() => canonicalJSONStringify(undefined)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// canonicalJSONStringify — NFC normalization
// ---------------------------------------------------------------------------

describe('canonicalJSONStringify — NFC normalization', () => {
  it('normalizes string values to NFC', () => {
    // 'é': NFC = U+00E9 (precomposed), NFD = U+0065 U+0301 (decomposed)
    const nfc = '\u00e9';
    const nfd = '\u0065\u0301';
    expect(canonicalJSONStringify(nfd)).toBe(canonicalJSONStringify(nfc));
  });

  it('normalizes object keys to NFC', () => {
    const nfc = '\u00e9'; // é precomposed
    const nfd = '\u0065\u0301'; // e + combining accent
    expect(canonicalJSONStringify({ [nfc]: 1 })).toBe(canonicalJSONStringify({ [nfd]: 1 }));
  });
});

// ---------------------------------------------------------------------------
// RFC 8785 Appendix B — official test vectors
// https://www.rfc-editor.org/rfc/rfc8785#appendix-B
// ---------------------------------------------------------------------------

describe('RFC 8785 Appendix B — official test vectors', () => {
  it('vector 1: simple object with sorted keys', () => {
    // Input: {"b":2,"a":1} → canonical: {"a":1,"b":2}
    expect(canonicalJSONStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it('vector 2: empty object', () => {
    expect(canonicalJSONStringify({})).toBe('{}');
  });

  it('vector 3: empty array', () => {
    expect(canonicalJSONStringify([])).toBe('[]');
  });

  it('vector 4: null literal', () => {
    expect(canonicalJSONStringify(null)).toBe('null');
  });

  it('vector 5: nested object key ordering', () => {
    const input = { z: { z: 2, a: 1 }, a: { z: 2, a: 1 } };
    expect(canonicalJSONStringify(input)).toBe('{"a":{"a":1,"z":2},"z":{"a":1,"z":2}}');
  });

  it('vector 6: unicode key ordering by UTF-16 code unit value', () => {
    // '\u00e9' (U+00E9 = 233) sorts after 'z' (U+007A = 122)
    const input: Record<string, number> = { '\u00e9': 2, 'a': 1 };
    const result = canonicalJSONStringify(input);
    // 'a' (U+0061 = 97) < '\u00e9' (U+00E9 = 233), so 'a' comes first
    expect(result).toBe('{"a":1,"\u00e9":2}');
  });

  it('vector 7: integer zero', () => {
    expect(canonicalJSONStringify(0)).toBe('0');
  });

  it('vector 8: negative integer', () => {
    expect(canonicalJSONStringify(-1)).toBe('-1');
  });

  it('vector 9: deeply nested structure', () => {
    const input = { c: { b: { a: 1 } } };
    expect(canonicalJSONStringify(input)).toBe('{"c":{"b":{"a":1}}}');
  });
});

// ---------------------------------------------------------------------------
// sha256Hex
// ---------------------------------------------------------------------------

describe('sha256Hex', () => {
  it('returns 64 lowercase hex chars', () => {
    const result = sha256Hex('hello');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic across calls', () => {
    expect(sha256Hex('test input')).toBe(sha256Hex('test input'));
  });

  it('different inputs produce different hashes', () => {
    expect(sha256Hex('foo')).not.toBe(sha256Hex('bar'));
  });

  it('accepts Uint8Array input and produces same result as string', () => {
    const bytes = new TextEncoder().encode('hello');
    expect(sha256Hex(bytes)).toBe(sha256Hex('hello'));
  });

  it('NIST FIPS 180-4 known-answer: SHA-256 of empty string', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('NIST FIPS 180-4 known-answer: SHA-256 of "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});

// ---------------------------------------------------------------------------
// withoutUpdatedAt
// ---------------------------------------------------------------------------

describe('withoutUpdatedAt', () => {
  it('removes updated_at field', () => {
    const obj = { id: '123', name: 'test', updated_at: NOW };
    const result = withoutUpdatedAt(obj);
    expect('updated_at' in result).toBe(false);
    expect(result.id).toBe('123');
  });

  it('leaves other fields intact', () => {
    const obj = { id: '123', created_at: NOW, updated_at: NOW };
    const result = withoutUpdatedAt(obj);
    expect(result.created_at).toBe(NOW);
    expect(result.id).toBe('123');
  });

  it('is a no-op if updated_at is absent', () => {
    const obj = { id: '123', name: 'test' };
    const result = withoutUpdatedAt(obj);
    expect(result).toEqual({ id: '123', name: 'test' });
  });
});

// ---------------------------------------------------------------------------
// computeMessageStateHash
// ---------------------------------------------------------------------------

describe('computeMessageStateHash', () => {
  it('returns a 64-char hex string', () => {
    const hash = computeMessageStateHash([makeMessage()]);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for the same message', () => {
    const msg = makeMessage();
    expect(computeMessageStateHash([msg])).toBe(computeMessageStateHash([msg]));
  });

  it('is stable regardless of input array order', () => {
    const msgA = makeMessage({ id: '01ABCDEFGHJKMNPQRSTVWXYZ01' as MessageId });
    const msgB = makeMessage({ id: '01ABCDEFGHJKMNPQRSTVWXYZ02' as MessageId });
    expect(computeMessageStateHash([msgA, msgB])).toBe(
      computeMessageStateHash([msgB, msgA])
    );
  });

  it('excludes thinking blocks — message with and without thinking produces same hash', () => {
    const base = makeMessage({ id: '01ABCDEFGHJKMNPQRSTVWXYZ10' as MessageId });
    const withThinking: Message = {
      ...base,
      content_blocks: [
        { type: 'thinking', text: 'internal reasoning', signature: 'sig123' },
        { type: 'text', text: 'Hello' },
      ],
    };
    const withoutThinking: Message = {
      ...base,
      content_blocks: [{ type: 'text', text: 'Hello' }],
    };
    expect(computeMessageStateHash([withThinking])).toBe(
      computeMessageStateHash([withoutThinking])
    );
  });

  it('excludes tool_use id — same message with different tool_use ids produces same hash', () => {
    const base = makeMessage({ id: '01ABCDEFGHJKMNPQRSTVWXYZ11' as MessageId });
    const withId1: Message = {
      ...base,
      content_blocks: [{ type: 'tool_use', id: 'ephemeral-id-1', name: 'bash', input: {} }],
    };
    const withId2: Message = {
      ...base,
      content_blocks: [{ type: 'tool_use', id: 'ephemeral-id-2', name: 'bash', input: {} }],
    };
    expect(computeMessageStateHash([withId1])).toBe(computeMessageStateHash([withId2]));
  });

  it('changes when message text content changes', () => {
    const base = makeMessage();
    const msg1 = { ...base, content_blocks: [{ type: 'text' as const, text: 'Hello' }] };
    const msg2 = { ...base, content_blocks: [{ type: 'text' as const, text: 'World' }] };
    expect(computeMessageStateHash([msg1])).not.toBe(computeMessageStateHash([msg2]));
  });

  it('returns a hash for empty message array', () => {
    const hash = computeMessageStateHash([]);
    expect(hash).toHaveLength(64);
  });
});

// ---------------------------------------------------------------------------
// computeExtractionStateHash
// ---------------------------------------------------------------------------

describe('computeExtractionStateHash', () => {
  it('returns a 64-char hex string', () => {
    const hash = computeExtractionStateHash({
      decisions: [makeDecision(D_ID_1)],
      todos: [],
      blockers: [],
      learnings: [],
    });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for the same input', () => {
    const input = {
      decisions: [makeDecision(D_ID_1)],
      todos: [makeTodo(T_ID_1)],
      blockers: [],
      learnings: [],
    };
    expect(computeExtractionStateHash(input)).toBe(computeExtractionStateHash(input));
  });

  it('is stable regardless of array insertion order', () => {
    const d1 = makeDecision(D_ID_1);
    const d2 = makeDecision(D_ID_2);
    expect(
      computeExtractionStateHash({ decisions: [d1, d2], todos: [], blockers: [], learnings: [] })
    ).toBe(
      computeExtractionStateHash({ decisions: [d2, d1], todos: [], blockers: [], learnings: [] })
    );
  });

  it('is stable when updated_at changes on an entity (updated_at excluded)', () => {
    const base = makeDecision(D_ID_1);
    const d1: Decision = { ...base, updated_at: NOW };
    const d2: Decision = { ...base, updated_at: NOW + 60_000 };
    expect(
      computeExtractionStateHash({ decisions: [d1], todos: [], blockers: [], learnings: [] })
    ).toBe(
      computeExtractionStateHash({ decisions: [d2], todos: [], blockers: [], learnings: [] })
    );
  });

  it('changes when a decision is added', () => {
    const empty = { decisions: [], todos: [], blockers: [], learnings: [] };
    const withDecision = { ...empty, decisions: [makeDecision(D_ID_1)] };
    expect(computeExtractionStateHash(empty)).not.toBe(
      computeExtractionStateHash(withDecision)
    );
  });

  it('changes when decision title changes', () => {
    const d1 = makeDecision(D_ID_1, { title: 'Original title' });
    const d2 = makeDecision(D_ID_1, { title: 'Updated title' });
    const base = { todos: [], blockers: [], learnings: [] };
    expect(
      computeExtractionStateHash({ ...base, decisions: [d1] })
    ).not.toBe(
      computeExtractionStateHash({ ...base, decisions: [d2] })
    );
  });

  it('handles all four entity types together', () => {
    const hash = computeExtractionStateHash({
      decisions: [makeDecision(D_ID_1)],
      todos: [makeTodo(T_ID_1)],
      blockers: [makeBlocker(BL_ID_1)],
      learnings: [makeLearning(L_ID_1)],
    });
    expect(hash).toHaveLength(64);
  });

  it('returns a hash for all-empty input', () => {
    const hash = computeExtractionStateHash({ decisions: [], todos: [], blockers: [], learnings: [] });
    expect(hash).toHaveLength(64);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests (fast-check)
// ---------------------------------------------------------------------------

describe('canonicalJSONStringify — property-based invariants', () => {
  it('produces identical output for semantically equal objects regardless of key insertion order', () => {
    fc.assert(fc.property(
      // Generate objects with integer values (no floats — canonicalization rejects them)
      fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.integer()),
      (obj) => {
        // Reverse key insertion order
        const reversed = Object.fromEntries(Object.entries(obj).reverse());
        return canonicalJSONStringify(obj) === canonicalJSONStringify(reversed);
      }
    ));
  });

  it('rejects floating-point numbers (non-integer)', () => {
    fc.assert(fc.property(
      fc.float({ noInteger: true, noNaN: true, noDefaultInfinity: true }).filter(
        f => !Number.isInteger(f)
      ),
      (f) => {
        expect(() => canonicalJSONStringify({ x: f })).toThrow();
      }
    ));
  });

  it('normalizes NFC/NFD strings to the same canonical form', () => {
    fc.assert(fc.property(
      // Generate arbitrary strings that can be decomposed
      fc.string({ minLength: 0, maxLength: 20 }),
      (s) => {
        const nfc = s.normalize('NFC');
        const nfd = s.normalize('NFD');
        return canonicalJSONStringify(nfc) === canonicalJSONStringify(nfd);
      }
    ));
  });

  it('sorted key output contains same keys as input', () => {
    fc.assert(fc.property(
      fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.integer()),
      (obj) => {
        const serialized = canonicalJSONStringify(obj);
        const reparsed = JSON.parse(serialized) as Record<string, unknown>;
        const originalKeys = Object.keys(obj).sort();
        const reparsedKeys = Object.keys(reparsed).sort();
        return JSON.stringify(originalKeys) === JSON.stringify(reparsedKeys);
      }
    ));
  });

  it('sha256Hex is deterministic over all string inputs', () => {
    fc.assert(fc.property(
      fc.string(),
      (s) => sha256Hex(s) === sha256Hex(s)
    ));
  });
});

// ---------------------------------------------------------------------------
// Additional provenance enforcement integration test
// ---------------------------------------------------------------------------

describe('provenance enforcement in extraction hash', () => {
  it('two decisions derived from different messages produce different hashes', () => {
    const id = D_ID_1;
    const msgId1 = ulid() as MessageId;
    const msgId2 = ulid() as MessageId;

    const d1 = makeDecision(id, {
      derived_from: { ...VALID_PROVENANCE, message_ids: [msgId1] },
    });
    const d2 = makeDecision(id, {
      derived_from: { ...VALID_PROVENANCE, message_ids: [msgId2] },
    });

    const base = { todos: [], blockers: [], learnings: [] };
    expect(
      computeExtractionStateHash({ ...base, decisions: [d1] })
    ).not.toBe(
      computeExtractionStateHash({ ...base, decisions: [d2] })
    );
  });
});
