import { useState, useRef, useCallback } from 'react';
import { transformText, transformHandoff, transformBoth, transformTodoOnly, transformHandoffTodo, buildHandoffLogEntry } from '../transform';
import type { TransformBothOptions, HandoffTodoResult, TodoOnlyResult } from '../transform';
import { ChunkEngine } from '../chunkEngine';
import type { EngineProgress } from '../chunkEngine';
import { addLog, getLog, addTodosFromLog, addTodosFromLogWithMeta, loadLogs, updateLog, getApiKey, getFeatureEnabled, getMasterNote, isDemoMode, safeGetItem, safeSetItem } from '../storage';
import { shouldUseBuiltinApi } from '../provider';
const loadDemoData = () => import('../demoData');
import { classifyLog, saveCorrection } from '../classify';
import { playSuccess } from '../sounds';
import type { TransformResult, HandoffResult, BothResult, LogEntry, OutputMode, SourceReference, Project } from '../types';
import { t, tf } from '../i18n';
import type { Lang } from '../i18n';
import { formatHandoffMarkdown, formatFullAiContext } from '../formatHandoff';
import { generateProjectContext } from '../generateProjectContext';

export type TransformAction = 'both' | 'handoff' | 'worklog' | 'todo_only' | 'worklog_handoff' | 'handoff_todo';

// ---------------------------------------------------------------------------
// AI result cache (AI #20) — avoids redundant API calls for identical inputs.
// Key: hash of (first 1000 chars + total length + action). Max 20 entries (LRU eviction).
// ---------------------------------------------------------------------------

const AI_CACHE_MAX = 20;
const aiResultCache = new Map<string, unknown>();

function hashCacheKey(text: string, action: string): string {
  const prefix = text.slice(0, 1000);
  return `${action}:${text.length}:${prefix}`;
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

    const demo = isDemoMode();
    if (!demo && !navigator.onLine) { setError(t('offlineAiUnavailable', lang)); return; }

    const apiKey = getApiKey();
    if (!demo && !apiKey && !shouldUseBuiltinApi()) { setError(t('errorApiKeyMissing', lang)); return; }

    // Persist last used action
    setTransformAction(action);
    safeSetItem('threadlog_transform_action', action);

    setError(''); setLoading(true); setResult(null); setSavedId(null); setSavedHandoffId(null); setSavedResult(null); setProgress(null); setSimStep(0); setStreamDetail(null);

    const isFirstTransform = loadLogs().length === 0;
    const _t0 = import.meta.env.DEV ? performance.now() : 0;

    // Normalize worklog_handoff → both internally
    const effectiveAction = action === 'worklog_handoff' ? 'both' as const : action;
    const doHandoff = effectiveAction === 'both' || effectiveAction === 'handoff';
    const doWorklog = effectiveAction === 'both' || effectiveAction === 'worklog';
    const isBoth = doHandoff && doWorklog;
    const isTodoOnly = effectiveAction === 'todo_only';
    const isHandoffTodo = effectiveAction === 'handoff_todo';
    let todoCount = 0;
    // Set outputMode for progress display
    setOutputMode((doHandoff || isHandoffTodo) ? 'handoff' : 'worklog');

    try {
      let lastEntryId: string | null = null;
      let savedHandoffLog: LogEntry | null = null;

      // --- Demo mode — return pre-generated results (lazy-loaded) ---
      if (demo) {
        setSimStep(1);
        const { demoTransformBoth, demoTransformHandoff, demoTransformText, demoTransformTodoOnly, demoTransformHandoffTodo } = await loadDemoData();
        if (isBoth) {
          const bothResult = await demoTransformBoth(lang);
          setSimStep(4);
          const handoffEntry = buildHandoffLogEntry(bothResult.handoff, { projectId: selectedProjectId, sourceReference: buildSourceReference(text, files, combined.length) });
          addLog(handoffEntry);
          savedHandoffLog = handoffEntry;
          onSaved(handoffEntry.id);
          setSavedHandoffId(handoffEntry.id);
          const r = bothResult.worklog;
          setResult(r); setOutputMode('worklog');
          const worklogEntry: LogEntry = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), importedAt: new Date().toISOString(), title: r.title, projectId: selectedProjectId, sourceReference: buildSourceReference(text, files, combined.length), outputMode: 'worklog', today: r.today, decisions: r.decisions, todo: r.todo, relatedProjects: r.relatedProjects, tags: r.tags };
          addLog(worklogEntry); if (getFeatureEnabled('todo_extract', true)) { addTodosFromLog(worklogEntry.id, r.todo); todoCount = r.todo.length; }
          lastEntryId = worklogEntry.id; onSaved(worklogEntry.id);
        } else if (isHandoffTodo) {
          const htr = await demoTransformHandoffTodo(lang);
          setSimStep(4);
          const handoffEntry = buildHandoffLogEntry(htr.handoff, { projectId: selectedProjectId, sourceReference: buildSourceReference(text, files, combined.length) });
          addLog(handoffEntry);
          savedHandoffLog = handoffEntry;
          onSaved(handoffEntry.id);
          setSavedHandoffId(handoffEntry.id);
          setResult(htr.handoff); setOutputMode('handoff');
          if (htr.todos.length > 0 && getFeatureEnabled('todo_extract', true)) {
            addTodosFromLogWithMeta(handoffEntry.id, htr.todos.map(td => ({ title: td.title, priority: td.priority, dueDate: td.dueDate })));
            todoCount = htr.todos.length;
          }
          lastEntryId = handoffEntry.id;
        } else if (doHandoff) {
          const r = await demoTransformHandoff(lang);
          setSimStep(4);
          const handoffEntry = buildHandoffLogEntry(r, { projectId: selectedProjectId, sourceReference: buildSourceReference(text, files, combined.length) });
          addLog(handoffEntry);
          savedHandoffLog = handoffEntry;
          onSaved(handoffEntry.id); lastEntryId = handoffEntry.id;
          setResult(r); setOutputMode('handoff');
        } else if (isTodoOnly) {
          const r = await demoTransformTodoOnly(lang);
          setSimStep(4);
          if (r.todos.length > 0) { todoCount = r.todos.length; }
        } else {
          const r = await demoTransformText(lang);
          setSimStep(4);
          setResult(r); setOutputMode('worklog');
          const worklogEntry: LogEntry = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), importedAt: new Date().toISOString(), title: r.title, projectId: selectedProjectId, sourceReference: buildSourceReference(text, files, combined.length), outputMode: 'worklog', today: r.today, decisions: r.decisions, todo: r.todo, relatedProjects: r.relatedProjects, tags: r.tags };
          addLog(worklogEntry); if (getFeatureEnabled('todo_extract', true)) { addTodosFromLog(worklogEntry.id, r.todo); todoCount = r.todo.length; }
          lastEntryId = worklogEntry.id; onSaved(worklogEntry.id);
        }
        // Post-save: generate savedResult for markdown/context buttons
        if (savedHandoffLog) {
          const md = formatHandoffMarkdown(savedHandoffLog);
          setSavedResult({ log: savedHandoffLog, markdown: md, fullContext: null });
          setWasFirstTransform(isFirstTransform);
        }
        setSavedId(lastEntryId);
        if (todoCount > 0) showToast?.(tf('toastTodosExtracted', lang, todoCount), 'success');
        setLoading(false);
        return;
      }

      // --- Combined "both" mode — single API call ---
      if (isBoth) {
        let bothResult: BothResult;
        if (willChunk) {
          const engine = new ChunkEngine();
          engineRef.current = engine;
          bothResult = await engine.processBoth(combined, apiKey, (p) => setProgress(p));
          if (import.meta.env.DEV && _t0) console.log(`[Perf] API response (chunked): ${(performance.now() - _t0).toFixed(0)}ms`);
          engineRef.current = null;
        } else {
          setSimStep(0);
          setTimeout(() => setSimStep(1), 800);
          let streamCharCount = 0;
          const streamingEnabled = getFeatureEnabled('streaming', true);
          const bothOpts: TransformBothOptions = {
            onStream: streamingEnabled ? (_chunk: string, accumulated: string) => {
              if (streamCharCount === 0) setSimStep(2);
              streamCharCount = accumulated.length;
              setStreamDetail(`${t('streamReceiving', lang)}... ${streamCharCount.toLocaleString()} chars`);
            } : undefined,
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
        savedHandoffLog = handoffEntry;
        onSaved(handoffEntry.id);
        setSavedHandoffId(handoffEntry.id);

        // Save worklog entry
        const r = bothResult.worklog;
        setResult(r);
        setOutputMode('worklog'); // display worklog result (not handoff)
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
        lastEntryId = worklogEntry.id; onSaved(worklogEntry.id);

        // Use inline classification from the combined response (no extra API call)
        if (!selectedProjectId && projects.length > 0 && bothResult.classification?.projectId) {
          const cl = bothResult.classification;
          const matchedProject = projects.find(p => p.id === cl.projectId);
          if (matchedProject && cl.confidence > 0.7) {
            updateLog(handoffEntry.id, { projectId: cl.projectId ?? undefined, classificationConfidence: cl.confidence });
            updateLog(worklogEntry.id, { projectId: cl.projectId ?? undefined, classificationConfidence: cl.confidence });
            onSaved(worklogEntry.id);
          } else if (matchedProject && cl.confidence > 0) {
            setSuggestion({ logId: worklogEntry.id, projectId: cl.projectId!, projectName: matchedProject.name, confidence: cl.confidence });
            updateLog(worklogEntry.id, { suggestedProjectId: cl.projectId ?? undefined, classificationConfidence: cl.confidence });
          }
        }
      }

      // --- Handoff only ---
      if (doHandoff && !isBoth) {
        let r: HandoffResult;
        if (willChunk) {
          const engine = new ChunkEngine();
          engineRef.current = engine;
          r = await engine.processHandoff(combined, apiKey, (p) => setProgress(p));
          if (import.meta.env.DEV && _t0) console.log(`[Perf] API response (chunked): ${(performance.now() - _t0).toFixed(0)}ms`);
          engineRef.current = null;
        } else {
          setSimStep(0);
          setTimeout(() => setSimStep(1), 800);
          setTimeout(() => setSimStep(2), 2500);
          const cachedHandoff = getCachedResult<HandoffResult>(combined, 'handoff');
          if (cachedHandoff) {
            r = cachedHandoff;
          } else {
            r = await transformHandoff(combined);
            setCachedResult(combined, 'handoff', r);
          }
          if (import.meta.env.DEV && _t0) console.log(`[Perf] API response${cachedHandoff ? ' (cached)' : ''}: ${(performance.now() - _t0).toFixed(0)}ms`);
          setSimStep(4);
        }
        setResult(r);
        const entry = buildHandoffLogEntry(r, {
          projectId: selectedProjectId,
          sourceReference: buildSourceReference(text, files, combined.length),
        });
        addLog(entry); savedHandoffLog = entry; lastEntryId = entry.id; onSaved(entry.id);
        if (!selectedProjectId && projects.length > 0) {
          triggerClassification(entry);
        }
      }

      // --- Worklog only ---
      if (doWorklog && !isBoth) {
        let r: TransformResult;
        if (willChunk) {
          const engine = new ChunkEngine();
          engineRef.current = engine;
          r = await engine.process(combined, apiKey, (p) => setProgress(p));
          engineRef.current = null;
        } else {
          setSimStep(0);
          setTimeout(() => setSimStep(1), 800);
          setTimeout(() => setSimStep(2), 2500);
          const cachedWorklog = getCachedResult<TransformResult>(combined, 'worklog');
          if (cachedWorklog) {
            r = cachedWorklog;
          } else {
            r = await transformText(combined);
            setCachedResult(combined, 'worklog', r);
          }
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
        lastEntryId = entry.id; onSaved(entry.id);
        if (!selectedProjectId && projects.length > 0) {
          triggerClassification(entry);
        }
      }

      // --- Handoff + TODO ---
      if (isHandoffTodo) {
        setSimStep(0);
        setTimeout(() => setSimStep(1), 800);
        let htResult: HandoffTodoResult;
        const cachedHT = getCachedResult<HandoffTodoResult>(combined, 'handoff_todo');
        if (cachedHT) {
          htResult = cachedHT;
        } else {
          htResult = await transformHandoffTodo(combined);
          setCachedResult(combined, 'handoff_todo', htResult);
        }
        setSimStep(4);

        const r = htResult.handoff;
        setResult(r);
        const entry = buildHandoffLogEntry(r, {
          projectId: selectedProjectId,
          sourceReference: buildSourceReference(text, files, combined.length),
        });
        entry.todo = htResult.todos.map(td => td.title);
        addLog(entry);
        savedHandoffLog = entry;
        if (getFeatureEnabled('todo_extract', true)) { addTodosFromLogWithMeta(entry.id, htResult.todos); todoCount = htResult.todos.length; }
        lastEntryId = entry.id; onSaved(entry.id);
        if (!selectedProjectId && projects.length > 0) {
          triggerClassification(entry);
        }
      }

      // --- TODO only ---
      if (isTodoOnly) {
        setSimStep(0);
        setTimeout(() => setSimStep(1), 800);
        setTimeout(() => setSimStep(2), 2500);
        let todoResult: TodoOnlyResult;
        const cachedTodo = getCachedResult<TodoOnlyResult>(combined, 'todo_only');
        if (cachedTodo) {
          todoResult = cachedTodo;
        } else {
          todoResult = await transformTodoOnly(combined);
          setCachedResult(combined, 'todo_only', todoResult);
        }
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
        lastEntryId = entry.id; onSaved(entry.id);
        if (!selectedProjectId && projects.length > 0) {
          triggerClassification(entry);
        }
      }

      if (lastEntryId) setSavedId(lastEntryId);

      // Show preview panel for handoff/both modes; toast for worklog-only/todo-only
      if (savedHandoffLog) {
        const handoffMd = formatHandoffMarkdown(savedHandoffLog);
        let fullContextMd: string | null = null;
        if (savedHandoffLog.projectId) {
          const project = projects.find(p => p.id === savedHandoffLog!.projectId);
          const masterNote = getMasterNote(savedHandoffLog.projectId);
          if (masterNote && project) {
            const allLogs = loadLogs();
            const ctx = generateProjectContext(masterNote, allLogs, project.name);
            fullContextMd = formatFullAiContext(ctx, savedHandoffLog);
          }
        }
        setSavedResult({ log: savedHandoffLog, markdown: handoffMd, fullContext: fullContextMd });
        setWasFirstTransform(isFirstTransform);
        // Still show todo count toast for handoff_todo mode
        if (isHandoffTodo && todoCount > 0) {
          const todoMsg = tf('toastTodosExtracted', lang, todoCount);
          showToast?.(isFirstTransform ? `🎉 ${todoMsg}` : todoMsg, 'success');
        }
      } else {
        // Worklog-only or todo-only — just toast
        const lines: string[] = [];
        if (isTodoOnly) {
          if (todoCount > 0) {
            lines.push(tf('toastTodosExtracted', lang, todoCount));
          } else {
            lines.push(t('toastNoTodosFound', lang));
          }
        }
        if (doWorklog) {
          lines.push(t('toastLogSaved', lang));
          if (todoCount > 0) {
            lines.push(tf('toastTodosAdded', lang, todoCount));
          }
        }
        const toastMsg = lines.join('\n');
        showToast?.(isFirstTransform ? `🎉 ${toastMsg}` : toastMsg, 'success');
        playSuccess();
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Transform failed.';
      // Translate internal error tags to user-facing messages
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
        // fetch TypeError (network failure, CORS, etc.)
        setError(t('errorNetwork', lang));
      } else {
        setError(t('errorGeneric', lang));
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
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      const isStale = mn && (Date.now() - mn.updatedAt > SEVEN_DAYS);
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
        const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
        const isStale = mn && (Date.now() - mn.updatedAt > SEVEN_DAYS);
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
