#!/usr/bin/env node
/**
 * Lore — Product Hunt Launch Day Operator
 * Usage: node scripts/ph-launch.mjs
 *
 * Guides you through every step of the PH launch day,
 * auto-copies text to clipboard, and tracks progress.
 */

import { createInterface } from "readline";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// ── Config ──────────────────────────────────────────────
const PROGRESS_FILE = join(import.meta.dirname, ".ph-launch-progress.json");
const REDDIT_DIR = "/Users/nn/Downloads/lore-project/Reddit";

const URLS = {
  site: "https://loresync.dev",
  github: "https://github.com/nao-lore/lore-app",
  vercel: "https://vercel.com/dashboard",
  vercelStatus: "https://www.vercel-status.com/",
  sentry: "https://sentry.io/",
  ga4: "https://analytics.google.com/",
  aiStudio: "https://aistudio.google.com/",
  redditSideProject: "https://reddit.com/r/SideProject",
  redditClaudeAI: "https://reddit.com/r/ClaudeAI",
};

const PROMO_CODE = "PHLORE2026";

// ── Utilities ───────────────────────────────────────────
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

function pbcopy(text) {
  try {
    execSync("pbcopy", { input: text, encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
}

function openUrl(url) {
  try {
    execSync(`open "${url}"`, { stdio: "ignore" });
  } catch { /* ignore */ }
}

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
  }
  return { completed: [], phUrl: "", metrics: {} };
}

function saveProgress(progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function readRedditPost(filename) {
  const p = join(REDDIT_DIR, filename);
  if (existsSync(p)) return readFileSync(p, "utf-8");
  return null;
}

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const bgGreen = (s) => `\x1b[42m\x1b[30m ${s} \x1b[0m`;
const bgYellow = (s) => `\x1b[43m\x1b[30m ${s} \x1b[0m`;

function banner(text) {
  const line = "═".repeat(60);
  console.log(`\n${cyan(line)}`);
  console.log(cyan(`  ${text}`));
  console.log(`${cyan(line)}\n`);
}

function sectionHeader(time, title) {
  console.log(`\n${bold(yellow(`── [${time}] ${title} ──`))}\n`);
}

async function confirm(msg = "完了したら Enter を押す...") {
  await ask(dim(`  ${msg} `));
}

async function copyAndConfirm(label, text) {
  if (pbcopy(text)) {
    console.log(green(`  >> "${label}" をクリップボードにコピーしました`));
  } else {
    console.log(red(`  >> クリップボードコピー失敗。手動でコピーしてください:`));
    console.log(dim(text.slice(0, 200) + "..."));
  }
  await confirm();
}

// ── Text Data ───────────────────────────────────────────
const FIRST_COMMENT = `If you use AI for anything beyond one-off questions, you know the feeling:
you open a new conversation, and the AI has no idea what you were working
on yesterday. You re-explain the project. You re-state the decisions.
You try to remember where you left off. It's like onboarding a new
teammate every single day.

That's the problem Lore solves. Here's how it works in practice:

Step 1: Capture. Paste a conversation from Claude, ChatGPT, or Gemini
into Lore -- or use the Chrome extension to capture it directly from
the chat interface.

Step 2: Extract. Lore processes the conversation and pulls out structured
context: what was decided (and why), open TODOs with priorities, blockers,
and a resume checklist that tells you exactly where to pick up.

Step 3: Continue. Next time you start a session, the Chrome extension
injects your project context into the AI with one click. No copy-pasting,
no re-explaining.

Each snapshot feeds into a project dashboard, so over weeks and months
you build up a structured history of your AI-assisted work. You can see
what's stale, what's blocked, and what's progressing -- across all your
projects and providers.

On the Chrome extension: it works with Claude, ChatGPT, and Gemini.
One click to capture a conversation, one click to inject context back.
It's the piece that closes the loop and makes the whole workflow feel
seamless.

On the tech side: Lore is a React + TypeScript PWA built with Vite.
It runs entirely in your browser -- no backend, no database, no account.
Your data stays on your device in IndexedDB. The codebase has 780 tests
and is fully open source: github.com/nao-lore/lore-app

PH exclusive: Use code PHLORE2026 for 1 month of Pro, completely free.
No credit card, no strings.

I built this solo because I needed it for my own workflow. If you work
with AI regularly, I think you'll find it useful too. Happy to answer
any questions here.`;

function tweetJp1() {
  return `AIで開発してて一番めんどくさいのは、毎朝「昨日何やったっけ」をAIに説明し直すこと。
会話をペーストしたら、決定事項・TODO・ブロッカー・再開チェックリストを自動で構造化するツールを作った。
今日Product Huntでローンチします。`;
}

function tweetJp2(phUrl) {
  return `loresync.dev
Product Hunt: ${phUrl || "[PHリンク]"}
プログラミング未経験から1人で作りました。
フィードバックもらえると嬉しいです。`;
}

function tweetEn(phUrl) {
  return `Launching on Product Hunt today.
Lore turns AI conversations into structured project context -- decisions, TODOs, blockers, resume checklist. Paste a chat from Claude/ChatGPT/Gemini and get a project briefing in 30 seconds.
Free, open source, no signup.
${phUrl || "[PHリンク]"}`;
}

function replacePhUrl(text, url) {
  return text
    .replace(/\[PH_URL\]/g, url)
    .replace(/\[PHリンク\]/g, url)
    .replace(/\[PH link\]/g, url);
}

// ── Steps ───────────────────────────────────────────────
const STEPS = [
  // ── SECTION: 前夜準備 ──
  {
    id: "prep_tabs",
    time: "前日 3/26 夜",
    title: "ブラウザにタブを全て開く",
    type: "auto",
    action: async () => {
      console.log("  以下のタブを自動で開きます:");
      const tabs = [
        ["loresync.dev", URLS.site],
        ["Vercel Dashboard", URLS.vercel],
        ["Sentry Dashboard", URLS.sentry],
        ["GA4 リアルタイム", URLS.ga4],
        ["r/SideProject", URLS.redditSideProject],
        ["r/ClaudeAI", URLS.redditClaudeAI],
      ];
      for (const [name, url] of tabs) {
        console.log(`    ${green("+")} ${name}`);
        openUrl(url);
      }
      console.log(dim("\n  ※ PH管理画面・X・dev.to は手動で開いてください"));
      await confirm();
    },
  },
  {
    id: "prep_print",
    time: "前日 3/26 夜",
    title: "手順書を別モニタに表示",
    type: "manual",
    action: async () => {
      console.log("  [ ] この手順書をプリントまたは別モニタに常時表示");
      await confirm();
    },
  },
  {
    id: "prep_notifications",
    time: "前日 3/26 夜",
    title: "スマホ通知ON",
    type: "manual",
    action: async () => {
      console.log("  [ ] スマホ通知ON: PH、X、Reddit、メール");
      await confirm();
    },
  },
  {
    id: "prep_first_comment",
    time: "前日 3/26 夜",
    title: "First Comment をクリップボードにコピー",
    type: "auto",
    action: async () => {
      await copyAndConfirm("First Comment", FIRST_COMMENT);
    },
  },
  {
    id: "prep_supplies",
    time: "前日 3/26 夜",
    title: "充電器・飲み物・軽食を準備",
    type: "manual",
    action: async () => {
      console.log("  [ ] 充電器・飲み物・軽食を手元に準備");
      await confirm();
    },
  },
  {
    id: "prep_alarms",
    time: "前日 3/26 夜",
    title: "アラーム設定",
    type: "manual",
    action: async () => {
      console.log("  [ ] アラーム設定: 15:50, 0:00, 3:00, 6:00, 9:00");
      await confirm();
    },
  },

  // ── SECTION: 15:50 スタンバイ ──
  {
    id: "standby_site",
    time: "15:50",
    title: "loresync.dev 動作確認",
    type: "auto",
    action: async () => {
      console.log("  loresync.dev にアクセスして動作確認中...");
      try {
        execSync("curl -s -o /dev/null -w '%{http_code}' https://loresync.dev", {
          encoding: "utf-8",
          timeout: 10000,
        });
        const code = execSync(
          "curl -s -o /dev/null -w '%{http_code}' https://loresync.dev",
          { encoding: "utf-8", timeout: 10000 }
        ).trim();
        if (code === "200") {
          console.log(green("  >> loresync.dev: HTTP 200 OK"));
        } else {
          console.log(red(`  >> loresync.dev: HTTP ${code} -- 確認してください!`));
        }
      } catch {
        console.log(red("  >> loresync.dev に接続できません! 確認してください!"));
      }
      await confirm();
    },
  },
  {
    id: "standby_vercel",
    time: "15:50",
    title: "Vercel デプロイ状態確認",
    type: "manual",
    action: async () => {
      console.log("  [ ] Vercel Dashboard でデプロイ状態が Ready か確認");
      openUrl(URLS.vercel);
      await confirm();
    },
  },
  {
    id: "standby_sentry",
    time: "15:50",
    title: "Sentry エラー確認",
    type: "manual",
    action: async () => {
      console.log("  [ ] Sentry でエラーが出ていないか確認");
      openUrl(URLS.sentry);
      await confirm();
    },
  },
  {
    id: "standby_ph_preview",
    time: "15:50",
    title: "PH プロダクトページ最終確認",
    type: "manual",
    action: async () => {
      console.log("  [ ] PH プロダクトページのプレビューを最終確認");
      await confirm();
    },
  },

  // ── SECTION: 16:01 PH公開 ──
  {
    id: "ph_live",
    time: "16:01",
    title: "PH公開確認 & URL取得",
    type: "input",
    action: async (progress) => {
      console.log("  [ ] PH プロダクトページが公開されたことを確認");
      if (progress.phUrl) {
        console.log(green(`  >> 既に記録済み: ${progress.phUrl}`));
        const change = await ask(dim("  変更する? (y/N) "));
        if (change.toLowerCase() !== "y") return;
      }
      const url = await ask(bold("  PH URL を入力: "));
      if (url.trim()) {
        progress.phUrl = url.trim();
        saveProgress(progress);
        pbcopy(url.trim());
        console.log(green(`  >> 保存 & コピーしました: ${url.trim()}`));
      }
    },
  },

  // ── SECTION: 16:05 First Comment ──
  {
    id: "first_comment",
    time: "16:05",
    title: "First Comment 投稿",
    type: "auto",
    action: async (progress) => {
      console.log("  [ ] PH プロダクトページのコメント欄を開く");
      console.log("  [ ] 以下の First Comment を投稿:\n");
      console.log(dim(FIRST_COMMENT.split("\n").map((l) => `    ${l}`).join("\n")));
      console.log("");
      await copyAndConfirm("First Comment", FIRST_COMMENT);
      console.log("  [ ] 投稿後、リンクが正しくクリッカブルか確認");
      await confirm();
    },
  },

  // ── SECTION: 16:10 X投稿 ──
  {
    id: "tweet_jp1",
    time: "16:10",
    title: "X: ツイート1（日本語、リンクなし）",
    type: "auto",
    action: async () => {
      const text = tweetJp1();
      console.log(dim(text.split("\n").map((l) => `    ${l}`).join("\n")));
      await copyAndConfirm("ツイート1（日本語）", text);
    },
  },
  {
    id: "tweet_jp2",
    time: "16:10",
    title: "X: ツイート2（ツイート1へのリプライ）",
    type: "auto",
    action: async (progress) => {
      const text = tweetJp2(progress.phUrl);
      console.log(dim(text.split("\n").map((l) => `    ${l}`).join("\n")));
      await copyAndConfirm("ツイート2（リプライ）", text);
    },
  },
  {
    id: "tweet_en",
    time: "16:15",
    title: "X: ツイート3（英語版）",
    type: "auto",
    action: async (progress) => {
      const text = tweetEn(progress.phUrl);
      console.log(dim(text.split("\n").map((l) => `    ${l}`).join("\n")));
      await copyAndConfirm("ツイート3（英語）", text);
    },
  },

  // ── SECTION: 16:20 Reddit r/SideProject ──
  {
    id: "reddit_sideproject",
    time: "16:20",
    title: "Reddit r/SideProject 投稿",
    type: "auto",
    action: async (progress) => {
      const raw = readRedditPost("reddit-ph-sideproject.txt");
      if (!raw) {
        console.log(red("  >> reddit-ph-sideproject.txt が見つかりません"));
        await confirm();
        return;
      }
      const post = replacePhUrl(raw, progress.phUrl || "[PH_URL]");
      const lines = post.split("\n");
      const titleLine = lines.find((l) => l.startsWith("Title:"));
      const bodyStart = lines.findIndex((l) => l.startsWith("Body:"));
      const title = titleLine?.replace("Title: ", "") || "";
      const body = lines.slice(bodyStart + 2).join("\n").trim();

      console.log(`  ${bold("Title:")} ${title}`);
      console.log(`  ${bold("Subreddit:")} r/SideProject`);
      console.log(dim(`\n${body.split("\n").map((l) => `    ${l}`).join("\n")}\n`));

      // Copy title first
      pbcopy(title);
      console.log(green("  >> Title をクリップボードにコピーしました"));
      await confirm("Title を貼り付けたら Enter...");

      // Then copy body
      pbcopy(body);
      console.log(green("  >> Body をクリップボードにコピーしました"));
      await confirm("Body を貼り付けて投稿したら Enter...");

      console.log("  [ ] フレアが正しいか確認");
      await confirm();
    },
  },

  // ── SECTION: 16:30 Reddit r/ClaudeAI ──
  {
    id: "reddit_claudeai",
    time: "16:30",
    title: "Reddit r/ClaudeAI 投稿",
    type: "manual",
    action: async (progress) => {
      console.log(`  ${bold("Flair:")} Built with Claude`);
      console.log(
        `  ${bold("Title:")} Built with Claude: a tool that extracts structured context from AI conversations -- launching on Product Hunt today`
      );
      const title =
        "Built with Claude: a tool that extracts structured context from AI conversations -- launching on Product Hunt today";
      pbcopy(title);
      console.log(green("  >> Title をクリップボードにコピーしました"));
      await confirm("Title を貼り付けたら Enter...");

      console.log(dim("  ※ Body は PH当日ドラフト.md のセクション2を使用"));
      console.log(dim(`  ※ [PH link] → ${progress.phUrl || "[未設定]"}`));
      await confirm();
    },
  },

  // ── SECTION: 16:45 dev.to ──
  {
    id: "devto_publish",
    time: "16:45",
    title: "dev.to 記事公開",
    type: "manual",
    action: async (progress) => {
      console.log("  [ ] dev.to の記事編集画面を開く");
      console.log("  [ ] published: false → published: true に変更");
      console.log("  [ ] URL が loresync.dev になっているか確認");
      console.log(`  [ ] PH リンクを末尾に追記: ${progress.phUrl || "[未設定]"}`);
      console.log("  [ ] Publish");
      if (progress.phUrl) {
        pbcopy(progress.phUrl);
        console.log(green("  >> PH URL をクリップボードにコピーしました"));
      }
      await confirm();
    },
  },

  // ── SECTION: 17:00 メール ──
  {
    id: "email_send",
    time: "17:00",
    title: "ローンチメール配信",
    type: "manual",
    action: async (progress) => {
      console.log("  [ ] Buttondown（またはResend）でローンチメールを送信");
      console.log("  [ ] docs/ph-launch-email.md の内容を使用");
      console.log(`  [ ] PH リンクを挿入: ${progress.phUrl || "[未設定]"}`);
      await confirm();
    },
  },

  // ── SECTION: Reddit追加投稿 ──
  {
    id: "reddit_hackernews",
    time: "16:30+",
    title: "Show HN 投稿",
    type: "auto",
    action: async (progress) => {
      const raw = readRedditPost("reddit-ph-hackernews.txt");
      if (!raw) {
        console.log(red("  >> reddit-ph-hackernews.txt が見つかりません"));
        await confirm();
        return;
      }
      const post = replacePhUrl(raw, progress.phUrl || "[PH_URL]");
      const lines = post.split("\n");
      const titleLine = lines.find((l) => l.startsWith("Title:"));
      const bodyStart = lines.findIndex((l) => l.startsWith("Body:"));
      const title = titleLine?.replace("Title: ", "") || "";
      const body = lines.slice(bodyStart + 2).join("\n").trim();

      console.log(`  ${bold("Title:")} ${title}`);
      console.log(dim(`\n${body.split("\n").map((l) => `    ${l}`).join("\n")}\n`));

      pbcopy(title);
      console.log(green("  >> Title をクリップボードにコピーしました"));
      await confirm("Title を貼り付けたら Enter...");
      pbcopy(body);
      console.log(green("  >> Body をクリップボードにコピーしました"));
      await confirm("Body を貼り付けて投稿したら Enter...");
    },
  },
  {
    id: "reddit_webdev",
    time: "16:30+",
    title: "Reddit r/webdev 投稿",
    type: "auto",
    action: async (progress) => {
      const raw = readRedditPost("reddit-ph-webdev.txt");
      if (!raw) {
        console.log(red("  >> reddit-ph-webdev.txt が見つかりません"));
        await confirm();
        return;
      }
      const post = replacePhUrl(raw, progress.phUrl || "[PH_URL]");
      const lines = post.split("\n");
      const titleLine = lines.find((l) => l.startsWith("Title:"));
      const bodyStart = lines.findIndex((l) => l.startsWith("Body:"));
      const title = titleLine?.replace("Title: ", "") || "";
      const body = lines.slice(bodyStart + 2).join("\n").trim();

      console.log(`  ${bold("Title:")} ${title}`);
      console.log(dim(`\n${body.split("\n").map((l) => `    ${l}`).join("\n")}\n`));

      pbcopy(title);
      console.log(green("  >> Title をクリップボードにコピーしました"));
      await confirm("Title を貼り付けたら Enter...");
      pbcopy(body);
      console.log(green("  >> Body をクリップボードにコピーしました"));
      await confirm("Body を貼り付けて投稿したら Enter...");
    },
  },
  {
    id: "indiehackers",
    time: "16:30+",
    title: "Indie Hackers 投稿",
    type: "auto",
    action: async (progress) => {
      const raw = readRedditPost("indiehackers-ph-post.txt");
      if (!raw) {
        console.log(red("  >> indiehackers-ph-post.txt が見つかりません"));
        await confirm();
        return;
      }
      const post = replacePhUrl(raw, progress.phUrl || "[PH_URL]");
      const lines = post.split("\n");
      const titleLine = lines.find((l) => l.startsWith("Title:"));
      const title = titleLine?.replace("Title: ", "") || "";
      const bodyLines = [];
      let inBody = false;
      for (const line of lines) {
        if (line.startsWith("---") && !inBody) { inBody = true; continue; }
        if (inBody) bodyLines.push(line);
      }
      const body = bodyLines.join("\n").trim();

      console.log(`  ${bold("Title:")} ${title}`);
      console.log(dim(`\n${body.split("\n").slice(0, 10).map((l) => `    ${l}`).join("\n")}\n    ...\n`));

      pbcopy(title);
      console.log(green("  >> Title をクリップボードにコピーしました"));
      await confirm("Title を貼り付けたら Enter...");
      pbcopy(body);
      console.log(green("  >> Body をクリップボードにコピーしました"));
      await confirm("Body を貼り付けて投稿したら Enter...");
    },
  },

  // ── SECTION: コメント監視 ──
  {
    id: "monitor_2h",
    time: "16:01-18:00",
    title: "最重要2時間: 全コメント即レス",
    type: "manual",
    action: async () => {
      console.log(red("  *** 最重要タイム: 全コメントに即レス ***\n"));
      console.log("  [ ] PH コメントを5分おきにチェック → 即返信");
      console.log("  [ ] Reddit コメントを10分おきにチェック → 返信");
      console.log("  [ ] X リプライを10分おきにチェック → 返信");
      console.log("  [ ] GA4 リアルタイムでトラフィック監視");
      console.log("  [ ] Sentry でエラー監視\n");
      console.log(dim("  ※ この時間帯はモニタリングに集中"));
      console.log(dim("  ※ 返信テンプレートは 't' コマンドで参照可能"));
      await confirm("2時間の監視が終わったら Enter...");
    },
  },

  // ── SECTION: 18:00-20:00 ──
  {
    id: "metrics_18",
    time: "18:00",
    title: "数字記録 (18:00)",
    type: "input",
    action: async (progress) => {
      if (!progress.metrics) progress.metrics = {};
      const upvote = await ask("  18:00 upvote 数: ");
      const comments = await ask("  18:00 コメント数: ");
      progress.metrics["18:00"] = { upvote, comments };
      saveProgress(progress);
      console.log(green("  >> 記録しました"));
    },
  },
  {
    id: "metrics_20",
    time: "20:00",
    title: "数字記録 (20:00)",
    type: "input",
    action: async (progress) => {
      if (!progress.metrics) progress.metrics = {};
      const upvote = await ask("  20:00 upvote 数: ");
      const comments = await ask("  20:00 コメント数: ");
      progress.metrics["20:00"] = { upvote, comments };
      saveProgress(progress);
      console.log(green("  >> 記録しました"));
    },
  },

  // ── SECTION: 20:00 DM送信 ──
  {
    id: "founder_dm",
    time: "20:00",
    title: "創業者DM送信",
    type: "manual",
    action: async (progress) => {
      console.log("  [ ] founder-dm-list.md の10人にDM送信");
      console.log("  [ ] PH当日ドラフト.md のテンプレートA/Bを使用");
      console.log(`  [ ] [PHリンク] → ${progress.phUrl || "[未設定]"}`);
      console.log("  [ ] {名前}{会社名}{事業内容} を各人に合わせてカスタマイズ");
      if (progress.phUrl) {
        pbcopy(progress.phUrl);
        console.log(green("  >> PH URL をクリップボードにコピーしました"));
      }
      await confirm();
    },
  },

  // ── SECTION: 夜間 ──
  {
    id: "metrics_24",
    time: "24:00",
    title: "数字記録 (24:00)",
    type: "input",
    action: async (progress) => {
      if (!progress.metrics) progress.metrics = {};
      const upvote = await ask("  24:00 upvote 数: ");
      const comments = await ask("  24:00 コメント数: ");
      const visits = await ask("  24:00 GA4 訪問数: ");
      progress.metrics["24:00"] = { upvote, comments, visits };
      saveProgress(progress);
      console.log(green("  >> 記録しました"));
    },
  },

  // ── SECTION: 米国ピークタイム ──
  {
    id: "night_3",
    time: "3:00",
    title: "深夜チェック (3:00)",
    type: "input",
    action: async (progress) => {
      if (!progress.metrics) progress.metrics = {};
      console.log("  [ ] PH コメント確認 → 未返信があれば返信");
      console.log("  [ ] Sentry 確認 → 新規エラーがあれば対応");
      const upvote = await ask("  3:00 upvote 数: ");
      progress.metrics["3:00"] = { upvote };
      saveProgress(progress);
      console.log(green("  >> 記録しました"));
    },
  },
  {
    id: "night_6",
    time: "6:00",
    title: "早朝チェック (6:00)",
    type: "input",
    action: async (progress) => {
      if (!progress.metrics) progress.metrics = {};
      console.log("  [ ] PH コメント確認 → 未返信があれば返信");
      console.log("  [ ] Sentry 確認 → 新規エラーがあれば対応");
      const upvote = await ask("  6:00 upvote 数: ");
      progress.metrics["6:00"] = { upvote };
      saveProgress(progress);
      console.log(green("  >> 記録しました"));
    },
  },
  {
    id: "night_9",
    time: "9:00",
    title: "午前チェック (9:00)",
    type: "input",
    action: async (progress) => {
      if (!progress.metrics) progress.metrics = {};
      console.log("  [ ] PH コメント確認 → 未返信があれば返信");
      console.log("  [ ] Sentry 確認 → 新規エラーがあれば対応");
      const upvote = await ask("  9:00 upvote 数: ");
      progress.metrics["9:00"] = { upvote };
      saveProgress(progress);
      console.log(green("  >> 記録しました"));
    },
  },

  // ── SECTION: 振り返り ──
  {
    id: "wrapup",
    time: "翌11:00",
    title: "振り返り & 最終記録",
    type: "input",
    action: async (progress) => {
      if (!progress.metrics) progress.metrics = {};
      const upvote = await ask("  最終 upvote 数: ");
      const comments = await ask("  最終コメント数: ");
      const visits = await ask("  最終 GA4 訪問数: ");
      const rank = await ask("  PH ランキング順位: ");
      const total = await ask("  総プロダクト数: ");
      progress.metrics["final"] = { upvote, comments, visits, rank, total };
      saveProgress(progress);

      console.log("\n" + bold("  [ ] スクリーンショットを撮って保存"));
      console.log(bold("  [ ] 結果をもとに note 記事の穴埋め → 公開"));

      // Print summary
      banner("Launch Day Summary");
      for (const [time, data] of Object.entries(progress.metrics)) {
        const parts = Object.entries(data)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" / ");
        console.log(`  ${bold(time.padEnd(8))} ${parts}`);
      }
      console.log("");
    },
  },
];

// ── Reddit Comment Copier ───────────────────────────────
async function redditCommentMenu(progress) {
  banner("Reddit Comment Copier");

  // List available comment files
  const files = [];
  for (let i = 1; i <= 32; i++) {
    const fname = `reddit-comment-${i}.txt`;
    const p = join(REDDIT_DIR, fname);
    if (existsSync(p)) files.push({ num: i, path: p });
  }

  // Also list PH-specific reddit posts
  const phPosts = [
    { name: "r/SideProject (PH launch)", file: "reddit-ph-sideproject.txt" },
    { name: "r/webdev (PH launch)", file: "reddit-ph-webdev.txt" },
    { name: "Show HN (PH launch)", file: "reddit-ph-hackernews.txt" },
    { name: "Indie Hackers (PH launch)", file: "indiehackers-ph-post.txt" },
  ];

  console.log(bold("  PH Launch Posts:"));
  phPosts.forEach((p, i) => {
    console.log(`    ${cyan(`p${i + 1}`)} ${p.name}`);
  });
  console.log(`\n  ${bold("Seeded Comments:")} ${files.length} files (1-${files[files.length - 1]?.num || 0})`);
  console.log(dim("    Enter comment number (e.g. '5') or PH post (e.g. 'p1')"));
  console.log(dim("    'q' to go back\n"));

  while (true) {
    const input = await ask("  Copy which? ");
    if (input.toLowerCase() === "q") break;

    if (input.startsWith("p")) {
      const idx = parseInt(input.slice(1)) - 1;
      if (idx >= 0 && idx < phPosts.length) {
        const raw = readRedditPost(phPosts[idx].file);
        if (raw) {
          const text = replacePhUrl(raw, progress.phUrl || "[PH_URL]");
          pbcopy(text);
          console.log(green(`  >> ${phPosts[idx].name} をコピーしました`));
        }
      } else {
        console.log(red("  >> 無効な番号"));
      }
      continue;
    }

    const num = parseInt(input);
    if (num >= 1 && num <= 32) {
      const p = join(REDDIT_DIR, `reddit-comment-${num}.txt`);
      if (existsSync(p)) {
        let text = readFileSync(p, "utf-8");
        if (progress.phUrl) text = replacePhUrl(text, progress.phUrl);
        pbcopy(text);
        console.log(green(`  >> reddit-comment-${num}.txt をコピーしました`));
        console.log(dim(text.split("\n").slice(0, 3).map((l) => `    ${l}`).join("\n")));
      } else {
        console.log(red(`  >> reddit-comment-${num}.txt が見つかりません`));
      }
    } else {
      console.log(red("  >> 無効な入力"));
    }
  }
}

// ── Response Templates ──────────────────────────────────
function showTemplates() {
  banner("Response Templates");

  const templates = [
    {
      category: "A: 感謝 (upvote/congrats)",
      items: [
        {
          label: "A-1 シンプル感謝",
          text: "Thanks so much! Really appreciate you checking it out. Let me know if you have any questions.",
        },
        {
          label: "A-2 使用を促す",
          text: "Thank you! If you get a chance to try it, I'd love to hear what you think. The free tier covers 20 transforms/day with no API key needed.",
        },
      ],
    },
    {
      category: "B: 質問への回答",
      items: [
        {
          label: "B-3 プライバシー",
          text: "Everything runs in your browser -- no backend, no server-side processing, no account required. Your data stays in IndexedDB on your device. API keys are encrypted with AES-GCM in localStorage. The code is fully open source so you can verify this yourself.",
        },
        {
          label: "B-4 料金",
          text: `The free tier includes 20 transforms/day and 3 projects -- no API key needed. Pro ($12/mo) adds unlimited transforms, unlimited projects, and export features. PH exclusive: use code ${PROMO_CODE} for 1 month of Pro, free.`,
        },
      ],
    },
    {
      category: "C: フィードバック",
      items: [
        {
          label: "C-2 機能リクエスト",
          text: "Love this suggestion! [feature] is actually on the roadmap. I've noted your specific use case -- it'll help me prioritize. Thanks for taking the time to share this.",
        },
        {
          label: "C-3 建設的批判",
          text: "That's fair feedback, and I appreciate you being direct about it. [how you'll address it]. This is exactly the kind of input that makes the product better -- thank you.",
        },
      ],
    },
  ];

  for (const cat of templates) {
    console.log(bold(`  ${cat.category}`));
    for (const item of cat.items) {
      console.log(`    ${cyan(item.label)}`);
      console.log(dim(`      ${item.text.slice(0, 80)}...`));
    }
    console.log("");
  }
}

// ── Main ────────────────────────────────────────────────
async function main() {
  const progress = loadProgress();

  banner("Lore -- Product Hunt Launch Day Operator");
  console.log(`  ${bold("Launch:")} 2026-03-27 (Fri) 16:01 JST`);
  console.log(`  ${bold("Promo:")}  ${PROMO_CODE}`);
  console.log(`  ${bold("PH URL:")} ${progress.phUrl || dim("(未設定)")}`);
  console.log(`  ${bold("Progress:")} ${progress.completed.length}/${STEPS.length} steps\n`);

  // Show menu
  const showMenu = () => {
    console.log(bold("\n  Commands:"));
    console.log(`    ${cyan("n")}       次のステップへ進む`);
    console.log(`    ${cyan("s")}       全ステップ一覧（進捗表示）`);
    console.log(`    ${cyan("j <num>")} 指定ステップにジャンプ`);
    console.log(`    ${cyan("r")}       Reddit コメントコピー`);
    console.log(`    ${cyan("t")}       返信テンプレート表示`);
    console.log(`    ${cyan("u")}       PH URL を更新`);
    console.log(`    ${cyan("m")}       数字サマリー表示`);
    console.log(`    ${cyan("reset")}   進捗リセット`);
    console.log(`    ${cyan("q")}       終了\n`);
  };

  const showSteps = () => {
    console.log("");
    STEPS.forEach((step, i) => {
      const done = progress.completed.includes(step.id);
      const tag =
        step.type === "auto"
          ? bgGreen("AUTO")
          : step.type === "input"
            ? bgYellow("INPUT")
            : dim("[MANUAL]");
      const status = done ? green("[x]") : "[ ]";
      console.log(
        `  ${status} ${dim(`${String(i + 1).padStart(2)}.`)} ${dim(`[${step.time}]`.padEnd(14))} ${step.title}  ${tag}`
      );
    });
    console.log("");
  };

  const getNextStep = () => {
    const idx = STEPS.findIndex((s) => !progress.completed.includes(s.id));
    return idx === -1 ? null : idx;
  };

  const runStep = async (idx) => {
    const step = STEPS[idx];
    if (!step) return;

    const tag =
      step.type === "auto"
        ? bgGreen("AUTO")
        : step.type === "input"
          ? bgYellow("INPUT")
          : dim("[MANUAL]");

    sectionHeader(step.time, `${step.title}  ${tag}`);
    console.log(dim(`  Step ${idx + 1}/${STEPS.length}\n`));

    await step.action(progress);

    if (!progress.completed.includes(step.id)) {
      progress.completed.push(step.id);
      saveProgress(progress);
    }
    console.log(green(`\n  >> Step ${idx + 1} 完了!`));
  };

  showMenu();

  while (true) {
    const input = (await ask(bold("\n> "))).trim();

    if (input === "q") {
      console.log(dim("\n  Progress saved. See you!"));
      break;
    }

    if (input === "n") {
      const next = getNextStep();
      if (next === null) {
        console.log(green("\n  All steps completed!"));
        continue;
      }
      await runStep(next);
      continue;
    }

    if (input === "s") {
      showSteps();
      continue;
    }

    if (input.startsWith("j ")) {
      const num = parseInt(input.slice(2));
      if (num >= 1 && num <= STEPS.length) {
        await runStep(num - 1);
      } else {
        console.log(red(`  1-${STEPS.length} の範囲で指定してください`));
      }
      continue;
    }

    if (input === "r") {
      await redditCommentMenu(progress);
      continue;
    }

    if (input === "t") {
      showTemplates();
      continue;
    }

    if (input === "u") {
      const url = await ask("  PH URL: ");
      if (url.trim()) {
        progress.phUrl = url.trim();
        saveProgress(progress);
        console.log(green(`  >> 更新: ${progress.phUrl}`));
      }
      continue;
    }

    if (input === "m") {
      if (Object.keys(progress.metrics || {}).length === 0) {
        console.log(dim("  まだ記録がありません"));
        continue;
      }
      banner("Metrics Summary");
      for (const [time, data] of Object.entries(progress.metrics)) {
        const parts = Object.entries(data)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" / ");
        console.log(`  ${bold(time.padEnd(8))} ${parts}`);
      }
      continue;
    }

    if (input === "reset") {
      const yes = await ask(red("  本当にリセットしますか? (y/N) "));
      if (yes.toLowerCase() === "y") {
        saveProgress({ completed: [], phUrl: "", metrics: {} });
        Object.assign(progress, { completed: [], phUrl: "", metrics: {} });
        console.log(green("  >> リセットしました"));
      }
      continue;
    }

    if (input === "" || input === "h" || input === "help") {
      showMenu();
      continue;
    }

    console.log(dim("  Unknown command. 'h' for help."));
  }

  rl.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
