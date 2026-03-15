# Changelog

## [0.1.0] - 2026-03-15

### Added
- Built-in AI API (no API key required, 20 free uses/day)
- Pricing page (Free vs Pro comparison)
- Feature toggles in Settings (7 configurable features)
- Built-in API usage display with progress bar
- Chrome extension store link in onboarding

### Changed
- Onboarding redesigned (API key not required messaging)
- Settings simplified (Gemini only, removed other providers)
- Sidebar collapse rail redesigned (Claude-style)
- Landing page updated (no API key messaging)
- Version bumped to 0.1.0

### Fixed
- Console.log statements guarded for production
- CSS skeleton-shimmer syntax warning
- Chrome extension URL (staging → production)
- Build chunk size optimization
- Accessibility improvements (ARIA labels)

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
