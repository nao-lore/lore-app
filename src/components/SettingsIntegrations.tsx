import { useState, memo } from 'react';
import { getAutoReportSetting, setAutoReportSetting, getFeatureEnabled, setFeatureEnabled, getWeeklyGoal, setWeeklyGoal } from '../storage';
import { t } from '../i18n';
import type { Lang } from '../i18n';

// ---- Notion + Slack ----

interface SettingsIntegrationsProps {
  lang: Lang;
}

export const SettingsIntegrations = memo(function SettingsIntegrations({ lang }: SettingsIntegrationsProps) {
  return (
    <>
      {/* Notion Integration — Coming Soon */}
      <div className="content-card" style={{ opacity: 0.6 }} aria-disabled="true">
        <div className="content-card-header flex-row" style={{ gap: 8 }}>
          {t('notionLabel', lang)}
          <span className="badge-coming-soon">{t('integrationComingSoon', lang)}</span>
        </div>
        <p className="meta meta-desc">
          {t('notionDesc', lang)}
        </p>
      </div>

      {/* Slack Integration — Coming Soon */}
      <div className="content-card" style={{ opacity: 0.6 }} aria-disabled="true">
        <div className="content-card-header flex-row" style={{ gap: 8 }}>
          {t('slackLabel', lang)}
          <span className="badge-coming-soon">{t('integrationComingSoon', lang)}</span>
        </div>
        <p className="meta meta-desc">
          {t('slackDesc', lang)}
        </p>
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
