# Lore — PH Launch Master Checklist (4/1)

> 最終更新: 2026-03-19 17:00
> このリストに載っていないタスクはやらない。載っているタスクは全部やる。

---

## 🔴 BLOCKER（今すぐ〜3/22）— ✅ 全完了

### B1. CORS修正 — ✅ `2cb4cab`
### B2. Chrome拡張URL統一 — ✅ `2cb4cab`
### B3. カスタムドメイン取得 — ✅ loresync.dev (Namecheap + Vercel DNS)
### B4. 全URL更新 — ✅ `4621855` + バッチ3,4
### B5. GitHub URL統一 — ✅ `2cb4cab`
### B6. Reddit投稿URL更新 — ✅ `4621855`
### B7. Gemini API有料化 — ✅ Tier 1課金済み
### B8. Stripe redirect URL — ✅ 月額・年額ともloresync.devに変更済み

---

## 🟠 HIGH（3/19〜3/25）

### H1. アナリティクス
- [x] Vercel Analytics 有効化 — `06ea21a`
- [x] UTMパラメータ準備 — `1154bef` (sessionStorageに保存)
- [x] Web Vitals計測 — `f10886a` (FCP/LCP/CLS/INP → Vercel Analytics)
- [ ] **Google Analytics 4 アカウント作成** ← 外部作業
- [ ] GA4 タグをアプリ + LPに埋め込み
- [ ] コンバージョンイベント設定（スナップショット完了、Pro購入クリック等）

### H2. OGP / SEO
- [x] LP favicon追加 — バッチ3
- [x] LP robots.txt / sitemap.xml — バッチ3
- [x] 全OGP URLをloresync.devに統一 — バッチ3,4
- [ ] **Twitter Card Validator で実機確認** ← 外部作業
- [ ] **Facebook Sharing Debugger で確認** ← 外部作業

### H3. PHコミュニティ活動（今日から毎日）
- [x] PHアカウント作成
- [x] プロフィール完成
- [ ] **毎日2-3個のプロダクトにコメント** → 4/1までに25+コメント目標

### H4. X (Twitter) 準備
- [ ] **アカウント決定（公式 or 個人）** ← 要決定
- [ ] プロフィール設定
- [ ] Build in Public 投稿開始（1日1投稿目標）

### H5. FAQ 準備 — ✅ 完成済み（このドキュメント内 + docs/)

### H6. README.md 整備
- [x] URL統一確認 — バッチ2
- [x] リンクテキスト修正 — バッチ2
- [ ] **スクリーンショット撮り直し（loresync.dev表示状態で）** ← 外部作業
- [ ] 機能一覧を最新に
- [ ] "Built with Claude Code" バッジ追加検討

### H7. Sentry アラート設定
- [ ] **Sentry Dashboard → Alerts → Create Alert Rule** ← 外部作業（5分）
- [ ] 条件: 10分間に5件以上のエラー → メール通知

### H8. メール配信ツール
- [ ] **Buttondown or Resend 登録** ← 外部作業
- [ ] Formspreeの登録者メールをエクスポート
- [ ] PHローンチ告知メール下書き

### H9. 画像最適化
- [x] hero-screenshot WebP変換 (504KB→145KB) — `bab52ab`
- [x] `<picture>` タグでWebP + PNG fallback — `bab52ab`
- [ ] **PH用スクリーンショットをloresync.devで撮影** ← 外部作業

### H10. 重複Vercelプロジェクト削除
- [ ] **`lore-app-r5dl` を削除** ← 外部作業（1分）

### H11. Vercel プラン確認
- [ ] **Hobby→Pro検討** ← 要判断

---

## 🟡 MEDIUM（3/20〜3/28）

### M1. コード品質 — ✅ 全完了
- [x] API入力サイズ制限 — `1154bef`
- [x] streaming reader.read() try-catch — `bab52ab`
- [x] loadDemoData() .catch() — `bab52ab`
- [x] lore-storage-full リスナー — 既存実装確認済み
- [x] beforeunload 警告 — `bab52ab`
- [x] unhandledrejection リスナー — `bab52ab`

### M2. テスティモニアル
- [ ] **Reddit好意的コメントにDMでテスティモニアル依頼** ← 外部作業
- [ ] 2-3件確保
- [ ] LPにテスティモニアルセクション追加
- [ ] PH画像素材としても使用

### M3. PH限定特典
- [ ] **特典内容決定（例: Pro 3ヶ月無料）** ← 要決定
- [ ] 運用フロー決定
- [ ] First Comment に特典記載

### M4. 競合回答テンプレ — ✅ 完成済み

### M5. コンテンツ
- [ ] **dev.to に開発ストーリー記事** ← 外部作業
- [ ] **Indie Hackers に投稿** ← 外部作業

### M6. 障害対策
- [ ] **ブックマーク保存（Vercel Status, Google AI Studio）** ← 外部作業（1分）
- [ ] サイトダウン時テンプレ — ✅ このドキュメント内に記載済み
- [ ] ホットフィックスデプロイ手順確認 — ✅ git push → Vercel自動 2-3分

---

## 📋 Reddit ソフトローンチ（3/19〜3/28）

### R1. 投稿
- [x] r/SideProject 投稿 — 3/19 12:00 JST 完了
- [x] VibeCodingList 投稿 — 3/19 完了
- [x] iOS flickeringバグ修正 → ユーザー報告に即対応 — `08167cf`
- [ ] **r/ClaudeAI karma稼ぎ（2-3件の質問に回答）** ← 外部作業
- [ ] r/ClaudeAI 投稿（karma 30+になったら）
- [ ] r/ChatGPT メガスレッドにコメント

### R2. フォローアップ
- [x] コメント返信 — flickeringユーザーに対応済み
- [x] バグ報告即修正 — iOS flickering修正済み
- [ ] **好意的コメントにDMでテスティモニアル依頼** ← 外部作業
- [ ] Reddit反応のスクショ保存（PH素材用）

---

## 📋 PHページ準備（3/25〜3/31）— 未着手（予定通り）

### P1. プロダクトページ
- [ ] プロダクト登録（下書き保存）
- [ ] タグライン最終決定（60字以内）
- [ ] 説明文最終推敲
- [ ] トピックタグ設定
- [ ] 全URLをloresync.devに

### P2. ビジュアル素材
- [ ] サムネイル 240×240
- [ ] ギャラリー画像 3-5枚（1270×760）
- [ ] デモGIF or 動画（30秒以内）

### P3. First Comment
- [ ] 最終版作成
- [ ] PH限定特典記載
- [ ] 会話誘発の質問
- [ ] CTA（loresync.dev + GitHub）

### P4. サポーター
- [ ] ~~友人・知人に事前告知~~ → ソロでOK、プロダクト品質で勝負

---

## 📋 最終チェック（3/29〜3/31）— 未着手（予定通り）

### T1. 動作テスト
- [ ] 新規ユーザーフロー（シークレットモード）
- [ ] Pro購入フロー（Stripeテストモード）
- [ ] Chrome拡張フロー
- [ ] モバイル確認（iOS Safari, Android Chrome）
- [ ] 複数ブラウザ（Chrome, Safari, Firefox, Edge）
- [ ] PWAインストール → オフラインUI確認

### T2. エラーケーステスト
- [ ] API枯渇時メッセージ確認
- [ ] ネットワーク切断時メッセージ確認
- [ ] 超長文入力（500K文字）
- [ ] 空入力での変換ボタン

### T3. インフラ最終確認
- [ ] Sentryエラー確認
- [ ] Vercel Analytics動作確認
- [ ] GA4データ受信確認
- [ ] Gemini API使用量確認
- [ ] SSL有効確認

### T4. 最終デプロイ
- [ ] tsc / vitest / vite build パス
- [ ] git push → Vercel自動デプロイ
- [ ] 本番確認

---

## 📋 4/1 ローンチ当日 — 未着手（予定通り）

### L1. タイムライン（JST）
- [ ] **16:01** — PH公開
- [ ] **16:05** — First Comment 投稿
- [ ] **16:10** — X で告知
- [ ] **16:15** — Reddit で告知
- [ ] **16:20** — メール告知
- [ ] **16:30** — dev.to / Indie Hackers に告知
- [ ] **16:01-18:01** — 全コメントに即レス
- [ ] **18:01-24:00** — 継続対応
- [ ] **翌0:00-11:00** — 米国ピーク時間チェック

### L2. モニタリング
- [ ] Sentry / GA4 / Vercel / Gemini 監視

### L3. トラブル対応
- [ ] バグ即修正 → git push
- [ ] API枯渇案内
- [ ] サイトダウンテンプレ対応

---

## ⚫ 許容するリスク（PH後に対応）

| リスク | 許容理由 |
|--------|----------|
| Pro検証がクライアント側のみ | Supabase導入後に修正 |
| Stripe Webhook未実装 | 同上。手動対応可能 |
| 年額プランも30日expiry | 手動延長で対応 |
| Rate limit が in-memory | Gemini有料化で枯渇リスク緩和 |
| i18nバンドル270KB | 機能に影響なし。PH後に分割 |
| mammoth.js 500KB | lazy loadで初期ロードに影響なし |

---

## 3/19 コード改善セッション成果

18バッチ、21コミットで78問題リストを大幅消化:

| 優先度 | 消化率 |
|--------|--------|
| P0 | 12/12 (100%) |
| P1 | ~21/22 (95%) |
| P2 | ~26/28 (93%) |
| P3 | ~10/16 (63%) |

**最終ビルド: 732テスト、ESLint 0、TSC 0**

主な改善: iOS flickering修正、WebP最適化、a11y強化（reduced-motion/forced-colors/button semantics/aria labels）、CJK Extension B対応、input normalization、OpenAI streaming統一、PWA share_target/Workbox分離/iOS meta、RTL CSS、paragraph splitting、API key統合、useClickOutside共通化、i18n 20+新キー追加

---

## タスク集計（更新）

| カテゴリ | 完了 / 合計 | 状態 |
|----------|-------------|------|
| 🔴 BLOCKER | 35/35 | ✅ 全完了 |
| 🟠 HIGH | ~20/30 | ⚠️ 外部作業残り |
| 🟡 MEDIUM | ~14/20 | ⚠️ 外部作業残り |
| 📋 Reddit | ~6/10 | ⚠️ 継続中 |
| 📋 PH準備 | 0/15 | 🔲 3/25〜予定 |
| 📋 最終チェック | 0/15 | 🔲 3/29〜予定 |
| 📋 当日 | 0/15 | 🔲 4/1 |
| **合計** | **~75/140** | **53%完了** |
