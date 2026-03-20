import { memo, useState, useCallback } from 'react';
import { Copy, Share2, ThumbsUp, ThumbsDown, Code, Eye } from 'lucide-react';
import { HandoffResultDisplay } from '../ResultDisplay';
import { t, tf } from '../i18n';
import type { Lang } from '../i18n';
import type { SavedResult } from '../hooks/useTransform';
import { saveContextForExtension } from '../utils/extensionBridge';
import { safeGetItem, safeSetItem } from '../storage';

type SavedResultData = SavedResult;

interface PostGenerationPreviewProps {
  savedResult: SavedResultData;
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error', action?: { label: string; onClick: () => void }) => void;
  onStartNew: () => void;
  wasFirstTransform: boolean;
  apiCallCount?: number;
}

export default memo(function PostGenerationPreview({ savedResult, lang, showToast, onStartNew, wasFirstTransform, apiCallCount }: PostGenerationPreviewProps) {
  const [showRawMarkdown, setShowRawMarkdown] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState(false);

  const decisionsCount = savedResult.log.decisions?.length ?? 0;
  const actionsCount = (savedResult.log.nextActions?.length ?? 0) + (savedResult.log.nextActionItems?.length ?? 0);
  const blockersCount = savedResult.log.blockers?.length ?? 0;

  const handleFeedback = useCallback((positive: boolean) => {
    const feedbackData = {
      logId: savedResult.log.id,
      positive,
      timestamp: Date.now(),
    };
    try {
      const existing = JSON.parse(safeGetItem('threadlog_feedback') || '[]') as unknown[];
      existing.push(feedbackData);
      safeSetItem('threadlog_feedback', JSON.stringify(existing));
    } catch {
      safeSetItem('threadlog_feedback', JSON.stringify([feedbackData]));
    }
    setFeedbackGiven(true);
    showToast?.(t('feedbackThanks', lang), 'success');
  }, [savedResult.log.id, lang, showToast]);

  return (
    <div className="input-preview">
      <h3 className="mb-md result-heading">{wasFirstTransform ? `🎉 ${t('logSaved', lang)}` : t('logSaved', lang)}</h3>

      {/* #24 Extraction summary + #71 API cost display */}
      {(decisionsCount > 0 || actionsCount > 0 || blockersCount > 0 || (apiCallCount && apiCallCount > 0)) && (
        <p className="text-sm text-muted mb-sm">
          {(decisionsCount > 0 || actionsCount > 0 || blockersCount > 0) && tf('extractionSummary', lang, decisionsCount, actionsCount, blockersCount)}
          {apiCallCount && apiCallCount > 0 && (decisionsCount > 0 || actionsCount > 0 || blockersCount > 0) ? ' · ' : ''}
          {apiCallCount && apiCallCount > 0 ? tf('processedInSteps', lang, apiCallCount) : ''}
        </p>
      )}

      {/* #25 Raw markdown toggle */}
      <div className="flex-row mb-sm">
        <button
          className="btn-link flex-row"
          style={{ gap: 4, fontSize: 12 }}
          onClick={() => setShowRawMarkdown(!showRawMarkdown)}
        >
          {showRawMarkdown ? <Eye size={13} /> : <Code size={13} />}
          {showRawMarkdown ? t('showRichView', lang) : t('showRawMarkdown', lang)}
        </button>
      </div>

      {/* Rich formatted preview or raw markdown */}
      <div className="mb-lg input-preview-result">
        {showRawMarkdown ? (
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.6, margin: 0, padding: 12, background: 'var(--bg-secondary, #f5f5f5)', borderRadius: 8, maxHeight: 400, overflow: 'auto' }}>
            {savedResult.markdown}
          </pre>
        ) : (
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
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-sm">
        {savedResult.fullContext ? (
          <button
            className="btn btn-primary"
            onClick={() => {
              const text = savedResult.fullContext + '\n\n---\n\n' + savedResult.markdown;
              try { navigator.clipboard.writeText(text); } catch (err) { if (import.meta.env.DEV) console.warn('[PostGenerationPreview] clipboard write:', err); }
              // Persist for Chrome extension
              if (savedResult.log.projectId) {
                saveContextForExtension(
                  savedResult.log.projectId,
                  savedResult.log.title,
                  text,
                  savedResult.markdown,
                  savedResult.log.title,
                );
              }
              showToast?.(t('copiedToClipboard', lang), 'success');
            }}
          >
            <Copy size={14} /> {t('copyAiContext', lang)}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => {
              try { navigator.clipboard.writeText(savedResult.markdown); } catch (err) { if (import.meta.env.DEV) console.warn('[PostGenerationPreview] clipboard write:', err); }
              // Persist for Chrome extension
              if (savedResult.log.projectId) {
                saveContextForExtension(
                  savedResult.log.projectId,
                  savedResult.log.title,
                  savedResult.markdown,
                  savedResult.markdown,
                  savedResult.log.title,
                );
              }
              showToast?.(t('copiedToClipboard', lang), 'success');
            }}
          >
            <Copy size={14} /> {t('copyHandoff', lang)}
          </button>
        )}
        <button
          className="btn"
          onClick={onStartNew}
        >
          {t('startNewLog', lang)}
        </button>
        <button className="btn" onClick={async () => {
          const shareText = savedResult.fullContext || savedResult.markdown;
          if (typeof navigator.share === 'function') {
            try {
              await navigator.share({
                title: t('shareTitle', lang),
                text: shareText,
              });
              return;
            } catch {
              // Share cancelled or failed — fall back to clipboard
            }
          }
          // Fallback: copy to clipboard
          try {
            await navigator.clipboard.writeText(shareText);
            showToast?.(t('copiedToClipboard', lang), 'success');
          } catch {
            showToast?.(t('copyFailed', lang), 'error');
          }
        }}>
          <Share2 size={14} /> {t('share', lang)}
        </button>
      </div>

      {/* Subtitle explaining the buttons */}
      {savedResult.fullContext && (
        <p className="text-xs-muted mt-sm">
          {t('copyAiContextTitle', lang)}
        </p>
      )}

      {/* #38 Feedback buttons */}
      <div className="flex-row mt-md" style={{ gap: 8 }}>
        {feedbackGiven ? (
          <span className="text-sm text-muted">{t('feedbackThanks', lang)}</span>
        ) : (
          <>
            <button
              className="btn btn-sm"
              onClick={() => handleFeedback(true)}
              aria-label={t('feedbackThumbsUp', lang)}
              style={{ gap: 4 }}
            >
              <ThumbsUp size={14} /> {t('feedbackThumbsUp', lang)}
            </button>
            <button
              className="btn btn-sm"
              onClick={() => handleFeedback(false)}
              aria-label={t('feedbackThumbsDown', lang)}
              style={{ gap: 4 }}
            >
              <ThumbsDown size={14} /> {t('feedbackThumbsDown', lang)}
            </button>
          </>
        )}
      </div>
    </div>
  );
});
