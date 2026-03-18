import { useState, useEffect } from 'react';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import { shouldUseBuiltinApi } from './provider';
import { isPro, checkProStatus } from './utils/proManager';
import { redirectToCheckout, STRIPE_CUSTOMER_PORTAL_URL } from './utils/stripe';
import { isInTrialPeriod, getDailyUsageCount, DAILY_LIMIT_FREE } from './utils/trialManager';

interface PricingViewProps {
  onBack: () => void;
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

export default function PricingView({ onBack, lang, showToast }: PricingViewProps) {
  const isFreePlan = shouldUseBuiltinApi();
  const userIsPro = isPro();
  const [loading, setLoading] = useState(false);

  // Handle checkout URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'cancelled') {
      showToast?.(t('checkoutCancelled', lang), 'default');
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      window.history.replaceState({}, '', url.pathname);
    }
  }, [lang, showToast]);

  const handleUpgrade = (plan: 'monthly' | 'annual' = 'monthly') => {
    setLoading(true);
    redirectToCheckout(plan);
  };

  const proStatus = checkProStatus();

  return (
    <div className="workspace-content">
      <div className="page-header">
        <button className="btn-back mb-md" onClick={onBack}>
          ← {t('back', lang)}
        </button>
        <h2>{t('pricingTitle', lang)}</h2>
        <p className="text-md text-muted" style={{ margin: '4px 0 0' }}>
          {t('pricingSubtitle', lang)}
        </p>
      </div>

      <div className="pricing-grid">
        {/* Free Plan */}
        <div className="content-card pricing-card" style={{ border: isFreePlan && !userIsPro ? '2px solid var(--accent)' : undefined }}>
          {isFreePlan && !userIsPro && (
            <div className="pricing-badge">
              {t('pricingCurrentPlan', lang)}
            </div>
          )}

          <div className="mb-lg">
            <div className="content-card-header mb-4">
              {t('pricingFreeTitle', lang)}
            </div>
            <div className="flex items-baseline gap-xs">
              <span className="pricing-price">
                $0
              </span>
              <span className="pricing-period">
                / {t('pricingMonth', lang)}
              </span>
            </div>
            {shouldUseBuiltinApi() && !userIsPro && (() => {
              if (isInTrialPeriod()) {
                return (
                  <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                    {t('pricingTrialActive', lang)}
                  </div>
                );
              }
              const used = getDailyUsageCount();
              return (
                <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                  {tf('pricingUsedToday', lang, used, DAILY_LIMIT_FREE)}
                </div>
              );
            })()}
          </div>

          <div className="flex-col gap-10 flex-1">
            {([
              { key: 'pricingFreeAiTransforms' as const },
              { key: 'pricingFreeCoreFeatures' as const },
              { key: 'pricingFreeLanguages' as const },
              { key: 'pricingFreeChromeExt' as const },
              { key: 'pricingFreeExportImport' as const },
              { key: 'pricingFreeLocalStorage' as const },
            ]).map((item) => (
              <div key={item.key} className="pricing-feature">
                <span className="pricing-check">
                  ✓
                </span>
                <span className="pricing-feature-text">
                  {t(item.key, lang)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-xl">
            <button
              className="btn pricing-btn-full"
              disabled
              style={{ opacity: 0.6 }}
            >
              {isFreePlan && !userIsPro ? t('pricingCurrentPlan', lang) : t('pricingFreeButton', lang)}
            </button>
          </div>
        </div>

        {/* Pro Plan */}
        <div className="content-card pricing-card" style={{ border: userIsPro ? '2px solid var(--accent)' : undefined }}>
          {userIsPro && (
            <div className="pricing-badge">
              {t('pricingCurrentPlan', lang)}
            </div>
          )}

          <div className="pricing-badge-gradient">
            {t('pricingRecommended', lang)}
          </div>

          <div className="mb-lg">
            <div className="content-card-header mb-4">
              {t('pricingProTitle', lang)}
            </div>
            <div className="flex items-baseline gap-xs">
              <span className="pricing-price">
                $9.99
              </span>
              <span className="pricing-period">
                / {t('pricingMonth', lang)}
              </span>
            </div>
            {userIsPro && proStatus.expiresAt && (
              <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                {tf('proExpires', lang, new Date(proStatus.expiresAt).toLocaleDateString())}
              </div>
            )}
          </div>

          <div className="flex-col gap-10 flex-1">
            {([
              { key: 'pricingProUnlimitedAi' as const },
              { key: 'pricingProPriorityAi' as const },
              { key: 'pricingProCloudSync' as const, comingSoon: true },
              { key: 'pricingProMultiDevice' as const, comingSoon: true },
              { key: 'pricingProPrioritySupport' as const },
              { key: 'pricingProEarlyAccess' as const },
            ]).map((item) => (
              <div key={item.key} className="pricing-feature">
                <span className="pricing-check">
                  ✓
                </span>
                <span className="pricing-feature-text">
                  {t(item.key, lang)}
                  {item.comingSoon && (
                    <span className="pricing-coming-soon">
                      {t('pricingComingSoon', lang)}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-xl">
            {userIsPro ? (
              <div className="flex-col gap-10">
                <button
                  className="btn pricing-btn-full"
                  disabled
                  style={{ opacity: 0.6 }}
                >
                  {t('pricingCurrentPlan', lang)}
                </button>
                <a
                  href={STRIPE_CUSTOMER_PORTAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn pricing-btn-full text-center"
                >
                  {t('manageSubscription', lang)}
                </a>
              </div>
            ) : (
              <button
                className="btn btn-primary pricing-btn-full"
                onClick={() => handleUpgrade()}
                disabled={loading}
                style={{ background: 'linear-gradient(135deg, var(--accent), #a855f7)', border: 'none', color: 'var(--button-text, #fff)', cursor: loading ? 'wait' : 'pointer' }}
              >
                {loading ? t('upgrading', lang) : t('pricingUpgradeButton', lang)}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FAQ / additional info */}
      <div className="content-card mt-lg">
        <div className="content-card-header">{t('pricingFaqTitle', lang)}</div>
        <div className="flex-col-gap-none">
          {([
            { qKey: 'pricingFaqWhatIsTransformQ' as const, aKey: 'pricingFaqWhatIsTransformA' as const },
            { qKey: 'pricingFaqCanDowngradeQ' as const, aKey: 'pricingFaqCanDowngradeA' as const },
            { qKey: 'pricingFaqPaymentMethodQ' as const, aKey: 'pricingFaqPaymentMethodA' as const },
          ]).map((item, i, arr) => (
            <div
              key={i}
              className={i < arr.length - 1 ? "faq-item-bordered" : "faq-item-last"}
            >
              <div className="faq-question">
                Q: {t(item.qKey, lang)}
              </div>
              <div className="faq-answer">
                A: {t(item.aKey, lang)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
