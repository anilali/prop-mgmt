import { formatCents } from "@moonship/shared";

import type { AllocationLine } from "./types";

export function checkAllocationLines(
  amountCents: number,
  lines: readonly AllocationLine[],
): void {
  if (lines.length === 0) {
    throw new Error("Add at least one line");
  }
  for (const line of lines) {
    if ((line.accountId === null) === (line.categoryId === null)) {
      throw new Error("Each line needs an account or a category, not both");
    }
    if (!Number.isSafeInteger(line.amountCents) || line.amountCents === 0) {
      throw new Error("Each line needs an amount other than 0");
    }
  }
  const total = lines.reduce((sum, line) => sum + line.amountCents, 0);
  if (total !== amountCents) {
    throw new Error(
      `The lines add up to ${formatCents(total)}, not the transaction's ${formatCents(amountCents)}`,
    );
  }
}
