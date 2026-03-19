/**
 * Lore — Content Banner + Context Injection
 *
 * Runs on Claude, ChatGPT, and Gemini pages.
 * Shows a notification banner when Lore project contexts are available,
 * and injects formatted context text into the AI site's input area on request.
 */
(function () {
  'use strict';

  console.log('[Lore Banner] Content script loaded on', location.hostname);

  // Prevent double-initialization if the script is injected more than once.
  if (window.__loreContentBannerLoaded) return;
  window.__loreContentBannerLoaded = true;

  console.log('[Lore Banner] Initializing...');

  // =========================================================================
  // Constants
  // =========================================================================

  var CHECK_INTERVAL_MS = 30000; // 30 seconds
  var SUCCESS_DISMISS_MS = 3000;

  // =========================================================================
  // Session state (scoped to this tab's lifetime via the IIFE)
  // =========================================================================

  var dismissed = false;   // User clicked "x" this session
  var injectedIds = {};    // projectId → true for this session
  var injectedThisSession = false; // Flag to prevent double injection from banner
  var bannerEl = null;     // Current banner DOM element (or null)
  var checkTimer = null;   // setInterval handle

  // =========================================================================
  // Site detection
  // =========================================================================

  function detectSite() {
    var host = location.hostname;
    if (host.includes('claude.ai')) return 'claude';
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt';
    if (host.includes('gemini.google.com')) return 'gemini';
    return null;
  }

  var currentSite = detectSite();
  if (!currentSite) return; // Not on a supported site — bail out.

  // =========================================================================
  // Relative time helper
  // =========================================================================

  function relativeTime(isoString) {
    if (!isoString) return 'unknown';
    try {
      var diff = Date.now() - new Date(isoString).getTime();
      if (diff < 0) return 'just now';
      var seconds = Math.floor(diff / 1000);
      if (seconds < 60) return 'just now';
      var minutes = Math.floor(seconds / 60);
      if (minutes < 60) return minutes + 'm ago';
      var hours = Math.floor(minutes / 60);
      if (hours < 24) return hours + 'h ago';
      var days = Math.floor(hours / 24);
      if (days < 30) return days + 'd ago';
      return new Date(isoString).toLocaleDateString();
    } catch {
      return 'unknown';
    }
  }

  // =========================================================================
  // Messaging helpers
  // =========================================================================

  function sendMessage(msg) {
    return new Promise(function (resolve) {
      try {
        if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
          console.warn('[Lore Banner] Extension runtime not available');
          resolve(null);
          return;
        }
        chrome.runtime.sendMessage(msg, function (response) {
          if (chrome.runtime.lastError) {
            console.warn('[Lore Banner] sendMessage error:', chrome.runtime.lastError.message);
            resolve(null);
          } else {
            resolve(response);
          }
        });
      } catch (e) {
        console.warn('[Lore Banner] sendMessage exception:', e.message);
        resolve(null);
      }
    });
  }

  // =========================================================================
  // Context formatting per site
  // =========================================================================

  function formatContextForClaude(projectName, updatedAt, fullContext) {
    return (
      '<project-context source="Lore" project="' + projectName + '" updated="' + (updatedAt || 'unknown') + '">\n' +
      fullContext + '\n' +
      '</project-context>\n\n' +
      'Continue working on this project from where we left off.'
    );
  }

  function formatContextForChatGPT(projectName, updatedAt, fullContext) {
    return (
      '# Project Context (from Lore)\n' +
      '**Project:** ' + projectName + ' | **Updated:** ' + relativeTime(updatedAt) + '\n\n' +
      fullContext + '\n\n' +
      '---\nContinue from where we left off.'
    );
  }

  function formatContextForGemini(projectName, updatedAt, fullContext) {
    return (
      '## Project Context from Lore\n' +
      fullContext + '\n\n' +
      'Please continue from where we left off.'
    );
  }

  function formatContext(site, projectName, updatedAt, fullContext) {
    switch (site) {
      case 'claude':  return formatContextForClaude(projectName, updatedAt, fullContext);
      case 'chatgpt': return formatContextForChatGPT(projectName, updatedAt, fullContext);
      case 'gemini':  return formatContextForGemini(projectName, updatedAt, fullContext);
      default:        return fullContext;
    }
  }

  // =========================================================================
  // Injection functions per site
  // =========================================================================

  function injectIntoClaude(text) {
    var editor = document.querySelector('div.ProseMirror[contenteditable="true"]');
    if (!editor) return false;
    editor.focus();

    // Claude uses ProseMirror — simulate paste for proper handling.
    var dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', text);
    var pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer,
    });
    editor.dispatchEvent(pasteEvent);
    return true;
  }

  function injectIntoChatGPT(text) {
    var editor = document.querySelector('#prompt-textarea');
    if (!editor) return false;

    if (editor.tagName === 'TEXTAREA') {
      // Older textarea version
      var nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(editor, text);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // Newer contenteditable version
      editor.focus();
      var dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', text);
      editor.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer,
      }));
    }
    return true;
  }

  function injectIntoGemini(text) {
    var editor =
      document.querySelector('.ql-editor[contenteditable="true"]') ||
      document.querySelector('div[contenteditable="true"]');
    if (!editor) return false;
    editor.focus();

    var dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', text);
    editor.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer,
    }));
    return true;
  }

  function injectText(site, text) {
    switch (site) {
      case 'claude':  return injectIntoClaude(text);
      case 'chatgpt': return injectIntoChatGPT(text);
      case 'gemini':  return injectIntoGemini(text);
      default:        return false;
    }
  }

  // =========================================================================
  // Banner DOM
  // =========================================================================

  function removeBanner(animate) {
    if (!bannerEl) return;
    if (animate) {
      bannerEl.classList.add('lore-banner-dismissing');
      var el = bannerEl;
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 250);
    } else {
      if (bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
    }
    bannerEl = null;
  }

  function createBanner(primaryContext, extraCount) {
    removeBanner(false);

    var banner = document.createElement('div');
    banner.className = 'lore-banner';

    // Text
    var textSpan = document.createElement('span');
    textSpan.className = 'lore-banner-text';
    var label = '\uD83D\uDD35 Lore: ' + primaryContext.projectName + ' context available';
    label += ' (updated ' + relativeTime(primaryContext.lastUpdated) + ')';
    if (extraCount > 0) {
      label += ' (+' + extraCount + ' more)';
    }
    textSpan.textContent = label;
    banner.appendChild(textSpan);

    // Load Context button
    var loadBtn = document.createElement('button');
    loadBtn.className = 'lore-banner-btn';
    loadBtn.textContent = 'Load Context';
    loadBtn.addEventListener('click', function () {
      handleLoadContext(primaryContext);
    });
    banner.appendChild(loadBtn);

    // Dismiss button
    var closeBtn = document.createElement('button');
    closeBtn.className = 'lore-banner-close';
    closeBtn.textContent = '\u00D7';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.addEventListener('click', function () {
      dismissed = true;
      removeBanner(true);
    });
    banner.appendChild(closeBtn);

    document.documentElement.appendChild(banner);
    bannerEl = banner;
  }

  function showSuccessBanner(projectName) {
    removeBanner(false);

    var banner = document.createElement('div');
    banner.className = 'lore-banner lore-banner-success';

    var textSpan = document.createElement('span');
    textSpan.className = 'lore-banner-text';
    textSpan.textContent = '\u2705 Context loaded for ' + projectName;
    banner.appendChild(textSpan);

    document.documentElement.appendChild(banner);
    bannerEl = banner;

    setTimeout(function () {
      removeBanner(true);
    }, SUCCESS_DISMISS_MS);
  }

  // =========================================================================
  // Load context handler
  // =========================================================================

  async function handleLoadContext(ctx) {
    // Prevent double injection from banner
    if (injectedThisSession) return;

    var formattedText = formatContext(currentSite, ctx.projectName, ctx.lastUpdated, ctx.fullContext);
    var success = injectText(currentSite, formattedText);

    if (success) {
      injectedIds[ctx.projectId] = true;
      injectedThisSession = true;

      // Mark as injected in background for cross-check (URL-based key)
      await sendMessage({
        type: 'mark-injected',
        projectId: ctx.projectId,
        url: location.href,
      });

      showSuccessBanner(ctx.projectName);
    } else {
      // Could not find the input area — show a toast with fallback message
      showToast('Could not find the input area. Try clicking in the chat box first.');
    }
  }

  // =========================================================================
  // Toast (bottom-right small notification)
  // =========================================================================

  function showToast(message) {
    var existing = document.querySelector('.lore-toast');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var toast = document.createElement('div');
    toast.className = 'lore-toast';
    toast.textContent = message;
    document.documentElement.appendChild(toast);

    setTimeout(function () {
      toast.classList.add('lore-toast-dismissing');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    }, 3000);
  }

  // =========================================================================
  // Context checking logic
  // =========================================================================

  async function checkAndShowBanner() {
    console.log('[Lore Banner] Checking for contexts...', { dismissed, injectedThisSession });
    // Don't show if dismissed or already showing success
    if (dismissed) return;

    var response = await sendMessage({ type: 'get-contexts' });
    console.log('[Lore Banner] get-contexts response:', response);
    if (!response || !response.contexts || Object.keys(response.contexts).length === 0) {
      removeBanner(true);
      return;
    }

    var contextsObj = response.contexts;

    // Convert object to entries and sort by lastUpdated descending (most recent first)
    var entries = Object.entries(contextsObj).sort(function (a, b) {
      return new Date(b[1].lastUpdated || 0).getTime() - new Date(a[1].lastUpdated || 0).getTime();
    });

    // Find the first context that hasn't been injected this session
    var primary = null;
    var available = [];

    for (var i = 0; i < entries.length; i++) {
      var projectId = entries[i][0];
      var ctx = entries[i][1];
      ctx.projectId = projectId; // attach projectId for downstream use

      if (injectedIds[projectId]) continue;

      // Also check with background for cross-session injection tracking (URL-based)
      var wasInjectedResp = await sendMessage({
        type: 'was-injected',
        projectId: projectId,
        url: location.href,
      });

      if (wasInjectedResp?.injected) {
        injectedIds[projectId] = true;
        continue;
      }

      available.push(ctx);
      if (!primary) primary = ctx;
    }

    if (!primary) {
      // All contexts already injected
      removeBanner(true);
      return;
    }

    // Show banner for the most recently updated context
    createBanner(primary, available.length - 1);
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  // Initial check after a delay to let the page settle and bridge sync complete
  setTimeout(checkAndShowBanner, 2000);

  // Periodic re-check
  checkTimer = setInterval(checkAndShowBanner, CHECK_INTERVAL_MS);

  // Re-check when tab becomes visible again
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && !dismissed) {
      checkAndShowBanner();
    }
  });
})();
