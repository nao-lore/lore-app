import { useState, useEffect, useCallback } from 'react';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import { useFocusTrap } from './useFocusTrap';
import { markOnboardingDone } from './onboardingState';
import { safeSetItem, addProject } from './storage';

interface OnboardingProps {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onClose: () => void;
  onPauseForSettings?: () => void;
  initialStep?: number;
}

interface StepDef {
  titleKey: string;
  descKey: string;
  action?: { labelKey: string; handler: () => void };
  final?: boolean;
  descAlign?: 'left';
  custom?: 'lang' | 'extension' | 'project';
}

const LANG_OPTIONS: { code: Lang; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
];

// Chrome Web Store URL — update when published
const CHROME_EXTENSION_URL = 'https://chromewebstore.google.com/detail/lore-capture/ioaccmbgjkaklailnmgklmipccmbneen';

export default function Onboarding({ lang, onLangChange, onClose, onPauseForSettings, initialStep = 0 }: OnboardingProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [step, setStep] = useState(initialStep);
  const [projectName, setProjectName] = useState('');
  const [projectCreated, setProjectCreated] = useState(false);

  const handleCreateProject = useCallback(() => {
    const name = projectName.trim();
    if (!name || projectCreated) return;
    addProject(name);
    setProjectCreated(true);
  }, [projectName, projectCreated]);

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

  const handlePauseForSettings = useCallback(() => {
    // Save current step so we can resume
    safeSetItem('threadlog_onboarding_step', String(step));
    onPauseForSettings?.();
  }, [step, onPauseForSettings]);

  const steps: StepDef[] = [
    {
      titleKey: 'onboardingLangTitle',
      descKey: 'onboardingLangDesc',
      custom: 'lang',
    },
    {
      titleKey: 'onboardingWelcomeTitle',
      descKey: 'onboardingWelcomeDesc',
    },
    {
      titleKey: 'onboardingAssetTitle',
      descKey: 'onboardingAssetDesc',
      descAlign: 'left',
    },
    {
      titleKey: 'onboardingProjectTitle',
      descKey: 'onboardingProjectDesc',
      custom: 'project',
    },
    {
      titleKey: 'onboardingApiKeyTitle',
      descKey: 'onboardingApiKeyDesc',
      descAlign: 'left',
      action: onPauseForSettings ? { labelKey: 'onboardingApiKeyAction', handler: handlePauseForSettings } : undefined,
    },
    {
      titleKey: 'onboardingExtensionTitle',
      descKey: 'onboardingExtensionDesc',
      custom: 'extension',
    },
    {
      titleKey: 'onboardingReadyTitle',
      descKey: 'onboardingReadyDesc',
      final: true,
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
        <div className="onboarding-dots">
          {steps.map((_, i) => (
            <div
              key={i}
              className="onboarding-dot" style={{ background: i === step ? 'var(--accent)' : 'var(--border-default)' }}
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

        {/* Language selector (custom step) */}
        {current.custom === 'project' ? (
          <div className="flex-col gap-10" style={{ margin: '0 0 28px' }}>
            <p className="onboarding-desc">
              {t(current.descKey as Parameters<typeof t>[0], lang)}
            </p>
            <div className="flex justify-center">
              <input
                type="text"
                className="input"
                value={projectName}
                onChange={(e) => { setProjectName(e.target.value); setProjectCreated(false); }}
                placeholder={t('onboardingProjectPlaceholder', lang)}
                maxLength={60}
                disabled={projectCreated}
                style={{ maxWidth: 320, width: '100%' }}
              />
            </div>
            {projectCreated && (
              <p className="text-sm text-center" style={{ color: 'var(--success-text, #22c55e)' }}>
                {t('onboardingProjectCreated', lang)}
              </p>
            )}
            {!projectCreated && projectName.trim() && (
              <div className="flex justify-center">
                <button
                  className="btn btn-primary btn-onboarding"
                  onClick={handleCreateProject}
                >
                  {t('onboardingProjectTitle', lang)}
                </button>
              </div>
            )}
          </div>
        ) : current.custom === 'lang' ? (
          <div className="onboarding-lang-grid">
            {LANG_OPTIONS.map((opt) => (
              <button
                key={opt.code}
                onClick={() => onLangChange(opt.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  fontSize: 14,
                  fontWeight: lang === opt.code ? 700 : 400,
                  borderRadius: 10,
                  border: lang === opt.code ? '2px solid var(--accent)' : '2px solid var(--border-default)',
                  background: lang === opt.code ? 'var(--accent-bg, rgba(99,102,241,0.08))' : 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 20 }}>{opt.flag}</span>
                {opt.label}
              </button>
            ))}
            <p className="text-sm text-muted text-center" style={{ gridColumn: '1 / -1', margin: '4px 0 0' }}>
              {t(current.descKey as Parameters<typeof t>[0], lang)}
            </p>
          </div>
        ) : current.custom === 'extension' ? (
          <>
            <p className="onboarding-desc mb-20" style={{ margin: 0 }}>
              {t(current.descKey as Parameters<typeof t>[0], lang)}
            </p>
            <div className="flex justify-center mb-28">
              <a
                href={CHROME_EXTENSION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-onboarding"
                style={{ textDecoration: 'none' }}
              >
                {t('onboardingExtensionInstall', lang)}
              </a>
            </div>
          </>
        ) : current.descAlign === 'left' ? (
          <div className="flex justify-center" style={{ margin: '0 0 28px' }}>
            <p className="onboarding-desc-left">
              {t(current.descKey as Parameters<typeof t>[0], lang)}
            </p>
          </div>
        ) : (
          <p className="onboarding-desc">
            {t(current.descKey as Parameters<typeof t>[0], lang)}
          </p>
        )}

        {/* Action button (step-specific, not for extension which has its own) */}
        {current.action && current.custom !== 'extension' && (
          <div className="flex justify-center mb-20">
            <button
              className="btn btn-primary btn-onboarding"
              onClick={current.action.handler}
            >
              {t(current.action.labelKey as Parameters<typeof t>[0], lang)}
            </button>
          </div>
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
                className="btn btn-nav-sm"
                onClick={finish}
                style={{ color: 'var(--text-muted)' }}
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
