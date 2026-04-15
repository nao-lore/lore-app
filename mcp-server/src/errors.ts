/**
 * Typed error union for the Lore MCP Server.
 *
 * Use the `code` discriminator in switch statements with {@link assertNever}
 * to ensure exhaustive handling as new error types are added.
 *
 * @example
 * ```ts
 * function formatError(e: LoreMcpError): string {
 *   switch (e.code) {
 *     case 'INVALID_INPUT':       return `Bad input: ${e.message}`;
 *     case 'DATA_SOURCE_MISSING': return `No data at ${e.dir}`;
 *     case 'PARSE_ERROR':         return `Parse failed: ${e.message}`;
 *     case 'PATH_TRAVERSAL':      return `Blocked traversal: ${e.path}`;
 *     case 'INTERNAL_ERROR':      return `Internal: ${e.message}`;
 *     default: return assertNever(e);
 *   }
 * }
 * ```
 */
export type LoreMcpError =
  /** Zod validation failure on tool input. */
  | { readonly code: 'INVALID_INPUT'; readonly message: string }
  /** The ~/.lore/projects directory does not exist or is unreadable. */
  | { readonly code: 'DATA_SOURCE_MISSING'; readonly dir: string }
  /** A .md file could not be parsed (malformed YAML frontmatter). */
  | { readonly code: 'PARSE_ERROR'; readonly file: string; readonly message: string }
  /** A resolved file path escaped the allowed data directory. */
  | { readonly code: 'PATH_TRAVERSAL'; readonly path: string }
  /** Catch-all for unexpected I/O or runtime errors. */
  | { readonly code: 'INTERNAL_ERROR'; readonly message: string };

/**
 * Asserts that a code path is unreachable.
 *
 * Use as the `default` branch of a `switch` over a discriminated union so that
 * adding a new union member causes a compile-time error at every unhandled site.
 *
 * @example
 * ```ts
 * switch (error.code) {
 *   case 'INVALID_INPUT': ...
 *   // Forgetting a case here → TypeScript error: Argument of type '...' is not assignable
 *   default: return assertNever(error);
 * }
 * ```
 */
export function assertNever(x: never): never {
  throw new Error(`Unreachable: ${JSON.stringify(x)}`);
}

/**
 * Formats a {@link LoreMcpError} into a human-readable string safe to expose
 * in MCP tool responses (no raw filesystem paths, no PII).
 *
 * @example
 * ```ts
 * const msg = formatMcpError({ code: 'DATA_SOURCE_MISSING', dir: '/home/user/.lore/projects' });
 * // "Run Lore PWA first to export data to ~/.lore/projects/"
 * ```
 */
export function formatMcpError(error: LoreMcpError): string {
  switch (error.code) {
    case 'INVALID_INPUT':
      return `Invalid input: ${error.message}`;
    case 'DATA_SOURCE_MISSING':
      return 'Run Lore PWA first to export data to ~/.lore/projects/';
    case 'PARSE_ERROR':
      return `Failed to parse entry: ${error.message}`;
    case 'PATH_TRAVERSAL':
      return 'Access denied: path outside data directory';
    case 'INTERNAL_ERROR':
      return `Internal error: ${error.message}`;
    default:
      return assertNever(error);
  }
}
