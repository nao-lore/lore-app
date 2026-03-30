import { ExternalLink } from 'lucide-react';
import type { ThemePref } from './storage';
import { resetOnboarding } from './onboardingState';
import { t } from './i18n';
import type { Lang } from './i18n';
import type { FontSize } from './types';

const PRIVACY_URL = '/privacy.html';
const TERMS_URL = '/terms.html';

// Extracted components
import { SettingsApiKeys } from './components/SettingsApiKeys';
import { SettingsAppearance } from './components/SettingsAppearance';
import { SettingsIntegrations, SettingsFeatures } from './components/SettingsIntegrations';
import { SettingsDataManagement } from './components/SettingsDataManagement';

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
}

export default function SettingsPanel({ onBack, lang, onUiLangChange, themePref, onThemeChange, fontSize, onFontSizeChange, showToast, onShowOnboarding }: SettingsPanelProps) {
  return (
    <div className="workspace-content">
      <div className="page-header">
        <button className="btn-back btn-back-mb" onClick={onBack}>
          ← {t('back', lang)}
        </button>
        <h2>{t('settingsTitle', lang)}</h2>
      </div>

      <div className="flex-col-gap-md">
        <SettingsAppearance
          lang={lang}
          onUiLangChange={onUiLangChange}
          themePref={themePref}
          onThemeChange={onThemeChange}
          fontSize={fontSize}
          onFontSizeChange={onFontSizeChange}
        />

        <SettingsApiKeys lang={lang} showToast={showToast} />

        <SettingsIntegrations lang={lang} />

        <SettingsFeatures lang={lang} />

        <SettingsDataManagement lang={lang} showToast={showToast} />

        {/* Legal links */}
        <div className="content-card">
          <div className="content-card-header">{t('settingsLegalTitle', lang)}</div>
          <div className="flex-col" style={{ gap: 8, padding: '0 0 4px' }}>
            <a
              href={PRIVACY_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}
            >
              {t('settingsPrivacyPolicy', lang)}
              <ExternalLink size={13} />
            </a>
            <a
              href={TERMS_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}
            >
              {t('settingsTermsOfService', lang)}
              <ExternalLink size={13} />
            </a>
          </div>
        </div>

        {/* Show onboarding again */}
        {onShowOnboarding && (
          <div className="text-center" style={{ paddingTop: 4 }}>
            <button
              className="btn fs-13"
              onClick={() => { resetOnboarding(); onShowOnboarding(); }}
            >
              {t('showOnboardingAgain', lang)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
