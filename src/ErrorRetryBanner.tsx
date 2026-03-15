import { useState } from 'react';
import { X } from 'lucide-react';

interface ErrorRetryBannerProps {
  message: string;
  retryLabel?: string;
  dismissLabel?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export default function ErrorRetryBanner({ message, retryLabel, dismissLabel, onRetry, onDismiss }: ErrorRetryBannerProps) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = () => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    // Brief spinner then fire retry
    setTimeout(() => {
      setRetrying(false);
      onRetry();
    }, 400);
  };

  return (
    <div className="error-retry-banner">
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <button
          className="btn"
          style={{ fontSize: 12, padding: '4px 12px', minHeight: 26, flexShrink: 0 }}
          onClick={handleRetry}
          disabled={retrying}
        >
          {retrying ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className="spinner-sm" /> ...
            </span>
          ) : (
            retryLabel
          )}
        </button>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            color: 'var(--text-muted)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
          }}
          aria-label={dismissLabel || 'Dismiss'}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
