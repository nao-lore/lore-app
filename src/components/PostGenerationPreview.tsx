import { Copy, Share2 } from 'lucide-react';
import { HandoffResultDisplay } from '../ResultDisplay';
import { t } from '../i18n';
import type { Lang } from '../i18n';
import type { SavedResult } from '../hooks/useTransform';

type SavedResultData = SavedResult;

interface PostGenerationPreviewProps {
  savedResult: SavedResultData;
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error', action?: { label: string; onClick: () => void }) => void;
  onStartNew: () => void;
  wasFirstTransform: boolean;
}

export default function PostGenerationPreview({ savedResult, lang, showToast, onStartNew, wasFirstTransform }: PostGenerationPreviewProps) {
  return (
    <div className="input-preview">
      <h3 className="mb-md result-heading">{wasFirstTransform ? `🎉 ${t('logSaved', lang)}` : t('logSaved', lang)}</h3>

      {/* Rich formatted preview */}
      <div className="mb-lg input-preview-result">
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
              try { navigator.clipboard.writeText(text); } catch (err) { if (import.meta.env.DEV) console.warn('[PostGenerationPreview] clipboard write:', err); }
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
        {typeof navigator.share === 'function' && (
          <button className="btn" onClick={async () => {
            try {
              await navigator.share({
                title: 'Lore Handoff',
                text: savedResult.fullContext || savedResult.markdown,
              });
            } catch (err) { if (import.meta.env.DEV) console.warn('[PostGenerationPreview] share:', err); }
          }}>
            <Share2 size={14} /> {t('share', lang)}
          </button>
        )}
      </div>

      {/* Subtitle explaining the buttons */}
      {savedResult.fullContext && (
        <p className="text-xs-muted mt-sm">
          {t('copyAiContextTitle', lang)}
        </p>
      )}
    </div>
  );
}
