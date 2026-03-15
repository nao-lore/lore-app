import { useState, useRef, useCallback, useEffect } from 'react';
import { transformText, transformHandoff, transformBoth, transformTodoOnly, transformHandoffTodo, buildHandoffLogEntry, CHAR_WARN, needsChunking } from './transform';
import type { TransformBothOptions } from './transform';
import { ChunkEngine, getChunkTarget, getEngineConcurrency } from './chunkEngine';
import type { EngineProgress } from './chunkEngine';
import { findSession } from './chunkDb';
import { addLog, trashLog, restoreLog, updateLog, getLog, getApiKey, addTodosFromLog, addTodosFromLogWithMeta, loadTodos, loadLogs, updateTodo as updateTodoStorage, duplicateLog, getAiContext, getMasterNote, linkLogs, unlinkLogs, isDemoMode, getFeatureEnabled, getStreak } from './storage';
import { shouldUseBuiltinApi, getBuiltinUsage } from './provider';
// demoData is only needed in demo mode — lazy-load it
const loadDemoData = () => import('./demoData');
import { classifyLog, saveCorrection } from './classify';
import { extractDocxText } from './docx';
import { parseConversationJson } from './jsonImport';
import { MoreVertical, Pin, CheckSquare, Square, ExternalLink, Copy, Check, Activity, X, Link, Share2 } from 'lucide-react';
import { getGreeting } from './greeting';
import ProgressPanel from './ProgressPanel';
import type { ProgressStep } from './ProgressPanel';
import SkeletonLoader from './SkeletonLoader';
import { logToMarkdown, handoffResultToMarkdown } from './markdown';
import { playSuccess, playDelete } from './sounds';
import type { TransformResult, HandoffResult, BothResult, LogEntry, OutputMode, SourceReference, Project, Todo, NextActionItem } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import ConfirmDialog from './ConfirmDialog';
import ErrorRetryBanner from './ErrorRetryBanner';
import FirstUseTooltip from './FirstUseTooltip';
import { analyzeWorkload, WORKLOAD_CONFIG } from './workload';
// integrations: isConfigured checks are inlined (lightweight localStorage reads);
// sendToNotion/sendToSlack are dynamically imported only when actually sending
function isNotionConfigured(): boolean {
  try { return !!(localStorage.getItem('threadlog_notion_api_key') && localStorage.getItem('threadlog_notion_database_id')); } catch { return false; }
}
function isSlackConfigured(): boolean {
  try { return !!localStorage.getItem('threadlog_slack_webhook_url'); } catch { return false; }
}

import { formatDateFull, formatDateTimeFull, formatRelativeTime } from './utils/dateFormat';
import { formatHandoffMarkdown, formatFullAiContext } from './formatHandoff';
import { generateProjectContext } from './generateProjectContext';

const formatDateUnified = formatDateFull;

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

type WorkspaceMode = 'input' | 'detail';

interface WorkspaceProps {
  mode: WorkspaceMode;
  selectedId: string | null;
  onSaved: (id: string) => void;
  onDeleted: () => void;
  onOpenLog: (id: string) => void;
  onBack: () => void;
  prevView: string;
  lang: Lang;
  activeProjectId: string | null;
  projects: Project[];
  onRefresh: () => void;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error', action?: { label: string; onClick: () => void }) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onTagFilter?: (tag: string) => void;
  onOpenMasterNote?: (projectId: string) => void;
  onSelectProject?: (projectId: string | null) => void;
}

export default function Workspace({ mode, selectedId, onSaved, onDeleted, onOpenLog, onBack, prevView, lang, activeProjectId, projects, onRefresh, showToast, onDirtyChange, onTagFilter, onOpenMasterNote, onSelectProject }: WorkspaceProps) {
  if (mode === 'detail' && selectedId) return <DetailView id={selectedId} onDeleted={onDeleted} onOpenLog={onOpenLog} onBack={onBack} prevView={prevView} lang={lang} projects={projects} onRefresh={onRefresh} showToast={showToast} onTagFilter={onTagFilter} allLogs={loadLogs()} onOpenMasterNote={onOpenMasterNote} />;
  return <InputView onSaved={onSaved} onOpenLog={onOpenLog} lang={lang} activeProjectId={activeProjectId} projects={projects} showToast={showToast} onDirtyChange={onDirtyChange} />;
}

// --- Input View ---

interface ImportedFile {
  name: string;
  content: string;
  lastModified?: number;
}

interface CaptureInfo {
  source: string;       // 'chatgpt' | 'claude' | 'gemini'
  messageCount: number;
  charCount: number;
  title?: string;
}

async function readFileContent(file: File): Promise<{ content: string; lastModified: number }> {
  if (file.size === 0) throw new Error('File is empty');
  if (file.size > 50_000_000) throw new Error('File too large (max 50MB)');
  const name = file.name.toLowerCase();
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsText(file);
    });
    return { content, lastModified: file.lastModified };
  } else if (name.endsWith('.docx')) {
    const content = await extractDocxText(file);
    return { content, lastModified: file.lastModified };
  } else if (name.endsWith('.json')) {
    const raw = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsText(file);
    });
    const result = parseConversationJson(raw, file.name);
    return { content: result.content, lastModified: result.timestamp ?? file.lastModified };
  }
  throw new Error(`Unsupported format: ${file.name}`);
}

function buildCombinedText(pastedText: string, files: ImportedFile[]): string {
  const parts: string[] = [];
  if (pastedText.trim()) parts.push(pastedText.trim());
  for (const f of files) {
    parts.push(`--- FILE: ${f.name} ---\n${f.content.trim()}`);
  }
  return parts.join('\n\n');
}

function buildSourceReference(_pastedText: string, files: ImportedFile[], charCount: number): SourceReference {
  const now = new Date().toISOString();
  if (files.length > 0) {
    const names = files.map((f) => f.name);
    const ext = names[0].split('.').pop()?.toLowerCase() || 'unknown';
    const oldest = files.reduce((min, f) => f.lastModified && f.lastModified < min ? f.lastModified : min,
      files[0].lastModified || Date.now());
    return {
      fileName: names.join(', '),
      sourceType: ext,
      importedAt: now,
      originalDate: new Date(oldest).toISOString().slice(0, 10),
      charCount,
    };
  }
  return {
    sourceType: 'paste',
    importedAt: now,
    charCount,
  };
}

function captureSourceLabel(source: string): string {
  const labels: Record<string, string> = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' };
  return labels[source] || source;
}

function formatFileDate(ts: number): string {
  const d = new Date(ts);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${mins}`;
}

function InputView({ onSaved, onOpenLog, lang, activeProjectId, projects, showToast, onDirtyChange }: { onSaved: (id: string) => void; onOpenLog: (id: string) => void; lang: Lang; activeProjectId: string | null; projects: Project[]; showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void; onDirtyChange?: (dirty: boolean) => void }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<ImportedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TransformResult | HandoffResult | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedHandoffId, setSavedHandoffId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pasteFeedback, setPasteFeedback] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<EngineProgress | null>(null);
  const [simStep, setSimStep] = useState(0); // simulated step for single transforms
  const [streamDetail, setStreamDetail] = useState<string | null>(null); // streaming progress text
  const [, setResumeInfo] = useState<{ completedChunks: number; totalChunks: number } | null>(null);
  const [outputMode, setOutputMode] = useState<OutputMode>('handoff');
  type TransformAction = 'both' | 'handoff' | 'worklog' | 'todo_only' | 'worklog_handoff' | 'handoff_todo';
  const [transformAction, setTransformAction] = useState<TransformAction>(() => {
    try { const v = localStorage.getItem('threadlog_transform_action'); return (['both', 'handoff', 'worklog', 'todo_only', 'worklog_handoff', 'handoff_todo'].includes(v || '') ? v as TransformAction : 'handoff_todo'); } catch { return 'handoff_todo'; }
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(activeProjectId ?? undefined);
  const [captureInfo, setCaptureInfo] = useState<CaptureInfo | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [suggestion, setSuggestion] = useState<{ logId: string; projectId: string; projectName: string; confidence: number } | null>(null);
  const [postSavePickerOpen, setPostSavePickerOpen] = useState(false);
  const [savedResult, setSavedResult] = useState<{ log: LogEntry; markdown: string; fullContext: string | null } | null>(null);
  const [wasFirstTransform, setWasFirstTransform] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<ChunkEngine | null>(null);

  const combined = buildCombinedText(text, files);
  const isDirty = combined.trim().length > 0;
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);
  const willChunk = needsChunking(combined);
  const isLargeInput = combined.length > 300_000;
  const overLimit = combined.length > 500_000;
  const overWarn = combined.length > CHAR_WARN && !willChunk;
  const estChunks = willChunk ? Math.ceil(combined.length / getChunkTarget(outputMode)) : 0;

  // Estimated runtime — sequential for Claude (concurrency=1), parallel for others
  const concurrency = getEngineConcurrency();
  const estMinutes = willChunk ? Math.ceil((Math.ceil(estChunks / concurrency) * 8) / 60) : 0;

  // Auto-focus textarea on mount
  useEffect(() => { textareaRef.current?.focus(); }, []);

  // Pre-fill demo conversation if demo mode and empty
  useEffect(() => {
    if (isDemoMode() && !text && files.length === 0) {
      loadDemoData().then(({ getDemoConversation }) => setText(getDemoConversation(lang)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset project selection on mount
  useEffect(() => { setSelectedProjectId(undefined); }, []);

  // Import from URL hash (extension "Send to Lore" flow)
  const handleHashImport = useCallback(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#import=')) return;
    try {
      const raw = decodeURIComponent(hash.slice(8));
      window.location.hash = '';
      // Reset state for new import
      setResult(null);
      setSavedId(null);
      setSavedHandoffId(null);
      setSavedResult(null);
      setError('');
      setText('');
      // Parse the raw JSON to extract capture metadata before conversion
      let parsed: Record<string, unknown> | null = null;
      try { parsed = JSON.parse(raw); } catch { /* ignore */ }
      const result = parseConversationJson(raw, 'extension-capture.json');
      setFiles([{ name: 'extension-capture.json', content: result.content, lastModified: result.timestamp }]);
      // Build capture info from the raw extension payload
      if (parsed && typeof parsed === 'object' && 'source' in parsed && 'messages' in parsed && Array.isArray(parsed.messages)) {
        const msgs = parsed.messages as Array<{ content?: string }>;
        const info = {
          source: String(parsed.source || 'unknown'),
          messageCount: msgs.length,
          charCount: msgs.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0),
          title: typeof parsed.title === 'string' ? parsed.title : undefined,
        };
        setCaptureInfo(info);
        setTimeout(() => setCaptureInfo((cur) => cur === info ? null : cur), 5000);
      }
      showToast?.(t('extensionReceived', lang), 'success');
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Hash Import] Failed:', err);
      setError('Failed to import from extension.');
    }
  }, [showToast, lang]);

  // Run on mount + listen for hash changes (extension updates URL on existing tab)
  useEffect(() => {
    handleHashImport();
    window.addEventListener('hashchange', handleHashImport);
    return () => window.removeEventListener('hashchange', handleHashImport);
  }, [handleHashImport]);

  // Check for resumable session when text changes
  useEffect(() => {
    if (!willChunk) { setResumeInfo(null); return; }
    let cancelled = false;
    findSession(combined).then((info) => {
      if (!cancelled) setResumeInfo(info ?? null);
    }).catch((e) => {
      if (import.meta.env.DEV) console.warn('findSession failed:', e);
      if (!cancelled) setResumeInfo(null);
    });
    return () => { cancelled = true; };
  }, [combined, willChunk]);

  const addFiles = useCallback(async (fileList: File[]) => {
    setError('');
    const newFiles: ImportedFile[] = [];
    const errors: string[] = [];
    for (const file of fileList) {
      try {
        const { content, lastModified } = await readFileContent(file);
        newFiles.push({ name: file.name, content, lastModified });
      } catch {
        errors.push(file.name);
      }
    }
    if (newFiles.length > 0) setFiles((prev) => [...prev, ...newFiles]);
    if (errors.length > 0) setError(tf('errorFileRead', lang, errors.join(', ')));
  }, [lang]);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    await addFiles(Array.from(selected));
    e.target.value = '';
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) await addFiles(dropped);
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const runTransform = async (action: TransformAction) => {
    if (loading) return;
    if (!combined.trim()) { setError(t('errorEmptyInput', lang)); return; }

    const demo = isDemoMode();
    if (!demo && !navigator.onLine) { setError(t('offlineAiUnavailable', lang)); return; }

    const apiKey = getApiKey();
    if (!demo && !apiKey && !shouldUseBuiltinApi()) { setError(t('errorApiKeyMissing', lang)); return; }

    // Persist last used action
    setTransformAction(action);
    try { localStorage.setItem('threadlog_transform_action', action); } catch { /* ignore */ }

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
            onStream: streamingEnabled ? (_chunk, accumulated) => {
              if (streamCharCount === 0) setSimStep(2);
              streamCharCount = accumulated.length;
              setStreamDetail(`${t('streamReceiving', lang)}... ${streamCharCount.toLocaleString()} chars`);
            } : undefined,
            projects: !selectedProjectId && projects.length > 0
              ? projects.map(p => ({ id: p.id, name: p.name }))
              : undefined,
          };
          bothResult = await transformBoth(combined, bothOpts);
          if (import.meta.env.DEV && _t0) console.log(`[Perf] API response: ${(performance.now() - _t0).toFixed(0)}ms`);
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
          r = await transformHandoff(combined);
          if (import.meta.env.DEV && _t0) console.log(`[Perf] API response: ${(performance.now() - _t0).toFixed(0)}ms`);
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
          r = await transformText(combined);
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
        const htResult = await transformHandoffTodo(combined);
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
        const todoResult = await transformTodoOnly(combined);
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
  };

  const handlePauseResume = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.isPaused) {
      engine.resume();
    } else {
      engine.pause();
    }
  };

  const handleCancel = () => {
    engineRef.current?.cancel();
  };

  const handleCopy = async () => {
    if (!result) return;
    const md = outputMode === 'handoff'
      ? handoffResultToMarkdown(result as HandoffResult)
      : logToMarkdown(result as TransformResult);
    try {
      await copyToClipboard(md);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
      showToast?.(t('logCopied', lang), 'success');
    } catch {
      showToast?.(t('copyFailed', lang), 'error');
    }
  };

  const handleExport = (format: 'md' | 'json') => {
    if (!result) return;
    const date = new Date().toISOString().slice(0, 10);
    const type = outputMode === 'handoff' ? 'handoff' : 'worklog';

    if (format === 'md') {
      const md = outputMode === 'handoff'
        ? handoffResultToMarkdown(result as HandoffResult)
        : logToMarkdown(result as TransformResult);
      downloadFile(md, `threadlog-${date}-${type}.md`, 'text/markdown');
    } else {
      const json = JSON.stringify(result, null, 2);
      downloadFile(json, `threadlog-${date}-${type}.json`, 'application/json');
    }
  };

  const triggerClassification = async (entry: LogEntry) => {
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
  };

  const handleAcceptSuggestion = () => {
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
  };

  const handleDismissSuggestion = () => {
    setSuggestion(null);
  };

  const handlePostSaveAssign = (projectId: string) => {
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
  };

  // --- Step definitions for ProgressPanel (single transforms) ---
  const worklogSteps: ProgressStep[] = [
    { label: t('stepAnalyzing', lang), duration: 3000 },
    { label: t('stepExtracting', lang), duration: 4000 },
    { label: t('stepOrganizing', lang), duration: 2000 },
    { label: t('stepFinalizing', lang), duration: 1000 },
  ];
  const handoffSteps: ProgressStep[] = [
    { label: t('stepAnalyzing', lang), duration: 3000 },
    { label: t('stepExtracting', lang), duration: 4000 },
    { label: t('stepOrganizing', lang), duration: 2000 },
    { label: t('stepFinalizing', lang), duration: 1000 },
  ];
  const singleSteps = outputMode === 'handoff' ? handoffSteps : worklogSteps;

  // --- Compute progress bar percentage ---
  const progressPct = progress
    ? progress.phase === 'merge'
      ? 95
      : Math.round((progress.current / progress.total) * 90)
    : 0;

  // --- Transform button label ---
  const progressLabel = !progress ? t('transforming', lang)
    : progress.phase === 'extract' ? tf('processing', lang, progress.current, progress.total)
    : progress.phase === 'merge' ? t('combiningResults', lang)
    : progress.phase === 'completed' ? t('phaseCollectingCompleted', lang)
    : progress.phase === 'consistency' ? t('phaseConsistencyCheck', lang)
    : progress.phase === 'waiting' ? tf('waitingForApi', lang, progress.retryIn ?? 0)
    : progress.phase === 'paused' ? (progress.autoPaused ? t('autoPaused', lang) : t('paused', lang))
    : t('transforming', lang);


  return (
    <div
      className="workspace-content-centered"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Greeting + Project Switcher */}
      <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px', color: 'var(--text-primary)', textAlign: 'center' }}>
        {getGreeting(lang)}{(() => { const streak = getStreak(); return streak > 1 ? ` 🔥 ${streak}` : ''; })()}
      </h1>
      {/* Quick stats */}
      {(() => {
        const pendingTodos = loadTodos().filter(t => !t.done && !t.archived).length;
        const allLogs = loadLogs();
        const lastLog = allLogs.length > 0 ? allLogs[allLogs.length - 1] : null;
        const parts: string[] = [];
        if (pendingTodos > 0) parts.push(`${pendingTodos} pending TODO${pendingTodos !== 1 ? 's' : ''}`);
        if (lastLog) parts.push(`Last transform: ${formatRelativeTime(lastLog.createdAt, lang as 'en' | 'ja')}`);
        return parts.length > 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', margin: '0 0 12px', fontWeight: 400 }}>
            {parts.join(' · ')}
          </p>
        ) : null;
      })()}
      {/* Post-generation preview panel */}
      {savedResult && (
        <div style={{ maxWidth: 760, margin: '0 auto', padding: 20 }}>
          <h3 style={{ marginBottom: 12, fontSize: 18, fontWeight: 700 }}>{wasFirstTransform ? `🎉 ${t('logSaved', lang)}` : t('logSaved', lang)}</h3>

          {/* Markdown preview in a scrollable code-block style container */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            padding: 16,
            maxHeight: 400,
            overflow: 'auto',
            fontSize: 13,
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.6,
            marginBottom: 16,
          }}>
            {savedResult.fullContext || savedResult.markdown}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {savedResult.fullContext ? (
              <button
                className="btn btn-primary"
                onClick={() => {
                  const text = savedResult.fullContext + '\n\n---\n\n' + savedResult.markdown;
                  navigator.clipboard.writeText(text);
                  showToast?.(t('copiedToClipboard', lang), 'success');
                }}
              >
                <Copy size={14} /> {t('copyAiContext', lang)}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => {
                  navigator.clipboard.writeText(savedResult.markdown);
                  showToast?.(t('copiedToClipboard', lang), 'success');
                }}
              >
                <Copy size={14} /> {t('copyHandoff', lang)}
              </button>
            )}
            <button
              className="btn"
              onClick={() => {
                setSavedResult(null);
                setResult(null);
                setSavedId(null);
                setSavedHandoffId(null);
                setText('');
                setFiles([]);
                setError('');
                setSuggestion(null);
                setPostSavePickerOpen(false);
              }}
            >
              {t('startNewLog', lang)}
            </button>
            {typeof navigator.share === 'function' && (
              <button className="btn" onClick={async () => {
                try {
                  await navigator.share({
                    title: 'Lore Handoff',
                    text: savedResult.fullContext || savedResult.markdown,
                  });
                } catch { /* ignore */ }
              }}>
                <Share2 size={14} /> {t('share', lang)}
              </button>
            )}
          </div>

          {/* Subtitle explaining the buttons */}
          {savedResult.fullContext && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              {t('copyAiContextTitle', lang)}
            </p>
          )}
        </div>
      )}

      {/* Input Card — hidden when preview panel is shown */}
      {!savedResult && (<div
        className="input-card-hero"
        style={dragging ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-focus)', position: 'relative' as const } : { position: 'relative' as const }}
      >
        {/* Drag & drop overlay */}
        {dragging && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--accent-bg, rgba(99,102,241,0.08))',
            borderRadius: 'inherit',
            pointerEvents: 'none',
          }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', pointerEvents: 'none' }}>
              {t('dropFilesHere', lang)}
            </span>
          </div>
        )}

        {/* Clear text button */}
        {text.trim() && !loading && (
          <button
            onClick={() => { setText(''); textareaRef.current?.focus(); }}
            style={{
              position: 'absolute', top: 10, right: 14, zIndex: 5,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 4, lineHeight: 1,
              borderRadius: 4, transition: 'color 0.12s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            title={t('clearText', lang)}
            aria-label={t('clearText', lang)}
          >
            <X size={16} />
          </button>
        )}

        <textarea
          ref={textareaRef}
          className="input-card-textarea"
          aria-label={t('inputPlaceholder', lang)}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !loading && combined.trim() && !overLimit) {
              e.preventDefault();
              runTransform(transformAction);
            }
          }}
          onPaste={() => {
            // Show paste feedback and scroll to top after state updates
            setTimeout(() => {
              const ta = textareaRef.current;
              if (ta && ta.value.trim()) {
                const len = ta.value.length;
                setPasteFeedback(tf('pasteFeedback', lang, len.toLocaleString()));
                setTimeout(() => setPasteFeedback(null), 3000);
                ta.scrollTop = 0;
              }
            }, 0);
          }}
          disabled={loading}
          autoFocus
          placeholder={t('inputPlaceholder', lang)}
          style={{ opacity: loading ? 0.6 : 1 }}
        />

        {/* Bottom bar: char count + keyboard hint */}
        <div style={{ padding: '0 24px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            {combined.length > 0 && (
              <span className="meta" style={{ fontSize: 11, color: overLimit ? 'var(--error-text)' : overWarn || willChunk ? 'var(--error-text)' : undefined }}>
                {(text.length + files.reduce((sum, f) => sum + f.content.length, 0)).toLocaleString()}{t('chars', lang)}
                {(() => { const wc = combined.trim() ? combined.trim().split(/\s+/).length : 0; const rm = Math.max(1, Math.ceil(wc / 200)); return wc > 0 ? ` · ${wc.toLocaleString()}${lang === 'ja' ? '語' : ' words'} · ${rm}${lang === 'ja' ? '分で読了' : ' min read'}` : ''; })()}
                {(overWarn || willChunk) && !overLimit && t('longInputHint', lang)}
              </span>
            )}
            {pasteFeedback && (
              <span className="paste-feedback" style={{ marginLeft: combined.length > 0 ? 10 : 0 }}>
                {pasteFeedback}
              </span>
            )}
          </div>
          {combined.length > 0 && !loading && (
            <span className="meta" style={{ fontSize: 11, opacity: 0.5 }}>
              {navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+Enter
            </span>
          )}
        </div>

        {/* Transform button — bottom right inside card */}
        <div style={{ position: 'absolute', right: 14, bottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          {!loading && shouldUseBuiltinApi() && (() => {
            const { used, limit } = getBuiltinUsage();
            return (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {used}/{limit}
              </span>
            );
          })()}
          {loading ? (
            <button
              className="btn btn-primary"
              disabled
              style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: 10 }}
            >
              {progressLabel}
            </button>
          ) : (
            <FirstUseTooltip id="transform" text="Paste an AI conversation above, then click here!">
              <button
                className="btn btn-primary"
                onClick={() => runTransform(transformAction)}
                disabled={!combined.trim() || overLimit}
                style={{
                  padding: '8px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 10,
                  opacity: (!combined.trim() || overLimit) ? 0.35 : 1,
                }}
              >
                {t(transformAction === 'handoff_todo' ? 'createBtnHandoffTodo' : transformAction === 'todo_only' ? 'createBtnTodoOnly' : transformAction === 'both' || transformAction === 'worklog_handoff' ? 'createBtnBoth' : transformAction === 'handoff' ? 'createBtnHandoff' : 'createBtnWorklog', lang)}
              </button>
            </FirstUseTooltip>
          )}
        </div>
      </div>)}

      {/* Toolbar: mode tabs + project + import — single row */}
      {!savedResult && (<div style={{ maxWidth: 760, margin: '10px auto 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="mode-selector">
            {(['handoff', 'handoff_todo', 'todo_only'] as TransformAction[]).map((a) => {
              const isActive = transformAction === a;
              const label = t(
                a === 'handoff_todo' ? 'modeLabelHandoffTodo'
                : a === 'handoff' ? 'modeLabelHandoff'
                : 'modeLabelTodoOnly',
                lang
              );
              const tooltip = t(
                a === 'handoff_todo' ? 'tooltipHandoffTodo'
                : a === 'handoff' ? 'tooltipHandoff'
                : 'tooltipTodoOnly',
                lang
              );
              return (
                <button
                  key={a}
                  className={`mode-selector-btn${isActive ? ' active' : ''}`}
                  title={tooltip}
                  onClick={() => { setTransformAction(a); try { localStorage.setItem('threadlog_transform_action', a); } catch { /* ignore */ } }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <select
            className="input input-sm"
            value={selectedProjectId ?? ''}
            onChange={(e) => setSelectedProjectId(e.target.value || undefined)}
            disabled={loading}
            aria-label={t('selectProject', lang)}
            style={{ minWidth: 140, padding: '4px 8px', fontSize: 12, minHeight: 0, width: 'auto', flexShrink: 0 }}
          >
            <option value="">{t('selectProject', lang)}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <input ref={fileRef} type="file" accept=".txt,.md,.docx,.json" multiple onChange={handleFiles} aria-label="ファイルを選択" style={{ display: 'none' }} />
          <button className="input input-sm" onClick={() => fileRef.current?.click()} disabled={loading} style={{ minWidth: 'auto', padding: '4px 8px', fontSize: 12, minHeight: 0, width: 'auto', flexShrink: 0, cursor: 'pointer', textAlign: 'left' }}>
            + {files.length === 0 ? t('importFiles', lang) : t('addMoreFiles', lang)}
          </button>

          {files.length > 0 && (
            <button className="btn-link" onClick={() => setFiles([])} disabled={loading} style={{ fontSize: 11, color: 'var(--error-text)', flexShrink: 0 }}>
              {t('clearAllFiles', lang)}
            </button>
          )}
        </div>
      </div>)}

      {/* Capture banner — shown when data arrives from Chrome extension */}
      {captureInfo && (
        <div className="capture-banner" style={{ maxWidth: 760, margin: '12px auto 0' }}>
          <div className="capture-banner-icon">✓</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="capture-banner-title">
              {tf('capturedFrom', lang, captureSourceLabel(captureInfo.source))}
            </div>
            <div className="capture-banner-meta">
              {captureInfo.messageCount} messages · {captureInfo.charCount.toLocaleString()} {t('chars', lang)}
            </div>
            <div className="capture-banner-hint">
              {t('captureTransformHint', lang)}
            </div>
          </div>
          <button
            onClick={() => setCaptureInfo(null)}
            className="capture-banner-close"
            title="Dismiss"
            aria-label={t('ariaDismissNotification', lang)}
          >×</button>
        </div>
      )}

      {/* File list — between card and options when files exist */}
      {files.length > 0 && !captureInfo && !result && (
        <div className="file-list" style={{ marginTop: 12, maxWidth: 760, margin: '12px auto 0' }}>
          {files.map((f, i) => (
            <div key={i} className="file-list-item">
              <span style={{ color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.name}
              </span>
              {f.lastModified && (
                <span className="meta" style={{ fontSize: 11, flexShrink: 0, color: 'var(--border-hover)' }}>
                  {formatFileDate(f.lastModified)}
                </span>
              )}
              <span className="meta" style={{ fontSize: 11, flexShrink: 0 }}>
                {f.content.length.toLocaleString()}
              </span>
              <button
                onClick={() => removeFile(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--border-hover)', fontSize: 16, padding: '0 4px', lineHeight: 1, transition: 'color 0.12s' }}
                title="Remove file"
                aria-label={`Remove ${f.name}`}
                onMouseOver={(e) => (e.currentTarget.style.color = 'var(--error-text)')}
                onMouseOut={(e) => (e.currentTarget.style.color = 'var(--border-hover)')}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}


      {/* Warnings — compact inline pills */}
      {(overLimit || isLargeInput) && !loading && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, justifyContent: 'center' }}>
          {overLimit && (
            <span className="notice-pill notice-pill-error">
              {t('overLimitBlock', lang)}
            </span>
          )}
          {isLargeInput && !overLimit && (
            <span className="notice-pill notice-pill-amber">
              {t('largeInputNotice', lang)}
            </span>
          )}
        </div>
      )}

      {/* Progress card — single transform (simulated steps) */}
      {loading && !progress && (
        <>
          <ProgressPanel
            steps={singleSteps}
            state={{ stepIndex: simStep, detail: streamDetail || undefined }}
            lang={lang}
            heading={undefined}
          />
          <SkeletonLoader lang={lang} />
        </>
      )}

      {/* Progress card — chunked transform (real progress) */}
      {loading && progress && (
        <>
        <ProgressPanel
          heading={undefined}
          steps={[{ label: progress.phase === 'extract' ? tf('processing', lang, progress.current, progress.total)
            : progress.phase === 'merge' ? t('combiningResults', lang)
            : progress.phase === 'completed' ? t('phaseCollectingCompleted', lang)
            : progress.phase === 'consistency' ? t('phaseConsistencyCheck', lang)
            : progress.phase === 'waiting' ? tf('waitingRetry', lang, progress.retryIn ?? 0, progress.retryAttempt ?? 0, progress.retryMax ?? 0)
            : progress.autoPaused ? t('autoPaused', lang)
            : t('paused', lang) }]}
          state={{
            stepIndex: 0,
            percent: progressPct,
            detail: progress.phase === 'extract' ? (
              [
                progress.savedCount > 0 ? tf('itemsSaved', lang, progress.savedCount) : '',
                progress.total - progress.current > 0 ? tf('remaining', lang, progress.total - progress.current) : t('lastItem', lang),
                estMinutes > 0 ? tf('estimatedTime', lang, estMinutes) : '',
              ].filter(Boolean).join(' · ')
            ) : progress.phase === 'merge' ? tf('combiningGroups', lang, progress.current, progress.total)
            : progress.phase === 'completed' ? t('phaseCollectingCompletedDetail', lang)
            : progress.phase === 'consistency' ? t('phaseConsistencyCheckDetail', lang)
            : progress.phase === 'waiting' ? `${tf('waitingForApi', lang, progress.retryIn ?? 0)} · ${tf('itemsSaved', lang, progress.savedCount)}`
            : progress.autoPaused ? t('autoPausedDesc', lang)
            : `${tf('itemsSaved', lang, progress.savedCount)} · ${t('clickResumeHint', lang)}`,
          }}
          lang={lang}
          dotColor={
            progress.phase === 'waiting' ? 'var(--warning-dot)'
            : progress.phase === 'paused' ? 'var(--progress-paused)'
            : undefined
          }
          dotAnimate={progress.phase !== 'paused'}
          barColor={
            progress.phase === 'waiting' ? 'var(--warning-dot)'
            : progress.phase === 'paused' ? 'var(--progress-paused)'
            : undefined
          }
          actions={<>
            <button className="btn" onClick={handlePauseResume} style={{ fontSize: 11, padding: '3px 10px', minHeight: 24 }}>
              {progress.phase === 'paused' ? t('btnResume', lang) : t('btnPause', lang)}
            </button>
            <button className="btn btn-danger" onClick={handleCancel} style={{ fontSize: 11, padding: '3px 10px', minHeight: 24 }}>
              {t('btnCancel', lang)}
            </button>
          </>}
        />
        <SkeletonLoader lang={lang} />
        </>
      )}

      {error && (
        <ErrorRetryBanner
          message={error}
          retryLabel={t('tryAgain', lang)}
          dismissLabel={t('ariaDismissNotification', lang)}
          onRetry={combined.trim() ? () => { setError(''); runTransform(transformAction); } : undefined}
          onDismiss={() => setError('')}
        />
      )}

      {result && (
        <div className="result-panel" style={{ marginTop: 28 }}>
          {savedId && (
            <div className="alert-success" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span>{t('savedToLogs', lang)}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {savedHandoffId && (
                  <button
                    className="btn"
                    onClick={() => onOpenLog(savedHandoffId)}
                    style={{ fontSize: 13, padding: '5px 14px', minHeight: 30 }}
                  >
                    {t('viewHandoff', lang)}
                  </button>
                )}
                <button
                  className="btn"
                  onClick={() => onOpenLog(savedId)}
                  style={{ fontSize: 13, padding: '5px 14px', minHeight: 30 }}
                >
                  {savedHandoffId ? t('viewLog', lang) : t('openSavedLog', lang)}
                </button>
              </div>
            </div>
          )}
          {classifying && (
            <div style={{ marginBottom: 16, padding: '10px 14px', fontSize: 13, color: 'var(--text-secondary)', background: 'var(--bg-surface-secondary)', borderRadius: 8 }}>
              {t('classifying', lang)}
            </div>
          )}
          {suggestion && (
            <div style={{ marginBottom: 16, padding: '10px 14px', fontSize: 13, background: 'var(--accent-bg)', border: '1px solid var(--accent-muted)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span>{t('suggestedProject', lang)}: <strong>{suggestion.projectName}</strong></span>
              <button className="btn btn-primary" onClick={handleAcceptSuggestion} style={{ fontSize: 12, padding: '3px 10px', minHeight: 24 }}>
                {t('classifyAccept', lang)}
              </button>
              <button className="btn" onClick={() => { setSuggestion(null); setPostSavePickerOpen(true); }} style={{ fontSize: 12, padding: '3px 10px', minHeight: 24 }}>
                {t('classifyPickOther', lang)}
              </button>
              <button className="btn" onClick={handleDismissSuggestion} style={{ fontSize: 12, padding: '3px 10px', minHeight: 24 }}>
                {t('classifyDismiss', lang)}
              </button>
            </div>
          )}
          {/* Post-save project picker — only when unassigned and no suggestion */}
          {savedId && !selectedProjectId && !suggestion && !classifying && projects.length > 0 && (
            <div style={{ marginBottom: 16, padding: '10px 14px', fontSize: 13, background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-default)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span>{t('addToProject', lang)}</span>
              {postSavePickerOpen ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {projects.map((p) => (
                    <button key={p.id} className="btn" onClick={() => handlePostSaveAssign(p.id)} style={{ fontSize: 12, padding: '3px 10px', minHeight: 24 }}>
                      {p.name}
                    </button>
                  ))}
                  <button className="btn" onClick={() => setPostSavePickerOpen(false)} style={{ fontSize: 12, padding: '3px 10px', minHeight: 24 }}>
                    ×
                  </button>
                </div>
              ) : (
                <button className="btn btn-primary" onClick={() => setPostSavePickerOpen(true)} style={{ fontSize: 12, padding: '3px 10px', minHeight: 24 }}>
                  {t('addToProject', lang)}
                </button>
              )}
            </div>
          )}
          <h3 style={{ fontSize: 18, marginBottom: 4 }}>{result.title}</h3>

          {outputMode === 'handoff' ? (
            <HandoffResultDisplay result={result as HandoffResult} lang={lang} />
          ) : (
            <WorklogResultDisplay result={result as TransformResult} lang={lang} />
          )}

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-default)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={handleCopy} style={copied ? { color: 'var(--success-text)', borderColor: 'var(--success-border)' } : undefined}>
              {copied ? <><Check size={14} /> {t('copied', lang)}</> : <><Copy size={14} /> {t('copyMarkdown', lang)}</>}
            </button>
            <button className="btn" onClick={() => handleExport('md')}>
              Export .md
            </button>
            <button className="btn" onClick={() => handleExport('json')}>
              Export .json
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Result displays ---

function WorklogResultDisplay({ result, lang }: { result: TransformResult; lang: Lang }) {
  return (
    <>
      <Section title={t('sectionToday', lang)} items={result.today} />
      <Section title={t('sectionDecisions', lang)} items={result.decisions} />
      <Section title={t('sectionTodo', lang)} items={result.todo} />
      <Section title={t('sectionRelatedProjects', lang)} items={result.relatedProjects} />
      {result.tags.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {result.tags.map((tag, i) => <span key={i} className="tag">{tag}</span>)}
        </div>
      )}
    </>
  );
}

function HandoffResultDisplay({ result, lang }: { result: HandoffResult; lang: Lang }) {
  return (
    <>
      {/* Session Context (handoffMeta) */}
      {result.handoffMeta && (result.handoffMeta.sessionFocus || result.handoffMeta.whyThisSession || result.handoffMeta.timePressure) && (
        <div className="resume-context-hero" style={{ marginBottom: 12 }}>
          <div className="resume-context-hero-label">{lang === 'ja' ? 'セッション概要' : 'Session Context'}</div>
          <div className="resume-context-hero-body">
            {[
              result.handoffMeta.sessionFocus && `Focus: ${result.handoffMeta.sessionFocus}`,
              result.handoffMeta.whyThisSession && `Why: ${result.handoffMeta.whyThisSession}`,
              result.handoffMeta.timePressure && `Time: ${result.handoffMeta.timePressure}`,
            ].filter(Boolean).join('\n')}
          </div>
        </div>
      )}
      {/* Resume Checklist */}
      {result.resumeChecklist && result.resumeChecklist.length > 0 ? (
        <div className="resume-context-hero">
          <div className="resume-context-hero-label">{t('sectionResumeContext', lang)}</div>
          <div className="resume-context-hero-body">
            {result.resumeChecklist.map((item, i) => {
              const parts = [item.action];
              if (item.whyNow) parts.push(`  → ${item.whyNow}`);
              if (item.ifSkipped) parts.push(`  ⚠ ${item.ifSkipped}`);
              return `${i + 1}. ${parts.join('\n')}`;
            }).join('\n')}
          </div>
        </div>
      ) : result.resumeContext.length > 0 && (
        <div className="resume-context-hero">
          <div className="resume-context-hero-label">{t('sectionResumeContext', lang)}</div>
          <div className="resume-context-hero-body">{result.resumeContext.join('\n')}</div>
        </div>
      )}
      <Section title={t('sectionCurrentStatus', lang)} items={result.currentStatus} />
      <Section title={t('sectionNextActions', lang)} items={result.nextActions} />
      {result.actionBacklog && result.actionBacklog.length > 0 && (
        <Section title={lang === 'ja' ? 'バックログ' : 'Action Backlog'} items={result.actionBacklog.map(a => a.action)} />
      )}
      <Section title={t('sectionCompleted', lang)} items={result.completed} />
      <Section title={t('sectionDecisions', lang)} items={result.decisions} />
      <Section title={t('sectionBlockers', lang)} items={result.blockers} />
      <Section title={t('sectionConstraints', lang)} items={result.constraints} />
      {result.tags.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {result.tags.map((tag, i) => <span key={i} className="tag">{tag}</span>)}
        </div>
      )}
    </>
  );
}

// --- Detail View ---

function DetailView({ id, onDeleted, onOpenLog, onBack, prevView, lang, projects, onRefresh, showToast, onTagFilter, allLogs, onOpenMasterNote }: { id: string; onDeleted: () => void; onOpenLog: (id: string) => void; onBack: () => void; prevView: string; lang: Lang; projects: Project[]; onRefresh: () => void; showToast?: (msg: string, type?: 'default' | 'success' | 'error', action?: { label: string; onClick: () => void }) => void; onTagFilter?: (tag: string) => void; allLogs: LogEntry[]; onOpenMasterNote?: (projectId: string) => void }) {
  const log = getLog(id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [todosVersion, setTodosVersion] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  // Memo
  const [editingMemo, setEditingMemo] = useState(false);
  const [memoDraft, setMemoDraft] = useState('');
  const [analyzingWorkload, setAnalyzingWorkload] = useState(false);
  const [sendingNotion, setSendingNotion] = useState(false);
  const [sendingSlack, setSendingSlack] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  void todosVersion;

  // Prev/next navigation
  const sortedLogs = allLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const currentIndex = sortedLogs.findIndex((l) => l.id === id);
  const prevLogId = currentIndex > 0 ? sortedLogs[currentIndex - 1].id : null;
  const nextLogId = currentIndex >= 0 && currentIndex < sortedLogs.length - 1 ? sortedLogs[currentIndex + 1].id : null;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      const btn = document.querySelector('[data-menu-trigger="detail"]');
      if (btn && btn.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  useEffect(() => {
    if (!projectPickerOpen) return;
    const close = (e: MouseEvent) => {
      const btn = document.querySelector('[data-menu-trigger="project-picker"]');
      if (btn && btn.contains(e.target as Node)) return;
      setProjectPickerOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [projectPickerOpen]);

  if (!log) return <div className="workspace-content"><p className="empty-state">{t('logNotFound', lang)}</p></div>;

  // Find previous handoff in same project for diff highlighting
  const prevHandoff = (() => {
    if (log.outputMode !== 'handoff' || !log.projectId) return null;
    const projectHandoffs = allLogs
      .filter((l) => l.projectId === log.projectId && l.outputMode === 'handoff' && l.id !== log.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const logTime = new Date(log.createdAt).getTime();
    return projectHandoffs.find((l) => new Date(l.createdAt).getTime() < logTime) || null;
  })();

  const isNewItem = (item: string, prevItems: string[] | undefined): boolean => {
    if (!prevHandoff || !prevItems || prevItems.length === 0) return false;
    const normalize = (s: string) => s.toLowerCase().replace(/[^\w\u3000-\u9fff]/g, '');
    const normalizedPrev = prevItems.map(normalize);
    const n = normalize(item);
    return !normalizedPrev.some((p) => p === n || p.includes(n) || n.includes(p));
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logToMarkdown(log));
      setCopied(true); setTimeout(() => setCopied(false), 2000);
      showToast?.(t('logCopied', lang), 'success');
    } catch {
      showToast?.(t('copyFailed', lang), 'error');
    }
    setMenuOpen(false);
  };

  const handleCopyWithContext = async () => {
    setMenuOpen(false);
    if (!log.projectId) {
      showToast?.(t('addToProjectFirst', lang), 'default');
      return;
    }
    const ctx = getAiContext(log.projectId);
    if (!ctx) {
      showToast?.(t('aiContextNeeded', lang), 'default');
      return;
    }
    try {
      const md = logToMarkdown(log);
      await navigator.clipboard.writeText(ctx + '\n\n---\n\n## Latest Handoff\n' + md);
      showToast?.(t('logCopied', lang), 'success');
    } catch {
      showToast?.(t('copyFailed', lang), 'error');
    }
  };

  const handleDelete = () => {
    setMenuOpen(false);
    setConfirmDelete(true);
  };

  const handleDetailExport = (format: 'md' | 'json') => {
    const date = new Date(log.createdAt).toISOString().slice(0, 10);
    const type = log.outputMode === 'handoff' ? 'handoff' : 'worklog';
    if (format === 'md') {
      downloadFile(logToMarkdown(log), `threadlog-${date}-${type}.md`, 'text/markdown');
    } else {
      const { sourceText: _s, ...exportData } = log;
      void _s;
      downloadFile(JSON.stringify(exportData, null, 2), `threadlog-${date}-${type}.json`, 'application/json');
    }
    setMenuOpen(false);
  };

  const handleShare = async () => {
    setMenuOpen(false);
    const markdown = logToMarkdown(log);
    try {
      await navigator.share({
        title: log.title,
        text: markdown,
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        navigator.clipboard.writeText(markdown);
        showToast?.(t('copiedToClipboard', lang), 'success');
      }
    }
  };

  const handleAssignProject = (projectId: string) => {
    const newProjectId = projectId || undefined;
    updateLog(id, { projectId: newProjectId, suggestedProjectId: undefined });
    if (newProjectId && log) saveCorrection(log, newProjectId);
    setProjectPickerOpen(false);
    onRefresh();
    // Prompt to update Project Summary when a log is assigned
    if (newProjectId) {
      const mn = getMasterNote(newProjectId);
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      const isStale = mn && (Date.now() - mn.updatedAt > SEVEN_DAYS);
      const msg = isStale ? t('updateSummaryStale', lang) : t('updateSummaryPrompt', lang);
      showToast?.(msg, 'default', onOpenMasterNote ? {
        label: t('updateSummaryAction', lang),
        onClick: () => onOpenMasterNote(newProjectId),
      } : undefined);
    }
  };

  const flashSaved = () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    setShowSaved(true);
    savedTimerRef.current = setTimeout(() => setShowSaved(false), 2000);
  };

  const handleTitleSave = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== log?.title) {
      updateLog(id, { title: trimmed, updatedAt: new Date().toISOString() });
      onRefresh();
      flashSaved();
    }
    setEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setEditingTitle(false);
  };

  const handleMemoSave = () => {
    updateLog(id, { memo: memoDraft.trim() || undefined, updatedAt: new Date().toISOString() });
    setEditingMemo(false);
    onRefresh();
    flashSaved();
  };

  const handleAnalyzeWorkload = async () => {
    if (!log) return;
    setAnalyzingWorkload(true);
    try {
      const level = await analyzeWorkload(log);
      updateLog(id, { workloadLevel: level });
      onRefresh();
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setAnalyzingWorkload(false);
    }
  };

  const handleSendNotion = async () => {
    if (!log) return;
    if (!isNotionConfigured()) {
      showToast?.(t('notionNotConfigured', lang), 'error');
      return;
    }
    setSendingNotion(true);
    try {
      const { sendToNotion } = await import('./integrations');
      await sendToNotion(log);
      showToast?.(t('notionSent', lang), 'success');
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSendingNotion(false);
    }
  };

  const handleSendSlack = async () => {
    if (!log) return;
    if (!isSlackConfigured()) {
      showToast?.(t('slackNotConfigured', lang), 'error');
      return;
    }
    setSendingSlack(true);
    try {
      const { sendToSlack } = await import('./integrations');
      await sendToSlack(logToMarkdown(log));
      showToast?.(t('slackSent', lang), 'success');
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSendingSlack(false);
    }
  };

  const isHandoff = log.outputMode === 'handoff';
  const project = log.projectId ? projects.find((p) => p.id === log.projectId) : undefined;

  return (
    <div className="workspace-content">
      <div className="page-header">
        <nav style={{ display: 'flex', alignItems: 'center', fontSize: 12, marginBottom: 12, flexWrap: 'wrap', gap: 2 }}>
          <span
            style={{ color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'none' }}
            onClick={onBack}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onBack(); }}
          >
            {t('logs', lang)}
          </span>
          {project && (
            <>
              <span style={{ color: 'var(--text-muted)', margin: '0 2px' }}>{' › '}</span>
              <span
                style={{
                  color: 'var(--text-muted)',
                  cursor: onOpenMasterNote ? 'pointer' : 'default',
                }}
                onClick={() => onOpenMasterNote?.(project.id)}
                role={onOpenMasterNote ? 'button' : undefined}
                tabIndex={onOpenMasterNote ? 0 : undefined}
                onKeyDown={onOpenMasterNote ? (e) => { if (e.key === 'Enter') onOpenMasterNote(project.id); } : undefined}
              >
                {project.icon && <span style={{ marginRight: 3 }}>{project.icon}</span>}
                {project.name}
              </span>
            </>
          )}
          <span style={{ color: 'var(--text-muted)', margin: '0 2px' }}>{' › '}</span>
          <span
            style={{
              color: 'var(--text-secondary)',
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 300,
            }}
            title={log.title}
          >
            {log.title}
          </span>
        </nav>
        <div className="page-header-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              {isHandoff ? <span className="badge-handoff">Handoff</span> : <span className="badge-worklog">Log</span>}
              {project && (
                <span
                  className="tag"
                  style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                  onClick={() => onOpenMasterNote?.(project.id)}
                  title={t('viewProjectSummary', lang)}
                >
                  {project.icon && <span style={{ fontSize: 13 }}>{project.icon}</span>}
                  {project.name}
                  <span style={{ fontSize: 10, opacity: 0.7 }}>→</span>
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
              <span>{t('logCreatedAt', lang)}：{formatDateTimeFull(log.createdAt)}</span>
              {log.updatedAt && <span>{t('logUpdatedAt', lang)}：{formatDateTimeFull(log.updatedAt)}</span>}
              {/* Workload level */}
              {!getFeatureEnabled('workload', true) ? null : log.workloadLevel ? (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                    color: WORKLOAD_CONFIG[log.workloadLevel].color,
                    background: WORKLOAD_CONFIG[log.workloadLevel].bg,
                    cursor: 'pointer',
                  }}
                  onClick={handleAnalyzeWorkload}
                  title={t('clickToReanalyze', lang)}
                >
                  <Activity size={10} />
                  {t('workloadLevel', lang)}: {WORKLOAD_CONFIG[log.workloadLevel].label(lang)}
                </span>
              ) : (
                <button
                  className="btn"
                  style={{ fontSize: 11, padding: '1px 8px', minHeight: 20, display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={handleAnalyzeWorkload}
                  disabled={analyzingWorkload}
                >
                  <Activity size={10} />
                  {analyzingWorkload ? t('workloadAnalyzing', lang) : t('workloadAnalyze', lang)}
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              {editingTitle ? (
                <input
                  className="input"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !(e.nativeEvent as KeyboardEvent).isComposing) { e.preventDefault(); handleTitleSave(); }
                    if (e.key === 'Escape') handleTitleCancel();
                  }}
                  autoFocus
                  maxLength={200}
                  style={{ flex: 1, fontSize: 18, fontWeight: 700, padding: '2px 8px' }}
                />
              ) : (
                <h2
                  style={{ flex: 1, margin: 0, cursor: 'pointer', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  onClick={() => { setTitleDraft(log.title); setEditingTitle(true); }}
                  title={log.title}
                >
                  {log.title}
                </h2>
              )}
              {showSaved && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: '#22c55e', fontWeight: 500, flexShrink: 0, transition: 'opacity 0.3s', whiteSpace: 'nowrap' }}>
                  <Check size={14} />
                  {lang === 'ja' ? '保存済み' : 'Saved'}
                </span>
              )}
              <button
                className="card-menu-btn"
                onClick={() => {
                  if (!log.pinned) {
                    const pinnedCount = loadLogs().filter((l) => l.pinned).length;
                    if (pinnedCount >= 5) { showToast?.(t('pinLimitReached', lang), 'error'); return; }
                  }
                  updateLog(id, { pinned: !log.pinned }); onRefresh();
                }}
                style={log.pinned ? { color: 'var(--accent)', flexShrink: 0, marginTop: 2 } : { flexShrink: 0, marginTop: 2 }}
                title={log.pinned ? 'Unpin' : 'Pin'}
                aria-label={log.pinned ? t('ariaUnpin', lang) : t('ariaPin', lang)}
              >
                <Pin size={18} style={{ transform: 'rotate(45deg)' }} fill={log.pinned ? 'currentColor' : 'none'} />
              </button>
            </div>
          </div>
          {/* AI Context copy — primary action */}
          {isHandoff && log.projectId && (
            <button
              className="btn btn-primary"
              onClick={handleCopyWithContext}
              style={{ flexShrink: 0, fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
              title={t('copyAiContextTitle', lang)}
            >
              <Copy size={13} />
              {t('copyAiContext', lang)}
            </button>
          )}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              className="card-menu-btn"
              data-menu-trigger="detail"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              title="Actions"
              aria-label={t('ariaMenu', lang)}
            >
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <div className="card-menu-dropdown" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                {projects.length > 0 && (
                  <button className="card-menu-item" onClick={() => { setMenuOpen(false); setProjectPickerOpen(true); }}>
                    {t('editProject', lang)}
                  </button>
                )}
                <button className="card-menu-item" onClick={handleCopy}>
                  {copied ? t('copied', lang) : t('copyMarkdown', lang)}
                </button>
                <button className="card-menu-item" onClick={handleCopyWithContext}>
                  {t('copyWithContext', lang)}
                </button>
                <button className="card-menu-item" onClick={() => handleDetailExport('md')}>
                  Export .md
                </button>
                <button className="card-menu-item" onClick={() => handleDetailExport('json')}>
                  Export .json
                </button>
                {typeof navigator.share === 'function' && (
                  <button className="card-menu-item" onClick={handleShare}>
                    <Share2 size={14} /> {t('share', lang)}
                  </button>
                )}
                <button className="card-menu-item" onClick={() => {
                  setMenuOpen(false);
                  const suffix = t('duplicateLogSuffix', lang);
                  const newId = duplicateLog(id, suffix);
                  if (newId) {
                    onRefresh();
                    showToast?.(t('duplicateLogDone', lang), 'success');
                    onOpenLog(newId);
                  }
                }}>
                  {t('duplicateLog', lang)}
                </button>
                <button className="card-menu-item card-menu-item-danger" onClick={handleDelete}>
                  {t('delete', lang)}
                </button>
              </div>
            )}
            {projectPickerOpen && (
              <div className="card-menu-dropdown" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className="card-menu-item"
                    onClick={() => handleAssignProject(p.id)}
                    style={log.projectId === p.id ? { fontWeight: 600, color: 'var(--accent-text)' } : undefined}
                  >
                    {p.name}
                  </button>
                ))}
                <button className="card-menu-item" style={{ color: 'var(--text-placeholder)' }} onClick={() => handleAssignProject('')}>
                  {t('removeFromProject', lang)}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {log.tags.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {log.tags.map((tag, i) => (
            <span
              key={i}
              className="tag"
              style={{ cursor: onTagFilter ? 'pointer' : undefined }}
              onClick={onTagFilter ? () => onTagFilter(tag) : undefined}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Handoff copy buttons + Resume Context hero */}
      {isHandoff && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              className="btn"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
              onClick={async () => {
                try {
                  const handoffMd = formatHandoffMarkdown(log);
                  await navigator.clipboard.writeText(handoffMd);
                  showToast?.(t('logCopied', lang), 'success');
                } catch {
                  showToast?.(t('copyFailed', lang), 'error');
                }
              }}
            >
              <Copy size={14} />
              {t('copyHandoff', lang)}
            </button>
            {log.projectId && (() => {
              const project = projects.find(p => p.id === log.projectId);
              const mn = getMasterNote(log.projectId!);
              if (!project || !mn) return null;
              return (
                <button
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                  title={t('copyAiContextTitle', lang)}
                  onClick={async () => {
                    try {
                      const allLogs = loadLogs();
                      const ctx = generateProjectContext(mn, allLogs, project.name);
                      const aiContextMd = formatFullAiContext(ctx, log);
                      const handoffMd = formatHandoffMarkdown(log);
                      await navigator.clipboard.writeText(aiContextMd + '\n\n---\n\n' + handoffMd);
                      showToast?.(t('logCopied', lang), 'success');
                    } catch {
                      showToast?.(t('copyFailed', lang), 'error');
                    }
                  }}
                >
                  <Copy size={14} />
                  {t('copyAiContext', lang)}
                </button>
              );
            })()}
          </div>
          {/* Session Context (handoffMeta) */}
          {log.handoffMeta && (log.handoffMeta.sessionFocus || log.handoffMeta.whyThisSession || log.handoffMeta.timePressure) && (
            <div className="resume-context-hero" style={{ marginBottom: 8 }}>
              <div className="resume-context-hero-label">{lang === 'ja' ? 'セッション概要' : 'Session Context'}</div>
              <div className="resume-context-hero-body">
                {[
                  log.handoffMeta.sessionFocus && `Focus: ${log.handoffMeta.sessionFocus}`,
                  log.handoffMeta.whyThisSession && `Why: ${log.handoffMeta.whyThisSession}`,
                  log.handoffMeta.timePressure && `Time: ${log.handoffMeta.timePressure}`,
                ].filter(Boolean).join('\n')}
              </div>
            </div>
          )}
          {/* Resume Checklist (structured or legacy) */}
          {(() => {
            if (log.resumeChecklist && log.resumeChecklist.length > 0) {
              return (
                <div className="resume-context-hero" style={{ marginBottom: 16 }}>
                  <div className="resume-context-hero-label">{t('sectionResumeContext', lang)}</div>
                  <div className="resume-context-hero-body">
                    {log.resumeChecklist.map((item, i) => {
                      const parts = [item.action];
                      if (item.whyNow) parts.push(`  → ${item.whyNow}`);
                      if (item.ifSkipped) parts.push(`  ⚠ ${item.ifSkipped}`);
                      return `${i + 1}. ${parts.join('\n')}`;
                    }).join('\n')}
                  </div>
                </div>
              );
            }
            const resumeItems = log.resumeContext || (log.resumePoint ? [log.resumePoint] : []);
            return resumeItems.length > 0 ? (
              <div className="resume-context-hero" style={{ marginBottom: 16 }}>
                <div className="resume-context-hero-label">{t('sectionResumeContext', lang)}</div>
                <div className="resume-context-hero-body">{resumeItems.join('\n')}</div>
              </div>
            ) : null;
          })()}
        </>
      )}

      {/* External integrations */}
      {(isNotionConfigured() || isSlackConfigured()) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {isNotionConfigured() && (
            <button
              className="btn"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 12px', minHeight: 28 }}
              onClick={handleSendNotion}
              disabled={sendingNotion}
            >
              <ExternalLink size={12} />
              {sendingNotion ? t('notionSending', lang) : t('notionSend', lang)}
            </button>
          )}
          {isSlackConfigured() && (
            <button
              className="btn"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 12px', minHeight: 28 }}
              onClick={handleSendSlack}
              disabled={sendingSlack}
            >
              <ExternalLink size={12} />
              {sendingSlack ? t('slackSending', lang) : t('slackSend', lang)}
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isHandoff ? (
          <>
            <CardSection title={t('sectionCurrentStatus', lang)} items={log.currentStatus || log.inProgress || []} isNew={(item) => isNewItem(item, prevHandoff?.currentStatus)} />
            <CheckableCardSection
              title={t('sectionNextActions', lang)}
              items={log.nextActions || []}
              richItems={log.nextActionItems}
              checkedIndices={log.checkedActions || []}
              onToggle={(index) => {
                const current = log.checkedActions || [];
                const next = current.includes(index) ? current.filter((i) => i !== index) : [...current, index];
                updateLog(log.id, { checkedActions: next });
                onRefresh();
              }}
            />
            {log.actionBacklog && log.actionBacklog.length > 0 && (
              <CardSection title={lang === 'ja' ? 'バックログ' : 'Action Backlog'} items={log.actionBacklog.map(a => a.action)} />
            )}
            <CardSection title={t('sectionCompleted', lang)} items={log.completed || []} isNew={(item) => isNewItem(item, prevHandoff?.completed)} />
            <CardSection title={t('sectionDecisions', lang)} items={log.decisions} isNew={(item) => isNewItem(item, prevHandoff?.decisions)} />
            <CardSection title={t('sectionBlockers', lang)} items={log.blockers || []} isNew={(item) => isNewItem(item, prevHandoff?.blockers)} />
            <CardSection title={t('sectionConstraints', lang)} items={log.constraints || []} />
          </>
        ) : (
          <>
            <CardSection title={t('sectionToday', lang)} items={log.today} />
            <CardSection title={t('sectionDecisions', lang)} items={log.decisions} />
            <TodoSection logId={log.id} lang={lang} todosVersion={todosVersion} onToggle={() => setTodosVersion((v) => v + 1)} />
            <CardSection title={t('sectionRelatedProjects', lang)} items={log.relatedProjects} />
          </>
        )}

        {log.sourceReference && (
          <div className="content-card" style={{ fontSize: 12, color: 'var(--text-subtle)', display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
            {log.sourceReference.fileName && <span>{log.sourceReference.fileName}</span>}
            {log.sourceReference.charCount != null && <span>{log.sourceReference.charCount.toLocaleString()} {t('chars', lang)}</span>}
            {log.sourceReference.originalDate && <span>{log.sourceReference.originalDate}</span>}
          </div>
        )}
        {!log.sourceReference && log.sourceText && (
          <details className="source-details" style={{ marginTop: 8 }}>
            <summary>{t('sourceText', lang)}</summary>
            <pre>{log.sourceText}</pre>
          </details>
        )}

        <RelatedLogsSection log={log} onOpenLog={onOpenLog} lang={lang} />

        {/* Memo section */}
        <div className="content-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editingMemo || log.memo ? 8 : 0 }}>
            <div className="content-card-header" style={{ margin: 0 }}>{t('memoSection', lang)}</div>
            {!editingMemo && (
              <button
                className="btn"
                style={{ fontSize: 12, padding: '2px 10px', minHeight: 24 }}
                onClick={() => { setMemoDraft(log.memo || ''); setEditingMemo(true); }}
              >
                {t('memoEdit', lang)}
              </button>
            )}
          </div>
          {editingMemo ? (
            <div>
              <textarea
                className="input"
                value={memoDraft}
                onChange={(e) => setMemoDraft(e.target.value)}
                placeholder={t('memoPlaceholder', lang)}
                autoFocus
                rows={4}
                maxLength={10000}
                style={{ width: '100%', resize: 'vertical', fontSize: 14, lineHeight: 1.6 }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                <button className="btn" style={{ fontSize: 12 }} onClick={() => setEditingMemo(false)}>{t('cancel', lang)}</button>
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={handleMemoSave}>{t('memoSave', lang)}</button>
              </div>
            </div>
          ) : log.memo ? (
            <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-body)', margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{log.memo}</p>
          ) : (
            <p
              className="meta"
              style={{ fontSize: 13, cursor: 'pointer', margin: 0 }}
              onClick={() => { setMemoDraft(''); setEditingMemo(true); }}
            >
              {t('memoPlaceholder', lang)}
            </p>
          )}
        </div>
      </div>
      {/* Prev/Next navigation */}
      {(prevLogId || nextLogId) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
          <button
            className="btn"
            style={{ fontSize: 13, visibility: prevLogId ? 'visible' : 'hidden' }}
            disabled={!prevLogId}
            onClick={() => prevLogId && onOpenLog(prevLogId)}
          >
            {t('prevLog', lang)}
          </button>
          <button
            className="btn"
            style={{ fontSize: 13, visibility: nextLogId ? 'visible' : 'hidden' }}
            disabled={!nextLogId}
            onClick={() => nextLogId && onOpenLog(nextLogId)}
          >
            {t('nextLog', lang)}
          </button>
        </div>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={t('deleteConfirm', lang)}
          description={t('deleteConfirmDesc', lang)}
          confirmLabel={t('confirmDeleteBtn', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={() => { const deletedId = log.id; trashLog(deletedId); setConfirmDelete(false); onDeleted(); playDelete(); showToast?.(t('movedToTrash', lang), 'success', { label: t('undo', lang), onClick: () => { restoreLog(deletedId); onRefresh(); } }); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

// --- Todo Section (checkboxes for worklog detail) ---

function TodoSection({ logId, lang, todosVersion, onToggle }: { logId: string; lang: Lang; todosVersion: number; onToggle: () => void }) {
  void todosVersion;
  const todos = loadTodos().filter((t: Todo) => t.logId === logId);
  if (todos.length === 0) return null;

  const handleToggle = (id: string, done: boolean) => {
    updateTodoStorage(id, { done: !done });
    onToggle();
  };

  return (
    <div className="content-card">
      <div className="content-card-header">{t('sectionTodo', lang)}</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {todos.map((todo: Todo) => (
          <li
            key={todo.id}
            onClick={() => handleToggle(todo.id, todo.done)}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 6px', cursor: 'pointer', borderRadius: 8, transition: 'background 0.12s', margin: '0 -6px' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sidebar-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {todo.done
              ? <CheckSquare size={18} style={{ color: 'var(--success-text)', flexShrink: 0, marginTop: 1 }} />
              : <Square size={18} style={{ color: 'var(--text-placeholder)', flexShrink: 0, marginTop: 1 }} />
            }
            <span style={{
              color: todo.done ? 'var(--text-placeholder)' : 'var(--text-secondary)',
              textDecoration: todo.done ? 'line-through' : 'none',
            }}>
              {todo.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Shared ---

function RelatedLogsSection({ log, onOpenLog, lang }: { log: LogEntry; onOpenLog: (id: string) => void; lang: Lang }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  void refreshKey;

  const allLogs = loadLogs();

  // Explicitly linked logs (bidirectional backlinks)
  const currentLog = getLog(log.id);
  const linkedIds = currentLog?.relatedLogIds || [];
  const linkedLogs = linkedIds
    .map((lid) => allLogs.find((l) => l.id === lid))
    .filter((l): l is LogEntry => !!l);

  // Same-project logs (excluding current and already-linked)
  const linkedIdSet = new Set(linkedIds);
  const projectLogs = log.projectId
    ? allLogs
        .filter((l) => l.projectId === log.projectId && l.id !== log.id && !linkedIdSet.has(l.id))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8)
    : [];

  // Search candidates (all logs except current and already linked)
  const searchCandidates = searchQuery.trim()
    ? allLogs
        .filter((l) => l.id !== log.id && !linkedIdSet.has(l.id))
        .filter((l) => l.title.toLowerCase().includes(searchQuery.toLowerCase()))
        .slice(0, 10)
    : [];

  const handleLink = (targetId: string) => {
    linkLogs(log.id, targetId);
    setSearchQuery('');
    setSearchOpen(false);
    setRefreshKey((k) => k + 1);
  };

  const handleUnlink = (targetId: string) => {
    unlinkLogs(log.id, targetId);
    setRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  // Close search dropdown on outside click
  useEffect(() => {
    if (!searchOpen) return;
    const close = (e: MouseEvent) => {
      const container = document.querySelector('[data-related-search]');
      if (container && !container.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [searchOpen]);

  const hasLinked = linkedLogs.length > 0;
  const hasProject = projectLogs.length > 0;
  const showSection = hasLinked || hasProject;

  return (
    <div className="content-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showSection ? 8 : 0 }}>
        <div className="content-card-header" style={{ margin: 0 }}>{t('relatedLogs', lang)}</div>
        <div style={{ position: 'relative' }} data-related-search>
          <button
            className="btn"
            style={{ fontSize: 12, padding: '2px 10px', minHeight: 24, display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => { setSearchOpen(!searchOpen); setSearchQuery(''); }}
          >
            <Link size={12} />
            {t('linkLog', lang)}
          </button>
          {searchOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 100,
              background: 'var(--card-bg)', border: '1px solid var(--border-default)',
              borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', width: 320, maxHeight: 300, overflow: 'hidden',
            }}>
              <div style={{ padding: 8 }}>
                <input
                  ref={searchInputRef}
                  className="input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('searchLogs', lang)}
                  style={{ width: '100%', fontSize: 13, padding: '6px 10px' }}
                />
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                {searchQuery.trim() && searchCandidates.length === 0 && (
                  <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-placeholder)' }}>
                    {t('noMatches', lang)}
                  </div>
                )}
                {searchCandidates.map((c) => (
                  <button
                    key={c.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px',
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                      fontSize: 13, color: 'var(--text-body)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sidebar-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    onClick={() => handleLink(c.id)}
                  >
                    <span className={c.outputMode === 'handoff' ? 'badge-handoff-sm' : 'badge-worklog-sm'} style={{ flexShrink: 0 }}>
                      {c.outputMode === 'handoff' ? 'H' : 'L'}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Explicitly linked logs */}
      {hasLinked && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: hasProject ? 12 : 0 }}>
          {linkedLogs.map((r) => (
            <span
              key={r.id}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 16,
                background: 'var(--accent-bg, #f3f0ff)', fontSize: 13,
                border: '1px solid var(--border-default)',
              }}
            >
              <span className={r.outputMode === 'handoff' ? 'badge-handoff-sm' : 'badge-worklog-sm'}>
                {r.outputMode === 'handoff' ? 'H' : 'L'}
              </span>
              <span
                style={{ cursor: 'pointer', color: 'var(--accent-text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                onClick={() => onOpenLog(r.id)}
                title={r.title}
              >
                {r.title}
              </span>
              <button
                onClick={() => handleUnlink(r.id)}
                title={t('unlink', lang)}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: 'var(--text-placeholder)', borderRadius: '50%', width: 18, height: 18,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger-text, #e53e3e)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-placeholder)')}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Same-project logs */}
      {hasProject && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {projectLogs.map((r) => (
            <button
              key={r.id}
              className="log-link-item"
              onClick={() => onOpenLog(r.id)}
            >
              <span className={r.outputMode === 'handoff' ? 'badge-handoff-sm' : 'badge-worklog-sm'}>
                {r.outputMode === 'handoff' ? '🔁' : '📝'}
              </span>
              <span className="log-link-title">{r.title}</span>
              <span className="meta" style={{ fontSize: 11, flexShrink: 0 }}>
                {formatDateUnified(r.createdAt)}
              </span>
              <ExternalLink size={11} style={{ color: 'var(--text-placeholder)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}

      {!showSection && (
        <p className="meta" style={{ fontSize: 13, margin: 0 }}>
          {t('noMatches', lang)}
        </p>
      )}
    </div>
  );
}

function CardSection({ title, items, isNew }: { title: string; items: string[]; isNew?: (item: string) => boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="content-card">
      <div className="content-card-header">{title}</div>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((item, i) => {
          const fresh = isNew?.(item);
          return (
            <li key={i} style={{ marginBottom: 6, fontSize: 14, lineHeight: 1.7, color: 'var(--text-body)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <span style={{ flex: 1 }}>{item}</span>
              {fresh && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-bg, #f3f0ff)', padding: '1px 5px', borderRadius: 3, flexShrink: 0, marginTop: 3 }}>NEW</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CheckableCardSection({ title, items, checkedIndices, onToggle, richItems }: { title: string; items: string[]; checkedIndices: number[]; onToggle: (index: number) => void; richItems?: NextActionItem[] }) {
  if (items.length === 0) return null;
  const doneCount = checkedIndices.length;
  return (
    <div className="content-card">
      <div className="content-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {title}
        {items.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-placeholder)', fontWeight: 500 }}>{doneCount}/{items.length}</span>}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {items.map((item, i) => {
          const checked = checkedIndices.includes(i);
          const rich = richItems?.[i];
          return (
            <li
              key={i}
              onClick={() => onToggle(i)}
              style={{ marginBottom: 4, fontSize: 14, lineHeight: 1.7, color: checked ? 'var(--text-placeholder)' : 'var(--text-body)', display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', textDecoration: checked ? 'line-through' : 'none', padding: '4px 0', userSelect: 'none' }}
            >
              <span style={{ flexShrink: 0, marginTop: 3 }}>
                {checked ? <CheckSquare size={16} style={{ color: 'var(--accent)' }} /> : <Square size={16} style={{ color: 'var(--text-placeholder)' }} />}
              </span>
              <span>
                {item}
                {rich && (rich.whyImportant || rich.priorityReason || rich.dueBy || (rich.dependsOn && rich.dependsOn.length > 0)) && (
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', marginTop: 2 }}>
                    {rich.whyImportant && (
                      <span style={{ fontSize: 12, color: 'var(--text-subtle)', fontStyle: 'italic' }}>
                        Why: {rich.whyImportant}
                      </span>
                    )}
                    {rich.priorityReason && (
                      <span style={{ fontSize: 12, color: 'var(--text-subtle)', fontStyle: 'italic' }}>
                        Priority: {rich.priorityReason}
                      </span>
                    )}
                    {rich.dependsOn && rich.dependsOn.length > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--text-placeholder)', fontStyle: 'italic' }}>
                        Depends on: {rich.dependsOn.join(', ')}
                      </span>
                    )}
                    {rich.dueBy && (
                      <span style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--bg-card)', borderRadius: 4, padding: '1px 6px', fontWeight: 500 }}>
                        {rich.dueBy}
                      </span>
                    )}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="section">
      <h4>{title}</h4>
      <ul>
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </div>
  );
}
