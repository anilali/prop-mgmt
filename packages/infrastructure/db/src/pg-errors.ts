const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if ("code" in current && current.code === UNIQUE_VIOLATION) return true;
    current = current.cause;
  }
  return false;
}
