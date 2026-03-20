import { useState, memo } from 'react';
import { X } from 'lucide-react';
import { t, tf } from '../i18n';
import type { Lang } from '../i18n';
import FirstUseTooltip from '../FirstUseTooltip';
import { shouldUseBuiltinApi, getBuiltinUsage } from '../provider';
import { canTransform, DAILY_LIMIT_FREE } from '../utils/trialManager';
import { getTotalSnapshots } from '../storage/core';

/** Strip BOM and normalize line endings before processing */
function normalizeInput(text: string): string {
  return text.replace(/\ufeff/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

interface InputTextAreaProps {
  text: string;
  setText: (v: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  loading: boolean;
  combined: string;
  overLimit: boolean;
  overWarn: boolean;
  willChunk: boolean;
  filesCount: number;
  filesCharTotal: number;
  transformAction: string;
  progressLabel: string;
  dragging: boolean;
  lang: Lang;
  onRunTransform: (action: string) => void;
  onLoadDemo: () => void;
  onClearWithUndo: () => void;
}

export const InputTextArea = memo(function InputTextArea({
  text, setText, textareaRef, loading, combined, overLimit, overWarn, willChunk,
  filesCount, filesCharTotal, transformAction, progressLabel, dragging,
  lang, onRunTransform, onLoadDemo, onClearWithUndo,
}: InputTextAreaProps) {
  const [pasteFeedback, setPasteFeedback] = useState<string | null>(null);

  return (
    <div
      className="input-card-hero relative"
      style={dragging ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-focus)' } : undefined}
    >
      {/* Drag & drop overlay */}
      {dragging && (
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
          onClick={onClearWithUndo}
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
            onRunTransform(transformAction);
          }
        }}
        onPaste={() => {
          setTimeout(() => {
            const ta = textareaRef.current;
            if (ta) {
              const normalized = normalizeInput(ta.value);
              if (normalized !== ta.value) {
                setText(normalized);
              }
              if (normalized.trim()) {
                const len = normalized.length;
                setPasteFeedback(tf('pasteFeedback', lang, len.toLocaleString()));
                setTimeout(() => setPasteFeedback(null), 3000);
                ta.scrollTop = 0;
              }
            }
          }, 0);
        }}
        disabled={loading}
        autoFocus
        placeholder={t('inputPlaceholder', lang)}
        style={{ opacity: loading ? 0.6 : 1 }}
      />

      {/* Try sample button — prominent with pulse for first-time users */}
      {!text.trim() && filesCount === 0 && !loading && (
        <button
          type="button"
          className={`try-sample-btn try-sample-btn-prominent${getTotalSnapshots() === 0 ? ' try-sample-btn-pulse' : ''}`}
          onClick={onLoadDemo}
        >
          {t('trySampleConversation', lang)}
        </button>
      )}

      {/* Bottom bar: char count + keyboard hint */}
      <div className="flex-row justify-between input-bottom-bar">
        <div>
          {combined.length > 0 && (
            <span className="meta" style={{ fontSize: 11, color: overLimit ? 'var(--error-text)' : overWarn || willChunk ? 'var(--error-text)' : undefined }}>
              {(text.length + filesCharTotal).toLocaleString()}{t('chars', lang)}
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
            {navigator.platform?.includes('Mac') ? '\u2318' : 'Ctrl'}+Enter
          </span>
        )}
      </div>

      {/* Transform button */}
      <div className="flex-row gap-xs input-transform-area">
        {!loading && shouldUseBuiltinApi() && (() => {
          const { used, limit } = getBuiltinUsage();
          return (
            <span className="input-usage-counter">
              {used}/{limit}
            </span>
          );
        })()}
        {!loading && (() => {
          const trial = canTransform();
          if (trial.trialDaysLeft !== undefined) {
            return (
              <span className="input-usage-counter">
                {tf('trialActive', lang, trial.trialDaysLeft)}
              </span>
            );
          }
          if (!trial.allowed) {
            return (
              <span className="input-usage-counter input-usage-counter--exhausted">
                {t('trialEnded', lang)}
              </span>
            );
          }
          if (trial.remaining !== undefined) {
            return (
              <span className="input-usage-counter">
                {tf('transformsRemaining', lang, trial.remaining, DAILY_LIMIT_FREE)}
              </span>
            );
          }
          return null;
        })()}
        {loading ? (
          <button
            className="btn btn-primary btn-transform"
            disabled
          >
            {progressLabel}
          </button>
        ) : (
          <FirstUseTooltip id="transform" text={lang === 'ja' ? 'AI会話を上に貼り付けて、ここをクリック！' : 'Paste an AI conversation above, then click here!'} lang={lang}>
            <button
              className="btn btn-primary btn-transform"
              onClick={() => onRunTransform(transformAction)}
              disabled={!combined.trim() || overLimit}
              style={{ opacity: (!combined.trim() || overLimit) ? 0.35 : 1 }}
            >
              {t(transformAction === 'handoff_todo' ? 'createBtnHandoffTodo' : transformAction === 'todo_only' ? 'createBtnTodoOnly' : 'createBtnHandoff', lang)}
            </button>
          </FirstUseTooltip>
        )}
      </div>
    </div>
  );
});
