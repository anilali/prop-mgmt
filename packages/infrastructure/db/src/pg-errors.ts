const UNIQUE_VIOLATION = "23505";
const SERIALIZATION_FAILURE = "40001";
const DEADLOCK_DETECTED = "40P01";

function hasCode(error: unknown, codes: readonly string[]): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if (
      "code" in current &&
      typeof current.code === "string" &&
      codes.includes(current.code)
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

export function isUniqueViolation(error: unknown): boolean {
  return hasCode(error, [UNIQUE_VIOLATION]);
}

export function isConcurrentUpdate(error: unknown): boolean {
  return hasCode(error, [SERIALIZATION_FAILURE, DEADLOCK_DETECTED]);
}
