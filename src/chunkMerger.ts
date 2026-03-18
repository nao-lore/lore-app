/**
 * Chunk merger — combines partial results from multiple chunk extractions
 * into a single unified result.
 */

import type { PartialResult } from './chunkDb';
import type { DecisionWithRationale, NextActionItem } from './types';
import { normalizeNextActions, normalizeActionBacklog } from './transform';
import { dedupStrings, dedupDecisions } from './utils/decisions';

/** Safely extract a string from unknown */
export function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** Safely extract a string[] from unknown */
export function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Collect string arrays from partials for a given key */
export function collectStrings(partials: PartialResult[], key: string): string[] {
  return partials.flatMap((p) => {
    const v = p[key];
    if (!Array.isArray(v)) return [];
    return v.map((item) =>
      typeof item === 'string' ? item
      : typeof item === 'object' && item !== null && 'text' in item ? String((item as { text: unknown }).text)
      : String(item)
    ).filter((s) => s && s !== 'undefined' && s !== 'null' && s !== '[object Object]');
  });
}

/** Flatten combined "both" partials — extract nested worklog/handoff fields to top level */
export function flattenBothPartials(partials: PartialResult[]): PartialResult[] {
  return partials.map((p) => {
    const w = p.worklog as PartialResult | undefined;
    const h = p.handoff as PartialResult | undefined;
    if (!w && !h) return p;
    return {
      title: w?.title || h?.title || p.title,
      today: w?.today, decisions: w?.decisions, todo: w?.todo,
      relatedProjects: w?.relatedProjects, tags: w?.tags || h?.tags,
      currentStatus: h?.currentStatus, nextActions: h?.nextActions,
      nextActionItems: h?.nextActionItems, actionBacklog: h?.actionBacklog,
      completed: h?.completed, blockers: h?.blockers,
      constraints: h?.constraints, resumeContext: h?.resumeContext,
      decisionRationales: h?.decisionRationales || h?.decisions,
    } as PartialResult;
  });
}

/** Take items from the last chunk that has non-empty values for the given key */
export function collectLastChunk(partials: PartialResult[], key: string): string[] {
  for (let i = partials.length - 1; i >= 0; i--) {
    const v = partials[i][key];
    if (Array.isArray(v) && v.length > 0) return v.filter((x): x is string => typeof x === 'string');
    if (typeof v === 'string' && v.trim()) return [v];
  }
  return [];
}

/** Union two nullable string arrays, deduplicating */
export function mergeStringArrays(a: string[] | null | undefined, b: string[] | null | undefined): string[] | null {
  const combined = [...(a || []), ...(b || [])];
  if (combined.length === 0) return null;
  return [...new Set(combined)];
}

/** Merge multiple partial results into a single result */
export function localMerge(partials: PartialResult[], isBothMode = false): PartialResult {
  const flat = isBothMode ? flattenBothPartials(partials) : partials;
  const title = [...flat].reverse().find((p) => p.title && String(p.title).trim())?.title || 'Untitled';

  const merged: PartialResult = {
    title,
    today:           dedupStrings(collectStrings(flat, 'today')),
    decisions:       dedupStrings(collectStrings(flat, 'decisions')),
    todo:            dedupStrings(collectStrings(flat, 'todo')),
    relatedProjects: dedupStrings(collectStrings(flat, 'relatedProjects')),
    tags:            dedupStrings(collectStrings(flat, 'tags')),
    currentStatus:   collectLastChunk(flat, 'currentStatus'),
    nextActions:     [],
    resumeContext:   collectLastChunk(flat, 'resumeContext'),
    completed:       dedupStrings(collectStrings(flat, 'completed')),
    blockers:        dedupStrings(collectStrings(flat, 'blockers')),
    constraints:     dedupStrings(collectStrings(flat, 'constraints')),
  };

  // Merge decisionRationales from all chunks
  const allRationales: DecisionWithRationale[] = [];
  for (const chunk of flat) {
    const dr = chunk.decisionRationales;
    if (Array.isArray(dr)) {
      for (const r of dr) {
        if (typeof r === 'object' && r !== null && 'decision' in r) {
          allRationales.push(r as DecisionWithRationale);
        }
      }
    }
    const decs = chunk.decisions;
    if (Array.isArray(decs)) {
      for (const item of decs) {
        if (typeof item === 'object' && item !== null && 'decision' in item) {
          const obj = item as { decision: unknown; rationale?: unknown };
          allRationales.push({
            decision: String(obj.decision || ''),
            rationale: typeof obj.rationale === 'string' ? obj.rationale : null,
          });
        }
      }
    }
  }
  const dedupedRationales = dedupDecisions(allRationales);
  merged.decisionRationales = dedupedRationales;
  if (allRationales.length > 0) {
    merged.decisions = dedupedRationales.map(dr => dr.decision);
  }

  // Merge nextActionItems across chunks
  {
    const allChunkItems: { items: NextActionItem[]; chunkIndex: number }[] = [];
    for (let ci = 0; ci < flat.length; ci++) {
      const raw = flat[ci].nextActions;
      if (Array.isArray(raw) && raw.length > 0) {
        const { nextActionItems: items } = normalizeNextActions(raw);
        allChunkItems.push({ items, chunkIndex: ci });
      }
    }
    const actionMap = new Map<string, { item: NextActionItem; chunkIndex: number }>();
    for (const { items, chunkIndex } of allChunkItems) {
      for (const item of items) {
        const key = item.action;
        const existing = actionMap.get(key);
        if (existing) {
          const merged_item: NextActionItem = {
            action: key,
            whyImportant: item.whyImportant ?? existing.item.whyImportant,
            priorityReason: item.priorityReason ?? existing.item.priorityReason,
            dueBy: item.dueBy ?? existing.item.dueBy,
            dependsOn: mergeStringArrays(existing.item.dependsOn, item.dependsOn),
          };
          actionMap.set(key, { item: merged_item, chunkIndex });
        } else {
          actionMap.set(key, { item: { ...item }, chunkIndex });
        }
      }
    }
    void (allChunkItems.length > 0 ? allChunkItems[allChunkItems.length - 1].chunkIndex : -1);
    const latestActions = allChunkItems.length > 0 ? allChunkItems[allChunkItems.length - 1].items.map(i => i.action) : [];
    const orderedItems: NextActionItem[] = [];
    const seen = new Set<string>();
    for (const action of latestActions) {
      const entry = actionMap.get(action);
      if (entry) { orderedItems.push(entry.item); seen.add(action); }
    }
    for (const [action, entry] of actionMap) {
      if (!seen.has(action)) { orderedItems.push(entry.item); }
    }
    merged.nextActionItems = orderedItems;
    merged.nextActions = orderedItems.map(i => i.action);
  }

  // Merge actionBacklog across chunks
  {
    const allBacklogItems: { items: NextActionItem[]; chunkIndex: number }[] = [];
    for (let ci = 0; ci < flat.length; ci++) {
      const raw = flat[ci].actionBacklog;
      if (Array.isArray(raw) && raw.length > 0) {
        const items = normalizeActionBacklog(raw);
        allBacklogItems.push({ items, chunkIndex: ci });
      }
    }
    const backlogMap = new Map<string, NextActionItem>();
    for (const { items } of allBacklogItems) {
      for (const item of items) {
        const existing = backlogMap.get(item.action);
        if (existing) {
          backlogMap.set(item.action, {
            action: item.action,
            whyImportant: item.whyImportant ?? existing.whyImportant,
            priorityReason: item.priorityReason ?? existing.priorityReason,
            dueBy: item.dueBy ?? existing.dueBy,
            dependsOn: mergeStringArrays(existing.dependsOn, item.dependsOn),
          });
        } else {
          backlogMap.set(item.action, { ...item });
        }
      }
    }
    const latestBacklog = allBacklogItems.length > 0 ? allBacklogItems[allBacklogItems.length - 1].items.map(i => i.action) : [];
    const orderedBacklog: NextActionItem[] = [];
    const seenBacklog = new Set<string>();
    for (const action of latestBacklog) {
      const entry = backlogMap.get(action);
      if (entry) { orderedBacklog.push(entry); seenBacklog.add(action); }
    }
    for (const [action, entry] of backlogMap) {
      if (!seenBacklog.has(action)) orderedBacklog.push(entry);
    }
    if (orderedBacklog.length > 0) merged.actionBacklog = orderedBacklog.slice(0, 7);
  }

  // For "both" mode, reconstruct nested structure
  if (isBothMode) {
    merged.worklog = {
      title: merged.title,
      today: merged.today, decisions: merged.decisions,
      todo: merged.todo, relatedProjects: merged.relatedProjects, tags: merged.tags,
    } as PartialResult;
    merged.handoff = {
      title: merged.title,
      currentStatus: merged.currentStatus, nextActions: merged.nextActions,
      nextActionItems: merged.nextActionItems, actionBacklog: merged.actionBacklog,
      completed: merged.completed, blockers: merged.blockers,
      decisions: merged.decisions, decisionRationales: merged.decisionRationales,
      constraints: merged.constraints,
      tags: merged.tags,
    } as PartialResult;
  }

  return merged;
}
