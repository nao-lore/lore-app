/**
 * Dexie adapter for {@link TodoRepository}.
 * @since 0.2.0
 */
import type { LoreV2DB } from '../../db';
import type { TodoRepository } from '../interfaces';
import type { Todo } from '../../schemas/entities';
import type { TodoId, ProjectId } from '../../schemas/ids';
import { ok, err, type Result } from '../../result';
import type { LoreError } from '../../errors';

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class DexieTodoRepository implements TodoRepository {
  private readonly db: LoreV2DB;
  constructor(db: LoreV2DB) {
    this.db = db;
  }

  async findById(id: TodoId): Promise<Result<Todo, LoreError>> {
    try {
      const row = await this.db.todos.get(id as string);
      if (!row) return err({ code: 'STORAGE_ERROR', cause: `Todo ${id} not found` });
      return ok(row as Todo);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }

  async listByProject(projectId: ProjectId, status?: Todo['status']): Promise<readonly Todo[]> {
    if (status !== undefined) {
      return this.db.todos
        .where('[project_id+status]')
        .equals([projectId as string, status])
        .toArray() as Promise<Todo[]>;
    }
    return this.db.todos
      .where('project_id')
      .equals(projectId as string)
      .toArray() as Promise<Todo[]>;
  }

  async save(todo: Todo): Promise<Result<void, LoreError>> {
    try {
      await this.db.todos.put(todo);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }

  async saveMany(todos: readonly Todo[]): Promise<Result<void, LoreError>> {
    try {
      await this.db.todos.bulkPut(todos as Todo[]);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }
}
