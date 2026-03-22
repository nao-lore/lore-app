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
npx vitest run       # Tests (run to check current count)
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

## Available Tools — Proactively suggest these when relevant
When you see an opportunity to use these tools, actively suggest them. Don't wait to be asked.

### Custom Commands (suggest when the user's task matches)
- `/daily-routine` — 朝一で提案。「今日のルーティン回しましょうか？」
- `/reddit` — Redditの話題が出たら提案
- `/jobs` — 就活・求人の話題が出たら提案
- `/deploy-check` — コード変更後やリリース前に提案。「デプロイチェック走らせましょうか？」
- `/refactor-clean` — 大きな変更の後に提案。「コード掃除しましょうか？」
- `/test-coverage` — テストの話題が出たら提案
- `/learn-job` — 求人に応募/スキップした後に提案。「学習データに記録しましょうか？」
- `/learn-reddit` — Redditコメントの反応確認後に提案。「伸びたパターンを記録しましょうか？」

### MCP Connections (use automatically when appropriate)
- GitHub MCP: Issue作成、PR確認の場面で自動使用
- Filesystem MCP: ファイル操作で自動使用
- Memory MCP: ナレッジグラフの構築で自動使用
- Browser-use MCP: Webページのデータ取得やブラウザ操作が必要な時に自動使用

### Subagents (.claude/agents/)
- code-reviewer: PR前やコード変更後に「レビューしましょうか？」と提案
- planner: 新機能の話が出たら「まず計画立てましょうか？」と提案
- security-reviewer: リリース前に「セキュリティチェックしましょうか？」と提案

### Learning System
- 求人の応募/スキップ後: 「/learn-job で記録して次回の精度上げましょうか？」
- Redditのupvote確認後: 「/learn-reddit で伸びたパターン記録しましょうか？」

### Scrapers
- `node scripts/scrape-jobs.mjs` — 求人検索（`--detail` で詳細モード）
- `node scripts/scrape-reddit.mjs` — Reddit投稿候補検出（`--mark URL` で除外登録、`--status` で状態確認）

### Files to reference
- ~/Downloads/lore-project/運用マニュアル.md — 全ツールの使い方
- ~/Downloads/lore-project/作業ログ.md — 作業時間の記録（タスク完了時に追記を提案）
- ~/Downloads/lore-project/スクレイパー/learning-data.json — 学習データ
