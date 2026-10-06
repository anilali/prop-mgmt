import { useId } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@moonship/ui";
import { Button } from "@moonship/ui/button";
import { formatMoney, Money } from "@moonship/ui/money";

import { MONTH_ABBREVIATIONS } from "../_lib/dates";
import { rise } from "./todo-list";

export interface RentMonth {
  month: number;
  expectedCents: number;
  paidCents: number;
  nodata: boolean;
}

const WIDTH = 340;
const HEIGHT = 158;
const LEFT = 36;
const RIGHT = 4;
const TOP = 10;
const BOTTOM = 22;
const INNER_WIDTH = WIDTH - LEFT - RIGHT;
const INNER_HEIGHT = HEIGHT - TOP - BOTTOM;
const STEP = INNER_WIDTH / 12;
const BAR_WIDTH = Math.round(STEP * 0.56);

function tickStep(maxCents: number): number {
  const raw = Math.max(maxCents, 100_00) / 3;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const factor = [1, 2, 2.5, 5, 10].find((f) => f * magnitude >= raw) ?? 10;
  return factor * magnitude;
}

function tickLabel(cents: number): string {
  if (cents === 0) return "$0";
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${Number((dollars / 1000).toFixed(1))}k`;
  return `$${dollars}`;
}

export function RentChartCard({
  months,
  today,
  index,
}: {
  months: RentMonth[];
  today: string;
  index: number;
}) {
  const hatchId = `hatch-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const year = today.slice(0, 4);
  const currentMonth = Number(today.slice(5, 7));
  const past = months.filter((m) => m.month <= currentMonth);
  const received = past.reduce((sum, m) => sum + m.paidCents, 0);
  const expected = past.reduce((sum, m) => sum + m.expectedCents, 0);
  const anyNodata = past.some((m) => m.nodata);

  const peak = Math.max(
    0,
    ...past.map((m) => Math.max(m.expectedCents, m.paidCents)),
  );
  const step = tickStep(peak);
  const top = Math.max(step * Math.ceil(peak / step), step);
  const ticks = Array.from(
    { length: Math.round(top / step) + 1 },
    (_, i) => i * step,
  );
  const y = (cents: number) =>
    TOP + INNER_HEIGHT - (Math.min(cents, top) / top) * INNER_HEIGHT;
  const base = y(0);

  return (
    <section
      className="border-line bg-panel animate-rise rounded-[9px] border"
      style={rise(index)}
    >
      <div className="border-line flex items-center justify-between gap-2.5 border-b py-[7px] pr-2 pl-3.5">
        <h2 className="text-[13px] font-semibold">Rent in {year}</h2>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/tenants">
            Tenants
            <ChevronRight />
          </Link>
        </Button>
      </div>
      <div className="p-3.5">
        <div className="mb-2.5 flex flex-wrap justify-between gap-[18px]">
          <div>
            <div className="label-caps">Received</div>
            <Money
              cents={received}
              className="text-[22px] font-medium tracking-[-0.03em]"
            />
          </div>
          <div className="ml-auto text-right">
            <div className="label-caps">Expected</div>
            <Money
              cents={expected}
              tone="faint"
              className="text-[22px] font-medium tracking-[-0.03em]"
            />
          </div>
        </div>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Rent expected and received by month in ${year}`}
        >
          <defs>
            <pattern
              id={hatchId}
              width="4"
              height="4"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="1.2" height="4" className="fill-fg-3" />
            </pattern>
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={LEFT}
                x2={WIDTH - RIGHT}
                y1={y(tick)}
                y2={y(tick)}
                className="stroke-line"
                strokeWidth={1}
              />
              <text
                x={LEFT - 6}
                y={y(tick) + 3}
                textAnchor="end"
                className="fill-fg-3 font-mono text-[10px]"
              >
                {tickLabel(tick)}
              </text>
            </g>
          ))}
          {months.map((m) => {
            const x = LEFT + STEP * (m.month - 1) + (STEP - BAR_WIDTH) / 2;
            const current = m.month === currentMonth;
            return (
              <g key={m.month}>
                <title>
                  {m.month > currentMonth
                    ? `${MONTH_ABBREVIATIONS[m.month - 1]}: not yet`
                    : `${MONTH_ABBREVIATIONS[m.month - 1]}: received ${formatMoney(m.paidCents, { cents: false })} of ${formatMoney(m.expectedCents, { cents: false })}${m.nodata ? ", no bank data yet" : ""}`}
                </title>
                {m.month > currentMonth ? (
                  <line
                    x1={x}
                    x2={x + BAR_WIDTH}
                    y1={base - 0.5}
                    y2={base - 0.5}
                    className="stroke-line-3"
                    strokeDasharray="2 2"
                  />
                ) : m.nodata ? (
                  <rect
                    x={x}
                    y={y(m.expectedCents)}
                    width={BAR_WIDTH}
                    height={base - y(m.expectedCents)}
                    rx={2}
                    fill={`url(#${hatchId})`}
                    opacity={0.6}
                  />
                ) : m.expectedCents > 0 ? (
                  <rect
                    x={x + 0.5}
                    y={y(m.expectedCents) + 0.5}
                    width={BAR_WIDTH - 1}
                    height={Math.max(base - y(m.expectedCents) - 1, 0)}
                    rx={2}
                    fill="none"
                    className="stroke-line-3"
                    strokeWidth={1}
                  />
                ) : null}
                {m.month <= currentMonth && m.paidCents > 0 ? (
                  <rect
                    x={x + 2}
                    y={y(m.paidCents)}
                    width={BAR_WIDTH - 4}
                    height={base - y(m.paidCents)}
                    rx={1.5}
                    className="fill-primary"
                  />
                ) : null}
                <text
                  x={x + BAR_WIDTH / 2}
                  y={HEIGHT - 6}
                  textAnchor="middle"
                  className={cn(
                    "font-mono text-[10px]",
                    current ? "fill-foreground font-medium" : "fill-fg-3",
                  )}
                >
                  {MONTH_ABBREVIATIONS[m.month - 1]}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="text-fg-2 mt-2 flex flex-wrap gap-3.5 text-[11.5px]">
          <LegendKey className="bg-primary">Received</LegendKey>
          <LegendKey className="border-line-3 border">Expected</LegendKey>
          {anyNodata ? (
            <LegendKey className="bg-[repeating-linear-gradient(135deg,var(--fg-3)_0_1px,transparent_1px_3px)]">
              No bank data yet
            </LegendKey>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function LegendKey({
  className,
  children,
}: {
  className: string;
  children: string;
}) {
  return (
    <span className="inline-flex items-center gap-[5px]">
      <i aria-hidden className={cn("size-[9px] rounded-[2px]", className)} />
      {children}
    </span>
  );
}
