求人の学習データを更新してください。

使い方: /learn-job [応募|スキップ] [会社名] [理由]

1. ~/Downloads/lore-project/スクレイパー/learning-data.json を読み込む
2. ユーザーの判断（応募 or スキップ）と理由を記録する
3. 応募した場合:
   - appliedCompaniesに会社名を追加
   - その求人に含まれるキーワードをgoodKeywordsに追加（重複排除）
4. スキップした場合:
   - skippedCompaniesに会社名を追加
   - スキップ理由に含まれるキーワードをbadKeywordsに追加
5. learning-data.jsonを更新保存
6. 「次回の求人検索でこの学習が反映されます」と表示

これにより、求人スクレイパーのスコアリングが使うほど精度が上がる。
