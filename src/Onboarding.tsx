import { useState, useEffect, useCallback } from 'react';
import { t } from './i18n';
import type { Lang } from './i18n';
import { useFocusTrap } from './useFocusTrap';
import { markOnboardingDone } from './onboardingState';

interface OnboardingProps {
  lang: Lang;
  onClose: () => void;
  onOpenSettings: () => void;
  onStartCreate: () => void;
}

interface StepDef {
  titleKey: string;
  descKey: string;
  action?: { labelKey: string; handler: () => void };
  final?: boolean;
  descAlign?: 'left';
}

export default function Onboarding({ lang, onClose, onOpenSettings, onStartCreate }: OnboardingProps) {
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
      titleKey: 'onboardingWelcomeTitle',
      descKey: 'onboardingWelcomeDesc',
    },
    {
      titleKey: 'onboardingApiKeyTitle',
      descKey: 'onboardingApiKeyDesc',
      descAlign: 'left',
      action: {
        labelKey: 'onboardingApiKeyAction',
        handler: () => { markOnboardingDone(); onOpenSettings(); },
      },
    },
    {
      titleKey: 'onboardingPasteTitle',
      descKey: 'onboardingPasteDesc',
      action: {
        labelKey: 'onboardingPasteAction',
        handler: () => { markOnboardingDone(); onStartCreate(); },
      },
    },
    {
      titleKey: 'onboardingExtensionTitle',
      descKey: 'onboardingExtensionDesc',
      action: {
        labelKey: 'onboardingExtensionAction',
        handler: () => {},
      },
    },
    {
      titleKey: 'onboardingAssetTitle',
      descKey: 'onboardingAssetDesc',
      descAlign: 'left',
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
        {current.descAlign === 'left' ? (
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
