/**
 * integration.test.ts — End-to-end transform flow test
 * @vitest-environment jsdom
 *
 * Mocks the provider layer and runs a full transform pipeline:
 * input text -> transform -> verify output structure
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage
vi.mock('../storage', () => ({
  safeGetItem: vi.fn(() => null),
  safeSetItem: vi.fn(),
  safeRemoveItem: vi.fn(),
  getApiKey: vi.fn(() => 'test-key'),
  getLang: vi.fn(() => 'en'),
  getFeatureEnabled: vi.fn(() => true),
  addLog: vi.fn(),
  addTodosFromLog: vi.fn(),
  addTodosFromLogWithMeta: vi.fn(),
  updateLog: vi.fn(),
  getLog: vi.fn(),
  loadLogs: vi.fn(() => []),
}));

// Mock provider to return a valid JSON response
const mockCallProvider = vi.fn();
vi.mock('../provider', () => ({
  callProvider: (...args: unknown[]) => mockCallProvider(...args),
  callProviderStream: vi.fn(),
  getActiveProvider: vi.fn(() => 'gemini'),
  shouldUseBuiltinApi: vi.fn(() => false),
  PROVIDER_MODEL_LABELS: { gemini: 'gemini-1.5-flash' },
}));

// Mock worker helper
vi.mock('../workers/parseHelper', () => ({
  parseJsonInWorker: vi.fn((text: string) => Promise.resolve(JSON.parse(text))),
}));

// Mock retry manager
vi.mock('../utils/retryManager', () => ({
  callWithRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { transformText } from '../transform';

describe('integration: full transform flow', () => {
  beforeEach(() => {
    mockCallProvider.mockReset();
  });

  it('transforms input text into a structured worklog result', async () => {
    // Simulate what the AI provider returns
    const mockResponse = JSON.stringify({
      title: 'React Auth Implementation',
      today: ['Implemented JWT authentication', 'Added login form component'],
      decisions: ['Use JWT over session-based auth'],
      todo: ['Add password reset flow', 'Write auth tests'],
      relatedProjects: ['auth-service'],
      tags: ['react', 'auth', 'jwt'],
    });

    mockCallProvider.mockResolvedValueOnce(mockResponse);

    const inputText = `
User: I need to implement authentication for our React app.
Assistant: I'll implement JWT-based authentication. Here's the plan:
1. Create a login form component
2. Set up JWT token handling
3. Add protected routes

I've implemented the JWT authentication with a login form.
The auth flow uses access + refresh tokens.

User: Looks good. What's next?
Assistant: Next steps:
- Add password reset flow
- Write tests for the auth module
    `.trim();

    const result = await transformText(inputText);

    // Verify the output structure matches TransformResult
    expect(result).toBeDefined();
    expect(typeof result.title).toBe('string');
    expect(result.title.length).toBeGreaterThan(0);
    expect(Array.isArray(result.today)).toBe(true);
    expect(Array.isArray(result.decisions)).toBe(true);
    expect(Array.isArray(result.todo)).toBe(true);
    expect(Array.isArray(result.relatedProjects)).toBe(true);
    expect(Array.isArray(result.tags)).toBe(true);

    // Verify the provider was called
    expect(mockCallProvider).toHaveBeenCalledTimes(1);
  });
});
