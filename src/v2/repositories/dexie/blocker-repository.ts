/**
 * Dexie adapter for {@link BlockerRepository}.
 * @since 0.2.0
 */
import type { LoreV2DB } from '../../db';
import type { BlockerRepository } from '../interfaces';
import type { Blocker } from '../../schemas/entities';
import type { BlockerId, ProjectId } from '../../schemas/ids';
import { ok, err, type Result } from '../../result';
import type { LoreError } from '../../errors';

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class DexieBlockerRepository implements BlockerRepository {
  private readonly db: LoreV2DB;
  constructor(db: LoreV2DB) {
    this.db = db;
  }

  async findById(id: BlockerId): Promise<Result<Blocker, LoreError>> {
    try {
      const row = await this.db.blockers.get(id as string);
      if (!row) return err({ code: 'STORAGE_ERROR', cause: `Blocker ${id} not found` });
      return ok(row as Blocker);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }

  async listByProject(
    projectId: ProjectId,
    status?: Blocker['status'],
  ): Promise<readonly Blocker[]> {
    if (status !== undefined) {
      return this.db.blockers
        .where('[project_id+status]')
        .equals([projectId as string, status])
        .toArray() as Promise<Blocker[]>;
    }
    return this.db.blockers
      .where('project_id')
      .equals(projectId as string)
      .toArray() as Promise<Blocker[]>;
  }

  async save(blocker: Blocker): Promise<Result<void, LoreError>> {
    try {
      await this.db.blockers.put(blocker);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }

  async saveMany(blockers: readonly Blocker[]): Promise<Result<void, LoreError>> {
    try {
      await this.db.blockers.bulkPut(blockers as Blocker[]);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }
}
