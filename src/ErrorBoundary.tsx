import { Component, type ReactNode } from 'react';
import { getUiLang } from './storage';
import { t } from './i18n';

interface Props {
  children: ReactNode;
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
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: '100%',
        padding: 32,
      }}>
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 12,
          padding: '32px 36px',
          maxWidth: 520,
          width: '100%',
          boxShadow: 'var(--shadow-card)',
          color: 'var(--text-body)',
          fontSize: 14,
          lineHeight: 1.6,
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>&#9888;&#65039;</div>
          <h2 style={{
            margin: '0 0 8px',
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}>
            {t('somethingWentWrong', lang)}
          </h2>
          <p style={{ margin: '0 0 20px', color: 'var(--text-muted)' }}>
            {t('errorDesc', lang)}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontWeight: 500,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              {t('tryAgain', lang)}
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface-secondary)',
                color: 'var(--text-body)',
                fontWeight: 500,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              {t('reloadPage', lang)}
            </button>
          </div>
          {error && (
            <details style={{ marginTop: 16 }}>
              <summary style={{
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--text-muted)',
                userSelect: 'none',
              }}>
                {t('errorDetails', lang)}
              </summary>
              <pre style={{
                marginTop: 8,
                padding: 14,
                background: 'var(--bg-surface-tertiary)',
                border: '1px solid var(--border-default)',
                borderRadius: 8,
                fontSize: 12,
                lineHeight: 1.5,
                color: 'var(--error-text)',
                overflow: 'auto',
                maxHeight: 240,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
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
