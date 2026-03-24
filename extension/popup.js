'use strict';

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
