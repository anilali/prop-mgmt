/**
 * Structural deep-equal scoped to plain JSON-shaped values
 * (numbers, strings, booleans, null, arrays, objects).
 *
 * Postgres `jsonb` does not preserve key insertion order on round-trip — it
 * canonicalises objects — so a naive `JSON.stringify` comparison can falsely
 * report two equal payloads as different just because the in-memory object
 * happens to enumerate keys in a different order than the DB-roundtripped
 * one. We sort object keys before stringifying to make the comparison stable.
 *
 * `undefined` values inside objects are dropped before comparison so that
 * `{ a: 1, b: undefined }` equals `{ a: 1 }`.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  return canonicalize(a) === canonicalize(b);
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`)
    .join(",")}}`;
}
