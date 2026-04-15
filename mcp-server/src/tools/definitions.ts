import { z } from 'zod';

// ---- lore_search ----

export const LoreSearchInput = z.object({
  query: z.string().min(1).max(500),
  kind: z
    .enum(['all', 'decision', 'todo', 'blocker', 'learning', 'message'])
    .default('all'),
  project_id: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export type LoreSearchInput = z.infer<typeof LoreSearchInput>;

export const LoreSearchOutput = z.object({
  results: z.array(
    z.object({
      kind: z.string(),
      id: z.string(),
      title: z.string(),
      snippet: z.string(),
      session_id: z.string(),
      project_id: z.string().nullable(),
      derived_from_message_ids: z.array(z.string()),
      created_at: z.number(),
    }),
  ),
  total_matched: z.number().int().nonnegative(),
});

export type LoreSearchOutput = z.infer<typeof LoreSearchOutput>;

// ---- lore_get_project_dna ----

export const GetProjectDnaInput = z.object({
  project_id: z.string(),
});

export type GetProjectDnaInput = z.infer<typeof GetProjectDnaInput>;

export const GetProjectDnaOutput = z.object({
  project: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
  }),
  active_decisions: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      rationale: z.string(),
      created_at: z.number(),
    }),
  ),
  open_blockers: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      severity: z.string(),
      description: z.string(),
    }),
  ),
  recent_learnings: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      content: z.string(),
      created_at: z.number(),
    }),
  ),
  summary: z.string(),
});

export type GetProjectDnaOutput = z.infer<typeof GetProjectDnaOutput>;

// ---- lore_list_open_todos ----

export const ListOpenTodosInput = z.object({
  project_id: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export type ListOpenTodosInput = z.infer<typeof ListOpenTodosInput>;

export const ListOpenTodosOutput = z.object({
  todos: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      body: z.string(),
      priority: z.string(),
      due_at: z.number().nullable(),
      project_id: z.string().nullable(),
    }),
  ),
});

export type ListOpenTodosOutput = z.infer<typeof ListOpenTodosOutput>;
