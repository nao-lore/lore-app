/**
 * Dexie adapter for {@link ProjectRepository}.
 * @since 0.2.0
 */
import type { LoreV2DB } from '../../db';
import type { ProjectRepository } from '../interfaces';
import type { Project } from '../../schemas/entities';
import type { ProjectId } from '../../schemas/ids';
import { ok, err, type Result } from '../../result';
import type { LoreError } from '../../errors';

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class DexieProjectRepository implements ProjectRepository {
  constructor(private readonly db: LoreV2DB) {}

  async findById(id: ProjectId): Promise<Result<Project, LoreError>> {
    try {
      const row = await this.db.projects.get(id as string);
      if (!row) return err({ code: 'STORAGE_ERROR', cause: `Project ${id} not found` });
      return ok(row as Project);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }

  async listAll(): Promise<readonly Project[]> {
    return this.db.projects.orderBy('name').toArray() as Promise<Project[]>;
  }

  async save(project: Project): Promise<Result<void, LoreError>> {
    try {
      await this.db.projects.put(project);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }
}
