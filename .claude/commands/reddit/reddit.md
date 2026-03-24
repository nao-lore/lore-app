Redditスクレイパーを実行して、投稿すべきスレッドとコメントを生成してください。

## 手順

### Step 1: 学習データの分析
`~/Downloads/lore-project/スクレイパー/learning-data.json` を読み込み、`redditLearning` セクションを確認する。
- `highPerformance` — 過去に伸びたコメントの特徴
- `lowPerformance` — 伸びなかったコメントの特徴
- `effectivePatterns` — 抽出済みの効果的パターン
- `avoidPatterns` — 避けるべきパターン

データがある場合、これらのパターンをコメント生成に反映する。データが空の場合はスキップして Step 2 へ。

### Step 2: スクレイパー実行
```bash
node scripts/scrape-reddit.mjs
```

### Step 3: スレッド選定
結果を確認して、スコアが高い順に **3件** 選ぶ。選定基準:
- upvote数とコメント数のバランス（コメント少なめ = 目立ちやすい）
- 自分の体験と絡めやすいトピックか
- 既にコメントが飽和していないか

### Step 4: コメント生成
各スレッドに対してコメントを生成する。

**必ず `tone-guide.md` のルールに従うこと。**

Step 1 で分析した学習データのパターンを反映:
- `effectivePatterns` に合致する書き方を優先
- `avoidPatterns` に該当する書き方を避ける

### Step 5: 出力
各コメントについて以下を表示:
- スレッドタイトルとURL
- コメントファイルのパス
- 生成したコメント本文

**重要: 各コメントファイルにはTARGET URL・スレッドタイトル・サブレのヘッダーが含まれている。投稿時は「---COMMENT BELOW---」の下だけをコピペすること。URLとコメントの対応を必ず確認してから投稿すること。**

### Step 6: リマインド
コメント投稿後のアクション:
1. `node scripts/scrape-reddit.mjs --mark URL` で投稿済み記録
2. 数時間後に upvote を確認して `/learn-reddit` で学習データに記録する
   → これにより次回のコメント精度が上がる
