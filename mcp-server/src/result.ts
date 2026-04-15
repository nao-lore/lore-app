/**
 * Lightweight Result<T, E> monad for explicit error handling in domain operations.
 *
 * Keeps error paths visible in the type system without exceptions leaking
 * across layer boundaries.
 *
 * @example
 * ```ts
 * async function readFile(path: string): Promise<Result<string, LoreMcpError>> {
 *   try {
 *     return ok(await fs.promises.readFile(path, 'utf-8'));
 *   } catch (cause) {
 *     return err({ code: 'DATA_SOURCE_MISSING', dir: path });
 *   }
 * }
 *
 * const result = await readFile('/nonexistent');
 * if (!result.ok) {
 *   console.error(result.error.code); // 'DATA_SOURCE_MISSING'
 * }
 * ```
 */
export type Result<T, E> = OkResult<T> | ErrResult<E>;

/** Successful result carrying a value. */
export interface OkResult<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failed result carrying a typed error. */
export interface ErrResult<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Constructs a successful Result.
 *
 * @example
 * ```ts
 * return ok({ entries: [], loaded_at: Date.now() });
 * ```
 */
export const ok = <T>(value: T): OkResult<T> => ({ ok: true, value });

/**
 * Constructs a failed Result.
 *
 * @example
 * ```ts
 * return err({ code: 'INVALID_INPUT', message: 'query too long' });
 * ```
 */
export const err = <E>(error: E): ErrResult<E> => ({ ok: false, error });
