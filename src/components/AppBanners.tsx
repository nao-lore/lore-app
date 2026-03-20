import { memo } from 'react';
import { X } from 'lucide-react';
import { t, tf } from '../i18n';
import type { Lang } from '../i18n';
import type { Todo } from '../types';
import { setLastReportDate, safeSetItem } from '../storage';

// ---- Demo banner ----

interface DemoBannerProps {
  lang: Lang;
  onExitDemo: () => void;
}

export const DemoBanner = memo(function DemoBanner({ lang, onExitDemo }: DemoBannerProps) {
  return (
    <div className="demo-banner">
      <span className="demo-badge-text">{t('demoBadge', lang)}</span>
      <span className="text-muted">{t('demoModeBanner', lang)}</span>
      <button
        className="btn text-sm"
        onClick={onExitDemo}
        style={{ padding: '2px 10px', color: 'var(--accent)', minHeight: 44 }}
      >
        {t('exitDemoMode', lang)}
      </button>
    </div>
  );
});

// ---- Overdue banner ----

interface OverdueBannerProps {
  lang: Lang;
  overdueTodos: Todo[];
  todayKey: string;
  onGoToTodos: () => void;
  onDismiss: () => void;
}

export const OverdueBanner = memo(function OverdueBanner({
  lang, overdueTodos, todayKey, onGoToTodos, onDismiss,
}: OverdueBannerProps) {
  return (
    <div className="overdue-banner" role="alert">
      <span>
        {tf('overdueBanner', lang, overdueTodos.length)}
      </span>
      <button
        className="overdue-banner-link"
        onClick={onGoToTodos}
      >
        {t('overdueBannerLink', lang)}
      </button>
      <button
        className="overdue-banner-close"
        onClick={() => {
          onDismiss();
          safeSetItem('threadlog_overdue_dismissed', todayKey);
        }}
        aria-label={t('close', lang)}
      >
        <X size={14} />
      </button>
    </div>
  );
});

// ---- Report reminder banner ----

interface ReportReminderBannerProps {
  lang: Lang;
  onDismiss: () => void;
  onGenerate: () => void;
}

export const ReportReminderBanner = memo(function ReportReminderBanner({
  lang, onDismiss, onGenerate,
}: ReportReminderBannerProps) {
  return (
    <div className="overdue-banner" role="alert">
      <span>{t('weeklyReportReminder', lang)}</span>
      <button
        className="overdue-banner-link"
        onClick={() => {
          onDismiss();
          setLastReportDate(Date.now());
          onGenerate();
        }}
      >
        {t('generateNow', lang)}
      </button>
      <button
        className="overdue-banner-close"
        onClick={onDismiss}
        aria-label={t('close', lang)}
      >
        <X size={14} />
      </button>
    </div>
  );
});

// ---- Offline banner ----

interface OfflineBannerProps {
  lang: Lang;
  offlineStatus: 'online' | 'offline' | 'back-online';
  onDismiss: () => void;
}

export const OfflineBanner = memo(function OfflineBanner({
  lang, offlineStatus, onDismiss,
}: OfflineBannerProps) {
  return (
    <div role="alert" aria-live="assertive" className="offline-banner" style={{
      background: offlineStatus === 'offline' ? 'var(--warning-bg, #f59e0b)' : 'var(--success-bg, #22c55e)',
      color: offlineStatus === 'offline' ? 'var(--warning-text, #78350f)' : 'var(--success-text, #052e16)',
    }}>
      <span>{offlineStatus === 'offline' ? t('offline', lang) : t('backOnline', lang)}</span>
      {offlineStatus === 'offline' && (
        <button
          onClick={onDismiss}
          aria-label={t('close', lang)}
          className="offline-dismiss-btn"
        >
          x
        </button>
      )}
    </div>
  );
});
