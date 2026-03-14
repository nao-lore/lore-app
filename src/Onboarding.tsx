import { useState, useEffect, useCallback } from 'react';
import { t } from './i18n';
import type { Lang } from './i18n';
import { useFocusTrap } from './useFocusTrap';
import { markOnboardingDone } from './onboardingState';

interface OnboardingProps {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onClose: () => void;
  onStartCreate: () => void;
}

interface StepDef {
  titleKey: string;
  descKey: string;
  action?: { labelKey: string; handler: () => void };
  final?: boolean;
  descAlign?: 'left';
  custom?: 'lang';
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

export default function Onboarding({ lang, onLangChange, onClose, onStartCreate }: OnboardingProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [step, setStep] = useState(0);

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
      titleKey: 'onboardingWelcomeTitle',
      descKey: 'onboardingWelcomeDesc',
    },
    {
      titleKey: 'onboardingAssetTitle',
      descKey: 'onboardingAssetDesc',
      descAlign: 'left',
    },
    {
      titleKey: 'onboardingSampleTitle',
      descKey: 'onboardingSampleDesc',
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
      <div ref={trapRef} className="onboarding-card" role="dialog" aria-modal="true">
        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
          {steps.map((_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: i === step ? 'var(--accent)' : 'var(--border-default)',
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>

        {/* Step counter */}
        <div className="meta" style={{ textAlign: 'center', fontSize: 12, marginBottom: 8 }}>
          Step {step + 1} / {totalSteps}
        </div>

        {/* Content */}
        <h2 style={{ textAlign: 'center', fontSize: 20, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
          {t(current.titleKey as Parameters<typeof t>[0], lang)}
        </h2>

        {/* Language selector (custom step) */}
        {current.custom === 'lang' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, margin: '0 auto 28px', maxWidth: 340 }}>
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
            <p style={{ gridColumn: '1 / -1', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              {t(current.descKey as Parameters<typeof t>[0], lang)}
            </p>
          </div>
        ) : current.descAlign === 'left' ? (
          <div style={{ display: 'flex', justifyContent: 'center', margin: '0 0 28px' }}>
            <p style={{ textAlign: 'left', fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)', margin: 0, maxWidth: 360, whiteSpace: 'pre-line' }}>
              {t(current.descKey as Parameters<typeof t>[0], lang)}
            </p>
          </div>
        ) : (
          <p style={{ textAlign: 'center', fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)', margin: '0 0 28px', maxWidth: 360, marginLeft: 'auto', marginRight: 'auto', whiteSpace: 'pre-line' }}>
            {t(current.descKey as Parameters<typeof t>[0], lang)}
          </p>
        )}

        {/* Action button (step-specific) */}
        {current.action && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <button
              className="btn btn-primary"
              onClick={current.action.handler}
              style={{ padding: '8px 24px', fontSize: 14, fontWeight: 600, borderRadius: 10 }}
            >
              {t(current.action.labelKey as Parameters<typeof t>[0], lang)}
            </button>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {!isFirst && (
              <button
                className="btn"
                onClick={() => setStep((s) => s - 1)}
                style={{ fontSize: 13, padding: '6px 14px' }}
              >
                {t('onboardingBack', lang)}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isLast && (
              <button
                className="btn"
                onClick={finish}
                style={{ fontSize: 13, padding: '6px 14px', color: 'var(--text-muted)' }}
              >
                {t('onboardingSkip', lang)}
              </button>
            )}
            {current.final ? (
              <button
                className="btn btn-primary"
                onClick={finish}
                style={{ fontSize: 13, padding: '6px 20px', fontWeight: 600, borderRadius: 8 }}
              >
                {t('onboardingGetStarted', lang)}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => setStep((s) => s + 1)}
                style={{ fontSize: 13, padding: '6px 20px', fontWeight: 600, borderRadius: 8 }}
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
