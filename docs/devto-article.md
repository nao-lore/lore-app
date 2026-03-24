---
title: "I'm 21 with zero coding experience. I built a full SaaS in 5 days with Claude Code."
published: false
description: "How I went from university dropout with no programming background to shipping a production React app — using AI as my entire engineering team."
tags: ai, webdev, buildinpublic, beginners
cover_image: https://loresync.dev/og-image.png
---

## The backstory nobody asked for

I'm Nao, 21, based in Japan. I dropped out of university. I have no computer science degree, no bootcamp certificate, no "10 years of React experience." Six months ago, I couldn't tell you the difference between a component and a function.

What I did have was a problem that wouldn't leave me alone.

## The problem

I use AI coding assistants daily. Claude, ChatGPT, Gemini — I rotate between them depending on the task. And every single time I start a new session, the AI has amnesia. Complete context loss.

I'd spend the first 10-15 minutes of every conversation re-explaining what the project was, what we'd already built, what decisions we'd made and why. I kept a messy Google Doc of notes, but it was always out of date. Half the time I'd forget to update it and end up re-doing work the AI had already helped me with.

I thought: there has to be a better way. Every AI tool lets you export your conversation history. What if something could read those exports and automatically extract the useful stuff — the decisions, the progress, the next steps?

That's what became Lore.

## Discovering Claude Code

I'd been using Claude's chat interface for months, but Claude Code was different. It's a CLI tool that works directly in your codebase. It reads your files, writes code, runs tests, and iterates — all from the terminal.

The key insight for me: I didn't need to learn to code first and then build. I could describe what I wanted, review what Claude Code produced, learn from it, and course-correct. It was like pair programming with a senior engineer who never got frustrated with my questions.

## The 5-day build

Here's roughly how it went:

**Day 1-2: Core architecture.** I described the app concept — a PWA that takes AI conversation exports and transforms them into structured project documents. Claude Code set up the React + TypeScript + Vite stack, designed the storage layer (localStorage + IndexedDB), and built the transformation pipeline. I spent most of my time reviewing code and asking "why did you do it this way?"

**Day 3: The AI processing engine.** This was the hardest part. Lore needs to take a raw conversation (which can be thousands of messages long) and extract structured data: handoff snapshots, worklogs, TODOs, project notes. We built a chunking engine that breaks long conversations into processable pieces and a prompt system that produces consistent, validated output.

**Day 4: UX and polish.** Dashboard, navigation, settings, 8-language internationalization (Japanese, English, Spanish, French, German, Chinese, Korean, Portuguese). This is where I learned how much of "building software" is just making things not feel broken.

**Day 5: Testing and hardening.** This is the part I'm most proud of. The app now has a full test suite covering every major feature. Not because I'm a testing zealot, but because when you're building with AI, tests are your safety net. Every time Claude Code changed something, the tests told me if something else broke.

## What the stack looks like

- **React + TypeScript + Vite** — standard modern frontend
- **No backend** — everything runs client-side. Your data stays on your device.
- **PWA** — works offline, installable on mobile
- **Zod schemas** — every AI response is validated against a schema
- **IndexedDB + localStorage** — structured storage with 6 domain modules
- **8 custom hooks, 18 extracted components, 7 utility modules**

The codebase ended up way more organized than I expected. Claude Code has strong opinions about architecture, and honestly, most of them are good.

## The numbers that surprised me

A few things from the build process:

- I had Claude Code audit the entire codebase for UX problems, security gaps, accessibility issues, and performance bottlenecks. It found dozens of things. We fixed them in prioritized batches.
- At one point I was running multiple Claude Code agents in parallel, each working on a different fix. Merge conflicts everywhere, but it worked.
- Full test suite covering every major feature. Started from zero. The testing discipline came from necessity, not ideology.
- **8 languages** with bundled translations. Claude Code is genuinely good at translation.

## What worked

**Describing intent, not implementation.** I'd say "users should be able to export their data as a JSON file" instead of "create a function that serializes state to JSON and triggers a download." Claude Code handles the implementation; I handled the product thinking.

**Aggressive testing.** Every new feature got tests before I moved on. This saved me dozens of times when later changes broke earlier work.

**Small commits, constant review.** I never let Claude Code run wild for too long without reviewing what it produced. The code quality is directly proportional to how carefully I reviewed it.

**Accessibility from day one.** Semantic HTML, ARIA attributes, keyboard navigation, forced-colors support. Claude Code did most of the heavy lifting here, but I had to explicitly ask for it.

## What was hard

**Understanding errors.** When something broke, Claude Code could usually fix it. But I often didn't understand *why* it broke. This is the real gap — I'm shipping production code that I can partially explain at best.

**Merge conflicts with parallel agents.** Running multiple agents at once sounds cool. In practice, it means spending a lot of time resolving conflicts and making sure the agents didn't undo each other's work.

**Knowing when to stop.** AI makes it easy to keep adding features. The hardest decision was scoping down to an MVP and shipping instead of polishing forever.

**The "vibe coding" trap.** It's tempting to just accept whatever Claude Code generates without understanding it. I had to force myself to slow down and actually learn what the code was doing. I'm still learning.

## What I actually learned

I won't pretend I'm a software engineer now. I'm not. But I have a working mental model of how a modern web app fits together — components, hooks, state management, storage, build tools, testing. Six months ago, those were just words.

The bigger lesson: the barrier to building software has genuinely dropped. Not to zero — you still need product thinking, design sense, persistence, and the willingness to read a lot of code you don't fully understand. But the barrier to *writing* the code? That's almost gone.

## Try it

Lore is fully open source and free to use:

- **App:** [loresync.dev](https://loresync.dev?utm_source=devto)
- **Source:** [github.com/nao-lore/lore-app](https://github.com/nao-lore/lore-app)

If you work with AI conversations regularly, I'd love for you to try it and tell me what's missing. I'm building this for people like me — people who live in AI tools and are tired of losing context between sessions.

Feedback, issues, PRs — all welcome. I'm [@nao-lore](https://github.com/nao-lore) on GitHub.
