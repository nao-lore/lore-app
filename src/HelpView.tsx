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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 1. Loreとは */}
        <div className="content-card">
          <div className="content-card-header">{t('helpWhatIsLoreTitle', lang)}</div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-body)', margin: 0 }}>
            {t('helpWhatIsLoreDesc', lang)}
          </p>
          <p className="meta" style={{ fontSize: 13, marginTop: 10 }}>
            {t('helpWhatIsLoreAudience', lang)}
          </p>
        </div>

        {/* 2. 基本的な使い方 */}
        <div className="content-card">
          <div className="content-card-header">{t('helpGettingStartedTitle', lang)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
            {([
              { step: 'Step 1', key: 'helpStep1' as const },
              { step: 'Step 2', key: 'helpStep2' as const },
              { step: 'Step 3', key: 'helpStep3' as const },
              { step: 'Step 4', key: 'helpStep4' as const },
              { step: 'Step 5', key: 'helpStep5' as const },
            ]).map((item) => (
              <div key={item.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#fff',
                  background: 'var(--accent)',
                  borderRadius: 6,
                  padding: '2px 8px',
                  marginTop: 2,
                }}>
                  {item.step}
                </span>
                <span style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-body)' }}>
                  {t(item.key, lang)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 3. 各機能の説明 */}
        <div className="content-card">
          <div className="content-card-header">{t('helpFeaturesTitle', lang)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 4 }}>
            {([
              { name: 'Worklog', key: 'helpFeatureWorklog' as const },
              { name: 'Handoff', key: 'helpFeatureHandoff' as const },
              { name: 'Project', key: 'helpFeatureProject' as const },
              { name: 'Project Summary', key: 'helpFeatureProjectSummary' as const },
              { name: 'TODO', key: 'helpFeatureTodo' as const },
              { name: 'Timeline', key: 'helpFeatureTimeline' as const },
            ]).map((item) => (
              <div
                key={item.name}
                style={{
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border-divider)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-secondary)', marginBottom: 2 }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}>
                  {t(item.key, lang)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Keyboard shortcuts */}
        <div className="content-card">
          <div className="content-card-header">{t('helpKeyboardTitle', lang)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 4 }}>
            {([
              { keys: '⌘ N', key: 'helpShortcutCreate' as const },
              { keys: '⌘ K', key: 'helpShortcutSearch' as const },
              { keys: '⌘ ,', key: 'helpShortcutSettings' as const },
              { keys: '?', key: 'helpShortcutList' as const },
              { keys: 'Esc', key: 'helpShortcutEsc' as const },
            ]).map((item) => (
              <div
                key={item.keys}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', borderBottom: '1px solid var(--border-divider)',
                }}
              >
                <span style={{ fontSize: 14, color: 'var(--text-body)' }}>{t(item.key, lang)}</span>
                <kbd style={{
                  fontSize: 12, fontFamily: 'inherit', padding: '2px 8px',
                  borderRadius: 4, background: 'var(--bg-sidebar)', border: '1px solid var(--border-default)',
                  color: 'var(--text-secondary)', minWidth: 32, textAlign: 'center',
                }}>{item.keys}</kbd>
              </div>
            ))}
          </div>
        </div>

        {/* 4. APIキーについて */}
        <div className="content-card">
          <div className="content-card-header">{t('helpApiKeysTitle', lang)}</div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-body)', margin: '0 0 12px' }}>
            {t('helpApiKeysDesc', lang)}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { name: 'Claude (Anthropic)', url: 'https://console.anthropic.com' },
              { name: 'Gemini (Google)', url: 'https://aistudio.google.com' },
              { name: 'OpenAI', url: 'https://platform.openai.com' },
            ].map((provider) => (
              <div key={provider.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 140 }}>
                  {provider.name}
                </span>
                <a
                  href={provider.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13, color: 'var(--accent-text)', textDecoration: 'none' }}
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
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-body)' }}>
              {t('helpDataNotice1', lang)}
            </li>
            <li style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-body)' }}>
              {t('helpDataNotice2', lang)}
            </li>
            <li style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-body)' }}>
              {t('helpDataNotice3', lang)}
            </li>
          </ul>
        </div>

        {/* Pricing */}
        <div className="content-card" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, color: 'var(--text-body)' }}>
            {t('navPricing', lang)}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            — {lang === 'ja' ? 'アカウントメニューから料金プランを確認できます' : 'Check the Pricing page from the account menu'}
          </span>
        </div>

        {/* 6. よくある質問 */}
        <div className="content-card">
          <div className="content-card-header">{t('helpFaqTitle', lang)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 4 }}>
            {([
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
              { qKey: 'helpFaqDataStorageQ' as const, aKey: 'helpFaqDataStorageA' as const },
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
                <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}>
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
            <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-body)', margin: '0 0 12px' }}>
              {t('helpFeedbackDesc', lang)}
            </p>
            <button
              className="btn btn-primary"
              onClick={onFeedback}
              style={{ fontSize: 13, padding: '6px 20px', fontWeight: 600, borderRadius: 8 }}
            >
              {t('feedbackTitle', lang)}
            </button>
          </div>
        )}

        {/* Show onboarding again */}
        {onShowOnboarding && (
          <div style={{ textAlign: 'center', paddingTop: 4 }}>
            <button
              className="btn"
              onClick={() => { resetOnboarding(); onShowOnboarding(); }}
              style={{ fontSize: 13 }}
            >
              {t('helpShowOnboarding', lang)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
