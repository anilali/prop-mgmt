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

function runsOf(pdf: Buffer): string[] {
  const runs: string[] = [];
  for (const stream of streams(pdf)) {
    const content = stream.toString("latin1");
    for (const match of content.matchAll(/\[(.*?)\]\s*TJ/gs)) {
      const parts = [...(match[1] ?? "").matchAll(/<([0-9a-fA-F]*)>/g)];
      runs.push(parts.map((part) => decodeHex(part[1] ?? "")).join(""));
    }
  }
  return runs;
}

function textOf(pdf: Buffer): string {
  return runsOf(pdf).join("").replace(/\s+/g, " ");
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
      "2024 Expense Reconciliation",
      "BUILDING NET RENTABLE AREA:",
      "9,350",
      "2024 ACTUAL OPERATING EXPENSE",
      "CAM:",
      "$ 12,891.19",
      "$1.38 psf/year",
      "$0.1149 psf/month",
      "2024 EXPENSE RECONCILIATION",
      "SQ.FT LEASED",
      "TENANT'S PRO-RATA SHARE",
      "ESTIMATES BILLED IN 2024",
      "BALANCE DUE",
      "1200 Main St, Suite A",
      "TAXES",
      "26.74%",
      "3,446.84",
      "-$362.79",
      "$237.74",
      "REVISED MONTHLY RENT",
      "(Effective January 1, 2025)",
      "Tax",
      "Total Monthly Rent",
      "Unpaid Balance",
      "$413.74",
      "Balance on Account",
    ]) {
      expect(text).toContain(value);
    }
    expect(text).not.toContain("MONTHS");
    expect(text).not.toContain("Rent Balance");
  });

  it("keeps the owner phone on one line", async () => {
    const data = dataFor(superLucky.accountId);
    const { pdf } = await render({
      ...data,
      owner: { ...data.owner, phone: "+1 (555) 010 2000" },
    });
    expect(
      runsOf(pdf).some((run) =>
        run.includes("+1\u00a0(555)\u00a0010\u00a02000"),
      ),
    ).toBe(true);
  });

  it("renders 6.2 without the new rent, insurance request, or revised rent block", async () => {
    const { pdf, text } = await render(dataFor(tenantD.accountId));

    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
    for (const value of [
      "$218.53",
      "MONTHS",
      "1,148.95",
      "-$10.49",
      "Unpaid Balance",
      "Balance on Account",
    ]) {
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
      "Per your lease, your base rent will increase from $3,150.00 to $3,244.50 effective June 1, 2025, making your total monthly rent $4,256.20.",
      "$4,161.70",
      "WATER SERVICE AREA:",
      "4,350",
      "WATER",
      "-$1,006.01",
      "-$1,084.54",
      "($834.54)",
    ]) {
      expect(text).toContain(value);
    }
    expect(text).not.toContain("We don't have a copy of your insurance");
  });
});
