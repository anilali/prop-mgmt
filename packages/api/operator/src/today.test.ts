import { afterEach, describe, expect, it, vi } from "vitest";

import { today } from "./today";

const PROPERTY = { timeZone: "America/Chicago" };
const NOW = new Date("2026-01-01T05:30:00Z");

describe("today", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the date in the property's time zone", () => {
    vi.stubEnv("TODAY_OVERRIDE", "");
    expect(today(PROPERTY, NOW)).toBe("2025-12-31");
    expect(today({ timeZone: "UTC" }, NOW)).toBe("2026-01-01");
  });

  it("uses TODAY_OVERRIDE outside production", () => {
    vi.stubEnv("TODAY_OVERRIDE", "2027-01-05");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(today(PROPERTY, NOW)).toBe("2027-01-05");
  });

  it("uses TODAY_OVERRIDE when VERCEL_ENV is not set", () => {
    vi.stubEnv("TODAY_OVERRIDE", "2027-01-05");
    vi.stubEnv("VERCEL_ENV", "");
    expect(today(PROPERTY, NOW)).toBe("2027-01-05");
  });

  it("ignores TODAY_OVERRIDE in production", () => {
    vi.stubEnv("TODAY_OVERRIDE", "2027-01-05");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(today(PROPERTY, NOW)).toBe("2025-12-31");
  });

  it("rejects an override that is not a date", () => {
    vi.stubEnv("TODAY_OVERRIDE", "2027-02-30");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(() => today(PROPERTY, NOW)).toThrow(
      "TODAY_OVERRIDE must be a YYYY-MM-DD date",
    );
  });
});
