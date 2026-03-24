毎日のルーティンタスクを実行してください。

**重要: スクレイパー（Step 0a, 1, 2）は必ず逐次実行。前のスクレイパーが完全に終了してから次を開始すること。並列実行禁止（ブラウザ負荷が高すぎるため）。**

## Step 0a: クラウドソーシング
1. `cd ~/influencer-research/crowdsourcing-work && python3 main.py` を実行
2. 結果を簡潔に報告（🤖scrape_ok件数、新着件数、おすすめを表示）
3. **完了を待ってから次のStepに進む**

## Step 0b: 昨日の振り返り（自動学習）
1. `node scripts/scrape-reddit.mjs --status` で昨日のRedditコメントの状態を確認
   - 投稿済みのコメントがあれば「昨日のコメント、upvoteどうでした？」と聞く
   - ユーザーが反応を教えてくれたら `/learn-reddit` を自動実行（聞かずにやる）
   - 未投稿のコメントがあれば「昨日の分まだ投稿してない？今日投稿する？」と確認

## Step 1: 今日のRedditコメント生成
1. `~/Downloads/lore-project/スクレイパー/learning-data.json` を読んで過去の伸びたパターンを分析
2. `node scripts/scrape-reddit.mjs` でスレッド候補を取得（**Step 0aのCWスクレイパー完了後**）
3. `commands/reddit/tone-guide.md` を参照
4. 上位3件を選んでコメント生成（learning-dataの分析結果を反映）
5. コメントファイルのパスを表示
6. **完了を待ってから次のStepに進む**

## Step 2: 求人チェック
1. `node scripts/scrape-jobs.mjs` を実行（**Step 1のRedditスクレイパー完了後**）
   - TOP PICKSと新着求人を表示

## Step 3: 発信タスク
1. 今日のXツイート案を1つ提案（リンクなし、自然な開発者ツイート）

## Step 3.5: メモ・発見から1つ提案
1. SESSION.mdの「📝 メモ・発見・実験（未処理のみ）」を読む
2. 今日実行できそうなものがあれば1つだけ提案する（「これ今日やりますか？」程度）
3. なければスキップ

## Step 4: サマリー
今日やることを一覧で表示（SESSION.mdの「今日やること」ベース）
