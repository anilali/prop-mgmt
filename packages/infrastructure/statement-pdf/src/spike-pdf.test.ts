import { describe, expect, it } from "vitest";

import { renderSpikePdf } from "./spike-pdf";

describe("renderSpikePdf", () => {
  it("renders a one-page PDF", async () => {
    const pdf = await renderSpikePdf({
      propertyName: "Main Street Center",
      date: "2026-10-04",
    });

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const text = pdf.toString("latin1");
    expect(text.match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
  });
});
