# Composio Agent Orchestrator 導入手順

## 概要

ComposioHQ製のOSSツール。複数のAIコーディングエージェント（Claude Code, Codex, Aider等）を並列で動かし、それぞれに独立したgit worktree・ブランチ・PRを割り当てて自動管理する。CI失敗時の自動修正、レビューコメントへの自動対応も行う。

- リポジトリ: https://github.com/ComposioHQ/agent-orchestrator
- ライセンス: MIT

## 前提条件

### 必須

| ツール | バージョン | インストール |
|--------|-----------|-------------|
| Node.js | 20+ | nodejs.org |
| Git | 2.25+ | git-scm.com |
| tmux | - | `brew install tmux` |
| GitHub CLI | - | cli.github.com → `gh auth login` |

### オプション

- Linear API Key: Linear連携する場合 → `export LINEAR_API_KEY="lin_api_..."`
- Slack Webhook URL: Slack通知する場合 → `export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."`

## インストール

### npm（推奨）

```bash
npm install -g @composio/ao
ao --version
```

### ソースから

```bash
git clone https://github.com/ComposioHQ/agent-orchestrator.git
cd agent-orchestrator && bash scripts/setup.sh
ao --version
```

## 基本的な使い方

### 起動

```bash
# リモートリポジトリから
ao start https://github.com/your-org/your-repo

# ローカルリポジトリから
cd ~/your-project && ao start

# 別プロジェクトを追加
ao start ~/path/to/another-repo
```

起動するとダッシュボードが `http://localhost:3000` で立ち上がる。

### ヘルスチェック

```bash
ao doctor        # 環境チェック
ao doctor --fix  # 自動修正
```

### アップデート

```bash
ao update
```

## ワークフロー（5ステップ）

1. `ao start` でダッシュボードとオーケストレーターエージェントが起動
2. オーケストレーターがタスクごとに独立したworktreeでワーカーエージェントを生成
3. 各エージェントが自律的にコード分析・テスト作成・PR作成
4. CI失敗やレビューコメントが自動的に該当エージェントにルーティング
5. マージ等の最終判断は人間が行う

## 設定ファイル（agent-orchestrator.yaml）

`ao start` で自動生成される。手動カスタマイズ例:

```yaml
port: 3000

defaults:
  runtime: tmux          # tmux / docker / k8s / process
  agent: claude-code     # claude-code / codex / aider / opencode
  workspace: worktree    # worktree / clone
  notifiers: [desktop]   # desktop / slack / composio / webhook

projects:
  my-app:
    repo: owner/my-app
    path: ~/my-app
    defaultBranch: main
    sessionPrefix: app

# 自動対応ルール
reactions:
  ci-failed:
    auto: true
    action: send-to-agent
    retries: 2
  changes-requested:
    auto: true
    action: send-to-agent
    escalateAfter: 30m
  approved-and-green:
    auto: false
    action: notify
```

## プラグインシステム（8スロット）

| スロット | デフォルト | 選択肢 |
|---------|-----------|--------|
| Runtime | tmux | docker, k8s, process, ssh, e2b |
| Agent | claude-code | codex, aider, opencode, goose |
| Workspace | worktree | clone, copy |
| Tracker | github | linear, jira |
| SCM | github | (GitLab, Bitbucket予定) |
| Notifier | desktop | slack, discord, webhook, email |
| Terminal | iterm2 | web |
| Lifecycle | core | - |

## Claude Codeとの連携

Claude Codeがデフォルトのエージェント。特別な設定不要で動く。

```yaml
defaults:
  agent: claude-code
```

エージェントへのルール指定:

```yaml
agentRules: |
  Always run tests before pushing.
  Use conventional commits.
# または外部ファイル参照
agentRulesFile: .agent-rules.md
```

## 通知ルーティング

```yaml
notificationRouting:
  urgent: [desktop, slack]   # エージェントがスタックした時
  action: [desktop, slack]   # PRマージ準備完了
  warning: [slack]           # 自動修正失敗
  info: [slack]              # サマリー完了
```

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| "No config found" | `ao start` で自動生成 |
| "tmux not found" | `brew install tmux` |
| "gh auth failed" | `gh auth login` |
| "Port already in use" | ao startが自動で空きポートを探す |
| "Node version too old" | Node 20+にアップグレード |

## クイックスタート手順（まとめ）

```bash
# 1. 前提ツール確認
node --version   # 20+
git --version    # 2.25+
tmux -V
gh auth status

# 2. インストール
npm install -g @composio/ao

# 3. 起動
cd ~/your-project
ao start

# 4. ダッシュボードで監視
# http://localhost:3000
```
