import { useState, memo } from 'react';
import { Check } from 'lucide-react';
import {
  getProviderApiKey, setProviderApiKey,
  PROVIDER_KEY_PLACEHOLDER,
  shouldUseBuiltinApi, getBuiltinUsage,
} from '../provider';
import type { ProviderName } from '../provider';
import { isDemoMode, setDemoMode } from '../storage';
import { t } from '../i18n';
import type { Lang } from '../i18n';

interface SettingsApiKeysProps {
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

export const SettingsApiKeys = memo(function SettingsApiKeys({ lang }: SettingsApiKeysProps) {
  const [keys, setKeys] = useState<Record<ProviderName, string>>(() => ({
    anthropic: getProviderApiKey('anthropic'),
    gemini: getProviderApiKey('gemini'),
    openai: getProviderApiKey('openai'),
  }));
  const [savedProvider, setSavedProvider] = useState<ProviderName | null>(null);
  const [keyErrors, setKeyErrors] = useState<Record<ProviderName, string>>({ anthropic: '', gemini: '', openai: '' });

  const validateApiKey = (p: ProviderName, key: string): string => {
    if (!key.trim()) return '';
    if (p === 'gemini' && !key.startsWith('AIza')) return t('apiKeyErrorGemini', lang);
    if (p === 'anthropic' && !key.startsWith('sk-ant')) return t('apiKeyErrorAnthropic', lang);
    if (p === 'openai' && !key.startsWith('sk-')) return t('apiKeyErrorOpenai', lang);
    return '';
  };

  const handleSaveKey = (p: ProviderName) => {
    const err = validateApiKey(p, keys[p]);
    if (err) {
      setKeyErrors((prev) => ({ ...prev, [p]: err }));
      return;
    }
    setKeyErrors((prev) => ({ ...prev, [p]: '' }));
    setProviderApiKey(p, keys[p]);
    if (isDemoMode() && keys[p].trim()) setDemoMode(false);
    setSavedProvider(p);
    setTimeout(() => setSavedProvider(null), 2000);
  };

  const handleKeyChange = (p: ProviderName, value: string) => {
    setKeys((prev) => ({ ...prev, [p]: value }));
  };

  return (
    <div className="content-card">
      <div className="content-card-header">Gemini API {t('apiKeyLabel', lang)}</div>
      <p className="meta meta-desc">
        {t('apiKeyDesc', lang)}
      </p>
      <p className="meta meta-desc fs-12">
        {t('modelHint', lang)}
      </p>
      <div className="flex-row-gap-sm">
        <input
          className="input settings-flex-max"
          type="password"
          value={keys.gemini}
          onChange={(e) => { handleKeyChange('gemini', e.target.value); setKeyErrors((prev) => ({ ...prev, gemini: '' })); }}
          onBlur={() => { const err = validateApiKey('gemini', keys.gemini); setKeyErrors((prev) => ({ ...prev, gemini: err })); }}
          placeholder={PROVIDER_KEY_PLACEHOLDER.gemini}
          aria-label={t('apiKeyLabel', lang)}
        />
        <button
          className="btn btn-primary btn-sm-save shrink-0"
          onClick={() => handleSaveKey('gemini')}
        >
          {t('saveKey', lang)}
        </button>
        {savedProvider === 'gemini' && (
          <span className="saved-indicator">
            <Check size={14} /> {t('saved', lang)}
          </span>
        )}
      </div>
      {keyErrors.gemini && (
        <p className="error-text-sm">{keyErrors.gemini}</p>
      )}

      {/* Built-in API usage */}
      <div className="subtle-panel">
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
    </div>
  );
});
