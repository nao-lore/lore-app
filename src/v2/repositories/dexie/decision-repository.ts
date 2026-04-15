/**
 * Dexie adapter for {@link DecisionRepository}.
 *
 * Enforces `PROVENANCE_INVALID` when `derived_from.message_ids` is empty.
 * @since 0.2.0
 */
import type { LoreV2DB } from '../../db';
import type { DecisionRepository } from '../interfaces';
import type { Decision } from '../../schemas/entities';
import type { DecisionId, ProjectId } from '../../schemas/ids';
import { ok, err, type Result } from '../../result';
import type { LoreError } from '../../errors';

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function validateProvenance(decision: Decision): Result<void, LoreError> {
  if (decision.derived_from.message_ids.length === 0) {
    return err({ code: 'PROVENANCE_INVALID', message_ids_count: 0 });
  }
  return ok(undefined);
}

export class DexieDecisionRepository implements DecisionRepository {
  constructor(private readonly db: LoreV2DB) {}

  async findById(id: DecisionId): Promise<Result<Decision, LoreError>> {
    try {
      const row = await this.db.decisions.get(id as string);
      if (!row) return err({ code: 'STORAGE_ERROR', cause: `Decision ${id} not found` });
      return ok(row as Decision);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }

  async listByProject(
    projectId: ProjectId,
    status?: Decision['status'],
  ): Promise<readonly Decision[]> {
    if (status !== undefined) {
      return this.db.decisions
        .where('[project_id+status]')
        .equals([projectId as string, status])
        .toArray() as Promise<Decision[]>;
    }
    return this.db.decisions
      .where('project_id')
      .equals(projectId as string)
      .toArray() as Promise<Decision[]>;
  }

  async save(decision: Decision): Promise<Result<void, LoreError>> {
    const check = validateProvenance(decision);
    if (!check.ok) return check;
    try {
      await this.db.decisions.put(decision);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }

  async saveMany(decisions: readonly Decision[]): Promise<Result<void, LoreError>> {
    for (const d of decisions) {
      const check = validateProvenance(d);
      if (!check.ok) return check;
    }
    try {
      await this.db.decisions.bulkPut(decisions as Decision[]);
      return ok(undefined);
    } catch (e) {
      return err({ code: 'STORAGE_ERROR', cause: toMessage(e) });
    }
  }
}
