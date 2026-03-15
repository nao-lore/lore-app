# Changelog

## [0.1.0-beta] - 2026-03-14

### Added
- Core handoff generation from AI conversations (ChatGPT, Claude, Gemini)
- TODO auto-extraction with priority levels and due dates
- Project organization with custom icons and colors
- Project Summary (AI-generated overview from all handoffs)
- AI Context copy (paste-ready context for next AI session)
- Chrome extension for one-click conversation capture
- Demo mode (no API key required)
- 8 language support (EN, JA, ES, FR, DE, ZH, KO, PT)
- PWA support (installable, offline-capable)
- Keyboard shortcuts (⌘K search, ⌘N create, ⌘, settings)
- Drag & drop file import (.txt, .md, .docx, .json)
- Timeline view
- Weekly Report generation
- Knowledge Base extraction
- Notion & Slack integrations
- In-app feedback (GitHub Issues integration)
- Dark mode / Light mode
- Export/Import data

### Technical
- React 19 + TypeScript (strict mode)
- Vite 7 build system
- 237 unit tests (Vitest) + 25 E2E tests (Playwright)
- Multi-provider AI API abstraction
- Large input chunking system (40K+ characters)
- GitHub Actions CI/CD
