import { t } from './i18n';
import type { Lang } from './i18n';

interface SkeletonLoaderProps {
  message?: string;
  lang: Lang;
  variant?: 'list' | 'card' | 'detail';
}

function SkeletonBar({ width, delay = 0, height }: { width: string; delay?: number; height?: number }) {
  return (
    <div
      className="skeleton-bar"
      style={{ width, animationDelay: `${delay}s`, ...(height ? { height } : {}) }}
    />
  );
}

function ListSkeleton() {
  return (
    <div className="skeleton-list">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton-list-row" style={{ animationDelay: `${i * 0.1}s` }}>
          <div className="skeleton-bar skeleton-icon" style={{ animationDelay: `${i * 0.1}s` }} />
          <div className="skeleton-list-text">
            <SkeletonBar width={['75%', '60%', '80%', '55%'][i]} delay={i * 0.1} height={14} />
            <SkeletonBar width={['50%', '40%', '55%', '35%'][i]} delay={i * 0.1 + 0.05} height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="skeleton-card">
      <SkeletonBar width="60%" delay={0} height={16} />
      <SkeletonBar width="90%" delay={0.15} />
      <SkeletonBar width="70%" delay={0.3} />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="skeleton-detail">
      <SkeletonBar width="45%" delay={0} height={22} />
      <div className="mt-lg">
        <SkeletonBar width="100%" delay={0.1} />
        <SkeletonBar width="95%" delay={0.2} />
        <SkeletonBar width="88%" delay={0.3} />
      </div>
      <div className="mt-md">
        <SkeletonBar width="100%" delay={0.4} />
        <SkeletonBar width="72%" delay={0.5} />
      </div>
    </div>
  );
}

export default function SkeletonLoader({ message, lang, variant = 'list' }: SkeletonLoaderProps) {
  return (
    <div className="skeleton-loader">
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
        {message ?? t('aiThinking', lang)}
      </div>
      {variant === 'list' && <ListSkeleton />}
      {variant === 'card' && <CardSkeleton />}
      {variant === 'detail' && <DetailSkeleton />}
    </div>
  );
}
