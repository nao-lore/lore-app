import { describe, it, expect } from 'vitest';
import {
  formatHandoffMarkdown,
  formatProjectContextMarkdown,
  formatFullAiContext,
} from './formatHandoff';
import type { ProjectContext } from './formatHandoff';
import type { LogEntry } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'log-1',
    createdAt: '2026-03-13T00:00:00Z',
    title: 'Auth Implementation',
    today: [],
    decisions: [],
    todo: [],
    relatedProjects: [],
    tags: [],
    outputMode: 'handoff',
    currentStatus: ['Auth middleware is working', 'CORS configured'],
    completed: ['Implemented auth middleware in auth.ts', 'Added CORS to server.ts'],
    decisionRationales: [
      { decision: 'Use session-based auth', rationale: 'MPA architecture fits cookies better' },
    ],
    constraints: ['TypeScript strict mode', 'Express.js backend'],
    blockers: ['Rate limit value unknown'],
    nextActions: ['Write unit tests for auth.ts'],
    resumeContext: ['Pull main branch', 'Check auth.ts implementation'],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    projectId: 'proj-1',
    projectName: 'ThreadLog',
    overview: 'A work logging tool for AI conversations.',
    currentState: ['Core logging works', 'Search is not implemented'],
    keyDecisions: [
      { decision: 'Use localStorage for persistence', rationale: 'No backend needed' },
    ],
    constraints: ['SPA-only, no backend'],
    openIssues: ['Large log performance is poor'],
    nextActions: ['Implement search feature'],
    sourceLogIds: ['log-1'],
    generatedAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. formatHandoffMarkdown with full data — all sections present
// ---------------------------------------------------------------------------

describe('formatHandoffMarkdown', () => {
  it('renders all sections when data is present', () => {
    const log = makeLog();
    const md = formatHandoffMarkdown(log);

    expect(md).toContain('## Handoff: Auth Implementation');
    expect(md).toContain('### Current State');
    expect(md).toContain('- Auth middleware is working');
    expect(md).toContain('### What Was Done');
    expect(md).toContain('- Implemented auth middleware in auth.ts');
    expect(md).toContain('### Active Decisions');
    expect(md).toContain('- Use session-based auth: MPA architecture fits cookies better');
    expect(md).toContain('### Constraints');
    expect(md).toContain('- TypeScript strict mode');
    expect(md).toContain('### Open Issues');
    expect(md).toContain('- Rate limit value unknown');
    expect(md).toContain('### Next Actions');
    expect(md).toContain('- Write unit tests for auth.ts');
    expect(md).toContain('### Resume Checklist');
    expect(md).toContain('- Pull main branch');
  });

  // ---------------------------------------------------------------------------
  // 2. formatHandoffMarkdown with empty sections — omitted
  // ---------------------------------------------------------------------------

  it('omits empty sections', () => {
    const log = makeLog({
      currentStatus: [],
      completed: ['Did something'],
      decisionRationales: [],
      decisions: [],
      constraints: [],
      blockers: [],
      nextActions: [],
      resumeContext: [],
    });
    const md = formatHandoffMarkdown(log);

    expect(md).toContain('## Handoff: Auth Implementation');
    expect(md).toContain('### What Was Done');
    expect(md).not.toContain('### Current State');
    expect(md).not.toContain('### Active Decisions');
    expect(md).not.toContain('### Constraints');
    expect(md).not.toContain('### Open Issues');
    expect(md).not.toContain('### Next Actions');
    expect(md).not.toContain('### Resume Checklist');
  });

  // ---------------------------------------------------------------------------
  // 3. decisionRationales with null rationale
  // ---------------------------------------------------------------------------

  it('renders decisions with null rationale without any annotation', () => {
    const log = makeLog({
      decisionRationales: [
        { decision: 'Use Redis for cache', rationale: 'Speed is critical' },
        { decision: 'SPA-only architecture', rationale: null },
      ],
    });
    const md = formatHandoffMarkdown(log);

    expect(md).toContain('- Use Redis for cache: Speed is critical');
    expect(md).toContain('- SPA-only architecture');
    // Verify no rationale text leaks for the null case
    expect(md).not.toContain('SPA-only architecture:');
    expect(md).not.toContain('理由不明');
    expect(md).not.toContain('null');
  });

  // ---------------------------------------------------------------------------
  // 4. Falls back to legacy decisions when no decisionRationales
  // ---------------------------------------------------------------------------

  it('falls back to legacy decisions when decisionRationales is absent', () => {
    const log = makeLog({
      decisionRationales: undefined,
      decisions: ['Use PostgreSQL', 'Deploy to AWS'],
    });
    const md = formatHandoffMarkdown(log);

    expect(md).toContain('### Active Decisions');
    expect(md).toContain('- Use PostgreSQL');
    expect(md).toContain('- Deploy to AWS');
    // Legacy decisions have no rationale, so no colon
    expect(md).not.toContain('Use PostgreSQL:');
    expect(md).not.toContain('Deploy to AWS:');
  });
});

// ---------------------------------------------------------------------------
// 5. formatProjectContextMarkdown basic output
// ---------------------------------------------------------------------------

describe('formatProjectContextMarkdown', () => {
  it('renders project context with all sections', () => {
    const ctx = makeCtx();
    const md = formatProjectContextMarkdown(ctx);

    expect(md).toContain('## Project: ThreadLog');
    expect(md).toContain('A work logging tool for AI conversations.');
    expect(md).toContain('### Current State');
    expect(md).toContain('- Core logging works');
    expect(md).toContain('### Key Decisions');
    expect(md).toContain('- Use localStorage for persistence: No backend needed');
    expect(md).toContain('### Constraints');
    expect(md).toContain('- SPA-only, no backend');
    expect(md).toContain('### Open Issues');
    expect(md).toContain('- Large log performance is poor');
    expect(md).toContain('### Next Actions');
    expect(md).toContain('- Implement search feature');
  });

  it('omits empty sections', () => {
    const ctx = makeCtx({
      constraints: [],
      openIssues: [],
    });
    const md = formatProjectContextMarkdown(ctx);

    expect(md).not.toContain('### Constraints');
    expect(md).not.toContain('### Open Issues');
  });
});

// ---------------------------------------------------------------------------
// 6. formatFullAiContext merges and deduplicates correctly
// ---------------------------------------------------------------------------

describe('formatFullAiContext', () => {
  it('merges project context and latest handoff with deduplication', () => {
    const ctx = makeCtx({
      currentState: ['Core logging works', 'Search is not implemented'],
      keyDecisions: [
        { decision: 'Use localStorage for persistence', rationale: 'No backend needed' },
      ],
      constraints: ['SPA-only, no backend'],
      openIssues: ['Large log performance is poor'],
      nextActions: ['Implement search feature'],
    });
    const log = makeLog({
      currentStatus: ['Auth middleware is working', 'Core logging works'], // 'Core logging works' is duplicate
      decisionRationales: [
        { decision: 'Use session-based auth', rationale: 'MPA fits cookies' },
        { decision: 'Use localStorage for persistence', rationale: 'No backend needed' }, // duplicate
      ],
      constraints: ['TypeScript strict mode', 'SPA-only, no backend'], // 'SPA-only' duplicate
      blockers: ['Rate limit value unknown'],
      completed: ['Implemented auth middleware'],
      nextActions: ['Write unit tests for auth.ts'],
      resumeContext: ['Pull main branch'],
    });
    const md = formatFullAiContext(ctx, log);

    // Title and overview
    expect(md).toContain('## Project: ThreadLog');
    expect(md).toContain('A work logging tool for AI conversations.');

    // Deduped currentState — 'Core logging works' should appear only once
    const coreLoggingMatches = md.match(/- Core logging works/g);
    expect(coreLoggingMatches).toHaveLength(1);

    // Deduped decisions — 'Use localStorage' should appear only once
    const localStorageMatches = md.match(/Use localStorage for persistence/g);
    expect(localStorageMatches).toHaveLength(1);

    // Deduped constraints
    const spaMatches = md.match(/SPA-only, no backend/g);
    expect(spaMatches).toHaveLength(1);

    // Both unique items present
    expect(md).toContain('- Auth middleware is working');
    expect(md).toContain('- Use session-based auth: MPA fits cookies');
    expect(md).toContain('- TypeScript strict mode');

    // nextActions from handoff only
    expect(md).toContain('- Write unit tests for auth.ts');
    expect(md).not.toContain('- Implement search feature');

    // Latest Session section
    expect(md).toContain('## Latest Session');
    expect(md).toContain('### What Was Done');
    expect(md).toContain('- Implemented auth middleware');
    expect(md).toContain('### Resume Checklist');
    expect(md).toContain('- Pull main branch');
  });

  // ---------------------------------------------------------------------------
  // 7. formatFullAiContext removes resolved blockers from openIssues
  // ---------------------------------------------------------------------------

  it('removes resolved blockers from open issues', () => {
    const ctx = makeCtx({
      openIssues: ['CORS error on API calls', 'Search indexing is slow'],
    });
    const log = makeLog({
      blockers: ['Memory leak in list view'],
      completed: ['Fixed CORS error on API calls'],  // resolves ctx openIssue
      currentStatus: [],
      decisionRationales: [],
      decisions: [],
      constraints: [],
      nextActions: ['Optimize search indexing'],
      resumeContext: [],
    });
    const md = formatFullAiContext(ctx, log);

    // Extract the Open Issues section to check filtering
    const openIssuesMatch = md.match(/### Open Issues\n([\s\S]*?)(?=\n###|\n---|\n##|$)/);
    const openIssuesSection = openIssuesMatch?.[1] ?? '';

    // CORS issue should be filtered out from Open Issues (resolved by completed)
    expect(openIssuesSection).not.toContain('CORS error on API calls');
    // Remaining issues should be present
    expect(openIssuesSection).toContain('- Search indexing is slow');
    expect(openIssuesSection).toContain('- Memory leak in list view');
    // The completed item should still appear in What Was Done
    expect(md).toContain('- Fixed CORS error on API calls');
  });

  // ---------------------------------------------------------------------------
  // 8. formatFullAiContext with no latestHandoff = project context only
  // ---------------------------------------------------------------------------

  it('falls back to project context only when no latestHandoff', () => {
    const ctx = makeCtx();
    const md = formatFullAiContext(ctx);

    expect(md).toContain('## Project: ThreadLog');
    expect(md).toContain('### Next Actions');
    expect(md).toContain('- Implement search feature');
    expect(md).not.toContain('## Latest Session');
    expect(md).not.toContain('### What Was Done');
    expect(md).not.toContain('### Resume Checklist');

    // Should be identical to formatProjectContextMarkdown
    const projectMd = formatProjectContextMarkdown(ctx);
    expect(md).toBe(projectMd);
  });

  // ---------------------------------------------------------------------------
  // 9. nextActions come from latestHandoff only
  // ---------------------------------------------------------------------------

  it('uses nextActions from latestHandoff only, ignoring project context', () => {
    const ctx = makeCtx({
      nextActions: ['Implement search feature', 'Add export button'],
    });
    const log = makeLog({
      nextActions: ['Write unit tests for auth.ts'],
      currentStatus: [],
      completed: [],
      decisionRationales: [],
      decisions: [],
      constraints: [],
      blockers: [],
      resumeContext: [],
    });
    const md = formatFullAiContext(ctx, log);

    expect(md).toContain('- Write unit tests for auth.ts');
    expect(md).not.toContain('- Implement search feature');
    expect(md).not.toContain('- Add export button');
  });
});

// ---------------------------------------------------------------------------
// 10. Null rationale decisions produce no rationale text anywhere
// ---------------------------------------------------------------------------

describe('null rationale handling', () => {
  it('never outputs rationale text for null rationale decisions', () => {
    // Test in formatHandoffMarkdown
    const log = makeLog({
      decisionRationales: [
        { decision: 'Keep SPA architecture', rationale: null },
      ],
    });
    const handoffMd = formatHandoffMarkdown(log);
    expect(handoffMd).toContain('- Keep SPA architecture');
    expect(handoffMd).not.toContain('Keep SPA architecture:');
    expect(handoffMd).not.toContain('理由不明');
    expect(handoffMd).not.toMatch(/null/i);

    // Test in formatProjectContextMarkdown
    const ctx = makeCtx({
      keyDecisions: [
        { decision: 'No backend allowed', rationale: null },
        { decision: 'Use React', rationale: 'Team familiarity' },
      ],
    });
    const ctxMd = formatProjectContextMarkdown(ctx);
    expect(ctxMd).toContain('- No backend allowed');
    expect(ctxMd).not.toContain('No backend allowed:');
    expect(ctxMd).toContain('- Use React: Team familiarity');

    // Test in formatFullAiContext
    const fullMd = formatFullAiContext(ctx, log);
    expect(fullMd).toContain('- Keep SPA architecture');
    expect(fullMd).not.toContain('Keep SPA architecture:');
    expect(fullMd).toContain('- No backend allowed');
    expect(fullMd).not.toContain('No backend allowed:');
    expect(fullMd).not.toContain('理由不明');
    // Check no literal "null" appears (except in code/identifiers)
    const lines = fullMd.split('\n');
    for (const line of lines) {
      if (line.startsWith('- ')) {
        expect(line).not.toMatch(/:\s*null\s*$/);
        expect(line).not.toMatch(/\bnull\b/);
      }
    }
  });
});
