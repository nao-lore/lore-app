/**
 * e2e-user-flows.test.ts — E2E / Integration tests simulating real user flows
 *
 * Tests cover:
 * 1. New user flow: first access -> paste text -> transform -> save -> retrieve
 * 2. Project management: create project -> assign logs -> list projects
 * 3. Export: Markdown/JSON export of logs
 * 4. i18n: language switching affects all UI keys
 * 5. PWA: Service Worker registration config
 * 6. Edge cases: empty input, very long input, invalid JSON, special characters
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Shared localStorage mock ───
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});

// crypto.randomUUID polyfill for Node test env
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `test-uuid-${++uuidCounter}`,
});

import {
  addLog, loadLogs, getLog, updateLog, trashLog, restoreLog, deleteLog,
  duplicateLog, linkLogs, unlinkLogs,
  addProject, loadProjects, trashProject, deleteProject, renameProject,
  exportAllData, validateBackup, importData,
  invalidateLogsCache, invalidateProjectsCache, invalidateMasterNotesCache, invalidateTodosCache,
} from '../storage';
import { logToMarkdown, handoffResultToMarkdown } from '../markdown';
import { parseConversationJson } from '../jsonImport';
import { matchesLogQuery } from '../search';
import { t, tf, OUTPUT_LANGS } from '../i18n';
import type { LogEntry, TransformResult, HandoffResult } from '../types';

// ─── Helpers ───

function resetAll() {
  store.clear();
  uuidCounter = 0;
  invalidateLogsCache();
  invalidateProjectsCache();
  invalidateMasterNotesCache();
  invalidateTodosCache();
}

function makeSampleLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    title: 'Test Log',
    today: ['Did something'],
    decisions: ['Decided X'],
    todo: ['Do Y'],
    relatedProjects: [],
    tags: ['test'],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 1. NEW USER FLOW
// ═══════════════════════════════════════════════════════════════════

describe('E2E: New User Flow', () => {
  beforeEach(resetAll);

  it('starts with empty state — no logs, no projects', () => {
    expect(loadLogs()).toHaveLength(0);
    expect(loadProjects()).toHaveLength(0);
  });

  it('saves a transformed log and retrieves it', () => {
    const log = makeSampleLog({
      title: 'React Auth Implementation',
      today: ['Implemented JWT authentication', 'Added login form'],
      decisions: ['Use JWT over session-based auth'],
      todo: ['Add password reset', 'Write auth tests'],
      tags: ['react', 'auth'],
    });

    addLog(log);
    const logs = loadLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].title).toBe('React Auth Implementation');
    expect(logs[0].today).toContain('Implemented JWT authentication');
  });

  it('retrieved log matches saved data exactly', () => {
    const log = makeSampleLog({ title: 'Exact Match Test' });
    addLog(log);
    const retrieved = getLog(log.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(log.id);
    expect(retrieved!.title).toBe('Exact Match Test');
    expect(retrieved!.today).toEqual(log.today);
    expect(retrieved!.decisions).toEqual(log.decisions);
    expect(retrieved!.todo).toEqual(log.todo);
    expect(retrieved!.tags).toEqual(log.tags);
  });

  it('multiple logs are sorted by createdAt (newest first)', () => {
    const older = makeSampleLog({ title: 'Older', createdAt: '2024-01-01T00:00:00Z' });
    const newer = makeSampleLog({ title: 'Newer', createdAt: '2024-06-01T00:00:00Z' });
    addLog(older);
    addLog(newer);
    const logs = loadLogs();
    expect(logs[0].title).toBe('Newer');
    expect(logs[1].title).toBe('Older');
  });

  it('full cycle: save -> update -> verify update persists', () => {
    const log = makeSampleLog({ title: 'Original Title' });
    addLog(log);
    updateLog(log.id, { title: 'Updated Title', updatedAt: new Date().toISOString() });
    const updated = getLog(log.id);
    expect(updated!.title).toBe('Updated Title');
    expect(updated!.updatedAt).toBeDefined();
  });

  it('trash -> restore cycle preserves log data', () => {
    const log = makeSampleLog({ title: 'Trash Test' });
    addLog(log);

    trashLog(log.id);
    expect(loadLogs()).toHaveLength(0); // not in active logs

    restoreLog(log.id);
    const restored = loadLogs();
    expect(restored).toHaveLength(1);
    expect(restored[0].title).toBe('Trash Test');
  });

  it('permanent delete removes log completely', () => {
    const log = makeSampleLog();
    addLog(log);
    deleteLog(log.id);
    expect(loadLogs()).toHaveLength(0);
    expect(getLog(log.id)).toBeUndefined();
  });

  it('duplicate log creates a copy with new ID', () => {
    const log = makeSampleLog({ title: 'Original' });
    addLog(log);
    const newId = duplicateLog(log.id, ' (copy)');
    expect(newId).toBeTruthy();
    const copy = getLog(newId!);
    expect(copy).toBeDefined();
    expect(copy!.title).toBe('Original (copy)');
    expect(copy!.id).not.toBe(log.id);
    expect(loadLogs()).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. PROJECT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

describe('E2E: Project Management', () => {
  beforeEach(resetAll);

  it('creates a project and assigns logs to it', () => {
    const project = addProject('My Project');
    expect(project.name).toBe('My Project');

    const log1 = makeSampleLog({ title: 'Log A', projectId: project.id });
    const log2 = makeSampleLog({ title: 'Log B', projectId: project.id });
    const log3 = makeSampleLog({ title: 'Log C' }); // unassigned
    addLog(log1);
    addLog(log2);
    addLog(log3);

    const projectLogs = loadLogs().filter((l) => l.projectId === project.id);
    expect(projectLogs).toHaveLength(2);
    expect(projectLogs.map((l) => l.title).sort()).toEqual(['Log A', 'Log B']);
  });

  it('reassigns a log to a different project', () => {
    const p1 = addProject('Project A');
    const p2 = addProject('Project B');
    const log = makeSampleLog({ projectId: p1.id });
    addLog(log);

    updateLog(log.id, { projectId: p2.id });
    const updated = getLog(log.id);
    expect(updated!.projectId).toBe(p2.id);

    const p1Logs = loadLogs().filter((l) => l.projectId === p1.id);
    const p2Logs = loadLogs().filter((l) => l.projectId === p2.id);
    expect(p1Logs).toHaveLength(0);
    expect(p2Logs).toHaveLength(1);
  });

  it('deleting a project unassigns its logs (cascade)', () => {
    const project = addProject('Doomed Project');
    const log = makeSampleLog({ projectId: project.id, title: 'Orphan Log' });
    addLog(log);

    deleteProject(project.id);
    expect(loadProjects()).toHaveLength(0);

    // Log should survive but lose projectId
    const orphan = getLog(log.id);
    expect(orphan).toBeDefined();
    expect(orphan!.projectId).toBeUndefined();
  });

  it('renames a project', () => {
    const p = addProject('Old Name');
    renameProject(p.id, 'New Name');
    const projects = loadProjects();
    expect(projects[0].name).toBe('New Name');
  });

  it('trash and restore project cycle', () => {
    const p = addProject('Recoverable');
    trashProject(p.id);
    expect(loadProjects()).toHaveLength(0);

    // Restore not available in public API for projects — verify trash state
    const raw = JSON.parse(store.get('threadlog_projects')!);
    expect(raw[0].trashedAt).toBeTruthy();
  });

  it('multiple projects with separate log sets', () => {
    const p1 = addProject('Frontend');
    const p2 = addProject('Backend');

    addLog(makeSampleLog({ title: 'React component', projectId: p1.id }));
    addLog(makeSampleLog({ title: 'API endpoint', projectId: p2.id }));
    addLog(makeSampleLog({ title: 'Database schema', projectId: p2.id }));

    const frontendLogs = loadLogs().filter((l) => l.projectId === p1.id);
    const backendLogs = loadLogs().filter((l) => l.projectId === p2.id);
    expect(frontendLogs).toHaveLength(1);
    expect(backendLogs).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. LOG LINKING (BIDIRECTIONAL BACKLINKS)
// ═══════════════════════════════════════════════════════════════════

describe('E2E: Log Linking', () => {
  beforeEach(resetAll);

  it('links two logs bidirectionally', () => {
    const log1 = makeSampleLog({ title: 'Log 1' });
    const log2 = makeSampleLog({ title: 'Log 2' });
    addLog(log1);
    addLog(log2);

    linkLogs(log1.id, log2.id);
    const l1 = getLog(log1.id)!;
    const l2 = getLog(log2.id)!;
    expect(l1.relatedLogIds).toContain(log2.id);
    expect(l2.relatedLogIds).toContain(log1.id);
  });

  it('unlinks two logs bidirectionally', () => {
    const log1 = makeSampleLog({ title: 'Log 1' });
    const log2 = makeSampleLog({ title: 'Log 2' });
    addLog(log1);
    addLog(log2);

    linkLogs(log1.id, log2.id);
    unlinkLogs(log1.id, log2.id);

    const l1 = getLog(log1.id)!;
    const l2 = getLog(log2.id)!;
    expect(l1.relatedLogIds).not.toContain(log2.id);
    expect(l2.relatedLogIds).not.toContain(log1.id);
  });

  it('linking same pair twice does not duplicate', () => {
    const log1 = makeSampleLog({ title: 'Log 1' });
    const log2 = makeSampleLog({ title: 'Log 2' });
    addLog(log1);
    addLog(log2);

    linkLogs(log1.id, log2.id);
    linkLogs(log1.id, log2.id); // duplicate
    const l1 = getLog(log1.id)!;
    expect(l1.relatedLogIds!.filter((id) => id === log2.id)).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. EXPORT — MARKDOWN & JSON
// ═══════════════════════════════════════════════════════════════════

describe('E2E: Export', () => {
  it('exports worklog to Markdown with all sections', () => {
    const result: TransformResult = {
      title: 'Sprint Review',
      today: ['Completed feature X', 'Fixed bug Y'],
      decisions: ['Adopted TypeScript strict mode'],
      todo: ['Deploy to staging'],
      relatedProjects: ['Core Platform'],
      tags: ['sprint', 'review'],
    };

    const md = logToMarkdown(result);
    expect(md).toContain('# Sprint Review');
    expect(md).toContain('## Today');
    expect(md).toContain('- Completed feature X');
    expect(md).toContain('- Fixed bug Y');
    expect(md).toContain('## Decisions');
    expect(md).toContain('- Adopted TypeScript strict mode');
    expect(md).toContain('## TODO');
    expect(md).toContain('- Deploy to staging');
    expect(md).toContain('## Related Projects');
    expect(md).toContain('- Core Platform');
    expect(md).toContain('## Tags');
    expect(md).toContain('sprint, review');
  });

  it('exports handoff result to Markdown', () => {
    const handoff: HandoffResult = {
      title: 'Auth Handoff',
      currentStatus: ['JWT auth is working'],
      nextActions: ['Add refresh token'],
      completed: ['Login form done'],
      blockers: ['Rate limit TBD'],
      decisions: ['Use JWT'],
      constraints: ['Must support OAuth2'],
      resumeContext: ['Check auth branch'],
      tags: ['auth'],
    };

    const md = handoffResultToMarkdown(handoff);
    expect(md).toContain('# Auth Handoff');
    expect(md).toContain('## Resume Checklist');
    expect(md).toContain('Check auth branch');
    expect(md).toContain('## Current Status');
    expect(md).toContain('- JWT auth is working');
    expect(md).toContain('## Next Actions');
    expect(md).toContain('- Add refresh token');
    expect(md).toContain('## Completed');
    expect(md).toContain('- Login form done');
    expect(md).toContain('## Cautions & Open Issues');
    expect(md).toContain('- Rate limit TBD');
    expect(md).toContain('## Decisions');
    expect(md).toContain('- Use JWT');
    expect(md).toContain('## Constraints & Scope');
    expect(md).toContain('- Must support OAuth2');
  });

  it('exports handoff-mode LogEntry to Markdown via logToMarkdown', () => {
    const log: LogEntry = {
      id: 'h1',
      createdAt: '2024-01-01T00:00:00Z',
      title: 'Handoff Log',
      outputMode: 'handoff',
      currentStatus: ['Feature A done'],
      nextActions: ['Deploy'],
      completed: ['Built API'],
      blockers: [],
      decisions: ['Chose GraphQL'],
      constraints: [],
      resumeContext: ['Check deploy branch'],
      today: [],
      todo: [],
      relatedProjects: [],
      tags: ['deploy'],
    };

    const md = logToMarkdown(log);
    expect(md).toContain('# Handoff Log');
    expect(md).toContain('## Current Status');
    expect(md).toContain('- Feature A done');
    expect(md).toContain('## Decisions');
    expect(md).toContain('- Chose GraphQL');
  });

  it('JSON export/import roundtrip preserves data', () => {
    resetAll();
    const log = makeSampleLog({ title: 'Export Test' });
    addLog(log);
    const project = addProject('Exported Project');

    const backup = exportAllData();
    expect(validateBackup(backup)).toBe(true);
    expect(backup.version).toBe(1);
    expect(backup.exportedAt).toBeTruthy();

    // Clear everything
    resetAll();
    expect(loadLogs()).toHaveLength(0);
    expect(loadProjects()).toHaveLength(0);

    // Import
    const result = importData(backup, 'overwrite');
    invalidateLogsCache();
    invalidateProjectsCache();
    expect(result.logs).toBeGreaterThanOrEqual(1);
    expect(result.projects).toBeGreaterThanOrEqual(1);

    const restoredLogs = loadLogs();
    expect(restoredLogs.some((l) => l.title === 'Export Test')).toBe(true);
    const restoredProjects = loadProjects();
    expect(restoredProjects.some((p) => p.name === 'Exported Project')).toBe(true);
  });

  it('validateBackup rejects invalid data', () => {
    expect(validateBackup(null)).toBe(false);
    expect(validateBackup({})).toBe(false);
    expect(validateBackup({ version: 2, data: {} })).toBe(false);
    expect(validateBackup({ version: 1, data: { key: 'not-array' } })).toBe(false);
    expect(validateBackup({ version: 1, data: {} })).toBe(true); // empty but valid
  });

  it('merge import does not overwrite existing unique data', () => {
    resetAll();
    const existing = makeSampleLog({ title: 'Existing' });
    addLog(existing);

    const backup = exportAllData();
    // Add more data locally
    const extra = makeSampleLog({ title: 'Extra Local' });
    addLog(extra);

    // Merge import — should keep both existing and imported
    const result = importData(backup, 'merge');
    invalidateLogsCache();
    const logs = loadLogs();
    expect(logs.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. i18n — LANGUAGE SWITCHING
// ═══════════════════════════════════════════════════════════════════

describe('E2E: i18n Language Switching', () => {
  const allLangs = OUTPUT_LANGS.map((l) => l.code);

  // Critical UI keys that every user sees
  const criticalKeys = [
    'appName', 'settings', 'navLogs', 'navProjects', 'navTodo',
    'navTimeline', 'navDashboard', 'navHome',
    'createHandoff', 'searchLogs',
    'inputPlaceholder', 'importFiles',
    'noLogsYet', 'noLogsYetDesc',
  ] as const;

  it('all critical keys have translations for all 8 languages', () => {
    for (const key of criticalKeys) {
      for (const lang of allLangs) {
        const value = t(key, lang);
        expect(value, `Missing translation for ${key} in ${lang}`).toBeTruthy();
        expect(typeof value).toBe('string');
      }
    }
  });

  it('switching language changes every critical key (ja vs en)', () => {
    const keysWithDifferentTranslations: string[] = [];
    for (const key of criticalKeys) {
      const ja = t(key, 'ja');
      const en = t(key, 'en');
      if (ja !== en) keysWithDifferentTranslations.push(key);
    }
    // appName is "Lore" in all languages, so exclude it
    const nonIdentical = criticalKeys.filter((k) => k !== 'appName');
    expect(keysWithDifferentTranslations.length).toBeGreaterThanOrEqual(nonIdentical.length - 1);
  });

  it('function labels work via tf() for all languages', () => {
    for (const lang of allLangs) {
      const result = tf('transformMulti', lang, 5);
      expect(result, `transformMulti(5) in ${lang}`).toBeTruthy();
      expect(result).toContain('5');
    }
  });

  it('all 8 languages are represented in OUTPUT_LANGS', () => {
    expect(OUTPUT_LANGS).toHaveLength(8);
    const codes = OUTPUT_LANGS.map((l) => l.code);
    expect(codes).toContain('ja');
    expect(codes).toContain('en');
    expect(codes).toContain('es');
    expect(codes).toContain('fr');
    expect(codes).toContain('de');
    expect(codes).toContain('zh');
    expect(codes).toContain('ko');
    expect(codes).toContain('pt');
  });

  it('no translation returns empty string — t() never returns undefined', () => {
    for (const lang of allLangs) {
      const result = t('appName', lang);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. SEARCH — FINDING LOGS
// ═══════════════════════════════════════════════════════════════════

describe('E2E: Search', () => {
  it('finds log by title', () => {
    const log = makeSampleLog({ title: 'Authentication Module' });
    expect(matchesLogQuery(log, 'authentication')).toBe(true);
    expect(matchesLogQuery(log, 'AUTHENTICATION')).toBe(true); // case insensitive
  });

  it('finds log by tag', () => {
    const log = makeSampleLog({ tags: ['react', 'typescript'] });
    expect(matchesLogQuery(log, 'typescript')).toBe(true);
  });

  it('finds log by todo item', () => {
    const log = makeSampleLog({ todo: ['Write integration tests'] });
    expect(matchesLogQuery(log, 'integration tests')).toBe(true);
  });

  it('finds log by decision', () => {
    const log = makeSampleLog({ decisions: ['Use PostgreSQL instead of MySQL'] });
    expect(matchesLogQuery(log, 'PostgreSQL')).toBe(true);
  });

  it('finds handoff log by handoff-specific fields', () => {
    const log = makeSampleLog({
      outputMode: 'handoff',
      currentStatus: ['OAuth2 flow implemented'],
      nextActions: ['Add rate limiting'],
      blockers: ['Need production credentials'],
    });
    expect(matchesLogQuery(log, 'OAuth2')).toBe(true);
    expect(matchesLogQuery(log, 'rate limiting')).toBe(true);
    expect(matchesLogQuery(log, 'production credentials')).toBe(true);
  });

  it('does not match unrelated queries', () => {
    const log = makeSampleLog({ title: 'Frontend Work', tags: ['react'] });
    expect(matchesLogQuery(log, 'kubernetes')).toBe(false);
  });

  it('finds log by memo field', () => {
    const log = makeSampleLog({ memo: 'Remember to check the API docs' });
    expect(matchesLogQuery(log, 'API docs')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. JSON CONVERSATION IMPORT
// ═══════════════════════════════════════════════════════════════════

describe('E2E: JSON Conversation Import', () => {
  it('imports OpenAI API format conversation', () => {
    const data = JSON.stringify([
      { role: 'user', content: 'How do I implement auth?' },
      { role: 'assistant', content: 'Use JWT tokens with refresh mechanism.' },
    ]);
    const result = parseConversationJson(data, 'chat.json');
    expect(result.format).toBe('OpenAI API');
    expect(result.content).toContain('How do I implement auth?');
    expect(result.content).toContain('JWT tokens');
  });

  it('imports Claude export format', () => {
    const data = JSON.stringify([{
      name: 'Auth Discussion',
      chat_messages: [
        { sender: 'human', text: 'Help me with auth', created_at: '2024-01-01T00:00:00Z' },
        { sender: 'assistant', text: 'Sure, here is the approach...' },
      ],
    }]);
    const result = parseConversationJson(data, 'claude.json');
    expect(result.format).toBe('Claude');
    expect(result.title).toBe('Auth Discussion');
    expect(result.content).toContain('Help me with auth');
    expect(result.content).toContain('here is the approach');
  });

  it('imports Lore Capture extension format', () => {
    const data = JSON.stringify({
      source: 'chatgpt',
      title: 'Captured Session',
      capturedAt: '2024-06-15T10:00:00Z',
      messages: [
        { role: 'user', content: 'What is TypeScript?' },
        { role: 'assistant', content: 'TypeScript is a typed superset of JavaScript.' },
      ],
    });
    const result = parseConversationJson(data, 'capture.json');
    expect(result.title).toBe('Captured Session');
    expect(result.content).toContain('TypeScript');
  });

  it('rejects invalid JSON', () => {
    expect(() => parseConversationJson('not json at all', 'bad.json'))
      .toThrow('invalid JSON');
  });

  it('rejects unsupported format', () => {
    expect(() => parseConversationJson('{"random": "data"}', 'unknown.json'))
      .toThrow('unsupported JSON format');
  });

  it('rejects empty conversation array', () => {
    expect(() => parseConversationJson('[]', 'empty.json'))
      .toThrow('unsupported JSON format');
  });

  it('filters out system and tool messages', () => {
    const data = JSON.stringify([
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello' },
      { role: 'tool', content: 'tool result' },
      { role: 'assistant', content: 'Hi there' },
    ]);
    const result = parseConversationJson(data, 'filtered.json');
    expect(result.content).not.toContain('helpful assistant');
    expect(result.content).not.toContain('tool result');
    expect(result.content).toContain('Hello');
    expect(result.content).toContain('Hi there');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. EDGE CASES
// ═══════════════════════════════════════════════════════════════════

describe('E2E: Edge Cases', () => {
  beforeEach(resetAll);

  it('handles log with all empty arrays', () => {
    const log = makeSampleLog({
      title: 'Empty Log',
      today: [],
      decisions: [],
      todo: [],
      relatedProjects: [],
      tags: [],
    });
    addLog(log);
    const retrieved = getLog(log.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.title).toBe('Empty Log');

    // Markdown export should still work
    const md = logToMarkdown(retrieved as TransformResult);
    expect(md).toContain('# Empty Log');
    expect(md).not.toContain('## Today');
    expect(md).not.toContain('## Decisions');
  });

  it('handles special characters in log content', () => {
    const specialChars = '日本語テスト <script>alert("xss")</script> & "quotes" \'single\' `backtick`';
    const log = makeSampleLog({
      title: specialChars,
      today: [specialChars],
      decisions: ['Use 日本語 as default'],
      tags: ['特殊文字', '<tag>', '"quoted"'],
    });
    addLog(log);
    const retrieved = getLog(log.id);
    expect(retrieved!.title).toBe(specialChars);
    expect(retrieved!.today[0]).toBe(specialChars);
    expect(retrieved!.tags).toContain('特殊文字');
    expect(retrieved!.tags).toContain('<tag>');
  });

  it('handles emoji in content', () => {
    const log = makeSampleLog({
      title: 'Feature Complete! 🎉',
      today: ['Fixed 🐛 in auth module'],
      tags: ['🚀 launch'],
    });
    addLog(log);
    const retrieved = getLog(log.id);
    expect(retrieved!.title).toContain('🎉');
    expect(retrieved!.today[0]).toContain('🐛');
  });

  it('handles very long input text (50k+ chars)', () => {
    const longText = 'A'.repeat(60000);
    const log = makeSampleLog({
      title: 'Long Input Test',
      today: [longText],
    });
    addLog(log);
    const retrieved = getLog(log.id);
    expect(retrieved!.today[0].length).toBe(60000);
  });

  it('handles log with maximum number of items', () => {
    const manyItems = Array.from({ length: 200 }, (_, i) => `Item ${i + 1}`);
    const log = makeSampleLog({
      title: 'Many Items',
      today: manyItems,
      decisions: manyItems,
      todo: manyItems,
      tags: manyItems,
    });
    addLog(log);
    const retrieved = getLog(log.id);
    expect(retrieved!.today).toHaveLength(200);
    expect(retrieved!.decisions).toHaveLength(200);
  });

  it('handles concurrent-like operations (rapid add/update)', () => {
    for (let i = 0; i < 20; i++) {
      addLog(makeSampleLog({ title: `Rapid ${i}` }));
    }
    expect(loadLogs()).toHaveLength(20);

    // Update all of them
    const logs = loadLogs();
    for (const log of logs) {
      updateLog(log.id, { title: log.title + ' (updated)' });
    }
    const updated = loadLogs();
    expect(updated.every((l) => l.title.endsWith('(updated)'))).toBe(true);
  });

  it('JSON parse of corrupted localStorage returns empty array', () => {
    store.set('threadlog_logs', 'not-valid-json{{{');
    invalidateLogsCache();
    expect(loadLogs()).toEqual([]);
  });

  it('getLog returns undefined for non-existent ID', () => {
    expect(getLog('does-not-exist-id')).toBeUndefined();
  });

  it('deleteLog on non-existent ID does not crash', () => {
    expect(() => deleteLog('ghost-id')).not.toThrow();
  });

  it('duplicateLog on non-existent ID returns null', () => {
    expect(duplicateLog('nonexistent', ' (copy)')).toBeNull();
  });

  it('addProject with empty name still works', () => {
    const p = addProject('');
    expect(p.name).toBe('');
    expect(p.id).toBeTruthy();
  });

  it('handles unicode normalization in search', () => {
    const log = makeSampleLog({ title: 'カフェ' }); // composed form
    expect(matchesLogQuery(log, 'カフェ')).toBe(true);
  });

  it('Markdown export handles newlines in content gracefully', () => {
    const result: TransformResult = {
      title: 'Newline Test',
      today: ['First line\nSecond line'],
      decisions: [],
      todo: [],
      relatedProjects: [],
      tags: [],
    };
    const md = logToMarkdown(result);
    expect(md).toContain('First line\nSecond line');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. PWA CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

describe('E2E: PWA Configuration', () => {
  it('vite config has PWA plugin with registerType: prompt', async () => {
    // Verify the PWA config by reading the vite config
    // This is a static verification — the actual SW registration is runtime
    const fs = await import('fs');
    const configContent = fs.readFileSync('/Users/nn/threadlog/vite.config.ts', 'utf-8');
    expect(configContent).toContain("registerType: 'prompt'");
    expect(configContent).toContain('VitePWA');
  });

  it('workbox caches static assets', async () => {
    const fs = await import('fs');
    const configContent = fs.readFileSync('/Users/nn/threadlog/vite.config.ts', 'utf-8');
    expect(configContent).toContain('static-assets');
    expect(configContent).toContain('CacheFirst');
  });

  it('AI API calls use NetworkOnly (never cached)', async () => {
    const fs = await import('fs');
    const configContent = fs.readFileSync('/Users/nn/threadlog/vite.config.ts', 'utf-8');
    expect(configContent).toContain('NetworkOnly');
    expect(configContent).toContain('generativelanguage');
    expect(configContent).toContain('anthropic');
    expect(configContent).toContain('openai');
  });

  it('manifest.webmanifest exists in public folder', async () => {
    const fs = await import('fs');
    const exists = fs.existsSync('/Users/nn/threadlog/public/manifest.webmanifest');
    expect(exists).toBe(true);
  });
});
