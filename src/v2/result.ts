/**
 * Lightweight `Result<T, E>` type for domain operations that can fail
 * in expected, typed ways.
 *
 * Throw-based error handling is reserved for I/O boundaries, programmer
 * errors, and truly unrecoverable conditions. Internal domain logic uses
 * `Result` so callers are forced to handle failure paths at the type level.
 *
 * @example
 * ```ts
 * async function findSession(id: SessionId): Promise<Result<Session, LoreError>> {
 *   const row = await db.sessions.get(id);
 *   if (!row) return err({ code: 'SESSION_NOT_FOUND', id });
 *   return ok(Session.parse(row));
 * }
 *
 * const result = await findSession(id);
 * if (!result.ok) {
 *   console.error(result.error.code);
 * } else {
 *   console.log(result.value.title);
 * }
 * ```
 *
 * @since 0.2.0
 */

/** A successful result carrying a value of type `T`. */
export type Ok<T> = { readonly ok: true; readonly value: T };
/** A failed result carrying an error of type `E`. */
export type Err<E> = { readonly ok: false; readonly error: E };

/**
 * Discriminated union representing either success (`Ok<T>`) or failure (`Err<E>`).
 * Discriminate via `result.ok`.
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Constructs a successful {@link Result}.
 *
 * @param value - The success value
 * @returns `{ ok: true, value }`
 * @example
 * ```ts
 * return ok(session);
 * ```
 */
export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

/**
 * Constructs a failed {@link Result}.
 *
 * @param error - The typed error value
 * @returns `{ ok: false, error }`
 * @example
 * ```ts
 * return err({ code: 'SESSION_NOT_FOUND', id });
 * ```
 */
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

/**
 * Maps the success value of a `Result`, leaving errors unchanged.
 *
 * @param result - Input result
 * @param fn - Transform applied to the success value
 * @returns Mapped result
 * @example
 * ```ts
 * const titleResult = mapOk(sessionResult, s => s.title);
 * ```
 */
export function mapOk<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/**
 * Unwraps the success value, or throws if the result is an error.
 * Use only at application boundaries where throwing is acceptable.
 *
 * @param result - The result to unwrap
 * @returns The success value
 * @throws {Error} If the result is an error
 */
export function unwrapOrThrow<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw new Error(`Result unwrap failed: ${JSON.stringify(result.error)}`);
}
