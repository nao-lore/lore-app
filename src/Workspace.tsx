import { useState, useRef, useCallback, useEffect } from 'react';
import { transformText, transformHandoff, transformBoth, transformTodoOnly, transformHandoffTodo, CHAR_WARN, needsChunking } from './transform';
import type { TransformBothOptions } from './transform';
import { ChunkEngine, getChunkTarget, getEngineConcurrency } from './chunkEngine';
import type { EngineProgress } from './chunkEngine';
import { findSession } from './chunkDb';
import { addLog, trashLog, updateLog, getLog, getApiKey, addTodosFromLog, addTodosFromLogWithMeta, loadTodos, loadLogs, updateTodo as updateTodoStorage, duplicateLog, getAiContext, getMasterNote } from './storage';
import { classifyLog, saveCorrection } from './classify';
import { extractDocxText } from './docx';
import { parseConversationJson } from './jsonImport';
import { MoreVertical, Pin, CheckSquare, Square, ExternalLink, Copy, Check, Activity } from 'lucide-react';
import { getGreeting } from './greeting';
import ProgressPanel from './ProgressPanel';
import type { ProgressStep } from './ProgressPanel';
import { logToMarkdown, handoffResultToMarkdown } from './markdown';
import type { TransformResult, HandoffResult, BothResult, LogEntry, OutputMode, SourceReference, Project, Todo } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import ConfirmDialog from './ConfirmDialog';
import { analyzeWorkload, WORKLOAD_CONFIG } from './workload';
import { sendToNotion, sendToSlack, isNotionConfigured, isSlackConfigured } from './integrations';

import { formatDateFull } from './utils/dateFormat';

const formatDateUnified = formatDateFull;

function formatDateTimeFull(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${mo}/${day} ${h}:${mi}`;
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
}

export default function Workspace({ mode, selectedId, onSaved, onDeleted, onOpenLog, onBack, prevView, lang, activeProjectId, projects, onRefresh, showToast, onDirtyChange, onTagFilter, onOpenMasterNote }: WorkspaceProps) {
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(activeProjectId ?? undefined);
  const [captureInfo, setCaptureInfo] = useState<CaptureInfo | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [suggestion, setSuggestion] = useState<{ logId: string; projectId: string; projectName: string; confidence: number } | null>(null);
  const [postSavePickerOpen, setPostSavePickerOpen] = useState(false);
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
      showToast?.('Extension から会話を受信しました', 'success');
    } catch (err) {
      console.error('[Hash Import] Failed:', err);
      setError('Failed to import from extension.');
    }
  }, [showToast]);

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
    }).catch(() => {
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
    if (errors.length > 0) setError(`Failed to read: ${errors.join(', ')}. Supported: .txt, .md, .docx, .json`);
  }, []);

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
    if (!combined.trim()) { setError('Please enter or import some text.'); return; }

    const apiKey = getApiKey();
    if (!apiKey) { setError('[API Key] Not set. Go to Settings and enter your API key.'); return; }

    // Persist last used action
    setTransformAction(action);
    try { localStorage.setItem('threadlog_transform_action', action); } catch { /* ignore */ }

    setError(''); setLoading(true); setResult(null); setSavedId(null); setSavedHandoffId(null); setProgress(null); setSimStep(0); setStreamDetail(null);

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

      // --- Combined "both" mode — single API call ---
      if (isBoth) {
        console.time('[both] total');
        let bothResult: BothResult;
        if (willChunk) {
          console.time('[both] chunked API');
          const engine = new ChunkEngine();
          engineRef.current = engine;
          bothResult = await engine.processBoth(combined, apiKey, (p) => setProgress(p));
          engineRef.current = null;
          console.timeEnd('[both] chunked API');
        } else {
          setSimStep(0);
          setTimeout(() => setSimStep(1), 800);
          console.time('[both] transformBoth call');
          let streamCharCount = 0;
          const bothOpts: TransformBothOptions = {
            onStream: (_chunk, accumulated) => {
              if (streamCharCount === 0) setSimStep(2);
              streamCharCount = accumulated.length;
              setStreamDetail(`${lang === 'ja' ? 'AIが応答中' : 'Receiving'}... ${streamCharCount.toLocaleString()} chars`);
            },
            projects: !selectedProjectId && projects.length > 0
              ? projects.map(p => ({ id: p.id, name: p.name }))
              : undefined,
          };
          bothResult = await transformBoth(combined, bothOpts);
          setStreamDetail(null);
          console.timeEnd('[both] transformBoth call');
          setSimStep(4);
        }

        // Save handoff entry
        console.time('[both] save handoff');
        const handoffEntry: LogEntry = {
          id: crypto.randomUUID(), createdAt: new Date().toISOString(),
          importedAt: new Date().toISOString(),
          title: bothResult.handoff.title,
          projectId: selectedProjectId,
          sourceReference: buildSourceReference(text, files, combined.length),
          outputMode: 'handoff',
          today: [], decisions: bothResult.handoff.decisions || [], todo: [],
          relatedProjects: [], tags: bothResult.handoff.tags || [],
          currentStatus: bothResult.handoff.currentStatus || [], nextActions: bothResult.handoff.nextActions || [],
          completed: bothResult.handoff.completed || [], blockers: bothResult.handoff.blockers || [],
          constraints: bothResult.handoff.constraints || [], resumeContext: bothResult.handoff.resumeContext || [],
        };
        console.time('[both] addLog(handoff)');
        addLog(handoffEntry);
        console.timeEnd('[both] addLog(handoff)');
        console.time('[both] onSaved(handoff)');
        onSaved(handoffEntry.id);
        console.timeEnd('[both] onSaved(handoff)');
        setSavedHandoffId(handoffEntry.id);
        console.timeEnd('[both] save handoff');

        // Save worklog entry
        console.time('[both] save worklog');
        const r = bothResult.worklog;
        console.time('[both] setResult + setOutputMode');
        setResult(r);
        setOutputMode('worklog'); // display worklog result (not handoff)
        console.timeEnd('[both] setResult + setOutputMode');
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
        console.time('[both] addLog(worklog)');
        addLog(worklogEntry);
        console.timeEnd('[both] addLog(worklog)');
        console.time('[both] addTodosFromLog');
        addTodosFromLog(worklogEntry.id, r.todo);
        console.timeEnd('[both] addTodosFromLog');
        todoCount = r.todo.length;
        console.time('[both] onSaved(worklog)');
        lastEntryId = worklogEntry.id; onSaved(worklogEntry.id);
        console.timeEnd('[both] onSaved(worklog)');
        console.timeEnd('[both] save worklog');

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
        console.timeEnd('[both] total');
      }

      // --- Handoff only ---
      if (doHandoff && !isBoth) {
        let r: HandoffResult;
        if (willChunk) {
          const engine = new ChunkEngine();
          engineRef.current = engine;
          r = await engine.processHandoff(combined, apiKey, (p) => setProgress(p));
          engineRef.current = null;
        } else {
          setSimStep(0);
          setTimeout(() => setSimStep(1), 800);
          setTimeout(() => setSimStep(2), 2500);
          r = await transformHandoff(combined);
          setSimStep(4);
        }
        setResult(r);
        const entry: LogEntry = {
          id: crypto.randomUUID(), createdAt: new Date().toISOString(),
          importedAt: new Date().toISOString(),
          title: r.title,
          projectId: selectedProjectId,
          sourceReference: buildSourceReference(text, files, combined.length),
          outputMode: 'handoff',
          today: [], decisions: r.decisions, todo: [],
          relatedProjects: [], tags: r.tags,
          currentStatus: r.currentStatus, nextActions: r.nextActions,
          completed: r.completed, blockers: r.blockers,
          constraints: r.constraints, resumeContext: r.resumeContext,
        };
        addLog(entry); lastEntryId = entry.id; onSaved(entry.id);
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
        addTodosFromLog(entry.id, r.todo);
        todoCount = r.todo.length;
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
        const entry: LogEntry = {
          id: crypto.randomUUID(), createdAt: new Date().toISOString(),
          importedAt: new Date().toISOString(),
          title: r.title,
          projectId: selectedProjectId,
          sourceReference: buildSourceReference(text, files, combined.length),
          outputMode: 'handoff',
          today: [], decisions: r.decisions, todo: htResult.todos.map(td => td.title),
          relatedProjects: [], tags: r.tags,
          currentStatus: r.currentStatus, nextActions: r.nextActions,
          completed: r.completed, blockers: r.blockers,
          constraints: r.constraints, resumeContext: r.resumeContext,
        };
        addLog(entry);
        addTodosFromLogWithMeta(entry.id, htResult.todos);
        todoCount = htResult.todos.length;
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
          title: lang === 'ja' ? 'TODO抽出' : 'TODO Extraction',
          projectId: selectedProjectId,
          sourceReference: buildSourceReference(text, files, combined.length),
          outputMode: 'worklog',
          today: [], decisions: [], todo: todoResult.todos.map(t => t.title),
          relatedProjects: [], tags: [],
        };
        addLog(entry);
        addTodosFromLogWithMeta(entry.id, todoResult.todos);
        todoCount = todoResult.todos.length;
        setResult({ title: entry.title, today: [], decisions: [], todo: todoResult.todos.map(t => t.title), relatedProjects: [], tags: [] });
        setOutputMode('worklog');
        lastEntryId = entry.id; onSaved(entry.id);
        if (!selectedProjectId && projects.length > 0) {
          triggerClassification(entry);
        }
      }

      if (lastEntryId) setSavedId(lastEntryId);
      // Toast notification with effects
      const lines: string[] = [];
      if (isTodoOnly || isHandoffTodo) {
        if (isHandoffTodo) lines.push(lang === 'ja' ? '🔁 ハンドオフを保存しました' : '🔁 Handoff saved');
        if (todoCount > 0) {
          lines.push(lang === 'ja' ? `✔ ${todoCount}件のTODOを抽出しました` : `✔ ${todoCount} TODOs extracted`);
        } else if (isTodoOnly) {
          lines.push(lang === 'ja' ? 'TODOが見つかりませんでした' : 'No TODOs found');
        }
      } else if (doHandoff) lines.push(lang === 'ja' ? '🔁 ハンドオフを保存しました' : '🔁 Handoff saved');
      if (!isTodoOnly && !isHandoffTodo && doWorklog) {
        lines.push(lang === 'ja' ? '📝 ログを保存しました' : '📝 Log saved');
        if (todoCount > 0) {
          lines.push(lang === 'ja' ? `✔ ${todoCount}件のTODOを追加しました` : `✔ ${todoCount} TODOs added`);
        }
      }
      showToast?.(lines.join('\n'), 'success');
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Transform failed.';
      // Translate internal error tags to user-facing messages
      if (raw.includes('[API Key]')) {
        setError(lang === 'ja'
          ? 'APIキーが正しくありません。設定画面で確認してください。'
          : 'Invalid or missing API key. Please check your key in Settings.');
      } else if (raw.includes('[Rate Limit]') || raw.includes('[Overloaded]')) {
        setError(lang === 'ja'
          ? 'APIのレート制限に達しました。しばらく時間をおいてから再度お試しください。'
          : 'API rate limit was hit. Please wait a few minutes and try again.');
      } else if (raw.includes('[Truncated]')) {
        setError(lang === 'ja'
          ? 'レスポンスが長すぎて途中で切れました。入力を短くして再試行してください。'
          : 'Response was truncated. Try shorter input.');
      } else if (raw.includes('[Parse Error]') || raw.includes('[Non-JSON Response]')) {
        setError(lang === 'ja'
          ? 'AIの応答を正しく読み取れませんでした。もう一度お試しください。'
          : 'Could not read the AI response. Please try again.');
      } else if (raw.includes('[Cancelled]')) {
        setError('');
      } else if (raw.includes('[Too Long]')) {
        setError(lang === 'ja'
          ? '入力がAPIの上限を超えています。入力を分割して処理してください。'
          : 'Input exceeds the API size limit. Please split your input.');
      } else if (raw.includes('[Network]') || raw.includes('Failed to fetch') || raw.includes('NetworkError') || (err instanceof TypeError && raw.includes('fetch'))) {
        setError(lang === 'ja'
          ? '通信に失敗しました。ネットワーク接続を確認して再試行してください。'
          : 'Network error. Please check your connection and try again.');
      } else if (raw.includes('[AI Response]')) {
        setError(lang === 'ja'
          ? 'AIから空の応答が返されました。もう一度お試しください。'
          : 'Received an empty response from the AI. Please try again.');
      } else if (raw.includes('[API Error]')) {
        setError(lang === 'ja'
          ? 'APIエラーが発生しました。しばらくしてからもう一度お試しください。'
          : 'An API error occurred. Please try again in a moment.');
      } else if (err instanceof TypeError) {
        // fetch TypeError (network failure, CORS, etc.)
        setError(lang === 'ja'
          ? '通信に失敗しました。ネットワーク接続を確認して再試行してください。'
          : 'Network error. Please check your connection and try again.');
      } else {
        setError(lang === 'ja'
          ? 'エラーが発生しました。再試行してください。'
          : 'An error occurred. Please try again.');
      }
    } finally {
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
      await navigator.clipboard.writeText(md);
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
      console.warn('[Classify] Error:', err);
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
    const mn = getMasterNote(projectId);
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const isStale = mn && (Date.now() - mn.updatedAt > SEVEN_DAYS);
    const msg = (lang === 'ja' ? `「${projectName}」に追加しました` : `Added to "${projectName}"`)
      + '\n' + (isStale ? t('updateSummaryStale', lang) : t('updateSummaryPrompt', lang));
    showToast?.(msg, 'success');
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
      const mn = getMasterNote(projectId);
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      const isStale = mn && (Date.now() - mn.updatedAt > SEVEN_DAYS);
      const msg = (lang === 'ja' ? `「${project.name}」に追加しました` : `Added to "${project.name}"`)
        + '\n' + (isStale ? t('updateSummaryStale', lang) : t('updateSummaryPrompt', lang));
      showToast?.(msg, 'success');
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
    : progress.phase === 'completed' ? (lang === 'ja' ? '完了項目を収集中…' : 'Collecting completed items…')
    : progress.phase === 'consistency' ? (lang === 'ja' ? '整合性チェック中…' : 'Checking consistency…')
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
      {/* Greeting */}
      <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 24px', color: 'var(--text-primary)', textAlign: 'center' }}>
        {getGreeting(lang)}
      </h1>

      {/* Input Card */}
      <div
        className="input-card-hero"
        style={dragging ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-focus)' } : undefined}
      >
        <textarea
          ref={textareaRef}
          className="input-card-textarea"
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
                setPasteFeedback(lang === 'ja' ? `テキストを検出しました（${len.toLocaleString()}文字）` : `Text detected (${len.toLocaleString()} characters)`);
                setTimeout(() => setPasteFeedback(null), 3000);
                ta.scrollTop = 0;
              }
            }, 0);
          }}
          disabled={loading}
          autoFocus
          placeholder={lang === 'ja' ? 'AIとの会話を貼り付け、\nまたはファイルをドロップ' : 'Paste an AI conversation,\nor drop a file here'}
          style={{ opacity: loading ? 0.6 : 1 }}
        />

        {/* Bottom bar: char count + keyboard hint */}
        <div style={{ padding: '0 24px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            {combined.length > 0 && (
              <span className="meta" style={{ fontSize: 11, color: overLimit ? 'var(--error-text)' : overWarn || willChunk ? 'var(--error-text)' : undefined }}>
                {(text.length + files.reduce((sum, f) => sum + f.content.length, 0)).toLocaleString()}{t('chars', lang)}
                {(overWarn || willChunk) && !overLimit && (lang === 'ja'
                  ? '（長い入力のため処理に少し時間がかかる場合があります）'
                  : ' (long input — processing may take a moment)')}
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
        <div style={{ position: 'absolute', right: 14, bottom: 12 }}>
          {loading ? (
            <button
              className="btn btn-primary"
              disabled
              style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: 10 }}
            >
              {progressLabel}
            </button>
          ) : (
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
          )}
        </div>
      </div>

      {/* Toolbar: mode tabs + project + import — single row */}
      <div style={{ maxWidth: 640, margin: '10px auto 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
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
              return (
                <button
                  key={a}
                  className={`mode-selector-btn${isActive ? ' active' : ''}`}
                  onClick={() => { setTransformAction(a); localStorage.setItem('threadlog_transform_action', a); setAdvancedOpen(false); }}
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
            style={{ minWidth: 140, padding: '4px 8px', fontSize: 12, minHeight: 0, width: 'auto', flexShrink: 0 }}
          >
            <option value="">{lang === 'ja' ? 'プロジェクトを選択' : 'Select project'}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <input ref={fileRef} type="file" accept=".txt,.md,.docx,.json" multiple onChange={handleFiles} style={{ display: 'none' }} />
          <button className="input input-sm" onClick={() => fileRef.current?.click()} disabled={loading} style={{ minWidth: 'auto', padding: '4px 8px', fontSize: 12, minHeight: 0, width: 'auto', flexShrink: 0, cursor: 'pointer', textAlign: 'left' }}>
            + {files.length === 0 ? t('importFiles', lang) : t('addMoreFiles', lang)}
          </button>

          {files.length > 0 && (
            <button className="btn-link" onClick={() => setFiles([])} disabled={loading} style={{ fontSize: 11, color: 'var(--error-text)', flexShrink: 0 }}>
              {t('clearAllFiles', lang)}
            </button>
          )}
        </div>
        {/* Advanced modes accordion */}
        <div style={{ marginTop: 4 }}>
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'inherit' }}
          >
            {t(advancedOpen ? 'advancedModesClose' : 'advancedModes', lang)}
          </button>
          {advancedOpen && (
            <div style={{ marginTop: 6 }}>
              <div className="mode-selector">
                {(['worklog', 'worklog_handoff'] as TransformAction[]).map((a) => {
                  const isActive = transformAction === a;
                  const label = t(a === 'worklog_handoff' ? 'modeLabelWorklogHandoff' : 'modeLabelWorklog', lang);
                  return (
                    <button
                      key={a}
                      className={`mode-selector-btn${isActive ? ' active' : ''}`}
                      onClick={() => { setTransformAction(a); localStorage.setItem('threadlog_transform_action', a); }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Capture banner — shown when data arrives from Chrome extension */}
      {captureInfo && (
        <div className="capture-banner" style={{ maxWidth: 640, margin: '12px auto 0' }}>
          <div className="capture-banner-icon">✓</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="capture-banner-title">
              {lang === 'ja'
                ? `${captureSourceLabel(captureInfo.source)}から取り込みました`
                : `Captured from ${captureSourceLabel(captureInfo.source)}`}
            </div>
            <div className="capture-banner-meta">
              {captureInfo.messageCount} messages · {captureInfo.charCount.toLocaleString()} {t('chars', lang)}
            </div>
            <div className="capture-banner-hint">
              {lang === 'ja' ? 'ボタンを押して変換してください' : 'Press the button to transform'}
            </div>
          </div>
          <button
            onClick={() => setCaptureInfo(null)}
            className="capture-banner-close"
            title="Dismiss"
          >×</button>
        </div>
      )}

      {/* File list — between card and options when files exist */}
      {files.length > 0 && !captureInfo && (
        <div className="file-list" style={{ marginTop: 12, maxWidth: 640, margin: '12px auto 0' }}>
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
        <ProgressPanel
          steps={singleSteps}
          state={{ stepIndex: simStep, detail: streamDetail || undefined }}
          lang={lang}
          heading={undefined}
        />
      )}

      {/* Progress card — chunked transform (real progress) */}
      {loading && progress && (
        <ProgressPanel
          heading={undefined}
          steps={[{ label: progress.phase === 'extract' ? tf('processing', lang, progress.current, progress.total)
            : progress.phase === 'merge' ? t('combiningResults', lang)
            : progress.phase === 'completed' ? (lang === 'ja' ? '完了項目を収集中…' : 'Collecting completed items…')
            : progress.phase === 'consistency' ? (lang === 'ja' ? '整合性チェック中…' : 'Checking consistency…')
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
            : progress.phase === 'completed' ? (lang === 'ja' ? 'チャットログ全体から完了項目を収集しています' : 'Collecting completed items from full chat log')
            : progress.phase === 'consistency' ? (lang === 'ja' ? 'マージ結果の整合性を確認しています' : 'Verifying merged results for consistency')
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
      )}

      {error && (
        <div className="alert-error" style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span>{error}</span>
          {combined.trim() && (
            <button className="btn" style={{ fontSize: 12, padding: '4px 12px', minHeight: 26, flexShrink: 0 }} onClick={() => { setError(''); runTransform(transformAction); }}>
              {lang === 'ja' ? '再試行' : 'Retry'}
            </button>
          )}
        </div>
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
                    {lang === 'ja' ? 'ハンドオフを見る' : 'View Handoff'}
                  </button>
                )}
                <button
                  className="btn"
                  onClick={() => onOpenLog(savedId)}
                  style={{ fontSize: 13, padding: '5px 14px', minHeight: 30 }}
                >
                  {savedHandoffId ? (lang === 'ja' ? 'ログを見る' : 'View Log') : t('openSavedLog', lang)}
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
      {result.resumeContext.length > 0 && (
        <div className="resume-context-hero">
          <div className="resume-context-hero-label">{t('sectionResumeContext', lang)}</div>
          <div className="resume-context-hero-body">{result.resumeContext.join('\n')}</div>
        </div>
      )}
      <Section title={t('sectionCurrentStatus', lang)} items={result.currentStatus} />
      <Section title={t('sectionNextActions', lang)} items={result.nextActions} />
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
      showToast?.(lang === 'ja' ? '先にプロジェクトに追加してください' : 'Add to a project first', 'default');
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

  const handleTitleSave = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== log!.title) {
      updateLog(id, { title: trimmed, updatedAt: new Date().toISOString() });
      onRefresh();
      showToast?.(t('titleUpdated', lang));
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
    showToast?.(t('memoSaved', lang));
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
      await sendToSlack(logToMarkdown(log));
      showToast?.(t('slackSent', lang), 'success');
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSendingSlack(false);
    }
  };

  const backLabel = prevView === 'history' ? t('backToLogs', lang) : t('back', lang);
  const isHandoff = log.outputMode === 'handoff';
  const project = log.projectId ? projects.find((p) => p.id === log.projectId) : undefined;

  return (
    <div className="workspace-content">
      <div className="page-header">
        <button className="btn-back" onClick={onBack} style={{ marginBottom: 12 }}>
          ← {backLabel}
        </button>
        <div className="page-header-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              {isHandoff ? <span className="badge-handoff">Handoff</span> : <span className="badge-worklog">Log</span>}
              {project && (
                <span
                  className="tag"
                  style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                  onClick={() => onOpenMasterNote?.(project.id)}
                  title={lang === 'ja' ? 'プロジェクトサマリーを表示' : 'View Project Summary'}
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
              {log.workloadLevel ? (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                    color: WORKLOAD_CONFIG[log.workloadLevel].color,
                    background: WORKLOAD_CONFIG[log.workloadLevel].bg,
                    cursor: 'pointer',
                  }}
                  onClick={handleAnalyzeWorkload}
                  title={lang === 'ja' ? 'クリックで再分析' : 'Click to re-analyze'}
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
              <button
                className="card-menu-btn"
                onClick={() => {
                  if (!log.pinned) {
                    const pinnedCount = loadLogs().filter((l) => l.pinned).length;
                    if (pinnedCount >= 5) { showToast?.(t('pinLimitReached', lang)); return; }
                  }
                  updateLog(id, { pinned: !log.pinned }); onRefresh();
                }}
                style={log.pinned ? { color: 'var(--accent)', flexShrink: 0, marginTop: 2 } : { flexShrink: 0, marginTop: 2 }}
                title={log.pinned ? 'Unpin' : 'Pin'}
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
              title={lang === 'ja' ? '次のAIセッションに貼り付けるコンテキストをコピー' : 'Copy context to paste into your next AI session'}
            >
              <Copy size={13} />
              {lang === 'ja' ? 'AI Context コピー' : 'Copy AI Context'}
            </button>
          )}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              className="card-menu-btn"
              data-menu-trigger="detail"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              title="Actions"
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
                  {lang === 'ja' ? 'AI Context付きコピー' : 'Copy with Context'}
                </button>
                <button className="card-menu-item" onClick={() => handleDetailExport('md')}>
                  Export .md
                </button>
                <button className="card-menu-item" onClick={() => handleDetailExport('json')}>
                  Export .json
                </button>
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

      {/* Handoff copy button + Resume Context hero */}
      {isHandoff && (
        <>
          <div style={{ marginBottom: 12 }}>
            <button
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
              onClick={async () => {
                try {
                  const handoffMd = logToMarkdown(log);
                  let copyText = handoffMd;
                  if (log.projectId) {
                    const ctx = getAiContext(log.projectId);
                    if (ctx) {
                      copyText = ctx + '\n\n---\n\n## Latest Handoff\n' + handoffMd;
                    } else {
                      showToast?.(t('aiContextNeeded', lang), 'default');
                    }
                  }
                  await navigator.clipboard.writeText(copyText);
                  showToast?.(t('logCopied', lang), 'success');
                } catch {
                  showToast?.(t('copyFailed', lang), 'error');
                }
              }}
            >
              <Copy size={14} />
              {t('copyHandoff', lang)}
            </button>
          </div>
          {(() => {
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
              checkedIndices={log.checkedActions || []}
              onToggle={(index) => {
                const current = log.checkedActions || [];
                const next = current.includes(index) ? current.filter((i) => i !== index) : [...current, index];
                updateLog(log.id, { checkedActions: next });
                onRefresh();
              }}
            />
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
          onConfirm={() => { trashLog(log.id); setConfirmDelete(false); onDeleted(); }}
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
  const allLogs = loadLogs();
  // Find other logs in the same project (excluding current)
  const related = log.projectId
    ? allLogs
        .filter((l) => l.projectId === log.projectId && l.id !== log.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8)
    : [];

  if (related.length === 0) return null;

  return (
    <div className="content-card">
      <div className="content-card-header">{t('relatedLogs', lang)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {related.map((r) => {
          return (
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
          );
        })}
      </div>
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

function CheckableCardSection({ title, items, checkedIndices, onToggle }: { title: string; items: string[]; checkedIndices: number[]; onToggle: (index: number) => void }) {
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
          return (
            <li
              key={i}
              onClick={() => onToggle(i)}
              style={{ marginBottom: 4, fontSize: 14, lineHeight: 1.7, color: checked ? 'var(--text-placeholder)' : 'var(--text-body)', display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', textDecoration: checked ? 'line-through' : 'none', padding: '4px 0', userSelect: 'none' }}
            >
              {checked ? <CheckSquare size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 3 }} /> : <Square size={16} style={{ color: 'var(--text-placeholder)', flexShrink: 0, marginTop: 3 }} />}
              {item}
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
