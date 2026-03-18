/**
 * Transform execution strategies — extracted from useTransform.ts.
 *
 * Each strategy function handles a specific transform action (both, handoff, worklog, etc.)
 * for either real API calls or demo mode.
 */

import { transformText, transformHandoff, transformBoth, transformTodoOnly, transformHandoffTodo, buildHandoffLogEntry } from '../transform';
import type { TransformBothOptions, HandoffTodoResult, TodoOnlyResult } from '../transform';
import { ChunkEngine } from '../chunkEngine';
import { addLog, addTodosFromLog, addTodosFromLogWithMeta, updateLog, getFeatureEnabled } from '../storage';
import type { TransformResult, HandoffResult, BothResult, LogEntry } from '../types';
import { t } from '../i18n';
import type { EngineProgress } from '../chunkEngine';
import type { StreamCallback } from '../provider';
import type { Lang } from '../i18n';
import type { Project, SourceReference, OutputMode } from '../types';

const loadDemoData = () => import('../demoData');

// ---------------------------------------------------------------------------
// AI result cache (AI #20) — avoids redundant API calls for identical inputs.
// Key: hash of (first 1000 chars + total length + action). Max 20 entries (LRU eviction).
// ---------------------------------------------------------------------------

const AI_CACHE_MAX = 20;
const AI_CACHE_TTL_MS = 30 * 60 * 1000;

interface CacheEntry {
  result: unknown;
  timestamp: number;
}

const aiResultCache = new Map<string, CacheEntry>();

/** djb2 hash — fast, low-collision string hash */
export function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return hash.toString(36);
}

/** Compute a cache key from text content and action */
export function hashCacheKey(text: string, action: string, provider: string, lang: string): string {
  const composite = `${action}:${provider}:${lang}:${text.length}:${text}`;
  return djb2Hash(composite);
}

/** Get a cached AI result if available (with TTL) */
export function getCachedResult<T>(text: string, action: string, provider: string, lang: string): T | undefined {
  const key = hashCacheKey(text, action, provider, lang);
  const entry = aiResultCache.get(key);
  if (entry !== undefined) {
    if (Date.now() - entry.timestamp > AI_CACHE_TTL_MS) {
      aiResultCache.delete(key);
      return undefined;
    }
    aiResultCache.delete(key);
    aiResultCache.set(key, entry);
    return entry.result as T;
  }
  return undefined;
}

/** Store an AI result in the cache */
export function setCachedResult(text: string, action: string, provider: string, lang: string, result: unknown): void {
  const key = hashCacheKey(text, action, provider, lang);
  if (aiResultCache.size >= AI_CACHE_MAX && !aiResultCache.has(key)) {
    const oldest = aiResultCache.keys().next().value;
    if (oldest !== undefined) aiResultCache.delete(oldest);
  }
  aiResultCache.set(key, { result, timestamp: Date.now() });
}

// ---------------------------------------------------------------------------
// Shared context passed to per-action strategy functions
// ---------------------------------------------------------------------------

/** Context shared by all transform strategy functions */
export interface TransformContext {
  combined: string;
  apiKey: string;
  willChunk: boolean;
  selectedProjectId?: string;
  lang: Lang;
  text: string;
  files: { name: string; content: string; lastModified?: number }[];
  buildSourceReference: (pastedText: string, files: { name: string; content: string; lastModified?: number }[], charCount: number) => SourceReference;
  initSingleTransform: () => void;
  createStreamCallback: () => { onStream?: StreamCallback };
  setProgress: (p: EngineProgress | null) => void;
  setResult: (r: TransformResult | HandoffResult | null) => void;
  setOutputMode: (m: OutputMode) => void;
  setStreamDetail: (s: string | null) => void;
  setSimStep: (n: number) => void;
  projects: Project[];
  engineRef: React.MutableRefObject<ChunkEngine | null>;
  _t0: number;
  triggerClassification: (entry: LogEntry) => void;
  provider: string;
  cacheLang: string;
}

/** Result returned by each strategy function */
export interface ActionResult {
  lastEntryId: string | null;
  savedHandoffLog: LogEntry | null;
  todoCount: number;
  _handoffEntry?: LogEntry;
  _worklogEntry?: LogEntry;
  _bothResult?: BothResult;
}

// ---------------------------------------------------------------------------
// Per-action strategy functions (real API path)
// ---------------------------------------------------------------------------

/** Execute "both" (worklog + handoff) transform */
export async function executeBoth(ctx: TransformContext): Promise<ActionResult> {
  const { combined, apiKey, willChunk, selectedProjectId, text, files, buildSourceReference, initSingleTransform, createStreamCallback, setProgress, setResult, setOutputMode, setStreamDetail, setSimStep, projects, engineRef, _t0, provider, cacheLang } = ctx;
  let bothResult: BothResult;
  let todoCount = 0;

  if (willChunk) {
    const engine = new ChunkEngine();
    engineRef.current = engine;
    bothResult = await engine.processBoth(combined, apiKey, (p) => setProgress(p));
    if (import.meta.env.DEV && _t0) console.log(`[Perf] API response (chunked): ${(performance.now() - _t0).toFixed(0)}ms`);
    engineRef.current = null;
  } else {
    initSingleTransform();
    const bothOpts: TransformBothOptions = {
      ...createStreamCallback(),
      projects: !selectedProjectId && projects.length > 0
        ? projects.map(p => ({ id: p.id, name: p.name }))
        : undefined,
    };
    const cachedBoth = getCachedResult<BothResult>(combined, 'both', provider, cacheLang);
    if (cachedBoth) {
      bothResult = cachedBoth;
    } else {
      bothResult = await transformBoth(combined, bothOpts);
      setCachedResult(combined, 'both', provider, cacheLang, bothResult);
    }
    if (import.meta.env.DEV && _t0) console.log(`[Perf] API response${cachedBoth ? ' (cached)' : ''}: ${(performance.now() - _t0).toFixed(0)}ms`);
    setStreamDetail(null);
    setSimStep(4);
  }

  const handoffEntry = buildHandoffLogEntry(bothResult.handoff, {
    projectId: selectedProjectId,
    sourceReference: buildSourceReference(text, files, combined.length),
  });
  addLog(handoffEntry);
  const savedHandoffLog = handoffEntry;

  const r = bothResult.worklog;
  setResult(r);
  setOutputMode('worklog');
  const worklogEntry: LogEntry = {
    id: crypto.randomUUID(), createdAt: new Date().toISOString(),
    importedAt: new Date().toISOString(),
    title: r.title,
    projectId: selectedProjectId,
    sourceReference: buildSourceReference(text, files, combined.length),
    outputMode: 'worklog',
    today: r.today, decisions: r.decisions, todo: r.todo,
    relatedProjects: r.relatedProjects, tags: r.tags,
  };
  addLog(worklogEntry);
  if (getFeatureEnabled('todo_extract', true)) { addTodosFromLog(worklogEntry.id, r.todo); todoCount = r.todo.length; }

  if (!selectedProjectId && projects.length > 0 && bothResult.classification?.projectId) {
    const cl = bothResult.classification;
    const matchedProject = projects.find(p => p.id === cl.projectId);
    if (matchedProject && cl.confidence > 0.7) {
      updateLog(handoffEntry.id, { projectId: cl.projectId ?? undefined, classificationConfidence: cl.confidence });
      updateLog(worklogEntry.id, { projectId: cl.projectId ?? undefined, classificationConfidence: cl.confidence });
    } else if (matchedProject && cl.confidence > 0) {
      updateLog(worklogEntry.id, { suggestedProjectId: cl.projectId ?? undefined, classificationConfidence: cl.confidence });
    }
  }

  return {
    lastEntryId: worklogEntry.id,
    savedHandoffLog,
    todoCount,
    _handoffEntry: handoffEntry,
    _worklogEntry: worklogEntry,
    _bothResult: bothResult,
  };
}

/** Execute handoff-only transform */
export async function executeHandoff(ctx: TransformContext): Promise<ActionResult> {
  const { combined, apiKey, willChunk, selectedProjectId, text, files, buildSourceReference, initSingleTransform, createStreamCallback, setResult, setProgress, setStreamDetail, setSimStep, projects, engineRef, _t0, triggerClassification, provider, cacheLang } = ctx;

  let r: HandoffResult;
  if (willChunk) {
    const engine = new ChunkEngine();
    engineRef.current = engine;
    r = await engine.processHandoff(combined, apiKey, (p) => setProgress(p));
    if (import.meta.env.DEV && _t0) console.log(`[Perf] API response (chunked): ${(performance.now() - _t0).toFixed(0)}ms`);
    engineRef.current = null;
  } else {
    initSingleTransform();
    const cachedHandoff = getCachedResult<HandoffResult>(combined, 'handoff', provider, cacheLang);
    if (cachedHandoff) {
      r = cachedHandoff;
    } else {
      r = await transformHandoff(combined, createStreamCallback());
      setCachedResult(combined, 'handoff', provider, cacheLang, r);
    }
    if (import.meta.env.DEV && _t0) console.log(`[Perf] API response${cachedHandoff ? ' (cached)' : ''}: ${(performance.now() - _t0).toFixed(0)}ms`);
    setStreamDetail(null);
    setSimStep(4);
  }
  setResult(r);
  const entry = buildHandoffLogEntry(r, {
    projectId: selectedProjectId,
    sourceReference: buildSourceReference(text, files, combined.length),
  });
  addLog(entry);
  if (!selectedProjectId && projects.length > 0) {
    triggerClassification(entry);
  }

  return { lastEntryId: entry.id, savedHandoffLog: entry, todoCount: 0 };
}

/** Execute worklog-only transform */
export async function executeWorklog(ctx: TransformContext): Promise<ActionResult> {
  const { combined, apiKey, willChunk, selectedProjectId, text, files, buildSourceReference, initSingleTransform, createStreamCallback, setResult, setProgress, setStreamDetail, setSimStep, projects, engineRef, triggerClassification, provider, cacheLang } = ctx;
  let todoCount = 0;

  let r: TransformResult;
  if (willChunk) {
    const engine = new ChunkEngine();
    engineRef.current = engine;
    r = await engine.process(combined, apiKey, (p) => setProgress(p));
    engineRef.current = null;
  } else {
    initSingleTransform();
    const cachedWorklog = getCachedResult<TransformResult>(combined, 'worklog', provider, cacheLang);
    if (cachedWorklog) {
      r = cachedWorklog;
    } else {
      r = await transformText(combined, createStreamCallback());
      setCachedResult(combined, 'worklog', provider, cacheLang, r);
    }
    setStreamDetail(null);
    setSimStep(4);
  }

  setResult(r);
  const entry: LogEntry = {
    id: crypto.randomUUID(), createdAt: new Date().toISOString(),
    importedAt: new Date().toISOString(),
    title: r.title,
    projectId: selectedProjectId,
    sourceReference: buildSourceReference(text, files, combined.length),
    outputMode: 'worklog',
    today: r.today, decisions: r.decisions, todo: r.todo,
    relatedProjects: r.relatedProjects, tags: r.tags,
  };
  addLog(entry);
  if (getFeatureEnabled('todo_extract', true)) { addTodosFromLog(entry.id, r.todo); todoCount = r.todo.length; }
  if (!selectedProjectId && projects.length > 0) {
    triggerClassification(entry);
  }

  return { lastEntryId: entry.id, savedHandoffLog: null, todoCount };
}

/** Execute handoff+todo combined transform */
export async function executeHandoffTodo(ctx: TransformContext): Promise<ActionResult> {
  const { combined, selectedProjectId, text, files, buildSourceReference, initSingleTransform, createStreamCallback, setResult, setStreamDetail, setSimStep, projects, triggerClassification, provider, cacheLang } = ctx;
  let todoCount = 0;

  initSingleTransform();
  let htResult: HandoffTodoResult;
  const cachedHT = getCachedResult<HandoffTodoResult>(combined, 'handoff_todo', provider, cacheLang);
  if (cachedHT) {
    htResult = cachedHT;
  } else {
    htResult = await transformHandoffTodo(combined, createStreamCallback());
    setCachedResult(combined, 'handoff_todo', provider, cacheLang, htResult);
  }
  setStreamDetail(null);
  setSimStep(4);

  const r = htResult.handoff;
  setResult(r);
  const entry = buildHandoffLogEntry(r, {
    projectId: selectedProjectId,
    sourceReference: buildSourceReference(text, files, combined.length),
  });
  entry.todo = htResult.todos.map(td => td.title);
  addLog(entry);
  if (getFeatureEnabled('todo_extract', true)) { addTodosFromLogWithMeta(entry.id, htResult.todos); todoCount = htResult.todos.length; }
  if (!selectedProjectId && projects.length > 0) {
    triggerClassification(entry);
  }

  return { lastEntryId: entry.id, savedHandoffLog: entry, todoCount };
}

/** Execute todo-only transform */
export async function executeTodoOnly(ctx: TransformContext): Promise<ActionResult> {
  const { combined, lang, selectedProjectId, text, files, buildSourceReference, initSingleTransform, createStreamCallback, setResult, setOutputMode, setStreamDetail, setSimStep, projects, triggerClassification, provider, cacheLang } = ctx;
  let todoCount = 0;

  initSingleTransform();
  let todoResult: TodoOnlyResult;
  const cachedTodo = getCachedResult<TodoOnlyResult>(combined, 'todo_only', provider, cacheLang);
  if (cachedTodo) {
    todoResult = cachedTodo;
  } else {
    todoResult = await transformTodoOnly(combined, createStreamCallback());
    setCachedResult(combined, 'todo_only', provider, cacheLang, todoResult);
  }
  setStreamDetail(null);
  setSimStep(4);

  const entry: LogEntry = {
    id: crypto.randomUUID(), createdAt: new Date().toISOString(),
    importedAt: new Date().toISOString(),
    title: t('todoExtractionTitle', lang),
    projectId: selectedProjectId,
    sourceReference: buildSourceReference(text, files, combined.length),
    outputMode: 'worklog',
    today: [], decisions: [], todo: todoResult.todos.map(t => t.title),
    relatedProjects: [], tags: [],
  };
  addLog(entry);
  if (getFeatureEnabled('todo_extract', true)) { addTodosFromLogWithMeta(entry.id, todoResult.todos); todoCount = todoResult.todos.length; }
  setResult({ title: entry.title, today: [], decisions: [], todo: todoResult.todos.map(t => t.title), relatedProjects: [], tags: [] });
  setOutputMode('worklog');
  if (!selectedProjectId && projects.length > 0) {
    triggerClassification(entry);
  }

  return { lastEntryId: entry.id, savedHandoffLog: null, todoCount };
}

// ---------------------------------------------------------------------------
// Per-action strategy functions (demo mode)
// ---------------------------------------------------------------------------

/** Execute "both" transform in demo mode */
export async function executeDemoBoth(ctx: TransformContext): Promise<ActionResult> {
  const { lang, selectedProjectId, text, files, combined, buildSourceReference, setResult, setOutputMode, setSimStep } = ctx;
  let todoCount = 0;

  const { demoTransformBoth } = await loadDemoData();
  const bothResult = await demoTransformBoth(lang);
  setSimStep(4);
  const handoffEntry = buildHandoffLogEntry(bothResult.handoff, { projectId: selectedProjectId, sourceReference: buildSourceReference(text, files, combined.length) });
  addLog(handoffEntry);
  const savedHandoffLog = handoffEntry;
  const r = bothResult.worklog;
  setResult(r); setOutputMode('worklog');
  const worklogEntry: LogEntry = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), importedAt: new Date().toISOString(), title: r.title, projectId: selectedProjectId, sourceReference: buildSourceReference(text, files, combined.length), outputMode: 'worklog', today: r.today, decisions: r.decisions, todo: r.todo, relatedProjects: r.relatedProjects, tags: r.tags };
  addLog(worklogEntry); if (getFeatureEnabled('todo_extract', true)) { addTodosFromLog(worklogEntry.id, r.todo); todoCount = r.todo.length; }

  return { lastEntryId: worklogEntry.id, savedHandoffLog, todoCount };
}

/** Execute handoff+todo transform in demo mode */
export async function executeDemoHandoffTodo(ctx: TransformContext): Promise<ActionResult> {
  const { lang, selectedProjectId, text, files, combined, buildSourceReference, setResult, setOutputMode, setSimStep } = ctx;
  let todoCount = 0;

  const { demoTransformHandoffTodo } = await loadDemoData();
  const htr = await demoTransformHandoffTodo(lang);
  setSimStep(4);
  const handoffEntry = buildHandoffLogEntry(htr.handoff, { projectId: selectedProjectId, sourceReference: buildSourceReference(text, files, combined.length) });
  addLog(handoffEntry);
  const savedHandoffLog = handoffEntry;
  setResult(htr.handoff); setOutputMode('handoff');
  if (htr.todos.length > 0 && getFeatureEnabled('todo_extract', true)) {
    addTodosFromLogWithMeta(handoffEntry.id, htr.todos.map(td => ({ title: td.title, priority: td.priority, dueDate: td.dueDate })));
    todoCount = htr.todos.length;
  }

  return { lastEntryId: handoffEntry.id, savedHandoffLog, todoCount };
}

/** Execute handoff-only transform in demo mode */
export async function executeDemoHandoff(ctx: TransformContext): Promise<ActionResult> {
  const { lang, selectedProjectId, text, files, combined, buildSourceReference, setResult, setOutputMode, setSimStep } = ctx;

  const { demoTransformHandoff } = await loadDemoData();
  const r = await demoTransformHandoff(lang);
  setSimStep(4);
  const handoffEntry = buildHandoffLogEntry(r, { projectId: selectedProjectId, sourceReference: buildSourceReference(text, files, combined.length) });
  addLog(handoffEntry);
  setResult(r); setOutputMode('handoff');

  return { lastEntryId: handoffEntry.id, savedHandoffLog: handoffEntry, todoCount: 0 };
}

/** Execute todo-only transform in demo mode */
export async function executeDemoTodoOnly(ctx: TransformContext): Promise<ActionResult> {
  const { lang, setSimStep } = ctx;

  const { demoTransformTodoOnly } = await loadDemoData();
  const r = await demoTransformTodoOnly(lang);
  setSimStep(4);
  const todoCount = r.todos.length > 0 ? r.todos.length : 0;

  return { lastEntryId: null, savedHandoffLog: null, todoCount };
}

/** Execute worklog-only transform in demo mode */
export async function executeDemoWorklog(ctx: TransformContext): Promise<ActionResult> {
  const { lang, selectedProjectId, text, files, combined, buildSourceReference, setResult, setOutputMode, setSimStep } = ctx;
  let todoCount = 0;

  const { demoTransformText } = await loadDemoData();
  const r = await demoTransformText(lang);
  setSimStep(4);
  setResult(r); setOutputMode('worklog');
  const worklogEntry: LogEntry = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), importedAt: new Date().toISOString(), title: r.title, projectId: selectedProjectId, sourceReference: buildSourceReference(text, files, combined.length), outputMode: 'worklog', today: r.today, decisions: r.decisions, todo: r.todo, relatedProjects: r.relatedProjects, tags: r.tags };
  addLog(worklogEntry); if (getFeatureEnabled('todo_extract', true)) { addTodosFromLog(worklogEntry.id, r.todo); todoCount = r.todo.length; }

  return { lastEntryId: worklogEntry.id, savedHandoffLog: null, todoCount };
}
