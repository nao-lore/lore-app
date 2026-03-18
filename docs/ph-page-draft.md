# Product Hunt ページ下書き

## 基本情報

- **Product Name:** Lore
- **Tagline:** Turn AI conversations into structured project docs — instantly
- **Topics:** Productivity, Developer Tools, Artificial Intelligence, Open Source
- **Pricing:** Free (20/day) + Pro ($12/mo)
- **Website:** [LP URL]
- **Chrome Extension:** https://chromewebstore.google.com/detail/lore-ai-conversation-snap/opkdpjpgkjcjpkahbljjnhnahliedmkc
- **GitHub:** https://github.com/nao-lore/lore-app

---

## Description

### Short (for PH card)

Paste any AI conversation. Get a structured project briefing in 30 seconds — decisions, TODOs, blockers, and next steps, all auto-extracted.

### Full Description

**The problem:** Every AI conversation starts from zero. You re-explain your project, re-state decisions, and lose track of what was done.

**Lore fixes this.** Paste a conversation from Claude, ChatGPT, or Gemini, and Lore automatically extracts:

- 📋 **Session Context** — what this session was about and why it matters
- ✅ **Decisions** — what was decided, with rationale
- 📝 **TODOs & Next Actions** — prioritized by importance
- 🚧 **Blockers** — what's stuck and why
- 🔄 **Resume Checklist** — exactly where to pick up next time

Every snapshot feeds into your **project dashboard**, so you always know where things stand across all your AI-assisted work.

**Key features:**
- Works with any AI (Claude, ChatGPT, Gemini)
- No API key needed — free to start
- Project dashboard with progress tracking
- Chrome extension for one-click capture
- 8 languages supported
- Works offline (PWA)
- Open source

**Free:** 20 transforms/day, 3 projects
**Pro:** $12/mo — unlimited everything + export + integrations

---

## Media (3-5 screenshots needed)

1. **Hero shot** — LP or the structured snapshot result (SESSION CONTEXT, RESUME CHECKLIST, etc.)
2. **Input → Output** — before (raw conversation) and after (structured snapshot)
3. **Dashboard** — project overview with multiple snapshots
4. **Chrome Extension** — one-click capture from ChatGPT/Claude
5. **Mobile view** — PWA on phone (optional)

---

## Maker Comment（ローンチ直後に投稿）

Hey everyone! 👋

I'm Nao, and I built Lore because I kept losing track of my AI-assisted projects.

I use Claude and ChatGPT daily for building software. The problem? Every new conversation starts from zero. I'd spend 10+ minutes re-explaining context before getting to actual work. Decisions got forgotten. TODOs slipped through the cracks.

So I built Lore — paste your AI conversation, and it extracts a structured project briefing in about 30 seconds. Decisions, TODOs, blockers, and a resume checklist for your next session.

The real magic is accumulation. Each snapshot feeds into your project dashboard, so over time you build up a knowledge base of everything you've done with AI — across Claude, ChatGPT, and Gemini.

**Some things I'm proud of:**
- No API key needed to get started
- Works offline as a PWA
- 700+ tests (I take reliability seriously)
- Open source
- 8 languages supported

Built entirely solo. Would love your honest feedback — what's useful, what's confusing, what would make this better for your workflow?

---

## First Comment（Maker Commentの後に投稿）

Here's a real example of what Lore extracts from a 50-message coding session with Claude:

**Session Context:**
> Focus: Build authentication system with JWT + refresh tokens
> Why: Core security foundation needed before any user-facing features

**Decisions:**
> - Use httpOnly cookies for refresh tokens (rationale: XSS protection)
> - 15-minute access token expiry (balance between security and UX)

**Next Actions:**
> 1. Implement token refresh endpoint
> 2. Add middleware for route protection
> 3. Write integration tests for auth flow

**Resume Checklist:**
> ✓ Verify refresh token rotation works correctly
> → Prevents token replay attacks
> ⚠ If skipped: security vulnerability in production

This is the kind of structured context that normally takes 15 minutes to write manually. Lore does it in 30 seconds.

Try it free: [link]

---

## Launch Day チェックリスト

- [ ] PHページ公開（4/1 00:01 PST）
- [ ] Maker Comment 投稿
- [ ] First Comment 投稿
- [ ] Twitter/X 告知
- [ ] Reddit 告知（r/SideProject, r/ChatGPT にPHリンク付き投稿）
- [ ] 知人にupvote依頼
- [ ] 全コメントに返信（最初の数時間が最重要）
- [ ] バグ報告あれば即修正
