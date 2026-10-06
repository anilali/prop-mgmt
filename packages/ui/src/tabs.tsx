"use client";

import type * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@moonship/ui";

export function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "border-line flex items-center gap-0.5 overflow-x-auto border-b",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "text-fg-2 hover:text-foreground data-[state=active]:text-foreground focus-visible:ring-accent-soft relative inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        "after:bg-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-[1.5px] after:rounded-[1px] after:opacity-0 data-[state=active]:after:opacity-100",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

export function TabsCount({
  className,
  hot = false,
  ...props
}: React.ComponentProps<"span"> & { hot?: boolean }) {
  return (
    <span
      data-slot="tabs-count"
      className={cn(
        "font-mono text-[11px] font-medium",
        hot ? "text-red" : "text-fg-3",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}
