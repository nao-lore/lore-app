/**
 * Exhaustiveness helper for discriminated union switches.
 *
 * TypeScript's control flow analysis narrows a union to `never` in a
 * fully-exhaustive `switch` default branch. Calling `assertNever(x)` there
 * turns an unhandled case into a compile-time error: if a new variant is
 * added to the union, the `default` branch will no longer narrow to `never`
 * and the call site will fail to type-check.
 *
 * This is a zero-dependency compile-time + runtime safety net. At runtime
 * it throws a descriptive error so bugs surface immediately rather than
 * silently producing `undefined`.
 *
 * @example
 * ```ts
 * type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ThinkingBlock;
 *
 * function renderBlock(block: ContentBlock): string {
 *   switch (block.type) {
 *     case 'text':        return block.text;
 *     case 'tool_use':    return `[tool: ${block.name}]`;
 *     case 'tool_result': return '[result]';
 *     case 'thinking':    return '[thinking]';
 *     default:            return assertNever(block);
 *     //                  ^ compile error if a new type is added to ContentBlock
 *   }
 * }
 * ```
 *
 * @param x - The value that should be `never` in the default branch.
 *   If TypeScript reports a type error here, a union case is not handled.
 * @returns Never returns — always throws.
 * @throws {Error} Always, with a descriptive message including the unhandled value.
 * @since 0.2.0
 */
export function assertNever(x: never): never {
  throw new Error(`assertNever: unhandled discriminant — ${JSON.stringify(x)}`);
}
