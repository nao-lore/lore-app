# Lore — Project Context for Claude

## Session Handoff (最重要)
セッション開始時は必ず memory/session_protocol.md に従うこと。
1. まず `date '+%Y-%m-%d %H:%M %Z'` で現在日時を取得
2. ~/Downloads/lore-project/SESSION.md を読む
3. session_protocol.md の Step 2 に従って状況報告
就活タスクを省略してLoreタスクだけ提示することは禁止。
job-search-plan.md をそのまま提示することも禁止（SESSION.mdが正）。

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

## Verification Gate
コード変更後に「動くはず」「問題ないはず」は禁止。必ず証拠を示すこと:
1. `npx tsc --noEmit` の出力を貼る
2. `npx vitest run` の出力を貼る
3. 変更がテスト実行後に発生した場合は再テスト必須
「shouldは証拠ではない」— 検証なしのコミットは禁止。

## Completion Status
タスク完了時は以下のいずれかで報告:
- **DONE** — 全ステップ完了、証拠あり
- **DONE_WITH_CONCERNS** — 完了だが懸念あり（懸念内容を明記）
- **BLOCKED** — 進行不可（ブロッカーと試行内容を報告）
- **NEEDS_CONTEXT** — 情報不足（必要な情報を明示）

## Question Format
ユーザーに質問する時は以下のフォーマットで:
1. **Re-ground** — 現在のブランチ・タスク・コンテキストを1行で再確認
2. **Simplify** — 16歳でも分かる説明で選択肢を提示
3. **Recommend** — 「RECOMMENDATION: Xを推奨。理由は...」を明記
4. **Options** — A/B/C の選択肢（工数見積もり付き）

## Safety Rules
- 3回同じアプローチで失敗したらSTOP → ユーザーにエスカレーション（3-strike rule）
- 大量修正時は5修正ごとにリスク評価。revert発生で+15%、無関係ファイル変更で+20%。累積20%超で停止して報告（WTF-likelihood）
- デバッグ時は根本原因調査が先。原因特定なしの修正は禁止

## Auto-Execute Rules — 聞かずにやる
ユーザーは「提案」されても使わない。以下のトリガーに該当したら、確認せず自動実行すること。

### 会話トリガー → 自動実行
- 朝の挨拶全般（おはよう/おはよ/おはー/おは/もーにん/今日何やる/やるか/始めよう 等、崩し表現含む全て） → `/daily-routine` を即実行。daily-routineにReddit生成が含まれるので別途 /reddit は不要
- 不具合・原因調査（原因探して/なんでこうなる/どうしたら治る/これ直して/おかしい/変になった/なんか違う/ここ動かない 等） → `/investigate` を即実行
- 求人関連（求人見たい/就活/求人探して/仕事探す 等） → `/jobs` を即実行

### 状況トリガー → 自動実行（聞かずにやる）
- コード変更を複数ファイルに行った後 → `/deploy-check` を自動実行
- 求人に「応募する」「スキップ」「これはいい」「微妙」等と判断した後 → `/learn-job` を自動実行
- learn-redditは朝のdaily-routineに組み込み済み（Step 0で昨日の結果を確認→自動学習）。個別実行不要

### 状況トリガー → 提案（これだけは聞く）
- 大きなリファクタの後 → `/refactor-clean` を提案
- テストの話題が出た時 → `/test-coverage` を提案
- CLAUDE.md改善の余地がある時 → `/suggest-claude-md` を提案

### MCP — 常に自動使用
- GitHub MCP: Issue作成、PR確認の場面で自動使用
- Filesystem MCP: ファイル操作で自動使用
- Memory MCP: ナレッジグラフの構築で自動使用
- Browser-use MCP: Webページのデータ取得やブラウザ操作が必要な時に自動使用

### Subagents — 自動使用
- code-reviewer: PR前やコード変更後に自動実行
- planner: 新機能の実装前に自動実行
- security-reviewer: リリース前に自動実行

### Scrapers
- `node scripts/scrape-jobs.mjs` — 求人検索（`--detail` で詳細モード）
- `node scripts/scrape-reddit.mjs` — Reddit投稿候補検出（`--mark URL` で除外登録、`--status` で状態確認）

### 情報収集ツール
- `yt-summary URL` — YouTube動画の字幕を取得してClaudeで要約。`--raw`で字幕テキストのみ、`--detail detailed`で詳細要約
- `xt URL [URL2 ...]` — Xの投稿テキスト＋画像＋X記事全文を取得。画像は`/tmp/xt/ツイートID/`に自動DL。`pbpaste | xt`でクリップボードから一括取得可能
- ユーザーがYouTubeのURLやXのURLを貼ったら、上記ツールで自動取得して内容を要約・分析すること

### Files to reference
- ~/Downloads/lore-project/運用マニュアル.md — 全ツールの使い方
- ~/Downloads/lore-project/作業ログ.md — 作業時間の記録（タスク完了時に追記を提案）
- ~/Downloads/lore-project/スクレイパー/learning-data.json — 学習データ
