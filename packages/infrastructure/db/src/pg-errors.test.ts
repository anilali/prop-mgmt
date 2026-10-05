import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "./pg-errors";

function pgError(code: string): Error {
  return Object.assign(new Error("duplicate key value"), { code });
}

describe("isUniqueViolation", () => {
  it("finds the Postgres code on the error or its cause", () => {
    expect(isUniqueViolation(pgError("23505"))).toBe(true);
    expect(
      isUniqueViolation(new DrizzleQueryError("insert", [], pgError("23505"))),
    ).toBe(true);
  });

  it("is false for other errors", () => {
    expect(isUniqueViolation(pgError("23514"))).toBe(false);
    expect(
      isUniqueViolation(new DrizzleQueryError("insert", [], pgError("23503"))),
    ).toBe(false);
    expect(isUniqueViolation(new Error("x"))).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});
