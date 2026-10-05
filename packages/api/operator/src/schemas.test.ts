import { describe, expect, it } from "vitest";

import { centsSchema } from "./schemas";

describe("centsSchema", () => {
  it("accepts amounts that fit a database integer and rejects larger ones", () => {
    expect(centsSchema.safeParse(2_147_483_647).success).toBe(true);
    expect(centsSchema.safeParse(-2_147_483_647).success).toBe(true);
    expect(centsSchema.safeParse(2_147_483_648).success).toBe(false);
    expect(centsSchema.safeParse(-2_147_483_648).success).toBe(false);
    expect(centsSchema.safeParse(1.5).success).toBe(false);
  });
});
