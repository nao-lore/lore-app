# Dexter - 金融リサーチ自律エージェント調査

調査日: 2026-03-26

## 概要

Dexterは、複雑な金融リサーチを自律的に実行するOSSエージェント。
作者はVirat Singh（GitHub: virattt）。MITライセンス。

- リポジトリ: https://github.com/virattt/dexter
- 言語: TypeScript（99.3%）
- ランタイム: Bun v1.0+
- UI: React + Ink（ターミナルCLI）
- オーケストレーション: LangChain.js

## できること

- **財務データ取得**: 損益計算書、貸借対照表、キャッシュフロー計算書（年次/四半期/TTM）
- **SEC Filing読み取り**: 10-K、10-Q、8-K文書の解析
- **ウェブ検索**: Exa API経由で一般的なWeb情報収集
- **ブラウザスクレイピング**: Playwrightベースのウェブスクレイピング
- **自律的リサーチ**: 質問を分解→データ収集→検証→回答を自動実行
- **WhatsApp連携**: 自分のWhatsAppチャットから質問→自動応答

## 4エージェント・アーキテクチャ

```
ユーザーの質問
    ↓
[1. Planning Agent] - 質問をステップバイステップの研究計画に分解
    ↓
[2. Action Agent]   - ツールを選択・実行し、リアルタイムデータを取得
    ↓
[3. Validation Agent] - 出力の正確性・一貫性・論理的整合性を検証
    ↓
[4. Answer Agent]   - 検証済みの結果を統合し最終回答を生成
```

### 安全機構
- ループ検出: 無限ループを自動防止
- ステップ制限: グローバル最大20ステップ、タスクあたり最大5ステップ
- スクラッチパッド: `.dexter/scratchpad/` にJSONL形式で全ツール呼び出しを記録

## 必要な前提条件

### 必須APIキー
| API | 用途 | 備考 |
|-----|------|------|
| OpenAI API | LLM推論 | GPT-4推奨 |
| Financial Datasets API | 財務データ取得 | financialdatasets.ai |

### オプションAPIキー
| API | 用途 |
|-----|------|
| Anthropic API | Claude使用時 |
| Google API | Gemini使用時 |
| xAI API | Grok使用時 |
| Exa API | ウェブ検索機能 |
| Ollama | ローカルLLM実行（APIキー不要） |
| LangSmith | 評価・トレース |

## コスト構造

### LLMコスト
- GPT-4使用時: 1クエリあたり $0.10〜$0.50
- GPT-3.5-turbo使用時: 1クエリあたり数セント
- Ollama（ローカル）: 無料

### Financial Datasets API コスト
- **無料銘柄**: AAPL（Apple）、NVDA（Nvidia）、MSFT（Microsoft）の3銘柄のみ
- **Pay-as-you-go**: Earningsリクエスト $0.00/件、株価 $0.01/件、全財務諸表 $0.10/件
- **Developerプラン**: $200/月（1000 req/min、30年分データ、全銘柄）
- **Proプラン**: $2,000/月（無制限、暗号資産データ含む、再配布ライセンス）

## 無料で使える範囲（現実的な評価）

- **完全無料で試せる範囲**: AAPL/NVDA/MSFTの3銘柄 + Ollamaローカルモデル
- **実用的な最低コスト**: OpenAI APIの従量課金（数ドル〜）+ Financial Datasets Pay-as-you-go
- **日本株は非対応**: Financial Datasets APIは米国株中心。日本株分析には別データソースが必要

## セットアップ

```bash
git clone https://github.com/virattt/dexter.git
cd dexter
bun install
cp env.example .env
# .envにAPIキーを記入
bun start        # 対話モード
bun dev          # 開発モード（ホットリロード）
```

## 評価・テスト

```bash
bun run src/evals/run.ts --sample 10  # 10問ランダムサンプルで評価実行
```

## 所感

### 強み
- アーキテクチャが明確（4エージェント構成 + バリデーション）
- MITライセンスで自由に改変可能
- TypeScript/Bunで比較的モダンなスタック
- WhatsApp連携は面白いユースケース

### 弱み・注意点
- Financial Datasets APIが有料前提（無料は3銘柄のみ）
- 日本株には使えない（米国株データソースのみ）
- LLMコストが別途かかる
- 実運用には月$200〜のAPIコストが現実的

### 活用可能性
- 米国株の財務分析ツールとして個人利用可能（3銘柄無料枠で試用）
- アーキテクチャ（計画→実行→検証→回答）は他の自律エージェント開発の参考になる
- データソースを差し替えれば日本株対応も理論上可能

## 参考リンク
- [GitHub リポジトリ](https://github.com/virattt/dexter)
- [YUV.AI 解説記事](https://yuv.ai/blog/dexter)
- [ScriptByAI 解説](https://www.scriptbyai.com/autonomous-financial-research-agent-dexter/)
- [Financial Datasets API 料金](https://www.financialdatasets.ai/pricing)
