/**
 * Branded ULID types for each entity in the Lore v2 data model.
 *
 * Using Zod's `.brand<T>()` mechanism to make ID types structurally
 * distinct at compile time. Without branding, `SessionId` and `MessageId`
 * are both `string` and TypeScript silently accepts them interchangeably.
 *
 * @example
 * ```ts
 * function getSession(id: SessionId): Promise<Session> { ... }
 * const msgId = '01ABCDEFGHJKMNPQRSTVWXYZ01' as MessageId;
 * getSession(msgId); // ✗ Compile error: MessageId is not assignable to SessionId
 * ```
 *
 * @see ADR-0002 — Branded ULID Types
 * @since 0.2.0
 */

import { z } from 'zod';

/** Base Crockford Base32 ULID validator (26 chars, uppercase-restricted alphabet). */
const BaseULID = z.string().length(26).regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

/** Branded ID for {@link Session} entities. */
export const SessionId = BaseULID.brand<'SessionId'>();
/** Branded ID for {@link Message} entities. */
export const MessageId = BaseULID.brand<'MessageId'>();
/** Branded ID for {@link Checkpoint} entities. */
export const CheckpointId = BaseULID.brand<'CheckpointId'>();
/** Branded ID for {@link Decision} entities. */
export const DecisionId = BaseULID.brand<'DecisionId'>();
/** Branded ID for {@link Todo} entities. */
export const TodoId = BaseULID.brand<'TodoId'>();
/** Branded ID for {@link Blocker} entities. */
export const BlockerId = BaseULID.brand<'BlockerId'>();
/** Branded ID for {@link Learning} entities. */
export const LearningId = BaseULID.brand<'LearningId'>();
/** Branded ID for {@link Project} entities. */
export const ProjectId = BaseULID.brand<'ProjectId'>();

export type SessionId = z.infer<typeof SessionId>;
export type MessageId = z.infer<typeof MessageId>;
export type CheckpointId = z.infer<typeof CheckpointId>;
export type DecisionId = z.infer<typeof DecisionId>;
export type TodoId = z.infer<typeof TodoId>;
export type BlockerId = z.infer<typeof BlockerId>;
export type LearningId = z.infer<typeof LearningId>;
export type ProjectId = z.infer<typeof ProjectId>;
