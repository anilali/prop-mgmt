import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";

import { isConcurrentUpdate, isUniqueViolation } from "./pg-errors";

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

describe("isConcurrentUpdate", () => {
  it("finds a serialization failure or deadlock on the error or its cause", () => {
    expect(isConcurrentUpdate(pgError("40001"))).toBe(true);
    expect(
      isConcurrentUpdate(new DrizzleQueryError("select", [], pgError("40P01"))),
    ).toBe(true);
  });

  it("is false for other errors", () => {
    expect(isConcurrentUpdate(pgError("23505"))).toBe(false);
    expect(isConcurrentUpdate(new Error("x"))).toBe(false);
  });
});
