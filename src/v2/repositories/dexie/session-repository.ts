/**
 * Dexie adapter for {@link SessionRepository}.
 *
 * All Dexie calls are wrapped in try/catch and returned as `Result<T, LoreError>`.
 * Only genuine storage layer errors (QuotaExceededError, etc.) propagate as
 * `STORAGE_ERROR`; domain-level "not found" becomes `SESSION_NOT_FOUND`.
 *
 * @since 0.2.0
 */
import type { LoreV2DB } from '../../db';
import type { SessionRepository } from '../interfaces';
import type { Session } from '../../schemas/entities';
import type { SessionId, ProjectId } from '../../schemas/ids';
import { ok, err, type Result } from '../../result';
import type { LoreError } from '../../errors';

export class DexieSessionRepository implements SessionRepository {
  private readonly db: LoreV2DB;
  constructor(db: LoreV2DB) {
    this.db = db;
  }

  async findById(id: SessionId): Promise<Result<Session, LoreError>> {
    try {
      const row = await this.db.sessions.get(id as string);
      if (!row) return err({ code: 'SESSION_NOT_FOUND', id });
      return ok(row as Session);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }

  async listByProject(projectId: ProjectId): Promise<readonly Session[]> {
    return this.db.sessions
      .where('[project_id+started_at]')
      .between(
        [projectId as string, Dexie.minKey],
        [projectId as string, Dexie.maxKey],
      )
      .toArray() as Promise<Session[]>;
  }

  async save(session: Session): Promise<Result<void, LoreError>> {
    try {
      await this.db.sessions.put(session);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }

  async saveMany(sessions: readonly Session[]): Promise<Result<void, LoreError>> {
    try {
      await this.db.sessions.bulkPut(sessions as Session[]);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }
}

import Dexie from 'dexie';

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
