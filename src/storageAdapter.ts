/**
 * Storage adapter abstraction for migrating from localStorage to Supabase.
 *
 * Usage plan:
 * 1. Current: LocalStorageAdapter (wraps existing storage.ts functions)
 * 2. Future: SupabaseAdapter (implements same interface with Supabase client)
 * 3. Switch via environment variable or feature flag
 */

import type { LogEntry, Project, Todo, MasterNote } from './types';
import type { LoreBackup } from './storage';

export interface StorageAdapter {
  // Projects
  loadProjects(): Promise<Project[]>;
  addProject(name: string): Promise<Project>;
  updateProject(id: string, patch: Partial<Project>): Promise<void>;
  deleteProject(id: string): Promise<void>;

  // Logs
  loadLogs(): Promise<LogEntry[]>;
  getLog(id: string): Promise<LogEntry | null>;
  addLog(log: LogEntry): Promise<void>;
  updateLog(id: string, patch: Partial<LogEntry>): Promise<void>;
  deleteLog(id: string): Promise<void>;

  // Todos
  loadTodos(): Promise<Todo[]>;
  addTodo(todo: Todo): Promise<void>;
  updateTodo(id: string, patch: Partial<Todo>): Promise<void>;
  deleteTodo(id: string): Promise<void>;

  // Master Notes
  getMasterNote(projectId: string): Promise<MasterNote | null>;
  saveMasterNote(note: MasterNote): Promise<void>;

  // Auth (Supabase only)
  getCurrentUserId(): Promise<string | null>;

  // Data export/import
  exportAll(): Promise<LoreBackup>;
  importAll(backup: LoreBackup, mode: 'merge' | 'overwrite'): Promise<void>;
}

/**
 * Current implementation: wraps localStorage.
 * This adapter allows the rest of the app to migrate to async calls
 * while still using localStorage under the hood.
 */
export class LocalStorageAdapter implements StorageAdapter {
  async loadProjects(): Promise<Project[]> {
    const { loadProjects } = await import('./storage');
    return loadProjects();
  }

  async addProject(name: string): Promise<Project> {
    const { addProject } = await import('./storage');
    return addProject(name);
  }

  async updateProject(id: string, patch: Partial<Project>): Promise<void> {
    const { updateProject } = await import('./storage');
    updateProject(id, patch);
  }

  async deleteProject(id: string): Promise<void> {
    const { trashProject } = await import('./storage');
    trashProject(id);
  }

  async loadLogs(): Promise<LogEntry[]> {
    const { loadLogs } = await import('./storage');
    return loadLogs();
  }

  async getLog(id: string): Promise<LogEntry | null> {
    const { getLog } = await import('./storage');
    return getLog(id) ?? null;
  }

  async addLog(log: LogEntry): Promise<void> {
    const { addLog } = await import('./storage');
    addLog(log);
  }

  async updateLog(id: string, patch: Partial<LogEntry>): Promise<void> {
    const { updateLog } = await import('./storage');
    updateLog(id, patch);
  }

  async deleteLog(id: string): Promise<void> {
    const { trashLog } = await import('./storage');
    trashLog(id);
  }

  async loadTodos(): Promise<Todo[]> {
    const { loadTodos } = await import('./storage');
    return loadTodos();
  }

  async addTodo(todo: Todo): Promise<void> {
    const { saveTodos, loadTodos } = await import('./storage');
    const todos = loadTodos();
    todos.push(todo);
    saveTodos(todos);
  }

  async updateTodo(id: string, patch: Partial<Todo>): Promise<void> {
    const { updateTodo } = await import('./storage');
    updateTodo(id, patch);
  }

  async deleteTodo(id: string): Promise<void> {
    const { trashTodo } = await import('./storage');
    trashTodo(id);
  }

  async getMasterNote(projectId: string): Promise<MasterNote | null> {
    const { getMasterNote } = await import('./storage');
    return getMasterNote(projectId) ?? null;
  }

  async saveMasterNote(note: MasterNote): Promise<void> {
    const { saveMasterNote } = await import('./storage');
    saveMasterNote(note);
  }

  async getCurrentUserId(): Promise<string | null> {
    return null; // localStorage has no auth
  }

  async exportAll(): Promise<LoreBackup> {
    const { exportAllData } = await import('./storage');
    return exportAllData();
  }

  async importAll(backup: LoreBackup, mode: 'merge' | 'overwrite'): Promise<void> {
    const { importData } = await import('./storage');
    importData(backup, mode);
  }
}
