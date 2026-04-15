/**
 * Dexie adapter for {@link MessageRepository}.
 * @since 0.2.0
 */
import Dexie from 'dexie';
import type { LoreV2DB } from '../../db';
import type { MessageRepository } from '../interfaces';
import type { Message } from '../../schemas/entities';
import type { MessageId, SessionId } from '../../schemas/ids';
import { ok, err, type Result } from '../../result';
import type { LoreError } from '../../errors';

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class DexieMessageRepository implements MessageRepository {
  constructor(private readonly db: LoreV2DB) {}

  async findById(id: MessageId): Promise<Result<Message, LoreError>> {
    try {
      const row = await this.db.messages.get(id as string);
      if (!row) return err({ code: 'STORAGE_ERROR', cause: `Message ${id} not found` });
      return ok(row as Message);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }

  async listBySession(sessionId: SessionId): Promise<readonly Message[]> {
    return this.db.messages
      .where('[session_id+created_at]')
      .between(
        [sessionId as string, Dexie.minKey],
        [sessionId as string, Dexie.maxKey],
      )
      .toArray() as Promise<Message[]>;
  }

  async save(message: Message): Promise<Result<void, LoreError>> {
    try {
      await this.db.messages.put(message);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }

  async saveMany(messages: readonly Message[]): Promise<Result<void, LoreError>> {
    try {
      await this.db.messages.bulkPut(messages as Message[]);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }
}
