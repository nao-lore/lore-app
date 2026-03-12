import { describe, it, expect } from 'vitest';
import { logToMarkdown, handoffResultToMarkdown } from './markdown';
import type { TransformResult, HandoffResult } from './types';

describe('logToMarkdown', () => {
  it('generates markdown for worklog', () => {
    const log: TransformResult = {
      title: 'API Development',
      today: ['Built user endpoint', 'Added validation'],
      decisions: ['Use REST over GraphQL'],
      todo: ['Write integration tests'],
      relatedProjects: ['Backend'],
      tags: ['api', 'backend'],
    };

    const md = logToMarkdown(log);

    expect(md).toContain('# API Development');
    expect(md).toContain('## Today');
    expect(md).toContain('- Built user endpoint');
    expect(md).toContain('- Added validation');
    expect(md).toContain('## Decisions');
    expect(md).toContain('- Use REST over GraphQL');
    expect(md).toContain('## TODO');
    expect(md).toContain('- Write integration tests');
    expect(md).toContain('## Related Projects');
    expect(md).toContain('- Backend');
    expect(md).toContain('## Tags');
    expect(md).toContain('api, backend');
  });

  it('omits empty sections', () => {
    const log: TransformResult = {
      title: 'Quick Note',
      today: ['Did a thing'],
      decisions: [],
      todo: [],
      relatedProjects: [],
      tags: [],
    };

    const md = logToMarkdown(log);

    expect(md).toContain('# Quick Note');
    expect(md).toContain('## Today');
    expect(md).not.toContain('## Decisions');
    expect(md).not.toContain('## TODO');
    expect(md).not.toContain('## Tags');
  });
});

describe('handoffResultToMarkdown', () => {
  it('generates markdown for handoff', () => {
    const handoff: HandoffResult = {
      title: 'Auth System Handoff',
      currentStatus: ['OAuth2 flow implemented'],
      nextActions: ['Add refresh token rotation'],
      completed: ['Basic login working'],
      decisions: ['Use JWT'],
      blockers: ['Rate limit TBD'],
      constraints: ['Must support SAML'],
      resumeContext: ['Start with token refresh logic'],
      tags: ['auth'],
    };

    const md = handoffResultToMarkdown(handoff);

    expect(md).toContain('# Auth System Handoff');
    expect(md).toContain('## Resume Checklist');
    expect(md).toContain('Start with token refresh logic');
    expect(md).toContain('## Current Status');
    expect(md).toContain('- OAuth2 flow implemented');
    expect(md).toContain('## Next Actions');
    expect(md).toContain('## Completed');
    expect(md).toContain('## Decisions');
    expect(md).toContain('## Cautions & Open Issues');
    expect(md).toContain('## Constraints & Scope');
    expect(md).toContain('## Tags');
  });

  it('omits empty sections', () => {
    const handoff: HandoffResult = {
      title: 'Simple Handoff',
      currentStatus: ['Working on it'],
      nextActions: [],
      completed: [],
      decisions: [],
      blockers: [],
      constraints: [],
      resumeContext: [],
      tags: [],
    };

    const md = handoffResultToMarkdown(handoff);

    expect(md).toContain('## Current Status');
    expect(md).not.toContain('## Next Actions');
    expect(md).not.toContain('## Resume Checklist');
    expect(md).not.toContain('## Tags');
  });
});
