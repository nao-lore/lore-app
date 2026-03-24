Redditコメントの学習データを更新してください。

使い方: /learn-reddit [スレッドタイトルの一部] [upvote数]

1. ~/Downloads/lore-project/スクレイパー/learning-data.json を読み込む
2. reddit-commented-urls.txt から該当スレッドを特定
3. 対応するコメントファイル（reddit-comment-N.txt）を読む
4. upvote数に応じて分類:
   - 5以上 → highPerformanceに追加（コメントの特徴を抽出: 長さ、構造、トピック）
   - 1以下 → lowPerformanceに追加
5. highPerformanceのパターンをeffectivePatternsに要約
6. lowPerformanceのパターンをavoidPatternsに要約
7. learning-data.jsonを更新保存

これにより、次回のコメント生成で「伸びるパターン」が優先され、「伸びないパターン」が避けられる。
