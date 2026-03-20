import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { CHAR_WARN, needsChunking } from './transform';
import { getChunkTarget, getEngineConcurrency } from './chunkEngine';
import { getStreak, isDemoMode } from './storage';
const loadDemoData = () => import('./demoData');
import type { ProgressStep } from './ProgressPanel';
import type { SourceReference, Project } from './types';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import ErrorRetryBanner from './ErrorRetryBanner';
import { formatRelativeTime } from './utils/dateFormat';
import { getGreeting } from './greeting';
import { useTransform } from './hooks/useTransform';
import { useFileImport } from './hooks/useFileImport';
import type { ImportedFile } from './hooks/useFileImport';
import PostGenerationPreview from './components/PostGenerationPreview';
import InputToolbar from './components/InputToolbar';
import ProgressDisplay from './components/ProgressDisplay';
import { InputTextArea } from './components/InputTextArea';
import { InputResultPanel } from './components/InputResultPanel';
import { CaptureBanner, InputFileList, InputWarnings } from './components/InputFileList';
import { DAILY_LIMIT_FREE } from './utils/trialManager';

function buildCombinedText(pastedText: string, files: ImportedFile[]): string {
  const parts: string[] = [];
  if (pastedText.trim()) parts.push(pastedText.trim());
  for (const f of files) parts.push(`--- FILE: ${f.name} ---\n${f.content.trim()}`);
  return parts.join('\n\n');
}

function buildSourceReference(_pastedText: string, files: ImportedFile[], charCount: number): SourceReference {
  const now = new Date().toISOString();
  if (files.length > 0) {
    const names = files.map((f) => f.name);
    const ext = names[0].split('.').pop()?.toLowerCase() || 'unknown';
    const oldest = files.reduce((min, f) => f.lastModified && f.lastModified < min ? f.lastModified : min, files[0].lastModified || Date.now());
    return { fileName: names.join(', '), sourceType: ext, importedAt: now, originalDate: new Date(oldest).toISOString().slice(0, 10), charCount };
  }
  return { sourceType: 'paste', importedAt: now, charCount };
}

function InputView({ onSaved, onOpenLog, lang, activeProjectId, projects, showToast, onDirtyChange, pendingTodosCount, lastLogCreatedAt, onRefresh }: { onSaved: (id: string) => void; onOpenLog: (id: string) => void; lang: Lang; activeProjectId: string | null; projects: Project[]; showToast?: (msg: string, type?: 'default' | 'success' | 'error', action?: { label: string; onClick: () => void }) => void; onDirtyChange?: (dirty: boolean) => void; pendingTodosCount: number; lastLogCreatedAt: string | null; onRefresh?: () => void }) {
  const [text, setText] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get('text');
    if (shared) { const url = new URL(window.location.href); url.searchParams.delete('text'); window.history.replaceState({}, '', url.pathname + url.search); return shared; }
    return '';
  });
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(activeProjectId ?? undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const undoTextRef = useRef<string>('');
  const [files, setFiles] = useState<ImportedFile[]>([]);
  const combined = buildCombinedText(text, files);
  const willChunk = needsChunking(combined);

  const {
    result, savedResult, error, loading, progress, simStep, streamDetail,
    savedId, savedHandoffId, outputMode, transformAction, setTransformAction,
    wasFirstTransform, apiCallCount, classifying, suggestion, postSavePickerOpen, setPostSavePickerOpen,
    runTransform, handlePauseResume, handleCancel,
    handleAcceptSuggestion, handleDismissSuggestion, handlePostSaveAssign,
    resetTransformState, setError,
  } = useTransform({ lang, selectedProjectId, projects, combined, text, files, willChunk, onSaved, showToast, buildSourceReference });

  const resetAllRef = useRef(() => { resetTransformState(); setText(''); });
  useEffect(() => { resetAllRef.current = () => { resetTransformState(); setText(''); }; });
  const stableResetAll = useCallback(() => resetAllRef.current(), []);
  const stableSetError = useCallback((err: string) => setError(err), [setError]);

  const { fileRef: fileImportRef, ...fh } = useFileImport({ lang, showToast, onResetTransform: stableResetAll, setError: stableSetError, files, setFiles });

  const isDirty = combined.trim().length > 0;
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);
  const isLargeInput = combined.length > 300_000;
  const overLimit = combined.length > 500_000;
  const overWarn = combined.length > CHAR_WARN && !willChunk;
  const estChunks = willChunk ? Math.ceil(combined.length / getChunkTarget(outputMode)) : 0;
  const concurrency = getEngineConcurrency();
  const estMinutes = willChunk ? Math.ceil((Math.ceil(estChunks / concurrency) * 8) / 60) : 0;

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const demoPrefilled = useRef(false);
  useEffect(() => { if (demoPrefilled.current) return; demoPrefilled.current = true; if (isDemoMode() && !text && files.length === 0) loadDemoData().then(({ getDemoConversation }) => setText(getDemoConversation(lang))).catch(() => {}); }, [text, files.length, lang]);

  const singleSteps: ProgressStep[] = [
    { label: t('stepAnalyzing', lang), duration: 3000 },
    { label: t('stepExtracting', lang), duration: 4000 },
    { label: t('stepOrganizing', lang), duration: 2000 },
    { label: t('stepFinalizing', lang), duration: 1000 },
  ];

  const progressPct = progress ? (progress.phase === 'merge' ? 95 : Math.round((progress.current / progress.total) * 90)) : 0;
  const progressLabel = !progress ? t('transforming', lang) : progress.phase === 'extract' ? tf('processing', lang, progress.current, progress.total) : progress.phase === 'merge' ? t('combiningResults', lang) : progress.phase === 'completed' ? t('phaseCollectingCompleted', lang) : progress.phase === 'consistency' ? t('phaseConsistencyCheck', lang) : progress.phase === 'waiting' ? tf('waitingForApi', lang, progress.retryIn ?? 0) : progress.phase === 'paused' ? (progress.autoPaused ? t('autoPaused', lang) : t('paused', lang)) : t('transforming', lang);

  const handleStartNew = () => {
    const prev = text; const prevFiles = files; undoTextRef.current = prev; resetTransformState(); setText(''); setFiles([]);
    if (prev.trim() || prevFiles.length > 0) showToast?.(t('inputCleared', lang) || 'Cleared', 'default', { label: t('undo', lang) || 'Undo', onClick: () => { setText(prev); setFiles(prevFiles); } });
  };

  const handleClearWithUndo = () => {
    const prev = text; undoTextRef.current = prev; setText(''); textareaRef.current?.focus();
    if (prev.trim()) showToast?.(t('inputCleared', lang) || 'Cleared', 'default', { label: t('undo', lang) || 'Undo', onClick: () => setText(prev) });
  };

  const filesCharTotal = files.reduce((sum, f) => sum + f.content.length, 0);

  return (
    <div className="workspace-content-centered" onDrop={fh.handleDrop} onDragOver={fh.handleDragOver} onDragLeave={fh.handleDragLeave}>
      <h1 className="text-center input-greeting">
        {getGreeting(lang)}{(() => { const streak = getStreak(); return streak > 1 ? <span className="streak-badge" title={`${streak} day streak`}> {'\uD83D\uDD25'} {streak}</span> : null; })()}
      </h1>
      {(() => { const parts: string[] = []; if (pendingTodosCount > 0) parts.push(lang === 'ja' ? `未完了TODO ${pendingTodosCount}件` : `${pendingTodosCount} pending TODO${pendingTodosCount !== 1 ? 's' : ''}`); if (lastLogCreatedAt) parts.push((lang === 'ja' ? '最終変換: ' : 'Last: ') + formatRelativeTime(lastLogCreatedAt, lang as 'en' | 'ja')); return parts.length > 0 ? <p className="text-center input-stats">{parts.join(' · ')}</p> : null; })()}

      {savedResult && <PostGenerationPreview savedResult={savedResult} lang={lang} showToast={showToast} onStartNew={handleStartNew} wasFirstTransform={wasFirstTransform} apiCallCount={apiCallCount} />}

      {!savedResult && <InputTextArea text={text} setText={setText} textareaRef={textareaRef} loading={loading} combined={combined} overLimit={overLimit} overWarn={overWarn} willChunk={willChunk} filesCount={files.length} filesCharTotal={filesCharTotal} transformAction={transformAction} progressLabel={progressLabel} dragging={!!fh.dragging} lang={lang} onRunTransform={runTransform} onClearWithUndo={handleClearWithUndo} />}

      {!savedResult && <InputToolbar transformAction={transformAction} setTransformAction={setTransformAction} selectedProjectId={selectedProjectId} setSelectedProjectId={setSelectedProjectId} loading={loading} files={files} setFiles={setFiles} fileImportRef={fileImportRef} handleFiles={fh.handleFiles} lang={lang} projects={projects} showToast={showToast} onProjectAdded={onRefresh} />}

      {fh.captureInfo && <CaptureBanner captureInfo={fh.captureInfo} lang={lang} onDismiss={() => fh.setCaptureInfo(null)} />}

      {files.length > 0 && !fh.captureInfo && !result && <InputFileList files={files} lang={lang} onRemoveFile={fh.removeFile} />}

      {(overLimit || isLargeInput) && !loading && <InputWarnings overLimit={overLimit} isLargeInput={isLargeInput} lang={lang} />}

      <ProgressDisplay loading={loading} progress={progress} simStep={simStep} streamDetail={streamDetail} lang={lang} singleSteps={singleSteps} estMinutes={estMinutes} progressPct={progressPct} onPauseResume={handlePauseResume} onCancel={handleCancel} />

      {error && <ErrorRetryBanner message={error} retryLabel={t('tryAgain', lang)} dismissLabel={t('ariaDismissNotification', lang)} onRetry={combined.trim() ? () => { setError(''); runTransform(transformAction); } : undefined} onDismiss={() => setError('')} actionLabel={error.includes(String(DAILY_LIMIT_FREE)) ? t('upgradeToPro', lang) : undefined} onAction={error.includes(String(DAILY_LIMIT_FREE)) ? () => window.dispatchEvent(new CustomEvent('lore-navigate-pricing')) : undefined} />}

      {result && <InputResultPanel result={result} outputMode={outputMode} savedId={savedId} savedHandoffId={savedHandoffId} classifying={classifying} suggestion={suggestion} selectedProjectId={selectedProjectId} projects={projects} postSavePickerOpen={postSavePickerOpen} onSetPostSavePickerOpen={setPostSavePickerOpen} onAcceptSuggestion={handleAcceptSuggestion} onDismissSuggestion={handleDismissSuggestion} onPostSaveAssign={handlePostSaveAssign} onOpenLog={onOpenLog} lang={lang} showToast={showToast} />}
    </div>
  );
}

export default memo(InputView);
