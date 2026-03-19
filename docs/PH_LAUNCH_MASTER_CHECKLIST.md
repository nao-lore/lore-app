# Lore — PH Launch Master Checklist (4/1)

> 最終更新: 2026-03-19 19:00
> このリストに載っていないタスクはやらない。載っているタスクは全部やる。

---

## 🔴 BLOCKER — ✅ 全完了

### B1. CORS修正 — ✅ `2cb4cab`
### B2. Chrome拡張URL統一 — ✅ `2cb4cab`
### B3. カスタムドメイン取得 — ✅ loresync.dev
### B4. 全URL更新 — ✅ `4621855` + バッチ3,4
### B5. GitHub URL統一 — ✅ `2cb4cab`
### B6. Reddit投稿URL更新 — ✅ `4621855`
### B7. Gemini API有料化 — ✅ Tier 1課金済み
### B8. Stripe redirect URL — ✅ 両方loresync.devに変更済み

---

## 🟠 HIGH — ほぼ完了

### H1. アナリティクス — ✅ 全完了
- [x] Vercel Analytics 有効化 — `06ea21a`
- [x] UTMパラメータ準備 — `1154bef`
- [x] Web Vitals計測 — `f10886a`
- [x] GA4 アカウント作成 + タグ埋め込み（アプリ+LP） — `5257e5a`, `a01f218`
- [x] CSP更新（GA4/Vercel Analyticsドメイン許可） — `a01f218`
- [x] GA4コンバージョンイベント（snapshot_created, pro_click, extension_click） — `4d818c8`
- [x] 全CTA/投稿文にUTMパラメータ — `a01f218`

### H2. OGP / SEO — コード完了、実機確認のみ残り
- [x] LP favicon追加
- [x] LP robots.txt / sitemap.xml
- [x] 全OGP URLをloresync.devに統一
- [ ] **Twitter Card Validator で実機確認** ← 外部（3/20〜）
- [ ] **Facebook Sharing Debugger で確認** ← 外部（3/20〜）

### H3. PHコミュニティ活動 — 継続中
- [x] PHアカウント作成
- [x] プロフィール完成
- [x] 3/19: 3件コメント完了（OpenObserve, Claude Dispatch, Permit.io）
- [ ] **毎日2-3件コメント継続** → 4/1までに25+コメント目標

### H4. X (Twitter) — ゴーストバン解除待ち
- [x] アカウント存在: @nao_lore_
- [x] bio更新、宣伝投稿削除
- [ ] **ゴーストバン解除待ち（2-3日）** → 解除後にBuild in Public開始

### H5. FAQ 準備 — ✅ 全完了
- [x] docs内FAQ完成済み
- [x] アプリ内FAQ 6問追加（全8言語） — `2b40fac`

### H6. README.md 整備
- [x] URL統一確認
- [x] リンクテキスト修正
- [ ] **スクリーンショット撮り直し** ← 外部（3/26）

### H7. Sentry アラート設定 — ✅ 完了
- [x] 10分間5件以上 → メール通知

### H8. メール配信ツール — 下書き完了、ツール登録のみ
- [x] ローンチメール下書き — `docs/ph-launch-email.md`
- [ ] **Buttondown or Resend 登録** ← 外部（3/24）
- [ ] Formspreeメールエクスポート → インポート

### H9. 画像最適化 — ✅ コード完了
- [x] hero-screenshot WebP変換 — `bab52ab`
- [x] `<picture>` タグ — `bab52ab`
- [ ] **PH用スクリーンショット撮影** ← 外部（3/26）

### H10. 重複Vercelプロジェクト削除 — ✅ 完了

### H11. Vercel プラン確認
- [ ] **Hobby→Pro検討** ← 要判断（3/20〜）

---

## 🟡 MEDIUM — ほぼ完了

### M1. コード品質 — ✅ 全完了（6/6項目）
### M2. テスティモニアル — Reddit反応待ち
- [ ] **好意的コメントにDMでテスティモニアル依頼** ← 外部
- [ ] LPにテスティモニアルセクション追加（確保後）

### M3. PH限定特典 — ✅ 決定済み
- [x] Pro 3ヶ月無料（First Commentに記載済み）

### M4. 競合回答テンプレ — ✅ 完了
- [x] 7件のテンプレ — `docs/competitive-responses.md`

### M5. コンテンツ — ✅ 下書き完了
- [x] dev.to記事下書き — `docs/devto-article.md`
- [ ] **レビュー＆公開** ← 外部（3/22〜23）
- [ ] **Indie Hackers投稿** ← 外部（3/23）

### M6. 障害対策 — ✅ 完了
- [x] 障害テンプレ — `docs/incident-templates.md`
- [ ] **ブックマーク保存（Vercel Status, Google AI Studio）** ← 外部（1分）

---

## 📋 Reddit ソフトローンチ — 継続中

### R1. 投稿
- [x] r/SideProject投稿（3/19 12:00 JST）
- [x] VibeCodingList投稿
- [x] r/ClaudeAI投稿文下書き — `docs/reddit-claudeai-post.md`
- [ ] **r/ClaudeAI karma稼ぎ** ← 外部（3/21〜）
- [ ] **r/ClaudeAI投稿（karma 30+で）** ← 外部
- [ ] **r/ChatGPTメガスレッド** ← 外部

### R2. フォローアップ
- [x] flickeringバグ修正＆返信済み
- [ ] **テスティモニアル依頼** ← 外部
- [ ] **Reddit反応スクショ保存** ← 外部

---

## 📋 PHページ準備（3/25〜3/31）— コンテンツ前倒し完了

### P1. プロダクトページ — 下書き素材完成
- [x] タグライン候補10個 — `docs/ph-tagline-options.md`
- [x] 説明文 — `docs/ph-description.md`
- [ ] **PHにプロダクト登録（下書き保存）** ← 外部（3/25）
- [ ] トピックタグ設定

### P2. ビジュアル素材 — 外部作業
- [ ] **サムネイル 240×240** ← 外部（3/26）
- [ ] **ギャラリー画像 3-5枚（1270×760）** ← 外部（3/26）
- [ ] **デモGIF or 動画（30秒）** ← 外部（3/27）

### P3. First Comment — ✅ 下書き完成
- [x] 最終版 — `docs/ph-first-comment.md`
- [x] PH限定特典記載済み（Pro 3ヶ月無料）

### P4. サポーター
- [x] ソロでOK、プロダクト品質で勝負

---

## 📋 最終チェック（3/29〜3/31）— スクリプト準備済み

### T1-T2. テスト
- [x] スモークテストスクリプト — `scripts/pre-launch-check.sh`
- [x] リンク検証スクリプト — `scripts/check-links.sh`
- [ ] **手動テスト（新規ユーザー、Pro購入、Chrome拡張、モバイル、ブラウザ）** ← 外部（3/29-30）

### T3. インフラ最終確認
- [ ] Sentry/Vercel Analytics/GA4/Gemini/SSL確認 ← 外部（3/30）

### T4. 最終デプロイ
- [ ] `./scripts/pre-launch-check.sh` 実行 → git push ← （3/31）

---

## 📋 4/1 ローンチ当日

### L1. タイムライン（JST）
- [ ] **16:01** — PH公開
- [ ] **16:05** — First Comment投稿（`docs/ph-first-comment.md`）
- [ ] **16:10** — X告知
- [ ] **16:15** — Reddit告知
- [ ] **16:20** — メール告知（`docs/ph-launch-email.md`）
- [ ] **16:30** — dev.to / Indie Hackers告知
- [ ] **16:01-18:01** — 全コメントに即レス
- [ ] **18:01-24:00** — 継続対応
- [ ] **翌0:00-11:00** — 米国ピーク（仮眠しつつチェック）

### L2. トラブル対応
- [x] 障害テンプレ準備済み — `docs/incident-templates.md`
- [x] 競合回答テンプレ準備済み — `docs/competitive-responses.md`

---

## 3/20〜4/1 日別プラン（残りは外部作業のみ）

### 3/20（木）
- [ ] OGP実機確認（Twitter Card Validator, Facebook Debugger）
- [ ] Vercelプラン判断
- [ ] PHコメント2-3件
- [ ] X自然投稿（リンクなし）

### 3/21（金）
- [ ] r/ClaudeAIで質問2-3件に回答（karma稼ぎ）
- [ ] PHコメント2-3件
- [ ] X自然投稿
- [ ] Reddit反応スクショ保存

### 3/22（土）
- [ ] dev.to記事レビュー＆公開
- [ ] PHコメント2-3件
- [ ] X投稿

### 3/23（日）
- [ ] Indie Hackers投稿
- [ ] r/ClaudeAI投稿（karma足りてれば）
- [ ] PHコメント2-3件

### 3/24（月）
- [ ] メール配信ツール登録（Buttondown）
- [ ] Formspreeメールエクスポート→インポート
- [ ] テスティモニアル依頼
- [ ] PHコメント2-3件

### 3/25（火）
- [ ] PHプロダクトページ登録（下書き保存）
- [ ] タグライン＆説明文を入力
- [ ] PHコメント2-3件

### 3/26（水）
- [ ] loresync.devでスクショ撮影
- [ ] ギャラリー画像作成（1270×760）5枚
- [ ] サムネイル 240×240
- [ ] READMEスクショ更新
- [ ] PHコメント2-3件

### 3/27（木）
- [ ] デモGIF撮影（30秒）
- [ ] First Commentレビュー
- [ ] PHコメント2-3件

### 3/28（金）
- [ ] PH全素材アップロード
- [ ] PHプレビュー最終確認
- [ ] X予告投稿（「来週PHでローンチ」）
- [ ] PHコメント2-3件

### 3/29（土）
- [ ] `./scripts/pre-launch-check.sh` 実行
- [ ] `./scripts/check-links.sh` 実行
- [ ] 手動テスト: 新規ユーザーフロー、Pro購入フロー、Chrome拡張

### 3/30（日）
- [ ] モバイルテスト（iOS Safari, Android Chrome）
- [ ] 複数ブラウザ（Chrome, Safari, Firefox, Edge）
- [ ] インフラ確認（Sentry, GA4, Vercel, Gemini, SSL）

### 3/31（月）
- [ ] 最終デプロイ
- [ ] メール送信テスト
- [ ] X予告投稿（「明日PHでローンチ」）
- [ ] 早めに寝る

### 4/1（火）— ローンチ
- [ ] 16:01 JST — 全開

---

## ⚫ 許容するリスク（PH後）

| リスク | 許容理由 |
|--------|----------|
| Pro検証がクライアント側のみ | Supabase導入後に修正 |
| Stripe Webhook未実装 | 同上 |
| Rate limit が in-memory | Gemini有料化で枯渇リスク緩和 |
| i18nバンドル270KB | PH後に分割 |

---

## 3/19 セッション成果

22バッチ、28コミット:

| 指標 | Before | After |
|------|--------|-------|
| テスト | 723 | 732 |
| ESLint | 0 | 0 |
| TSC | 0 | 0 |

| 優先度 | 消化率 |
|--------|--------|
| P0 | 12/12 (100%) |
| P1 | ~21/22 (95%) |
| P2 | ~26/28 (93%) |
| P3 | ~10/16 (63%) |

## 準備済みコンテンツ一覧

| ファイル | 内容 |
|----------|------|
| `docs/ph-first-comment.md` | PH First Comment |
| `docs/ph-description.md` | PH説明文 |
| `docs/ph-tagline-options.md` | タグライン候補10個 |
| `docs/ph-launch-email.md` | ローンチメール |
| `docs/devto-article.md` | dev.to記事 |
| `docs/reddit-claudeai-post.md` | r/ClaudeAI投稿文 |
| `docs/reddit-posts.md` | r/SideProject投稿文 |
| `docs/competitive-responses.md` | 競合回答テンプレ7件 |
| `docs/incident-templates.md` | 障害対応テンプレ |
| `scripts/pre-launch-check.sh` | プレローンチスモークテスト |
| `scripts/check-links.sh` | リンク検証スクリプト |
