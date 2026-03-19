# Competitive Response Templates

Copy-paste responses for common PH/Reddit challenges. Adapt tone to the platform — slightly more casual on Reddit, slightly more polished on PH.

---

## 1. "$12/mo is too expensive for this"

**Response:**
Lore saves you ~7 hours/month of re-explaining context to AI. That's less than $2/hour of your time saved. The free tier handles 20 transforms/day and 3 projects, which covers most solo developers — no paywall on the core experience. Pro is there when you're juggling enough projects that unlimited transforms and export pay for themselves.

---

## 2. "localStorage will lose my data"

**Response:**
Lore uses IndexedDB for conversation data — significantly more robust than localStorage alone — and every snapshot is exportable as JSON at any time. Your data stays portable and under your control. Cloud sync is the #1 feature we're building next (already on the roadmap). We're transparent about the tradeoff: local-first means zero signup, zero server dependency, and instant access. For most developers, that's the right default.

---

## 3. "Notion AI / Mem.ai does this already"

**Response:**
Lore is purpose-built for one thing: turning a raw AI conversation into structured project context — decisions, TODOs, blockers, resume checklists — automatically. In Notion, you'd need to manually tag and organize all of that yourself. Lore also works across ChatGPT, Claude, and Gemini with no lock-in. Different tools for different jobs — Notion is great for general knowledge management, Lore is laser-focused on the AI conversation handoff problem.

---

## 4. "How is this different from Claude Memory?"

**Response:**
Lore extracts structured project context — what was decided, what's blocked, what to do next — and organizes it across projects over time. It's a project dashboard for all your AI work, not just memory for one provider. It works with ChatGPT, Claude, and Gemini simultaneously, and you own the data locally. Claude Memory remembers facts about you within Claude conversations, which is complementary — Lore gives you cross-provider project continuity.

---

## 5. "Is my data safe? You could steal API keys"

**Response:**
Lore runs entirely in your browser — your API key never touches our servers. There's no backend database, no server-side processing. The entire app is open source on GitHub so you can verify this yourself. API keys are encrypted in localStorage using AES-GCM. And if you'd rather not use your own key at all, the free tier's built-in API doesn't require one.

---

## 6. "Why not just use a markdown file?"

**Response:**
Lore auto-generates that structured markdown from a raw conversation — extracting decisions, TODOs, blockers, and next steps you might miss doing it manually. It also tracks project progress over time across multiple sessions and surfaces stale items automatically. If a single markdown file works for your workflow, that's great. Lore is for when you're juggling multiple AI-assisted projects and need the extraction + tracking to happen without manual effort.

---

## 7. "This looks cool but I don't trust AI summaries"

**Response:**
Lore shows you the original conversation alongside the extracted output, so you can always verify. The extraction is structured — specific decisions, specific TODOs, specific blockers — not a vague summary. All AI output is validated against strict Zod schemas, so malformed responses get caught before you see them. You can also edit any extracted item directly. Healthy skepticism about AI output is good practice — Lore is built with that assumption.
