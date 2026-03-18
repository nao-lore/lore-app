# Lore — Project Context for Claude

## What is Lore?
Lore is a PWA that transforms AI conversation histories into structured project context (handoffs, worklogs, TODOs). Built with React + TypeScript + Vite.

## Architecture
- `src/` — React SPA (no backend, localStorage + IndexedDB)
- `src/storage/` — 6 domain modules (core, logs, todos, projects, masterNotes, settings)
- `src/hooks/` — 8 custom hooks (useTransform, useNavigation, useDataStore, etc.)
- `src/components/` — 18 extracted sub-components
- `src/utils/` — 7 utility modules (clipboard, downloadFile, staleness, fuzzyDedup, jsonRepair, etc.)
- `src/transform.ts` + `src/chunkEngine.ts` — AI processing pipeline
- `src/prompts.ts` — All AI prompts centralized (single-call + chunk prompts)
- `src/i18n.ts` — 8 languages bundled (~238KB)

## Commands
```bash
npm run dev          # Dev server
npx tsc --noEmit     # Type check
npx vitest run       # Tests (551+)
npx vite build       # Production build
npx eslint src/      # Lint (target: 0 errors)
```

## Code Conventions
- User-facing text: Always use `t('key', lang)` / `tf('key', lang, ...args)` from `src/i18n.ts`
- New i18n keys: Add for ALL 8 languages (ja, en, es, fr, de, zh, ko, pt)
- Terminology: User-facing "Snapshot" (not "Handoff"). Internal code keeps `handoff`
- Inline styles: Prefer CSS classes in `src/index.css`. Keep inline only for dynamic values (ternaries, variables)
- Components: Use `memo()` for leaf components. Extract components when >300 lines
- Storage: Never call localStorage directly — use `safeGetItem`/`safeSetItem` from `src/storage/core`
- AI responses: Validate with Zod schemas (`src/schemas.ts`), use `AIError` class for errors
- Tests: vitest, aim for 500+. Mock localStorage in storage tests
- Accessibility: Use semantic HTML (button not span for clickable), `role`/`aria-*` attributes, `forced-colors` support
- Imports: Use relative paths. Utils from `./utils/`, hooks from `./hooks/`

## Don't
- Don't add `eslint-disable` comments — fix the actual issue
- Don't use `as any` — add proper types or use type guards
- Don't duplicate utility functions — check `src/utils/` first
- Don't hardcode text — use i18n
- Don't forget to run `npx tsc --noEmit` before committing
