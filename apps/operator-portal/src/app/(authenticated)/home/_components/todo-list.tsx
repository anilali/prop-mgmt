import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { CircleCheck } from "lucide-react";

import { cn } from "@moonship/ui";

export type TodoTone = "red" | "amber" | "accent" | "plain" | "done";

export interface TodoItem {
  key: string;
  tone: TodoTone;
  icon: LucideIcon;
  title: ReactNode;
  meta: string;
  actions?: ReactNode;
}

const TILE_TONES: Record<TodoTone, string> = {
  red: "bg-red-soft text-red border-transparent",
  amber: "bg-amber-soft text-amber border-transparent",
  accent: "bg-accent-soft text-primary border-transparent",
  plain: "bg-sunk text-fg-2 border-line-2",
  done: "bg-green-soft text-green border-transparent",
};

export function rise(index: number): CSSProperties {
  return { "--i": index } as CSSProperties;
}

export function AccountLink({
  accountId,
  tenant,
  unit,
}: {
  accountId: string;
  tenant: { businessName: string };
  unit?: { label: string };
}) {
  return (
    <Link
      href={`/tenants/${accountId}`}
      className="decoration-line-3 underline-offset-[3px] hover:underline"
    >
      {unit ? `${tenant.businessName} · ${unit.label}` : tenant.businessName}
    </Link>
  );
}

export function TodoGroup({
  title,
  items,
  startIndex,
}: {
  title: string;
  items: TodoItem[];
  startIndex: number;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mb-[22px]">
      <div className="flex items-center gap-2 px-0.5 pb-2">
        <h2 className="label-caps">{title}</h2>
        <span className="text-fg-3 font-mono text-[11px] font-medium">
          {items.length}
        </span>
      </div>
      <ul className="border-line overflow-hidden rounded-[9px] border">
        {items.map((item, index) => (
          <TodoRow key={item.key} item={item} index={startIndex + index} />
        ))}
      </ul>
    </section>
  );
}

function TodoRow({ item, index }: { item: TodoItem; index: number }) {
  const Icon = item.icon;
  return (
    <li
      className="border-line hover:bg-hover animate-rise grid grid-cols-[26px_minmax(0,1fr)] items-center gap-3 border-t px-3 py-[11px] transition-colors first:border-t-0 min-[561px]:grid-cols-[28px_minmax(0,1fr)_auto]"
      style={rise(index)}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-[26px] place-items-center rounded-[7px] border",
          TILE_TONES[item.tone],
        )}
      >
        <Icon className="size-3.5" strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <div
          className={cn(
            "font-medium",
            item.tone === "done" && "text-fg-3 decoration-line-3 line-through",
          )}
        >
          {item.title}
        </div>
        <p className="text-fg-2 mt-px text-[12.5px]">{item.meta}</p>
      </div>
      {item.actions ? (
        <div className="col-start-2 flex flex-wrap justify-start gap-1.5 min-[561px]:col-start-3 min-[561px]:justify-end">
          {item.actions}
        </div>
      ) : null}
    </li>
  );
}

export function AlsoChecked({
  parts,
  allClear,
  index,
}: {
  parts: string[];
  allClear: boolean;
  index: number;
}) {
  if (parts.length === 0) return null;
  const list = parts.join(", ");
  return (
    <div
      className="bg-sunk border-line text-fg-2 animate-rise flex items-start gap-[9px] rounded-[9px] border px-3 py-2.5 text-[12.5px]"
      style={rise(index)}
    >
      <CircleCheck
        aria-hidden
        className="text-green mt-px size-3.5 shrink-0"
        strokeWidth={1.8}
      />
      <span>
        {allClear
          ? `Nothing needs action. Checked: ${list}.`
          : `Also checked: ${list}.`}
      </span>
    </div>
  );
}
