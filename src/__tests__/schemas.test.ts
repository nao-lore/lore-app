/**
 * schemas.test.ts — Unit tests for Zod schemas
 */
import { describe, it, expect } from 'vitest';
import { WorklogResultSchema, HandoffResultSchema, TodoOnlyResultSchema, safeParse } from '../schemas';

describe('WorklogResultSchema', () => {
  it('parses valid input', () => {
    const input = {
      title: 'My Work',
      today: ['Did something'],
      decisions: ['Decided X'],
      todo: ['Do Y'],
      relatedProjects: ['Proj A'],
      tags: ['react'],
    };
    const result = WorklogResultSchema.parse(input);
    expect(result.title).toBe('My Work');
    expect(result.today).toEqual(['Did something']);
  });

  it('applies defaults for missing fields', () => {
    const result = WorklogResultSchema.parse({});
    expect(result.title).toBe('Untitled');
    expect(result.today).toEqual([]);
    expect(result.decisions).toEqual([]);
    expect(result.todo).toEqual([]);
    expect(result.relatedProjects).toEqual([]);
    expect(result.tags).toEqual([]);
  });

  it('rejects malformed input (non-object)', () => {
    expect(() => WorklogResultSchema.parse('not an object')).toThrow();
  });

  it('coerces partial input with defaults', () => {
    const result = WorklogResultSchema.parse({ title: 'Partial' });
    expect(result.title).toBe('Partial');
    expect(result.tags).toEqual([]);
  });
});

describe('HandoffResultSchema', () => {
  it('parses valid structured input', () => {
    const input = {
      title: 'Handoff',
      currentStatus: ['WIP'],
      nextActions: [{ action: 'Deploy to staging', whyImportant: 'Blocks QA', priorityReason: 'First step', dueBy: null, dependsOn: null }],
      completed: ['Setup'],
      blockers: [],
      decisions: [{ decision: 'Use PostgreSQL', rationale: 'Better for our scale' }],
      constraints: [],
      tags: ['deploy'],
    };
    const result = HandoffResultSchema.parse(input);
    expect(result.title).toBe('Handoff');
    expect(result.currentStatus).toEqual(['WIP']);
    expect(result.nextActions).toHaveLength(1);
    expect(result.nextActions[0].action).toBe('Deploy to staging');
    expect(result.nextActions[0].whyImportant).toBe('Blocks QA');
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].decision).toBe('Use PostgreSQL');
    expect(result.decisions[0].rationale).toBe('Better for our scale');
  });

  it('applies nested defaults for handoffMeta', () => {
    const result = HandoffResultSchema.parse({});
    // Zod default({}) creates an empty object; the nullable fields are only set when explicitly provided
    expect(result.handoffMeta).toBeDefined();
    expect(typeof result.handoffMeta).toBe('object');
  });

  it('defaults resumeChecklist to empty array', () => {
    const result = HandoffResultSchema.parse({});
    expect(result.resumeChecklist).toEqual([]);
  });

  it('parses resumeChecklist with objects', () => {
    const input = {
      resumeChecklist: [
        { action: 'Check tests', whyNow: 'Important', ifSkipped: 'Bugs' },
      ],
    };
    const result = HandoffResultSchema.parse(input);
    expect(result.resumeChecklist).toHaveLength(1);
    expect(result.resumeChecklist[0].action).toBe('Check tests');
  });

  it('defaults nextActions to empty array', () => {
    const result = HandoffResultSchema.parse({});
    expect(result.nextActions).toEqual([]);
  });

  it('defaults actionBacklog to empty array', () => {
    const result = HandoffResultSchema.parse({});
    expect(result.actionBacklog).toEqual([]);
  });

  it('defaults decisions to empty array', () => {
    const result = HandoffResultSchema.parse({});
    expect(result.decisions).toEqual([]);
  });

  it('applies defaults to partial nextAction objects', () => {
    const input = {
      nextActions: [{ action: 'Fix bug' }],
    };
    const result = HandoffResultSchema.parse(input);
    expect(result.nextActions[0]).toEqual({
      action: 'Fix bug',
      whyImportant: 'Priority not stated',
      priorityReason: null,
      dueBy: null,
      dependsOn: null,
    });
  });

  it('applies defaults to partial decision objects', () => {
    const input = {
      decisions: [{ decision: 'Use React' }],
    };
    const result = HandoffResultSchema.parse(input);
    expect(result.decisions[0]).toEqual({
      decision: 'Use React',
      rationale: null,
    });
  });

  it('parses actionBacklog with full structure', () => {
    const input = {
      actionBacklog: [{
        action: 'Add tests',
        whyImportant: 'Coverage gap',
        priorityReason: 'Before release',
        dueBy: '2026-04-01',
        dependsOn: ['Fix bug'],
      }],
    };
    const result = HandoffResultSchema.parse(input);
    expect(result.actionBacklog).toHaveLength(1);
    expect(result.actionBacklog[0].action).toBe('Add tests');
    expect(result.actionBacklog[0].dependsOn).toEqual(['Fix bug']);
  });
});

describe('TodoOnlyResultSchema', () => {
  it('parses valid todos', () => {
    const input = {
      todos: [
        { title: 'Task 1', priority: 'high' },
        { title: 'Task 2', priority: 'low', dueDate: '2026-03-20' },
      ],
    };
    const result = TodoOnlyResultSchema.parse(input);
    expect(result.todos).toHaveLength(2);
    expect(result.todos[0].priority).toBe('high');
    expect(result.todos[1].dueDate).toBe('2026-03-20');
  });

  it('defaults priority to medium', () => {
    const input = { todos: [{ title: 'Task' }] };
    const result = TodoOnlyResultSchema.parse(input);
    expect(result.todos[0].priority).toBe('medium');
  });

  it('rejects invalid priority values', () => {
    const input = { todos: [{ title: 'Task', priority: 'critical' }] };
    expect(() => TodoOnlyResultSchema.parse(input)).toThrow();
  });

  it('defaults todos to empty array', () => {
    const result = TodoOnlyResultSchema.parse({});
    expect(result.todos).toEqual([]);
  });
});

describe('safeParse', () => {
  it('returns parsed data for valid input', () => {
    const input = { title: 'Valid', today: ['a'], decisions: [], todo: [], relatedProjects: [], tags: [] };
    const result = safeParse(WorklogResultSchema, input, 'test');
    expect(result.title).toBe('Valid');
  });

  it('still parses with defaults for invalid partial data', () => {
    // safeParse falls back to schema.parse which applies defaults
    const result = safeParse(WorklogResultSchema, {}, 'test');
    expect(result.title).toBe('Untitled');
    expect(result.today).toEqual([]);
  });

  it('passes through all valid fields without modification', () => {
    const input = {
      title: 'Full',
      today: ['x'],
      decisions: ['y'],
      todo: ['z'],
      relatedProjects: ['p'],
      tags: ['t'],
    };
    const result = safeParse(WorklogResultSchema, input, 'test');
    expect(result).toEqual(input);
  });
});
