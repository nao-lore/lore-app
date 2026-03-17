import { useState, useRef, useCallback, useEffect } from 'react';
import { transformText, transformHandoff, transformBoth, transformTodoOnly, transformHandoffTodo, buildHandoffLogEntry, CHAR_WARN, needsChunking } from './transform';
import type { TransformBothOptions } from './transform';
import { ChunkEngine, getChunkTarget, getEngineConcurrency } from './chunkEngine';
import type { EngineProgress } from './chunkEngine';
import { addLog, getLog, addTodosFromLog, addTodosFromLogWithMeta, loadTodos, loadLogs, updateLog, getApiKey, getFeatureEnabled, getMasterNote, getStreak, isDemoMode } from './storage';
import { shouldUseBuiltinApi, getBuiltinUsage } from './provider';
const loadDemoData = () => import('./demoData');
import { classifyLog, saveCorrection } from './classify';
import { extractDocxText } from './docx';
import { parseConversationJson } from './jsonImport';
import { Copy, Check, X, Share2 } from 'lucide-react';
import { getGreeting } from './greeting';
import ProgressPanel from './ProgressPanel';
import type { ProgressStep } from './ProgressPanel';
import SkeletonLoader from './SkeletonLoader';
import { logToMarkdown, handoffResultToMarkdown } from './markdown';
import { playSuccess } from './sounds';
import type { TransformResult, HandoffResult, BothResult, LogEntry, OutputMode, SourceReference, Project } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import ErrorRetryBanner from './ErrorRetryBanner';
import FirstUseTooltip from './FirstUseTooltip';
import { formatRelativeTime } from './utils/dateFormat';
import { formatHandoffMarkdown, formatFullAiContext } from './formatHandoff';
import { generateProjectContext } from './generateProjectContext';
import { HandoffResultDisplay, WorklogResultDisplay } from './ResultDisplay';

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

export default function InputView({ onSaved, onOpenLog, lang, activeProjectId, projects, showToast, onDirtyChange }: { onSaved: (id: string) => void; onOpenLog: (id: string) => void; lang: Lang; activeProjectId: string | null; projects: Project[]; showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void; onDirtyChange?: (dirty: boolean) => void }) {
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
        const pendingTodos = loadTodos().filter(t => !t.done && !t.archivedAt).length;
        const allLogs = loadLogs();
        const lastLog = allLogs.length > 0 ? allLogs[allLogs.length - 1] : null;
        const parts: string[] = [];
        if (pendingTodos > 0) parts.push(lang === 'ja' ? `未完了TODO ${pendingTodos}件` : `${pendingTodos} pending TODO${pendingTodos !== 1 ? 's' : ''}`);
        if (lastLog) parts.push((lang === 'ja' ? '最終変換: ' : 'Last: ') + formatRelativeTime(lastLog.createdAt, lang as 'en' | 'ja'));
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
                  try { navigator.clipboard.writeText(text); } catch { /* non-critical */ }
                  showToast?.(t('copiedToClipboard', lang), 'success');
                }}
              >
                <Copy size={14} /> {t('copyAiContext', lang)}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => {
                  try { navigator.clipboard.writeText(savedResult.markdown); } catch { /* non-critical */ }
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
            <FirstUseTooltip id="transform" text={lang === 'ja' ? 'AI会話を上に貼り付けて、ここをクリック！' : 'Paste an AI conversation above, then click here!'}>
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

          <input ref={fileRef} type="file" accept=".txt,.md,.docx,.json" multiple onChange={handleFiles} aria-label={t('ariaSelectFile', lang)} style={{ display: 'none' }} />
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
            title={t('titleDismiss', lang)}
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
                title={t('titleRemoveFile', lang)}
                aria-label={tf('ariaRemoveFile', lang, f.name)}
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
              {t('exportMd', lang)}
            </button>
            <button className="btn" onClick={() => handleExport('json')}>
              {t('exportJson', lang)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
