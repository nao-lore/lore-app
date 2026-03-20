import { useState, memo } from 'react';
import { Copy, Check } from 'lucide-react';
import type { TransformResult, HandoffResult, Project } from '../types';
import { t } from '../i18n';
import type { Lang } from '../i18n';
import { logToMarkdown, handoffResultToMarkdown } from '../markdown';
import { copyToClipboard } from '../utils/clipboard';
import { downloadFile } from '../utils/downloadFile';
import { HandoffResultDisplay, WorklogResultDisplay } from '../ResultDisplay';

interface InputResultPanelProps {
  result: TransformResult | HandoffResult;
  outputMode: string;
  savedId: string | null;
  savedHandoffId: string | null;
  classifying: boolean;
  suggestion: { projectName: string } | null;
  selectedProjectId: string | undefined;
  projects: Project[];
  postSavePickerOpen: boolean;
  onSetPostSavePickerOpen: (v: boolean) => void;
  onAcceptSuggestion: () => void;
  onDismissSuggestion: () => void;
  onPostSaveAssign: (projectId: string) => void;
  onOpenLog: (id: string) => void;
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

export const InputResultPanel = memo(function InputResultPanel({
  result, outputMode, savedId, savedHandoffId,
  classifying, suggestion, selectedProjectId, projects,
  postSavePickerOpen, onSetPostSavePickerOpen,
  onAcceptSuggestion, onDismissSuggestion, onPostSaveAssign,
  onOpenLog, lang, showToast,
}: InputResultPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
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

  return (
    <div className="result-panel result-panel-spaced" aria-live="polite">
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
          <button className="btn btn-primary btn-sm-compact" onClick={onAcceptSuggestion}>
            {t('classifyAccept', lang)}
          </button>
          <button className="btn btn-sm-compact" onClick={() => { onDismissSuggestion(); onSetPostSavePickerOpen(true); }}>
            {t('classifyPickOther', lang)}
          </button>
          <button className="btn btn-sm-compact" onClick={onDismissSuggestion}>
            {t('classifyDismiss', lang)}
          </button>
        </div>
      )}
      {/* Post-save project picker — always visible inline when no project assigned */}
      {savedId && !selectedProjectId && !suggestion && !classifying && projects.length > 0 && (
        <div className="post-save-picker-prominent mb-lg">
          <p className="post-save-picker-prompt">{t('addToProjectPrompt', lang)}</p>
          <div className="flex flex-wrap gap-6">
            {projects.map((p) => (
              <button key={p.id} className="btn btn-sm-compact" onClick={() => onPostSaveAssign(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
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
  );
});
