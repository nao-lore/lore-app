/**
 * Lore Capture — popup controller.
 * Detects the current page, extracts messages, sends to Lore.
 */
(function () {
  'use strict';

  var statsEl = document.getElementById('stats');
  var btnSend = document.getElementById('btn-send');

  var extractedJson = null;

  function setStats(text, isError) {
    statsEl.textContent = text;
    statsEl.className = isError ? 'error' : '';
  }

  // Detect which site we're on
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
    return JSON.stringify({
      source: source,
      title: data.title || undefined,
      capturedAt: new Date().toISOString(),
      url: pageUrl || undefined,
      messages: data.messages.map(function (m) {
        var msg = { role: m.role, content: m.content };
        if (m.timestamp) msg.timestamp = m.timestamp;
        return msg;
      }),
    }, null, 2);
  }

  // Main flow
  async function run() {
    var tab;
    try {
      var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs[0];
    } catch (e) {
      setStats('Cannot access current tab.', true);
      return;
    }

    if (!tab || !tab.url) {
      setStats('Cannot read page URL.', true);
      return;
    }

    var extractor = getExtractor(tab.url);
    if (!extractor) {
      setStats('Open ChatGPT, Claude, or Gemini.', true);
      return;
    }

    setStats('Extracting...');

    try {
      var results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-extract.js'],
      });

      var result = results && results[0] && results[0].result;
      if (!result || !result.messages || !Array.isArray(result.messages) || result.messages.length === 0) {
        setStats('No messages found.', true);
        return;
      }
      // Validate message structure
      for (var i = 0; i < result.messages.length; i++) {
        var m = result.messages[i];
        if (typeof m.role !== 'string' || typeof m.content !== 'string') {
          setStats('Invalid message format.', true);
          return;
        }
      }

      extractedJson = buildJson(result, extractor.source, tab.url);

      var msgCount = result.messages.length;
      setStats(msgCount + ' messages captured from this chat');
      btnSend.disabled = false;

    } catch (err) {
      console.error('Extraction failed:', err);
      setStats('Failed to extract. Try refreshing.', true);
    }
  }

  btnSend.addEventListener('click', function () {
    if (!extractedJson) return;

    var importHash = '#import=' + encodeURIComponent(extractedJson);
    var baseUrl = 'https://loresync.dev';

    chrome.tabs.query({}, function (tabs) {
      if (chrome.runtime.lastError) {
        setStats('Failed to send: ' + chrome.runtime.lastError.message, true);
        return;
      }
      var existing = tabs.find(function (t) {
        return t.url && t.url.startsWith(baseUrl);
      });

      if (existing) {
        // Reuse existing Lore tab: update hash to trigger import
        chrome.tabs.update(existing.id, { url: baseUrl + '/' + importHash, active: true }, function() {
          btnSend.textContent = 'Sent!';
          setTimeout(function () { btnSend.textContent = 'Send to Lore'; }, 2000);
        });
        chrome.windows.update(existing.windowId, { focused: true });
      } else {
        chrome.tabs.create({ url: baseUrl + '/' + importHash }, function() {
          btnSend.textContent = 'Sent!';
          setTimeout(function () { btnSend.textContent = 'Send to Lore'; }, 2000);
        });
      }
    });
  });

  run();
})();
