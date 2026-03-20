import type { ThemePref } from './storage';
import { resetOnboarding } from './onboardingState';
import { t } from './i18n';
import type { Lang } from './i18n';
import type { FontSize } from './types';

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
