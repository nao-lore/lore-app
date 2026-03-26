# Product Hunt — FAQ

---

**Q: Is my data sent to your servers?**

No. Lore runs entirely in your browser. Your conversations and project data are stored locally in IndexedDB — nothing is sent to our servers. The app is open source, so you can verify this yourself. When you use AI-powered extraction, the conversation is sent directly from your browser to the AI provider (OpenAI, Anthropic, or Google) — Lore never acts as a middleman.

---

**Q: Which AI services are supported?**

Lore processes conversations from Claude, ChatGPT, and Gemini. You can paste exported conversations or use the Chrome extension to capture them directly. For the AI extraction itself, Lore works with OpenAI, Anthropic, and Google Gemini APIs — or you can use the built-in free tier which requires no API key.

---

**Q: What's included in the free tier?**

The free tier gives you 20 transforms per day and up to 3 projects. No account or API key required. It covers the full feature set — structured extraction, project dashboard, Chrome extension, and all 8 languages. Pro unlocks unlimited transforms, unlimited projects, and export features.

---

**Q: Can I export my data?**

Yes. Every snapshot can be exported as JSON. Your project data is stored in standard browser storage (IndexedDB), and you have full control over it at all times. We believe your data should be portable — no lock-in.

---

**Q: Is it open source?**

Yes, fully. The entire codebase is on GitHub at [github.com/nao-lore/lore-app](https://github.com/nao-lore/lore-app). Full test suite, TypeScript throughout, MIT licensed. Contributions and feedback are welcome.
