/**
 * storage-projects.test.ts — Unit tests for projects storage module
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
  loadProjects,
  loadTrashedProjects,
  addProject,
  trashProject,
  restoreProject,
  deleteProject,
  renameProject,
  updateProject,
  invalidateProjectsCache,
  invalidateLogsCache,
  invalidateMasterNotesCache,
} from '../storage';

describe('storage/projects — CRUD', () => {
  beforeEach(() => {
    store.clear();
    invalidateProjectsCache();
    invalidateLogsCache();
    invalidateMasterNotesCache();
  });

  it('addProject creates and returns a project', () => {
    const p = addProject('My Project');
    expect(p.name).toBe('My Project');
    expect(p.id).toBeTruthy();
    expect(typeof p.createdAt).toBe('number');
  });

  it('loadProjects returns active projects', () => {
    addProject('A');
    addProject('B');
    expect(loadProjects()).toHaveLength(2);
  });

  it('loadProjects excludes trashed', () => {
    const p = addProject('Trash');
    trashProject(p.id);
    expect(loadProjects()).toHaveLength(0);
  });

  it('loadTrashedProjects returns only trashed', () => {
    const p = addProject('Trashed');
    trashProject(p.id);
    expect(loadTrashedProjects()).toHaveLength(1);
    expect(loadTrashedProjects()[0].id).toBe(p.id);
  });

  it('trashProject sets trashedAt and clears pinned', () => {
    const p = addProject('Pin');
    updateProject(p.id, { pinned: true });
    trashProject(p.id);
    const trashed = loadTrashedProjects()[0];
    expect(trashed.trashedAt).toBeDefined();
    expect(trashed.pinned).toBe(false);
  });

  it('restoreProject removes trashedAt', () => {
    const p = addProject('Restore');
    trashProject(p.id);
    restoreProject(p.id);
    expect(loadProjects()).toHaveLength(1);
    const restored = loadProjects()[0];
    expect(restored.trashedAt).toBeUndefined();
  });

  it('deleteProject permanently removes', () => {
    const p = addProject('Delete me');
    deleteProject(p.id);
    expect(loadProjects()).toHaveLength(0);
    expect(loadTrashedProjects()).toHaveLength(0);
  });

  it('renameProject changes the name', () => {
    const p = addProject('Old Name');
    renameProject(p.id, 'New Name');
    expect(loadProjects()[0].name).toBe('New Name');
  });

  it('updateProject modifies arbitrary fields', () => {
    const p = addProject('Update');
    updateProject(p.id, { color: 'blue', icon: '🔧' });
    const updated = loadProjects()[0];
    expect(updated.color).toBe('blue');
    expect(updated.icon).toBe('🔧');
  });

  it('updateProject preserves unmodified fields', () => {
    const p = addProject('Keep');
    updateProject(p.id, { color: 'red' });
    const updated = loadProjects()[0];
    expect(updated.name).toBe('Keep');
  });

  it('multiple projects are independent', () => {
    const a = addProject('A');
    addProject('B');
    trashProject(a.id);
    expect(loadProjects()).toHaveLength(1);
    expect(loadProjects()[0].name).toBe('B');
  });

  it('addProject generates unique IDs', () => {
    const a = addProject('A');
    const b = addProject('B');
    expect(a.id).not.toBe(b.id);
  });
});
