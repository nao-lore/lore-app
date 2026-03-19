/**
 * Lore — Standalone Context Injector
 *
 * Can be executed via chrome.scripting.executeScript from the popup or
 * background service worker. Reads injection parameters from
 * chrome.storage.session under the key `lore_pending_injection`, then
 * injects the formatted text into the current AI site's input area.
 *
 * This is a complementary entry point to content-banner.js — the banner
 * script handles the main interactive flow, while this script enables
 * programmatic injection without the banner.
 */
(async function () {
  'use strict';

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

  // =========================================================================
  // Relative time
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
  // Context formatting
  // =========================================================================

  function formatContext(site, projectName, updatedAt, fullContext) {
    switch (site) {
      case 'claude':
        return (
          '<project-context source="Lore" project="' + projectName + '" updated="' + (updatedAt || 'unknown') + '">\n' +
          fullContext + '\n' +
          '</project-context>\n\n' +
          'Continue working on this project from where we left off.'
        );
      case 'chatgpt':
        return (
          '# Project Context (from Lore)\n' +
          '**Project:** ' + projectName + ' | **Updated:** ' + relativeTime(updatedAt) + '\n\n' +
          fullContext + '\n\n' +
          '---\nContinue from where we left off.'
        );
      case 'gemini':
        return (
          '## Project Context from Lore\n' +
          fullContext + '\n\n' +
          'Please continue from where we left off.'
        );
      default:
        return fullContext;
    }
  }

  // =========================================================================
  // Injection functions
  // =========================================================================

  function injectIntoClaude(text) {
    var editor = document.querySelector('div.ProseMirror[contenteditable="true"]');
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

  function injectIntoChatGPT(text) {
    var editor = document.querySelector('#prompt-textarea');
    if (!editor) return false;
    if (editor.tagName === 'TEXTAREA') {
      var nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(editor, text);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
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
  // Main: read pending injection from session storage and execute
  // =========================================================================

  var site = detectSite();
  if (!site) return { success: false, error: 'Not on a supported AI site' };

  try {
    var result = await chrome.storage.session.get('lore_pending_injection');
    var pending = result.lore_pending_injection;

    if (!pending || !pending.fullContext) {
      return { success: false, error: 'No pending injection found' };
    }

    var formatted = formatContext(site, pending.projectName, pending.updatedAt, pending.fullContext);
    var injected = injectText(site, formatted);

    if (injected) {
      // Clean up the pending injection
      await chrome.storage.session.remove('lore_pending_injection');
      return { success: true, projectId: pending.projectId };
    } else {
      return { success: false, error: 'Could not find input area on page' };
    }
  } catch (err) {
    return { success: false, error: err.message || 'Injection failed' };
  }
})();
