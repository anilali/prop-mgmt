import { describe, expect, it } from "vitest";

import type { Paragraph, StatementData } from "./statement-document";
import {
  reconciliationInput,
  superLucky,
  tenantB,
  tenantD,
} from "./fixtures/2024";
import { reconciliationWorkspace } from "./reconciliation";
import {
  formatAccounting,
  formatHundredthsOfCent,
  formatPercentBps,
  joinNames,
  letterDocument,
  longDate,
  statementDocument,
  statementFileName,
} from "./statement-document";

function dataFor(accountId: string): StatementData {
  const statement = reconciliationWorkspace(
    reconciliationInput(),
  ).statements.find((s) => s.accountId === accountId);
  if (!statement?.data) throw new Error(`No statement data for ${accountId}`);
  return statement.data;
}

function text(paragraph: Paragraph | undefined): string {
  return (paragraph ?? []).map((run) => run.text).join("");
}

function boldRuns(paragraphs: Paragraph[]): string[] {
  return paragraphs.flatMap((p) => p.filter((r) => r.bold).map((r) => r.text));
}

const lucky = dataFor(superLucky.accountId);
const renewal = dataFor(tenantB.accountId);
const movedOut = dataFor(tenantD.accountId);

describe("formatting", () => {
  it("writes dates out", () => {
    expect(longDate("2025-01-01")).toBe("January 1, 2025");
    expect(longDate("2026-11-16")).toBe("November 16, 2026");
  });

  it("joins letter names", () => {
    expect(joinNames(["CAM"])).toBe("CAM");
    expect(joinNames(["CAM", "tax"])).toBe("CAM and tax");
    expect(joinNames(["CAM", "tax", "insurance"])).toBe(
      "CAM, tax, and insurance",
    );
    expect(joinNames(["CAM", "tax", "insurance", "water"])).toBe(
      "CAM, tax, insurance, and water",
    );
  });

  it("formats percents, psf per month, and accounting amounts", () => {
    expect(formatPercentBps(2674)).toBe("26.74%");
    expect(formatPercentBps(1337)).toBe("13.37%");
    expect(formatHundredthsOfCent(1149)).toBe("$0.1149");
    expect(formatHundredthsOfCent(560)).toBe("$0.0560");
    expect(formatHundredthsOfCent(12_345)).toBe("$1.2345");
    expect(formatAccounting(-83_454)).toBe("($834.54)");
    expect(formatAccounting(65_148)).toBe("$651.48");
  });

  it("builds a file name per account", () => {
    expect(statementFileName(2024, "Super Lucky LLC", "A")).toBe(
      "2024 Reconciliation Super Lucky LLC A.pdf",
    );
    expect(statementFileName(2024, "A/B: Co", "2")).toBe(
      "2024 Reconciliation A-B- Co 2.pdf",
    );
  });
});

describe("letter for 6.1 (positive true-up, continuing, no insurance)", () => {
  const letter = letterDocument(lucky);

  it("has the date, recipient, and Re block", () => {
    expect(letter.date).toBe("January 1, 2025");
    expect(letter.recipient).toEqual([
      "Super Lucky LLC",
      "PO Box 88",
      "Springfield, IL 62701",
    ]);
    expect(letter.re).toEqual([
      "2024 Expense Reconciliation",
      "Super Lucky LLC",
      "1200 Main St, Suite A",
      "Springfield, IL 62701",
    ]);
  });

  it("has P1 to P5 in the owner's wording", () => {
    expect(letter.paragraphs.map(text)).toEqual([
      "In accordance with the lease for the above-referenced location, enclosed for your review and reimbursement is the 2024 expense reconciliation. Copies of tax and insurance receipts are also enclosed.",
      "Based upon the reconciliation, the balance of your pro rata share of the 2024 expenses for the center totals $237.74.",
      "The monthly charges for CAM, tax, and insurance for the year 2025 will change to reflect the 2024 actual expense. Effective January 1, 2025, the monthly rent will be changed to $3,674.64.",
      "We don't have a copy of your insurance on file for the year 2025. Could you please send us a copy at your earliest convenience. The copy can be emailed to owner@example.com.",
      "The current balance on your account is $651.48. If you have any questions, please call me at (555) 010-2000.",
    ]);
  });

  it("bolds the three amounts", () => {
    expect(boldRuns(letter.paragraphs)).toEqual([
      "$237.74",
      "$3,674.64",
      "$651.48",
    ]);
  });

  it("signs with the owner's details", () => {
    expect(letter.closing).toBe("Sincerely,");
    expect(letter.signature).toEqual([
      "Pat Owner",
      "Managing Member",
      "Lucky Plaza LLC",
    ]);
  });
});

describe("letter for 6.3 (credit true-up and credit balance)", () => {
  const letter = letterDocument(renewal);

  it("says the credit has been applied and names four pools", () => {
    expect(letter.paragraphs.map(text)).toEqual([
      expect.stringContaining("2024 expense reconciliation"),
      "Based upon the reconciliation, the balance of your pro rata share of the 2024 expenses for the center results in a credit of $1,084.54, which has been applied to your account.",
      "The monthly charges for CAM, tax, insurance, and water for the year 2025 will change to reflect the 2024 actual expense. Effective January 1, 2025, the monthly rent will be changed to $4,161.70.",
      "The current balance on your account is a credit of $834.54. If you have any questions, please call me at (555) 010-2000.",
    ]);
    expect(boldRuns(letter.paragraphs)).toEqual([
      "$1,084.54",
      "$4,161.70",
      "$834.54",
    ]);
  });

  it("puts the mailing suite on its own line", () => {
    expect(letter.recipient).toEqual([
      "Tenant B Inc",
      "45 Oak Ave",
      "Floor 2",
      "Springfield, IL 62701",
    ]);
  });
});

describe("letter for 6.2 (moved out)", () => {
  it("leaves out P3 and P4", () => {
    const letter = letterDocument(movedOut);
    expect(letter.paragraphs).toHaveLength(3);
    expect(text(letter.paragraphs[1])).toContain("totals $218.53.");
    expect(text(letter.paragraphs[2])).toBe(
      "The current balance on your account is $218.53. If you have any questions, please call me at (555) 010-2000.",
    );
  });
});

describe("letter with zero amounts", () => {
  it("says totals $0.00 and is $0.00", () => {
    const letter = letterDocument({
      ...movedOut,
      trueUpCents: 0,
      balanceOnAccountCents: 0,
    });
    expect(text(letter.paragraphs[1])).toContain("totals $0.00.");
    expect(text(letter.paragraphs[2])).toContain("account is $0.00.");
  });

  it("uses the credit wording only below zero", () => {
    const letter = letterDocument({
      ...movedOut,
      trueUpCents: -1,
      balanceOnAccountCents: 5,
    });
    expect(text(letter.paragraphs[1])).toContain(
      "results in a credit of $0.01",
    );
    expect(text(letter.paragraphs[2])).toContain("account is $0.05.");
  });
});

describe("statement for 6.1", () => {
  const doc = statementDocument(lucky);

  it("has the heading and areas", () => {
    expect(doc.heading).toEqual([
      "Lucky Plaza",
      "2024 EXPENSE RECONCILIATION",
      "Super Lucky LLC",
      "1200 Main St, Suite A",
      "Springfield, IL 62701",
    ]);
    expect(doc.areas).toEqual([
      "BUILDING AREA: 9,350 Sq. Ft",
      "SQ.FT LEASED: 2,500",
    ]);
  });

  it("has a cost line per pool", () => {
    expect(doc.costLines).toEqual([
      {
        name: "CAM",
        actual: "$12,891.19",
        perYear: "$1.38 psf/year",
        perMonth: "$0.1149 psf/month",
        billNote: null,
      },
      {
        name: "Taxes",
        actual: "$33,542.31",
        perYear: "$3.59 psf/year",
        perMonth: "$0.2990 psf/month",
        billNote: null,
      },
      {
        name: "Insurance",
        actual: "$6,284.00",
        perYear: "$0.67 psf/year",
        perMonth: "$0.0560 psf/month",
        billNote: null,
      },
    ]);
  });

  it("has the table with the owner's labels and no months column", () => {
    expect(doc.table.columns).toEqual([
      "",
      "SQ.FT LEASED",
      "2024 ACTUALS",
      "TENANT'S PRO-RATA SHARE",
      "TENANT'S ANNUAL SHARE",
      "ESTIMATES BILLED IN 2024",
      "BALANCE DUE",
    ]);
    expect(doc.table.rows).toEqual([
      [
        "CAM",
        "2,500",
        "$12,891.19",
        "26.74%",
        "$3,446.84",
        "$3,223.32",
        "$223.52",
      ],
      [
        "Taxes",
        "2,500",
        "$33,542.31",
        "26.74%",
        "$8,968.53",
        "$9,331.32",
        "-$362.79",
      ],
      [
        "Insurance",
        "2,500",
        "$6,284.00",
        "26.74%",
        "$1,680.21",
        "$1,303.20",
        "$377.01",
      ],
    ]);
    expect(doc.table.total).toBe("$237.74");
  });

  it("has the revised monthly rent block", () => {
    expect(doc.rentBlock).toEqual({
      heading: "REVISED MONTHLY RENT (Effective January 1, 2025)",
      lines: [
        { label: "Base Rent", value: "$2,500.00", total: false },
        { label: "CAM", value: "$287.24", total: false },
        { label: "Taxes", value: "$747.38", total: false },
        { label: "Insurance", value: "$140.02", total: false },
        { label: "Total Monthly Rent", value: "$3,674.64", total: true },
        { label: "Rent Balance", value: "$413.74", total: false },
        { label: "Balance on Account", value: "$651.48", total: true },
      ],
    });
  });

  it("labels a dry-run rent balance with its date", () => {
    const dry = statementDocument({ ...lucky, priorBalanceAsOf: "2024-11-16" });
    expect(dry.rentBlock.lines.at(-2)?.label).toBe(
      "Rent Balance as of November 16, 2024",
    );
  });

  it("adds a bill amount note under the cost line", () => {
    const doc = statementDocument({
      ...lucky,
      rows: lucky.rows.map((row) =>
        row.name === "Taxes"
          ? {
              ...row,
              billOverride: {
                amountCents: 3_354_231,
                note: "2024 county bill",
              },
            }
          : row,
      ),
    });
    expect(doc.costLines[1]?.billNote).toBe("Bill amount: 2024 county bill");
  });
});

describe("statement for 6.2 and 6.3", () => {
  it("shows a months column and no revised rent for the August move-out", () => {
    const doc = statementDocument(movedOut);
    expect(doc.table.columns).toContain("MONTHS");
    expect(doc.table.rows[0]).toEqual([
      "CAM",
      "1,250",
      "$12,891.19",
      "13.37%",
      "8",
      "$1,148.95",
      "$1,040.00",
      "$108.95",
    ]);
    expect(doc.table.rows[1]?.at(-1)).toBe("-$10.49");
    expect(doc.table.total).toBe("$218.53");
    expect(doc.rentBlock).toEqual({
      heading: null,
      lines: [
        { label: "Rent Balance", value: "$0.00", total: false },
        { label: "Balance on Account", value: "$218.53", total: true },
      ],
    });
  });

  it("shows the water area, a negative total, and an accounting credit for the renewal", () => {
    const doc = statementDocument(renewal);
    expect(doc.areas).toEqual([
      "BUILDING AREA: 9,350 Sq. Ft",
      "WATER SERVICE AREA: 4,350 Sq. Ft",
      "SQ.FT LEASED: 2,000",
    ]);
    expect(doc.table.rows[3]).toEqual([
      "Water",
      "2,000",
      "$1,879.17",
      "45.98%",
      "$863.99",
      "$1,870.00",
      "-$1,006.01",
    ]);
    expect(doc.table.total).toBe("-$1,084.54");
    expect(doc.rentBlock.lines.slice(1, 5)).toEqual([
      { label: "CAM", value: "$229.79", total: false },
      { label: "Taxes", value: "$597.90", total: false },
      { label: "Insurance", value: "$112.01", total: false },
      { label: "Water", value: "$72.00", total: false },
    ]);
    expect(doc.rentBlock.lines.at(-3)?.value).toBe("$4,161.70");
    expect(doc.rentBlock.lines.at(-2)?.value).toBe("$250.00");
    expect(doc.rentBlock.lines.at(-1)?.value).toBe("($834.54)");
  });
});
