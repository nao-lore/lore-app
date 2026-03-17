import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { CHAR_WARN, needsChunking } from './transform';
import { getChunkTarget, getEngineConcurrency } from './chunkEngine';
import { getStreak, isDemoMode, safeSetItem } from './storage';
import { shouldUseBuiltinApi, getBuiltinUsage } from './provider';
const loadDemoData = () => import('./demoData');
import { Copy, Check, X, Share2 } from 'lucide-react';
import { getGreeting } from './greeting';
import ProgressPanel from './ProgressPanel';
import type { ProgressStep } from './ProgressPanel';
import SkeletonLoader from './SkeletonLoader';
import { logToMarkdown, handoffResultToMarkdown } from './markdown';
import type { TransformResult, HandoffResult, SourceReference, Project } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import ErrorRetryBanner from './ErrorRetryBanner';
import FirstUseTooltip from './FirstUseTooltip';
import { formatRelativeTime } from './utils/dateFormat';
import { HandoffResultDisplay, WorklogResultDisplay } from './ResultDisplay';
import { useTransform } from './hooks/useTransform';
import type { TransformAction } from './hooks/useTransform';
import { useFileImport } from './hooks/useFileImport';
import type { ImportedFile } from './hooks/useFileImport';

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

function InputView({ onSaved, onOpenLog, lang, activeProjectId, projects, showToast, onDirtyChange, pendingTodosCount, lastLogCreatedAt }: { onSaved: (id: string) => void; onOpenLog: (id: string) => void; lang: Lang; activeProjectId: string | null; projects: Project[]; showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void; onDirtyChange?: (dirty: boolean) => void; pendingTodosCount: number; lastLogCreatedAt: string | null }) {
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const [pasteFeedback, setPasteFeedback] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(activeProjectId ?? undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // File state is lifted here so both hooks can access it without circular deps
  const [files, setFiles] = useState<ImportedFile[]>([]);
  const combined = buildCombinedText(text, files);
  const willChunk = needsChunking(combined);

  // Transform hook
  const {
    result, savedResult, error, loading, progress, simStep, streamDetail,
    savedId, savedHandoffId, outputMode, transformAction, setTransformAction,
    wasFirstTransform, classifying, suggestion, postSavePickerOpen, setPostSavePickerOpen,
    runTransform, handlePauseResume, handleCancel,
    handleAcceptSuggestion, handleDismissSuggestion, handlePostSaveAssign,
    resetTransformState, setError,
  } = useTransform({
    lang,
    selectedProjectId,
    projects,
    combined,
    text,
    files,
    willChunk,
    onSaved,
    showToast,
    buildSourceReference,
  });

  // Stable callback for file import reset (avoids recreating useFileImport when transform state changes)
  const resetAllRef = useRef(() => { resetTransformState(); setText(''); });
  resetAllRef.current = () => { resetTransformState(); setText(''); };
  const stableResetAll = useCallback(() => resetAllRef.current(), []);
  const stableSetError = useCallback((err: string) => setError(err), [setError]);

  // File import hook
  const fileImport = useFileImport({
    lang,
    showToast,
    onResetTransform: stableResetAll,
    setError: stableSetError,
    files,
    setFiles,
  });

  const isDirty = combined.trim().length > 0;
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);
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
      onDrop={fileImport.handleDrop}
      onDragOver={fileImport.handleDragOver}
      onDragLeave={fileImport.handleDragLeave}
    >
      {/* Greeting + Project Switcher */}
      <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px', color: 'var(--text-primary)', textAlign: 'center' }}>
        {getGreeting(lang)}{(() => { const streak = getStreak(); return streak > 1 ? ` 🔥 ${streak}` : ''; })()}
      </h1>
      {/* Quick stats */}
      {(() => {
        const parts: string[] = [];
        if (pendingTodosCount > 0) parts.push(lang === 'ja' ? `未完了TODO ${pendingTodosCount}件` : `${pendingTodosCount} pending TODO${pendingTodosCount !== 1 ? 's' : ''}`);
        if (lastLogCreatedAt) parts.push((lang === 'ja' ? '最終変換: ' : 'Last: ') + formatRelativeTime(lastLogCreatedAt, lang as 'en' | 'ja'));
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

          {/* Rich formatted preview */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            padding: 16,
            maxHeight: 400,
            overflow: 'auto',
            fontSize: 13,
            lineHeight: 1.6,
            marginBottom: 16,
          }}>
            <HandoffResultDisplay result={{
              title: savedResult.log.title,
              currentStatus: savedResult.log.currentStatus ?? [],
              nextActions: savedResult.log.nextActions ?? [],
              nextActionItems: savedResult.log.nextActionItems,
              actionBacklog: savedResult.log.actionBacklog,
              completed: savedResult.log.completed ?? [],
              blockers: savedResult.log.blockers ?? [],
              decisions: savedResult.log.decisions ?? [],
              decisionRationales: savedResult.log.decisionRationales,
              constraints: savedResult.log.constraints ?? [],
              resumeContext: savedResult.log.resumeContext ?? [],
              resumeChecklist: savedResult.log.resumeChecklist,
              handoffMeta: savedResult.log.handoffMeta,
              tags: savedResult.log.tags ?? [],
            }} lang={lang} />
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-sm">
            {savedResult.fullContext ? (
              <button
                className="btn btn-primary"
                onClick={() => {
                  const text = savedResult.fullContext + '\n\n---\n\n' + savedResult.markdown;
                  try { navigator.clipboard.writeText(text); } catch (err) { if (import.meta.env.DEV) console.warn('[InputView] clipboard write:', err); }
                  showToast?.(t('copiedToClipboard', lang), 'success');
                }}
              >
                <Copy size={14} /> {t('copyAiContext', lang)}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => {
                  try { navigator.clipboard.writeText(savedResult.markdown); } catch (err) { if (import.meta.env.DEV) console.warn('[InputView] clipboard write:', err); }
                  showToast?.(t('copiedToClipboard', lang), 'success');
                }}
              >
                <Copy size={14} /> {t('copyHandoff', lang)}
              </button>
            )}
            <button
              className="btn"
              onClick={() => {
                resetTransformState();
                setText('');
                setFiles([]);
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
                } catch (err) { if (import.meta.env.DEV) console.warn('[InputView] share:', err); }
              }}>
                <Share2 size={14} /> {t('share', lang)}
              </button>
            )}
          </div>

          {/* Subtitle explaining the buttons */}
          {savedResult.fullContext && (
            <p className="text-xs-muted" style={{ marginTop: 8 }}>
              {t('copyAiContextTitle', lang)}
            </p>
          )}
        </div>
      )}

      {/* Input Card — hidden when preview panel is shown */}
      {!savedResult && (<div
        className="input-card-hero"
        style={fileImport.dragging ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-focus)', position: 'relative' as const } : { position: 'relative' as const }}
      >
        {/* Drag & drop overlay */}
        {fileImport.dragging && (
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
        <div className="flex-row justify-between" style={{ padding: '0 24px 6px' }}>
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
        <div className="flex-row" style={{ position: 'absolute', right: 14, bottom: 12, gap: 6 }}>
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
                {t(transformAction === 'handoff_todo' ? 'createBtnHandoffTodo' : transformAction === 'todo_only' ? 'createBtnTodoOnly' : 'createBtnHandoff', lang)}
              </button>
            </FirstUseTooltip>
          )}
        </div>
      </div>)}

      {/* Toolbar: mode tabs + project + import — single row */}
      {!savedResult && (<div className="flex-col" style={{ maxWidth: 760, margin: '10px auto 0', gap: 6 }}>
        <div className="flex-row flex-wrap" style={{ gap: 10 }}>
          <div className="mode-selector" role="radiogroup" aria-label={t('ariaTransformMode', lang)}>
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
                  role="radio"
                  aria-checked={isActive}
                  title={tooltip}
                  onClick={() => { setTransformAction(a); safeSetItem('threadlog_transform_action', a); }}
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

          <input ref={fileImport.fileRef} type="file" accept=".txt,.md,.docx,.json" multiple onChange={fileImport.handleFiles} aria-label={t('ariaSelectFile', lang)} style={{ display: 'none' }} />
          <button className="input input-sm" onClick={() => fileImport.fileRef.current?.click()} disabled={loading} style={{ minWidth: 'auto', padding: '4px 8px', fontSize: 12, minHeight: 0, width: 'auto', flexShrink: 0, cursor: 'pointer', textAlign: 'left' }}>
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
      {fileImport.captureInfo && (
        <div className="capture-banner" style={{ maxWidth: 760, margin: '12px auto 0' }}>
          <div className="capture-banner-icon">✓</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="capture-banner-title">
              {tf('capturedFrom', lang, captureSourceLabel(fileImport.captureInfo.source))}
            </div>
            <div className="capture-banner-meta">
              {fileImport.captureInfo.messageCount} messages · {fileImport.captureInfo.charCount.toLocaleString()} {t('chars', lang)}
            </div>
            <div className="capture-banner-hint">
              {t('captureTransformHint', lang)}
            </div>
          </div>
          <button
            onClick={() => fileImport.setCaptureInfo(null)}
            className="capture-banner-close"
            title={t('titleDismiss', lang)}
            aria-label={t('ariaDismissNotification', lang)}
          >×</button>
        </div>
      )}

      {/* File list — between card and options when files exist */}
      {files.length > 0 && !fileImport.captureInfo && !result && (
        <div className="file-list" style={{ marginTop: 12, maxWidth: 760, margin: '12px auto 0' }}>
          {files.map((f, i) => (
            <div key={i} className="file-list-item">
              <span className="text-muted flex-1 truncate">
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
                onClick={() => fileImport.removeFile(i)}
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
        <div className="flex flex-wrap gap-sm" style={{ marginTop: 14, justifyContent: 'center' }}>
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
        <div aria-live="polite">
          <ProgressPanel
            steps={singleSteps}
            state={{ stepIndex: simStep, detail: streamDetail || undefined }}
            lang={lang}
            heading={undefined}
          />
          <SkeletonLoader lang={lang} />
        </div>
      )}

      {/* Progress card — chunked transform (real progress) */}
      {loading && progress && (
        <div aria-live="polite">
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
        </div>
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
        <div className="result-panel" aria-live="polite" style={{ marginTop: 28 }}>
          {savedId && (
            <div className="alert-success" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span>{t('savedToLogs', lang)}</span>
              <div className="flex gap-sm">
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
              <button className="btn" onClick={() => { handleDismissSuggestion(); setPostSavePickerOpen(true); }} style={{ fontSize: 12, padding: '3px 10px', minHeight: 24 }}>
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

          <div className="flex flex-wrap gap-sm" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
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

export default memo(InputView);
