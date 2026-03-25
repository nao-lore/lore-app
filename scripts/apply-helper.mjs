#!/usr/bin/env node
/**
 * apply-helper.mjs — 就活応募作業効率化CLI
 *
 * 使い方: node scripts/apply-helper.mjs
 *
 * コマンド:
 *   list            — 全企業一覧（Tier別）
 *   next            — 次の未応募企業を表示
 *   apply <企業名>  — 企業の応募文を生成してクリップボードにコピー
 *   done <企業名>   — 応募済みマークをつける
 *   status          — 応募状況サマリー
 *   search <キーワード> — 企業名/条件でフィルタ検索
 *   help            — ヘルプ表示
 *   quit            — 終了
 */

import { createInterface } from "node:readline";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

// ─── パス定義 ───
const BASE = "/Users/nn/Downloads/lore-project/就活";
const CSV_PATH = join(BASE, "応募履歴.csv");

// ─── 企業データ（応募先リストからパース） ───
const companies = [
  // Tier S
  { id: 0, name: "PLAINER", score: 96, tier: "S", role: "テックリード/デモプラットフォーム", salary: "不明", conditions: "フルリモート / React+TS+Chrome拡張+AI/LLM+SaaS / 自社開発 / 0→1", url: "(HERP経由)", platform: "HERP" },
  { id: 1, name: "OPERe", score: 95, tier: "S", role: "FEエンジニア", salary: "500〜900万", conditions: "フルリモート / 年数縛りなし / React+Next.js+TS / Claude Code使用企業 / 自社SaaS", url: "https://herp.careers/careers/companies/opere/jobs/T_xX3G7gdHJV", platform: "HERP" },
  { id: 2, name: "EpicAI", score: 93, tier: "S", role: "FEエンジニア（松尾研発）", salary: "業務委託→正社員登用", conditions: "フルリモート / 個人開発OK明記 / React+TS+AI / 週10時間〜", url: "https://youtrust.jp/recruitment_posts/f27a83abf572178c9faaf510c840015e", platform: "YOUTRUST" },
  { id: 3, name: "キカガク", score: 90, tier: "S", role: "AIエンジニア", salary: "不明（MLエンジニア約900万の実績あり）", conditions: "フルリモート / 未経験OK明記 / React+TS+FE+AI / 受託だが教育→内製化支援", url: "https://youtrust.jp/recruitment_posts/d6e091bb58749964543536d7202ae17e", platform: "YOUTRUST" },
  { id: 4, name: "ナレッジワーク", score: 90, tier: "S", role: "FEエンジニア", salary: "910〜1,610万", conditions: "フルリモート可 / React+TS+Next.js / Google出身CTO / シリーズB 45億調達", url: "https://findy-code.io/companies/1361/jobs/kDkC2pCYESo2j", platform: "Findy" },
  // Tier A
  { id: 5, name: "Hotpot Inc.", score: 88, tier: "A", role: "生成AIプロンプトエンジニア", salary: "420〜800万", conditions: "フルリモート / 未経験大歓迎 / 正社員", url: "https://en-gage.net/user/search/desc/15105575/", platform: "engage" },
  { id: 6, name: "ちょっと株式会社", score: 88, tier: "A", role: "FEエンジニア", salary: "448万〜", conditions: "フルリモート / React+Next.js+TS / Vercelパートナー / 副業可 / 自社開発", url: "https://findy-code.io/companies/1535/jobs/MhQbyGGDXaJuB", platform: "Findy" },
  { id: 7, name: "イクシアス", score: 88, tier: "A", role: "Webエンジニア/ポテンシャル採用", salary: "518万", conditions: "フルリモート / TS / ポテンシャル採用明記 / 未経験OK / 学歴不問 / 自社SaaS", url: "https://xn--pckua2a7gp15o89zb.com/jb/39b97d62dda9c20940d91b170287862f", platform: "転職ドラフト" },
  { id: 8, name: "ラッコ", score: 87, tier: "A", role: "Webエンジニア（AI駆動開発）", salary: "420〜800万", conditions: "フルリモート / React+Next.js+TS / Claude/Devin導入済み / 完全自社サービス", url: "https://rakko.inc/recruit/engineer/", platform: "直接" },
  { id: 9, name: "ムダレス", score: 86, tier: "A", role: "自社OS開発エンジニア", salary: "600〜1,200万", conditions: "フルリモート / フルフレックス / 経験年数不問 / 学歴不問", url: "https://tenshoku.mynavi.jp/jobinfo-450435-1-1-1/", platform: "マイナビ転職" },
  { id: 10, name: "オープングループ_AI", score: 86, tier: "A", role: "AIエージェント開発エンジニア", salary: "月給44.2万〜78万（530〜936万相当）", conditions: "フルリモート / AI/LLM+React / Claude Code経験直結", url: "https://tenshoku.mynavi.jp/jobinfo-446022-5-15-1/", platform: "マイナビ転職" },
  { id: 11, name: "HERP", score: 85, tier: "A", role: "AIリクルーター開発エンジニア", salary: "600〜1,080万", conditions: "フルリモート / React+TS+LLM / 年数縛りなし / SO全員付与", url: "https://herp.careers/v1/herpinc", platform: "HERP" },
  { id: 12, name: "NaLaLys", score: 85, tier: "A", role: "プロダクトエンジニア", salary: "不明", conditions: "フルリモート / 自社AI SaaS / React+TS+Cursor / シード期初期メンバー", url: "https://youtrust.jp/recruitment_posts/f1f6aa09902dafce50391b17276e86fd", platform: "YOUTRUST" },
  { id: 13, name: "RIT", score: 85, tier: "A", role: "ジュニアエンジニア", salary: "月給30万〜42万（360〜504万相当）", conditions: "フルリモート / TS / ジュニア枠（経験浅OK前提）/ 太陽HDグループ", url: "https://tenshoku.mynavi.jp/jobinfo-454736-5-1-1/", platform: "マイナビ転職" },
  { id: 14, name: "カミナシ", score: 85, tier: "A", role: "FEエンジニア", salary: "非公開", conditions: "フルリモート（出社義務なし） / React+TS / 製造業DX SaaS", url: "https://herp.careers/v1/kaminashi", platform: "HERP" },
  { id: 15, name: "オープングルーヴ", score: 84, tier: "A", role: "Webアプリ開発エンジニア", salary: "400〜650万", conditions: "フルリモート初日から / 未経験OK（GitHub提示で可） / 直請け100%", url: "https://type.jp/job-1/1351558_detail/", platform: "type" },
  { id: 16, name: "クラフトバンク", score: 84, tier: "A", role: "FEエンジニア", salary: "応相談", conditions: "フルリモート / SPA+Git経験のみ / 言語不問 / FE直球", url: "https://herp.careers/careers/companies/craftbank21/jobs/fN3nErHDYUbD", platform: "HERP" },
  { id: 17, name: "ココロザシ", score: 84, tier: "A", role: "BEエンジニア(TS/Next.js)", salary: "420万", conditions: "フルリモート / TypeScript+Next.js / 未経験OK", url: "https://xn--pckua2a7gp15o89zb.com/jb/5ad2a78df5e812318e1e615c58557dfc", platform: "転職ドラフト" },
  { id: 18, name: "アップストリーム", score: 83, tier: "A", role: "FEエンジニア", salary: "550〜1,000万", conditions: "フルリモート / React+TS+Redux / 動画配信サービス / 自社開発", url: "https://findy-code.io/companies/1283/jobs/Pjt7k22FusyFg", platform: "Findy" },
  { id: 19, name: "トレードワルツ", score: 83, tier: "A", role: "FEエンジニア", salary: "609〜820万", conditions: "フルリモート / React+TS+Claude Code使用 / Vite/Vitest / 自社SaaS", url: "https://findy-code.io/companies/1505/jobs/MVbg13WscjqWg", platform: "Findy" },
  { id: 20, name: "オートロ", score: 83, tier: "A", role: "AIエージェント開発エンジニア", salary: "456〜666万", conditions: "フルリモート / 自社AI RPAプロダクト / FE+AI/LLM", url: "https://xn--pckua2a7gp15o89zb.com/jb/7540804f64b2b42e8fd09bc608ee2c15", platform: "転職ドラフト" },
  { id: 21, name: "ナウキャスト", score: 82, tier: "A", role: "LLMエンジニア", salary: "700〜1,500万", conditions: "フルリモート / LLM経験=コーディングエージェント利用でOK / 東大発", url: "https://herp.careers/v1/finatexthd/8WJ5JIB97QCB", platform: "HERP" },
  { id: 22, name: "オープングループ_FS", score: 82, tier: "A", role: "フルスタックエンジニア", salary: "587〜1,036万", conditions: "フルリモート / TS+Node.js / 自社サービス0→1", url: "https://xn--pckua2a7gp15o89zb.com/jb/816ddb1460310c986ee74ef5d22ab0b7", platform: "転職ドラフト" },
  { id: 23, name: "SocialDog", score: 81, tier: "A", role: "FEエンジニア", salary: "600〜960万", conditions: "フルリモート / SPA開発1年以上 / React+TS+Vite / 自社SaaS", url: "https://herp.careers/careers/companies/socialdog/jobs/xn1YZwXWdRzn", platform: "HERP" },
  { id: 24, name: "カンリー", score: 80, tier: "A", role: "FEエンジニア", salary: "400〜650万", conditions: "フルリモート / React+TS / Cursor/Claude Code導入 / 78,000店舗導入SaaS", url: "https://recruit.can-ly.com/", platform: "直接" },
  { id: 25, name: "miryo.AI", score: 80, tier: "A", role: "Webエンジニア", salary: "不明", conditions: "フルリモート / AIエージェント活用 / React+TS / 正社員", url: "https://youtrust.jp/recruitment_posts/4ed53e1dac2357d5e9bb6f698030fc94", platform: "YOUTRUST" },
  { id: 26, name: "init", score: 80, tier: "A", role: "FEエンジニア", salary: "不明", conditions: "フルリモート / React+FE", url: "https://tenshoku.mynavi.jp/jobinfo-397358-5-19-1/", platform: "マイナビ転職" },
  { id: 27, name: "Autify", score: 80, tier: "A", role: "Senior FEエンジニア", salary: "700〜1,200万", conditions: "フルリモート海外可 / React+TS / テスト自動化SaaS / 英語環境", url: "https://www.tokyodev.com/companies/autify/jobs/senior-frontend-engineer", platform: "TokyoDev" },
  { id: 28, name: "テイラー", score: 78, tier: "A", role: "FEエンジニア", salary: "非公開", conditions: "フルリモート+フルフレックス / React+TS+Next.js / YC出身唯一の日本企業", url: "https://paiza.jp/career/job_offers/16222", platform: "paiza" },
  // Tier B
  { id: 29, name: "e-dash", score: 78, tier: "B", role: "FEエンジニア", salary: "600〜1,200万", conditions: "フルリモート / 年数縛りなし / React+TS / 三井物産グループ", url: "https://herp.careers/careers/companies/edash/jobs/ndomiBcvdRFz", platform: "HERP" },
  { id: 30, name: "IVRy", score: 77, tier: "B", role: "FE/フルスタックエンジニア", salary: "630〜1,100万", conditions: "リモート自由 / 経験2年〜 / React+TS+Next.js / AI音声SaaS / Series D", url: "https://herp.careers/v1/ivry", platform: "HERP" },
  { id: 31, name: "WiseVine", score: 76, tier: "B", role: "FEエンジニア", salary: "600〜1,200万", conditions: "フルリモート / React+TS / 年数縛りなし / 自治体向けGovTech SaaS", url: "https://herp.careers/v1/wisevine/bkHfwlV03eRi", platform: "HERP" },
  { id: 32, name: "ソフトブレーン", score: 75, tier: "B", role: "プロンプトエンジニア", salary: "500〜1,000万", conditions: "リモート可 / AI未経験OK / 自社SaaS(5500社導入)", url: "https://type.jp/job-1/1350893_detail/", platform: "type" },
  { id: 33, name: "Michibiku", score: 74, tier: "B", role: "Claude Codeで新規事業", salary: "時給1,250円〜（インターン→正社員登用）", conditions: "リモート可 / 未経験OK / Claude Code中心業務", url: "(YOUTRUST内で「Michibiku」検索)", platform: "YOUTRUST" },
  { id: 34, name: "ROUTE06", score: 73, tier: "B", role: "エンジニア", salary: "非公開", conditions: "フルリモート / PH Daily 2位のAIプロダクト「Giselle」 / Claude Code導入", url: "https://jobs.route06.co.jp/", platform: "直接" },
  { id: 35, name: "ファインディ", score: 72, tier: "B", role: "FEエンジニア", salary: "500〜900万", conditions: "リモートOK / AI駆動開発推進 / TS+Next.js+GraphQL", url: "https://herp.careers/v1/findy/BchOBtOXhz5k", platform: "HERP" },
  { id: 36, name: "Helpfeel", score: 72, tier: "B", role: "プロダクトエンジニア", salary: "600〜1,200万", conditions: "フルリモート / React+Node.js実務1年以上 / 自社SaaS / 「SIer出身で個人開発の方も可」明記", url: "https://herp.careers/careers/companies/notainc/jobs/Nn_MkDbWHh02", platform: "HERP" },
  { id: 37, name: "FOLIO", score: 71, tier: "B", role: "FEエンジニア", salary: "600〜1,200万", conditions: "ほぼ100%リモート / React/TS/Next.js / AI金融ロボアドバイザー", url: "https://herp.careers/v1/folio/SJoBcz1OTgt3", platform: "HERP" },
  { id: 38, name: "ランサーズ", score: 70, tier: "B", role: "FEエンジニア", salary: "500〜700万", conditions: "フルリモート / 日本最大級フリーランスPF / 自社開発", url: "https://jobs.forkwell.com/lancers/jobs/10456", platform: "Forkwell" },
  { id: 39, name: "DMM Boost", score: 68, tier: "B", role: "FEエンジニア", salary: "500〜666万", conditions: "フルリモート / React1年以上 / DMMグループ自社SaaS", url: "https://findy-code.io/companies/1613/jobs/9jLghIAQ5KYYR", platform: "Findy" },
  { id: 40, name: "80&Company", score: 68, tier: "B", role: "FEリードエンジニア", salary: "408〜952万", conditions: "フルリモート+フルフレックス / React+Next.js+TS / 京都発 / IPO予定", url: "https://www.green-japan.com/company/8824/job/206099", platform: "Green" },
  { id: 41, name: "SmartHR", score: 67, tier: "B", role: "FEエンジニア（オープンポジション）", salary: "547万〜", conditions: "フルリモート / React/TS / 超有名SaaS / 3年要求だがOP枠", url: "https://findy-code.io/companies/334/jobs/9nk2fxT6mx6K_", platform: "Findy" },
  { id: 42, name: "フルカイテン", score: 67, tier: "B", role: "FEエンジニア", salary: "非公開", conditions: "フルリモート / React+TS+Next.js / AI在庫分析SaaS", url: "https://paiza.jp/career/job_offers/34228", platform: "paiza" },
  { id: 43, name: "テックタッチ", score: 66, tier: "B", role: "FEスペシャリスト", salary: "600〜1,200万", conditions: "フルリモート / React+TS+ブラウザ拡張+Vite+Playwright = Loreそのもの", url: "https://www.green-japan.com/company/6256/job/81037", platform: "Green" },
  { id: 44, name: "STORES", score: 66, tier: "B", role: "FEエンジニア", salary: "非公開", conditions: "リモート可 / React+Vue / Claude Code+Cursor導入 / 自社SaaS", url: "https://hrmos.co/pages/storesinc/jobs/6_2", platform: "HRMOS" },
  { id: 45, name: "LayerX", score: 65, tier: "B", role: "プロダクトエンジニア", salary: "400〜1,300万", conditions: "フルリモート実績あり / React/TS / 経験3年要求 / バクラク事業", url: "https://jobs.layerx.co.jp/", platform: "直接" },
  { id: 46, name: "PayPay", score: 65, tier: "B", role: "FEエンジニア", salary: "700〜1,000万", conditions: "フルリモート海外可 / React / 大手フィンテック / 英語環境", url: "https://www.tokyodev.com/companies/paypay/jobs/frontend-engineer", platform: "TokyoDev" },
  { id: 47, name: "メドレー", score: 64, tier: "B", role: "エンジニア", salary: "非公開", conditions: "Claude Code+Cursor導入 / 医療×IT / React使用 / リモート可", url: "https://www.medley.jp/recruit/", platform: "直接" },
  { id: 48, name: "カケハシ", score: 63, tier: "B", role: "エンジニア", salary: "非公開", conditions: "Claude Code+Cursor導入 / 薬局DX SaaS / React+TS / フルリモート実績", url: "(要確認)", platform: "直接" },
  { id: 49, name: "キマルーム", score: 62, tier: "B", role: "FEエンジニア", salary: "640〜1,100万", conditions: "フルリモート / TS / 不動産SaaS / 自社開発", url: "https://herp.careers/careers/companies/kimaroom", platform: "HERP" },
  // Tier C
  { id: 50, name: "STUDIO", score: 58, tier: "C", role: "エンジニア", salary: "非公開", conditions: "フルリモート / 学歴不問 / PH Daily 1位×2回", url: "https://studio.inc/career", platform: "直接" },
  { id: 51, name: "Sotas", score: 57, tier: "C", role: "FEエンジニア", salary: "非公開", conditions: "フルリモート（6月以降週1出社） / React+Next.js+TS", url: "https://herp.careers/careers/companies/sotas/jobs/wi-9TV_mGtxG", platform: "HERP" },
  { id: 52, name: "エアークローゼット", score: 56, tier: "C", role: "エンジニア", salary: "非公開", conditions: "React/TS / フルリモート有 / Claude Code導入", url: "https://corp.air-closet.com/recruiting/", platform: "直接" },
  { id: 53, name: "Legion", score: 55, tier: "C", role: "FEエンジニア", salary: "400〜500万", conditions: "React1年以上 / フルリモート", url: "https://offers.jp/jobs/92506", platform: "Offers" },
  { id: 54, name: "Stack Inc", score: 55, tier: "C", role: "FEエンジニア", salary: "660〜960万", conditions: "年数縛りなし / React+TS", url: "https://offers.jp/jobs/92770", platform: "Offers" },
  { id: 55, name: "COMPASS", score: 54, tier: "C", role: "FEエンジニア", salary: "非公開", conditions: "フルリモート / React/TS / AI教育SaaS", url: "https://hrmos.co/pages/qubena/jobs/4_1_15", platform: "HRMOS" },
  { id: 56, name: "トランスAI", score: 53, tier: "C", role: "AI駆動開発Webエンジニア", salary: "不明", conditions: "東大発AI企業", url: "https://youtrust.jp/recruitment_posts/a36ec7bd5d1d8befbcc0b8dd97021055", platform: "YOUTRUST" },
  { id: 57, name: "ギブリー", score: 50, tier: "C", role: "AIエンジニア", salary: "720〜1,200万", conditions: "学歴不問 / Python2年以上要求 / 週3リモート", url: "https://type.jp/job-1/1351576_detail/", platform: "type" },
];

// ─── 志望動機データ ───
const motivations = {
  "PLAINER": `PLAINERの「SaaS製品のデモ体験をノーコードで構築する」というプロダクトに強く惹かれました。Chrome拡張でSaaS画面をキャプチャし、ガイドやフォームを付けてデモコンテンツにするという仕組みは、自分がLoreで取り組んだ「Chrome拡張でAI会話を取得し、構造化して再利用可能にする」というアプローチとそのまま重なります。React + TypeScript + Chrome拡張 + AIという技術スタックもLoreとほぼ一致しています。freeeやSmartHRなど大手SaaSが導入しているプロダクトの0→1フェーズに、自分のChrome拡張開発とAI活用の実践経験を持ち込めると考えています。`,
  "OPERe": `患者と医療者のコミュニケーションをデジタル化する「ポケさぽ」の、地味だけど確実に現場を楽にするプロダクト設計に共感しました。80病院以上に導入されていて、実際に使われているプロダクトを育てていくフェーズというのが面白いです。Claude Codeを開発に取り入れている点も大きくて、自分はLoreの全開発をClaude Codeで行っているので、AI駆動開発のワークフローをそのままチームに持ち込めます。React + Next.js + TypeScriptのスタックもLoreで日常的に触っている技術なので、キャッチアップコストなく貢献できると考えています。`,
  "EpicAI": `松尾研発のAIスタートアップで、LLMやAIエージェントを使った企業向けソリューションを提案から実装まで一気通貫でやっている点に惹かれました。「個人開発でも可」と明記してくれているのがありがたいです。自分はLoreの開発を通じて、LLMのコンテキスト管理やAIとの協働開発を実践的に経験してきました。製造・建設・小売など多様な業界のAI導入を支援するEpicAIの現場で、自分のAI活用経験とReact + TypeScriptでのフロントエンド開発力を活かしたいです。週10時間からスタートできる柔軟さも、立ち上がりとしてちょうどいいと感じています。`,
  "キカガク": `キカガクのAI受託開発・内製化支援事業に興味があります。教育事業で培ったAIの知見を、実際の企業課題の解決に落とし込んでいくフェーズだと理解しています。自分はLoreの開発で、AIを「使う側」として日常的にプロンプト設計やLLM連携の実装をやってきました。実務未経験OKと明記されている点にも背中を押されました。React + TypeScript + AIの技術スタックはLoreでそのまま使っているもので、顧客向けのAIソリューション開発にすぐ入れると考えています。教育事業とAI開発事業の両方を持つ環境で、技術力を伸ばしながら貢献したいです。`,
  "ナレッジワーク": `Google Chrome開発出身のCTO川中さんが率いるフロントエンドチームで開発できる環境に強く惹かれました。ナレッジワークが「セールスイネーブルメント」という領域で、営業の成果創出と能力向上を支援するSaaSを作っているのも面白い。シリーズBで45億調達、年収帯も高く、プロダクトの質にこだわれる環境だと感じます。React + TypeScript + Protocol Buffersという技術スタックは、自分がLoreで培ったフロントエンド開発力を活かしつつ、バックエンド連携の新しい設計パターンを学べる良い組み合わせです。UXの実現をフロントエンドグループが担うという姿勢にも共感します。`,
  "Hotpot Inc.": `Hotpot.aiの「AIで誰でもプロ品質のデザインを作れる」というプロダクトコンセプトに面白さを感じました。画像生成・写真編集・コピーライティングをAIで自動化するツール群は、まさに「AIをどう使いこなすか」が価値になる領域です。自分はLoreの開発で、Claude Codeを使ったプロンプト設計やAIとの対話最適化を毎日やってきました。AIの出力を実用レベルに引き上げるためのプロンプト設計は、Lore開発の中で最も時間をかけた部分でもあります。生成AIのポテンシャルを引き出すプロンプトエンジニアとして、自分の実践経験を活かせると考えています。`,
  "ちょっと株式会社": `日本初のVercelエキスパートパートナーとして、Next.jsとVercelに特化したフロントエンド開発を手がけている点に惹かれました。年間50本以上のWebサイト制作を手がけながら、独自CMS「Orizm」も開発しているプロダクト力が面白いです。自分はLoreをReact + TypeScript + Viteで開発してきましたが、Next.jsへの関心も強く、ちょっと社のようなモダンFEに振り切った環境で技術を磨きたいと感じています。「テクノロジーをやさしく届ける」というミッションも、自分がLoreで目指した「AIの複雑さをユーザーから隠す」設計思想と通じるところがあります。`,
  "イクシアス": `AI搭載の店舗マーケティングSaaS「STOREPAD」のプロダクトに惹かれました。Googleビジネスプロフィールや各SNSの店舗情報を一括管理し、AIで集客を最適化するというコンセプトが面白い。5.1億円の資金調達を経てプロダクトの成長フェーズにある環境で、ポテンシャル採用として参加できるのがありがたいです。自分はLoreの開発で、AIを活用したデータの構造化と分析をやってきました。TypeScriptでの開発経験を活かしつつ、リクルート出身CTOのもとで高速開発のスキルを吸収したいです。`,
  "ラッコ": `ラッコキーワードやラッコM&Aなど、Webマーケターやサイト運営者にとって「ないと困る」レベルのツールを複数作っている会社で働けるのは面白そうだと思いました。Claude/Devinを実際の開発に導入済みという点が大きくて、自分はLoreの全開発をClaude Codeで行っているので、AI駆動開発のワークフローをそのまま活かせます。React + Next.js + TypeScriptのスタックもLoreで日常的に使っている技術です。完全自社サービスで、プロダクトの成長をダイレクトに感じながら開発できる環境に惹かれています。`,
  "ムダレス": `ソニーグループの製造現場経験を持つメンバーが立ち上げた、製造業の復活支援ベンチャーという背景に興味を持ちました。設備診断・分析からDXによる生産性向上まで一気通貫で支援する中で、自社プロダクトとしてOSを開発しているのが面白い。自分はLoreの開発でゼロからプロダクトを立ち上げた経験があり、0→1フェーズの開発に強い関心があります。年収上限1200万という評価制度も、実力で勝負できる環境だと感じています。スタートアップの初期フェーズで、プロダクト開発の中心メンバーとして貢献したいです。`,
  "オープングループ_AI": `RPAの「BizRobo!」やクラウドRPA「AUTORO」を展開するオープングループが、AIエージェント開発に注力している点に惹かれました。Webサービスだけでなく、AIエージェント、デスクトップアプリやChrome拡張機能など、多様なプロダクトの開発に関われるのが面白い。自分はLoreの開発でChrome拡張を作った経験があり、AI + Chrome拡張という組み合わせはまさにやってきたことです。Claude Codeを使った開発経験も直接活かせるポジションだと感じています。`,
  "HERP": `HERP AI Recruiterの「採用プロセス全体をAIが支援する」というプロダクトに強く惹かれました。書類選考のスクリーニング補助から面接の書き起こし・評価下書きまで、LLMを採用業務に実装しているのが面白い。自分はLoreの開発で、AIの出力を構造化して再利用可能にする設計をやってきたので、HERP AI Recruiterのようなプロダクトには直接活かせる経験があります。React + TypeScript + LLMという技術スタックもLoreとほぼ同じです。ストックオプション全員付与という制度も、長期でコミットする動機づけとして魅力的です。`,
  "NaLaLys": `メールやチャットなどの社内コミュニケーションデータをAIで分析して、不正リスクを検知するSaaSというプロダクトに強く興味を持ちました。ハラスメント・贈収賄・会計不正・情報漏洩といった多様なリスクをAIで予兆段階から検知するという発想が面白い。自分はLoreの開発で、AIの出力を構造化・分析して意味のある情報に変換する設計をやってきました。シード期の初期メンバーとして、プロダクトの0→1フェーズから関われるのも魅力的です。React + TypeScript + Cursorのスタックで、AI SaaSの立ち上げに貢献したいです。`,
  "RIT": `RITの「0→1の事業創出を高速で回す」という開発スタイルに共感しました。戦略からデザイン、開発、グロースまで一気通貫で新規事業を支援する中で、コードが市場価値に直結する経験を積めるのが面白い。自分はLoreの開発で、まさに0→1のプロダクト開発を1人で企画からローンチまでやりました。太陽HDグループの安定基盤のもとでスタートアップ的な挑戦ができる環境も魅力的です。ジュニア枠での採用ということで、経験の浅さを素直に認めつつ、個人開発で培ったスピード感を持ち込みたいです。`,
  "カミナシ": `「ノンデスクワーカーの才能を解き放つ」というミッションに共感しました。紙やExcelで行われていた現場業務をノーコードでアプリ化する「カミナシ」が、製造業・飲食・物流など30業種、1万箇所以上の現場で実際に使われているのは説得力があります。React + TypeScriptのスタックもLoreと同じで、自分が開発で培った技術をそのまま活かせます。現場のDXという、ソフトウェアが実際に人の働き方を変える領域で、フルリモートからプロダクト開発に貢献したいです。`,
  "オープングルーヴ": `「100%プライム×大手直受託で、堅実な設計を追求」というスタンスに共感しました。未踏ソフトの公募に参加するエンジニアやOSSカンファレンスのパネラーが在籍しているという技術力の高さも惹かれるポイントです。自分はLoreの開発を通じてGitHubにコードを公開しており、個人開発のGitHubを評価してくれる姿勢がありがたいです。実務未経験ですが、技術力の高いメンバーから設計の考え方を学びながら、フルリモートで集中して開発に取り組める環境で成長したいと考えています。`,
  "クラフトバンク": `建設業向けのオールインワンSaaS「クラフトバンクオフィス」で、1万4,000人以上の職人が日常的に使っているプロダクトを開発しているスケール感に惹かれました。内装工事会社発のスタートアップという出自もユニークで、現場の実感に根ざしたプロダクト開発ができる環境だと感じます。SPA + Git経験のみで応募できる間口の広さがありがたく、自分のLoreでの開発経験で十分に技術要件を満たせます。建設業の60兆円市場をDXで変えるという事業ビジョンに共感します。`,
  "ココロザシ": `最先端のWeb技術を使ったシステム開発を提案するココロザシの技術志向に共感しました。TypeScript + Next.jsでバックエンドもフロントエンドも一貫して開発する環境は、自分がLoreで培ったTypeScriptの経験を活かしつつ、バックエンド側のスキルを伸ばせる成長機会として魅力的です。アジャイル型で最適なシステムを提案する開発スタイルは、自分がLoreでAIと対話しながら素早くイテレーションを回してきたやり方と相性が良いと感じています。未経験OKの環境で、TSフルスタックの力を身につけたいです。`,
  "アップストリーム": `テレビ局向けの動画配信基盤を開発している会社で、民放初の常時同時配信サービスをリリースした実績に惹かれました。テレビのコンテンツをインターネットに開放するという事業ビジョンが面白い。React + TypeScriptを使った自社プロダクト開発ができる環境で、動画配信という大規模トラフィックを扱うフロントエンド開発に挑戦できるのは成長機会として魅力的です。自分はLoreの開発でReact + TypeScript + Reduxを使った状態管理の設計経験があり、技術力を評価してくれる文化にも共感します。`,
  "トレードワルツ": `ブロックチェーンを活用した貿易プラットフォームで、商流・物流・金流を一気通貫でデジタル化するという事業ドメインの大きさに惹かれました。APECのナショナルプロジェクトとして5カ国間接続に成功しているスケール感も面白い。Claude Codeを開発に取り入れている点が自分には大きくて、Loreの全開発をClaude Codeで行ってきた経験がそのまま活きます。React + TypeScript + Vite/Vitestという技術スタックもLoreと完全一致しています。グローバルな社会インフラに関わるプロダクト開発に携わりたいです。`,
  "オートロ": `クラウド型RPA「AUTORO」の、ブラウザ自動化をノーコードで実現するというプロダクトコンセプトに惹かれました。100種類以上のアクションを組み合わせて業務を自動化するという設計は、自分がLoreで作った「AIの会話を構造化して再利用可能にする」仕組みと発想が近いです。自社AI RPAプロダクトにLLMを組み合わせたAIエージェント開発ができるポジションは、自分のClaude Code活用経験とフロントエンド開発力の両方を活かせると感じています。フルリモートで自社プロダクト開発に集中できる環境も魅力的です。`,
  "ナウキャスト": `東大発のオルタナティブデータ企業が、金融×LLMという領域で新しいプロダクトを作っている点に興味があります。決算短信からのデータ抽出やファイナンシャルアドバイザリー支援など、LLMの実用的な活用事例を持っているのが面白い。自分はLoreの開発で、コーディングエージェントとしてのLLM活用を日常的にやっており、「LLM経験 = コーディングエージェント利用でOK」という要件にぴったり合います。国内外250社以上の金融機関にサービスを提供している事業規模で、LLMを金融データに応用する開発に挑戦したいです。`,
  "オープングループ_FS": `オープングループの新規サービス0→1開発に携わるフルスタックエンジニアのポジションに興味があります。RPA・AI・SaaSで日本企業の生産性向上に取り組む事業ビジョンに共感しました。TypeScript + Node.jsで自社サービスの立ち上げから関われる環境は、自分がLoreでゼロからプロダクトを作った経験を活かしつつ、バックエンドも含めたフルスタック開発に挑戦できる機会です。年収上限1,036万という評価制度も、成果に見合った報酬が期待できる環境だと感じています。`,
  "SocialDog": `SNSアカウント管理ツールとして国内シェアNo.1を取っている「SocialDog」のプロダクトに惹かれました。Product-Led Growthで、営業を介さずプロダクト自体の価値で広がっていくという成長戦略が面白い。自分もLoreをProduct Huntでグローバルローンチした経験があるので、プロダクト主導のグロース思考には共感があります。React + TypeScript + Viteのスタックで自社SaaSを開発できる環境、社長がエンジニア出身で年4回昇給面談があるという評価制度も魅力的です。`,
  "カンリー": `Googleビジネスプロフィールやサイト集客媒体を一元管理するSaaSで、13万店舗以上に導入されているスケールの大きさに惹かれました。Cursor/Claude Codeを開発に導入している点が自分には嬉しくて、Loreの全開発をClaude Codeで行ってきたワークフローをそのまま持ち込めます。React + TypeScriptのスタックもLoreと同じです。店舗ビジネスのDXという、実際に街で使われているのが見えるプロダクトに関われるのは面白いと感じています。`,
  "miryo.AI": `「最速・最安のAIプロダクト開発」を掲げるmiryo.AIの、AIエージェントを活用した開発スタイルに興味があります。自分はLoreの開発で、AIエージェント（Claude Code）を使って1人でプロダクトを企画から設計・開発・ローンチまで完遂した経験があります。AIエージェントを活用した開発のリアルな知見は、まさにmiryo.AIが求めている実践力だと感じました。React + TypeScriptのスタックもLoreで日常的に使っている技術で、AI駆動のプロダクト開発に貢献できると考えています。`,
  "init": `iOSアカデミアというプログラミングスクール事業を運営しつつ、自社プロダクト開発にも取り組むinitの事業構成に面白さを感じました。「個の成長を通じて日本のテクノロジーを牽引する」というミッションは、自分がプログラミング未経験からAIを活用してプロダクトをローンチした経験と重なるところがあります。React + フロントエンド開発のポジションで、Loreで培った技術力を活かしつつ、チーム開発のプロセスを学びたいです。エンジニアの成長を大事にする文化の中で、早期に戦力になりたいと考えています。`,
  "Autify": `テスト自動化をノーコード × AIで実現する「Autify」のプロダクトに惹かれました。Loreの開発では自分でPlaywrightを使ったE2Eテストを書いてきたので、テスト自動化の難しさと価値は身をもって理解しています。AIでテストのメンテナンスを自動化するというアプローチは、自分が開発者として「欲しい」と思えるプロダクトです。React + TypeScriptのスタック、フルリモートで海外からも参加できる英語環境、グローバル展開しているSaaSのフロントエンド開発に挑戦したいです。Senior枠ですがチャレンジします。`,
  "テイラー": `Y Combinatorに採択された唯一の日本企業という事実にまず惹かれました。「Tailor Platform」で業務システムの共通バックエンド機能をAPI化し、企業が本当にカスタマイズすべき部分だけに集中できるようにするプロダクト設計が面白い。「誰もがデプロイできる社会を創る」というミッションは、自分がプログラミング未経験からAIを使ってプロダクトを作った経験と共鳴します。React + TypeScript + Next.jsのスタックもLoreで使っている技術です。経験要件は高めですが、YC出身のグローバル環境で挑戦したいです。`,
};

// ─── テンプレート定義 ───
const templates = {
  A: {
    label: "AI活用推し（AI系・スタートアップ向け）",
    text: `はじめまして。半谷尚弥と申します。

プログラミング経験のない状態から、Claude Code（AIコーディングツール）を使って
Webアプリケーション「Lore」を1人で企画・設計・開発・ローンチしました。

Loreは、AIとの会話履歴をプロジェクト単位の引き継ぎ文書に自動変換するPWAで、
React + TypeScript + Vite で構築しています。テスト1258本、8言語対応、
Chrome拡張も開発し、Product Huntでグローバルローンチしました。

御社の{{role}}に強く惹かれて応募しました。
{{motivation}}

僕の強みは「何を作るか」を定義して、AIを活用して最速で形にする力です。
実務でのチーム開発経験はまだありませんが、個人で0→1を完遂した経験と
キャッチアップの速さには自信があります。

お時間をいただけると嬉しいです。よろしくお願いいたします。

ポートフォリオ: https://even-grease-ce2.notion.site/Portfolio-71286b87732f4ba198f2562f93cd2c6e
GitHub: https://github.com/nao-lore/lore-app`,
  },
  B: {
    label: "ポテンシャル推し（未経験歓迎・育成系企業向け）",
    text: `はじめまして。半谷尚弥と申します。21歳です。

大学（経済学部）を中退後、AIツールを活用したプロダクト開発に取り組んでいます。
プログラミング経験はゼロでしたが、Claude Codeを使ってWebアプリ「Lore」を
1人で開発し、Product Huntでグローバルローンチするところまでやりました。

御社の{{role}}を拝見して、{{motivation_short}}

実務経験はまだありませんが、わからないことを自分で調べて解決する力と、
新しいことを素早く吸収する意欲には自信があります。
Loreの開発では、未知の技術領域に毎日ぶつかりながらも、
最終的にテスト1258本・8言語対応のプロダクトを完成させました。

チームでの開発プロセスを学びながら、早期に戦力になれるよう努力します。
ぜひ一度お話しする機会をいただけると嬉しいです。

ポートフォリオ: https://even-grease-ce2.notion.site/Portfolio-71286b87732f4ba198f2562f93cd2c6e
GitHub: https://github.com/nao-lore/lore-app`,
  },
  C: {
    label: "ビジネス推し（事業企画・PdM系ポジション向け）",
    text: `はじめまして。半谷尚弥と申します。

個人プロダクト「Lore」の開発を通じて、市場調査・競合分析・ポジショニング策定から、
プロダクト設計・開発・ローンチまでを一気通貫で経験しました。

Loreは、AIとの会話履歴をプロジェクト単位で構造化するツールです。
「AIのコンテキストロス」という課題を発見し、競合との差別化ポイントを明確にした上で、
フリーミアムモデルの価格設計、Product Huntでのグローバルローンチ戦略まで
全て1人で設計・実行しました。

御社の{{role}}に共感して応募しました。
{{motivation}}

「何を作るべきか」を見極め、AIを活用して最速で検証する力が僕の武器です。
御社のプロダクト開発に貢献できると考えています。

ポートフォリオ: https://even-grease-ce2.notion.site/Portfolio-71286b87732f4ba198f2562f93cd2c6e
GitHub: https://github.com/nao-lore/lore-app`,
  },
};

// ─── テンプレート自動選択ロジック ───
function pickTemplate(company) {
  const c = company.conditions.toLowerCase() + " " + company.role.toLowerCase();
  if (/未経験|ポテンシャル|ジュニア|未経験ok/i.test(c)) return "B";
  if (/ai|llm|プロンプト|エージェント/i.test(c)) return "A";
  if (/pdm|事業|企画|0→1/i.test(c)) return "C";
  return "A"; // デフォルト
}

// ─── 応募文生成 ───
function generateApplication(company, templateKey) {
  const tpl = templates[templateKey];
  const motivation = motivations[company.name] || "【志望動機を記入してください】";
  // 志望動機の最初の1文を短縮版として使う
  const motivationShort = motivation.split("。")[0] + "。";

  let text = tpl.text
    .replace(/\{\{role\}\}/g, company.role)
    .replace(/\{\{motivation\}\}/g, motivation)
    .replace(/\{\{motivation_short\}\}/g, motivationShort);

  return text;
}

// ─── CSV管理 ───
function loadApplied() {
  if (!existsSync(CSV_PATH)) {
    writeFileSync(CSV_PATH, "日時,企業名,Tier,スコア,媒体,URL\n", "utf-8");
    return new Set();
  }
  const lines = readFileSync(CSV_PATH, "utf-8").trim().split("\n").slice(1);
  return new Set(lines.map((l) => l.split(",")[1]));
}

function markApplied(company) {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const line = `${now},${company.name},${company.tier},${company.score},${company.platform},${company.url}\n`;
  appendFileSync(CSV_PATH, line, "utf-8");
}

// ─── クリップボード（macOS） ───
function copyToClipboard(text) {
  try {
    execSync("pbcopy", { input: text, encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
}

// ─── 企業検索 ───
function findCompany(query) {
  const q = query.trim().toLowerCase();
  // 完全一致
  let found = companies.find((c) => c.name.toLowerCase() === q);
  if (found) return found;
  // 部分一致
  const matches = companies.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.role.toLowerCase().includes(q) ||
      c.conditions.toLowerCase().includes(q)
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return matches; // 複数候補
  return null;
}

// ─── 表示ヘルパー ───
const TIER_COLORS = { S: "\x1b[35m", A: "\x1b[36m", B: "\x1b[33m", C: "\x1b[90m" };
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";

function formatCompany(c, applied) {
  const isApplied = applied.has(c.name);
  const mark = isApplied ? `${GREEN}[済]${RESET}` : `${DIM}[ ]${RESET}`;
  const tierColor = TIER_COLORS[c.tier] || "";
  return `  ${mark} ${tierColor}[${c.tier}]${RESET} ${BOLD}${c.name}${RESET} ${DIM}(${c.score}点)${RESET} — ${c.role} | ${c.salary} | ${c.platform}`;
}

function printCompanyDetail(c) {
  const tierColor = TIER_COLORS[c.tier] || "";
  console.log(`
${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}
  ${tierColor}Tier ${c.tier}${RESET} | ${BOLD}${c.name}${RESET} — ${c.role}
${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}
  スコア:  ${c.score}点
  年収:    ${c.salary}
  条件:    ${c.conditions}
  媒体:    ${c.platform}
  URL:     ${c.url}
  志望動機: ${motivations[c.name] ? "あり" : `${RED}なし（手入力が必要）${RESET}`}
`);
}

// ─── メインCLI ───
function main() {
  const applied = loadApplied();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `\n${BOLD}apply>${RESET} `,
  });

  console.log(`
${BOLD}╔══════════════════════════════════════════════════╗
║          就活応募ヘルパー v1.0                   ║
║  コマンド: list / next / apply / done / status   ║
║  search / help / quit                            ║
╚══════════════════════════════════════════════════╝${RESET}
`);

  console.log(`  企業数: ${companies.length}社 | 応募済み: ${applied.size}社 | 未応募: ${companies.length - applied.size}社`);

  rl.prompt();

  rl.on("line", (input) => {
    const line = input.trim();
    if (!line) {
      rl.prompt();
      return;
    }

    const [cmd, ...args] = line.split(/\s+/);
    const arg = args.join(" ");

    switch (cmd.toLowerCase()) {
      case "list": {
        const tierFilter = arg.toUpperCase();
        const tiers = ["S", "A", "B", "C"];
        for (const tier of tiers) {
          if (tierFilter && tierFilter !== tier) continue;
          const tierCompanies = companies.filter((c) => c.tier === tier);
          console.log(`\n${BOLD}${TIER_COLORS[tier]}━━━ Tier ${tier} (${tierCompanies.length}社) ━━━${RESET}`);
          for (const c of tierCompanies) {
            console.log(formatCompany(c, applied));
          }
        }
        break;
      }

      case "next": {
        const next = companies.find((c) => !applied.has(c.name));
        if (!next) {
          console.log(`\n  ${GREEN}全企業に応募済みです！${RESET}`);
        } else {
          console.log(`\n  ${BOLD}次の未応募企業:${RESET}`);
          printCompanyDetail(next);
          console.log(`  ${DIM}→ "apply ${next.name}" で応募文を生成${RESET}`);
        }
        break;
      }

      case "apply": {
        if (!arg) {
          console.log(`\n  ${RED}使い方: apply <企業名>${RESET}`);
          break;
        }
        const result = findCompany(arg);
        if (!result) {
          console.log(`\n  ${RED}「${arg}」に一致する企業が見つかりません${RESET}`);
          break;
        }
        if (Array.isArray(result)) {
          console.log(`\n  複数の候補があります:`);
          result.forEach((c) => console.log(`    - ${c.name} (${c.role})`));
          console.log(`  ${DIM}もう少し絞り込んでください${RESET}`);
          break;
        }

        const company = result;
        printCompanyDetail(company);

        const autoTpl = pickTemplate(company);
        console.log(`  ${DIM}推奨テンプレート: ${autoTpl} (${templates[autoTpl].label})${RESET}`);
        console.log(`  ${DIM}他のテンプレート: A / B / C${RESET}`);

        rl.question(`  テンプレート [${autoTpl}]: `, (answer) => {
          const tplKey = (answer.trim().toUpperCase() || autoTpl);
          if (!templates[tplKey]) {
            console.log(`  ${RED}無効なテンプレート: ${tplKey}${RESET}`);
            rl.prompt();
            return;
          }

          const appText = generateApplication(company, tplKey);
          console.log(`\n${DIM}─── 生成された応募文 ───${RESET}\n`);
          console.log(appText);
          console.log(`\n${DIM}─── ここまで ───${RESET}`);

          if (copyToClipboard(appText)) {
            console.log(`\n  ${GREEN}クリップボードにコピーしました！${RESET}`);
          } else {
            console.log(`\n  ${RED}クリップボードへのコピーに失敗しました${RESET}`);
          }

          if (applied.has(company.name)) {
            console.log(`  ${DIM}(この企業は応募済みです)${RESET}`);
          } else {
            rl.question(`  応募済みにしますか？ [y/N]: `, (yn) => {
              if (yn.trim().toLowerCase() === "y") {
                markApplied(company);
                applied.add(company.name);
                console.log(`  ${GREEN}${company.name} を応募済みにしました${RESET}`);
              }
              rl.prompt();
            });
            return;
          }
          rl.prompt();
        });
        return; // promptはcallback内で呼ぶ
      }

      case "done": {
        if (!arg) {
          console.log(`\n  ${RED}使い方: done <企業名>${RESET}`);
          break;
        }
        const result = findCompany(arg);
        if (!result) {
          console.log(`\n  ${RED}「${arg}」に一致する企業が見つかりません${RESET}`);
          break;
        }
        if (Array.isArray(result)) {
          console.log(`\n  複数の候補があります:`);
          result.forEach((c) => console.log(`    - ${c.name} (${c.role})`));
          break;
        }
        if (applied.has(result.name)) {
          console.log(`\n  ${DIM}${result.name} は既に応募済みです${RESET}`);
        } else {
          markApplied(result);
          applied.add(result.name);
          console.log(`\n  ${GREEN}${result.name} を応募済みにしました${RESET}`);
        }
        break;
      }

      case "status": {
        const tiers = ["S", "A", "B", "C"];
        console.log(`\n${BOLD}  応募状況サマリー${RESET}\n`);
        let totalApplied = 0;
        let totalCompanies = 0;
        for (const tier of tiers) {
          const tierCo = companies.filter((c) => c.tier === tier);
          const tierApplied = tierCo.filter((c) => applied.has(c.name));
          totalApplied += tierApplied.length;
          totalCompanies += tierCo.length;
          const bar = tierCo
            .map((c) => (applied.has(c.name) ? `${GREEN}█${RESET}` : `${DIM}░${RESET}`))
            .join("");
          console.log(`  ${TIER_COLORS[tier]}Tier ${tier}${RESET}: ${bar} ${tierApplied.length}/${tierCo.length}`);
        }
        console.log(`\n  ${BOLD}合計: ${totalApplied}/${totalCompanies}社 応募済み${RESET}`);
        const pct = totalCompanies > 0 ? Math.round((totalApplied / totalCompanies) * 100) : 0;
        console.log(`  ${DIM}進捗: ${pct}%${RESET}`);
        break;
      }

      case "search": {
        if (!arg) {
          console.log(`\n  ${RED}使い方: search <キーワード>${RESET}`);
          break;
        }
        const q = arg.toLowerCase();
        const results = companies.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.role.toLowerCase().includes(q) ||
            c.conditions.toLowerCase().includes(q) ||
            c.platform.toLowerCase().includes(q) ||
            c.salary.toLowerCase().includes(q)
        );
        if (results.length === 0) {
          console.log(`\n  ${RED}「${arg}」に一致する企業はありません${RESET}`);
        } else {
          console.log(`\n  ${BOLD}検索結果: ${results.length}件${RESET}`);
          for (const c of results) {
            console.log(formatCompany(c, applied));
          }
        }
        break;
      }

      case "url": {
        if (!arg) {
          console.log(`\n  ${RED}使い方: url <企業名>${RESET}`);
          break;
        }
        const result = findCompany(arg);
        if (!result || Array.isArray(result)) {
          console.log(`\n  ${RED}企業が見つかりません（もう少し絞り込んでください）${RESET}`);
          break;
        }
        if (copyToClipboard(result.url)) {
          console.log(`\n  ${GREEN}${result.name} のURLをクリップボードにコピーしました${RESET}`);
          console.log(`  ${DIM}${result.url}${RESET}`);
        }
        break;
      }

      case "help":
        console.log(`
${BOLD}コマンド一覧:${RESET}
  ${BOLD}list${RESET} [S/A/B/C]     Tier別に全企業を一覧表示（Tier指定でフィルタ）
  ${BOLD}next${RESET}               次の未応募企業を表示
  ${BOLD}apply${RESET} <企業名>     応募文を生成してクリップボードにコピー
  ${BOLD}done${RESET} <企業名>      応募済みマークをつける
  ${BOLD}status${RESET}             応募状況サマリーを表示
  ${BOLD}search${RESET} <キーワード> 企業名/条件/媒体で検索
  ${BOLD}url${RESET} <企業名>       企業のURLをクリップボードにコピー
  ${BOLD}help${RESET}               このヘルプを表示
  ${BOLD}quit${RESET}               終了

${BOLD}テンプレート:${RESET}
  A — AI活用推し（AI系・スタートアップ向け）
  B — ポテンシャル推し（未経験歓迎・育成系企業向け）
  C — ビジネス推し（事業企画・PdM系ポジション向け）
`);
        break;

      case "quit":
      case "exit":
      case "q":
        console.log(`\n  ${DIM}応募頑張って！${RESET}\n`);
        rl.close();
        process.exit(0);
        break;

      default:
        console.log(`\n  ${RED}不明なコマンド: ${cmd}${RESET} — "help" でコマンド一覧を確認`);
    }

    rl.prompt();
  });

  rl.on("close", () => process.exit(0));
}

main();
