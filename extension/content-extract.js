/**
 * Multi-site conversation extractor.
 * Runs in the context of ChatGPT, Claude, or Gemini pages.
 * Returns { messages, title, url } for the popup to consume.
 */
(function () {
  'use strict';

  // =========================================================================
  // Shared helpers
  // =========================================================================

  /**
   * Extract text from a DOM element, preserving:
   * - code blocks (<pre><code> → ``` fences)
   * - inline code (<code> → backticks)
   * - lists (<li> → markdown bullets)
   */
  function extractText(el) {
    if (!el) return '';

    var clone = el.cloneNode(true);

    // Code blocks
    var pres = clone.querySelectorAll('pre');
    for (var i = 0; i < pres.length; i++) {
      var pre = pres[i];
      var codeEl = pre.querySelector('code');
      var langMatch = codeEl && codeEl.className ? codeEl.className.match(/language-(\w+)/) : null;
      var lang = langMatch ? langMatch[1] : '';
      var code = (codeEl || pre).textContent || '';
      pre.textContent = '\n```' + lang + '\n' + code.trim() + '\n```\n';
    }

    // Inline code
    var inlineCodes = clone.querySelectorAll('code:not(pre code)');
    for (var j = 0; j < inlineCodes.length; j++) {
      inlineCodes[j].textContent = '`' + inlineCodes[j].textContent + '`';
    }

    // List items
    var lis = clone.querySelectorAll('li');
    for (var k = 0; k < lis.length; k++) {
      var li = lis[k];
      var parent = li.parentElement;
      if (parent && parent.tagName === 'OL') {
        var idx = Array.from(parent.children).indexOf(li) + 1;
        li.textContent = idx + '. ' + li.textContent.trim();
      } else {
        li.textContent = '- ' + li.textContent.trim();
      }
    }

    return clone.innerText.trim();
  }

  function extractTimestamp(el) {
    var timeEl = el.querySelector('time[datetime]');
    if (timeEl) return timeEl.getAttribute('datetime');

    var titleEl = el.querySelector('[title]');
    if (titleEl) {
      var title = titleEl.getAttribute('title');
      if (title && /\d{4}|AM|PM|:\d{2}/.test(title)) return title;
    }
    return null;
  }

  function getPageTitle(suffixPattern) {
    var titleEl = document.querySelector('title');
    var raw = titleEl && titleEl.innerText ? titleEl.innerText.trim() : '';
    if (!raw) return null;
    return raw.replace(suffixPattern, '').trim() || null;
  }

  // =========================================================================
  // ChatGPT
  // =========================================================================

  function extractChatGPT() {
    var messages = [];

    // Primary: article[data-message-author-role]
    var articles = document.querySelectorAll('article[data-message-author-role]');
    if (articles.length > 0) {
      for (var i = 0; i < articles.length; i++) {
        var article = articles[i];
        var role = article.getAttribute('data-message-author-role');
        if (!role || role === 'system' || role === 'tool') continue;

        var contentEl = article.querySelector('.markdown, .whitespace-pre-wrap, [data-message-content]');
        if (!contentEl) continue;
        var text = extractText(contentEl);
        if (!text) continue;

        messages.push({
          role: role === 'user' ? 'user' : 'assistant',
          content: text,
          timestamp: extractTimestamp(article),
        });
      }
    }

    // Fallback 1: conversation turn containers
    if (messages.length === 0) {
      var turns = document.querySelectorAll('[data-testid^="conversation-turn-"]');
      for (var j = 0; j < turns.length; j++) {
        var turn = turns[j];
        var innerArticle = turn.querySelector('article[data-message-author-role]');
        var turnRole = innerArticle
          ? innerArticle.getAttribute('data-message-author-role')
          : (turn.querySelector('[data-message-author-role="user"]') ? 'user' : 'assistant');

        if (!turnRole || turnRole === 'system' || turnRole === 'tool') continue;

        var turnContent = turn.querySelector('.markdown, .whitespace-pre-wrap');
        var turnText = extractText(turnContent);
        if (!turnText) continue;

        messages.push({
          role: turnRole === 'user' ? 'user' : 'assistant',
          content: turnText,
          timestamp: extractTimestamp(turn),
        });
      }
    }

    // Fallback 2 (E10): innerText-based last resort using .markdown elements
    if (messages.length === 0) {
      var markdownEls = document.querySelectorAll('.markdown');
      for (var m = 0; m < markdownEls.length; m++) {
        var mdEl = markdownEls[m];
        var mdText = extractText(mdEl);
        if (!mdText) continue;

        // Heuristic: check closest ancestor for role hints
        var ancestor = mdEl.closest('[data-message-author-role]');
        var mdRole = 'assistant';
        if (ancestor) {
          var attrRole = ancestor.getAttribute('data-message-author-role');
          if (attrRole === 'user') mdRole = 'user';
        }

        messages.push({
          role: mdRole,
          content: mdText,
          timestamp: null,
        });
      }
    }

    // If all selectors failed, return a user-facing error message
    if (messages.length === 0) {
      return {
        messages: [],
        title: null,
        url: window.location.href,
        extractionError: 'Could not extract messages. Please copy the conversation manually and paste it in Lore.',
      };
    }

    var title = getPageTitle(/\s*[\|\-]\s*ChatGPT\s*$/i);
    return { messages: messages, title: title, url: window.location.href };
  }

  // =========================================================================
  // Claude
  // =========================================================================

  function extractClaude() {
    var messages = [];

    // User messages
    var userEls = document.querySelectorAll('div[data-testid="user-message"]');
    var assistantEls = document.querySelectorAll('div[data-testid="assistant-message"]');

    // Interleave by DOM order: collect all message nodes with their roles
    var allNodes = [];

    for (var i = 0; i < userEls.length; i++) {
      allNodes.push({ el: userEls[i], role: 'user' });
    }
    for (var j = 0; j < assistantEls.length; j++) {
      allNodes.push({ el: assistantEls[j], role: 'assistant' });
    }

    // Sort by DOM position to preserve conversation order
    allNodes.sort(function (a, b) {
      var pos = a.el.compareDocumentPosition(b.el);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    for (var k = 0; k < allNodes.length; k++) {
      var node = allNodes[k];
      var contentEl = node.el.querySelector('.prose') || node.el;
      var text = extractText(contentEl);
      if (!text) continue;

      messages.push({
        role: node.role,
        content: text,
        timestamp: extractTimestamp(node.el),
      });
    }

    var title = getPageTitle(/\s*[\|\-]\s*Claude\s*$/i);
    return { messages: messages, title: title, url: window.location.href };
  }

  // =========================================================================
  // Gemini
  // =========================================================================

  function extractGemini() {
    var messages = [];

    // User queries
    var userEls = document.querySelectorAll('user-query');
    var assistantEls = document.querySelectorAll('model-response');

    var allNodes = [];

    for (var i = 0; i < userEls.length; i++) {
      allNodes.push({ el: userEls[i], role: 'user' });
    }
    for (var j = 0; j < assistantEls.length; j++) {
      allNodes.push({ el: assistantEls[j], role: 'assistant' });
    }

    // Sort by DOM position
    allNodes.sort(function (a, b) {
      var pos = a.el.compareDocumentPosition(b.el);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    for (var k = 0; k < allNodes.length; k++) {
      var node = allNodes[k];
      // Gemini renders markdown in .markdown-main-panel or just the inner content
      var contentEl = node.el.querySelector('.markdown-main-panel, .model-response-text, .query-text') || node.el;
      var text = extractText(contentEl);
      if (!text) continue;

      messages.push({
        role: node.role,
        content: text,
        timestamp: extractTimestamp(node.el),
      });
    }

    var title = getPageTitle(/\s*[\|\-]\s*Gemini\s*$/i);
    return { messages: messages, title: title, url: window.location.href };
  }

  // =========================================================================
  // Router
  // =========================================================================

  var hostname = window.location.hostname;

  if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) {
    return extractChatGPT();
  }
  if (hostname.includes('claude.ai')) {
    return extractClaude();
  }
  if (hostname.includes('gemini.google.com')) {
    return extractGemini();
  }

  return { messages: [], title: null, url: window.location.href };
})();
