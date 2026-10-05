import { describe, expect, it } from "vitest";

import {
  codeOf,
  createTestApp,
  PLATFORM_ADMIN,
  PROPERTY_ADMIN,
  STRANGER,
} from "../test-setup-stores";

describe("pdfSpike.render", () => {
  it("returns a base64 PDF and a file name", async () => {
    const app = createTestApp();
    const caller = await app.callerFor(PROPERTY_ADMIN);

    const result = await caller.pdfSpike.render();

    expect(Buffer.from(result.base64, "base64").subarray(0, 5).toString()).toBe(
      "%PDF-",
    );
    expect(result.fileName).toMatch(/^test-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it("rejects platform mode", async () => {
    const app = createTestApp();
    const caller = await app.callerFor(PLATFORM_ADMIN, "platform");

    expect(await codeOf(caller.pdfSpike.render())).toBe("FORBIDDEN");
  });

  it("rejects a non-member", async () => {
    const app = createTestApp();
    const caller = await app.callerFor(STRANGER);

    expect(await codeOf(caller.pdfSpike.render())).toBe("FORBIDDEN");
  });
});
