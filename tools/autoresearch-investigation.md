# Karpathy autoresearch 調査レポート

調査日: 2026-03-26
リポジトリ: https://github.com/karpathy/autoresearch

---

## 1. 何をするスクリプトか

autoresearchは「AIエージェントに自律的にML実験を回させる」プロジェクト。

- 小規模LLM（nanochat）のトレーニングを1回5分の固定時間で実行
- AIコーディングエージェント（Claude Code, Codex等）がtrain.pyを自動編集
- val_bpb（validation bits per byte）が改善したら変更を保持、悪化したら破棄
- このループを無限に繰り返す（人間が止めるまで）
- 寝ている間に約100実験（12実験/時）が自動実行される

## 2. アーキテクチャ（自律実験ループ）

### ファイル構成（3ファイルが核心）

| ファイル | 役割 | 編集 |
|----------|------|------|
| `prepare.py` | データ準備、トークナイザー訓練、データローダー、評価関数。固定定数。 | 変更禁止 |
| `train.py` | GPTモデル全体、オプティマイザー（Muon+AdamW）、トレーニングループ。約630行。 | エージェントが編集 |
| `program.md` | エージェントへの指示書（研究方針、ルール、ループ手順）。 | 人間が編集 |

その他: `results.tsv`（実験ログ）、`analysis.ipynb`（分析用）、`pyproject.toml`

### 実験ループの流れ

```
LOOP FOREVER:
  1. gitの現在状態を確認
  2. train.pyに実験的な変更を加える
  3. git commit
  4. `uv run train.py > run.log 2>&1` で5分間トレーニング
  5. `grep "^val_bpb:" run.log` で結果を確認
  6. クラッシュした場合 → tail -n 50 run.log でエラー確認、修正試行
  7. results.tsvに結果を記録
  8. val_bpbが改善 → 変更を保持（ブランチを進める）
  9. val_bpbが悪化 → git resetで巻き戻す
```

### 重要ルール
- train.pyのみ編集可能（prepare.pyは変更禁止）
- 新しいパッケージのインストール禁止
- 評価関数の変更禁止
- 10分超えたらタイムアウト扱い
- 人間に確認を求めず、永遠にループし続ける

## 3. 前提条件

- NVIDIA GPU 1枚（H100でテスト済み）
- Python 3.10以上
- uvパッケージマネージャー
- PyTorch（Flash Attention 3対応のHopper GPUが最適）

### セットアップ手順
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
git clone https://github.com/karpathy/autoresearch.git
cd autoresearch
uv sync
uv run prepare.py  # データダウンロード+トークナイザー訓練（約2分）
uv run train.py    # ベースライン実行（約5分）
```

## 4. カスタマイズ方法

### program.mdの編集
人間が研究方針をprogram.mdに記述し、エージェントはそれに従う。
例: 特定のアーキテクチャ変更を試す、特定のハイパーパラメータ範囲を探索する等。

### 小型GPUでの実行
- TinyStoriesなど低エントロピーデータセットを使用
- vocab_sizeを縮小（8192→1024）
- MAX_SEQ_LENを短縮（256まで可能）
- DEPTHを削減（8→4）
- WINDOW_PATTERNを「L」のみに設定

---

## 5. Claude Codeで再現する方法

### 基本方針

autoresearchのコア設計は「Claude Codeをエージェントとしてループさせる」こと自体が想定されている。
以下の2つのアプローチがある。

### アプローチA: そのまま使う（推奨・GPU必要）

```bash
# 1. セットアップ
git clone https://github.com/karpathy/autoresearch.git
cd autoresearch
uv sync && uv run prepare.py

# 2. Claude Codeで起動
claude --dangerously-skip-permissions
# プロンプト: "program.mdを読んで新しい実験を始めてください"
```

Claude Codeがprogram.mdを読み、自律的にtrain.pyを編集→実行→評価→保持/破棄のループを回す。
`--dangerously-skip-permissions`で全権限を渡すのがポイント（毎回承認が不要になる）。

### アプローチB: パターンを他のタスクに転用

autoresearchの設計パターンは汎用的。任意の「スコアで評価できるタスク」に適用可能。

#### 必要な3要素

1. **固定の評価関数**（prepare.py相当）
   - 変更不可の客観的メトリクス
   - 例: テストスコア、ベンチマーク結果、レスポンス時間

2. **編集対象ファイル**（train.py相当）
   - エージェントが自由に変更できるコード
   - 1ファイルに集約するのが理想

3. **指示書**（program.md相当）
   - 研究方針、制約、ループ手順を記述
   - CLAUDE.mdまたは専用mdファイルとして配置

#### テンプレート構造

```
my-autoresearch/
├── evaluate.py      # 固定の評価関数（変更禁止）
├── target.py        # エージェントが編集するファイル
├── program.md       # エージェントへの指示（CLAUDE.mdに含めてもよい）
├── results.tsv      # 実験ログ（git未追跡）
└── pyproject.toml   # 依存関係
```

#### program.mdテンプレート（Claude Code用）

```markdown
# 自律実験プログラム

## セットアップ
1. このリポジトリのファイルをすべて読む
2. `git checkout -b experiment/<tag>`
3. ベースラインを実行して記録

## 実験ループ（永遠に繰り返す）
1. target.pyに変更を加える
2. git commit
3. `python evaluate.py > run.log 2>&1`
4. 結果を確認: `grep "^score:" run.log`
5. スコアが改善 → 保持
6. スコアが悪化 → `git reset --hard HEAD~1`
7. results.tsvに記録
8. 次の実験へ（人間に確認を求めない）

## 制約
- evaluate.pyは変更禁止
- 新しいパッケージのインストール禁止
- 10分超えたらタイムアウト
```

### アプローチBの応用例

| ドメイン | evaluate.py | target.py | メトリクス |
|----------|-------------|-----------|------------|
| Webスクレイパー最適化 | ベンチマークサイトへのスクレイピング速度測定 | scraper.py | 件数/秒 |
| プロンプト最適化 | LLM出力の品質スコア計算 | prompts.py | 精度 |
| アルゴリズム最適化 | テストケース実行 | solution.py | 実行時間 |
| CSS/UIチューニング | Lighthouse等のスコア測定 | styles.css | パフォーマンススコア |

---

## 6. 所感・注意点

- GPU（できればH100）が必須。CPUやMac GPUでは実用的でない
- autoresearchの真価は「パターン」にある。固定評価+自由編集+無限ループという設計は汎用的
- Karpathyは次のステップとして「SETI@homeスタイルの分散協調エージェント」を構想している
- MITライセンスで商用利用可能
- 2026年3月7日公開、数日で21,000+ GitHub stars

---

Sources:
- [GitHub - karpathy/autoresearch](https://github.com/karpathy/autoresearch)
- [Karpathy on X - 分散協調構想](https://x.com/karpathy/status/2030705271627284816)
- [VentureBeat記事](https://venturebeat.com/technology/andrej-karpathys-new-open-source-autoresearch-lets-you-run-hundreds-of-ai)
- [DataCamp ガイド](https://www.datacamp.com/tutorial/guide-to-autoresearch)
- [Medium ガイド](https://medium.com/modelmind/getting-started-with-andrej-karpathys-autoresearch-full-guide-c2f3a80b9ce6)
