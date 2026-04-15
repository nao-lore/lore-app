/**
 * v1 → v2 migration executor.
 *
 * Handles all DB I/O for the migration. Calls the pure `convertLog` function
 * from `converter.ts` and writes results to the v2 repositories via the
 * repository interfaces (never directly to Dexie).
 *
 * Design invariants:
 * - **Idempotency**: A log already recorded in `migration_log` as successful
 *   is silently skipped. Re-running is safe.
 * - **Failure isolation**: Each log is processed independently. One failure
 *   does not abort the rest.
 * - **Batched writes**: Entities are grouped into batches of `BATCH_SIZE`
 *   and flushed together to reduce transaction overhead.
 * - **Rollback**: v1 DB (`lore`) is never touched. v2 DB (`lore_v2`) is a
 *   new database, so simply not using it rolls back to v1 at any point.
 *
 * @example
 * ```ts
 * const executor = new MigrationExecutor(db, systemClock, cryptoIdGenerator, consoleLogger);
 * const result = await executor.run(v1Logs);
 * console.log(`Migrated: ${result.migrated}, Failed: ${result.failed}`);
 * ```
 *
 * @since 0.2.0
 */

import type { LoreV2DB, MigrationLogRow } from '../../db';
import type { Clock, IdGenerator } from '../../ports';
import type { Logger } from '../../logger';
import type { Session, Message, Checkpoint, Decision, Todo, Blocker } from '../../schemas/entities';
import { convertLog, type V1LogEntry } from './converter';

// ---- Constants ----

/** Number of entities per bulkPut batch. */
const BATCH_SIZE = 1_000;

// ---- Result type ----

/**
 * Summary of a migration run.
 */
export interface MigrationResult {
  readonly migrated: number;
  readonly skipped: number;
  readonly failed: number;
  readonly errors: readonly string[];
}

// ---- Executor ----

/**
 * Orchestrates v1 → v2 migration using repository interfaces and port abstractions.
 *
 * @example
 * ```ts
 * const executor = new MigrationExecutor(db, systemClock, cryptoIdGenerator, logger);
 * const { migrated, failed } = await executor.run(v1Logs);
 * ```
 */
export class MigrationExecutor {
  private readonly db: LoreV2DB;
  private readonly clock: Clock;
  private readonly idGenerator: IdGenerator;
  private readonly logger: Logger;

  constructor(
    db: LoreV2DB,
    clock: Clock,
    idGenerator: IdGenerator,
    logger: Logger,
  ) {
    this.db = db;
    this.clock = clock;
    this.idGenerator = idGenerator;
    this.logger = logger;
  }

  /**
   * Run the migration for the given array of v1 log entries.
   *
   * @param v1Logs - Array of v1 `LogEntry` objects to migrate
   * @returns Summary of migrated / skipped / failed counts
   */
  async run(v1Logs: readonly V1LogEntry[]): Promise<MigrationResult> {
    let migrated = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    this.logger.info('migration.started', { total: v1Logs.length });

    // Build already-migrated set for idempotency.
    const existingLogs = await this.db.migration_log.toArray();
    const alreadyMigrated = new Set(
      existingLogs
        .filter((r) => r.success && r.id.startsWith('v1_migrated:'))
        .map((r) => r.id.replace('v1_migrated:', '')),
    );

    // Archive v1 raw data (upsert — idempotent).
    await this.db.meta.put({ key: 'v1_archive', value: v1Logs });

    // Accumulate entity batches using concrete types so bulkPut is type-safe.
    const sessionsBatch: Session[] = [];
    const messagesBatch: Message[] = [];
    const checkpointsBatch: Checkpoint[] = [];
    const decisionsBatch: Decision[] = [];
    const todosBatch: Todo[] = [];
    const blockersBatch: Blocker[] = [];

    const flush = async (): Promise<void> => {
      if (
        sessionsBatch.length === 0 &&
        messagesBatch.length === 0 &&
        checkpointsBatch.length === 0
      ) {
        return;
      }
      await this.db.transaction(
        'rw',
        [
          this.db.sessions,
          this.db.messages,
          this.db.checkpoints,
          this.db.decisions,
          this.db.todos,
          this.db.blockers,
        ],
        async () => {
          if (sessionsBatch.length > 0)
            await this.db.sessions.bulkPut(sessionsBatch);
          if (messagesBatch.length > 0)
            await this.db.messages.bulkPut(messagesBatch);
          if (checkpointsBatch.length > 0)
            await this.db.checkpoints.bulkPut(checkpointsBatch);
          if (decisionsBatch.length > 0)
            await this.db.decisions.bulkPut(decisionsBatch);
          if (todosBatch.length > 0)
            await this.db.todos.bulkPut(todosBatch);
          if (blockersBatch.length > 0)
            await this.db.blockers.bulkPut(blockersBatch);
        },
      );
      sessionsBatch.length = 0;
      messagesBatch.length = 0;
      checkpointsBatch.length = 0;
      decisionsBatch.length = 0;
      todosBatch.length = 0;
      blockersBatch.length = 0;
    };

    for (let i = 0; i < v1Logs.length; i++) {
      const log = v1Logs[i];

      // Guard against null/undefined.
      if (log == null || typeof log !== 'object') {
        const errMsg = 'log entry is null or not an object';
        errors.push(errMsg);
        failed++;
        await this.db.migration_log.put({
          id: `v1_migrated:__null_${this.clock.now()}_${i}`,
          from_version: 1,
          to_version: 2,
          at: this.clock.now(),
          success: false,
          error: errMsg,
        });
        continue;
      }

      if (alreadyMigrated.has(log.id)) {
        skipped++;
        continue;
      }

      const logRow: MigrationLogRow = {
        id: `v1_migrated:${log.id}`,
        from_version: 1,
        to_version: 2,
        at: this.clock.now(),
        success: false,
      };

      try {
        const converted = convertLog(log, this.clock, this.idGenerator);
        if (!converted.ok) {
          throw new Error(`Conversion failed: ${converted.error.code}`);
        }
        const { session, message, checkpoint, decisions, todos, blockers: bls } =
          converted.value;

        sessionsBatch.push(session);
        messagesBatch.push(message);
        checkpointsBatch.push(checkpoint);
        decisionsBatch.push(...decisions);
        todosBatch.push(...todos);
        blockersBatch.push(...bls);

        // Flush every BATCH_SIZE sessions.
        if (sessionsBatch.length >= BATCH_SIZE) {
          await flush();
        }

        // Mark success in migration_log.
        await this.db.migration_log.put({ ...logRow, success: true });
        migrated++;

        this.logger.debug('migration.log_converted', {
          logId: log.id,
          decisions: decisions.length,
          todos: todos.length,
          blockers: bls.length,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`log ${log.id}: ${msg}`);
        failed++;
        await this.db.migration_log.put({ ...logRow, error: msg });
        this.logger.error('migration.log_failed', { logId: log.id, error: msg });
      }
    }

    // Final flush of any remaining entries.
    await flush();

    this.logger.info('migration.completed', { migrated, skipped, failed });
    return { migrated, skipped, failed, errors };
  }
}
