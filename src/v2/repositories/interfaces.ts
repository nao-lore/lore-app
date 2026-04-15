/**
 * Repository interfaces for Lore v2 domain entities.
 *
 * All database access must go through these interfaces. Application-layer code
 * must never import Dexie directly; only adapter implementations in
 * `./dexie/` may do so.
 *
 * @see ADR-0004 — Repository Pattern over Direct Dexie
 * @since 0.2.0
 *
 * @example
 * ```ts
 * // In a service:
 * class CheckpointService {
 *   constructor(
 *     private readonly sessions: SessionRepository,
 *     private readonly messages: MessageRepository,
 *   ) {}
 * }
 *
 * // In tests — use in-memory implementations:
 * const sessions = new InMemorySessionRepository();
 * const svc = new CheckpointService(sessions, messages);
 * ```
 */

import type { Result } from '../result';
import type { LoreError } from '../errors';
import type {
  Session,
  Message,
  Checkpoint,
  Decision,
  Todo,
  Blocker,
  Learning,
  Project,
} from '../schemas/entities';
import type {
  SessionId,
  MessageId,
  CheckpointId,
  DecisionId,
  TodoId,
  BlockerId,
  LearningId,
  ProjectId,
} from '../schemas/ids';

// ---- SessionRepository ----

/**
 * Read/write access to {@link Session} entities.
 *
 * @example
 * ```ts
 * const result = await repo.findById('01ABCDEFGHJKMNPQRSTVWXYZ01' as SessionId);
 * if (!result.ok) return; // SESSION_NOT_FOUND
 * console.log(result.value.title);
 * ```
 */
export interface SessionRepository {
  /**
   * Find a session by its unique ID.
   * Returns `SESSION_NOT_FOUND` if the ID does not exist.
   */
  findById(id: SessionId): Promise<Result<Session, LoreError>>;

  /**
   * List all sessions for a project, ordered by `started_at` ascending.
   * Returns an empty array if the project has no sessions.
   */
  listByProject(projectId: ProjectId): Promise<readonly Session[]>;

  /**
   * Persist a session (insert or replace).
   */
  save(session: Session): Promise<Result<void, LoreError>>;

  /**
   * Persist multiple sessions in a single batch transaction.
   */
  saveMany(sessions: readonly Session[]): Promise<Result<void, LoreError>>;
}

// ---- MessageRepository ----

/**
 * Read/write access to {@link Message} entities.
 *
 * @example
 * ```ts
 * const messages = await repo.listBySession(sessionId);
 * ```
 */
export interface MessageRepository {
  /** Find a message by its unique ID. */
  findById(id: MessageId): Promise<Result<Message, LoreError>>;

  /**
   * List all messages in a session, ordered by `created_at` ascending.
   */
  listBySession(sessionId: SessionId): Promise<readonly Message[]>;

  /** Persist a message (insert or replace). */
  save(message: Message): Promise<Result<void, LoreError>>;

  /** Persist multiple messages in a single batch transaction. */
  saveMany(messages: readonly Message[]): Promise<Result<void, LoreError>>;
}

// ---- CheckpointRepository ----

/**
 * Read/write access to {@link Checkpoint} entities.
 *
 * @example
 * ```ts
 * const checkpoints = await repo.listBySession(sessionId);
 * const latest = checkpoints.at(-1);
 * ```
 */
export interface CheckpointRepository {
  /** Find a checkpoint by its unique ID. */
  findById(id: CheckpointId): Promise<Result<Checkpoint, LoreError>>;

  /**
   * List checkpoints in a session, ordered by `created_at` ascending.
   */
  listBySession(sessionId: SessionId): Promise<readonly Checkpoint[]>;

  /** Persist a checkpoint (insert or replace). */
  save(checkpoint: Checkpoint): Promise<Result<void, LoreError>>;

  /** Persist multiple checkpoints in a single batch transaction. */
  saveMany(checkpoints: readonly Checkpoint[]): Promise<Result<void, LoreError>>;
}

// ---- DecisionRepository ----

/**
 * Read/write access to {@link Decision} entities.
 *
 * Decisions carry a required `derived_from` provenance with `message_ids.length >= 1`.
 * The repository enforces this invariant at save time.
 *
 * @example
 * ```ts
 * const active = await repo.listByProject(projectId, 'active');
 * ```
 */
export interface DecisionRepository {
  /** Find a decision by its unique ID. */
  findById(id: DecisionId): Promise<Result<Decision, LoreError>>;

  /**
   * List decisions for a project, optionally filtered by status.
   * Returns an empty array if none match.
   */
  listByProject(
    projectId: ProjectId,
    status?: Decision['status'],
  ): Promise<readonly Decision[]>;

  /**
   * Persist a decision (insert or replace).
   * Returns `PROVENANCE_INVALID` if `derived_from.message_ids` is empty.
   */
  save(decision: Decision): Promise<Result<void, LoreError>>;

  /** Persist multiple decisions in a single batch transaction. */
  saveMany(decisions: readonly Decision[]): Promise<Result<void, LoreError>>;
}

// ---- TodoRepository ----

/**
 * Read/write access to {@link Todo} entities.
 *
 * @example
 * ```ts
 * const open = await repo.listByProject(projectId, 'open');
 * ```
 */
export interface TodoRepository {
  /** Find a todo by its unique ID. */
  findById(id: TodoId): Promise<Result<Todo, LoreError>>;

  /**
   * List todos for a project, optionally filtered by status.
   */
  listByProject(
    projectId: ProjectId,
    status?: Todo['status'],
  ): Promise<readonly Todo[]>;

  /** Persist a todo (insert or replace). */
  save(todo: Todo): Promise<Result<void, LoreError>>;

  /** Persist multiple todos in a single batch transaction. */
  saveMany(todos: readonly Todo[]): Promise<Result<void, LoreError>>;
}

// ---- BlockerRepository ----

/**
 * Read/write access to {@link Blocker} entities.
 *
 * @example
 * ```ts
 * const critical = (await repo.listByProject(projectId))
 *   .filter(b => b.severity === 'critical');
 * ```
 */
export interface BlockerRepository {
  /** Find a blocker by its unique ID. */
  findById(id: BlockerId): Promise<Result<Blocker, LoreError>>;

  /**
   * List blockers for a project, optionally filtered by status.
   */
  listByProject(
    projectId: ProjectId,
    status?: Blocker['status'],
  ): Promise<readonly Blocker[]>;

  /** Persist a blocker (insert or replace). */
  save(blocker: Blocker): Promise<Result<void, LoreError>>;

  /** Persist multiple blockers in a single batch transaction. */
  saveMany(blockers: readonly Blocker[]): Promise<Result<void, LoreError>>;
}

// ---- LearningRepository ----

/**
 * Read/write access to {@link Learning} entities.
 *
 * @example
 * ```ts
 * const tagged = await repo.listByTag('dexie');
 * ```
 */
export interface LearningRepository {
  /** Find a learning by its unique ID. */
  findById(id: LearningId): Promise<Result<Learning, LoreError>>;

  /**
   * List learnings for a project, ordered by `created_at` ascending.
   */
  listByProject(projectId: ProjectId): Promise<readonly Learning[]>;

  /**
   * List learnings that carry a specific tag (multi-entry index).
   */
  listByTag(tag: string): Promise<readonly Learning[]>;

  /** Persist a learning (insert or replace). */
  save(learning: Learning): Promise<Result<void, LoreError>>;

  /** Persist multiple learnings in a single batch transaction. */
  saveMany(learnings: readonly Learning[]): Promise<Result<void, LoreError>>;
}

// ---- ProjectRepository ----

/**
 * Read/write access to {@link Project} entities.
 *
 * @example
 * ```ts
 * const projects = await repo.listAll();
 * const active = projects.filter(p => !p.archived);
 * ```
 */
export interface ProjectRepository {
  /** Find a project by its unique ID. */
  findById(id: ProjectId): Promise<Result<Project, LoreError>>;

  /**
   * List all projects, ordered by `name` ascending.
   */
  listAll(): Promise<readonly Project[]>;

  /** Persist a project (insert or replace). */
  save(project: Project): Promise<Result<void, LoreError>>;
}
