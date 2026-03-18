# Lore — PH Launch Master Checklist (4/1)

> 最終更新: 2026-03-19
> このリストに載っていないタスクはやらない。載っているタスクは全部やる。

---

## 🔴 BLOCKER（今すぐ〜3/22）
> これをやらないとローンチ当日に事故る

### B1. CORS修正 — `api/generate.ts`
- [ ] `ALLOWED_ORIGINS` に `lore-lp-one.vercel.app` を追加
- [ ] `lore-app-r5dl.vercel.app` を削除（重複プロジェクト）
- [ ] カスタムドメイン取得後、そのドメインも追加
- **理由:** 本番URLがCORS許可リストにない → ビルトインAPIが動かない可能性

### B2. Chrome拡張URL統一
- [ ] `src/Onboarding.tsx` の拡張ID `ioaccmbgjkaklailnmgklmipccmbneen` を確認
- [ ] `src/LandingPage.tsx` の拡張ID `opkdpjpgkjcjpkahbljjnhnahliedmkc` を確認
- [ ] **どちらが正しい本番IDか確認** → 全箇所統一
- [ ] 間違った方はChrome Web Storeで404になるので絶対修正
- **該当ファイル:** `Onboarding.tsx:34`, `LandingPage.tsx:11`, `lore-landing/index.html:205`

### B3. カスタムドメイン取得
- [ ] ドメイン検索 & 購入（getlore.app, uselore.app, lorehq.com 等）
  - **注意: DNS伝播に24-48時間かかるので3/20までに購入必須**
- [ ] Vercel にカスタムドメイン設定（アプリ側: lore-app プロジェクト）
- [ ] Vercel にカスタムドメイン設定（LP側: lore-landing プロジェクト、サブドメインまたはサブパス）
- [ ] SSL証明書の自動発行確認（Vercelが自動でやるが確認）

### B4. ドメイン変更に伴う全URL更新
> カスタムドメイン確定後に実施。変更箇所を **1つも漏らさない**

**アプリ本体:**
- [ ] `index.html` — canonical URL (line 5)
- [ ] `index.html` — og:url (line 19)
- [ ] `index.html` — og:image (line 20)
- [ ] `index.html` — twitter:image (line 27)
- [ ] `index.html` — JSON-LD url (line 41)
- [ ] `package.json` — homepage (line 19)
- [ ] `public/robots.txt` — Sitemap URL (line 3)
- [ ] `public/sitemap.xml` — 全URL (line 7, 12)
- [ ] `api/generate.ts` — ALLOWED_ORIGINS (line 105)

**LP:**
- [ ] `lore-landing/index.html` — og:image URL（現在 `lore-landing-vert.vercel.app`）
- [ ] `lore-landing/index.html` — twitter:image URL
- [ ] `lore-landing/index.html` — 全CTA の href（`lore-lp-one.vercel.app` → 新ドメイン）

**法的ページ:**
- [ ] `public/tokushoho.html` — サイトURL（現在 `lore-app-r5dl.vercel.app` line 44）
- [ ] `lore-landing/legal/tokushoho.html` — 同上

**CSP:**
- [ ] `vercel.json` — connect-src にカスタムドメイン追加（現在 `https://*.vercel.app` でカバーされてるが、独自ドメインの場合は別途必要）

**Stripe:**
- [ ] Stripe Dashboard → Payment Link のredirect URL を新ドメインに更新

**Chrome拡張:**
- [ ] 拡張のtarget URL更新が必要か確認（`extension/` フォルダ内）

### B5. GitHub URL統一 — `yo-ban/lore-pwa` → `nao-lore/lore-app`
- [ ] `src/LandingPage.tsx:12` — GITHUB_URL
- [ ] `src/LandingPage.tsx:13` — FEEDBACK_URL
- [ ] `lore-landing/index.html:204` — GitHub リンク
- [ ] `lore-landing/index.html:206` — Feedback リンク
- [ ] `docs/ph-page-draft.md:11` — GitHub URL
- [ ] `CONTRIBUTING.md:8` — clone URL（現在 `your-org/threadlog.git` プレースホルダー）

### B6. Reddit投稿のURL更新 — `docs/reddit-posts.md`
- [ ] line 23: `lore-landing-vert.vercel.app` → 新ドメイン
- [ ] line 55: 同上
- [ ] line 69: 同上

### B7. Gemini API 有料化（Pay-as-you-go）
- [ ] Google AI Studio → Billing 設定
- [ ] 無料枠: 250 RPD / 10 RPM → PH当日に枯渇する
- [ ] 有料: $0.015/100万入力トークン（激安、月$5-10程度の見込み）
- [ ] 予算上限アラート設定（$20/日 等）
- [ ] `api/generate.ts` の `GLOBAL_DAILY_LIMIT` を 500 → 5000 に引き上げ

### B8. Stripe Payment Link redirect URL 確認
- [ ] Stripe Dashboard → Payment Links → Monthly link → Settings
- [ ] After payment redirect URL: `https://[新ドメイン]/?checkout=success&session_id={CHECKOUT_SESSION_ID}`
- [ ] After cancellation redirect URL: `https://[新ドメイン]/?checkout=cancelled`
- [ ] **テスト決済して確認**（Stripe テストモードで）

---

## 🟠 HIGH（3/19〜3/25）
> ないとPHの効果が大幅ダウン

### H1. アナリティクス
- [ ] Vercel Analytics 有効化（Vercel Dashboard → Analytics → Enable）
- [ ] Google Analytics 4 アカウント作成
- [ ] GA4 タグをアプリに埋め込み（`index.html` の `<head>` に）
- [ ] GA4 タグをLPに埋め込み
- [ ] コンバージョンイベント設定:
  - [ ] スナップショット作成完了
  - [ ] Pro購入ボタンクリック
  - [ ] Chrome拡張リンククリック
  - [ ] メール登録
- [ ] UTMパラメータ準備: `?utm_source=producthunt`, `?utm_source=reddit`, `?utm_source=twitter`

### H2. OGP / SEO
- [ ] Twitter Card Validator でアプリのOGP確認
- [ ] Facebook Sharing Debugger でLPのOGP確認
- [ ] LP に favicon 追加（アプリの `favicon.ico` をコピーでOK）
- [ ] LP に `robots.txt` 作成
- [ ] LP に `sitemap.xml` 作成

### H3. PHコミュニティ活動（今日から毎日）
- [ ] PHアカウント作成
- [ ] プロフィール完成（顔写真、bio、Webサイト、X、GitHub）
- [ ] **毎日2-3個のプロダクトにコメント** → 4/1までに25+コメント目標
  - PHアルゴリズムは活動歴のないアカウントをペナルティする
  - 30日以上前に作成されたアカウントが有利
- [ ] 気になるプロダクトをupvote

### H4. X (Twitter) 準備
- [ ] Lore公式アカウント or 個人アカウントどちらで行くか決定
- [ ] プロフィール設定（アイコン、bio、Webサイトリンク）
- [ ] Build in Public 投稿開始（1日1投稿目標）
  - 開発ストーリー、数字、学び、ユーザーの声

### H5. FAQ 準備（PH / Reddit で必ず聞かれる）

| 質問 | 回答 |
|------|------|
| Claude Memory / ChatGPT Memory と何が違う？ | Memoryは自動で断片的。Loreは意図的に全セッションを構造化。プロジェクト単位で管理でき、次のセッション開始時にコピペで完全復元 |
| データはどこに保存？ | ブラウザのlocalStorage。サーバーにデータは保存されない。AI処理時のみ会話テキストがAPI経由で送信（保存されない） |
| APIキーは安全？ | ブラウザ内でAES-GCM暗号化して保存。サーバーに送信されない |
| なぜ無料？ | 共有のGemini APIキーを使用。20回/日まで。自分のキーを設定すれば無制限 |
| オープンソースなのにPro課金？ | コア機能は全部無料＆OSS。Proは使用回数上限の撤廃 + 将来のプレミアム機能用 |
| データ消える？ | ブラウザデータ消去で消える。エクスポート機能あり。クラウド同期は今後追加予定 |

### H6. README.md 整備
- [ ] スクリーンショットを最新UIに更新（カスタムドメインのURLで撮影）
- [ ] GitHub URL統一確認
- [ ] 機能一覧を最新に
- [ ] "Built with Claude Code" バッジ追加検討

### H7. Sentry アラート設定
- [ ] Sentry Dashboard → Alerts → Create Alert Rule
- [ ] 条件: 10分間に5件以上のエラー → メール通知
- [ ] PH当日のエラー急増を即検知

### H8. メール配信ツール
- [ ] Buttondown（無料枠100人）or Resend or Mailchimp 登録
- [ ] Formspreeの登録者メールをエクスポート
- [ ] PHローンチ告知メール下書き
- [ ] 送信テスト

### H9. 画像最適化
- [ ] `public/hero-screenshot.png` (504KB) → WebP圧縮 (~100-150KB)
- [ ] PH用スクリーンショットはカスタムドメインのURLで撮影
- [ ] 全画像はカスタムドメイン反映後に撮り直し

### H10. 重複Vercelプロジェクト削除
- [ ] `lore-app-r5dl` プロジェクトを削除（Vercel Dashboard → Settings → Delete Project）

### H11. Vercel プラン確認
- [ ] Hobby plan は非商用限定。$12/mo課金してるなら商用利用
- [ ] 選択肢: (A) Pro ($20/mo) にアップグレード or (B) リスク承知で続行
- [ ] PH当日のトラフィック量で判断（Hobby: 100GB帯域/月、1M関数呼び出し/月）

---

## 🟡 MEDIUM（3/20〜3/28）
> あると信頼度UP、なくてもローンチは可能

### M1. コード品質（PH当日のクラッシュ防止）
- [ ] `api/generate.ts` に入力サイズ制限追加（system: 10KB, userMessage: 100KB, maxTokens: 100-16384）
- [ ] streaming `reader.read()` に try-catch 追加（`provider.ts` の3箇所）
- [ ] `loadDemoData()` に `.catch()` 追加（`InputView.tsx:152`, `InputView.tsx:345`）
- [ ] `lore-storage-full` イベントのリスナー追加 → ユーザーにtoast通知
- [ ] 変換中の `beforeunload` 警告追加（「変換中です。ページを離れるとデータが失われます」）
- [ ] グローバル `unhandledrejection` リスナー追加（`main.tsx`）

### M2. テスティモニアル
- [ ] Reddit投稿後、好意的コメントにDMで引用許可
- [ ] 2-3件確保
- [ ] LPにテスティモニアルセクション追加
- [ ] PH画像素材としても使用

### M3. PH限定特典
- [ ] 特典内容決定（例: Pro 3ヶ月無料）
- [ ] 運用フロー決定（クーポンコード? 手動対応? メール申告?）
- [ ] First Comment に特典記載

### M4. 競合・ネガティブ回答テンプレ
- [ ] 「$12高い、無料で十分」→ 「フリーで20回/日使えます。Proはヘビーユーザー向け」
- [ ] 「localStorage消えるじゃん」→ 「エクスポート可能。クラウド同期は次のマイルストーン」
- [ ] 「Notion AI でよくね？」→ 「Notionは汎用。Loreは"AIセッションの引き継ぎ"に特化」
- [ ] 「セキュリティ大丈夫？」→ FAQ参照、全ソースはオープン

### M5. コンテンツ
- [ ] dev.to に開発ストーリー記事（「Claude Codeで1人でSaaS作った話」）
- [ ] Indie Hackers に投稿
- [ ] 記事はPH前に公開 → SEO + 被リンク

### M6. 障害対策
- [ ] Vercel ステータスページ ブックマーク: https://www.vercelstatus.com
- [ ] Google AI Studio ダッシュボード ブックマーク（Gemini使用量監視）
- [ ] サイトダウン時のテンプレ準備:
  - X: "We're seeing high traffic from PH launch! Working on it — back in a few minutes."
  - PH Comment: "Huge traffic spike! Scaling up now. In the meantime, you can set your own free Gemini API key in Settings for instant access."
- [ ] ホットフィックスのデプロイ手順確認（git push → Vercel自動デプロイ、2-3分）
- [ ] 前の正常デプロイへのロールバック方法確認（Vercel → Deployments → Promote to Production）

---

## 📋 Reddit ソフトローンチ（3/19〜3/28）

### R1. 投稿（URLはカスタムドメイン確定後に更新）
- [ ] r/SideProject 投稿（3/19 昼12-13時 JST）
  - [ ] UTMパラメータ付きURL
  - [ ] 投稿前にLP/アプリの動作最終確認
- [ ] r/ClaudeAI karma稼ぎ（2-3件の質問に回答）
- [ ] r/ClaudeAI 投稿（karma 30+になったら）
- [ ] r/ChatGPT メガスレッドにコメント

### R2. フォローアップ
- [ ] 全コメント24時間以内に返信
- [ ] バグ報告即修正
- [ ] 好意的コメントにDMでテスティモニアル依頼
- [ ] Reddit反応のスクショ保存（PH素材用）
- [ ] 投稿が削除された場合の別切り口バックアップ投稿文を用意

---

## 📋 PHページ準備（3/25〜3/31）

### P1. プロダクトページ
- [ ] プロダクト登録（下書き保存）
- [ ] タグライン最終決定（60字以内）
  - 現在案: "Turn AI conversations into structured project docs — instantly"
- [ ] 説明文最終推敲（`docs/ph-page-draft.md` ベース）
- [ ] トピックタグ: Productivity, AI, Developer Tools, Open Source
- [ ] **全URLをカスタムドメインに**

### P2. ビジュアル素材（全てカスタムドメインのUIで撮影）
- [ ] サムネイル 240×240（ロゴ）
- [ ] ギャラリー画像 3-5枚（1270×760）
  - ① ヒーロー（LP or アプリ全体図）
  - ② Before/After（生会話 → 構造化スナップショット）
  - ③ ダッシュボード（プロジェクト一覧）
  - ④ Chrome拡張（キャプチャ画面）
  - ⑤ モバイル表示（PWA）
- [ ] デモGIF or 動画（30秒以内）
  - フロー: 貼り付け → 変換中 → 結果表示

### P3. First Comment
- [ ] 最終版作成（`docs/ph-page-draft.md` ベース）
- [ ] PH限定特典記載（M3で決めた内容）
- [ ] 会話誘発の質問を入れる
- [ ] CTA（アプリURL + GitHub URL）

### P4. サポーター
- [ ] 友人・知人に事前告知（「4/1にPHで出すから見てね」レベル）
- [ ] **PHアカウントは30日以上前に作成が必要** → 友人に今すぐ伝える
- [ ] upvote依頼DM爆撃は**ルール違反で削除リスク** → やらない

---

## 📋 最終チェック（3/29〜3/31）

### T1. 動作テスト
- [ ] **新規ユーザーフロー**（シークレットモードで）
  - LP → CTA → アプリ → オンボーディング → 入力 → サンプル会話で変換 → 結果確認
- [ ] **Pro購入フロー**（Stripeテストモードで）
  - 購入 → redirect → Pro有効化 → 機能確認
- [ ] **Chrome拡張フロー**
  - Claude/ChatGPT で拡張使用 → アプリにデータ送信 → 変換
- [ ] **モバイル確認**
  - iOS Safari, Android Chrome で全フロー
- [ ] **複数ブラウザ**
  - Chrome, Safari, Firefox, Edge
- [ ] **PWAインストール → オフラインUI確認**

### T2. エラーケーステスト
- [ ] API枯渇時のメッセージ確認（レートリミット）
- [ ] ネットワーク切断時のメッセージ確認
- [ ] 超長文入力（500K文字）の動作
- [ ] 空入力での変換ボタン（disabledか）

### T3. インフラ最終確認
- [ ] Sentryでエラー来てないか確認
- [ ] Vercel Analyticsが動いてるか確認
- [ ] GA4がデータ受け取れてるか確認
- [ ] Gemini API有料枠の使用量確認
- [ ] カスタムドメインのSSL有効確認

### T4. 最終デプロイ
- [ ] `npx tsc --noEmit` パス
- [ ] `npx vitest run` パス
- [ ] `npx vite build` 成功
- [ ] `git push` → Vercel 自動デプロイ
- [ ] デプロイ後の本番確認（LP + アプリ）

---

## 📋 4/1 ローンチ当日

### L1. タイムライン（JST）
- [ ] **16:01** — PH公開（PST 0:01）
- [ ] **16:05** — First Comment 投稿
- [ ] **16:10** — X で告知投稿
- [ ] **16:15** — Reddit で告知（r/SideProject + r/ClaudeAI にPHリンク付き）
- [ ] **16:20** — メール告知（登録者に送信）
- [ ] **16:30** — dev.to / Indie Hackers に告知
- [ ] **16:01-18:01** — 最初の2時間: 全コメントに即レス（最重要）
- [ ] **18:01-24:00** — 夕方〜深夜: 継続コメント対応
- [ ] **翌0:00-11:00** — 深夜〜朝: 米国ピーク時間（仮眠取りつつ2-3時間おきにチェック）

### L2. モニタリング
- [ ] Sentry ダッシュボード監視（エラー急増チェック）
- [ ] GA4 リアルタイムレポート監視（流入数、コンバージョン）
- [ ] Vercel Dashboard 監視（ビルド状態、帯域使用量）
- [ ] Google AI Studio 監視（Gemini API使用量）

### L3. トラブル対応
- [ ] バグ報告 → 即修正 → git push → 自動デプロイ（2-3分で反映）
- [ ] API枯渇 → PH Comment で「Settings から自分のGemini APIキー設定してください」案内
- [ ] サイトダウン → M6のテンプレで即応答
- [ ] PHに掲載されなかった場合 → Reddit + X + dev.to に集中投稿で補う

---

## ⚫ 許容するリスク（PH後に対応）

| リスク | 許容理由 |
|--------|----------|
| Pro検証がクライアント側のみ（localStorage偽装可能） | Supabase導入後に修正。β期間中は許容 |
| Stripe Webhook未実装（解約・更新が反映されない） | 同上。手動対応可能 |
| 年額プランも30日expiry | 手動延長で対応。Supabase後に自動化 |
| Rate limit が in-memory（コールドスタートでリセット） | Gemini有料化で枯渇リスク緩和 |
| CommandPalette等の未i18n文字列（8箇所） | 英語圏PHユーザーには影響なし |
| a11yの非button要素（5箇所） | 機能は動く。PH後に修正 |
| refund policy 未文書化 | Stripe標準で対応 |
| i18nバンドル270KB | 機能に影響なし。PH後に分割 |
| mammoth.js 500KB | lazy loadされてるので初期ロードに影響なし |

---

## タスク集計

| カテゴリ | タスク数 | 期間 |
|----------|----------|------|
| 🔴 BLOCKER | 8セクション (約35個) | 今すぐ〜3/22 |
| 🟠 HIGH | 11セクション (約30個) | 3/19〜3/25 |
| 🟡 MEDIUM | 6セクション (約20個) | 3/20〜3/28 |
| 📋 Reddit | 2セクション (約10個) | 3/19〜3/28 |
| 📋 PH準備 | 4セクション (約15個) | 3/25〜3/31 |
| 📋 最終チェック | 4セクション (約15個) | 3/29〜3/31 |
| 📋 当日 | 3セクション (約15個) | 4/1 |
| **合計** | **約140個** | |

---

## 調査ソース

このチェックリストは以下の方法で網羅性を確認:

1. **6つの専門エージェントによる並列監査:**
   - セキュリティ & API悪用
   - 決済 & Pro課金フロー
   - PWA / Service Worker / パフォーマンス
   - 全外部URL & リンク整合性
   - エラーハンドリング & エッジケース
   - アクセシビリティ & 国際化

2. **外部リソース:**
   - [Product Hunt Launch Guide 2026](https://calmops.com/indie-hackers/product-hunt-launch-guide/)
   - [PH Official: Preparing for Launch](https://www.producthunt.com/launch/preparing-for-launch)
   - [SaaS Launch Checklist](https://designrevision.com/blog/saas-launch-checklist)
   - [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)
   - [Vercel Hobby Plan Limits](https://vercel.com/docs/plans/hobby)

3. **コードベース全検索:**
   - 全URL参照の整合性チェック
   - 全エラーパスの追跡
   - 全localStorage操作の監査
