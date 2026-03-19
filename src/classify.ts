import type { LogEntry, Project } from './types';
import { callProvider, shouldUseBuiltinApi } from './provider';
import { getApiKey, safeGetItem, safeSetItem } from './storage';
import { extractJson } from './transform';
import { safeJsonParse } from './utils/safeJsonParse';

const CORRECTIONS_KEY = 'threadlog_classify_corrections';

export interface ClassifyResult {
  projectId: string | null;
  confidence: number;
}

interface Correction {
  title: string;
  tags: string[];
  projectId: string;
}

// --- Correction storage for learning ---

export function loadCorrections(): Correction[] {
  const raw = safeGetItem(CORRECTIONS_KEY);
  const parsed = safeJsonParse<unknown>(raw, []);
  return Array.isArray(parsed) ? parsed as Correction[] : [];
}

export function saveCorrection(log: LogEntry, projectId: string): void {
  const corrections = loadCorrections();
  // Keep last 50 corrections
  corrections.push({ title: log.title, tags: log.tags, projectId });
  if (corrections.length > 50) corrections.splice(0, corrections.length - 50);
  safeSetItem(CORRECTIONS_KEY, JSON.stringify(corrections));
}

// --- Classification cache (in-memory, max 50 entries) ---

const classifyCache = new Map<string, ClassifyResult>();
const CACHE_MAX = 50;

function makeCacheKey(
  log: Pick<LogEntry, 'title' | 'tags' | 'relatedProjects'>,
  projectIds: string[],
): string {
  return `${log.title}|${log.tags.join(',')}|${(log.relatedProjects || []).join(',')}|${projectIds.join(',')}`;
}

// --- Classification ---

function buildExamplesBlock(corrections: Correction[], projects: Project[]): string {
  if (corrections.length === 0) return '';
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));
  const examples = corrections
    .filter((c) => projectMap.has(c.projectId))
    .slice(-10)
    .map((c) => `- "${c.title}" [${c.tags.join(', ')}] → "${projectMap.get(c.projectId)}"`)
    .join('\n');
  if (!examples) return '';
  return `\n\nHere are recent user corrections (these override your judgment):\n${examples}`;
}

export async function classifyLog(
  log: Pick<LogEntry, 'title' | 'today' | 'decisions' | 'todo' | 'tags' | 'relatedProjects'>,
  projects: Project[],
): Promise<ClassifyResult> {
  if (projects.length === 0) return { projectId: null, confidence: 0 };

  const apiKey = getApiKey();
  if (!apiKey && !shouldUseBuiltinApi()) return { projectId: null, confidence: 0 };

  // Check in-memory cache
  const cacheKey = makeCacheKey(log, projects.map((p) => p.id));
  const cached = classifyCache.get(cacheKey);
  if (cached) {
    // LRU: move to end by re-inserting
    classifyCache.delete(cacheKey);
    classifyCache.set(cacheKey, cached);
    return cached;
  }

  const corrections = loadCorrections();
  const examplesBlock = buildExamplesBlock(corrections, projects);

  const projectNames = projects.map((p) => `- "${p.name}" (id: ${p.id})`).join('\n');

  const system = `You are a project classifier. Given a work log and a list of projects, determine which project this log belongs to.

Output ONLY valid JSON:
{"projectId": "the-project-id-or-null", "confidence": 0.0-1.0}

Rules:
- Match based on topic, keywords, tags, and related projects
- If no project is a good match, return {"projectId": null, "confidence": 0}
- confidence 0.8-1.0: strong match (clear topic overlap)
- confidence 0.5-0.7: possible match (some overlap)
- confidence 0.0-0.4: weak or no match
- Only use project IDs from the provided list${examplesBlock}`;

  const content = [
    `Title: ${log.title}`,
    log.today.length ? `Work done: ${log.today.join('; ')}` : '',
    log.decisions.length ? `Decisions: ${log.decisions.join('; ')}` : '',
    log.todo.length ? `TODO: ${log.todo.join('; ')}` : '',
    log.tags.length ? `Tags: ${log.tags.join(', ')}` : '',
    log.relatedProjects.length ? `Related: ${log.relatedProjects.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const userMessage = `Projects:\n${projectNames}\n\nLog:\n${content}`;

  try {
    const rawText = await callProvider({
      apiKey,
      system,
      userMessage,
      maxTokens: 128,
      disableThinking: false, // Allow thinking for classification accuracy
    });

    const jsonStr = extractJson(rawText);
    const parsed = JSON.parse(jsonStr);
    const projectId = parsed.projectId || null;
    const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0;

    // Validate that projectId exists
    if (projectId && !projects.some((p) => p.id === projectId)) {
      return { projectId: null, confidence: 0 };
    }

    const result: ClassifyResult = { projectId, confidence };
    // Store in cache; LRU eviction if full
    if (classifyCache.size >= CACHE_MAX) {
      // Delete the oldest entry (first key in Map insertion order)
      const oldestKey = classifyCache.keys().next().value;
      if (oldestKey !== undefined) classifyCache.delete(oldestKey);
    }
    classifyCache.set(cacheKey, result);
    return result;
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[Classify] Failed:', err);
    return { projectId: null, confidence: 0 };
  }
}
