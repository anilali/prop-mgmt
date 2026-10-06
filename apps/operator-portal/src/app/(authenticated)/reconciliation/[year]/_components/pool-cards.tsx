"use client";

import { useEffect } from "react";

import { formatSqft } from "@moonship/billing";
import { Button } from "@moonship/ui/button";
import { Money } from "@moonship/ui/money";

import type { PoolView, Workspace } from "../../_lib/reconciliation";
import { plural, riseStyle } from "../../_lib/reconciliation";
import { formatMonthDay } from "../../../_lib/format";

const SHOWN_LINES = 5;

export function PoolCards({
  workspace,
  onEditBill,
}: {
  workspace: Workspace;
  onEditBill: (poolId: string) => void;
}) {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id.startsWith("pool-")) {
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    }
  }, []);

  if (workspace.pools.length === 0) {
    return (
      <p className="border-line-2 text-fg-2 rounded-[10px] border border-dashed py-12 text-center text-[12.5px]">
        No pools yet. Add them in Setup.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
      {workspace.pools.map((pool, index) => (
        <PoolCard
          key={pool.poolId}
          year={workspace.year}
          pool={pool}
          index={index}
          onEditBill={() => onEditBill(pool.poolId)}
        />
      ))}
    </div>
  );
}

function PoolCard({
  year,
  pool,
  index,
  onEditBill,
}: {
  year: number;
  pool: PoolView;
  index: number;
  onEditBill: () => void;
}) {
  const lines = [...pool.lines].sort((a, b) =>
    b.postedOn.localeCompare(a.postedOn),
  );
  const hidden = lines.length - SHOWN_LINES;
  const units =
    pool.poolSqft > 0
      ? `${plural(pool.unitIds.length, "unit", "units")} · ${formatSqft(pool.poolSqft)} sqft`
      : "No units";

  return (
    <article
      id={`pool-${pool.poolId}`}
      className="border-line hover:border-line-2 animate-rise flex scroll-mt-16 flex-col rounded-lg border transition-colors"
      style={riseStyle(index)}
    >
      <div className="border-line flex flex-col gap-1.5 border-b p-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[14px] font-semibold">{pool.name}</h3>
          <span className="text-fg-3 text-[11.5px]">{units}</span>
        </div>
        {pool.billOverride ? (
          <div className="border-line mt-1 grid grid-cols-2 overflow-hidden rounded-md border">
            <div className="bg-accent-soft min-w-0 px-2.5 py-2">
              <div className="label-caps">Bill amount used</div>
              <Money
                cents={pool.billOverride.amountCents}
                className="block text-[16px]"
              />
              <div
                className="text-fg-3 truncate text-[11.5px]"
                title={pool.billOverride.note}
              >
                {pool.billOverride.note}
              </div>
            </div>
            <div className="border-line min-w-0 border-l px-2.5 py-2">
              <div className="label-caps">Paid in {year}</div>
              <Money
                cents={pool.categoryTotalCents}
                tone="faint"
                className="block text-[16px]"
              />
              <div className="text-fg-3 text-[11.5px]">
                {plural(lines.length, "payment", "payments")}, not used
              </div>
            </div>
          </div>
        ) : (
          <>
            <Money
              cents={pool.actualCents}
              tone={pool.actualCents < 0 ? "red" : "default"}
              className="block text-[22px] font-medium tracking-[-0.03em]"
            />
            <div className="text-fg-3 text-[11.5px]">
              Actual cost from{" "}
              {plural(lines.length, "transaction", "transactions")}
            </div>
          </>
        )}
      </div>
      <div className="flex flex-col py-1.5">
        {lines.slice(0, SHOWN_LINES).map((line, lineIndex) => {
          const cost = -line.amountCents;
          return (
            <div
              key={`${line.transactionId}-${lineIndex}`}
              className="grid grid-cols-[52px_minmax(0,1fr)_auto] gap-2.5 px-3.5 py-[5px] text-[12.5px]"
            >
              <span className="text-fg-3 font-mono text-[11.5px]">
                {formatMonthDay(line.postedOn)}
              </span>
              <span className="text-fg-2 truncate" title={line.description}>
                {line.description}
              </span>
              <Money
                cents={cost}
                tone={cost < 0 ? "green" : "default"}
                className="text-right text-[12.5px]"
              />
            </div>
          );
        })}
        {hidden > 0 ? (
          <div className="text-fg-3 grid grid-cols-[52px_minmax(0,1fr)] gap-2.5 px-3.5 py-[5px] text-[11.5px]">
            <span />
            <span>and {hidden} more</span>
          </div>
        ) : null}
        {lines.length === 0 ? (
          <div className="text-fg-3 grid grid-cols-[52px_minmax(0,1fr)] gap-2.5 px-3.5 py-[5px] text-[11.5px]">
            <span />
            <span>
              {pool.categoryId === null
                ? "No category is linked to this pool"
                : "No transactions yet"}
            </span>
          </div>
        ) : null}
      </div>
      <div className="border-line mt-auto flex justify-end border-t px-3.5 py-2.5">
        <Button type="button" variant="outline" size="sm" onClick={onEditBill}>
          {pool.billOverride ? "Edit bill" : "Enter bill amount"}
        </Button>
      </div>
    </article>
  );
}
