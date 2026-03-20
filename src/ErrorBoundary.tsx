import { Component, type ReactNode } from 'react';
import { AlertTriangle, WifiOff } from 'lucide-react';
import { getUiLang } from './storage';
import { t } from './i18n';
import { Sentry } from './utils/sentry';
import { safeGetItem, safeSetItem } from './storage/core';

const ERROR_RECOVERY_KEY = 'threadlog_error_recovery_input';

/** Save current input text for recovery after ErrorBoundary catch */
export function saveInputForRecovery(text: string): void {
  if (text.trim()) {
    safeSetItem(ERROR_RECOVERY_KEY, text);
  }
}

/** Retrieve and clear saved recovery input */
export function consumeRecoveryInput(): string | null {
  const saved = safeGetItem(ERROR_RECOVERY_KEY);
  if (saved) {
    try { localStorage.removeItem(ERROR_RECOVERY_KEY); } catch { /* ignore */ }
  }
  return saved;
}

interface Props {
  children: ReactNode;
  onGoHome?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isOffline: boolean;
  inputSaved: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, isOffline: typeof navigator !== 'undefined' && !navigator.onLine, inputSaved: false };

  private handleOffline = () => this.setState({ isOffline: true });
  private handleOnline = () => this.setState({ isOffline: false });

  componentDidMount() {
    window.addEventListener('offline', this.handleOffline);
    window.addEventListener('online', this.handleOnline);
  }

  componentWillUnmount() {
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('online', this.handleOnline);
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const hasSaved = !!safeGetItem(ERROR_RECOVERY_KEY);
    return { hasError: true, error, inputSaved: hasSaved };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (import.meta.env.DEV) console.error('[ErrorBoundary]', error, info.componentStack);
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  render() {
    const lang = getUiLang();

    // P2: Show friendly offline message when network is completely disconnected
    if (this.state.isOffline && !this.state.hasError) {
      return (
        <div className="error-boundary-wrapper">
          <div className="error-boundary-card">
            <div className="error-boundary-icon"><WifiOff size={48} /></div>
            <h2 className="error-boundary-title">
              {t('offlineTitle', lang)}
            </h2>
            <p className="error-boundary-desc">
              {t('offlineDesc', lang)}
            </p>
            <div className="error-boundary-actions">
              <button
                onClick={() => window.location.reload()}
                className="error-boundary-btn-primary"
              >
                {t('reloadPage', lang)}
              </button>
              {this.props.onGoHome && (
                <button
                  onClick={() => this.props.onGoHome!()}
                  className="error-boundary-btn-secondary"
                >
                  {t('goBackToHome', lang)}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (!this.state.hasError) return this.props.children;

    const { error, inputSaved } = this.state;

    return (
      <div className="error-boundary-wrapper">
        <div className="error-boundary-card" role="alert" aria-live="assertive">
          <div className="error-boundary-icon"><AlertTriangle size={48} /></div>
          <h2 className="error-boundary-title">
            {t('somethingWentWrong', lang)}
          </h2>
          <p className="error-boundary-desc">
            {t('errorDesc', lang)}
          </p>
          {inputSaved && (
            <p className="error-boundary-recovery">
              {t('errorInputSaved', lang)}
            </p>
          )}
          <div className="error-boundary-actions">
            <button
              onClick={() => this.setState({ hasError: false, error: null, inputSaved: false })}
              className="error-boundary-btn-primary"
            >
              {t('tryAgain', lang)}
            </button>
            <button
              onClick={() => window.location.reload()}
              className="error-boundary-btn-secondary"
            >
              {t('reloadPage', lang)}
            </button>
            {this.props.onGoHome && (
              <button
                onClick={() => { this.setState({ hasError: false, error: null, inputSaved: false }); this.props.onGoHome!(); }}
                className="error-boundary-btn-secondary"
              >
                {t('goBackToHome', lang)}
              </button>
            )}
          </div>
          {error && (
            <details className="mt-lg">
              <summary className="error-boundary-details-summary">
                {t('errorDetails', lang)}
              </summary>
              <pre className="error-boundary-pre">
                {error.message}
                {error.stack && '\n\n' + error.stack}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
