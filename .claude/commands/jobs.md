求人スクレイパーを実行して、AI判定まで一気通貫で行ってください。

1. `node scripts/scrape-jobs.mjs --detail` を実行（バックグラウンド）
   - 9サイト横断: Green, Wantedly, 求人ボックス, YOUTRUST, エン転職, マイナビ, HERP, Findy, Offers
   - 口コミ自動取得（上位30件）
   - AI判定待ちデータを pending-ai-judge.json に保存

2. スクレイパー完了後、`pending-ai-judge.json` を読んで各求人をAI判定:
   - A/B/C/SKIP + SES判定
   - 判定基準は /judge-jobs コマンドと同じ

3. 結果を一覧表で表示
4. A判定企業を応募先リストに追記
