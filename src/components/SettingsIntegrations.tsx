import { useState, memo } from 'react';
import { Check } from 'lucide-react';
import { safeGetItem, getAutoReportSetting, setAutoReportSetting, getFeatureEnabled, setFeatureEnabled, getWeeklyGoal, setWeeklyGoal } from '../storage';
import { t } from '../i18n';
import type { Lang } from '../i18n';

// ---- Notion + Slack ----

interface SettingsIntegrationsProps {
  lang: Lang;
}

export const SettingsIntegrations = memo(function SettingsIntegrations({ lang }: SettingsIntegrationsProps) {
  const [notionKey, setNotionKeyState] = useState(() => safeGetItem('threadlog_notion_api_key') || '');
  const [notionDbId, setNotionDbIdState] = useState(() => safeGetItem('threadlog_notion_database_id') || '');
  const [notionSaved, setNotionSaved] = useState(false);
  const [notionError, setNotionError] = useState('');

  const [slackWebhook, setSlackWebhookState] = useState(() => safeGetItem('threadlog_slack_webhook_url') || '');
  const [slackSaved, setSlackSaved] = useState(false);
  const [slackError, setSlackError] = useState('');

  return (
    <>
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
              className="input input-settings"
              type="password"
              value={notionKey}
              onChange={(e) => { setNotionKeyState(e.target.value); setNotionError(''); }}
              onBlur={() => { if (notionKey.trim() && !notionKey.startsWith('ntn_') && !notionKey.startsWith('secret_')) setNotionError(t('notionApiKeyError', lang)); }}
              placeholder={t('notionApiKeyPlaceholder', lang)}
              aria-label={t('notionApiKey', lang)}
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
              className="input input-settings"
              type="text"
              value={notionDbId}
              onChange={(e) => setNotionDbIdState(e.target.value)}
              placeholder={t('notionDatabaseIdPlaceholder', lang)}
              aria-label={t('notionDatabaseId', lang)}
              maxLength={200}
            />
          </div>
          <div className="flex-row-gap-sm">
            <button
              className="btn btn-primary btn-sm-save"
              onClick={() => {
                if (notionKey.trim() && !notionKey.startsWith('ntn_') && !notionKey.startsWith('secret_')) {
                  setNotionError(t('notionApiKeyError', lang));
                  return;
                }
                setNotionError('');
                import('../integrations').then(({ setNotionApiKey, setNotionDatabaseId }) => {
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
              className="input input-settings max-w-480"
              type="password"
              value={slackWebhook}
              onChange={(e) => { setSlackWebhookState(e.target.value); setSlackError(''); }}
              onBlur={() => { if (slackWebhook.trim() && !slackWebhook.startsWith('https://hooks.slack.com')) setSlackError(t('slackWebhookError', lang)); }}
              placeholder={t('slackWebhookPlaceholder', lang)}
              aria-label={t('slackWebhookUrl', lang)}
            />
            {slackError && (
              <p className="error-text-sm">{slackError}</p>
            )}
          </div>
          <div className="flex-row-gap-sm">
            <button
              className="btn btn-primary btn-sm-save"
              onClick={() => {
                if (slackWebhook.trim() && !slackWebhook.startsWith('https://hooks.slack.com')) {
                  setSlackError(t('slackWebhookError', lang));
                  return;
                }
                setSlackError('');
                import('../integrations').then(({ setSlackWebhookUrl }) => {
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
    </>
  );
});

// ---- Feature Toggles + Weekly Goal ----

interface SettingsFeaturesProps {
  lang: Lang;
}

export const SettingsFeatures = memo(function SettingsFeatures({ lang }: SettingsFeaturesProps) {
  const [autoReport, setAutoReport] = useState(getAutoReportSetting);
  const [weeklyGoalValue, setWeeklyGoalValue] = useState(() => getWeeklyGoal());

  return (
    <>
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
                <div className="meta fs-12" style={{ marginTop: 2 }}>
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
              <div className="meta fs-12" style={{ marginTop: 2 }}>
                {t('autoWeeklyReportDesc', lang)}
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Weekly Goal */}
      <div className="content-card">
        <div className="content-card-header">{t('weeklyGoalLabel', lang)}</div>
        <div className="flex-row-gap-sm" style={{ alignItems: 'center' }}>
          <input
            type="number"
            min={1}
            max={50}
            value={weeklyGoalValue}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) {
                setWeeklyGoalValue(v);
                setWeeklyGoal(v);
              }
            }}
            className="input"
            style={{ width: 80 }}
            aria-label={t('weeklyGoalLabel', lang)}
          />
        </div>
      </div>
    </>
  );
});
