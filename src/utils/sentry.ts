import * as Sentry from '@sentry/react';

export function initSentry(): void {
  if (import.meta.env.PROD) {
    Sentry.init({
      dsn: '', // User will add DSN later
      environment: 'production',
      sampleRate: 1.0,
      tracesSampleRate: 0.1,
      // Don't send PII
      beforeSend(event) {
        // Strip any potential API keys from error messages
        if (event.message) {
          event.message = event.message.replace(/sk-[a-zA-Z0-9]+/g, '[REDACTED]');
          event.message = event.message.replace(/AIza[a-zA-Z0-9]+/g, '[REDACTED]');
        }
        return event;
      },
    });
  }
}

export { Sentry };
