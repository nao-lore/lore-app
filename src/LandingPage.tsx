import { memo, useEffect } from 'react';
import { Clipboard, Zap, LayoutDashboard, ArrowRight, Globe, MessageSquare, Github } from 'lucide-react';
import { t } from './i18n';
import type { Lang } from './i18n';

interface LandingPageProps {
  lang: Lang;
  onGetStarted: () => void;
}

const CHROME_EXTENSION_URL = 'https://chromewebstore.google.com/detail/lore-ai-conversation-snap/opkdpjpgkjcjpkahbljjnhnahliedmkc';
const GITHUB_URL = 'https://github.com/nao-lore/lore-app';
const FEEDBACK_URL = 'https://github.com/nao-lore/lore-app/issues';

function LandingPage({ lang, onGetStarted }: LandingPageProps) {
  // Override body + #root overflow:hidden so LP can scroll
  useEffect(() => {
    const root = document.getElementById('root');
    document.body.style.overflow = 'auto';
    if (root) {
      root.style.height = 'auto';
      root.style.overflow = 'visible';
    }
    return () => {
      document.body.style.overflow = 'hidden';
      if (root) {
        root.style.height = '100vh';
        root.style.overflow = 'hidden';
      }
    };
  }, []);
  return (
    <div className="lp-root">
      {/* Header */}
      <header className="lp-header">
        <span className="lp-logo">Lore</span>
      </header>

      {/* Hero Section */}
      <section className="lp-hero" aria-labelledby="lp-hero-headline">
        <h1 id="lp-hero-headline" className="lp-hero-headline">
          {t('lpHeroHeadline', lang)}
        </h1>
        <p className="lp-hero-subheadline">
          {t('lpHeroSubheadline', lang)}
        </p>
        <div className="lp-hero-ctas">
          <button className="btn btn-primary lp-cta-primary" onClick={onGetStarted}>
            {t('lpCtaTryFree', lang)}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="lp-demo-screenshot">
          <picture>
            <source srcSet="/hero-screenshot.webp" type="image/webp" />
            <img src="/hero-screenshot.png" alt="Lore structured snapshot — decisions, TODOs, blockers extracted from an AI conversation" loading="eager" />
          </picture>
        </div>
      </section>

      {/* How It Works */}
      <section className="lp-section" aria-labelledby="lp-how-it-works">
        <h2 id="lp-how-it-works" className="lp-section-title">
          {t('lpHowItWorksTitle', lang)}
        </h2>
        <div className="lp-steps">
          <div className="lp-step">
            <div className="lp-step-icon" aria-hidden="true">
              <Clipboard size={24} />
            </div>
            <div className="lp-step-number" aria-hidden="true">1</div>
            <h3 className="lp-step-title">{t('lpStep1Title', lang)}</h3>
            <p className="lp-step-desc">{t('lpStep1Desc', lang)}</p>
          </div>
          <div className="lp-step">
            <div className="lp-step-icon" aria-hidden="true">
              <Zap size={24} />
            </div>
            <div className="lp-step-number" aria-hidden="true">2</div>
            <h3 className="lp-step-title">{t('lpStep2Title', lang)}</h3>
            <p className="lp-step-desc">{t('lpStep2Desc', lang)}</p>
          </div>
          <div className="lp-step">
            <div className="lp-step-icon" aria-hidden="true">
              <LayoutDashboard size={24} />
            </div>
            <div className="lp-step-number" aria-hidden="true">3</div>
            <h3 className="lp-step-title">{t('lpStep3Title', lang)}</h3>
            <p className="lp-step-desc">{t('lpStep3Desc', lang)}</p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="lp-section lp-section-alt" aria-labelledby="lp-features">
        <h2 id="lp-features" className="lp-section-title">
          {t('lpFeaturesTitle', lang)}
        </h2>
        <div className="lp-features-grid">
          <div className="lp-feature-card">
            <h3 className="lp-feature-title">{t('lpFeature1Title', lang)}</h3>
            <p className="lp-feature-desc">{t('lpFeature1Desc', lang)}</p>
          </div>
          <div className="lp-feature-card">
            <h3 className="lp-feature-title">{t('lpFeature2Title', lang)}</h3>
            <p className="lp-feature-desc">{t('lpFeature2Desc', lang)}</p>
          </div>
          <div className="lp-feature-card">
            <h3 className="lp-feature-title">{t('lpFeature3Title', lang)}</h3>
            <p className="lp-feature-desc">{t('lpFeature3Desc', lang)}</p>
          </div>
        </div>
      </section>

      {/* Social Proof / Stats */}
      <section className="lp-section" aria-labelledby="lp-social-proof">
        <h2 id="lp-social-proof" className="lp-section-title">
          {t('lpSocialProofTitle', lang)}
        </h2>
        <div className="lp-stats">
          <div className="lp-stat">
            <Globe size={20} aria-hidden="true" className="lp-stat-icon" />
            <span>{t('lpStat8Languages', lang)}</span>
          </div>
          <div className="lp-stat">
            <MessageSquare size={20} aria-hidden="true" className="lp-stat-icon" />
            <span>{t('lpStatWorksWithAnyAi', lang)}</span>
          </div>
          <div className="lp-stat">
            <Github size={20} aria-hidden="true" className="lp-stat-icon" />
            <span>{t('lpStatOpenSource', lang)}</span>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="lp-section lp-section-alt" aria-labelledby="lp-pricing">
        <h2 id="lp-pricing" className="lp-section-title">
          {t('lpPricingTitle', lang)}
        </h2>
        <div className="lp-pricing-grid">
          <div className="lp-pricing-card">
            <h3 className="lp-pricing-plan">{t('lpPricingFree', lang)}</h3>
            <p className="lp-pricing-desc">{t('lpPricingFreeDesc', lang)}</p>
          </div>
          <div className="lp-pricing-card lp-pricing-card-pro">
            <h3 className="lp-pricing-plan">{t('lpPricingPro', lang)}</h3>
            <p className="lp-pricing-price">{t('lpPricingProPrice', lang)}</p>
            <p className="lp-pricing-annual">{t('lpPricingAnnual', lang)}</p>
            <p className="lp-pricing-desc">{t('lpPricingProDesc', lang)}</p>
          </div>
        </div>
        <div className="lp-pricing-cta">
          <button className="btn btn-primary" onClick={onGetStarted}>
            {t('lpCtaStartFree', lang)}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-links">
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            {t('lpFooterGithub', lang)}
          </a>
          <a href={CHROME_EXTENSION_URL} target="_blank" rel="noopener noreferrer">
            {t('lpFooterExtension', lang)}
          </a>
          <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">
            {t('lpFooterFeedback', lang)}
          </a>
        </div>
        <p className="lp-footer-copy">Lore</p>
      </footer>
    </div>
  );
}

export default memo(LandingPage);
