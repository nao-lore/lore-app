import { useState, memo } from 'react';
import type { ThemePref } from '../storage';
import { getLang, setLang, getUiLang } from '../storage';
import { t, OUTPUT_LANGS } from '../i18n';
import type { Lang } from '../i18n';
import type { FontSize } from '../types';
import { checkProStatus } from '../utils/proManager';
import { STRIPE_CUSTOMER_PORTAL_URL } from '../utils/stripe';
import { tf } from '../i18n';

interface SettingsAppearanceProps {
  lang: Lang;
  onUiLangChange: (lang: Lang) => void;
  themePref: ThemePref;
  onThemeChange: (theme: ThemePref) => void;
  fontSize: FontSize;
  onFontSizeChange: (size: FontSize) => void;
}

export const SettingsAppearance = memo(function SettingsAppearance({
  lang, onUiLangChange, themePref, onThemeChange, fontSize, onFontSizeChange,
}: SettingsAppearanceProps) {
  const [currentUiLang, setCurrentUiLang] = useState<Lang>(getUiLang());
  const [currentOutputLang, setCurrentOutputLang] = useState<string>(getLang());

  const handleUiLangChange = (v: Lang) => {
    setCurrentUiLang(v);
    onUiLangChange(v);
  };

  const handleOutputLangChange = (v: string) => {
    setCurrentOutputLang(v);
    setLang(v);
  };

  return (
    <>
      {/* Pro Plan Status */}
      {checkProStatus().isPro && (
        <div className="content-card">
          <div className="content-card-header">
            {t('proActive', lang)} <span className="pro-badge-inline">{t('proBadge', lang)}</span>
          </div>
          {checkProStatus().expiresAt && (
            <p className="meta meta-desc">
              {tf('proExpires', lang, new Date(checkProStatus().expiresAt!).toLocaleDateString())}
            </p>
          )}
          <a
            href={STRIPE_CUSTOMER_PORTAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn text-sm"
          >
            {t('manageSubscription', lang)}
          </a>
        </div>
      )}

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
              className={`seg-control-btn btn-pill${currentUiLang === opt.code ? ' active-worklog' : ''}`}
              onClick={() => handleUiLangChange(opt.code as Lang)}
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
            className={`seg-control-btn btn-pill-sm${currentOutputLang === 'auto' ? ' active-worklog' : ''}`}
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
              className={`seg-control-btn btn-pill-sm${currentOutputLang === v.code ? ' active-worklog' : ''}`}
              onClick={() => handleOutputLangChange(v.code)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
});
