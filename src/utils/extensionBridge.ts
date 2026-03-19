/**
 * extensionBridge — persist AI context for the Chrome extension to read.
 *
 * Saves structured context to localStorage so the Lore Chrome extension
 * can pick up the latest handoff / project background in real-time.
 */

import { safeGetItem, safeSetItem } from '../storage/core';

const STORAGE_KEY = 'lore_contexts';

export interface ExtensionContext {
  projectName: string;
  lastUpdated: string;
  fullContext: string;
  handoffMarkdown: string;
  handoffTitle: string;
  summary: string;
}

export type ExtensionContextMap = Record<string, ExtensionContext>;

/**
 * Save the full AI context so the Chrome extension can read it.
 * Also dispatches a custom event for real-time pickup by extension content scripts.
 */
export function saveContextForExtension(
  projectId: string,
  projectName: string,
  fullContext: string,
  handoffMarkdown: string,
  handoffTitle: string,
): void {
  const existing = getExtensionContexts();

  existing[projectId] = {
    projectName,
    lastUpdated: new Date().toISOString(),
    fullContext,
    handoffMarkdown,
    handoffTitle,
    summary: fullContext.slice(0, 100),
  };

  safeSetItem(STORAGE_KEY, JSON.stringify(existing));

  // Try writing to chrome.storage.local if available (extension context)
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: existing });
    }
  } catch {
    // chrome.storage won't exist in normal browser — ignore
  }

  // Dispatch custom event for real-time extension pickup
  window.dispatchEvent(new CustomEvent('lore-context-updated', { detail: { projectId } }));
}

/** Read all stored extension contexts. */
export function getExtensionContexts(): ExtensionContextMap {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ExtensionContextMap;
  } catch {
    return {};
  }
}

/** Return the most recently updated project's context, or null if none. */
export function getLatestContext(): (ExtensionContext & { projectId: string }) | null {
  const contexts = getExtensionContexts();
  let latest: (ExtensionContext & { projectId: string }) | null = null;

  for (const [projectId, ctx] of Object.entries(contexts)) {
    if (!latest || ctx.lastUpdated > latest.lastUpdated) {
      latest = { ...ctx, projectId };
    }
  }

  return latest;
}
