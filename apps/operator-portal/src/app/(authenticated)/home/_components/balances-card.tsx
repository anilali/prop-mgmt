import Link from "next/link";

import { Chip } from "@moonship/ui/chip";
import { Money } from "@moonship/ui/money";
import { StatusPill } from "@moonship/ui/status-pill";

import type { RentStatusRow } from "../../_lib/rent";
import { RENT_STATUS_LABELS, RENT_STATUS_PILLS } from "../../_lib/rent";
import { rise } from "./todo-list";

export function BalancesCard({
  rows,
  index,
}: {
  rows: RentStatusRow[];
  index: number;
}) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => b.balanceCents - a.balanceCents);
  return (
    <section
      className="border-line bg-panel animate-rise overflow-hidden rounded-[9px] border"
      style={rise(index)}
    >
      <div className="border-line border-b px-3.5 py-[11px]">
        <h2 className="text-[13px] font-semibold">Balances</h2>
      </div>
      <ul>
        {sorted.map((row) => (
          <li
            key={row.accountId}
            className="border-line border-t first:border-t-0"
          >
            <Link
              href={`/tenants/${row.accountId}`}
              className="hover:bg-hover grid grid-cols-[minmax(0,1fr)_auto_minmax(96px,auto)] items-center gap-2.5 px-3.5 py-2 transition-colors"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <b className="truncate font-medium">
                  {row.tenant.businessName}
                </b>
                <Chip>{row.unit.label}</Chip>
              </span>
              <StatusPill variant={RENT_STATUS_PILLS[row.status]}>
                {RENT_STATUS_LABELS[row.status]}
              </StatusPill>
              <Money cents={row.balanceCents} className="text-right" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
