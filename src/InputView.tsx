import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { CHAR_WARN, needsChunking } from './transform';
import { getChunkTarget, getEngineConcurrency } from './chunkEngine';
import { getStreak, isDemoMode } from './storage';
import { shouldUseBuiltinApi, getBuiltinUsage } from './provider';
const loadDemoData = () => import('./demoData');
import { Copy, Check, X } from 'lucide-react';
import { getGreeting } from './greeting';
import type { ProgressStep } from './ProgressPanel';
import { logToMarkdown, handoffResultToMarkdown } from './markdown';
import type { TransformResult, HandoffResult, SourceReference, Project } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import ErrorRetryBanner from './ErrorRetryBanner';
import FirstUseTooltip from './FirstUseTooltip';
import { formatRelativeTime } from './utils/dateFormat';
import { copyToClipboard } from './utils/clipboard';
import { downloadFile } from './utils/downloadFile';
import { HandoffResultDisplay, WorklogResultDisplay } from './ResultDisplay';
import { useTransform } from './hooks/useTransform';
import { useFileImport } from './hooks/useFileImport';
import type { ImportedFile } from './hooks/useFileImport';
import PostGenerationPreview from './components/PostGenerationPreview';
import InputToolbar from './components/InputToolbar';
import ProgressDisplay from './components/ProgressDisplay';

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

function InputView({ onSaved, onOpenLog, lang, activeProjectId, projects, showToast, onDirtyChange, pendingTodosCount, lastLogCreatedAt }: { onSaved: (id: string) => void; onOpenLog: (id: string) => void; lang: Lang; activeProjectId: string | null; projects: Project[]; showToast?: (msg: string, type?: 'default' | 'success' | 'error', action?: { label: string; onClick: () => void }) => void; onDirtyChange?: (dirty: boolean) => void; pendingTodosCount: number; lastLogCreatedAt: string | null }) {
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const [pasteFeedback, setPasteFeedback] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(activeProjectId ?? undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const undoTextRef = useRef<string>('');

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
  useEffect(() => {
    resetAllRef.current = () => { resetTransformState(); setText(''); };
  });
  const stableResetAll = useCallback(() => resetAllRef.current(), []);
  const stableSetError = useCallback((err: string) => setError(err), [setError]);

  // File import hook
  const { fileRef: fileImportRef, ...fileImportHandlers } = useFileImport({
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

  // Pre-fill demo conversation if demo mode and empty (mount-only via ref guard)
  const demoPrefilled = useRef(false);
  useEffect(() => {
    if (demoPrefilled.current) return;
    demoPrefilled.current = true;
    if (isDemoMode() && !text && files.length === 0) {
      loadDemoData().then(({ getDemoConversation }) => setText(getDemoConversation(lang)));
    }
  }, [text, files.length, lang]);


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

  const handleStartNew = () => {
    const prev = text;
    const prevFiles = files;
    undoTextRef.current = prev;
    resetTransformState();
    setText('');
    setFiles([]);
    if (prev.trim() || prevFiles.length > 0) {
      showToast?.(t('inputCleared', lang) || 'Cleared', 'default', {
        label: t('undo', lang) || 'Undo',
        onClick: () => { setText(prev); setFiles(prevFiles); },
      });
    }
  };

  return (
    <div
      className="workspace-content-centered"
      onDrop={fileImportHandlers.handleDrop}
      onDragOver={fileImportHandlers.handleDragOver}
      onDragLeave={fileImportHandlers.handleDragLeave}
    >
      {/* Greeting + Project Switcher */}
      <h1 className="text-center input-greeting">
        {getGreeting(lang)}{(() => { const streak = getStreak(); return streak > 1 ? ` 🔥 ${streak}` : ''; })()}
      </h1>
      {/* Quick stats */}
      {(() => {
        const parts: string[] = [];
        if (pendingTodosCount > 0) parts.push(lang === 'ja' ? `未完了TODO ${pendingTodosCount}件` : `${pendingTodosCount} pending TODO${pendingTodosCount !== 1 ? 's' : ''}`);
        if (lastLogCreatedAt) parts.push((lang === 'ja' ? '最終変換: ' : 'Last: ') + formatRelativeTime(lastLogCreatedAt, lang as 'en' | 'ja'));
        return parts.length > 0 ? (
          <p className="text-center input-stats">
            {parts.join(' · ')}
          </p>
        ) : null;
      })()}

      {/* Post-generation preview panel */}
      {savedResult && (
        <PostGenerationPreview
          savedResult={savedResult}
          lang={lang}
          showToast={showToast}
          onStartNew={handleStartNew}
          wasFirstTransform={wasFirstTransform}
        />
      )}

      {/* Input Card — hidden when preview panel is shown */}
      {!savedResult && (<div
        className="input-card-hero relative"
        style={fileImportHandlers.dragging ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-focus)' } : undefined}
      >
        {/* Drag & drop overlay */}
        {fileImportHandlers.dragging && (
          <div className="flex-center input-drag-overlay">
            <span className="input-drag-label">
              {t('dropFilesHere', lang)}
            </span>
          </div>
        )}

        {/* Clear text button */}
        {text.trim() && !loading && (
          <button
            className="input-clear-btn"
            onClick={() => {
              const prev = text;
              undoTextRef.current = prev;
              setText('');
              textareaRef.current?.focus();
              if (prev.trim()) {
                showToast?.(t('inputCleared', lang) || 'Cleared', 'default', {
                  label: t('undo', lang) || 'Undo',
                  onClick: () => setText(prev),
                });
              }
            }}
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
        <div className="flex-row justify-between input-bottom-bar">
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
            <span className="meta text-xs opacity-half">
              {navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+Enter
            </span>
          )}
        </div>

        {/* Transform button — bottom right inside card */}
        <div className="flex-row gap-xs input-transform-area">
          {!loading && shouldUseBuiltinApi() && (() => {
            const { used, limit } = getBuiltinUsage();
            return (
              <span className="input-usage-counter">
                {used}/{limit}
              </span>
            );
          })()}
          {loading ? (
            <button
              className="btn btn-primary btn-transform"
              disabled
            >
              {progressLabel}
            </button>
          ) : (
            <FirstUseTooltip id="transform" text={lang === 'ja' ? 'AI会話を上に貼り付けて、ここをクリック！' : 'Paste an AI conversation above, then click here!'}>
              <button
                className="btn btn-primary btn-transform"
                onClick={() => runTransform(transformAction)}
                disabled={!combined.trim() || overLimit}
                style={{ opacity: (!combined.trim() || overLimit) ? 0.35 : 1 }}
              >
                {t(transformAction === 'handoff_todo' ? 'createBtnHandoffTodo' : transformAction === 'todo_only' ? 'createBtnTodoOnly' : 'createBtnHandoff', lang)}
              </button>
            </FirstUseTooltip>
          )}
        </div>
      </div>)}

      {/* Toolbar: mode tabs + project + import */}
      {!savedResult && (
        <InputToolbar
          transformAction={transformAction}
          setTransformAction={setTransformAction}
          selectedProjectId={selectedProjectId}
          setSelectedProjectId={setSelectedProjectId}
          loading={loading}
          files={files}
          setFiles={setFiles}
          fileImportRef={fileImportRef}
          handleFiles={fileImportHandlers.handleFiles}
          lang={lang}
          projects={projects}
          showToast={showToast}
        />
      )}

      {/* Capture banner — shown when data arrives from Chrome extension */}
      {fileImportHandlers.captureInfo && (
        <div className="capture-banner input-section-margin">
          <div className="capture-banner-icon">✓</div>
          <div className="flex-1">
            <div className="capture-banner-title">
              {tf('capturedFrom', lang, captureSourceLabel(fileImportHandlers.captureInfo.source))}
            </div>
            <div className="capture-banner-meta">
              {fileImportHandlers.captureInfo.messageCount} messages · {fileImportHandlers.captureInfo.charCount.toLocaleString()} {t('chars', lang)}
            </div>
            <div className="capture-banner-hint">
              {t('captureTransformHint', lang)}
            </div>
          </div>
          <button
            onClick={() => fileImportHandlers.setCaptureInfo(null)}
            className="capture-banner-close"
            title={t('titleDismiss', lang)}
            aria-label={t('ariaDismissNotification', lang)}
          >×</button>
        </div>
      )}

      {/* File list — between card and options when files exist */}
      {files.length > 0 && !fileImportHandlers.captureInfo && !result && (
        <div className="file-list input-section-margin">
          {files.map((f, i) => (
            <div key={i} className="file-list-item">
              <span className="text-muted flex-1 truncate">
                {f.name}
              </span>
              {f.lastModified && (
                <span className="meta file-meta" style={{ color: 'var(--border-hover)' }}>
                  {formatFileDate(f.lastModified)}
                </span>
              )}
              <span className="meta file-meta">
                {f.content.length.toLocaleString()}
              </span>
              <button
                className="file-remove-btn"
                onClick={() => fileImportHandlers.removeFile(i)}
                title={t('titleRemoveFile', lang)}
                aria-label={tf('ariaRemoveFile', lang, f.name)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Warnings — compact inline pills */}
      {(overLimit || isLargeInput) && !loading && (
        <div className="flex flex-wrap gap-sm input-warnings">
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

      {/* Progress display (single + chunked) */}
      <ProgressDisplay
        loading={loading}
        progress={progress}
        simStep={simStep}
        streamDetail={streamDetail}
        lang={lang}
        singleSteps={singleSteps}
        estMinutes={estMinutes}
        progressPct={progressPct}
        onPauseResume={handlePauseResume}
        onCancel={handleCancel}
      />

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
            <div className="alert-success flex-row flex-wrap justify-between mb-xl gap-sm">
              <span>{t('savedToLogs', lang)}</span>
              <div className="flex gap-sm">
                {savedHandoffId && (
                  <button
                    className="btn btn-md-compact"
                    onClick={() => onOpenLog(savedHandoffId)}
                  >
                    {t('viewHandoff', lang)}
                  </button>
                )}
                <button
                  className="btn btn-md-compact"
                  onClick={() => onOpenLog(savedId)}
                >
                  {savedHandoffId ? t('viewLog', lang) : t('openSavedLog', lang)}
                </button>
              </div>
            </div>
          )}
          {classifying && (
            <div className="mb-lg classifying-banner">
              {t('classifying', lang)}
            </div>
          )}
          {suggestion && (
            <div className="flex-row flex-wrap mb-lg suggestion-banner">
              <span>{t('suggestedProject', lang)}: <strong>{suggestion.projectName}</strong></span>
              <button className="btn btn-primary btn-sm-compact" onClick={handleAcceptSuggestion}>
                {t('classifyAccept', lang)}
              </button>
              <button className="btn btn-sm-compact" onClick={() => { handleDismissSuggestion(); setPostSavePickerOpen(true); }}>
                {t('classifyPickOther', lang)}
              </button>
              <button className="btn btn-sm-compact" onClick={handleDismissSuggestion}>
                {t('classifyDismiss', lang)}
              </button>
            </div>
          )}
          {/* Post-save project picker — only when unassigned and no suggestion */}
          {savedId && !selectedProjectId && !suggestion && !classifying && projects.length > 0 && (
            <div className="flex-row flex-wrap mb-lg post-save-picker">
              <span>{t('addToProject', lang)}</span>
              {postSavePickerOpen ? (
                <div className="flex flex-wrap gap-6">
                  {projects.map((p) => (
                    <button key={p.id} className="btn btn-sm-compact" onClick={() => handlePostSaveAssign(p.id)}>
                      {p.name}
                    </button>
                  ))}
                  <button className="btn btn-sm-compact" onClick={() => setPostSavePickerOpen(false)}>
                    ×
                  </button>
                </div>
              ) : (
                <button className="btn btn-primary btn-sm-compact" onClick={() => setPostSavePickerOpen(true)}>
                  {t('addToProject', lang)}
                </button>
              )}
            </div>
          )}
          <h3 className="result-title">{result.title}</h3>

          {outputMode === 'handoff' ? (
            <HandoffResultDisplay result={result as HandoffResult} lang={lang} />
          ) : (
            <WorklogResultDisplay result={result as TransformResult} lang={lang} />
          )}

          <div className="flex flex-wrap gap-sm border-top result-actions">
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
