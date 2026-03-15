import { t } from './i18n';
import type { Lang } from './i18n';
import { shouldUseBuiltinApi, getBuiltinUsage } from './provider';

interface PricingViewProps {
  onBack: () => void;
  lang: Lang;
  showToast?: (msg: string, type?: 'default' | 'success' | 'error') => void;
}

export default function PricingView({ onBack, lang, showToast }: PricingViewProps) {
  const isFreePlan = shouldUseBuiltinApi();

  const handleUpgrade = () => {
    // TODO: Replace with actual Stripe payment link when approved
    showToast?.(t('planComingSoon', lang), 'default');
  };

  return (
    <div className="workspace-content">
      <div className="page-header">
        <button className="btn-back" onClick={onBack} style={{ marginBottom: 12 }}>
          ← {t('back', lang)}
        </button>
        <h2>{t('pricingTitle', lang)}</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '4px 0 0' }}>
          {t('pricingSubtitle', lang)}
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16,
        marginTop: 8,
      }}>
        {/* Free Plan */}
        <div className="content-card" style={{
          display: 'flex',
          flexDirection: 'column',
          border: isFreePlan ? '2px solid var(--accent)' : undefined,
          position: 'relative',
        }}>
          {isFreePlan && (
            <div style={{
              position: 'absolute',
              top: -1,
              right: 16,
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: '0 0 6px 6px',
              letterSpacing: 0.5,
            }}>
              {t('pricingCurrentPlan', lang)}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div className="content-card-header" style={{ marginBottom: 4 }}>
              {t('pricingFreeTitle', lang)}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-secondary)' }}>
                $0
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                / {t('pricingMonth', lang)}
              </span>
            </div>
            {shouldUseBuiltinApi() && (() => {
              const { used, limit } = getBuiltinUsage();
              return (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {used}/{limit} {t('pricingMonth', lang) === '月' ? '回使用済み（今日）' : 'used today'}
                </div>
              );
            })()}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
            {([
              { key: 'pricingFreeAiTransforms' as const },
              { key: 'pricingFreeCoreFeatures' as const },
              { key: 'pricingFreeLanguages' as const },
              { key: 'pricingFreeChromeExt' as const },
              { key: 'pricingFreeExportImport' as const },
              { key: 'pricingFreeLocalStorage' as const },
            ]).map((item) => (
              <div key={item.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{
                  flexShrink: 0,
                  fontSize: 14,
                  lineHeight: '20px',
                  color: 'var(--accent)',
                }}>
                  ✓
                </span>
                <span style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-body)' }}>
                  {t(item.key, lang)}
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20 }}>
            {isFreePlan ? (
              <button
                className="btn"
                disabled
                style={{
                  width: '100%',
                  padding: '10px 0',
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 8,
                  opacity: 0.6,
                  cursor: 'default',
                }}
              >
                {t('pricingCurrentPlan', lang)}
              </button>
            ) : (
              <button
                className="btn"
                disabled
                style={{
                  width: '100%',
                  padding: '10px 0',
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 8,
                }}
              >
                {t('pricingFreeButton', lang)}
              </button>
            )}
          </div>
        </div>

        {/* Pro Plan */}
        <div className="content-card" style={{
          display: 'flex',
          flexDirection: 'column',
          border: !isFreePlan ? '2px solid var(--accent)' : undefined,
          position: 'relative',
        }}>
          {!isFreePlan && (
            <div style={{
              position: 'absolute',
              top: -1,
              right: 16,
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: '0 0 6px 6px',
              letterSpacing: 0.5,
            }}>
              {t('pricingCurrentPlan', lang)}
            </div>
          )}

          <div style={{
            position: 'absolute',
            top: -1,
            left: 16,
            background: 'linear-gradient(135deg, var(--accent), #a855f7)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: '0 0 6px 6px',
            letterSpacing: 0.5,
          }}>
            {t('pricingRecommended', lang)}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div className="content-card-header" style={{ marginBottom: 4 }}>
              {t('pricingProTitle', lang)}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-secondary)' }}>
                $9.99
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                / {t('pricingMonth', lang)}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
            {([
              { key: 'pricingProUnlimitedAi' as const },
              { key: 'pricingProPriorityAi' as const },
              { key: 'pricingProCloudSync' as const, comingSoon: true },
              { key: 'pricingProMultiDevice' as const, comingSoon: true },
              { key: 'pricingProPrioritySupport' as const },
              { key: 'pricingProEarlyAccess' as const },
            ]).map((item) => (
              <div key={item.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{
                  flexShrink: 0,
                  fontSize: 14,
                  lineHeight: '20px',
                  color: 'var(--accent)',
                }}>
                  ✓
                </span>
                <span style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-body)' }}>
                  {t(item.key, lang)}
                  {item.comingSoon && (
                    <span style={{
                      marginLeft: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--accent)',
                      background: 'rgba(99, 102, 241, 0.12)',
                      padding: '1px 6px',
                      borderRadius: 4,
                    }}>
                      {t('pricingComingSoon', lang)}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20 }}>
            {isFreePlan ? (
              <button
                className="btn btn-primary"
                onClick={handleUpgrade}
                style={{
                  width: '100%',
                  padding: '10px 0',
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, var(--accent), #a855f7)',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                {t('pricingUpgradeButton', lang)}
              </button>
            ) : (
              <button
                className="btn"
                disabled
                style={{
                  width: '100%',
                  padding: '10px 0',
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 8,
                  opacity: 0.6,
                  cursor: 'default',
                }}
              >
                {t('pricingCurrentPlan', lang)}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FAQ / additional info */}
      <div className="content-card" style={{ marginTop: 16 }}>
        <div className="content-card-header">{t('pricingFaqTitle', lang)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 4 }}>
          {([
            { qKey: 'pricingFaqWhatIsTransformQ' as const, aKey: 'pricingFaqWhatIsTransformA' as const },
            { qKey: 'pricingFaqCanDowngradeQ' as const, aKey: 'pricingFaqCanDowngradeA' as const },
            { qKey: 'pricingFaqPaymentMethodQ' as const, aKey: 'pricingFaqPaymentMethodA' as const },
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
    </div>
  );
}
