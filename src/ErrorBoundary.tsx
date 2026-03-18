import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getUiLang } from './storage';
import { t } from './i18n';

interface Props {
  children: ReactNode;
  onGoHome?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (import.meta.env.DEV) console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const lang = getUiLang();
    const { error } = this.state;

    return (
      <div className="error-boundary-wrapper">
        <div className="error-boundary-card">
          <div className="error-boundary-icon"><AlertTriangle size={48} /></div>
          <h2 className="error-boundary-title">
            {t('somethingWentWrong', lang)}
          </h2>
          <p className="error-boundary-desc">
            {t('errorDesc', lang)}
          </p>
          <div className="error-boundary-actions">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
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
                onClick={() => { this.setState({ hasError: false, error: null }); this.props.onGoHome!(); }}
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
