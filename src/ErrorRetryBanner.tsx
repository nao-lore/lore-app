import { useState, memo } from 'react';
import { X } from 'lucide-react';

interface ErrorRetryBannerProps {
  message: string;
  retryLabel?: string;
  dismissLabel?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}

export default memo(function ErrorRetryBanner({ message, retryLabel, dismissLabel, onRetry, onDismiss, actionLabel, onAction }: ErrorRetryBannerProps) {
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
    <div className="error-retry-banner" role="alert" aria-live="assertive">
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button
          className="btn btn-sm-action shrink-0 pad-4-12"
          onClick={handleRetry}
          disabled={retrying}
        >
          {retrying ? (
            <span className="inline-flex-center gap-4">
              <span className="spinner-sm" /> ...
            </span>
          ) : (
            retryLabel
          )}
        </button>
      )}
      {onAction && actionLabel && (
        <button
          className="btn btn-sm-action shrink-0 pad-4-12 btn-upgrade"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="error-dismiss-btn"
          aria-label={dismissLabel || 'Dismiss'}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
});
