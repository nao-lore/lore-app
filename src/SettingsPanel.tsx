import { useState, useRef } from 'react';
import { Check, Download, Upload, AlertTriangle } from 'lucide-react';
import { getLang, setLang, getUiLang, exportAllData, validateBackup, importData, getDataUsage, formatBytes, getAutoReportSetting, setAutoReportSetting, isDemoMode, setDemoMode, getFeatureEnabled, setFeatureEnabled } from './storage';
import { resetOnboarding } from './onboardingState';
import type { ThemePref, LoreBackup } from './storage';
import {
  getProviderApiKey, setProviderApiKey,
  PROVIDER_KEY_PLACEHOLDER,
} from './provider';
import type { ProviderName } from './provider';
import { t, tf, OUTPUT_LANGS } from './i18n';
import type { Lang } from './i18n';
import type { FontSize } from './types';

import {
  getNotionApiKey, setNotionApiKey,
  getNotionDatabaseId, setNotionDatabaseId,
  getSlackWebhookUrl, setSlackWebhookUrl,
} from './integrations';

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
  const [notionKey, setNotionKeyState] = useState(getNotionApiKey);
  const [notionDbId, setNotionDbIdState] = useState(getNotionDatabaseId);
  const [notionSaved, setNotionSaved] = useState(false);

  // Slack
  const [slackWebhook, setSlackWebhookState] = useState(getSlackWebhookUrl);
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
      } catch {
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
        <button className="btn-back" onClick={onBack} style={{ marginBottom: 12 }}>
          ← {t('back', lang)}
        </button>
        <h2>{t('settingsTitle', lang)}</h2>
      </div>

      {/* Resume onboarding banner */}
      {onResumeOnboarding && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', marginBottom: 12, borderRadius: 10,
          background: 'var(--accent-bg, rgba(99,102,241,0.08))',
          border: '1px solid var(--accent, #7c5cfc)',
        }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('onboardingReturnToSetup', lang)}
          </span>
          <button
            className="btn btn-primary"
            onClick={onResumeOnboarding}
            style={{ fontSize: 12, padding: '5px 14px', borderRadius: 8, fontWeight: 600 }}
          >
            ← {t('onboardingReturnToSetup', lang)}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* API Key (Gemini only) */}
        <div className="content-card">
          <div className="content-card-header">Gemini API {t('apiKeyLabel', lang)}</div>
          <p className="meta" style={{ marginBottom: 14, fontSize: 13 }}>
            {t('apiKeyDesc', lang)}
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
              style={{ fontSize: 12, padding: '5px 12px', minHeight: 28, flexShrink: 0 }}
            >
              {t('saveKey', lang)}
            </button>
            {savedProvider === 'gemini' && (
              <span style={{ color: 'var(--success-text)', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={14} /> {t('saved', lang)}
              </span>
            )}
          </div>
          {keyErrors.gemini && (
            <p style={{ color: 'var(--error-text)', fontSize: 12, margin: '4px 0 0' }}>{keyErrors.gemini}</p>
          )}
        </div>

        {/* Theme */}
        <div className="content-card">
          <div className="content-card-header">{t('themeLabel', lang)}</div>
          <p className="meta" style={{ marginBottom: 14, fontSize: 13 }}>
            {t('themeDesc', lang)}
          </p>
          <div className="seg-control">
            {(['light', 'dark', 'system'] as const).map((v) => (
              <button
                key={v}
                className={`seg-control-btn${themePref === v ? ' active-worklog' : ''}`}
                onClick={() => onThemeChange(v)}
              >
                {v === 'light' ? t('themeLight', lang) : v === 'dark' ? t('themeDark', lang) : t('themeSystem', lang)}
              </button>
            ))}
          </div>
        </div>

        {/* Font Size */}
        <div className="content-card">
          <div className="content-card-header">{t('fontSizeLabel', lang)}</div>
          <p className="meta" style={{ marginBottom: 14, fontSize: 13 }}>
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
          <p className="meta" style={{ marginBottom: 14, fontSize: 13 }}>
            {t('uiLanguageDesc', lang)}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {OUTPUT_LANGS.map((opt) => (
              <button
                key={opt.code}
                className={`seg-control-btn${currentUiLang === opt.code ? ' active-worklog' : ''}`}
                onClick={() => handleUiLangChange(opt.code as Lang)}
                style={{ padding: '6px 12px', fontSize: 13 }}
              >
                {opt.flag} {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Output Language */}
        <div className="content-card">
          <div className="content-card-header">{t('outputLanguageLabel', lang)}</div>
          <p className="meta" style={{ marginBottom: 14, fontSize: 13 }}>
            {t('outputLanguageDesc', lang)}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button
              className={`seg-control-btn${currentOutputLang === 'auto' ? ' active-worklog' : ''}`}
              style={{ padding: '6px 12px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border-default)' }}
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
                style={{ padding: '6px 12px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border-default)' }}
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
          <p className="meta" style={{ marginBottom: 14, fontSize: 13 }}>
            {t('notionDesc', lang)}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                {t('notionApiKey', lang)}
              </div>
              <input
                className="input"
                type="password"
                value={notionKey}
                onChange={(e) => { setNotionKeyState(e.target.value); setNotionError(''); }}
                onBlur={() => { if (notionKey.trim() && !notionKey.startsWith('ntn_') && !notionKey.startsWith('secret_')) setNotionError(t('notionApiKeyError', lang)); }}
                placeholder={t('notionApiKeyPlaceholder', lang)}
                style={{ maxWidth: 420, fontSize: 13 }}
              />
              {notionError && (
                <p style={{ color: 'var(--error-text)', fontSize: 12, margin: '4px 0 0' }}>{notionError}</p>
              )}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                {t('notionDatabaseId', lang)}
              </div>
              <input
                className="input"
                type="text"
                value={notionDbId}
                onChange={(e) => setNotionDbIdState(e.target.value)}
                placeholder={t('notionDatabaseIdPlaceholder', lang)}
                maxLength={200}
                style={{ maxWidth: 420, fontSize: 13 }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: 12, padding: '5px 12px', minHeight: 28 }}
                onClick={() => {
                  if (notionKey.trim() && !notionKey.startsWith('ntn_') && !notionKey.startsWith('secret_')) {
                    setNotionError(t('notionApiKeyError', lang));
                    return;
                  }
                  setNotionError('');
                  setNotionApiKey(notionKey);
                  setNotionDatabaseId(notionDbId);
                  setNotionSaved(true);
                  setTimeout(() => setNotionSaved(false), 2000);
                }}
              >
                {t('saveKey', lang)}
              </button>
              {notionSaved && (
                <span style={{ color: 'var(--success-text)', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Check size={14} /> {t('saved', lang)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Slack Integration */}
        <div className="content-card">
          <div className="content-card-header">{t('slackLabel', lang)}</div>
          <p className="meta" style={{ marginBottom: 14, fontSize: 13 }}>
            {t('slackDesc', lang)}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                {t('slackWebhookUrl', lang)}
              </div>
              <input
                className="input"
                type="password"
                value={slackWebhook}
                onChange={(e) => { setSlackWebhookState(e.target.value); setSlackError(''); }}
                onBlur={() => { if (slackWebhook.trim() && !slackWebhook.startsWith('https://hooks.slack.com')) setSlackError(t('slackWebhookError', lang)); }}
                placeholder={t('slackWebhookPlaceholder', lang)}
                style={{ maxWidth: 480, fontSize: 13 }}
              />
              {slackError && (
                <p style={{ color: 'var(--error-text)', fontSize: 12, margin: '4px 0 0' }}>{slackError}</p>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: 12, padding: '5px 12px', minHeight: 28 }}
                onClick={() => {
                  if (slackWebhook.trim() && !slackWebhook.startsWith('https://hooks.slack.com')) {
                    setSlackError(t('slackWebhookError', lang));
                    return;
                  }
                  setSlackError('');
                  setSlackWebhookUrl(slackWebhook);
                  setSlackSaved(true);
                  setTimeout(() => setSlackSaved(false), 2000);
                }}
              >
                {t('saveKey', lang)}
              </button>
              {slackSaved && (
                <span style={{ color: 'var(--success-text)', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Check size={14} /> {t('saved', lang)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="content-card">
          <div className="content-card-header">{t('featuresLabel', lang)}</div>
          <p className="meta" style={{ marginBottom: 14, fontSize: 13 }}>
            {t('featuresDesc', lang)}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {([
              { key: 'streaming', labelKey: 'featureStreaming', descKey: 'featureStreamingDesc', default: true },
              { key: 'auto_classify', labelKey: 'featureAutoClassify', descKey: 'featureAutoClassifyDesc', default: true },
              { key: 'todo_extract', labelKey: 'featureTodoExtract', descKey: 'featureTodoExtractDesc', default: true },
              { key: 'project_summary', labelKey: 'featureProjectSummary', descKey: 'featureProjectSummaryDesc', default: true },
              { key: 'workload', labelKey: 'featureWorkload', descKey: 'featureWorkloadDesc', default: true },
              { key: 'knowledge_base', labelKey: 'featureKnowledgeBase', descKey: 'featureKnowledgeBaseDesc', default: true },
              { key: 'keyboard_shortcuts', labelKey: 'featureKeyboardShortcuts', descKey: 'featureKeyboardShortcutsDesc', default: true },
            ] as const).map(({ key, labelKey, descKey, default: def }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={getFeatureEnabled(key, def)}
                  onChange={(e) => { setFeatureEnabled(key, e.target.checked); setAutoReport((v) => v); /* force re-render */ }}
                  style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer', marginTop: 2, flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {t(labelKey as Parameters<typeof t>[0], lang)}
                  </div>
                  <div className="meta" style={{ fontSize: 12, marginTop: 2 }}>
                    {t(descKey as Parameters<typeof t>[0], lang)}
                  </div>
                </div>
              </label>
            ))}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoReport}
                onChange={(e) => {
                  const v = e.target.checked;
                  setAutoReport(v);
                  setAutoReportSetting(v);
                }}
                style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer', marginTop: 2, flexShrink: 0 }}
              />
              <div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>
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
          <p className="meta" style={{ marginBottom: 14, fontSize: 13 }}>
            {t('dataStorageNotice', lang)}
          </p>

          {/* Data Usage */}
          {(() => {
            const usage = getDataUsage();
            const barColor = usage.percentage >= 100 ? 'var(--error-text)' : usage.percentage >= 80 ? '#f59e0b' : 'var(--accent)';
            const isWarning = usage.percentage >= 80;
            return (
              <div style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--sidebar-hover)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {t('dataUsageLabel', lang)}
                  </span>
                  <span style={{ fontSize: 12, color: isWarning ? barColor : 'var(--text-muted)' , fontWeight: isWarning ? 600 : 400 }}>
                    {formatBytes(usage.usedBytes)} / {formatBytes(usage.limitBytes)}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--border-default)', overflow: 'hidden' }}>
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
        <div className="modal-overlay" onClick={() => setPendingImport(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ marginBottom: 12 }}>{t('dataImport', lang)}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <button
                className={`btn${pendingImport.mode === 'merge' ? ' btn-primary' : ''}`}
                onClick={() => setPendingImport({ ...pendingImport, mode: 'merge' })}
                style={{ textAlign: 'left', padding: '10px 14px' }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t('dataImportMerge', lang)}</div>
                <div className="meta" style={{ fontSize: 12, marginTop: 2 }}>{t('dataImportConfirmMerge', lang)}</div>
              </button>
              <button
                className={`btn${pendingImport.mode === 'overwrite' ? ' btn-primary' : ''}`}
                onClick={() => setPendingImport({ ...pendingImport, mode: 'overwrite' })}
                style={{ textAlign: 'left', padding: '10px 14px' }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t('dataImportOverwrite', lang)}</div>
                <div className="meta" style={{ fontSize: 12, marginTop: 2 }}>{t('dataImportConfirmOverwrite', lang)}</div>
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
