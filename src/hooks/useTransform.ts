/**
 * useTransform — orchestrator hook for AI transform actions.
 *
 * Dispatches to strategy functions in useTransformStrategies.ts for the
 * actual API calls, then handles post-save UI logic (toasts, suggestions, etc.).
 */

import { useState, useRef, useCallback } from 'react';
import { ChunkEngine } from '../chunkEngine';
import type { EngineProgress } from '../chunkEngine';
import { loadLogs, getLog, updateLog, getApiKey, getFeatureEnabled, getMasterNote, isDemoMode, safeGetItem, safeSetItem, getLang } from '../storage';
import { shouldUseBuiltinApi, getActiveProvider } from '../provider';
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

import type { TransformContext, ActionResult } from './useTransformStrategies';
import {
  getCachedResult,
  executeBoth, executeHandoff, executeWorklog, executeHandoffTodo, executeTodoOnly,
  executeDemoBoth, executeDemoHandoffTodo, executeDemoHandoff, executeDemoTodoOnly, executeDemoWorklog,
} from './useTransformStrategies';

export type TransformAction = 'both' | 'handoff' | 'worklog' | 'todo_only' | 'worklog_handoff' | 'handoff_todo';

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

    setTransformAction(action);
    safeSetItem('threadlog_transform_action', action);

    setError(''); setLoading(true); setResult(null); setSavedId(null); setSavedHandoffId(null); setSavedResult(null); setProgress(null); setSimStep(0); setStreamDetail(null);

    const isFirstTransform = loadLogs().length === 0;
    const _t0 = performance.now();

    const effectiveAction = action === 'worklog_handoff' ? 'both' as const : action;
    const doHandoff = effectiveAction === 'both' || effectiveAction === 'handoff';
    const doWorklog = effectiveAction === 'both' || effectiveAction === 'worklog';
    const isBoth = doHandoff && doWorklog;
    const isTodoOnly = effectiveAction === 'todo_only';
    const isHandoffTodo = effectiveAction === 'handoff_todo';
    setOutputMode((doHandoff || isHandoffTodo) ? 'handoff' : 'worklog');

    const provider = getActiveProvider() || 'default';
    const cacheLang = getLang() || 'auto';

    const ctx: TransformContext = {
      combined, apiKey, willChunk, selectedProjectId, lang, text, files,
      buildSourceReference, initSingleTransform, createStreamCallback,
      setProgress, setResult, setOutputMode, setStreamDetail, setSimStep,
      projects, engineRef, _t0, triggerClassification, provider, cacheLang,
    };

    try {
      let actionResult: ActionResult;

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

      // --- Real API path ---
      if (isBoth) {
        actionResult = await executeBoth(ctx);
        onSaved(actionResult.savedHandoffLog!.id);
        setSavedHandoffId(actionResult.savedHandoffLog!.id);
        onSaved(actionResult.lastEntryId!);

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
        actionResult = { lastEntryId: null, savedHandoffLog: null, todoCount: 0 };
      }

      if (actionResult.lastEntryId) setSavedId(actionResult.lastEntryId);

      // Track daily usage for trial/free limits
      incrementDailyUsage();

      // Record AI quality metric
      const _duration = performance.now() - _t0;
      const _cachedHit = (effectiveAction === 'both' && !!getCachedResult<unknown>(combined, 'both', provider, cacheLang))
        || (effectiveAction === 'handoff' && !!getCachedResult<unknown>(combined, 'handoff', provider, cacheLang))
        || (effectiveAction === 'worklog' && !!getCachedResult<unknown>(combined, 'worklog', provider, cacheLang))
        || (effectiveAction === 'todo_only' && !!getCachedResult<unknown>(combined, 'todo_only', provider, cacheLang))
        || (effectiveAction === 'handoff_todo' && !!getCachedResult<unknown>(combined, 'handoff_todo', provider, cacheLang));
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
        if (isHandoffTodo && actionResult.todoCount > 0) {
          const todoMsg = tf('toastTodosExtracted', lang, actionResult.todoCount);
          showToast?.(isFirstTransform ? `🎉 ${todoMsg}` : todoMsg, 'success');
        }
      } else {
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
    if (engine.isPaused) { engine.resume(); } else { engine.pause(); }
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
    if (savedHandoffId && savedId && logId === savedHandoffId) {
      updateLog(savedId, { projectId });
    }
    setSuggestion(null);
    onSaved(logId);
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
    if (savedHandoffId && savedId) {
      updateLog(savedId, { projectId });
    }
    const project = projects.find((p) => p.id === projectId);
    setPostSavePickerOpen(false);
    setSuggestion(null);
    onSaved(logId);
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
