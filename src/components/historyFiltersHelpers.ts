import type { LogEntry, OutputMode } from '../types';

// ─── Keyword extraction ───
const STOP_WORDS = new Set([
  // English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet',
  'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same',
  'than', 'too', 'very', 'just', 'because', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he',
  'she', 'they', 'them', 'their', 'what', 'which', 'who', 'when', 'where',
  'how', 'if', 'then', 'also', 'about', 'up', 'out', 'one', 'two',
  'new', 'now', 'way', 'use', 'used', 'using',
  // Japanese particles/common words
  'の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'れ',
  'さ', 'ある', 'いる', 'する', 'も', 'な', 'よう', 'こと', 'これ',
  'それ', 'もの', 'ため', 'から', 'まで', 'など', 'です', 'ます',
]);

export function extractKeywords(logs: LogEntry[]): { word: string; count: number }[] {
  const freq = new Map<string, number>();

  for (const log of logs) {
    for (const tag of log.tags) {
      const lower = tag.toLowerCase().trim();
      if (lower.length >= 2) {
        freq.set(lower, (freq.get(lower) || 0) + 3);
      }
    }

    const texts = [log.title];
    if (log.outputMode === 'handoff') {
      if (log.currentStatus) texts.push(...log.currentStatus);
      if (log.nextActions) texts.push(...log.nextActions);
      if (log.completed) texts.push(...log.completed);
    } else {
      texts.push(...log.today, ...log.decisions);
    }

    for (const text of texts) {
      const words = text.split(/[\s、。,.:;!?()（）「」[\]{}/\-—=+*#@<>]+/);
      for (const raw of words) {
        const w = raw.toLowerCase().trim();
        if (w.length < 2 || STOP_WORDS.has(w) || /^\d+$/.test(w)) continue;
        freq.set(w, (freq.get(w) || 0) + 1);
      }
    }
  }

  return Array.from(freq.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

// ─── Date filter helpers ───
export type DatePreset = 'today' | 'week' | 'month' | 'custom';

export function getDateRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const today = fmt(now);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      const start = new Date(now);
      start.setDate(start.getDate() - start.getDay());
      return { from: fmt(start), to: today };
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: fmt(start), to: today };
    }
    default:
      return { from: '', to: '' };
  }
}

export function matchesDateRange(log: LogEntry, from: string, to: string): boolean {
  const d = log.createdAt.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export { matchesLogQuery as matchesQuery } from '../search';

export type ModeFilter = 'all' | 'pinned' | OutputMode;
export type SortKey = 'created' | 'title' | 'type';
export type GroupKey = 'none' | 'date' | 'type' | 'project' | 'pinned';
