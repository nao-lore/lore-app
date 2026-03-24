/**
 * Lore — Content Script for loresync.dev
 *
 * Bridges the Lore PWA with the Chrome extension by:
 * 1. Syncing existing contexts on page load
 * 2. Listening for `lore-context-updated` custom events for live updates
 * 3. Monitoring localStorage changes (storage event) for cross-tab/PWA updates
 *
 * The PWA writes context data to localStorage under the key
 * `lore_contexts`, and this script forwards it to the
 * background service worker via chrome.runtime.sendMessage.
 *
 * sync-from-lore performs a full overwrite in background.js, so if a project
 * is deleted in the PWA the extension storage will reflect that automatically.
 */

const LORE_STORAGE_KEY = 'lore_contexts';

/**
 * Flag to prevent repeated warnings after runtime invalidation (E13).
 */
let runtimeInvalidated = false;

/**
 * Check if the extension runtime is still valid (not invalidated by extension reload).
 */
function isRuntimeValid() {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.sendMessage);
  } catch {
    return false;
  }
}

/**
 * Read contexts from localStorage and send them to the background worker.
 * Sends the full object so that background.js overwrites its storage
 * (deleted projects in PWA are automatically removed from extension).
 */
async function syncContexts() {
  // E13: Once runtime is invalidated, stop all sync attempts and only warn once
  if (runtimeInvalidated) return;

  if (!isRuntimeValid()) {
    runtimeInvalidated = true;
    console.warn('[Lore Bridge] Extension runtime invalidated — page reload required');
    return;
  }

  try {
    const raw = localStorage.getItem(LORE_STORAGE_KEY);
    // If key is absent or empty, sync an empty object so deletions propagate
    const contexts = raw ? JSON.parse(raw) : {};
    if (typeof contexts !== 'object' || contexts === null || Array.isArray(contexts)) {
      console.warn('[Lore Bridge] Expected object in localStorage, got:', typeof contexts);
      return;
    }

    // Validate each context entry has required fields and strip sensitive keys
    const SENSITIVE_KEYS = ['apiKey', 'encryptedApiKey', 'api_key', 'encrypted_api_key'];
    const validated = {};
    for (const [key, value] of Object.entries(contexts)) {
      if (
        typeof value !== 'object' ||
        value === null ||
        typeof value.projectName !== 'string' ||
        !value.projectName
      ) {
        console.warn(`[Lore Bridge] Skipping invalid context entry: ${key}`);
        continue;
      }
      // E2: Strip API key fields before sending to extension
      const sanitized = { ...value };
      for (const sk of SENSITIVE_KEYS) {
        delete sanitized[sk];
      }
      validated[key] = sanitized;
    }

    if (Object.keys(validated).length === 0) {
      console.warn('[Lore Bridge] No valid context entries found');
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'sync-from-lore',
      contexts: validated,
    });

    if (response?.error) {
      console.error('[Lore Bridge] Sync error:', response.error);
    } else {
      console.log(`[Lore Bridge] Synced ${response?.count ?? 0} contexts to extension`);
    }
  } catch (err) {
    // If sendMessage fails due to invalidated context, flag it (E13)
    if (String(err).includes('Extension context invalidated') ||
        String(err).includes('runtime.sendMessage')) {
      runtimeInvalidated = true;
      console.warn('[Lore Bridge] Extension runtime invalidated — page reload required');
    } else {
      console.error('[Lore Bridge] Failed to sync contexts:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// Listen for live updates from the PWA
// ---------------------------------------------------------------------------

window.addEventListener('lore-context-updated', () => {
  syncContexts();
});

// ---------------------------------------------------------------------------
// E8: Monitor localStorage changes from other tabs / PWA service worker
// The 'storage' event fires when localStorage is modified by *another* context
// (another tab, iframe, or SW), which covers PWA-side project deletions.
// ---------------------------------------------------------------------------

window.addEventListener('storage', (event) => {
  if (event.key === LORE_STORAGE_KEY) {
    syncContexts();
  }
});

// ---------------------------------------------------------------------------
// Reverse sync: Import pending logs from extension into PWA localStorage
// ---------------------------------------------------------------------------

async function importPendingLogs() {
  if (runtimeInvalidated || !isRuntimeValid()) return;

  try {
    const response = await chrome.runtime.sendMessage({ type: 'get-pending-logs' });
    const pendingLogs = response?.logs;
    if (!pendingLogs || pendingLogs.length === 0) return;

    // Read current logs from PWA localStorage
    const LOGS_KEY = 'threadlog_logs';
    const raw = localStorage.getItem(LOGS_KEY);
    let logs = [];
    try { logs = raw ? JSON.parse(raw) : []; } catch { logs = []; }
    if (!Array.isArray(logs)) logs = [];

    // Add pending logs (prepend — newest first), avoiding duplicates
    const existingIds = new Set(logs.map((l) => l.id));
    let added = 0;
    for (const entry of pendingLogs) {
      if (entry.id && !existingIds.has(entry.id)) {
        logs.unshift(entry);
        existingIds.add(entry.id);
        added++;
      }
    }

    if (added > 0) {
      localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
      // Increment snapshot counter
      const counterRaw = localStorage.getItem('lore_snapshot_count');
      const counter = counterRaw ? parseInt(counterRaw, 10) : 0;
      localStorage.setItem('lore_snapshot_count', String(counter + added));
      // Dispatch event so the PWA picks up changes
      window.dispatchEvent(new CustomEvent('lore-logs-updated'));
      console.log(`[Lore Bridge] Imported ${added} pending log(s) from extension`);
    }

    // Clear pending logs in extension
    await chrome.runtime.sendMessage({ type: 'clear-pending-logs' });
  } catch (err) {
    if (String(err).includes('Extension context invalidated') || String(err).includes('runtime.sendMessage')) {
      runtimeInvalidated = true;
    } else {
      console.error('[Lore Bridge] Failed to import pending logs:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// Sync language setting from Lore PWA to extension
// ---------------------------------------------------------------------------

async function syncLanguage() {
  if (runtimeInvalidated || !isRuntimeValid()) return;

  try {
    const lang = localStorage.getItem('threadlog_lang');
    if (lang) {
      await chrome.runtime.sendMessage({ type: 'sync-lang', lang });
    }
  } catch (err) {
    if (String(err).includes('Extension context invalidated') || String(err).includes('runtime.sendMessage')) {
      runtimeInvalidated = true;
    }
  }
}

// Also sync when language changes
window.addEventListener('storage', (event) => {
  if (event.key === 'threadlog_lang') {
    syncLanguage();
  }
});

// ---------------------------------------------------------------------------
// Initial sync on page load
// ---------------------------------------------------------------------------

syncContexts();
importPendingLogs();
syncLanguage();
