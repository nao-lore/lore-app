import { memo, useEffect, useState } from 'react';
import { Clipboard, Zap, LayoutDashboard, ArrowRight, Globe, MessageSquare, Github, Shield, CheckCircle, WifiOff, Users, Mail, Chrome } from 'lucide-react';
import { t, tf } from './i18n';
import type { Lang } from './i18n';
import { getTotalSnapshots } from './storage';
import { redirectToCheckout } from './utils/stripe';

interface LandingPageProps {
  lang: Lang;
  onGetStarted: () => void;
}

const CHROME_EXTENSION_URL = 'https://chromewebstore.google.com/detail/lore-ai-conversation-snap/opkdpjpkahbljjnhnahliedmkc';
const GITHUB_URL = 'https://github.com/nao-lore/lore-app';
const FEEDBACK_URL = 'https://github.com/nao-lore/lore-app/issues';
const TEAMS_NOTIFY_URL = 'https://formspree.io/f/xldjqkdl';

function LandingPage({ lang, onGetStarted }: LandingPageProps) {
  const [totalSnapshots] = useState(() => getTotalSnapshots());

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

        <p className="lp-beta-urgency">
          {t('lpBetaUrgency', lang)}
        </p>

        {/* Task 3: Snapshot counter */}
        {totalSnapshots > 0 && (
          <p className="lp-snapshot-counter">
            {tf('lpSnapshotsCreated', lang, totalSnapshots)}
          </p>
        )}

        {/* Task 2: Trust badges */}
        <div className="lp-trust-badges" role="list" aria-label="Trust badges">
          <span className="lp-trust-badge" role="listitem">
            <Github size={14} aria-hidden="true" />
            {t('lpBadgeOpenSource', lang)}
          </span>
          <span className="lp-trust-badge" role="listitem">
            <CheckCircle size={14} aria-hidden="true" />
            {t('lpBadgeTests', lang)}
          </span>
          <span className="lp-trust-badge" role="listitem">
            <Globe size={14} aria-hidden="true" />
            {t('lpBadge8Languages', lang)}
          </span>
          <span className="lp-trust-badge" role="listitem">
            <WifiOff size={14} aria-hidden="true" />
            {t('lpBadgeWorksOffline', lang)}
          </span>
        </div>

        {/* TODO(ph-launch): Replace static screenshot with a demo GIF or short video
            showing the paste → transform → snapshot flow. Keep autoplay muted loop
            for GIF-like behavior: <video autoPlay muted loop playsInline /> */}
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

      {/* Privacy / Trust Section — placed early for security-conscious developers */}
      <section className="lp-section lp-section-alt lp-privacy-section" aria-labelledby="lp-privacy">
        <div className="lp-privacy-content">
          <Shield size={32} aria-hidden="true" className="lp-privacy-icon" />
          <div>
            <h2 id="lp-privacy" className="lp-section-title" style={{ textAlign: 'left', marginBottom: 8 }}>
              {t('lpPrivacyTitle', lang)}
            </h2>
            <p className="lp-privacy-desc">
              {t('lpPrivacyDesc', lang)}
            </p>
          </div>
        </div>
      </section>

      {/* Before / After Comparison */}
      <section className="lp-section" aria-labelledby="lp-before-after">
        <h2 id="lp-before-after" className="lp-section-title">
          {t('lpBeforeAfterTitle', lang)}
        </h2>
        <div className="lp-before-after-grid">
          <div className="lp-before-after-col lp-before-col">
            <h3 className="lp-before-after-label lp-before-label">{t('lpBeforeLabel', lang)}</h3>
            <ul className="lp-before-after-list">
              <li>{t('lpBefore1', lang)}</li>
              <li>{t('lpBefore2', lang)}</li>
              <li>{t('lpBefore3', lang)}</li>
            </ul>
          </div>
          <div className="lp-before-after-col lp-after-col">
            <h3 className="lp-before-after-label lp-after-label">{t('lpAfterLabel', lang)}</h3>
            <ul className="lp-before-after-list">
              <li>{t('lpAfter1', lang)}</li>
              <li>{t('lpAfter2', lang)}</li>
              <li>{t('lpAfter3', lang)}</li>
            </ul>
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

      {/* Chrome Extension Section */}
      <section className="lp-section" aria-labelledby="lp-extension">
        <h2 id="lp-extension" className="lp-section-title">
          <Chrome size={24} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 8 }} />
          {t('lpExtensionTitle', lang)}
        </h2>
        <p className="lp-hero-subheadline" style={{ maxWidth: 640, margin: '0 auto 16px' }}>
          {t('lpExtensionHeadline', lang)}
        </p>
        <p style={{ maxWidth: 640, margin: '0 auto 24px', fontSize: 15, lineHeight: 1.7, color: 'var(--text-muted, #6b7280)', textAlign: 'center' }}>
          {t('lpExtensionDesc', lang)}
        </p>
        <div style={{ textAlign: 'center' }}>
          <a
            href={CHROME_EXTENSION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary lp-cta-primary"
            onClick={() => { if (typeof gtag === 'function') gtag('event', 'extension_lp_click'); }}
          >
            <Chrome size={16} aria-hidden="true" />
            {t('lpExtensionCta', lang)}
          </a>
        </div>
      </section>

      {/* Teams Coming Soon */}
      <section className="lp-section" aria-labelledby="lp-teams">
        <h2 id="lp-teams" className="lp-section-title">
          <Users size={24} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 8 }} />
          {t('lpTeamsTitle', lang)}
        </h2>
        <ul className="lp-teams-list">
          <li>{t('lpTeamsBullet1', lang)}</li>
          <li>{t('lpTeamsBullet2', lang)}</li>
          <li>{t('lpTeamsBullet3', lang)}</li>
          <li>{t('lpTeamsBullet4', lang)}</li>
        </ul>
        <div className="lp-teams-cta">
          <a href={TEAMS_NOTIFY_URL} target="_blank" rel="noopener noreferrer" className="btn btn-secondary lp-teams-notify-btn">
            <Mail size={16} aria-hidden="true" />
            {t('lpTeamsNotify', lang)}
          </a>
        </div>
      </section>

      {/* Social Proof / Stats */}
      <section className="lp-section lp-section-alt" aria-labelledby="lp-social-proof">
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
      <section className="lp-section" aria-labelledby="lp-pricing">
        <h2 id="lp-pricing" className="lp-section-title">
          {t('lpPricingTitle', lang)}
        </h2>
        <div className="lp-pricing-grid">
          <div className="lp-pricing-card">
            <h3 className="lp-pricing-plan">{t('lpPricingFree', lang)}</h3>
            <p className="lp-pricing-desc">{t('lpPricingFreeDesc', lang)}</p>
          </div>
          <div className="lp-pricing-card lp-pricing-card-pro" onClick={() => { if (typeof gtag === 'function') gtag('event', 'pro_click'); redirectToCheckout('monthly'); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { if (typeof gtag === 'function') gtag('event', 'pro_click'); redirectToCheckout('monthly'); } }}>
            <h3 className="lp-pricing-plan">{t('lpPricingPro', lang)}</h3>
            <p className="lp-pricing-price">{t('lpPricingProPrice', lang)}</p>
            <p className="lp-pricing-annual">
              {t('lpPricingAnnual', lang)}
              <span className="lp-pricing-save-badge">{t('lpPricingAnnualBadge', lang)}</span>
            </p>
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
          <a href={CHROME_EXTENSION_URL} target="_blank" rel="noopener noreferrer" onClick={() => { if (typeof gtag === 'function') gtag('event', 'extension_click'); }}>
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
