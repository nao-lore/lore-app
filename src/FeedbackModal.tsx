import { useState, useRef, useEffect } from 'react';
import { t } from './i18n';
import type { Lang } from './i18n';
import { X } from 'lucide-react';
import { useFocusTrap } from './useFocusTrap';

type FeedbackCategory = 'bug' | 'feature' | 'ux' | 'other';

interface FeedbackModalProps {
  lang: Lang;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<FeedbackCategory, Record<string, string>> = {
  bug: { en: 'Bug Report', ja: 'バグ報告', es: 'Reporte de bug', fr: 'Rapport de bug', de: 'Fehlerbericht', zh: '错误报告', ko: '버그 리포트', pt: 'Relatório de bug' },
  feature: { en: 'Feature Request', ja: '機能リクエスト', es: 'Solicitud de función', fr: 'Demande de fonctionnalité', de: 'Feature-Anfrage', zh: '功能请求', ko: '기능 요청', pt: 'Solicitação de recurso' },
  ux: { en: 'UX / Usability', ja: 'UX / 使いやすさ', es: 'UX / Usabilidad', fr: 'UX / Utilisabilité', de: 'UX / Bedienbarkeit', zh: 'UX / 易用性', ko: 'UX / 사용성', pt: 'UX / Usabilidade' },
  other: { en: 'Other', ja: 'その他', es: 'Otro', fr: 'Autre', de: 'Sonstiges', zh: '其他', ko: '기타', pt: 'Outro' },
};

const CATEGORY_ISSUE_LABELS: Record<FeedbackCategory, string> = {
  bug: 'bug',
  feature: 'enhancement',
  ux: 'ux',
  other: 'feedback',
};

function getCategoryLabel(cat: FeedbackCategory, lang: string): string {
  return CATEGORY_LABELS[cat][lang] || CATEGORY_LABELS[cat].en;
}

const REPO_URL = 'https://github.com/nao-lore/lore-app';

export default function FeedbackModal({ lang, onClose }: FeedbackModalProps) {
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [body, setBody] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = () => {
    if (!body.trim()) return;

    const title = `[${getCategoryLabel(category, 'en')}] ${body.trim().slice(0, 60)}`;
    const issueBody = `## Category\n${getCategoryLabel(category, 'en')}\n\n## Description\n${body.trim()}\n\n---\n*Submitted via in-app feedback*`;
    const label = CATEGORY_ISSUE_LABELS[category];
    const url = `${REPO_URL}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(issueBody)}&labels=${encodeURIComponent(label)}`;

    window.open(url, '_blank');
    setSubmitted(true);
  };

  const handleCopy = () => {
    const text = `[${getCategoryLabel(category, 'en')}]\n${body.trim()}`;
    navigator.clipboard.writeText(text);
    setSubmitted(true);
  };

  const categories: FeedbackCategory[] = ['bug', 'feature', 'ux', 'other'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={trapRef}
        className="onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-label={t('feedbackTitle', lang)}
        style={{ maxWidth: 480, width: '90vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            {t('feedbackTitle', lang)}
          </h2>
          <button className="btn" onClick={onClose} style={{ padding: 4 }} aria-label={t('close', lang)}>
            <X size={18} />
          </button>
        </div>

        {submitted ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
              {t('feedbackThanks', lang)}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {t('feedbackThanksDesc', lang)}
            </p>
            <button
              className="btn btn-primary"
              onClick={onClose}
              style={{ marginTop: 16, padding: '8px 24px', fontSize: 14, borderRadius: 8 }}
            >
              {t('close', lang)}
            </button>
          </div>
        ) : (
          <>
            {/* Category selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                {t('feedbackCategory', lang)}
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    className={`seg-control-btn${category === cat ? ' active-worklog' : ''}`}
                    onClick={() => setCategory(cat)}
                    style={{ padding: '5px 12px', fontSize: 13 }}
                  >
                    {getCategoryLabel(cat, lang)}
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                {t('feedbackBody', lang)}
              </label>
              <textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t('feedbackPlaceholder', lang)}
                style={{
                  width: '100%',
                  minHeight: 120,
                  padding: 12,
                  fontSize: 14,
                  lineHeight: 1.6,
                  border: '1px solid var(--border-default)',
                  borderRadius: 8,
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="btn"
                onClick={handleCopy}
                disabled={!body.trim()}
                style={{ fontSize: 13, padding: '6px 16px' }}
              >
                {t('feedbackCopy', lang)}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={!body.trim()}
                style={{ fontSize: 13, padding: '6px 20px', fontWeight: 600, borderRadius: 8 }}
              >
                {t('feedbackSubmit', lang)}
              </button>
            </div>

            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, textAlign: 'center' }}>
              {t('feedbackNote', lang)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
