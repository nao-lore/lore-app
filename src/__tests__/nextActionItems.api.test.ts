/**
 * Real API test for nextActionItems structured extraction.
 * Run: GOOGLE_API_KEY=<key> npx vitest run src/__tests__/nextActionItems.api.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { transformHandoff } from '../transform';
import type { HandoffResult } from '../types';

// @ts-expect-error process.env is available in Node/Vitest
const GOOGLE_KEY = (typeof process !== 'undefined' && process.env?.GOOGLE_API_KEY) || '';
const apiDescribe = GOOGLE_KEY ? describe : describe.skip;

const INPUT_WITH_CONTEXT = [
  'User: Chrome拡張のpost-send UIを修正してほしい。送信成功したのに画面が変わらなくてユーザーが混乱してる。これ今日中に直さないとリリースできない。',
  'Assistant: post-send UIの問題を確認しました。sendMessage()の後にsuccessStateへ遷移していませんね。修正します。',
  'User: ありがとう。あとAPI rate limitingも実装したいんだけど、これは来週金曜までにやればいい。production trafficが増えてきてるから重要。ただこれはpost-send UIの修正が終わってからやって。',
  'Assistant: rate limitingはexponential backoffで実装するのがベストです。provider.tsに追加しましょう。',
  'User: それでいこう。あとドキュメントも更新しておいて。これは期限なし、優先度も低い。',
].join('\n');

const INPUT_WITHOUT_CONTEXT = [
  'User: ログイン画面のデザインを修正したい',
  'Assistant: 了解です。現在のログイン画面を確認しました。ボタンの配置とフォントサイズを調整します。',
  'User: CSSを修正してレスポンシブ対応もお願い',
  'Assistant: レスポンシブ対応も含めて修正しました。768px以下でレイアウトが切り替わります。',
  'User: 次はダークモード対応もやりたい',
].join('\n');

apiDescribe('nextActionItems real API extraction', () => {

  beforeAll(() => {
    // Mock localStorage for Node.js environment
    const store: Record<string, string> = {
      threadlog_provider: 'gemini',
      threadlog_api_key_gemini: GOOGLE_KEY,
    };
    (globalThis as unknown as { localStorage: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void } }).localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    };
  });

  it('extracts all structured fields when context is present', async () => {
    const result: HandoffResult = await transformHandoff(INPUT_WITH_CONTEXT);

    // Basic structure
    expect(result.nextActions).toBeDefined();
    expect(result.nextActionItems).toBeDefined();
    expect(Array.isArray(result.nextActions)).toBe(true);
    expect(Array.isArray(result.nextActionItems)).toBe(true);

    // Source of truth: nextActions derived from nextActionItems
    expect(result.nextActionItems!.length).toBe(result.nextActions.length);
    for (let i = 0; i < result.nextActions.length; i++) {
      expect(result.nextActionItems![i].action).toBe(result.nextActions[i]);
    }

    // At least one item should have whyImportant (UX broken / production traffic)
    const withWhy = result.nextActionItems!.filter(a => a.whyImportant);
    expect(withWhy.length).toBeGreaterThanOrEqual(1);

    // At least one item should have dueBy (today / next Friday)
    const withDue = result.nextActionItems!.filter(a => a.dueBy);
    expect(withDue.length).toBeGreaterThanOrEqual(1);

    // At least one item should have priorityReason or dependsOn
    const withPriorityOrDeps = result.nextActionItems!.filter(
      a => a.priorityReason || (a.dependsOn && a.dependsOn.length > 0)
    );
    expect(withPriorityOrDeps.length).toBeGreaterThanOrEqual(1);

    // Doc update should NOT have deadline or dependencies (priorityReason may be "低い" etc. — valid extraction)
    const docAction = result.nextActionItems!.find(a =>
      a.action.includes('ドキュメント') || a.action.toLowerCase().includes('doc')
    );
    if (docAction) {
      expect(docAction.dueBy).toBeNull();
      expect(docAction.dependsOn).toBeNull();
    }

  }, 60_000);

  it('returns null/empty for all optional fields when no context is present', async () => {
    const result: HandoffResult = await transformHandoff(INPUT_WITHOUT_CONTEXT);

    expect(result.nextActionItems).toBeDefined();
    expect(result.nextActionItems!.length).toBe(result.nextActions.length);

    // Order consistency
    for (let i = 0; i < result.nextActions.length; i++) {
      expect(result.nextActionItems![i].action).toBe(result.nextActions[i]);
    }

    // No deadlines, priorities, or dependencies were mentioned
    for (const item of result.nextActionItems!) {
      expect(item.dueBy).toBeNull();
      expect(item.priorityReason).toBeNull();
      // dependsOn should be null or empty array
      if (item.dependsOn !== null) {
        expect(item.dependsOn).toEqual([]);
      }
    }

  }, 60_000);
});
