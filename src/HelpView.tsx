import { resetOnboarding } from './onboardingState';
import { t } from './i18n';
import type { Lang } from './i18n';

interface HelpViewProps {
  onBack: () => void;
  lang: Lang;
  onShowOnboarding?: () => void;
  onFeedback?: () => void;
}

export default function HelpView({ onBack, lang, onShowOnboarding, onFeedback }: HelpViewProps) {
  return (
    <div className="workspace-content">
      <div className="page-header">
        <button className="btn-back" onClick={onBack} style={{ marginBottom: 12 }}>
          ← {t('back', lang)}
        </button>
        <h2>{t('helpTitle', lang)}</h2>
      </div>

      <div className="flex-col-gap-md">
        {/* 1. Loreとは */}
        <div className="content-card">
          <div className="content-card-header">{t('helpWhatIsLoreTitle', lang)}</div>
          <p className="help-body-text">
            {t('helpWhatIsLoreDesc', lang)}
          </p>
          <p className="meta text-sm" style={{ marginTop: 10 }}>
            {t('helpWhatIsLoreAudience', lang)}
          </p>
        </div>

        {/* 2. 基本的な使い方 */}
        <div className="content-card">
          <div className="content-card-header">{t('helpGettingStartedTitle', lang)}</div>
          <div className="flex-col-gap-none" style={{ gap: 14 }}>
            {([
              { step: 'Step 1', key: 'helpStep1' as const },
              { step: 'Step 2', key: 'helpStep2' as const },
              { step: 'Step 3', key: 'helpStep3' as const },
              { step: 'Step 4', key: 'helpStep4' as const },
              { step: 'Step 5', key: 'helpStep5' as const },
            ]).map((item) => (
              <div key={item.step} className="help-step">
                <span className="help-step-badge">
                  {item.step}
                </span>
                <span className="help-step-text">
                  {t(item.key, lang)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 3. 各機能の説明 */}
        <div className="content-card">
          <div className="content-card-header">{t('helpFeaturesTitle', lang)}</div>
          <div className="flex-col-gap-none">
            {([
              { name: 'Worklog', key: 'helpFeatureWorklog' as const },
              { name: 'Context Snapshot', key: 'helpFeatureHandoff' as const },
              { name: 'Project', key: 'helpFeatureProject' as const },
              { name: 'Project Summary', key: 'helpFeatureProjectSummary' as const },
              { name: 'TODO', key: 'helpFeatureTodo' as const },
              { name: 'Timeline', key: 'helpFeatureTimeline' as const },
            ]).map((item) => (
              <div
                key={item.name}
                className="feature-item"
              >
                <div className="feature-name">
                  {item.name}
                </div>
                <div className="feature-desc">
                  {t(item.key, lang)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Keyboard shortcuts */}
        <div className="content-card">
          <div className="content-card-header">{t('helpKeyboardTitle', lang)}</div>
          <div className="flex-col-gap-none">
            {([
              { keys: '⌘ N', key: 'helpShortcutCreate' as const },
              { keys: '⌘ K', key: 'helpShortcutSearch' as const },
              { keys: '⌘ ,', key: 'helpShortcutSettings' as const },
              { keys: '?', key: 'helpShortcutList' as const },
              { keys: 'Esc', key: 'helpShortcutEsc' as const },
            ]).map((item) => (
              <div
                key={item.keys}
                className="shortcut-row"
              >
                <span className="text-md" style={{ color: 'var(--text-body)' }}>{t(item.key, lang)}</span>
                <kbd className="kbd-key">{item.keys}</kbd>
              </div>
            ))}
          </div>
        </div>

        {/* 4. APIキーについて */}
        <div className="content-card">
          <div className="content-card-header">{t('helpApiKeysTitle', lang)}</div>
          <p className="help-body-text-mb">
            {t('helpApiKeysDesc', lang)}
          </p>
          <div className="flex-col-gap-md" style={{ gap: 8 }}>
            {[
              { name: 'Claude (Anthropic)', url: 'https://console.anthropic.com' },
              { name: 'Gemini (Google)', url: 'https://aistudio.google.com' },
              { name: 'OpenAI', url: 'https://platform.openai.com' },
            ].map((provider) => (
              <div key={provider.name} className="provider-row">
                <span className="provider-name">
                  {provider.name}
                </span>
                <a
                  href={provider.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="provider-link"
                >
                  {provider.url}
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* 5. データについての注意 */}
        <div className="content-card">
          <div className="content-card-header">{t('helpDataNoticeTitle', lang)}</div>
          <ul className="flex-col" style={{ margin: 0, paddingLeft: 20, gap: 6 }}>
            <li className="help-step-text">
              {t('helpDataNotice1', lang)}
            </li>
            <li className="help-step-text">
              {t('helpDataNotice2', lang)}
            </li>
            <li className="help-step-text">
              {t('helpDataNotice3', lang)}
            </li>
          </ul>
        </div>

        {/* Pricing */}
        <div className="content-card provider-row">
          <span className="text-md" style={{ color: 'var(--text-body)' }}>
            {t('navPricing', lang)}
          </span>
          <span className="feedback-thanks-desc">
            — {lang === 'ja' ? 'アカウントメニューから料金プランを確認できます' : 'Check the Pricing page from the account menu'}
          </span>
        </div>

        {/* 6. よくある質問 */}
        <div className="content-card">
          <div className="content-card-header">{t('helpFaqTitle', lang)}</div>
          <div className="flex-col-gap-none">
            {([
              { qKey: 'helpFaqDiffFromMemoryQ' as const, aKey: 'helpFaqDiffFromMemoryA' as const },
              { qKey: 'helpFaqDataStorageQ' as const, aKey: 'helpFaqDataStorageA' as const },
              { qKey: 'helpFaqApiKeysSafeQ' as const, aKey: 'helpFaqApiKeysSafeA' as const },
              { qKey: 'helpFaqWhyFreeQ' as const, aKey: 'helpFaqWhyFreeA' as const },
              { qKey: 'helpFaqOpenSourceProQ' as const, aKey: 'helpFaqOpenSourceProA' as const },
              { qKey: 'helpFaqDataDisappearQ' as const, aKey: 'helpFaqDataDisappearA' as const },
              { qKey: 'helpFaqTransformQ' as const, aKey: 'helpFaqTransformA' as const },
              { qKey: 'helpFaqDataLostQ' as const, aKey: 'helpFaqDataLostA' as const },
              { qKey: 'helpFaqLongInputQ' as const, aKey: 'helpFaqLongInputA' as const },
              { qKey: 'helpFaqContextVsSummaryQ' as const, aKey: 'helpFaqContextVsSummaryA' as const },
              { qKey: 'helpFaqHandoffToAiQ' as const, aKey: 'helpFaqHandoffToAiA' as const },
              { qKey: 'helpFaqUpdateSummaryQ' as const, aKey: 'helpFaqUpdateSummaryA' as const },
              { qKey: 'helpFaqWorklogVsHandoffQ' as const, aKey: 'helpFaqWorklogVsHandoffA' as const },
              { qKey: 'helpFaqKnowledgeBaseQ' as const, aKey: 'helpFaqKnowledgeBaseA' as const },
              { qKey: 'helpFaqTooManyLogsQ' as const, aKey: 'helpFaqTooManyLogsA' as const },
              { qKey: 'helpFaqExtensionQ' as const, aKey: 'helpFaqExtensionA' as const },
            ]).map((item, i, arr) => (
              <div
                key={i}
                style={{
                  padding: '12px 0',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--border-divider)' : 'none',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Q: {t(item.qKey, lang)}
                </div>
                <div className="feature-desc">
                  A: {t(item.aKey, lang)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Feedback */}
        {onFeedback && (
          <div className="content-card">
            <div className="content-card-header">{t('helpFeedbackTitle', lang)}</div>
            <p className="help-body-text-mb">
              {t('helpFeedbackDesc', lang)}
            </p>
            <button
              className="btn btn-primary btn-md-action"
              onClick={onFeedback}
            >
              {t('feedbackTitle', lang)}
            </button>
          </div>
        )}

        {/* Show onboarding again */}
        {onShowOnboarding && (
          <div className="text-center" style={{ paddingTop: 4 }}>
            <button
              className="btn text-sm"
              onClick={() => { resetOnboarding(); onShowOnboarding(); }}
            >
              {t('helpShowOnboarding', lang)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
