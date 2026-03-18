import { memo } from 'react';
import ProgressPanel from '../ProgressPanel';
import type { ProgressStep } from '../ProgressPanel';
import SkeletonLoader from '../SkeletonLoader';
import { t, tf } from '../i18n';
import type { Lang } from '../i18n';
import type { EngineProgress } from '../chunkEngine';

interface ProgressDisplayProps {
  loading: boolean;
  progress: EngineProgress | null;
  simStep: number;
  streamDetail: string | null;
  lang: Lang;
  singleSteps: ProgressStep[];
  estMinutes: number;
  progressPct: number;
  onPauseResume: () => void;
  onCancel: () => void;
}

export default memo(function ProgressDisplay({
  loading, progress, simStep, streamDetail, lang,
  singleSteps, estMinutes, progressPct, onPauseResume, onCancel,
}: ProgressDisplayProps) {
  if (!loading) return null;

  // Single transform (simulated steps)
  if (!progress) {
    return (
      <div aria-live="polite">
        <ProgressPanel
          steps={singleSteps}
          state={{ stepIndex: simStep, detail: streamDetail || undefined }}
          lang={lang}
          heading={undefined}
        />
        <SkeletonLoader lang={lang} />
      </div>
    );
  }

  // Chunked transform (real progress)
  return (
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
          <button className="btn btn-xs" onClick={onPauseResume}>
            {progress.phase === 'paused' ? t('btnResume', lang) : t('btnPause', lang)}
          </button>
          <button className="btn btn-danger btn-xs" onClick={onCancel}>
            {t('btnCancel', lang)}
          </button>
        </>}
      />
      <SkeletonLoader lang={lang} />
    </div>
  );
});
