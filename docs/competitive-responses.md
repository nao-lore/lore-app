# Competitive Response Templates

Copy-paste responses for common PH/Reddit challenges. Adapt tone to the platform — slightly more casual on Reddit, slightly more polished on PH.

---

## 1. "$12/mo is too expensive for this"

**Response:**
Totally fair concern. The free tier gives you 20 transforms/day and 3 projects, which honestly covers most solo developers. Pro is for people managing multiple AI-assisted projects who want unlimited everything plus export — but there's no paywall on the core experience.

---

## 2. "localStorage will lose my data"

**Response:**
You're right that localStorage has limits, and we don't hide that. Lore uses IndexedDB for conversation data (much more robust than localStorage alone), and you can export everything as JSON at any time. Cloud sync is the #1 thing we're building next — it's already on the roadmap. For now, the export-on-demand approach means your data is always portable.

---

## 3. "Notion AI / Mem.ai does this already"

**Response:**
They're great general-purpose tools, but they don't solve the specific problem of AI conversation context loss. Lore is purpose-built for one thing: turning a raw AI chat into structured project docs (decisions, TODOs, blockers, resume checklists) in 30 seconds. You'd need to manually tag and organize that in Notion. Different tools for different jobs.

---

## 4. "How is this different from Claude Memory?"

**Response:**
Claude Memory remembers facts about you across conversations, which is useful. Lore does something different — it extracts structured project context (what was decided, what's blocked, what to do next) and organizes it across projects over time. Think of it as a project dashboard for all your AI work, not just memory for one AI provider. It also works with ChatGPT and Gemini, not just Claude.

---

## 5. "Is my data safe? You could steal API keys"

**Response:**
Your API key never touches our servers. Lore runs entirely in your browser — it calls the AI provider directly from the client. There's no backend, no database, no server-side processing. You can verify this yourself since the whole app is open source on GitHub. If you're still uncomfortable, the free tier doesn't require an API key at all.

---

## 6. "Why not just use a markdown file?"

**Response:**
You absolutely can, and many people do. The difference is that Lore auto-generates that structured markdown from a raw conversation in 30 seconds — extracting decisions, TODOs, blockers, and next steps you might miss doing it manually. It also tracks project progress over time across multiple sessions. If a single markdown file works for your workflow, stick with it. Lore is for when you're juggling multiple AI projects and things start falling through the cracks.

---

## 7. "This looks cool but I don't trust AI summaries"

**Response:**
Healthy skepticism. Lore shows you the original conversation alongside the extracted output, so you can always verify. The extraction is structured (not just a vague summary) — it pulls specific decisions, specific TODOs, specific blockers. If something's wrong, you can edit it directly. We also validate all AI output against strict schemas so you don't get garbage formatting. But yeah, always sanity-check AI output — that's just good practice.
