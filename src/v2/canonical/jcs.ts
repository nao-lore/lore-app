/**
 * RFC 8785 JSON Canonicalization Scheme (JCS) — pure serializer.
 *
 * Produces a deterministic, byte-for-byte reproducible JSON encoding that
 * can be safely hashed. Rules per RFC 8785:
 *
 * 1. **Key ordering**: Object keys sorted by UTF-16 code unit value (standard JS `<` comparison).
 * 2. **NFC normalization**: All strings (keys and values) are NFC-normalized before serialization.
 * 3. **Numbers**: Only finite integers are allowed. Floating-point values are rejected because
 *    Lore v2 stores all monetary amounts as `UsdMicros` (integer microdollars) and all timestamps
 *    as `EpochMs` (integer milliseconds). A float in canonical JSON indicates a data model violation.
 * 4. **No undefined/function/symbol**: These cannot appear in JSON; the function throws if encountered.
 *
 * ## Design constraints
 * - Pure function, no I/O, no imports beyond types.
 * - Safe to run on the main thread or in a Worker (see §8.2 of engineering standards).
 * - Does NOT use `JSON.stringify(value, replacer)` because replacers cannot guarantee key order
 *   across all JS engines; we implement ordering explicitly.
 *
 * @see https://www.rfc-editor.org/rfc/rfc8785
 * @see ADR-0003 — RFC 8785 Canonical JSON
 * @since 0.2.0
 */

/** Internal type alias for values representable in canonical JSON. */
type JsonPrimitive = string | number | boolean | null;
interface JsonArray extends ReadonlyArray<JsonValue> {}
interface JsonObject extends Readonly<Record<string, JsonValue>> {}
type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/**
 * Serializes `value` to RFC 8785 canonical JSON.
 *
 * Deterministic across runs, platforms, and property insertion orders.
 * Object keys are sorted by UTF-16 code unit order and all strings are
 * NFC-normalized before output.
 *
 * @param value - The value to serialize. Must be JSON-representable.
 *   `undefined`, functions, and symbols are not allowed.
 * @returns Canonical JSON string with no trailing newline.
 * @throws {Error} If `value` contains a non-finite number (NaN, Infinity, -Infinity).
 * @throws {Error} If `value` contains a floating-point number (Lore v2 data model violation).
 * @throws {Error} If `value` contains an unsupported type (undefined, function, symbol).
 *
 * @example
 * ```ts
 * canonicalJSONStringify({ z: 1, a: 2 }); // '{"a":2,"z":1}'
 * canonicalJSONStringify([3, 1, 2]);       // '[3,1,2]'  (arrays not sorted)
 * canonicalJSONStringify('café');          // '"caf\u00e9"' (NFC-normalized)
 * canonicalJSONStringify(Infinity);        // throws
 * ```
 *
 * @since 0.2.0
 */
export function canonicalJSONStringify(value: unknown): string {
  return serialize(value as JsonValue, '$');
}

function serialize(value: JsonValue, path: string): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';

    case 'number': {
      if (!Number.isFinite(value)) {
        throw new Error(`canonicalJSONStringify: non-finite number at ${path} — ${value}`);
      }
      if (!Number.isInteger(value)) {
        throw new Error(
          `canonicalJSONStringify: floating-point number ${value} at ${path} is not allowed. ` +
          'All Lore v2 numeric fields must be integers (UsdMicros, EpochMs, token counts).'
        );
      }
      return JSON.stringify(value);
    }

    case 'string':
      // RFC 8785 §3.2.3: NFC normalize all string values
      return JSON.stringify(value.normalize('NFC'));

    case 'object': {
      if (Array.isArray(value)) {
        // Arrays: preserve element order, recurse into each element
        const items = value.map((item, i) => serialize(item as JsonValue, `${path}[${i}]`));
        return '[' + items.join(',') + ']';
      }

      // Plain object: sort keys by UTF-16 code unit order (RFC 8785 §3.2.3)
      const obj = value as Record<string, JsonValue>;
      const keys = Object.keys(obj).sort();
      const pairs = keys.map(k => {
        // NFC-normalize the key as well
        const normalizedKey = JSON.stringify(k.normalize('NFC'));
        return normalizedKey + ':' + serialize(obj[k] as JsonValue, `${path}.${k}`);
      });
      return '{' + pairs.join(',') + '}';
    }

    default:
      throw new Error(
        `canonicalJSONStringify: unsupported type '${typeof value}' at ${path}. ` +
        'Only JSON-representable values (null, boolean, integer, string, array, object) are allowed.'
      );
  }
}
