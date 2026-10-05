import { describe, expect, it } from "vitest";

import { formatFileSize } from "./file-size";

describe("formatFileSize", () => {
  it.each([
    [512, "512 B"],
    [850_400, "850 KB"],
    [3_400_000, "3.4 MB"],
    [7_812_345, "7.8 MB"],
    [25_000_000, "25 MB"],
  ])("formats %d bytes as %s", (bytes, text) => {
    expect(formatFileSize(bytes)).toBe(text);
  });
});
