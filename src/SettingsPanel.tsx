import { useState, useRef } from 'react';
import { Check, Download, Upload, AlertTriangle } from 'lucide-react';
import { getLang, setLang, getUiLang, exportAllData, validateBackup, importData, getDataUsage, formatBytes, getAutoReportSetting, setAutoReportSetting, isDemoMode, setDemoMode, getFeatureEnabled, setFeatureEnabled, safeGetItem } from './storage';
import { resetOnboarding } from './onboardingState';
import type { ThemePref, LoreBackup } from './storage';
import {
  getProviderApiKey, setProviderApiKey,
  PROVIDER_KEY_PLACEHOLDER,
  shouldUseBuiltinApi, getBuiltinUsage,
} from './provider';
import type { ProviderName } from './provider';
import { t, tf, OUTPUT_LANGS } from './i18n';
import type { Lang } from './i18n';
import type { FontSize } from './types';

interface SettingsPanelProps {
  onBack: () => void;
  lang: Lang;
  onUiLangChange: (lang: Lang) => void;
  themePref: ThemePref;
  onThemeChange: (theme: ThemePref) => void;
  fontSize: FontSize;
  onFontSizeChange: (size: FontSize) => void;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
  onShowOnboarding?: () => void;
  onResumeOnboarding?: () => void;
}

export default function SettingsPanel({ onBack, lang, onUiLangChange, themePref, onThemeChange, fontSize, onFontSizeChange, showToast, onShowOnboarding, onResumeOnboarding }: SettingsPanelProps) {
  const [keys, setKeys] = useState<Record<ProviderName, string>>(() => ({
    anthropic: getProviderApiKey('anthropic'),
    gemini: getProviderApiKey('gemini'),
    openai: getProviderApiKey('openai'),
  }));
  const [savedProvider, setSavedProvider] = useState<ProviderName | null>(null);
  const [currentUiLang, setCurrentUiLang] = useState<Lang>(getUiLang());
  const [currentOutputLang, setCurrentOutputLang] = useState<string>(getLang());
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{ backup: LoreBackup; mode: 'merge' | 'overwrite' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notion
  const [notionKey, setNotionKeyState] = useState(() => safeGetItem('threadlog_notion_api_key') || '');
  const [notionDbId, setNotionDbIdState] = useState(() => safeGetItem('threadlog_notion_database_id') || '');
  const [notionSaved, setNotionSaved] = useState(false);

  // Slack
  const [slackWebhook, setSlackWebhookState] = useState(() => safeGetItem('threadlog_slack_webhook_url') || '');
  const [slackSaved, setSlackSaved] = useState(false);

  // Auto weekly report
  const [autoReport, setAutoReport] = useState(getAutoReportSetting);

  const [keyErrors, setKeyErrors] = useState<Record<ProviderName, string>>({ anthropic: '', gemini: '', openai: '' });
  const [notionError, setNotionError] = useState('');
  const [slackError, setSlackError] = useState('');


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
    // Auto-exit demo mode when a real API key is saved
    if (isDemoMode() && keys[p].trim()) setDemoMode(false);
    setSavedProvider(p);
    setTimeout(() => setSavedProvider(null), 2000);
  };

  const handleKeyChange = (p: ProviderName, value: string) => {
    setKeys((prev) => ({ ...prev, [p]: value }));
  };

  const handleUiLangChange = (v: Lang) => {
    setCurrentUiLang(v);
    onUiLangChange(v);
  };

  const handleOutputLangChange = (v: string) => {
    setCurrentOutputLang(v);
    setLang(v);
  };

  const handleExport = () => {
    const backup = exportAllData();
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `lore-backup-${date}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast?.(t('dataExportSuccess', lang), 'success');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!validateBackup(parsed)) {
          setImportError(t('dataImportError', lang));
          return;
        }
        // Show merge/overwrite choice
        setPendingImport({ backup: parsed, mode: 'merge' });
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[SettingsPanel] import parse:', err);
        setImportError(t('dataImportError', lang));
      }
    };
    reader.readAsText(file);
    // Reset file input so same file can be re-selected
    e.target.value = '';
  };

  const handleImportConfirm = () => {
    if (!pendingImport) return;
    const result = importData(pendingImport.backup, pendingImport.mode);
    setPendingImport(null);
    showToast?.(tf('dataImportSuccess', lang, result.logs, result.projects, result.todos), 'success');
  };

  return (
    <div className="workspace-content">
      <div className="page-header">
        <button className="btn-back" onClick={onBack} className="btn-back-mb">
          ← {t('back', lang)}
        </button>
        <h2>{t('settingsTitle', lang)}</h2>
      </div>

      {/* Resume onboarding banner */}
      {onResumeOnboarding && (
        <div className="resume-banner">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('onboardingReturnToSetup', lang)}
          </span>
          <button
            className="btn btn-primary"
            onClick={onResumeOnboarding}
            className="btn-sm-save" style={{ borderRadius: 8, fontWeight: 600 }}
          >
            ← {t('onboardingReturnToSetup', lang)}
          </button>
        </div>
      )}

      <div className="flex-col-gap-md">
        {/* API Key (Gemini only) */}
        <div className="content-card">
          <div className="content-card-header">Gemini API {t('apiKeyLabel', lang)}</div>
          <p className="meta meta-desc">
            {t('apiKeyDesc', lang)}
          </p>
          <div className="flex-row-gap-sm">
            <input
              className="input"
              type="password"
              value={keys.gemini}
              onChange={(e) => { handleKeyChange('gemini', e.target.value); setKeyErrors((prev) => ({ ...prev, gemini: '' })); }}
              onBlur={() => { const err = validateApiKey('gemini', keys.gemini); setKeyErrors((prev) => ({ ...prev, gemini: err })); }}
              placeholder={PROVIDER_KEY_PLACEHOLDER.gemini}
              style={{ flex: 1, maxWidth: 420, fontSize: 13 }}
            />
            <button
              className="btn btn-primary"
              onClick={() => handleSaveKey('gemini')}
              className="btn-sm-save shrink-0"
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
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              {t('builtinApiUsage', lang)}
            </div>
            {shouldUseBuiltinApi() ? (() => {
              const { used, limit, remaining } = getBuiltinUsage();
              const pct = Math.min((used / limit) * 100, 100);
              const barColor = remaining <= 3 ? 'var(--error-text, #ef4444)' : remaining <= 8 ? 'var(--warning-text, #f59e0b)' : 'var(--accent)';
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    <span>{used} / {limit}</span>
                    <span>{remaining} {lang === 'ja' ? '回残り' : 'remaining'}</span>
                  </div>
                  <div className="progress-bar-track">
                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: barColor, transition: 'width 0.3s' }} />
                  </div>
                </>
              );
            })() : (
              <div style={{ fontSize: 13, color: 'var(--success-text, #22c55e)' }}>
                {t('builtinApiUsingOwn', lang)}
              </div>
            )}
          </div>
        </div>

        {/* Theme */}
        <div className="content-card">
          <div className="content-card-header">{t('themeLabel', lang)}</div>
          <p className="meta meta-desc">
            {t('themeDesc', lang)}
          </p>
          <div className="seg-control">
            {(['light', 'dark', 'system', 'high-contrast'] as const).map((v) => (
              <button
                key={v}
                className={`seg-control-btn${themePref === v ? ' active-worklog' : ''}`}
                onClick={() => onThemeChange(v)}
              >
                {v === 'light' ? t('themeLight', lang) : v === 'dark' ? t('themeDark', lang) : v === 'system' ? t('themeSystem', lang) : 'High Contrast'}
              </button>
            ))}
          </div>
        </div>

        {/* Font Size */}
        <div className="content-card">
          <div className="content-card-header">{t('fontSizeLabel', lang)}</div>
          <p className="meta meta-desc">
            {t('fontSizeDesc', lang)}
          </p>
          <div className="seg-control">
            {(['small', 'medium', 'large'] as const).map((v) => (
              <button
                key={v}
                className={`seg-control-btn${fontSize === v ? ' active-worklog' : ''}`}
                onClick={() => onFontSizeChange(v)}
              >
                {v === 'small' ? t('fontSizeSmall', lang) : v === 'medium' ? t('fontSizeMedium', lang) : t('fontSizeLarge', lang)}
              </button>
            ))}
          </div>
        </div>

        {/* UI Language */}
        <div className="content-card">
          <div className="content-card-header">{t('uiLanguageLabel', lang)}</div>
          <p className="meta meta-desc">
            {t('uiLanguageDesc', lang)}
          </p>
          <div className="flex-wrap-gap-2">
            {OUTPUT_LANGS.map((opt) => (
              <button
                key={opt.code}
                className={`seg-control-btn${currentUiLang === opt.code ? ' active-worklog' : ''}`}
                onClick={() => handleUiLangChange(opt.code as Lang)}
                className="btn-pill"
              >
                {opt.flag} {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Output Language */}
        <div className="content-card">
          <div className="content-card-header">{t('outputLanguageLabel', lang)}</div>
          <p className="meta meta-desc">
            {t('outputLanguageDesc', lang)}
          </p>
          <div className="flex-wrap-gap-2">
            <button
              className={`seg-control-btn${currentOutputLang === 'auto' ? ' active-worklog' : ''}`}
              className="btn-pill-sm"
              onClick={() => handleOutputLangChange('auto')}
            >
              {t('langAuto', lang)}
            </button>
            {[
              { code: 'ja', label: '🇯🇵 日本語' },
              { code: 'en', label: '🇺🇸 English' },
              { code: 'es', label: '🇪🇸 Español' },
              { code: 'fr', label: '🇫🇷 Français' },
              { code: 'de', label: '🇩🇪 Deutsch' },
              { code: 'zh', label: '🇨🇳 中文' },
              { code: 'ko', label: '🇰🇷 한국어' },
              { code: 'pt', label: '🇧🇷 Português' },
            ].map((v) => (
              <button
                key={v.code}
                className={`seg-control-btn${currentOutputLang === v.code ? ' active-worklog' : ''}`}
                className="btn-pill-sm"
                onClick={() => handleOutputLangChange(v.code)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notion Integration */}
        <div className="content-card">
          <div className="content-card-header">{t('notionLabel', lang)}</div>
          <p className="meta meta-desc">
            {t('notionDesc', lang)}
          </p>
          <div className="flex-col-gap-md">
            <div>
              <div className="field-label">
                {t('notionApiKey', lang)}
              </div>
              <input
                className="input"
                type="password"
                value={notionKey}
                onChange={(e) => { setNotionKeyState(e.target.value); setNotionError(''); }}
                onBlur={() => { if (notionKey.trim() && !notionKey.startsWith('ntn_') && !notionKey.startsWith('secret_')) setNotionError(t('notionApiKeyError', lang)); }}
                placeholder={t('notionApiKeyPlaceholder', lang)}
                className="input-settings"
              />
              {notionError && (
                <p className="error-text-sm">{notionError}</p>
              )}
            </div>
            <div>
              <div className="field-label">
                {t('notionDatabaseId', lang)}
              </div>
              <input
                className="input"
                type="text"
                value={notionDbId}
                onChange={(e) => setNotionDbIdState(e.target.value)}
                placeholder={t('notionDatabaseIdPlaceholder', lang)}
                maxLength={200}
                className="input-settings"
              />
            </div>
            <div className="flex-row-gap-sm">
              <button
                className="btn btn-primary"
                className="btn-sm-save"
                onClick={() => {
                  if (notionKey.trim() && !notionKey.startsWith('ntn_') && !notionKey.startsWith('secret_')) {
                    setNotionError(t('notionApiKeyError', lang));
                    return;
                  }
                  setNotionError('');
                  import('./integrations').then(({ setNotionApiKey, setNotionDatabaseId }) => {
                    setNotionApiKey(notionKey);
                    setNotionDatabaseId(notionDbId);
                  });
                  setNotionSaved(true);
                  setTimeout(() => setNotionSaved(false), 2000);
                }}
              >
                {t('saveKey', lang)}
              </button>
              {notionSaved && (
                <span className="saved-indicator">
                  <Check size={14} /> {t('saved', lang)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Slack Integration */}
        <div className="content-card">
          <div className="content-card-header">{t('slackLabel', lang)}</div>
          <p className="meta meta-desc">
            {t('slackDesc', lang)}
          </p>
          <div className="flex-col-gap-md">
            <div>
              <div className="field-label">
                {t('slackWebhookUrl', lang)}
              </div>
              <input
                className="input"
                type="password"
                value={slackWebhook}
                onChange={(e) => { setSlackWebhookState(e.target.value); setSlackError(''); }}
                onBlur={() => { if (slackWebhook.trim() && !slackWebhook.startsWith('https://hooks.slack.com')) setSlackError(t('slackWebhookError', lang)); }}
                placeholder={t('slackWebhookPlaceholder', lang)}
                className="input-settings" style={{ maxWidth: 480 }}
              />
              {slackError && (
                <p className="error-text-sm">{slackError}</p>
              )}
            </div>
            <div className="flex-row-gap-sm">
              <button
                className="btn btn-primary"
                className="btn-sm-save"
                onClick={() => {
                  if (slackWebhook.trim() && !slackWebhook.startsWith('https://hooks.slack.com')) {
                    setSlackError(t('slackWebhookError', lang));
                    return;
                  }
                  setSlackError('');
                  import('./integrations').then(({ setSlackWebhookUrl }) => {
                    setSlackWebhookUrl(slackWebhook);
                  });
                  setSlackSaved(true);
                  setTimeout(() => setSlackSaved(false), 2000);
                }}
              >
                {t('saveKey', lang)}
              </button>
              {slackSaved && (
                <span className="saved-indicator">
                  <Check size={14} /> {t('saved', lang)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="content-card">
          <div className="content-card-header">{t('featuresLabel', lang)}</div>
          <p className="meta meta-desc">
            {t('featuresDesc', lang)}
          </p>
          <div className="flex-col-gap-md" style={{ gap: 14 }}>
            {([
              { key: 'streaming', labelKey: 'featureStreaming', descKey: 'featureStreamingDesc', default: true },
              { key: 'auto_classify', labelKey: 'featureAutoClassify', descKey: 'featureAutoClassifyDesc', default: true },
              { key: 'todo_extract', labelKey: 'featureTodoExtract', descKey: 'featureTodoExtractDesc', default: true },
              { key: 'project_summary', labelKey: 'featureProjectSummary', descKey: 'featureProjectSummaryDesc', default: true },
              { key: 'workload', labelKey: 'featureWorkload', descKey: 'featureWorkloadDesc', default: true },
              { key: 'knowledge_base', labelKey: 'featureKnowledgeBase', descKey: 'featureKnowledgeBaseDesc', default: true },
              { key: 'keyboard_shortcuts', labelKey: 'featureKeyboardShortcuts', descKey: 'featureKeyboardShortcutsDesc', default: true },
              { key: 'sounds', labelKey: 'featureSounds', descKey: 'featureSoundsDesc', default: true },
            ] as const).map(({ key, labelKey, descKey, default: def }) => (
              <label key={key} className="feature-toggle-label">
                <input
                  type="checkbox"
                  checked={getFeatureEnabled(key, def)}
                  onChange={(e) => { setFeatureEnabled(key, e.target.checked); setAutoReport((v) => v); /* force re-render */ }}
                  className="feature-toggle-checkbox"
                />
                <div>
                  <div className="feature-toggle-title">
                    {t(labelKey as Parameters<typeof t>[0], lang)}
                  </div>
                  <div className="meta" style={{ fontSize: 12, marginTop: 2 }}>
                    {t(descKey as Parameters<typeof t>[0], lang)}
                  </div>
                </div>
              </label>
            ))}
            <label className="feature-toggle-label">
              <input
                type="checkbox"
                checked={autoReport}
                onChange={(e) => {
                  const v = e.target.checked;
                  setAutoReport(v);
                  setAutoReportSetting(v);
                }}
                className="feature-toggle-checkbox"
              />
              <div>
                <div className="feature-toggle-title">
                  {t('autoWeeklyReport', lang)}
                </div>
                <div className="meta" style={{ fontSize: 12, marginTop: 2 }}>
                  {t('autoWeeklyReportDesc', lang)}
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Data Management */}
        <div className="content-card">
          <div className="content-card-header">{t('dataLabel', lang)}</div>
          <p className="meta meta-desc">
            {t('dataStorageNotice', lang)}
          </p>

          {/* Data Usage */}
          {(() => {
            const usage = getDataUsage();
            const barColor = usage.percentage >= 100 ? 'var(--error-text)' : usage.percentage >= 80 ? 'var(--warning-text, #f59e0b)' : 'var(--accent)';
            const isWarning = usage.percentage >= 80;
            return (
              <div className="data-usage-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {t('dataUsageLabel', lang)}
                  </span>
                  <span style={{ fontSize: 12, color: isWarning ? barColor : 'var(--text-muted)' , fontWeight: isWarning ? 600 : 400 }}>
                    {formatBytes(usage.usedBytes)} / {formatBytes(usage.limitBytes)}
                  </span>
                </div>
                <div className="progress-bar-track">
                  <div style={{
                    height: '100%',
                    width: `${Math.min(usage.percentage, 100)}%`,
                    background: barColor,
                    borderRadius: 3,
                    transition: 'width 0.3s',
                  }} />
                </div>
                {isWarning && (
                  <p style={{ fontSize: 12, color: barColor, marginTop: 6, marginBottom: 0, fontWeight: 500 }}>
                    {t('dataUsageWarning', lang)}
                  </p>
                )}
              </div>
            );
          })()}

          {/* Export */}
          <div style={{ marginBottom: 16 }}>
            <p className="meta" style={{ marginBottom: 8, fontSize: 13 }}>
              {t('dataExportDesc', lang)}
            </p>
            <button className="btn btn-primary" onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={14} /> {t('dataExport', lang)}
            </button>
          </div>

          {/* Import */}
          <div>
            <p className="meta" style={{ marginBottom: 8, fontSize: 13 }}>
              {t('dataImportDesc', lang)}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportFile}
              style={{ display: 'none' }}
              aria-label={t('dataImport', lang)}
            />
            <button className="btn" onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Upload size={14} /> {t('dataImport', lang)}
            </button>
            {importError && (
              <p style={{ color: 'var(--error-text)', fontSize: 13, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={14} /> {importError}
              </p>
            )}
          </div>
        </div>

        {/* Show onboarding again */}
        {onShowOnboarding && (
          <div style={{ textAlign: 'center', paddingTop: 4 }}>
            <button
              className="btn"
              onClick={() => { resetOnboarding(); onShowOnboarding(); }}
              style={{ fontSize: 13 }}
            >
              {t('showOnboardingAgain', lang)}
            </button>
          </div>
        )}
      </div>

      {/* Import confirmation dialog */}
      {pendingImport && (
        <div className="modal-overlay" role="presentation" onClick={() => setPendingImport(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-label={t('dataImport', lang)} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ marginBottom: 12 }}>{t('dataImport', lang)}</h3>
            <div className="flex-col-gap-md" style={{ gap: 10, marginBottom: 16 }}>
              <button
                className={`btn${pendingImport.mode === 'merge' ? ' btn-primary' : ''}`}
                onClick={() => setPendingImport({ ...pendingImport, mode: 'merge' })}
                className="import-mode-btn"
              >
                <div className="import-mode-title">{t('dataImportMerge', lang)}</div>
                <div className="meta" style={{ fontSize: 12, marginTop: 2 }}>{t('dataImportConfirmMerge', lang)}</div>
              </button>
              <button
                className={`btn${pendingImport.mode === 'overwrite' ? ' btn-primary' : ''}`}
                onClick={() => setPendingImport({ ...pendingImport, mode: 'overwrite' })}
                className="import-mode-btn"
              >
                <div className="import-mode-title">{t('dataImportOverwrite', lang)}</div>
                <div className="meta" style={{ fontSize: 12, marginTop: 2 }}>{t('dataImportConfirmOverwrite', lang)}</div>
              </button>
            </div>
            <div className="flex justify-end gap-3">
              <button className="btn" onClick={() => setPendingImport(null)}>{t('cancel', lang)}</button>
              <button className="btn btn-primary" onClick={handleImportConfirm}>
                {pendingImport.mode === 'overwrite' ? t('dataImportOverwrite', lang) : t('dataImportMerge', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
