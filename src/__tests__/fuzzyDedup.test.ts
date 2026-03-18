import { describe, it, expect } from 'vitest';
import { fuzzyDedupStrings, fuzzyDedupByField } from '../utils/fuzzyDedup';

describe('fuzzyDedupStrings', () => {
  it('returns empty array for empty input', () => {
    expect(fuzzyDedupStrings([])).toEqual([]);
  });

  it('returns single-item arrays unchanged', () => {
    expect(fuzzyDedupStrings(['hello world'])).toEqual(['hello world']);
  });

  it('removes exact duplicates', () => {
    const result = fuzzyDedupStrings(['Set up database schema', 'Set up database schema']);
    expect(result).toEqual(['Set up database schema']);
  });

  it('removes near-duplicates with shared keywords', () => {
    const result = fuzzyDedupStrings([
      'Implemented user authentication with JWT tokens',
      'Implemented user authentication using JWT tokens',
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Implemented user authentication with JWT tokens');
  });

  it('keeps items that are genuinely different', () => {
    const result = fuzzyDedupStrings([
      'Set up database schema for users table',
      'Configured CI/CD pipeline with GitHub Actions',
      'Fixed responsive layout bug on mobile devices',
    ]);
    expect(result).toHaveLength(3);
  });

  it('handles Japanese text dedup', () => {
    // Japanese with shared technical terms that tokenize on particles/punctuation
    const result = fuzzyDedupStrings([
      'データベース スキーマ 設計 実装 完了',
      'データベース スキーマ 設計 実装 終了',
    ]);
    expect(result).toHaveLength(1);
  });

  it('keeps different Japanese items', () => {
    const result = fuzzyDedupStrings([
      'ユーザー認証機能を実装した',
      'デプロイパイプラインを構築した',
    ]);
    expect(result).toHaveLength(2);
  });

  it('handles mixed language items independently', () => {
    const result = fuzzyDedupStrings([
      'Implemented login feature',
      'ログイン機能を実装した',
      'Set up monitoring dashboard',
    ]);
    // Different languages should not match each other
    expect(result).toHaveLength(3);
  });

  it('respects custom threshold - lower threshold removes more', () => {
    const items = [
      'Database schema migration completed',
      'Database schema design finished',
    ];
    const strict = fuzzyDedupStrings(items, 0.8);
    const loose = fuzzyDedupStrings(items, 0.3);
    expect(strict.length).toBeGreaterThanOrEqual(loose.length);
  });

  it('respects custom threshold - higher threshold keeps more', () => {
    const items = [
      'Added error handling for API calls',
      'Added error logging for API responses',
    ];
    // With a very high threshold, both should be kept
    const result = fuzzyDedupStrings(items, 0.95);
    expect(result).toHaveLength(2);
  });

  it('keeps first occurrence when duplicates found', () => {
    const result = fuzzyDedupStrings([
      'First version: set up auth system',
      'Better version: set up auth system with improvements',
    ]);
    if (result.length === 1) {
      expect(result[0]).toContain('First version');
    }
  });

  it('handles items with only stop words gracefully', () => {
    const result = fuzzyDedupStrings(['the', 'and', 'for']);
    // These are very short and may be filtered out as stop words
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('handles items with punctuation correctly', () => {
    const result = fuzzyDedupStrings([
      'Fixed bug: user login fails on timeout',
      'Fixed bug - user login fails on timeout!',
    ]);
    expect(result).toHaveLength(1);
  });

  it('handles three near-duplicates keeping only the first', () => {
    const result = fuzzyDedupStrings([
      'Refactored authentication module for better security',
      'Refactored authentication module improving security',
      'Refactored authentication module with security updates',
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Refactored authentication module for better security');
  });
});

describe('fuzzyDedupByField', () => {
  it('returns empty array for empty input', () => {
    expect(fuzzyDedupByField([], (x: string) => x)).toEqual([]);
  });

  it('returns single-item arrays unchanged', () => {
    const items = [{ text: 'hello', id: 1 }];
    expect(fuzzyDedupByField(items, i => i.text)).toEqual(items);
  });

  it('deduplicates objects by text field', () => {
    const items = [
      { text: 'Implemented user authentication with JWT', id: 1 },
      { text: 'Implemented user authentication using JWT', id: 2 },
      { text: 'Set up CI/CD pipeline', id: 3 },
    ];
    const result = fuzzyDedupByField(items, i => i.text);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(3);
  });

  it('works with custom threshold', () => {
    const items = [
      { name: 'Deploy staging server', priority: 'high' },
      { name: 'Deploy production server', priority: 'low' },
    ];
    // Very high threshold: keep both
    const strict = fuzzyDedupByField(items, i => i.name, 0.95);
    expect(strict).toHaveLength(2);
  });

  it('handles Japanese text in objects', () => {
    const items = [
      { task: 'API エンドポイント テスト 追加 完了', done: true },
      { task: 'API エンドポイント テスト 実装 完了', done: false },
    ];
    const result = fuzzyDedupByField(items, i => i.task);
    expect(result).toHaveLength(1);
    expect(result[0].done).toBe(true); // first occurrence kept
  });
});
