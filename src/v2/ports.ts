/**
 * Ports (interfaces) for side-effecting capabilities that domain services
 * must not instantiate directly.
 *
 * Inject these at construction time to keep business logic testable without
 * mocking global state.
 *
 * @see §3.1 of the engineering standards — Clock / IdGenerator are always DI
 * @since 0.2.0
 *
 * @example
 * ```ts
 * import { systemClock, cryptoIdGenerator } from './ports';
 * const service = new MigrationExecutor(repo, systemClock, cryptoIdGenerator);
 * ```
 */

// ---- Clock ----

/**
 * Returns the current wall-clock time in epoch milliseconds.
 * Inject a fixed-time implementation in tests for determinism.
 *
 * @example
 * ```ts
 * const testClock: Clock = { now: () => 1_713_168_000_000 };
 * ```
 */
export interface Clock {
  now(): number;
}

/**
 * Production clock backed by `Date.now()`.
 */
export const systemClock: Clock = { now: () => Date.now() };

/**
 * Creates a deterministic test clock that always returns the given ms value.
 *
 * @example
 * ```ts
 * const clock = fixedClock(1_713_168_000_000);
 * expect(clock.now()).toBe(1_713_168_000_000);
 * ```
 */
export function fixedClock(ms: number): Clock {
  return { now: () => ms };
}

// ---- IdGenerator ----

/**
 * Generates a new unique string ID.
 *
 * In production, IDs should be 26-char Crockford Base32 ULIDs.
 * In tests, deterministic or sequential IDs may be used.
 *
 * @example
 * ```ts
 * const testIdGen: IdGenerator = {
 *   next: (() => { let n = 0; return () => String(++n).padStart(26, '0'); })(),
 * };
 * ```
 */
export interface IdGenerator {
  next(): string;
}

/**
 * Production ID generator using `crypto.randomUUID()` mapped to a 26-char
 * uppercase hex string. Suitable wherever ULID-length uniqueness is required.
 *
 * Note: True ULID (time-ordered) requires the `ulid` package. This implementation
 * satisfies uniqueness and length requirements for MVP; time-ordering can be added
 * in a follow-up.
 *
 * @example
 * ```ts
 * const id = cryptoIdGenerator.next(); // '550E8400E29B41D4A716446655440000'
 * ```
 */
export const cryptoIdGenerator: IdGenerator = {
  next(): string {
    return crypto.randomUUID().replace(/-/g, '').toUpperCase().slice(0, 26);
  },
};

/**
 * Creates a deterministic sequence IdGenerator for tests.
 * IDs are zero-padded to 26 chars.
 *
 * @example
 * ```ts
 * const gen = sequentialIdGenerator('MSG');
 * gen.next(); // 'MSG00000000000000000000001'
 * gen.next(); // 'MSG00000000000000000000002'
 * ```
 */
export function sequentialIdGenerator(prefix = ''): IdGenerator {
  let counter = 0;
  const padLen = 26 - prefix.length;
  return {
    next(): string {
      return `${prefix}${String(++counter).padStart(padLen, '0')}`.toUpperCase();
    },
  };
}
