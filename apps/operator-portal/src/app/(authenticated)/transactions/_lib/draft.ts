import { formatMoney } from "@moonship/ui/money";

import type { TxnLine } from "./transactions";
import { centsToInput } from "../../_lib/format";
import { lineTarget, parseDollars, targetIds } from "./transactions";

export interface DraftLine {
  key: string;
  target: string;
  amount: string;
}

let lineCounter = 0;

export function newDraftLine(
  target: string,
  directedCents: number | null,
): DraftLine {
  lineCounter += 1;
  return {
    key: `line-${lineCounter}`,
    target,
    amount: directedCents === null ? "" : centsToInput(directedCents),
  };
}

export function draftLinesFrom(
  amountCents: number,
  lines: readonly TxnLine[],
): DraftLine[] {
  const sign = amountCents < 0 ? -1 : 1;
  return lines.map((line) =>
    newDraftLine(lineTarget(line), line.amountCents * sign),
  );
}

export function leftToSort(
  amountCents: number,
  lines: readonly DraftLine[],
): number {
  const sum = lines.reduce(
    (acc, line) => acc + (parseDollars(line.amount) ?? 0),
    0,
  );
  return Math.abs(amountCents) - sum;
}

export function draftProblem(
  amountCents: number,
  lines: readonly DraftLine[],
  split: boolean,
): string | null {
  if (lines.some((line) => line.target === "")) {
    return split ? "Choose a target for every part." : "Pick where this goes.";
  }
  const parsed = lines.map((line) => parseDollars(line.amount));
  if (parsed.some((cents) => cents === null || cents === 0)) {
    return "Every part needs an amount other than 0.";
  }
  if (leftToSort(amountCents, lines) !== 0) {
    return `Parts must add up to ${formatMoney(Math.abs(amountCents))}.`;
  }
  return null;
}

export function allocationLines(
  amountCents: number,
  lines: readonly DraftLine[],
): {
  accountId: string | null;
  categoryId: string | null;
  amountCents: number;
}[] {
  const sign = amountCents < 0 ? -1 : 1;
  return lines.map((line) => ({
    ...targetIds(line.target),
    amountCents: (parseDollars(line.amount) ?? 0) * sign,
  }));
}
