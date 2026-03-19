/**
 * Lore — Background Service Worker
 *
 * Responsibilities:
 * 1. Monitor tabs and show badge when Lore contexts are available on AI sites
 * 2. Route messages between content scripts and popup
 * 3. Manage context storage (chrome.storage.local) and injection tracking (chrome.storage.session)
 */

const AI_SITE_PATTERNS = [
  'claude.ai',
  'chatgpt.com',
  'chat.openai.com',
  'gemini.google.com',
];

const BADGE_COLOR = '#7c5cfc';
const STORAGE_KEY = 'lore_contexts';
const INJECTION_PREFIX = 'injected_';

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
  // Clear badge for non-AI tabs
  if (!url || !isAiSite(url)) {
    await chrome.action.setBadgeText({ text: '', tabId });
    return;
  }

  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const contexts = result[STORAGE_KEY] ?? [];
    const count = Array.isArray(contexts) ? contexts.length : 0;

    if (count > 0) {
      await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId });
      await chrome.action.setBadgeText({ text: String(count), tabId });
    } else {
      await chrome.action.setBadgeText({ text: '', tabId });
    }
  } catch (err) {
    console.error('[Lore] Failed to update badge:', err);
    await chrome.action.setBadgeText({ text: '', tabId });
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message, _sender)
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
      return { contexts: result[STORAGE_KEY] ?? [] };
    }

    // -----------------------------------------------------------------------
    // Return a single project context by projectId
    // -----------------------------------------------------------------------
    case 'get-context': {
      const { projectId } = message;
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const contexts = result[STORAGE_KEY] ?? [];
      const found = contexts.find((c) => c.projectId === projectId) ?? null;
      return { context: found };
    }

    // -----------------------------------------------------------------------
    // Record that a context was injected into a specific tab
    // -----------------------------------------------------------------------
    case 'mark-injected': {
      const { projectId, tabId, url } = message;
      const key = `${INJECTION_PREFIX}${projectId}_${tabId}`;
      await chrome.storage.session.set({
        [key]: { projectId, tabId, url, injectedAt: Date.now() },
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
      const { projectId, tabId } = message;
      const key = `${INJECTION_PREFIX}${projectId}_${tabId}`;
      const result = await chrome.storage.session.get(key);
      return { injected: !!result[key] };
    }

    // -----------------------------------------------------------------------
    // Sync contexts from Lore PWA (called by content-lore-bridge.js)
    // -----------------------------------------------------------------------
    case 'sync-from-lore': {
      const { contexts } = message;
      if (!Array.isArray(contexts)) {
        return { error: 'contexts must be an array' };
      }
      await chrome.storage.local.set({ [STORAGE_KEY]: contexts });

      // Update badge on all currently open AI-site tabs
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.url && isAiSite(tab.url)) {
          updateBadge(tab.id, tab.url);
        }
      }

      return { success: true, count: contexts.length };
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
