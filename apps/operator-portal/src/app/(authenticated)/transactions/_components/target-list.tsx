"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import { cn } from "@moonship/ui";

import type { TargetGroup } from "../_lib/transactions";

export function TargetList({
  value,
  groups,
  onChange,
}: {
  value: string;
  groups: readonly TargetGroup[];
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = groups
    .map((group) => ({
      ...group,
      options: group.options.filter(
        (option) =>
          q === "" ||
          `${option.label} ${group.label}`.toLowerCase().includes(q),
      ),
    }))
    .filter((group) => group.options.length > 0);

  return (
    <div className="border-line overflow-hidden rounded-[9px] border">
      <label className="border-line text-fg-3 flex items-center gap-2 border-b px-2.5">
        <Search className="size-3.5 shrink-0" />
        <input
          className="text-foreground placeholder:text-fg-3 h-[34px] min-w-0 flex-1 bg-transparent outline-none"
          placeholder="Sort to an account or category"
          autoComplete="off"
          aria-label="Filter accounts and categories"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div
        role="radiogroup"
        aria-label="Sort to"
        className="max-h-[320px] overflow-auto p-1"
      >
        {visible.length === 0 ? (
          <p className="text-fg-3 px-2 py-3 text-[12.5px]">
            Nothing matches “{query.trim()}”.
          </p>
        ) : null}
        {visible.map((group) => (
          <div key={group.label}>
            <div className="label-caps px-2 pt-2 pb-[3px]">{group.label}</div>
            {group.options.map((option) => {
              const checked = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => onChange(option.value)}
                  className={cn(
                    "grid w-full cursor-pointer grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-[9px] rounded-md px-2 py-1.5 text-left transition-colors duration-100",
                    checked ? "bg-accent-soft" : "hover:bg-hover",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-3.5 rounded-full",
                      checked
                        ? "border-primary border-4"
                        : "border-line-3 border-[1.5px]",
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                  <span className="text-fg-3 text-xs">{option.hint}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
