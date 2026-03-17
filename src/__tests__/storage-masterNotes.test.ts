/**
 * storage-masterNotes.test.ts — Unit tests for masterNotes storage module
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});
vi.stubGlobal('import', { meta: { env: { DEV: false } } });

import {
  getMasterNote,
  saveMasterNote,
  deleteMasterNote,
  loadMasterNotes,
  getMasterNoteHistory,
  deleteMasterNoteHistory,
  restoreMasterNoteSnapshot,
  invalidateMasterNotesCache,
} from '../storage';
import type { MasterNote } from '../types';

function makeMasterNote(projectId: string, overrides?: Partial<MasterNote>): MasterNote {
  return {
    id: crypto.randomUUID(),
    projectId,
    overview: 'Overview',
    currentStatus: 'In progress',
    decisions: [{ text: 'Decision 1', sourceLogIds: ['log1'] }],
    openIssues: [{ text: 'Issue 1', sourceLogIds: ['log1'] }],
    nextActions: [{ text: 'Action 1', sourceLogIds: ['log1'] }],
    relatedLogIds: ['log1'],
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('storage/masterNotes — CRUD', () => {
  beforeEach(() => {
    store.clear();
    invalidateMasterNotesCache();
  });

  it('saveMasterNote and getMasterNote round-trip', () => {
    const note = makeMasterNote('proj1');
    saveMasterNote(note);
    const got = getMasterNote('proj1');
    expect(got).toBeDefined();
    expect(got!.overview).toBe('Overview');
  });

  it('getMasterNote returns undefined for nonexistent', () => {
    expect(getMasterNote('no-proj')).toBeUndefined();
  });

  it('saveMasterNote overwrites existing note for same project', () => {
    saveMasterNote(makeMasterNote('proj1', { overview: 'V1' }));
    saveMasterNote(makeMasterNote('proj1', { overview: 'V2' }));
    expect(getMasterNote('proj1')!.overview).toBe('V2');
    expect(loadMasterNotes()).toHaveLength(1);
  });

  it('deleteMasterNote removes the note', () => {
    saveMasterNote(makeMasterNote('proj1'));
    deleteMasterNote('proj1');
    expect(getMasterNote('proj1')).toBeUndefined();
  });

  it('deleteMasterNote on nonexistent does not throw', () => {
    expect(() => deleteMasterNote('nope')).not.toThrow();
  });

  it('loadMasterNotes returns all notes', () => {
    saveMasterNote(makeMasterNote('proj1'));
    saveMasterNote(makeMasterNote('proj2'));
    expect(loadMasterNotes()).toHaveLength(2);
  });

  it('multiple projects have independent notes', () => {
    saveMasterNote(makeMasterNote('proj1', { overview: 'A' }));
    saveMasterNote(makeMasterNote('proj2', { overview: 'B' }));
    expect(getMasterNote('proj1')!.overview).toBe('A');
    expect(getMasterNote('proj2')!.overview).toBe('B');
  });
});

describe('storage/masterNotes — history & snapshots', () => {
  beforeEach(() => {
    store.clear();
    invalidateMasterNotesCache();
  });

  it('saveMasterNote creates history snapshot of previous version', () => {
    saveMasterNote(makeMasterNote('proj1', { overview: 'V1', updatedAt: 1000 }));
    saveMasterNote(makeMasterNote('proj1', { overview: 'V2', updatedAt: 2000 }));
    const history = getMasterNoteHistory('proj1');
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].note.overview).toBe('V1');
  });

  it('first save does not create a snapshot (no previous version)', () => {
    saveMasterNote(makeMasterNote('proj1'));
    const history = getMasterNoteHistory('proj1');
    expect(history).toHaveLength(0);
  });

  it('multiple saves accumulate snapshots', () => {
    saveMasterNote(makeMasterNote('proj1', { overview: 'V1', updatedAt: 1000 }));
    saveMasterNote(makeMasterNote('proj1', { overview: 'V2', updatedAt: 2000 }));
    saveMasterNote(makeMasterNote('proj1', { overview: 'V3', updatedAt: 3000 }));
    const history = getMasterNoteHistory('proj1');
    expect(history).toHaveLength(2);
  });

  it('restoreMasterNoteSnapshot restores a previous version', () => {
    saveMasterNote(makeMasterNote('proj1', { overview: 'V1', updatedAt: 1000 }));
    saveMasterNote(makeMasterNote('proj1', { overview: 'V2', updatedAt: 2000 }));
    const history = getMasterNoteHistory('proj1');
    const version = history[0].version;
    const restored = restoreMasterNoteSnapshot('proj1', version);
    expect(restored).toBeDefined();
    expect(restored!.overview).toBe('V1');
    expect(getMasterNote('proj1')!.overview).toBe('V1');
  });

  it('restoreMasterNoteSnapshot returns undefined for bad version', () => {
    saveMasterNote(makeMasterNote('proj1'));
    expect(restoreMasterNoteSnapshot('proj1', 999)).toBeUndefined();
  });

  it('deleteMasterNoteHistory clears all history', () => {
    saveMasterNote(makeMasterNote('proj1', { overview: 'V1', updatedAt: 1000 }));
    saveMasterNote(makeMasterNote('proj1', { overview: 'V2', updatedAt: 2000 }));
    deleteMasterNoteHistory('proj1');
    expect(getMasterNoteHistory('proj1')).toHaveLength(0);
  });

  it('history for different projects is independent', () => {
    saveMasterNote(makeMasterNote('proj1', { overview: 'A1', updatedAt: 1000 }));
    saveMasterNote(makeMasterNote('proj1', { overview: 'A2', updatedAt: 2000 }));
    saveMasterNote(makeMasterNote('proj2', { overview: 'B1', updatedAt: 1000 }));
    expect(getMasterNoteHistory('proj1')).toHaveLength(1);
    expect(getMasterNoteHistory('proj2')).toHaveLength(0);
  });
});
