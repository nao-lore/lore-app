'use strict';

// =============================================================================
// Tab switching
// =============================================================================

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// =============================================================================
// Helpers
// =============================================================================

function getRelativeTime(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function detectSite(url) {
  if (!url) return null;
  if (url.includes('claude.ai')) return 'claude';
  if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) return 'chatgpt';
  if (url.includes('gemini.google.com')) return 'gemini';
  return null;
}

// =============================================================================
// INJECT TAB
// =============================================================================

function formatContextForSite(ctx, site) {
  const text = ctx.fullContext || ctx.handoffMarkdown || '';
  const project = ctx.projectName || 'Project';

  if (site === 'claude') {
    return (
      `<project-context source="Lore" project="${project}">\n${text}\n</project-context>` +
      '\n\nContinue working on this project from where we left off.'
    );
  }
  if (site === 'chatgpt') {
    return (
      `# Project Context (from Lore)\n**Project:** ${project}\n\n${text}` +
      '\n\n---\nContinue from where we left off.'
    );
  }
  // gemini
  return `## Project Context from Lore\n${text}\n\nPlease continue from where we left off.`;
}

/**
 * This function is serialized and executed inside the AI site's page context
 * via chrome.scripting.executeScript, so it cannot reference any outer scope.
 *
 * E14: Clears existing content before injecting to prevent collision with
 * user's in-progress typing (overwrite mode).
 */
function injectText(text, site) {
  if (site === 'claude') {
    const editor = document.querySelector('div.ProseMirror[contenteditable="true"]');
    if (!editor) return false;
    editor.focus();
    // E14: Clear existing content before injection
    editor.innerHTML = '';
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    editor.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })
    );
    return true;
  }
  if (site === 'chatgpt') {
    const editor = document.querySelector('#prompt-textarea');
    if (!editor) return false;
    if (editor.tagName === 'TEXTAREA') {
      // E14: Overwrite — setter replaces entire value
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(editor, text);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      editor.focus();
      // E14: Clear existing content before injection
      editor.innerHTML = '';
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      editor.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })
      );
    }
    return true;
  }
  if (site === 'gemini') {
    const editor =
      document.querySelector('.ql-editor[contenteditable="true"]') ||
      document.querySelector('div[contenteditable="true"][aria-label]');
    if (!editor) return false;
    editor.focus();
    // E14: Clear existing content before injection
    editor.innerHTML = '';
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    editor.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })
    );
    return true;
  }
  return false;
}

async function injectContext(projectId, ctx, btn) {
  try {
    btn.textContent = 'Injecting...';
    btn.disabled = true;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab');

    const site = detectSite(tab.url);
    if (!site) {
      btn.textContent = 'Open Claude, ChatGPT, or Gemini first';
      setTimeout(() => {
        btn.textContent = 'Inject into current tab';
        btn.disabled = false;
      }, 2000);
      return;
    }

    const formattedText = formatContextForSite(ctx, site);

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectText,
      args: [formattedText, site],
    });

    await chrome.runtime.sendMessage({
      type: 'mark-injected',
      projectId,
      tabId: tab.id,  // Keep tabId for badge flash
      url: tab.url,
    });

    btn.textContent = '✅ Injected!';
    btn.className = 'btn-inject injected';
  } catch (err) {
    btn.textContent = 'Failed — try again';
    btn.disabled = false;
    console.error('Inject error:', err);
  }
}

async function loadContexts() {
  const loadingEl = document.getElementById('inject-loading');
  const emptyEl = document.getElementById('inject-empty');
  const listEl = document.getElementById('inject-list');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'get-contexts' });
    const contextsObj = response?.contexts || {};

    // contexts is an object keyed by projectId — convert to entries and sort by lastUpdated descending
    const entries = (typeof contextsObj === 'object' && contextsObj !== null && !Array.isArray(contextsObj))
      ? Object.entries(contextsObj).sort(
          (a, b) => new Date(b[1].lastUpdated || 0) - new Date(a[1].lastUpdated || 0)
        )
      : [];

    loadingEl.style.display = 'none';

    if (entries.length === 0) {
      emptyEl.style.display = 'block';
      return;
    }

    listEl.style.display = 'block';
    listEl.innerHTML = '';

    for (const [projectId, ctx] of entries) {
      const card = document.createElement('div');
      card.className = 'project-card';

      const timeAgo = ctx.lastUpdated ? getRelativeTime(new Date(ctx.lastUpdated)) : '';

      const nameDiv = document.createElement('div');
      nameDiv.className = 'project-name';
      nameDiv.textContent = '📋 ' + (ctx.projectName || 'Untitled');

      const metaDiv = document.createElement('div');
      metaDiv.className = 'project-meta';
      metaDiv.textContent = (ctx.handoffTitle || '') + (timeAgo ? ' · ' + timeAgo : '');

      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'project-summary';
      summaryDiv.textContent = ctx.summary || '';

      card.appendChild(nameDiv);
      card.appendChild(metaDiv);
      card.appendChild(summaryDiv);

      const btn = document.createElement('button');
      btn.className = 'btn-inject';
      btn.textContent = 'Inject into current tab';
      btn.addEventListener('click', () => injectContext(projectId, ctx, btn));
      card.appendChild(btn);

      listEl.appendChild(card);
    }
  } catch (err) {
    loadingEl.textContent = 'Failed to load contexts.';
    console.error('Load contexts error:', err);
  }
}

loadContexts();

// =============================================================================
// CAPTURE TAB
// =============================================================================

const statsEl = document.getElementById('stats');
const btnTransform = document.getElementById('btn-transform');
const captureOptionsEl = document.getElementById('capture-options');
const captureProjectEl = document.getElementById('capture-project');
const transformProgressEl = document.getElementById('transform-progress');
const transformDoneEl = document.getElementById('transform-done');
const progressFillEl = document.getElementById('progress-fill');
const transformStatusEl = document.getElementById('transform-status');
const remainingHintEl = document.getElementById('remaining-hint');
const btnViewInLore = document.getElementById('btn-view-in-lore');

let extractedJson = null;
let extractedConversationText = null;
let selectedMode = 'handoff';
let createdLogId = null;

// Mode selector buttons
document.querySelectorAll('.capture-mode').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.capture-mode').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMode = btn.dataset.mode;
  });
});

// Load projects from extension storage (synced from loresync.dev)
async function loadProjectsForCapture() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'get-contexts' });
    const contextsObj = response?.contexts || {};
    const seen = new Set();
    for (const [projectId, ctx] of Object.entries(contextsObj)) {
      if (ctx.projectName && !seen.has(projectId)) {
        seen.add(projectId);
        const opt = document.createElement('option');
        opt.value = projectId;
        opt.textContent = ctx.projectName;
        captureProjectEl.appendChild(opt);
      }
    }
  } catch (err) {
    console.error('Failed to load projects for capture:', err);
  }
}

loadProjectsForCapture();

function setStats(text, isError) {
  statsEl.textContent = text;
  statsEl.className = isError ? 'stats error' : 'stats';
}

function getExtractor(url) {
  if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
    return { name: 'ChatGPT', source: 'chatgpt' };
  }
  if (url.includes('claude.ai')) {
    return { name: 'Claude', source: 'claude' };
  }
  if (url.includes('gemini.google.com')) {
    return { name: 'Gemini', source: 'gemini' };
  }
  return null;
}

function buildJson(data, source, pageUrl) {
  return JSON.stringify(
    {
      source,
      title: data.title || undefined,
      capturedAt: new Date().toISOString(),
      url: pageUrl || undefined,
      messages: data.messages.map((m) => {
        const msg = { role: m.role, content: m.content };
        if (m.timestamp) msg.timestamp = m.timestamp;
        return msg;
      }),
    },
    null,
    2
  );
}

async function runCapture() {
  let tab;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch {
    setStats('Cannot access current tab.', true);
    return;
  }

  if (!tab || !tab.url) {
    setStats('Cannot read page URL.', true);
    return;
  }

  const extractor = getExtractor(tab.url);
  if (!extractor) {
    setStats('Open ChatGPT, Claude, or Gemini.', true);
    return;
  }

  setStats('Extracting from ' + extractor.name + '...');

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content-extract.js'],
    });

    const result = results && results[0] && results[0].result;
    if (
      !result ||
      !result.messages ||
      !Array.isArray(result.messages) ||
      result.messages.length === 0
    ) {
      // E10: Show extraction error message from content script if available
      if (result && result.extractionError) {
        setStats(result.extractionError, true);
      } else {
        setStats('No messages found.', true);
      }
      return;
    }

    // Validate message structure
    for (const m of result.messages) {
      if (typeof m.role !== 'string' || typeof m.content !== 'string') {
        setStats('Invalid message format.', true);
        return;
      }
    }

    extractedJson = buildJson(result, extractor.source, tab.url);

    // Build plain conversation text for transform
    extractedConversationText = result.messages
      .map((m) => (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.content)
      .join('\n\n');

    const msgCount = result.messages.length;
    setStats(msgCount + ' messages captured from ' + extractor.name);
    captureOptionsEl.style.display = 'block';
    btnTransform.disabled = false;
  } catch (err) {
    console.error('Extraction failed:', err);
    setStats('Failed to extract. Try refreshing.', true);
  }
}

btnTransform.addEventListener('click', async () => {
  if (!extractedConversationText) return;

  // Show progress
  btnTransform.style.display = 'none';
  captureOptionsEl.style.display = 'none';
  transformProgressEl.style.display = 'block';

  // Animate progress bar
  let pct = 0;
  const progressInterval = setInterval(() => {
    pct = Math.min(pct + (90 - pct) * 0.05, 90);
    progressFillEl.style.width = pct + '%';
  }, 200);

  try {
    const projectId = captureProjectEl.value || undefined;
    const response = await chrome.runtime.sendMessage({
      type: 'transform',
      mode: selectedMode,
      conversationText: extractedConversationText,
      projectId,
    });

    clearInterval(progressInterval);

    if (response.error) {
      throw new Error(response.error);
    }

    // Success
    progressFillEl.style.width = '100%';
    createdLogId = response.logEntry?.id;

    // Copy result to clipboard
    if (response.markdown) {
      try {
        await navigator.clipboard.writeText(response.markdown);
      } catch {
        // Clipboard API may fail in popup — ignore
      }
    }

    setTimeout(() => {
      transformProgressEl.style.display = 'none';
      transformDoneEl.style.display = 'block';
      statsEl.style.display = 'none';

      if (response.remaining !== null && response.remaining !== undefined) {
        remainingHintEl.textContent = response.remaining + ' transforms remaining today';
      }
    }, 300);
  } catch (err) {
    clearInterval(progressInterval);
    transformProgressEl.style.display = 'none';
    btnTransform.style.display = 'block';
    captureOptionsEl.style.display = 'block';
    setStats('Transform failed: ' + err.message, true);
    btnTransform.disabled = false;
  }
});

// View in Lore button
btnViewInLore.addEventListener('click', async () => {
  const baseUrl = 'https://loresync.dev';
  const hash = createdLogId ? '#log=' + createdLogId : '';

  try {
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((t) => t.url && t.url.startsWith(baseUrl));

    if (existing) {
      await chrome.tabs.update(existing.id, {
        url: baseUrl + '/' + hash,
        active: true,
      });
      await chrome.windows.update(existing.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url: baseUrl + '/' + hash });
    }
  } catch (err) {
    console.error('Failed to open Lore:', err);
  }
});

// Run capture detection on popup open
runCapture();
