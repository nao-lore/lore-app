/**
 * Dexie adapter for {@link LearningRepository}.
 * @since 0.2.0
 */
import type { LoreV2DB } from '../../db';
import type { LearningRepository } from '../interfaces';
import type { Learning } from '../../schemas/entities';
import type { LearningId, ProjectId } from '../../schemas/ids';
import { ok, err, type Result } from '../../result';
import type { LoreError } from '../../errors';

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class DexieLearningRepository implements LearningRepository {
  constructor(private readonly db: LoreV2DB) {}

  async findById(id: LearningId): Promise<Result<Learning, LoreError>> {
    try {
      const row = await this.db.learnings.get(id as string);
      if (!row) return err({ code: 'STORAGE_ERROR', cause: `Learning ${id} not found` });
      return ok(row as Learning);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }

  async listByProject(projectId: ProjectId): Promise<readonly Learning[]> {
    return this.db.learnings
      .where('[project_id+created_at]')
      .between(
        [projectId as string, -Infinity],
        [projectId as string, Infinity],
      )
      .toArray() as Promise<Learning[]>;
  }

  async listByTag(tag: string): Promise<readonly Learning[]> {
    // Multi-entry index defined with * prefix is queried without the prefix.
    return this.db.learnings
      .where('tags')
      .equals(tag)
      .toArray() as Promise<Learning[]>;
  }

  async save(learning: Learning): Promise<Result<void, LoreError>> {
    try {
      await this.db.learnings.put(learning);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }

  async saveMany(learnings: readonly Learning[]): Promise<Result<void, LoreError>> {
    try {
      await this.db.learnings.bulkPut(learnings as Learning[]);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }
}
