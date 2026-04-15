/**
 * Content block types for the Anthropic message format.
 *
 * A {@link Message}'s `content_blocks` is an array of `ContentBlock` variants,
 * each discriminated by the `type` field. This mirrors the Anthropic Messages API
 * response structure and supports multi-modal, tool-use, and extended-thinking content.
 *
 * ## Canonical hash exclusions
 * - `ThinkingBlock` entries are **fully excluded** from `computeMessageStateHash`
 *   because thinking text is non-reproducible across retries (spec Q1 resolution).
 * - `tool_use` block `id` fields are excluded because they are ephemeral
 *   provider-generated identifiers with no semantic content.
 *
 * @see ADR-0003 — RFC 8785 Canonical JSON
 * @since 0.2.0
 */

import { z } from 'zod';

/**
 * Plain text content block. The most common content type in human/assistant turns.
 *
 * @example
 * ```ts
 * const block: TextBlock = { type: 'text', text: 'Hello, world!' };
 * ```
 */
export const TextBlock = z.object({
  type: z.literal('text'),
  /** The text content of this block. */
  text: z.string(),
});

/**
 * Tool invocation block — represents a request by the assistant to call a tool.
 * The `id` field is an ephemeral provider-assigned identifier excluded from
 * canonical hashes.
 *
 * @example
 * ```ts
 * const block: ToolUseBlock = {
 *   type: 'tool_use',
 *   id: 'toolu_01XYZ',
 *   name: 'bash',
 *   input: { command: 'ls -la' },
 * };
 * ```
 */
export const ToolUseBlock = z.object({
  type: z.literal('tool_use'),
  /**
   * Provider-assigned ephemeral identifier. Excluded from canonical hash.
   * Per spec §1.2: Anthropic API always returns a non-empty unique id;
   * empty string is not a valid tool_use id.
   */
  id: z.string().min(1),
  /** Name of the tool being invoked. */
  name: z.string(),
  /** Tool-specific input payload. Schema is tool-defined. */
  input: z.unknown(),
});

/**
 * Tool result block — contains the output of a tool invocation.
 *
 * @example
 * ```ts
 * const block: ToolResultBlock = {
 *   type: 'tool_result',
 *   tool_use_id: 'toolu_01XYZ',
 *   content: 'file1.ts\nfile2.ts',
 *   is_error: false,
 * };
 * ```
 */
export const ToolResultBlock = z.object({
  type: z.literal('tool_result'),
  /** The `id` of the corresponding {@link ToolUseBlock}. */
  tool_use_id: z.string(),
  /** Result payload. Format is tool-defined. */
  content: z.unknown(),
  /**
   * Whether the tool call resulted in an error.
   * Defaults to `false` when not specified.
   */
  is_error: z.boolean().default(false),
});

/**
 * Extended thinking block — internal reasoning emitted by the model before
 * producing its final response. **Fully excluded from canonical hashes**
 * because thinking text is non-reproducible across retries.
 *
 * @example
 * ```ts
 * const block: ThinkingBlock = {
 *   type: 'thinking',
 *   text: 'Let me work through this step by step...',
 *   signature: 'ErUADWpThink...',
 * };
 * ```
 */
export const ThinkingBlock = z.object({
  type: z.literal('thinking'),
  /** Raw thinking text. Non-reproducible; excluded from state hashes. */
  text: z.string(),
  /**
   * Cryptographic signature from the provider verifying thinking authenticity.
   * Optional — not all providers include it.
   */
  signature: z.string().optional(),
});

/**
 * Discriminated union of all supported content block types.
 * Discriminate via the `type` field.
 *
 * @example
 * ```ts
 * function renderBlock(block: ContentBlock): string {
 *   switch (block.type) {
 *     case 'text':        return block.text;
 *     case 'tool_use':    return `[tool: ${block.name}]`;
 *     case 'tool_result': return `[result]`;
 *     case 'thinking':    return '[thinking]';
 *     default:            return assertNever(block);
 *   }
 * }
 * ```
 */
export const ContentBlock = z.discriminatedUnion('type', [
  TextBlock, ToolUseBlock, ToolResultBlock, ThinkingBlock,
]);

export type TextBlock = z.infer<typeof TextBlock>;
export type ToolUseBlock = z.infer<typeof ToolUseBlock>;
export type ToolResultBlock = z.infer<typeof ToolResultBlock>;
export type ThinkingBlock = z.infer<typeof ThinkingBlock>;
export type ContentBlock = z.infer<typeof ContentBlock>;
