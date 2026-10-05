import { describe, expect, it } from "vitest";

import {
  decideOperatorContextSwitch,
  OPERATOR_CONTEXT_COOKIE,
  PLATFORM_CONTEXT_VALUE,
  resolveOperatorContext,
  sortOperableProperties,
} from "./operator-context";

const BETA = { id: "prop-beta", name: "Beta Site", role: "staff" as const };
const ALPHA = { id: "prop-alpha", name: "alpha site", role: "admin" as const };
const GAMMA = { id: "prop-gamma", name: "Gamma Site", role: "staff" as const };

describe("resolveOperatorContext", () => {
  it("keeps the cookie property when it is operable", () => {
    const result = resolveOperatorContext({
      cookieValue: BETA.id,
      isPlatformAdmin: false,
      operableProperties: [BETA, ALPHA],
    });
    expect(result).toStrictEqual({
      mode: "property",
      propertyId: BETA.id,
      propertyName: BETA.name,
      role: BETA.role,
    });
  });

  it("falls back to the first operable property alphabetically on a tampered cookie", () => {
    const result = resolveOperatorContext({
      cookieValue: "prop-tampered-by-someone-else",
      isPlatformAdmin: false,
      operableProperties: [GAMMA, BETA, ALPHA],
    });
    expect(result).toStrictEqual({
      mode: "property",
      propertyId: ALPHA.id,
      propertyName: ALPHA.name,
      role: ALPHA.role,
    });
  });

  it("falls back to the first operable property when the cookie names a stale id", () => {
    const result = resolveOperatorContext({
      cookieValue: "prop-deleted",
      isPlatformAdmin: true,
      operableProperties: [BETA, ALPHA],
    });
    expect(result).toStrictEqual({
      mode: "property",
      propertyId: ALPHA.id,
      propertyName: ALPHA.name,
      role: ALPHA.role,
    });
  });

  it("keeps explicit platform mode for platform admins", () => {
    const result = resolveOperatorContext({
      cookieValue: PLATFORM_CONTEXT_VALUE,
      isPlatformAdmin: true,
      operableProperties: [ALPHA],
    });
    expect(result).toStrictEqual({ mode: "platform" });
  });

  it("does not honor platform mode for non-admins", () => {
    const result = resolveOperatorContext({
      cookieValue: PLATFORM_CONTEXT_VALUE,
      isPlatformAdmin: false,
      operableProperties: [BETA],
    });
    expect(result).toStrictEqual({
      mode: "property",
      propertyId: BETA.id,
      propertyName: BETA.name,
      role: BETA.role,
    });
  });

  it("selects the first operable property alphabetically with no cookie", () => {
    const result = resolveOperatorContext({
      cookieValue: null,
      isPlatformAdmin: false,
      operableProperties: [GAMMA, BETA, ALPHA],
    });
    expect(result).toStrictEqual({
      mode: "property",
      propertyId: ALPHA.id,
      propertyName: ALPHA.name,
      role: ALPHA.role,
    });
  });

  it("gives platform admins platform mode when nothing is operable", () => {
    const result = resolveOperatorContext({
      cookieValue: null,
      isPlatformAdmin: true,
      operableProperties: [],
    });
    expect(result).toStrictEqual({ mode: "platform" });
  });

  it("returns no-access without cookie actions when nothing is operable", () => {
    const result = resolveOperatorContext({
      cookieValue: BETA.id,
      isPlatformAdmin: false,
      operableProperties: [],
    });
    expect(result).toStrictEqual({ mode: "no-access" });
  });

  it("treats blank cookies as absent", () => {
    const result = resolveOperatorContext({
      cookieValue: "   ",
      isPlatformAdmin: false,
      operableProperties: [BETA],
    });
    expect(result).toStrictEqual({
      mode: "property",
      propertyId: BETA.id,
      propertyName: BETA.name,
      role: BETA.role,
    });
  });

  it("sorts operable properties without mutating the input", () => {
    const input = [GAMMA, BETA, ALPHA];
    expect(sortOperableProperties(input).map((p) => p.id)).toEqual([
      ALPHA.id,
      BETA.id,
      GAMMA.id,
    ]);
    expect(input.map((p) => p.id)).toEqual([GAMMA.id, BETA.id, ALPHA.id]);
  });

  it("names the op_ctx cookie", () => {
    expect(OPERATOR_CONTEXT_COOKIE).toBe("op_ctx");
  });
});

describe("decideOperatorContextSwitch", () => {
  it("accepts a requested operable property and lands on /setup", () => {
    const decision = decideOperatorContextSwitch({
      requestedValue: BETA.id,
      isPlatformAdmin: false,
      operableProperties: [BETA, ALPHA],
    });
    expect(decision.ok).toBe(true);
    expect(decision.context).toStrictEqual({
      mode: "property",
      propertyId: BETA.id,
      propertyName: BETA.name,
      role: BETA.role,
    });
    expect(decision.path).toBe("/setup");
  });

  it("accepts platform for a platform admin and lands on /platform/properties", () => {
    const decision = decideOperatorContextSwitch({
      requestedValue: PLATFORM_CONTEXT_VALUE,
      isPlatformAdmin: true,
      operableProperties: [ALPHA],
    });
    expect(decision.ok).toBe(true);
    expect(decision.context).toStrictEqual({ mode: "platform" });
    expect(decision.path).toBe("/platform/properties");
  });

  it("rejects platform for a non-admin instead of falling back silently", () => {
    const decision = decideOperatorContextSwitch({
      requestedValue: PLATFORM_CONTEXT_VALUE,
      isPlatformAdmin: false,
      operableProperties: [BETA],
    });
    expect(decision.ok).toBe(false);
    expect(decision.path).toBeNull();
  });

  it("rejects a property the operator cannot operate instead of swapping to the fallback", () => {
    const decision = decideOperatorContextSwitch({
      requestedValue: "prop-other",
      isPlatformAdmin: false,
      operableProperties: [BETA, ALPHA],
    });
    expect(decision.ok).toBe(false);
    expect(decision.path).toBeNull();
    expect(decision.context).toStrictEqual({
      mode: "property",
      propertyId: ALPHA.id,
      propertyName: ALPHA.name,
      role: ALPHA.role,
    });
  });
});
