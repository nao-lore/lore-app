/**
 * In-memory repository implementations for use in tests.
 *
 * These implementations are intentionally minimal — they use plain Maps
 * and satisfy the repository interfaces without any IndexedDB dependency.
 * Use them to test services in isolation without fake-indexeddb overhead.
 *
 * @example
 * ```ts
 * import {
 *   InMemorySessionRepository,
 *   InMemoryDecisionRepository,
 * } from '../repositories/in-memory';
 *
 * const sessions = new InMemorySessionRepository();
 * const decisions = new InMemoryDecisionRepository();
 * ```
 *
 * @since 0.2.0
 */

import { ok, err, type Result } from '../../result';
import type { LoreError } from '../../errors';
import type {
  Session, Message, Checkpoint, Decision, Todo, Blocker, Learning, Project,
} from '../../schemas/entities';
import type {
  SessionId, MessageId, CheckpointId, DecisionId,
  TodoId, BlockerId, LearningId, ProjectId,
} from '../../schemas/ids';
import type {
  SessionRepository, MessageRepository, CheckpointRepository,
  DecisionRepository, TodoRepository, BlockerRepository,
  LearningRepository, ProjectRepository,
} from '../interfaces';

// ---- Session ----

export class InMemorySessionRepository implements SessionRepository {
  private readonly store = new Map<string, Session>();

  async findById(id: SessionId): Promise<Result<Session, LoreError>> {
    const row = this.store.get(id as string);
    if (!row) return err({ code: 'SESSION_NOT_FOUND', id });
    return ok(row);
  }

  async listByProject(projectId: ProjectId): Promise<readonly Session[]> {
    return [...this.store.values()]
      .filter((s) => s.project_id === (projectId as string))
      .sort((a, b) => a.started_at - b.started_at);
  }

  async save(session: Session): Promise<Result<void, LoreError>> {
    this.store.set(session.id as string, session);
    return ok(undefined);
  }

  async saveMany(sessions: readonly Session[]): Promise<Result<void, LoreError>> {
    for (const s of sessions) this.store.set(s.id as string, s);
    return ok(undefined);
  }

  /** Test helper: reset all state. */
  clear(): void { this.store.clear(); }
  /** Test helper: get all stored sessions. */
  all(): readonly Session[] { return [...this.store.values()]; }
}

// ---- Message ----

export class InMemoryMessageRepository implements MessageRepository {
  private readonly store = new Map<string, Message>();

  async findById(id: MessageId): Promise<Result<Message, LoreError>> {
    const row = this.store.get(id as string);
    if (!row) return err({ code: 'STORAGE_ERROR', cause: `Message ${id} not found` });
    return ok(row);
  }

  async listBySession(sessionId: SessionId): Promise<readonly Message[]> {
    return [...this.store.values()]
      .filter((m) => m.session_id === (sessionId as string))
      .sort((a, b) => a.created_at - b.created_at);
  }

  async save(message: Message): Promise<Result<void, LoreError>> {
    this.store.set(message.id as string, message);
    return ok(undefined);
  }

  async saveMany(messages: readonly Message[]): Promise<Result<void, LoreError>> {
    for (const m of messages) this.store.set(m.id as string, m);
    return ok(undefined);
  }

  clear(): void { this.store.clear(); }
  all(): readonly Message[] { return [...this.store.values()]; }
}

// ---- Checkpoint ----

export class InMemoryCheckpointRepository implements CheckpointRepository {
  private readonly store = new Map<string, Checkpoint>();

  async findById(id: CheckpointId): Promise<Result<Checkpoint, LoreError>> {
    const row = this.store.get(id as string);
    if (!row) return err({ code: 'STORAGE_ERROR', cause: `Checkpoint ${id} not found` });
    return ok(row);
  }

  async listBySession(sessionId: SessionId): Promise<readonly Checkpoint[]> {
    return [...this.store.values()]
      .filter((c) => c.session_id === (sessionId as string))
      .sort((a, b) => a.created_at - b.created_at);
  }

  async save(checkpoint: Checkpoint): Promise<Result<void, LoreError>> {
    this.store.set(checkpoint.id as string, checkpoint);
    return ok(undefined);
  }

  async saveMany(checkpoints: readonly Checkpoint[]): Promise<Result<void, LoreError>> {
    for (const c of checkpoints) this.store.set(c.id as string, c);
    return ok(undefined);
  }

  clear(): void { this.store.clear(); }
  all(): readonly Checkpoint[] { return [...this.store.values()]; }
}

// ---- Decision ----

export class InMemoryDecisionRepository implements DecisionRepository {
  private readonly store = new Map<string, Decision>();

  async findById(id: DecisionId): Promise<Result<Decision, LoreError>> {
    const row = this.store.get(id as string);
    if (!row) return err({ code: 'STORAGE_ERROR', cause: `Decision ${id} not found` });
    return ok(row);
  }

  async listByProject(
    projectId: ProjectId,
    status?: Decision['status'],
  ): Promise<readonly Decision[]> {
    return [...this.store.values()].filter(
      (d) =>
        d.project_id === (projectId as string) &&
        (status === undefined || d.status === status),
    );
  }

  async save(decision: Decision): Promise<Result<void, LoreError>> {
    if (decision.derived_from.message_ids.length === 0) {
      return err({ code: 'PROVENANCE_INVALID', message_ids_count: 0 });
    }
    this.store.set(decision.id as string, decision);
    return ok(undefined);
  }

  async saveMany(decisions: readonly Decision[]): Promise<Result<void, LoreError>> {
    for (const d of decisions) {
      const r = await this.save(d);
      if (!r.ok) return r;
    }
    return ok(undefined);
  }

  clear(): void { this.store.clear(); }
  all(): readonly Decision[] { return [...this.store.values()]; }
}

// ---- Todo ----

export class InMemoryTodoRepository implements TodoRepository {
  private readonly store = new Map<string, Todo>();

  async findById(id: TodoId): Promise<Result<Todo, LoreError>> {
    const row = this.store.get(id as string);
    if (!row) return err({ code: 'STORAGE_ERROR', cause: `Todo ${id} not found` });
    return ok(row);
  }

  async listByProject(projectId: ProjectId, status?: Todo['status']): Promise<readonly Todo[]> {
    return [...this.store.values()].filter(
      (t) =>
        t.project_id === (projectId as string) &&
        (status === undefined || t.status === status),
    );
  }

  async save(todo: Todo): Promise<Result<void, LoreError>> {
    this.store.set(todo.id as string, todo);
    return ok(undefined);
  }

  async saveMany(todos: readonly Todo[]): Promise<Result<void, LoreError>> {
    for (const t of todos) this.store.set(t.id as string, t);
    return ok(undefined);
  }

  clear(): void { this.store.clear(); }
  all(): readonly Todo[] { return [...this.store.values()]; }
}

// ---- Blocker ----

export class InMemoryBlockerRepository implements BlockerRepository {
  private readonly store = new Map<string, Blocker>();

  async findById(id: BlockerId): Promise<Result<Blocker, LoreError>> {
    const row = this.store.get(id as string);
    if (!row) return err({ code: 'STORAGE_ERROR', cause: `Blocker ${id} not found` });
    return ok(row);
  }

  async listByProject(
    projectId: ProjectId,
    status?: Blocker['status'],
  ): Promise<readonly Blocker[]> {
    return [...this.store.values()].filter(
      (b) =>
        b.project_id === (projectId as string) &&
        (status === undefined || b.status === status),
    );
  }

  async save(blocker: Blocker): Promise<Result<void, LoreError>> {
    this.store.set(blocker.id as string, blocker);
    return ok(undefined);
  }

  async saveMany(blockers: readonly Blocker[]): Promise<Result<void, LoreError>> {
    for (const b of blockers) this.store.set(b.id as string, b);
    return ok(undefined);
  }

  clear(): void { this.store.clear(); }
  all(): readonly Blocker[] { return [...this.store.values()]; }
}

// ---- Learning ----

export class InMemoryLearningRepository implements LearningRepository {
  private readonly store = new Map<string, Learning>();

  async findById(id: LearningId): Promise<Result<Learning, LoreError>> {
    const row = this.store.get(id as string);
    if (!row) return err({ code: 'STORAGE_ERROR', cause: `Learning ${id} not found` });
    return ok(row);
  }

  async listByProject(projectId: ProjectId): Promise<readonly Learning[]> {
    return [...this.store.values()]
      .filter((l) => l.project_id === (projectId as string))
      .sort((a, b) => a.created_at - b.created_at);
  }

  async listByTag(tag: string): Promise<readonly Learning[]> {
    return [...this.store.values()].filter((l) => l.tags.includes(tag));
  }

  async save(learning: Learning): Promise<Result<void, LoreError>> {
    this.store.set(learning.id as string, learning);
    return ok(undefined);
  }

  async saveMany(learnings: readonly Learning[]): Promise<Result<void, LoreError>> {
    for (const l of learnings) this.store.set(l.id as string, l);
    return ok(undefined);
  }

  clear(): void { this.store.clear(); }
  all(): readonly Learning[] { return [...this.store.values()]; }
}

// ---- Project ----

export class InMemoryProjectRepository implements ProjectRepository {
  private readonly store = new Map<string, Project>();

  async findById(id: ProjectId): Promise<Result<Project, LoreError>> {
    const row = this.store.get(id as string);
    if (!row) return err({ code: 'STORAGE_ERROR', cause: `Project ${id} not found` });
    return ok(row);
  }

  async listAll(): Promise<readonly Project[]> {
    return [...this.store.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async save(project: Project): Promise<Result<void, LoreError>> {
    this.store.set(project.id as string, project);
    return ok(undefined);
  }

  clear(): void { this.store.clear(); }
  all(): readonly Project[] { return [...this.store.values()]; }
}
