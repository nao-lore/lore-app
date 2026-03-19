import { useState, useEffect, useCallback } from 'react';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import { useFocusTrap } from './useFocusTrap';
import { markOnboardingDone } from './onboardingState';

interface OnboardingProps {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onClose: () => void;
  initialStep?: number;
}

interface StepDef {
  titleKey: string;
  descKey: string;
  final?: boolean;
  descAlign?: 'left';
  custom?: 'lang' | 'howItWorks' | 'extensionReady';
}

const LANG_OPTIONS: { code: Lang; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '\u{1F1FA}\u{1F1F8}' },
  { code: 'ja', label: '\u65E5\u672C\u8A9E', flag: '\u{1F1EF}\u{1F1F5}' },
  { code: 'es', label: 'Espa\u00F1ol', flag: '\u{1F1EA}\u{1F1F8}' },
  { code: 'fr', label: 'Fran\u00E7ais', flag: '\u{1F1EB}\u{1F1F7}' },
  { code: 'de', label: 'Deutsch', flag: '\u{1F1E9}\u{1F1EA}' },
  { code: 'zh', label: '\u4E2D\u6587', flag: '\u{1F1E8}\u{1F1F3}' },
  { code: 'ko', label: '\uD55C\uAD6D\uC5B4', flag: '\u{1F1F0}\u{1F1F7}' },
  { code: 'pt', label: 'Portugu\u00EAs', flag: '\u{1F1E7}\u{1F1F7}' },
];

// Chrome Web Store URL — update when published
const CHROME_EXTENSION_URL = 'https://chromewebstore.google.com/detail/lore-ai-conversation-snap/opkdpjpgkjcjpkahbljjnhnahliedmkc';

export default function Onboarding({ lang, onLangChange, onClose, initialStep = 0 }: OnboardingProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  // Clamp initialStep to valid range for 3 steps
  const [step, setStep] = useState(Math.min(initialStep, 2));

  const finish = useCallback(() => {
    markOnboardingDone();
    onClose();
  }, [onClose]);

  // Esc to skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [finish]);

  const steps: StepDef[] = [
    {
      titleKey: 'onboardingLangTitle',
      descKey: 'onboardingLangDesc',
      custom: 'lang',
    },
    {
      titleKey: 'onboardingHowItWorksTitle',
      descKey: 'onboardingHowItWorksDesc',
      descAlign: 'left',
      custom: 'howItWorks',
    },
    {
      titleKey: 'onboardingExtReadyTitle',
      descKey: 'onboardingExtReadyDesc',
      final: true,
      custom: 'extensionReady',
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const isFirst = step === 0;
  const totalSteps = steps.length;

  return (
    <div className="onboarding-overlay">
      <div ref={trapRef} className="onboarding-card" role="dialog" aria-modal="true" aria-label={t('ariaSetupWizard', lang)}>
        {/* Progress dots */}
        <div className="onboarding-dots" role="tablist" aria-label={t('ariaOnboardingSteps', lang)}>
          {steps.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === step}
              aria-label={tf('onboardingStepCounter', lang, i + 1, totalSteps)}
              className={`onboarding-dot${i === step ? ' active' : ''}`}
              onClick={() => setStep(i)}
              tabIndex={i === step ? 0 : -1}
            />
          ))}
        </div>

        {/* Step counter */}
        <div className="meta text-center text-sm mb-8">
          {tf('onboardingStepCounter', lang, step + 1, totalSteps)}
        </div>

        {/* Content */}
        <h2 className="onboarding-title">
          {t(current.titleKey as Parameters<typeof t>[0], lang)}
        </h2>

        {/* Step 1: Language selector */}
        {current.custom === 'lang' ? (
          <div className="onboarding-lang-grid">
            {LANG_OPTIONS.map((opt) => (
              <button
                key={opt.code}
                onClick={() => onLangChange(opt.code)}
                className={`onboarding-lang-btn${lang === opt.code ? ' selected' : ''}`}
              >
                <span className="onboarding-lang-flag">{opt.flag}</span>
                {opt.label}
              </button>
            ))}
            <p className="text-sm text-muted text-center onboarding-lang-hint">
              {t(current.descKey as Parameters<typeof t>[0], lang)}
            </p>
          </div>
        ) : current.custom === 'howItWorks' ? (
          /* Step 2: How it works (merged welcome + asset) */
          <div className="flex justify-center onboarding-section">
            <p className="onboarding-desc-left">
              {t(current.descKey as Parameters<typeof t>[0], lang)}
            </p>
          </div>
        ) : current.custom === 'extensionReady' ? (
          /* Step 3: Chrome extension + You're all set */
          <>
            <p className="onboarding-desc no-margin">
              {t(current.descKey as Parameters<typeof t>[0], lang)}
            </p>
            <div className="flex justify-center mb-28">
              <a
                href={CHROME_EXTENSION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-onboarding onboarding-ext-link"
              >
                {t('onboardingExtensionInstall', lang)}
              </a>
            </div>
          </>
        ) : (
          <p className="onboarding-desc">
            {t(current.descKey as Parameters<typeof t>[0], lang)}
          </p>
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <div>
            {!isFirst && (
              <button
                className="btn btn-nav-sm"
                onClick={() => setStep((s) => s - 1)}
              >
                {t('onboardingBack', lang)}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            {!isLast && (
              <button
                className="btn btn-nav-sm onboarding-skip-btn"
                onClick={finish}
              >
                {t('onboardingSkip', lang)}
              </button>
            )}
            {current.final ? (
              <button
                className="btn btn-primary btn-md-action"
                onClick={finish}
              >
                {t('onboardingGetStarted', lang)}
              </button>
            ) : (
              <button
                className="btn btn-primary btn-md-action"
                onClick={() => setStep((s) => s + 1)}
              >
                {t('onboardingNext', lang)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
