import React, { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { inject } from '@vercel/analytics'
import './index.css'
import App from './App.tsx'
import { initSentry } from './utils/sentry'
import { initKeyCache } from './provider'
import { isTransformActive } from './utils/transformState'

inject();

initSentry();

// Capture UTM parameters on first load for analytics
(function captureUtmParams() {
  const params = new URLSearchParams(window.location.search);
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
  for (const key of utmKeys) {
    const value = params.get(key);
    if (value) {
      sessionStorage.setItem(key, value);
    }
  }
})();

// Catch unhandled promise rejections globally to prevent silent crashes
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Rejection]', event.reason);
});

// Warn user before closing tab during an active AI transform
window.addEventListener('beforeunload', (e) => {
  if (isTransformActive()) {
    e.preventDefault();
  }
});

// Decrypt API keys from localStorage into memory cache (fire and forget).
// Keys become available almost immediately; if a call happens before
// decryption finishes, it falls back to the built-in API.
initKeyCache().catch(() => {
  // Decryption failed — keys remain empty, user can re-enter in Settings
});

if (import.meta.env.DEV) {
  import('@axe-core/react').then(({ default: axe }) => {
    axe(React, ReactDOM, 1000);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
