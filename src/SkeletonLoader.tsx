import { t } from './i18n';
import type { Lang } from './i18n';

interface SkeletonLoaderProps {
  message?: string;
  lang: Lang;
}

const BAR_WIDTHS = ['100%', '85%', '92%', '70%', '60%'];

export default function SkeletonLoader({ message, lang }: SkeletonLoaderProps) {
  return (
    <div className="skeleton-loader">
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
        {message ?? t('aiThinking', lang)}
      </div>
      {BAR_WIDTHS.map((width, i) => (
        <div
          key={i}
          className="skeleton-bar"
          style={{ width, animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}
