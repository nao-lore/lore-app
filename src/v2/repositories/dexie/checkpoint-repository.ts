/**
 * Dexie adapter for {@link CheckpointRepository}.
 * @since 0.2.0
 */
import Dexie from 'dexie';
import type { LoreV2DB } from '../../db';
import type { CheckpointRepository } from '../interfaces';
import type { Checkpoint } from '../../schemas/entities';
import type { CheckpointId, SessionId } from '../../schemas/ids';
import { ok, err, type Result } from '../../result';
import type { LoreError } from '../../errors';

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class DexieCheckpointRepository implements CheckpointRepository {
  constructor(private readonly db: LoreV2DB) {}

  async findById(id: CheckpointId): Promise<Result<Checkpoint, LoreError>> {
    try {
      const row = await this.db.checkpoints.get(id as string);
      if (!row) return err({ code: 'STORAGE_ERROR', cause: `Checkpoint ${id} not found` });
      return ok(row as Checkpoint);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }

  async listBySession(sessionId: SessionId): Promise<readonly Checkpoint[]> {
    return this.db.checkpoints
      .where('[session_id+created_at]')
      .between(
        [sessionId as string, Dexie.minKey],
        [sessionId as string, Dexie.maxKey],
      )
      .toArray() as Promise<Checkpoint[]>;
  }

  async save(checkpoint: Checkpoint): Promise<Result<void, LoreError>> {
    try {
      await this.db.checkpoints.put(checkpoint);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }

  async saveMany(checkpoints: readonly Checkpoint[]): Promise<Result<void, LoreError>> {
    try {
      await this.db.checkpoints.bulkPut(checkpoints as Checkpoint[]);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }
}
