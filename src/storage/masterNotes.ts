import type { MasterNote, MasterNoteHistory, MasterNoteSnapshot } from '../types';
import { MASTER_NOTES_KEY, MN_HISTORY_KEY, MAX_MN_SNAPSHOTS, safeGetItem, safeSetItem, cache, invalidateMasterNotesCache } from './core';

// ─── Master Notes ───

export function loadMasterNotes(): MasterNote[] {
  if (cache.masterNotesCache.data !== null && cache.masterNotesCache.version === cache.masterNotesCacheVersion) {
    return cache.masterNotesCache.data;
  }
  const raw = safeGetItem(MASTER_NOTES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const data = Array.isArray(parsed) ? parsed : [];
    cache.masterNotesCache = { data, version: cache.masterNotesCacheVersion };
    return data;
  } catch (err) { if (import.meta.env.DEV) console.warn('[storage] loadMasterNotes', err); return []; }
}

export function getMasterNote(projectId: string): MasterNote | undefined {
  return loadMasterNotes().find((n) => n.projectId === projectId);
}

export function saveMasterNote(note: MasterNote): void {
  // Save snapshot of the previous version before overwriting
  const prev = getMasterNote(note.projectId);
  if (prev) {
    pushMasterNoteSnapshot(prev);
  }

  const notes = loadMasterNotes().filter((n) => n.projectId !== note.projectId);
  notes.push(note);
  safeSetItem(MASTER_NOTES_KEY, JSON.stringify(notes));
  invalidateMasterNotesCache();
}

export function deleteMasterNote(projectId: string): void {
  const notes = loadMasterNotes().filter((n) => n.projectId !== projectId);
  safeSetItem(MASTER_NOTES_KEY, JSON.stringify(notes));
  invalidateMasterNotesCache();
}

/** Remove a deleted log ID from all MasterNote sourceLogIds and relatedLogIds */
export function cleanMasterNoteSourceLogIds(logId: string): void {
  const notes = loadMasterNotes();
  let changed = false;
  const updated = notes.map((n) => {
    const cleanSourced = (items: { text: string; sourceLogIds: string[] }[]) =>
      items.map((item) => {
        const filtered = item.sourceLogIds.filter((id) => id !== logId);
        if (filtered.length !== item.sourceLogIds.length) { changed = true; return { ...item, sourceLogIds: filtered }; }
        return item;
      });
    const decisions = cleanSourced(n.decisions);
    const openIssues = cleanSourced(n.openIssues);
    const nextActions = cleanSourced(n.nextActions);
    const relatedLogIds = n.relatedLogIds.filter((id) => id !== logId);
    if (relatedLogIds.length !== n.relatedLogIds.length) changed = true;
    return { ...n, decisions, openIssues, nextActions, relatedLogIds };
  });
  if (changed) {
    safeSetItem(MASTER_NOTES_KEY, JSON.stringify(updated));
    invalidateMasterNotesCache();
  }
}

// ─── Master Note History ───

function loadAllMnHistory(): MasterNoteHistory[] {
  const raw = safeGetItem(MN_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) { if (import.meta.env.DEV) console.warn('[storage] loadAllMnHistory', err); return []; }
}

function saveMnHistory(histories: MasterNoteHistory[]): void {
  safeSetItem(MN_HISTORY_KEY, JSON.stringify(histories));
}

function pushMasterNoteSnapshot(note: MasterNote): void {
  const all = loadAllMnHistory();
  let history = all.find((h) => h.projectId === note.projectId);
  if (!history) {
    history = { projectId: note.projectId, snapshots: [] };
    all.push(history);
  }
  const nextVersion = history.snapshots.length > 0
    ? Math.max(...history.snapshots.map((s) => s.version)) + 1
    : 1;
  history.snapshots.push({
    version: nextVersion,
    note: { ...note },
    savedAt: note.updatedAt,
  });
  // Cap snapshots: keep only the most recent MAX_MN_SNAPSHOTS
  if (history.snapshots.length > MAX_MN_SNAPSHOTS) {
    history.snapshots.sort((a, b) => a.savedAt - b.savedAt);
    history.snapshots = history.snapshots.slice(-MAX_MN_SNAPSHOTS);
  }
  saveMnHistory(all);
}

export function getMasterNoteHistory(projectId: string): MasterNoteSnapshot[] {
  const history = loadAllMnHistory().find((h) => h.projectId === projectId);
  return history ? [...history.snapshots].sort((a, b) => b.savedAt - a.savedAt) : [];
}

/** Delete all MasterNote history for a project */
export function deleteMasterNoteHistory(projectId: string): void {
  const all = loadAllMnHistory().filter((h) => h.projectId !== projectId);
  saveMnHistory(all);
}

export function restoreMasterNoteSnapshot(projectId: string, version: number): MasterNote | undefined {
  const snapshots = getMasterNoteHistory(projectId);
  const snap = snapshots.find((s) => s.version === version);
  if (!snap) return undefined;
  const restored = { ...snap.note, updatedAt: Date.now() };
  // saveMasterNote will auto-push current as snapshot before overwriting
  saveMasterNote(restored);
  return restored;
}
