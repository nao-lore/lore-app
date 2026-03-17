import type { LogEntry, Project, WeeklyReport, KnowledgeBase } from '../types';
import { PROJECTS_KEY, KNOWLEDGE_BASE_KEY, safeGetItem, safeSetItem, safeRemoveItem, cache, invalidateProjectsCache } from './core';
import { saveLogs, loadAllLogs } from './logs';
import { deleteMasterNote, deleteMasterNoteHistory } from './masterNotes';

// ─── Projects ───

const WEEKLY_REPORTS_KEY = 'threadlog_weekly_reports';
const AI_CONTEXT_PREFIX = 'lore_ai_context_';

function loadAllProjects(): Project[] {
  if (cache.projectsCache.data !== null && cache.projectsCache.version === cache.projectsCacheVersion) {
    return cache.projectsCache.data;
  }
  const raw = safeGetItem(PROJECTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const data = Array.isArray(parsed) ? parsed : [];
    cache.projectsCache = { data, version: cache.projectsCacheVersion };
    return data;
  } catch (err) { if (import.meta.env.DEV) console.warn('[storage] loadAllProjects', err); return []; }
}

export function loadProjects(): Project[] {
  return loadAllProjects().filter((p) => !p.trashedAt);
}

export function loadTrashedProjects(): Project[] {
  return loadAllProjects().filter((p) => !!p.trashedAt);
}

export function saveProjects(projects: Project[]): void {
  safeSetItem(PROJECTS_KEY, JSON.stringify(projects));
  invalidateProjectsCache();
}

export function addProject(name: string): Project {
  const project: Project = { id: crypto.randomUUID(), name, createdAt: Date.now() };
  const projects = [...loadAllProjects()];
  projects.push(project);
  saveProjects(projects);
  return project;
}

/** Move project to trash */
export function trashProject(id: string): void {
  const projects = loadAllProjects().map((p) => p.id === id ? { ...p, trashedAt: Date.now(), pinned: false } : p);
  saveProjects(projects);
}

/** Restore project from trash */
export function restoreProject(id: string): void {
  const projects = loadAllProjects().map((p) => {
    if (p.id !== id) return p;
    const { trashedAt: _, ...rest } = p;
    void _;
    return rest as Project;
  });
  saveProjects(projects);
}

export function deleteProject(id: string): void {
  saveProjects(loadAllProjects().filter((p) => p.id !== id));
  // Cascade: delete MasterNote + history + AI Context
  deleteMasterNote(id);
  deleteMasterNoteHistory(id);
  deleteAiContext(id);
  // Cascade: delete KnowledgeBase
  deleteKnowledgeBase(id);
  // Cascade: delete WeeklyReports for this project
  deleteWeeklyReportsForProject(id);
  // Unassign logs from deleted project (keep the logs)
  const logs = loadAllLogs().map((l) => {
    if (l.projectId === id) {
      const { projectId: _, ...rest } = l;
      void _;
      return rest as LogEntry;
    }
    return l;
  });
  saveLogs(logs);
}

export function renameProject(id: string, name: string): void {
  saveProjects(loadAllProjects().map((p) => p.id === id ? { ...p, name } : p));
}

export function updateProject(id: string, patch: Partial<Project>): void {
  saveProjects(loadAllProjects().map((p) => p.id === id ? { ...p, ...patch } : p));
}

// ─── Weekly Reports ───

export function loadWeeklyReports(): WeeklyReport[] {
  const raw = safeGetItem(WEEKLY_REPORTS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (err) { if (import.meta.env.DEV) console.warn('[storage] loadWeeklyReports', err); return []; }
}

export function saveWeeklyReport(report: WeeklyReport): void {
  const all = loadWeeklyReports().filter(
    (r) => !(r.weekStart === report.weekStart && (r.projectId || '') === (report.projectId || ''))
  );
  all.push(report);
  all.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  safeSetItem(WEEKLY_REPORTS_KEY, JSON.stringify(all));
}

export function getWeeklyReport(weekStart: string, projectId?: string): WeeklyReport | undefined {
  return loadWeeklyReports().find(
    (r) => r.weekStart === weekStart && (r.projectId || '') === (projectId || '')
  );
}

export function deleteWeeklyReport(id: string): void {
  const all = loadWeeklyReports().filter((r) => r.id !== id);
  safeSetItem(WEEKLY_REPORTS_KEY, JSON.stringify(all));
}

/** Delete all weekly reports for a project */
function deleteWeeklyReportsForProject(projectId: string): void {
  const all = loadWeeklyReports().filter((r) => (r.projectId || '') !== projectId);
  safeSetItem(WEEKLY_REPORTS_KEY, JSON.stringify(all));
}

// ─── Knowledge Base ───

export function loadKnowledgeBases(): KnowledgeBase[] {
  const raw = safeGetItem(KNOWLEDGE_BASE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (err) { if (import.meta.env.DEV) console.warn('[storage] loadKnowledgeBases', err); return []; }
}

export function getKnowledgeBase(projectId: string): KnowledgeBase | undefined {
  return loadKnowledgeBases().find((kb) => kb.projectId === projectId);
}

export function saveKnowledgeBase(kb: KnowledgeBase): void {
  const all = loadKnowledgeBases().filter((k) => k.projectId !== kb.projectId);
  all.push(kb);
  safeSetItem(KNOWLEDGE_BASE_KEY, JSON.stringify(all));
}

export function deleteKnowledgeBase(projectId: string): void {
  const all = loadKnowledgeBases().filter((k) => k.projectId !== projectId);
  safeSetItem(KNOWLEDGE_BASE_KEY, JSON.stringify(all));
}

// ─── AI Context (per-project) ───

export function getAiContext(projectId: string): string | null {
  return safeGetItem(AI_CONTEXT_PREFIX + projectId) || null;
}

export function saveAiContext(projectId: string, content: string): void {
  safeSetItem(AI_CONTEXT_PREFIX + projectId, content);
}

export function deleteAiContext(projectId: string): void {
  safeRemoveItem(AI_CONTEXT_PREFIX + projectId);
}
