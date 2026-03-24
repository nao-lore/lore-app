コードベースをクリーンアップしてください。

1. 未使用のimportを削除
2. 未使用の変数・関数を検出して削除
3. console.logが残っていたら削除
4. `npx tsc --noEmit` でエラーがないか確認
5. `npx vitest run` でテストが全てパスするか確認
6. 変更があればgit diffで差分を表示
