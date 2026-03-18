import React, { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initSentry } from './utils/sentry'
import { initKeyCache } from './provider'

initSentry();

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
