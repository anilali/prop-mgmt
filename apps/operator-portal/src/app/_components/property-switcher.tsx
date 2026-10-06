"use client";

import { Suspense, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronsUpDown } from "lucide-react";

import type {
  OperableProperty,
  OperatorContext,
} from "@moonship/api-operator/server";
import { cn } from "@moonship/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@moonship/ui/dropdown-menu";

import { setOperatorContextAction } from "~/app/_actions/operator-context";
import { useTRPC } from "~/trpc/react";

const PLATFORM_VALUE = "platform";

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("");
  return letters.toUpperCase() || "?";
}

function UnitSummary() {
  const trpc = useTRPC();
  const { data: units } = useSuspenseQuery(trpc.unit.list.queryOptions());
  if (units.length === 0) return null;
  const sqft = units.reduce((total, unit) => total + unit.sqft, 0);
  return (
    <small className="text-fg-3 block truncate text-[11.5px]">
      {units.length} {units.length === 1 ? "unit" : "units"} ·{" "}
      {sqft.toLocaleString("en-US")} sqft
    </small>
  );
}

function SwitcherFace({
  name,
  showSummary,
  showChevron,
}: {
  name: string;
  showSummary: boolean;
  showChevron: boolean;
}) {
  return (
    <>
      <span className="border-line-2 bg-raised text-foreground grid size-[22px] shrink-0 place-items-center rounded-md border font-mono text-[10px] font-semibold">
        {initials(name)}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[13px] leading-tight font-semibold">
          {name}
        </b>
        {showSummary ? (
          <Suspense fallback={null}>
            <UnitSummary />
          </Suspense>
        ) : null}
      </span>
      {showChevron ? (
        <ChevronsUpDown className="text-fg-3 size-3.5 shrink-0" />
      ) : null}
    </>
  );
}

const faceClassName =
  "flex w-full items-center gap-[9px] rounded-[7px] border border-transparent px-2 py-1.5 text-left";

export function PropertySwitcher({
  context,
  operableProperties,
  isPlatformAdmin,
}: {
  context: OperatorContext;
  operableProperties: OperableProperty[];
  isPlatformAdmin: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (context.mode === "no-access") {
    return null;
  }

  const properties = [...operableProperties].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  const propertyMode = context.mode === "property";
  const name = propertyMode ? context.propertyName : "Platform";
  const choices = properties.length + (isPlatformAdmin ? 1 : 0);

  if (choices <= 1) {
    return (
      <div className={faceClassName}>
        <SwitcherFace
          name={name}
          showSummary={propertyMode}
          showChevron={false}
        />
      </div>
    );
  }

  const currentValue = propertyMode ? context.propertyId : PLATFORM_VALUE;
  const choose = (value: string) => {
    if (value === currentValue) return;
    startTransition(async () => {
      const result = await setOperatorContextAction(value);
      if (result.ok && result.path) {
        router.push(result.path);
        router.refresh();
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Switch property"
          disabled={isPending}
          className={cn(
            faceClassName,
            "hover:border-line hover:bg-hover cursor-pointer transition-colors disabled:opacity-60",
          )}
        >
          <SwitcherFace name={name} showSummary={propertyMode} showChevron />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {properties.map((property) => (
          <DropdownMenuItem
            key={property.id}
            onSelect={() => choose(property.id)}
            aria-current={property.id === currentValue ? "true" : undefined}
            className="aria-[current=true]:font-semibold"
          >
            {property.name}
          </DropdownMenuItem>
        ))}
        {isPlatformAdmin ? (
          <DropdownMenuItem
            onSelect={() => choose(PLATFORM_VALUE)}
            aria-current={currentValue === PLATFORM_VALUE ? "true" : undefined}
            className="aria-[current=true]:font-semibold"
          >
            Platform
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
