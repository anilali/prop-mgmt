import { describe, expect, it } from "vitest";

import type { TestCaller } from "../test-setup-stores";
import {
  codeOf,
  createTestApp,
  PLATFORM_ADMIN,
  STRANGER,
} from "../test-setup-stores";

const ID = "66666666-6666-4666-8666-666666666666";
const MAPPING = {
  dateColumn: "Date",
  dateFormat: "MM/DD/YYYY" as const,
  descriptionColumn: "Description",
  amount: { mode: "signed" as const, column: "Amount", flipSign: false },
  idColumn: null,
};
const CASH = {
  date: "2026-01-05",
  description: "Hardware",
  amountCents: 100,
  categoryId: ID,
};

const calls: [string, (caller: TestCaller) => Promise<unknown>][] = [
  ["bankImport.getMapping", (c) => c.bankImport.getMapping()],
  ["bankImport.preview", (c) => c.bankImport.preview({ csvText: "a,b,c" })],
  [
    "bankImport.commit",
    (c) =>
      c.bankImport.commit({
        csvText: "a,b,c",
        fileName: "x.csv",
        mapping: MAPPING,
      }),
  ],
  ["bankImport.listBatches", (c) => c.bankImport.listBatches()],
  ["bankImport.removeBatch", (c) => c.bankImport.removeBatch({ id: ID })],
  ["transaction.listToSort", (c) => c.transaction.listToSort()],
  ["transaction.list", (c) => c.transaction.list()],
  ["transaction.get", (c) => c.transaction.get({ id: ID })],
  [
    "transaction.allocate",
    (c) =>
      c.transaction.allocate({
        id: ID,
        lines: [{ categoryId: ID, amountCents: 1 }],
      }),
  ],
  ["transaction.unsort", (c) => c.transaction.unsort({ id: ID })],
  ["transaction.createCash", (c) => c.transaction.createCash(CASH)],
  [
    "transaction.updateCash",
    (c) => c.transaction.updateCash({ id: ID, ...CASH }),
  ],
  ["transaction.removeCash", (c) => c.transaction.removeCash({ id: ID })],
];

describe("bank and transaction procedures need property mode and membership", () => {
  it.each(calls)("%s rejects platform mode", async (_name, call) => {
    const caller = await createTestApp().callerFor(PLATFORM_ADMIN, "platform");
    expect(await codeOf(call(caller))).toBe("FORBIDDEN");
  });

  it.each(calls)("%s rejects a non-member", async (_name, call) => {
    const caller = await createTestApp().callerFor(STRANGER);
    expect(await codeOf(call(caller))).toBe("FORBIDDEN");
  });
});
