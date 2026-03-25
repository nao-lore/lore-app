スクレイパーが保存したAI判定待ちデータを読んで、各求人を判定してください。

1. `~/Downloads/lore-project/スクレイパー/pending-ai-judge.json` を読む
2. 各求人について以下の基準で判定:

プロフィール:
- 22歳、大学中退
- Claude CodeでReact+TS+Vite Webアプリを個人開発（テスト1255件、Chrome拡張、PWA、8言語対応、AI API連携）
- 実務経験ゼロだが個人開発で実務1〜1.5年相当
- スクレイピング(Playwright/Python)、GAS、データ整理が得意
- PHP/Ruby/Flutter/AWS/インフラは不可
- フルリモート必須、正社員希望
- 目標年収4000万（長期）

判定基準:
- A: フルリモート + 自社開発 + 経験ハードル突破可能 + 技術マッチ
- B: 条件の一部が合わないがダメ元で出す価値あり
- C: 条件が合わない（出社必須、経験5年以上、PHP/Ruby必須等）
- SKIP: 完全にミスマッチ（営業職、SES等）
- SES判定: 「還元率」「案件選択」「前給保証」「プロジェクト配属」→ SES

3. 判定結果を一覧表で出力:
   | 判定 | 会社名 | ポジション | 年収 | 理由 | 警告 | URL |

4. A判定の企業を `~/Downloads/lore-project/就活/応募先リスト_A判定_統合版.txt` に追記

5. 判定結果を `~/Downloads/lore-project/スクレイパー/ai-judge-results.json` に保存
