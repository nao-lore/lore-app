<h1 align="center">Lore</h1>

<p align="center">
  <strong>Turn AI conversations into structured handoffs</strong><br/>
  Stop losing context between AI sessions. Paste a chat, get a handoff.
</p>

<p align="center">
  <a href="https://lore-app.vercel.app">Live App</a> ·
  <a href="#features">Features</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#chrome-extension">Chrome Extension</a>
</p>

---

## What is Lore?

Every time you start a new AI session, you lose context. Lore fixes that.

Paste your ChatGPT / Claude / Gemini conversation into Lore, and it automatically generates:

- **Handoff** — A structured summary so your next AI session can pick up exactly where you left off
- **TODO list** — Action items auto-extracted with priority levels
- **Project Summary** — A living overview built from all your handoffs
- **AI Context** — Copy-paste-ready context for your next AI session

## Features

**Core**
- One-click handoff generation from any AI conversation
- Auto-extracted TODOs with priority, due dates, and source tracking
- Project Summary that evolves as you add more handoffs
- AI Context: copy & paste into your next session for instant context sharing

**Organization**
- Projects with custom icons and colors
- Pin frequently-used projects and logs
- Tag-based filtering and full-text search (⌘K)
- Timeline view across logs, TODOs, and summaries
- Dashboard with today's focus, blockers, and overdue tasks

**Input**
- Paste text directly
- Import files (.txt, .md, .docx, .json) via drag & drop
- Chrome extension for one-click capture from ChatGPT, Claude, and Gemini

**Extras**
- Weekly Report auto-generation
- Knowledge Base extraction (recurring patterns & decisions)
- Notion & Slack integrations
- PWA — installable on desktop and mobile
- 8 languages: English, 日本語, Español, Français, Deutsch, 中文, 한국어, Português

## Getting Started

### Use the hosted version

Go to **[lore-app.vercel.app](https://lore-app.vercel.app)** — no signup required.

1. Set up a free Gemini API key at [aistudio.google.com](https://aistudio.google.com)
2. Paste it in Settings
3. Paste an AI conversation and hit "Transform to Handoff"

### Run locally

```bash
git clone https://github.com/nao-lore/lore-app.git
cd lore-app
npm install
npm run dev
```

Open `http://localhost:5173`.

### Build for production

```bash
npm run build    # outputs to dist/
npm run preview  # preview production build
```

### Tests

```bash
npm test         # unit tests (Vitest)
```

## Chrome Extension

The `extension/` directory contains a Chrome extension that adds a "Send to Lore" button on ChatGPT, Claude, and Gemini pages.

To install locally:
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `extension/` folder

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | React 19 + TypeScript (strict) |
| Build | Vite 7 |
| Testing | Vitest + Playwright |
| Storage | localStorage (database migration planned) |
| Deploy | Vercel |
| PWA | vite-plugin-pwa |

## Data & Privacy

- All data is stored in your browser's localStorage
- API keys never leave your browser — they're sent directly to the AI provider
- No analytics, no tracking, no accounts required
- Export/import your data anytime from Settings

## License

MIT
