import { memo } from 'react';
import { t, tf } from '../i18n';
import type { Lang } from '../i18n';
import type { ImportedFile } from '../hooks/useFileImport';

function formatFileDate(ts: number): string {
  const d = new Date(ts);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${mins}`;
}

function captureSourceLabel(source: string): string {
  const labels: Record<string, string> = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' };
  return labels[source] || source;
}

// ---- Capture banner ----

interface CaptureInfo {
  source: string;
  messageCount: number;
  charCount: number;
}

interface CaptureBannerProps {
  captureInfo: CaptureInfo;
  lang: Lang;
  onDismiss: () => void;
}

export const CaptureBanner = memo(function CaptureBanner({ captureInfo, lang, onDismiss }: CaptureBannerProps) {
  return (
    <div className="capture-banner input-section-margin">
      <div className="capture-banner-icon">✓</div>
      <div className="flex-1">
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
        onClick={onDismiss}
        className="capture-banner-close"
        title={t('titleDismiss', lang)}
        aria-label={t('ariaDismissNotification', lang)}
      >×</button>
    </div>
  );
});

// ---- File list ----

interface InputFileListProps {
  files: ImportedFile[];
  lang: Lang;
  onRemoveFile: (index: number) => void;
}

export const InputFileList = memo(function InputFileList({ files, lang, onRemoveFile }: InputFileListProps) {
  return (
    <div className="file-list input-section-margin">
      {files.map((f, i) => (
        <div key={i} className="file-list-item">
          <span className="text-muted flex-1 truncate">
            {f.name}
          </span>
          {f.lastModified && (
            <span className="meta file-meta file-meta-date">
              {formatFileDate(f.lastModified)}
            </span>
          )}
          <span className="meta file-meta">
            {f.content.length.toLocaleString()}
          </span>
          <button
            className="file-remove-btn"
            onClick={() => onRemoveFile(i)}
            title={t('titleRemoveFile', lang)}
            aria-label={tf('ariaRemoveFile', lang, f.name)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
});

// ---- Input warnings ----

interface InputWarningsProps {
  overLimit: boolean;
  isLargeInput: boolean;
  lang: Lang;
}

export const InputWarnings = memo(function InputWarnings({ overLimit, isLargeInput, lang }: InputWarningsProps) {
  return (
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
  );
});
