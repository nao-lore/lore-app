/**
 * Lore — Content Script for loresync.dev
 *
 * Bridges the Lore PWA with the Chrome extension by:
 * 1. Syncing existing contexts on page load
 * 2. Listening for `lore-context-updated` custom events for live updates
 *
 * The PWA writes context data to localStorage under the key
 * `lore_contexts`, and this script forwards it to the
 * background service worker via chrome.runtime.sendMessage.
 */

const LORE_STORAGE_KEY = 'lore_contexts';

/**
 * Read contexts from localStorage and send them to the background worker.
 */
async function syncContexts() {
  try {
    const raw = localStorage.getItem(LORE_STORAGE_KEY);
    if (!raw) return;

    const contexts = JSON.parse(raw);
    if (typeof contexts !== 'object' || contexts === null || Array.isArray(contexts)) {
      console.warn('[Lore Bridge] Expected object in localStorage, got:', typeof contexts);
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'sync-from-lore',
      contexts,
    });

    if (response?.error) {
      console.error('[Lore Bridge] Sync error:', response.error);
    } else {
      console.log(`[Lore Bridge] Synced ${response?.count ?? 0} contexts to extension`);
    }
  } catch (err) {
    console.error('[Lore Bridge] Failed to sync contexts:', err);
  }
}

// ---------------------------------------------------------------------------
// Listen for live updates from the PWA
// ---------------------------------------------------------------------------

window.addEventListener('lore-context-updated', () => {
  syncContexts();
});

// ---------------------------------------------------------------------------
// Initial sync on page load
// ---------------------------------------------------------------------------

syncContexts();
