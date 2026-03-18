import { useState, useRef, useCallback } from 'react';
import { transformText, transformHandoff, transformBoth, transformTodoOnly, transformHandoffTodo, buildHandoffLogEntry } from '../transform';
import type { TransformBothOptions, HandoffTodoResult, TodoOnlyResult } from '../transform';
import { ChunkEngine } from '../chunkEngine';
import type { EngineProgress } from '../chunkEngine';
import { addLog, getLog, addTodosFromLog, addTodosFromLogWithMeta, loadLogs, updateLog, getApiKey, getFeatureEnabled, getMasterNote, isDemoMode, safeGetItem, safeSetItem, getLang } from '../storage';
import { shouldUseBuiltinApi, getActiveProvider } from '../provider';
const loadDemoData = () => import('../demoData');
import { classifyLog, saveCorrection } from '../classify';
import { playSuccess } from '../sounds';
import type { TransformResult, HandoffResult, BothResult, LogEntry, OutputMode, SourceReference, Project } from '../types';
import { t, tf } from '../i18n';
import type { Lang } from '../i18n';
import { formatHandoffMarkdown, formatFullAiContext } from '../formatHandoff';
import { generateProjectContext } from '../generateProjectContext';
import { recordMetric } from '../aiMetrics';
import { isStaleMasterNote } from '../utils/staleness';
import { canTransform, incrementDailyUsage, DAILY_LIMIT_FREE } from '../utils/trialManager';
import { AIError } from '../errors';

export type TransformAction = 'both' | 'handoff' | 'worklog' | 'todo_only' | 'worklog_handoff' | 'handoff_todo';

// ---------------------------------------------------------------------------
// AI result cache (AI #20) — avoids redundant API calls for identical inputs.
// Key: hash of (first 1000 chars + total length + action). Max 20 entries (LRU eviction).
// ---------------------------------------------------------------------------

const AI_CACHE_MAX = 20;
const aiResultCache = new Map<string, unknown>();

function hashCacheKey(text: string, action: string): string {
  const prefix = text.slice(0, 1000);
  const provider = getActiveProvider() || 'default';
  const lang = getLang() || 'auto';
  return `${action}:${provider}:${lang}:${text.length}:${prefix}`;
}

function getCachedResult<T>(text: string, action: string): T | undefined {
  const key = hashCacheKey(text, action);
  const cached = aiResultCache.get(key);
  if (cached !== undefined) {
    // Move to end for LRU behavior
    aiResultCache.delete(key);
    aiResultCache.set(key, cached);
    return cached as T;
  }
  return undefined;
}

function setCachedResult(text: string, action: string, result: unknown): void {
  const key = hashCacheKey(text, action);
  // Evict oldest entry if at capacity
  if (aiResultCache.size >= AI_CACHE_MAX && !aiResultCache.has(key)) {
    const oldest = aiResultCache.keys().next().value;
    if (oldest !== undefined) aiResultCache.delete(oldest);
  }
  aiResultCache.set(key, result);
}

// ---------------------------------------------------------------------------
// Shared context passed to per-action strategy functions
// ---------------------------------------------------------------------------

type StreamCallback = (chunk: string, accumulated: string) => void;

interface TransformContext {
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
}

interface ActionResult {
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

async function executeBoth(ctx: TransformContext): Promise<ActionResult> {
  const { combined, apiKey, willChunk, selectedProjectId, text, files, buildSourceReference, initSingleTransform, createStreamCallback, setProgress, setResult, setOutputMode, setStreamDetail, setSimStep, projects, engineRef, _t0 } = ctx;
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
    const cachedBoth = getCachedResult<BothResult>(combined, 'both');
    if (cachedBoth) {
      bothResult = cachedBoth;
    } else {
      bothResult = await transformBoth(combined, bothOpts);
      setCachedResult(combined, 'both', bothResult);
    }
    if (import.meta.env.DEV && _t0) console.log(`[Perf] API response${cachedBoth ? ' (cached)' : ''}: ${(performance.now() - _t0).toFixed(0)}ms`);
    setStreamDetail(null);
    setSimStep(4);
  }

  // Save handoff entry
  const handoffEntry = buildHandoffLogEntry(bothResult.handoff, {
    projectId: selectedProjectId,
    sourceReference: buildSourceReference(text, files, combined.length),
  });
  addLog(handoffEntry);
  const savedHandoffLog = handoffEntry;

  // Save worklog entry
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

  // Use inline classification from the combined response (no extra API call)
  if (!selectedProjectId && projects.length > 0 && bothResult.classification?.projectId) {
    const cl = bothResult.classification;
    const matchedProject = projects.find(p => p.id === cl.projectId);
    if (matchedProject && cl.confidence > 0.7) {
      updateLog(handoffEntry.id, { projectId: cl.projectId ?? undefined, classificationConfidence: cl.confidence });
      updateLog(worklogEntry.id, { projectId: cl.projectId ?? undefined, classificationConfidence: cl.confidence });
    } else if (matchedProject && cl.confidence > 0) {
      // Suggestion is handled by the caller via returned savedHandoffLog
      updateLog(worklogEntry.id, { suggestedProjectId: cl.projectId ?? undefined, classificationConfidence: cl.confidence });
    }
  }

  return {
    lastEntryId: worklogEntry.id,
    savedHandoffLog,
    todoCount,
    // Expose extra data needed by the caller for suggestion handling
    _handoffEntry: handoffEntry,
    _worklogEntry: worklogEntry,
    _bothResult: bothResult,
  };
}

async function executeHandoff(ctx: TransformContext): Promise<ActionResult> {
  const { combined, apiKey, willChunk, selectedProjectId, text, files, buildSourceReference, initSingleTransform, createStreamCallback, setResult, setProgress, setStreamDetail, setSimStep, projects, engineRef, _t0, triggerClassification } = ctx;

  let r: HandoffResult;
  if (willChunk) {
    const engine = new ChunkEngine();
    engineRef.current = engine;
    r = await engine.processHandoff(combined, apiKey, (p) => setProgress(p));
    if (import.meta.env.DEV && _t0) console.log(`[Perf] API response (chunked): ${(performance.now() - _t0).toFixed(0)}ms`);
    engineRef.current = null;
  } else {
    initSingleTransform();
    const cachedHandoff = getCachedResult<HandoffResult>(combined, 'handoff');
    if (cachedHandoff) {
      r = cachedHandoff;
    } else {
      r = await transformHandoff(combined, createStreamCallback());
      setCachedResult(combined, 'handoff', r);
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

async function executeWorklog(ctx: TransformContext): Promise<ActionResult> {
  const { combined, apiKey, willChunk, selectedProjectId, text, files, buildSourceReference, initSingleTransform, createStreamCallback, setResult, setProgress, setStreamDetail, setSimStep, projects, engineRef, triggerClassification } = ctx;
  let todoCount = 0;

  let r: TransformResult;
  if (willChunk) {
    const engine = new ChunkEngine();
    engineRef.current = engine;
    r = await engine.process(combined, apiKey, (p) => setProgress(p));
    engineRef.current = null;
  } else {
    initSingleTransform();
    const cachedWorklog = getCachedResult<TransformResult>(combined, 'worklog');
    if (cachedWorklog) {
      r = cachedWorklog;
    } else {
      r = await transformText(combined, createStreamCallback());
      setCachedResult(combined, 'worklog', r);
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

async function executeHandoffTodo(ctx: TransformContext): Promise<ActionResult> {
  const { combined, selectedProjectId, text, files, buildSourceReference, initSingleTransform, createStreamCallback, setResult, setStreamDetail, setSimStep, projects, triggerClassification } = ctx;
  let todoCount = 0;

  initSingleTransform();
  let htResult: HandoffTodoResult;
  const cachedHT = getCachedResult<HandoffTodoResult>(combined, 'handoff_todo');
  if (cachedHT) {
    htResult = cachedHT;
  } else {
    htResult = await transformHandoffTodo(combined, createStreamCallback());
    setCachedResult(combined, 'handoff_todo', htResult);
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

async function executeTodoOnly(ctx: TransformContext): Promise<ActionResult> {
  const { combined, lang, selectedProjectId, text, files, buildSourceReference, initSingleTransform, createStreamCallback, setResult, setOutputMode, setStreamDetail, setSimStep, projects, triggerClassification } = ctx;
  let todoCount = 0;

  initSingleTransform();
  let todoResult: TodoOnlyResult;
  const cachedTodo = getCachedResult<TodoOnlyResult>(combined, 'todo_only');
  if (cachedTodo) {
    todoResult = cachedTodo;
  } else {
    todoResult = await transformTodoOnly(combined, createStreamCallback());
    setCachedResult(combined, 'todo_only', todoResult);
  }
  setStreamDetail(null);
  setSimStep(4);

  // Save as a minimal log entry (handoff body empty, worklog fields empty)
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

async function executeDemoBoth(ctx: TransformContext): Promise<ActionResult> {
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

async function executeDemoHandoffTodo(ctx: TransformContext): Promise<ActionResult> {
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

async function executeDemoHandoff(ctx: TransformContext): Promise<ActionResult> {
  const { lang, selectedProjectId, text, files, combined, buildSourceReference, setResult, setOutputMode, setSimStep } = ctx;

  const { demoTransformHandoff } = await loadDemoData();
  const r = await demoTransformHandoff(lang);
  setSimStep(4);
  const handoffEntry = buildHandoffLogEntry(r, { projectId: selectedProjectId, sourceReference: buildSourceReference(text, files, combined.length) });
  addLog(handoffEntry);
  setResult(r); setOutputMode('handoff');

  return { lastEntryId: handoffEntry.id, savedHandoffLog: handoffEntry, todoCount: 0 };
}

async function executeDemoTodoOnly(ctx: TransformContext): Promise<ActionResult> {
  const { lang, setSimStep } = ctx;

  const { demoTransformTodoOnly } = await loadDemoData();
  const r = await demoTransformTodoOnly(lang);
  setSimStep(4);
  const todoCount = r.todos.length > 0 ? r.todos.length : 0;

  return { lastEntryId: null, savedHandoffLog: null, todoCount };
}

async function executeDemoWorklog(ctx: TransformContext): Promise<ActionResult> {
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseTransformParams {
  lang: Lang;
  selectedProjectId: string | undefined;
  projects: Project[];
  combined: string;
  text: string;
  files: { name: string; content: string; lastModified?: number }[];
  willChunk: boolean;
  onSaved: (id: string) => void;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
  buildSourceReference: (pastedText: string, files: { name: string; content: string; lastModified?: number }[], charCount: number) => SourceReference;
}

export interface SavedResult {
  log: LogEntry;
  markdown: string;
  fullContext: string | null;
}

export function useTransform(params: UseTransformParams) {
  const { lang, selectedProjectId, projects, combined, text, files, willChunk, onSaved, showToast, buildSourceReference } = params;

  const [result, setResult] = useState<TransformResult | HandoffResult | null>(null);
  const [savedResult, setSavedResult] = useState<SavedResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<EngineProgress | null>(null);
  const [simStep, setSimStep] = useState(0);
  const [streamDetail, setStreamDetail] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedHandoffId, setSavedHandoffId] = useState<string | null>(null);
  const [outputMode, setOutputMode] = useState<OutputMode>('handoff');
  const [transformAction, setTransformAction] = useState<TransformAction>(() => {
    const v = safeGetItem('threadlog_transform_action');
    return (['handoff', 'handoff_todo', 'todo_only'].includes(v || '') ? v as TransformAction : 'handoff_todo');
  });
  const [wasFirstTransform, setWasFirstTransform] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [suggestion, setSuggestion] = useState<{ logId: string; projectId: string; projectName: string; confidence: number } | null>(null);
  const [postSavePickerOpen, setPostSavePickerOpen] = useState(false);

  const engineRef = useRef<ChunkEngine | null>(null);

  const triggerClassification = useCallback(async (entry: LogEntry) => {
    if (!getFeatureEnabled('auto_classify', true)) return;
    setClassifying(true);
    setSuggestion(null);
    try {
      const result = await classifyLog(entry, projects);
      if (!result.projectId) return;
      const project = projects.find((p) => p.id === result.projectId);
      if (!project) return;

      if (result.confidence > 0) {
        // Always suggest — never auto-assign
        setSuggestion({ logId: entry.id, projectId: result.projectId, projectName: project.name, confidence: result.confidence });
        updateLog(entry.id, { suggestedProjectId: result.projectId, classificationConfidence: result.confidence });
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[Classify] Error:', err);
    } finally {
      setClassifying(false);
    }
  }, [projects]);

  const runTransform = useCallback(async (action: TransformAction) => {
    if (loading) return;
    if (!combined.trim()) { setError(t('errorEmptyInput', lang)); return; }

    // --- Trial / daily limit check ---
    const trialCheck = canTransform();
    if (!trialCheck.allowed) {
      const used = DAILY_LIMIT_FREE;
      setError(tf('dailyLimitReached', lang, used, DAILY_LIMIT_FREE));
      return;
    }

    const demo = isDemoMode();
    if (!demo && !navigator.onLine) { setError(t('offlineAiUnavailable', lang)); return; }

    const apiKey = getApiKey();
    if (!demo && !apiKey && !shouldUseBuiltinApi()) { setError(t('errorApiKeyMissing', lang)); return; }

    // --- Shared streaming helpers ---
    function initSingleTransform() {
      setSimStep(0);
      setTimeout(() => setSimStep(1), 800);
    }

    function createStreamCallback(): { onStream?: (chunk: string, accumulated: string) => void } {
      const streamingEnabled = getFeatureEnabled('streaming', true);
      let charCount = 0;
      return {
        onStream: streamingEnabled ? (_chunk: string, accumulated: string) => {
          if (charCount === 0) setSimStep(2);
          charCount = accumulated.length;
          setStreamDetail(`${t('streamReceiving', lang)}... ${charCount.toLocaleString()} chars`);
        } : undefined,
      };
    }

    // Persist last used action
    setTransformAction(action);
    safeSetItem('threadlog_transform_action', action);

    setError(''); setLoading(true); setResult(null); setSavedId(null); setSavedHandoffId(null); setSavedResult(null); setProgress(null); setSimStep(0); setStreamDetail(null);

    const isFirstTransform = loadLogs().length === 0;
    const _t0 = performance.now();

    // Normalize worklog_handoff → both internally
    const effectiveAction = action === 'worklog_handoff' ? 'both' as const : action;
    const doHandoff = effectiveAction === 'both' || effectiveAction === 'handoff';
    const doWorklog = effectiveAction === 'both' || effectiveAction === 'worklog';
    const isBoth = doHandoff && doWorklog;
    const isTodoOnly = effectiveAction === 'todo_only';
    const isHandoffTodo = effectiveAction === 'handoff_todo';
    // Set outputMode for progress display
    setOutputMode((doHandoff || isHandoffTodo) ? 'handoff' : 'worklog');

    // Build shared context for strategy functions
    const ctx: TransformContext = {
      combined, apiKey, willChunk, selectedProjectId, lang, text, files,
      buildSourceReference, initSingleTransform, createStreamCallback,
      setProgress, setResult, setOutputMode, setStreamDetail, setSimStep,
      projects, engineRef, _t0, triggerClassification,
    };

    try {
      let actionResult: ActionResult;

      // --- Demo mode — return pre-generated results (lazy-loaded) ---
      if (demo) {
        setSimStep(1);
        if (isBoth) {
          actionResult = await executeDemoBoth(ctx);
          onSaved(actionResult.savedHandoffLog!.id);
          setSavedHandoffId(actionResult.savedHandoffLog!.id);
          onSaved(actionResult.lastEntryId!);
        } else if (isHandoffTodo) {
          actionResult = await executeDemoHandoffTodo(ctx);
          onSaved(actionResult.savedHandoffLog!.id);
          setSavedHandoffId(actionResult.savedHandoffLog!.id);
        } else if (doHandoff) {
          actionResult = await executeDemoHandoff(ctx);
          onSaved(actionResult.lastEntryId!);
        } else if (isTodoOnly) {
          actionResult = await executeDemoTodoOnly(ctx);
        } else {
          actionResult = await executeDemoWorklog(ctx);
          onSaved(actionResult.lastEntryId!);
        }

        // Post-save: generate savedResult for markdown/context buttons
        if (actionResult.savedHandoffLog) {
          const md = formatHandoffMarkdown(actionResult.savedHandoffLog);
          setSavedResult({ log: actionResult.savedHandoffLog, markdown: md, fullContext: null });
          setWasFirstTransform(isFirstTransform);
        }
        setSavedId(actionResult.lastEntryId);
        if (actionResult.todoCount > 0) showToast?.(tf('toastTodosExtracted', lang, actionResult.todoCount), 'success');
        setLoading(false);
        return;
      }

      // --- Real API path: dispatch to per-action strategy ---
      if (isBoth) {
        actionResult = await executeBoth(ctx);
        onSaved(actionResult.savedHandoffLog!.id);
        setSavedHandoffId(actionResult.savedHandoffLog!.id);
        onSaved(actionResult.lastEntryId!);

        // Handle inline classification suggestion from combined response
        const extra = actionResult as ActionResult & { _bothResult?: BothResult; _worklogEntry?: LogEntry };
        if (!selectedProjectId && projects.length > 0 && extra._bothResult?.classification?.projectId) {
          const cl = extra._bothResult.classification;
          const matchedProject = projects.find(p => p.id === cl.projectId);
          if (matchedProject && cl.confidence > 0 && cl.confidence <= 0.7) {
            setSuggestion({ logId: actionResult.lastEntryId!, projectId: cl.projectId!, projectName: matchedProject.name, confidence: cl.confidence });
          }
        }
      } else if (doHandoff && !isBoth) {
        actionResult = await executeHandoff(ctx);
        onSaved(actionResult.lastEntryId!);
      } else if (doWorklog && !isBoth) {
        actionResult = await executeWorklog(ctx);
        onSaved(actionResult.lastEntryId!);
      } else if (isHandoffTodo) {
        actionResult = await executeHandoffTodo(ctx);
        onSaved(actionResult.lastEntryId!);
      } else if (isTodoOnly) {
        actionResult = await executeTodoOnly(ctx);
        onSaved(actionResult.lastEntryId!);
      } else {
        // Fallback — should not happen
        actionResult = { lastEntryId: null, savedHandoffLog: null, todoCount: 0 };
      }

      if (actionResult.lastEntryId) setSavedId(actionResult.lastEntryId);

      // Track daily usage for trial/free limits
      incrementDailyUsage();

      // Record AI quality metric
      const _duration = performance.now() - _t0;
      const _cachedHit = (effectiveAction === 'both' && !!getCachedResult<unknown>(combined, 'both'))
        || (effectiveAction === 'handoff' && !!getCachedResult<unknown>(combined, 'handoff'))
        || (effectiveAction === 'worklog' && !!getCachedResult<unknown>(combined, 'worklog'))
        || (effectiveAction === 'todo_only' && !!getCachedResult<unknown>(combined, 'todo_only'))
        || (effectiveAction === 'handoff_todo' && !!getCachedResult<unknown>(combined, 'handoff_todo'));
      recordMetric({
        timestamp: Date.now(),
        action: effectiveAction,
        inputLength: combined.length,
        outputValid: !!actionResult.lastEntryId,
        decisionsCount: (actionResult.savedHandoffLog?.decisions?.length ?? 0),
        todosCount: actionResult.todoCount,
        durationMs: Math.round(_duration),
        cached: _cachedHit,
      });

      // Show preview panel for handoff/both modes; toast for worklog-only/todo-only
      if (actionResult.savedHandoffLog) {
        const handoffMd = formatHandoffMarkdown(actionResult.savedHandoffLog);
        let fullContextMd: string | null = null;
        if (actionResult.savedHandoffLog.projectId) {
          const project = projects.find(p => p.id === actionResult.savedHandoffLog!.projectId);
          const masterNote = getMasterNote(actionResult.savedHandoffLog.projectId);
          if (masterNote && project) {
            const allLogs = loadLogs();
            const ctxData = generateProjectContext(masterNote, allLogs, project.name);
            fullContextMd = formatFullAiContext(ctxData, actionResult.savedHandoffLog);
          }
        }
        setSavedResult({ log: actionResult.savedHandoffLog, markdown: handoffMd, fullContext: fullContextMd });
        setWasFirstTransform(isFirstTransform);
        // Still show todo count toast for handoff_todo mode
        if (isHandoffTodo && actionResult.todoCount > 0) {
          const todoMsg = tf('toastTodosExtracted', lang, actionResult.todoCount);
          showToast?.(isFirstTransform ? `🎉 ${todoMsg}` : todoMsg, 'success');
        }
      } else {
        // Worklog-only or todo-only — just toast
        const lines: string[] = [];
        if (isTodoOnly) {
          if (actionResult.todoCount > 0) {
            lines.push(tf('toastTodosExtracted', lang, actionResult.todoCount));
          } else {
            lines.push(t('toastNoTodosFound', lang));
          }
        }
        if (doWorklog) {
          lines.push(t('toastLogSaved', lang));
          if (actionResult.todoCount > 0) {
            lines.push(tf('toastTodosAdded', lang, actionResult.todoCount));
          }
        }
        const toastMsg = lines.join('\n');
        showToast?.(isFirstTransform ? `🎉 ${toastMsg}` : toastMsg, 'success');
        playSuccess();
      }
    } catch (err) {
      // Handle structured AIError instances (thrown by transform.ts)
      if (err instanceof AIError) {
        const codeToMessage: Record<string, string> = {
          API_KEY_MISSING: t('errorApiKey', lang),
          RATE_LIMIT: shouldUseBuiltinApi() ? t('errorRateLimitBuiltin', lang) : t('errorRateLimit', lang),
          OVERLOADED: t('errorServiceDown', lang),
          TRUNCATED: t('errorTruncated', lang),
          PARSE_ERROR: t('errorParseResponse', lang),
          CANCELLED: '',
          TOO_LONG: t('errorTooLong', lang),
          NETWORK: t('errorNetwork', lang),
          EMPTY_RESPONSE: t('errorEmptyResponse', lang),
          TIMEOUT: t('errorTimeout', lang),
          GENERIC: t('errorGeneric', lang),
        };
        setError(codeToMessage[err.code] ?? t('errorGeneric', lang));
      } else {
        // Fallback: legacy string-tag matching for errors from provider.ts / chunkEngine.ts
        const raw = err instanceof Error ? err.message : 'Transform failed.';
        if (raw.includes('[API Key]')) {
          setError(t('errorApiKey', lang));
        } else if (raw.includes('[Rate Limit]')) {
          setError(shouldUseBuiltinApi() ? t('errorRateLimitBuiltin', lang) : t('errorRateLimit', lang));
        } else if (raw.includes('[Overloaded]')) {
          setError(t('errorServiceDown', lang));
        } else if (raw.includes('[Truncated]')) {
          setError(t('errorTruncated', lang));
        } else if (raw.includes('[Parse Error]') || raw.includes('[Non-JSON Response]')) {
          setError(t('errorParseResponse', lang));
        } else if (raw.includes('[Cancelled]')) {
          setError('');
        } else if (raw.includes('[Too Long]')) {
          setError(t('errorTooLong', lang));
        } else if (raw.includes('[Network]') || raw.includes('Failed to fetch') || raw.includes('NetworkError') || (err instanceof TypeError && raw.includes('fetch'))) {
          setError(t('errorNetwork', lang));
        } else if (raw.includes('[AI Response]')) {
          setError(t('errorEmptyResponse', lang));
        } else if (err instanceof DOMException && err.name === 'AbortError') {
          setError(t('errorTimeout', lang));
        } else if (raw.includes('[API Error]')) {
          setError(t('errorApiGeneric', lang));
        } else if (err instanceof TypeError) {
          setError(t('errorNetwork', lang));
        } else {
          setError(t('errorGeneric', lang));
        }
      }
    } finally {
      if (import.meta.env.DEV && _t0) {
        const _t1 = performance.now();
        console.log(`[Perf] total: ${(_t1 - _t0).toFixed(0)}ms`);
        // Render timing — fires after React commit
        requestAnimationFrame(() => {
          const _t2 = performance.now();
          console.log(`[Perf] render: ${(_t2 - _t1).toFixed(0)}ms`);
        });
      }
      setLoading(false); setProgress(null); engineRef.current = null;
    }
  }, [loading, combined, lang, selectedProjectId, projects, willChunk, text, files, onSaved, showToast, buildSourceReference, triggerClassification]);

  const handlePauseResume = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.isPaused) {
      engine.resume();
    } else {
      engine.pause();
    }
  }, []);

  const handleCancel = useCallback(() => {
    engineRef.current?.cancel();
  }, []);

  const handleAcceptSuggestion = useCallback(() => {
    if (!suggestion) return;
    const { logId, projectId, projectName } = suggestion;
    updateLog(logId, { projectId, suggestedProjectId: undefined });
    const log = getLog(logId);
    if (log) saveCorrection(log, projectId);
    // If both mode, also assign the worklog
    if (savedHandoffId && savedId && logId === savedHandoffId) {
      updateLog(savedId, { projectId });
    }
    setSuggestion(null);
    onSaved(logId);
    // Show summary update prompt
    if (getFeatureEnabled('project_summary', true)) {
      const mn = getMasterNote(projectId);
      const isStale = mn && isStaleMasterNote(mn.updatedAt);
      const msg = tf('addedToProject', lang, projectName)
        + '\n' + (isStale ? t('updateSummaryStale', lang) : t('updateSummaryPrompt', lang));
      showToast?.(msg, 'success');
    } else {
      showToast?.(tf('addedToProject', lang, projectName), 'success');
    }
  }, [suggestion, savedHandoffId, savedId, onSaved, lang, showToast]);

  const handleDismissSuggestion = useCallback(() => {
    setSuggestion(null);
  }, []);

  const handlePostSaveAssign = useCallback((projectId: string) => {
    if (!savedId && !savedHandoffId) return;
    const logId = savedHandoffId || savedId!;
    updateLog(logId, { projectId });
    const log = getLog(logId);
    if (log) saveCorrection(log, projectId);
    // If both mode, also assign the worklog
    if (savedHandoffId && savedId) {
      updateLog(savedId, { projectId });
    }
    const project = projects.find((p) => p.id === projectId);
    setPostSavePickerOpen(false);
    setSuggestion(null);
    onSaved(logId);
    // Show summary update prompt
    if (project) {
      if (getFeatureEnabled('project_summary', true)) {
        const mn = getMasterNote(projectId);
        const isStale = mn && isStaleMasterNote(mn.updatedAt);
        const msg = tf('addedToProject', lang, project.name)
          + '\n' + (isStale ? t('updateSummaryStale', lang) : t('updateSummaryPrompt', lang));
        showToast?.(msg, 'success');
      } else {
        showToast?.(tf('addedToProject', lang, project.name), 'success');
      }
    }
  }, [savedId, savedHandoffId, projects, onSaved, lang, showToast]);

  const resetTransformState = useCallback(() => {
    setSavedResult(null);
    setResult(null);
    setSavedId(null);
    setSavedHandoffId(null);
    setError('');
    setSuggestion(null);
    setPostSavePickerOpen(false);
  }, []);

  return {
    result,
    setResult,
    savedResult,
    setSavedResult,
    error,
    setError,
    loading,
    progress,
    simStep,
    streamDetail,
    savedId,
    savedHandoffId,
    outputMode,
    transformAction,
    setTransformAction,
    wasFirstTransform,
    classifying,
    suggestion,
    postSavePickerOpen,
    setPostSavePickerOpen,
    engineRef,
    runTransform,
    handlePauseResume,
    handleCancel,
    handleAcceptSuggestion,
    handleDismissSuggestion,
    handlePostSaveAssign,
    resetTransformState,
  };
}
