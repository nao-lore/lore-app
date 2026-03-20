import { memo, useEffect, useState, useCallback } from 'react';
import { Clipboard, Zap, LayoutDashboard, ArrowRight, Globe, MessageSquare, Github, Shield, CheckCircle, WifiOff, Users, Mail, Chrome } from 'lucide-react';
import { t, tf, OUTPUT_LANGS } from './i18n';
import type { Lang } from './i18n';
import { getTotalSnapshots } from './storage';
import { safeSetItem } from './storage/core';
import { redirectToCheckout } from './utils/stripe';

interface LandingPageProps {
  lang: Lang;
  onGetStarted: () => void;
  onChangeLang?: (lang: Lang) => void;
}

const CHROME_EXTENSION_URL = 'https://chromewebstore.google.com/detail/lore-ai-conversation-snap/opkdpjpkahbljjnhnahliedmkc';
const GITHUB_URL = 'https://github.com/nao-lore/lore-app';
const FEEDBACK_URL = 'https://github.com/nao-lore/lore-app/issues';
const TEAMS_NOTIFY_URL = 'https://formspree.io/f/xldjqkdl';

function LandingPage({ lang, onGetStarted, onChangeLang }: LandingPageProps) {
  const [totalSnapshots] = useState(() => getTotalSnapshots());

  // U14: Language change handler
  const handleLangChange = useCallback((newLang: Lang) => {
    safeSetItem('threadlog_lang', newLang);
    if (onChangeLang) {
      onChangeLang(newLang);
    } else {
      window.location.reload();
    }
  }, [onChangeLang]);

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

      {/* U1: What You Get — concrete output examples */}
      <section className="lp-section lp-section-alt" aria-labelledby="lp-what-you-get">
        <h2 id="lp-what-you-get" className="lp-section-title">
          {t('lpWhatYouGetTitle', lang)}
        </h2>
        <ul className="lp-what-you-get-list">
          <li className="lp-what-you-get-item">
            <CheckCircle size={18} aria-hidden="true" className="lp-what-you-get-icon" />
            <span>{t('lpWhatYouGet1', lang)}</span>
          </li>
          <li className="lp-what-you-get-item">
            <CheckCircle size={18} aria-hidden="true" className="lp-what-you-get-icon" />
            <span>{t('lpWhatYouGet2', lang)}</span>
          </li>
          <li className="lp-what-you-get-item">
            <CheckCircle size={18} aria-hidden="true" className="lp-what-you-get-icon" />
            <span>{t('lpWhatYouGet3', lang)}</span>
          </li>
        </ul>
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
            <div className="lp-after-metrics">
              <p className="lp-after-metric">{t('lpAfterMetric1', lang)}</p>
              <p className="lp-after-metric">{t('lpAfterMetric2', lang)}</p>
            </div>
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
        <p className="lp-hero-subheadline lp-extension-headline">
          {t('lpExtensionHeadline', lang)}
        </p>
        <p className="lp-extension-desc">
          {t('lpExtensionDesc', lang)}
        </p>
        <div className="lp-extension-cta-wrap">
          <a
            href={CHROME_EXTENSION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary lp-cta-primary lp-extension-cta-btn"
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

      {/* Why Lore? Comparison Section */}
      <section className="lp-section" aria-labelledby="lp-why-lore">
        <h2 id="lp-why-lore" className="lp-section-title">
          {t('lpWhyLoreTitle', lang)}
        </h2>
        <p className="lp-why-lore-subtext">
          {t('lpWhyLoreSubtext', lang)}
        </p>
        <div className="lp-compare-table-wrap">
          <table className="lp-compare-table" role="table">
            <thead>
              <tr>
                <th>{''}</th>
                <th>{t('lpWhyColLore', lang)}</th>
                <th>{t('lpWhyColManualNotes', lang)}</th>
                <th>{t('lpWhyColAiMemory', lang)}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t('lpWhyCompareAutoStructure', lang)}</td>
                <td className="lp-compare-yes" aria-label="Yes">&#10003;</td>
                <td className="lp-compare-no" aria-label="No">&#10007;</td>
                <td className="lp-compare-partial">{t('lpWhyPartial', lang)}</td>
              </tr>
              <tr>
                <td>{t('lpWhyCompareOffline', lang)}</td>
                <td className="lp-compare-yes" aria-label="Yes">&#10003;</td>
                <td className="lp-compare-yes" aria-label="Yes">&#10003;</td>
                <td className="lp-compare-no" aria-label="No">&#10007;</td>
              </tr>
              <tr>
                <td>{t('lpWhyCompareCrossProvider', lang)}</td>
                <td className="lp-compare-yes" aria-label="Yes">&#10003;</td>
                <td className="lp-compare-partial">{t('lpWhyManual', lang)}</td>
                <td className="lp-compare-no" aria-label="No">&#10007;</td>
              </tr>
              <tr>
                <td>{t('lpWhyCompareOpenSource', lang)}</td>
                <td className="lp-compare-yes" aria-label="Yes">&#10003;</td>
                <td className="lp-compare-partial">{t('lpWhyNa', lang)}</td>
                <td className="lp-compare-no" aria-label="No">&#10007;</td>
              </tr>
              <tr>
                <td>{t('lpWhyCompareExport', lang)}</td>
                <td className="lp-compare-yes" aria-label="Yes">&#10003;</td>
                <td className="lp-compare-yes" aria-label="Yes">&#10003;</td>
                <td className="lp-compare-no" aria-label="No">&#10007;</td>
              </tr>
            </tbody>
          </table>
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
          <div className="lp-pricing-card lp-pricing-card-pro" onClick={() => { if (typeof gtag === 'function') gtag('event', 'pro_click'); redirectToCheckout('monthly'); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { if (typeof gtag === 'function') gtag('event', 'pro_click'); redirectToCheckout('monthly'); } }}>
            <h3 className="lp-pricing-plan">{t('lpPricingPro', lang)}</h3>
            <p className="lp-pricing-price">{t('lpPricingProPrice', lang)}</p>
            <p className="lp-pricing-annual lp-pricing-annual-highlight">
              {t('lpPricingAnnual', lang)}
            </p>
            <p className="lp-pricing-desc">{t('lpPricingProDesc', lang)}</p>
          </div>
        </div>

        {/* L10: Feature comparison grid */}
        <div className="lp-pricing-compare-wrap">
          <table className="lp-pricing-compare-table" role="table">
            <thead>
              <tr>
                <th>{t('lpPricingCompareFeature', lang)}</th>
                <th>{t('lpPricingFree', lang)}</th>
                <th>{t('lpPricingPro', lang)}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t('lpPricingCompareDailyTransforms', lang)}</td>
                <td>{t('lpPricingFree20', lang)}</td>
                <td className="lp-compare-yes">{t('lpPricingUnlimited', lang)}</td>
              </tr>
              <tr>
                <td>{t('lpPricingCompareProjects', lang)}</td>
                <td>{t('lpPricingFree3', lang)}</td>
                <td className="lp-compare-yes">{t('lpPricingUnlimited', lang)}</td>
              </tr>
              <tr>
                <td>{t('lpPricingCompareExport', lang)}</td>
                <td className="lp-compare-yes" aria-label="Yes">&#10003;</td>
                <td className="lp-compare-yes" aria-label="Yes">&#10003;</td>
              </tr>
              <tr>
                <td>{t('lpPricingCompareChromeExt', lang)}</td>
                <td className="lp-compare-yes" aria-label="Yes">&#10003;</td>
                <td className="lp-compare-yes" aria-label="Yes">&#10003;</td>
              </tr>
              <tr>
                <td>{t('lpPricingCompareTeam', lang)}</td>
                <td>{t('lpPricingNa', lang)}</td>
                <td>{t('lpPricingComingQ2', lang)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="lp-pricing-cta">
          <button className="btn btn-primary" onClick={onGetStarted}>
            {t('lpCtaStartFree', lang)}
          </button>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="lp-section" aria-labelledby="lp-faq">
        <h2 id="lp-faq" className="lp-section-title">
          {t('lpFaqTitle', lang)}
        </h2>
        <div className="lp-faq-list">
          <details className="lp-faq-item">
            <summary className="lp-faq-question">{t('lpFaqDataQ', lang)}</summary>
            <p className="lp-faq-answer">{t('lpFaqDataA', lang)}</p>
          </details>
          <details className="lp-faq-item">
            <summary className="lp-faq-question">{t('lpFaqServicesQ', lang)}</summary>
            <p className="lp-faq-answer">{t('lpFaqServicesA', lang)}</p>
          </details>
          <details className="lp-faq-item">
            <summary className="lp-faq-question">{t('lpFaqFreeTierQ', lang)}</summary>
            <p className="lp-faq-answer">{t('lpFaqFreeTierA', lang)}</p>
          </details>
          <details className="lp-faq-item">
            <summary className="lp-faq-question">{t('lpFaqExportQ', lang)}</summary>
            <p className="lp-faq-answer">{t('lpFaqExportA', lang)}</p>
          </details>
          <details className="lp-faq-item">
            <summary className="lp-faq-question">{t('lpFaqOpenSourceQ', lang)}</summary>
            <p className="lp-faq-answer">{t('lpFaqOpenSourceA', lang)}</p>
          </details>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        {/* U14: Language selector */}
        <div className="lp-lang-selector" aria-label={t('lpSelectLanguage', lang)}>
          <Globe size={14} aria-hidden="true" />
          <select
            value={lang}
            onChange={(e) => handleLangChange(e.target.value as Lang)}
            className="lp-lang-select"
            aria-label={t('lpSelectLanguage', lang)}
          >
            {OUTPUT_LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.label}
              </option>
            ))}
          </select>
        </div>
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
