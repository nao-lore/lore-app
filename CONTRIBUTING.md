# Contributing to ThreadLog

Thanks for your interest in contributing! We welcome all contributions — bug reports, feature requests, and pull requests.

## Dev Environment Setup

```bash
git clone https://github.com/your-org/threadlog.git
cd threadlog
npm install
npm run dev
```

The app runs at `http://localhost:5173` by default.

## Running Tests

```bash
# Unit tests
npm test

# E2E tests
npx playwright test
```

Please make sure all tests pass before submitting a PR.

## Reporting Issues

- Use the provided issue templates when opening a new issue.
- Include steps to reproduce, expected behavior, and actual behavior.
- Screenshots or screen recordings are helpful for UI issues.

## Submitting Pull Requests

1. Fork the repository and create a feature branch from `main`.
2. Keep PRs small and focused — one feature or fix per PR.
3. Write or update tests for your changes.
4. Run `npm test` and `npx playwright test` before submitting.
5. Write a clear PR description explaining what changed and why.

## Code Style

- **TypeScript strict mode** — no `any` types.
- Follow existing patterns in the codebase.
- For new user-facing labels, use the existing i18n system (`src/i18n/`). Add translations for all 8 supported languages.
- Use functional React components with hooks.
- Keep components small and composable.

## Questions?

Open a discussion or issue — we're happy to help.
