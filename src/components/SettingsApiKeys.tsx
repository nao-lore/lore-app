import { memo } from 'react';
import {
  shouldUseBuiltinApi, getBuiltinUsage,
} from '../provider';
import { t } from '../i18n';
import type { Lang } from '../i18n';

interface SettingsApiKeysProps {
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

export const SettingsApiKeys = memo(function SettingsApiKeys({ lang }: SettingsApiKeysProps) {
  return (
    <div className="content-card">
      {/* Built-in API usage */}
      <div className="section-label">
        {t('builtinApiUsage', lang)}
      </div>
      {shouldUseBuiltinApi() ? (() => {
        const { used, limit, remaining } = getBuiltinUsage();
        const pct = Math.min((used / limit) * 100, 100);
        const barColor = remaining <= 3 ? 'var(--error-text, #ef4444)' : remaining <= 8 ? 'var(--warning-text, #f59e0b)' : 'var(--accent)';
        return (
          <>
            <div className="settings-usage-row">
              <span>{used} / {limit}</span>
              <span>{remaining} {lang === 'ja' ? '回残り' : 'remaining'}</span>
            </div>
            <div className="progress-bar-track">
              <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: barColor, transition: 'width 0.3s' }} />
            </div>
          </>
        );
      })() : (
        <div className="fs-13" style={{ color: 'var(--success-text, #22c55e)' }}>
          {t('builtinApiUsingOwn', lang)}
        </div>
      )}
    </div>
  );
});
