import { describe, it, expect } from 'vitest';
import { PROJECT_COLORS, getProjectColor } from './projectColors';

describe('projectColors', () => {
  it('has 10 colors', () => {
    expect(PROJECT_COLORS).toHaveLength(10);
  });

  it('each color has key, hex, and label', () => {
    for (const c of PROJECT_COLORS) {
      expect(c.key).toBeTruthy();
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.label).toBeTruthy();
    }
  });

  it('returns hex for valid key', () => {
    expect(getProjectColor('red')).toBe('#ef4444');
    expect(getProjectColor('blue')).toBe('#3b82f6');
  });

  it('returns undefined for unknown key', () => {
    expect(getProjectColor('neon')).toBeUndefined();
  });

  it('returns undefined for undefined/empty', () => {
    expect(getProjectColor(undefined)).toBeUndefined();
    expect(getProjectColor('')).toBeUndefined();
  });
});
