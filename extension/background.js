/**
 * Lore — Background Service Worker
 *
 * Responsibilities:
 * 1. Monitor tabs and show badge when Lore contexts are available on AI sites
 * 2. Route messages between content scripts and popup
 * 3. Manage context storage (chrome.storage.local) and injection tracking (chrome.storage.session)
 * 4. Run transforms via built-in API (extension-native processing)
 */

/* global LoreTransform */
importScripts('transform.js');

const AI_SITE_PATTERNS = [
  'claude.ai',
  'chatgpt.com',
  'chat.openai.com',
  'gemini.google.com',
];

const BADGE_COLOR = '#7c5cfc';
const STORAGE_KEY = 'lore_contexts';
const INJECTION_PREFIX = 'injected_';

/**
 * Simple string hash for creating URL-based session storage keys.
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a URL belongs to a supported AI site.
 */
function isAiSite(url) {
  try {
    const hostname = new URL(url).hostname;
    return AI_SITE_PATTERNS.some((pattern) => hostname.includes(pattern));
  } catch {
    return false;
  }
}

/**
 * Update the extension badge for a given tab based on available contexts.
 */
async function updateBadge(tabId, url) {
  try {
    // Clear badge for non-AI tabs
    if (!url || !isAiSite(url)) {
      await chrome.action.setBadgeText({ text: '', tabId });
      return;
    }

    const result = await chrome.storage.local.get(STORAGE_KEY);
    const contexts = result[STORAGE_KEY] ?? {};
    const count = typeof contexts === 'object' && contexts !== null ? Object.keys(contexts).length : 0;

    if (count > 0) {
      await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId });
      await chrome.action.setBadgeText({ text: count >= 10 ? '9+' : String(count), tabId });
    } else {
      await chrome.action.setBadgeText({ text: '', tabId });
    }
  } catch {
    // Tab may have been closed — ignore silently.
  }
}

/**
 * Briefly flash a checkmark on the badge, then restore the normal count.
 */
async function flashCheckmark(tabId, url) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId });
    await chrome.action.setBadgeText({ text: '✓', tabId });
    setTimeout(() => updateBadge(tabId, url), 1500);
  } catch {
    // Tab may have been closed — ignore silently.
  }
}

// ---------------------------------------------------------------------------
// Tab monitoring
// ---------------------------------------------------------------------------

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only react to completed navigations that have a URL
  if (changeInfo.status === 'complete' && tab.url) {
    updateBadge(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      updateBadge(tab.id, tab.url);
    }
  } catch {
    // Tab may have been closed between activation and get — ignore.
  }
});

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // E6: Verify sender is trusted (own extension or loresync.dev)
  const isSelf = sender.id === chrome.runtime.id;
  const isLore = sender.url && sender.url.includes('loresync.dev');
  if (!isSelf && !isLore) {
    sendResponse({ error: 'untrusted' });
    return true;
  }

  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err) => {
      console.error('[Lore] Message handler error:', err);
      sendResponse({ error: err.message });
    });
  // Return true to indicate we will respond asynchronously.
  return true;
});

async function handleMessage(message, sender) {
  const { type } = message;

  switch (type) {
    // -----------------------------------------------------------------------
    // Return all stored contexts
    // -----------------------------------------------------------------------
    case 'get-contexts': {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return { contexts: result[STORAGE_KEY] ?? {} };
    }

    // -----------------------------------------------------------------------
    // Return a single project context by projectId
    // -----------------------------------------------------------------------
    case 'get-context': {
      const { projectId } = message;
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const contexts = result[STORAGE_KEY] ?? {};
      const found = contexts[projectId] ?? null;
      return { context: found };
    }

    // -----------------------------------------------------------------------
    // Record that a context was injected into a specific tab
    // -----------------------------------------------------------------------
    case 'mark-injected': {
      const { projectId, tabId, url } = message;
      const urlHash = url ? simpleHash(url) : (tabId || 'unknown');
      const key = `${INJECTION_PREFIX}${projectId}_${urlHash}`;
      await chrome.storage.session.set({
        [key]: { projectId, url, injectedAt: Date.now() },
      });

      // Flash checkmark on the originating tab
      if (tabId) {
        flashCheckmark(tabId, url);
      }

      return { success: true };
    }

    // -----------------------------------------------------------------------
    // Check if a context was already injected into a tab
    // -----------------------------------------------------------------------
    case 'was-injected': {
      const { projectId, tabId, url } = message;
      const urlHash = url ? simpleHash(url) : (tabId || 'unknown');
      const key = `${INJECTION_PREFIX}${projectId}_${urlHash}`;
      const result = await chrome.storage.session.get(key);
      return { injected: !!result[key] };
    }

    // -----------------------------------------------------------------------
    // Sync contexts from Lore PWA (called by content-lore-bridge.js)
    // -----------------------------------------------------------------------
    case 'sync-from-lore': {
      const { contexts } = message;
      if (typeof contexts !== 'object' || contexts === null || Array.isArray(contexts)) {
        return { error: 'contexts must be a non-null object keyed by projectId' };
      }

      // E5: Check storage capacity before writing (8MB limit for chrome.storage.local)
      const MAX_BYTES = 8 * 1024 * 1024; // 8MB
      try {
        const bytesInUse = await chrome.storage.local.getBytesInUse(null);
        const dataSize = new Blob([JSON.stringify(contexts)]).size;
        if (bytesInUse + dataSize > MAX_BYTES) {
          // Trim oldest contexts until within budget
          const entries = Object.entries(contexts);
          entries.sort((a, b) => new Date(a[1].lastUpdated || 0) - new Date(b[1].lastUpdated || 0));
          while (entries.length > 0) {
            entries.shift(); // Remove oldest
            const trimmed = Object.fromEntries(entries);
            const trimmedSize = new Blob([JSON.stringify(trimmed)]).size;
            if (bytesInUse + trimmedSize <= MAX_BYTES) {
              Object.keys(contexts).forEach((k) => {
                if (!trimmed[k]) delete contexts[k];
              });
              break;
            }
          }
        }
      } catch (err) {
        console.warn('[Lore] Storage capacity check failed:', err);
      }

      await chrome.storage.local.set({ [STORAGE_KEY]: contexts });
      if (chrome.runtime.lastError) {
        return { error: 'Storage write failed: ' + chrome.runtime.lastError.message };
      }

      // Update badge on all currently open AI-site tabs
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.url && isAiSite(tab.url)) {
          updateBadge(tab.id, tab.url);
        }
      }

      return { success: true, count: Object.keys(contexts).length };
    }

    // -----------------------------------------------------------------------
    // Run transform via built-in API
    // -----------------------------------------------------------------------
    case 'transform': {
      const { mode, conversationText, projectId, projectsList } = message;
      if (!conversationText) return { error: 'No conversation text' };

      const { result, remaining } = await LoreTransform.runTransform(
        mode || 'handoff',
        conversationText,
        projectsList || [],
      );

      const logEntry = LoreTransform.buildLogEntry(mode || 'handoff', result, projectId);

      // Store as pending log for sync to loresync.dev
      const pending = await chrome.storage.local.get('lore_pending_logs');
      const logs = pending.lore_pending_logs || [];
      logs.push(logEntry);
      await chrome.storage.local.set({ lore_pending_logs: logs });

      const markdown = LoreTransform.formatLogAsMarkdown(logEntry);
      return { success: true, logEntry, remaining, markdown };
    }

    // -----------------------------------------------------------------------
    // Get pending logs (for bridge sync)
    // -----------------------------------------------------------------------
    case 'get-pending-logs': {
      const pending = await chrome.storage.local.get('lore_pending_logs');
      return { logs: pending.lore_pending_logs || [] };
    }

    // -----------------------------------------------------------------------
    // Clear pending logs after sync
    // -----------------------------------------------------------------------
    case 'clear-pending-logs': {
      await chrome.storage.local.remove('lore_pending_logs');
      return { success: true };
    }

    default:
      return { error: `Unknown message type: ${type}` };
  }
}

// ---------------------------------------------------------------------------
// Startup: refresh badge on all open AI-site tabs
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url && isAiSite(tab.url)) {
      updateBadge(tab.id, tab.url);
    }
  }
});
