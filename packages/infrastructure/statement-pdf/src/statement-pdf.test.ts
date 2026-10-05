import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import type { StatementData } from "@moonship/billing";
import { reconciliationWorkspace } from "@moonship/billing";
import {
  reconciliationInput,
  superLucky,
  tenantB,
  tenantD,
} from "@moonship/billing/fixtures/2024";

import { ReactPdfStatementRenderer } from "./statement-pdf";

function dataFor(accountId: string): StatementData {
  const statement = reconciliationWorkspace(
    reconciliationInput(),
  ).statements.find((s) => s.accountId === accountId);
  if (!statement?.data) throw new Error(`No statement data for ${accountId}`);
  return statement.data;
}

function streams(pdf: Buffer): Buffer[] {
  const found: Buffer[] = [];
  let at = 0;
  for (;;) {
    const start = pdf.indexOf("stream", at, "latin1");
    if (start === -1) break;
    const bodyStart = pdf[start + 6] === 0x0d ? start + 8 : start + 7;
    const end = pdf.indexOf("endstream", bodyStart, "latin1");
    if (end === -1) break;
    try {
      found.push(inflateSync(pdf.subarray(bodyStart, end)));
    } catch {
      found.push(pdf.subarray(bodyStart, end));
    }
    at = end + 9;
  }
  return found;
}

function decodeHex(hex: string): string {
  let text = "";
  for (let i = 0; i + 1 < hex.length; i += 2) {
    text += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return text;
}

function textOf(pdf: Buffer): string {
  const runs: string[] = [];
  for (const stream of streams(pdf)) {
    const content = stream.toString("latin1");
    for (const match of content.matchAll(/\[(.*?)\]\s*TJ/gs)) {
      const parts = [...(match[1] ?? "").matchAll(/<([0-9a-fA-F]*)>/g)];
      runs.push(parts.map((part) => decodeHex(part[1] ?? "")).join(""));
    }
  }
  return runs.join("").replace(/\s+/g, " ");
}

const renderer = new ReactPdfStatementRenderer();

async function render(data: StatementData) {
  const bytes = await renderer.render(data);
  const pdf = Buffer.from(bytes);
  return { bytes, pdf, text: textOf(pdf) };
}

describe("ReactPdfStatementRenderer", () => {
  it("renders 6.1 as a two-page PDF with the letter and statement amounts", async () => {
    const { bytes, pdf, text } = await render(dataFor(superLucky.accountId));

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
    for (const value of [
      "January 1, 2025",
      "Super Lucky LLC",
      "$237.74",
      "$3,674.64",
      "$651.48",
      "CAM, tax, and insurance",
      "We don't have a copy of your insurance",
      "2024 EXPENSE RECONCILIATION",
      "BUILDING AREA: 9,350 Sq. Ft",
      "$1.38 psf/year",
      "$0.1149 psf/month",
      "26.74%",
      "$3,446.84",
      "-$362.79",
      "REVISED MONTHLY RENT (Effective January 1, 2025)",
      "$413.74",
    ]) {
      expect(text).toContain(value);
    }
    expect(text).not.toContain("MONTHS");
  });

  it("renders 6.2 without the new rent, insurance request, or revised rent block", async () => {
    const { pdf, text } = await render(dataFor(tenantD.accountId));

    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
    for (const value of ["$218.53", "MONTHS", "$1,148.95", "-$10.49"]) {
      expect(text).toContain(value);
    }
    expect(text).not.toContain("REVISED MONTHLY RENT");
    expect(text).not.toContain("insurance on file");
    expect(text).not.toContain("monthly rent will be changed");
  });

  it("renders 6.3 with the credit wording and accounting balance", async () => {
    const { text } = await render(dataFor(tenantB.accountId));

    for (const value of [
      "results in a credit of",
      "$1,084.54",
      "which has been applied to your account.",
      "is a credit of",
      "$834.54",
      "CAM, tax, insurance, and water",
      "$4,161.70",
      "WATER SERVICE AREA: 4,350 Sq. Ft",
      "-$1,006.01",
      "-$1,084.54",
      "($834.54)",
    ]) {
      expect(text).toContain(value);
    }
    expect(text).not.toContain("We don't have a copy of your insurance");
  });
});
