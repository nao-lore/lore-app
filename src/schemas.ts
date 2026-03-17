import { z } from 'zod';

export const WorklogResultSchema = z.object({
  title: z.string().default('Untitled'),
  today: z.array(z.string()).default([]),
  decisions: z.array(z.string()).default([]),
  todo: z.array(z.string()).default([]),
  relatedProjects: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export const HandoffResultSchema = z.object({
  title: z.string().default('Untitled'),
  handoffMeta: z.object({
    sessionFocus: z.string().nullable().default(null),
    whyThisSession: z.string().nullable().default(null),
    timePressure: z.string().nullable().default(null),
  }).default({}),
  currentStatus: z.array(z.string()).default([]),
  resumeChecklist: z.array(z.object({
    action: z.string(),
    whyNow: z.string().nullable().default(null),
    ifSkipped: z.string().nullable().default(null),
  })).default([]),
  nextActions: z.array(z.unknown()).default([]),
  actionBacklog: z.array(z.unknown()).default([]),
  completed: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  decisions: z.array(z.unknown()).default([]),
  constraints: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export const TodoOnlyResultSchema = z.object({
  todos: z.array(z.object({
    title: z.string(),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
    dueDate: z.string().nullable().optional(),
  })).default([]),
});

/** Safe parse with fallback — logs warning but doesn't throw */
export function safeParse<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  if (import.meta.env.DEV) {
    console.warn(`[Zod] ${label} validation issues:`, result.error.issues);
  }
  // Return the data as-is with defaults applied via parse
  return schema.parse(data);
}
