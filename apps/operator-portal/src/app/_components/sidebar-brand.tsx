"use client";

import { Building2, PanelLeft } from "lucide-react";

import { Button } from "@moonship/ui/button";

export function SidebarBrand() {
  return (
    <div className="flex items-center gap-2">
      <span className="bg-foreground text-background flex size-8 shrink-0 items-center justify-center rounded-lg">
        <Building2 className="size-4" />
      </span>
      <span className="truncate text-sm font-semibold">Operator</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Collapse sidebar"
        className="ml-auto size-7"
      >
        <PanelLeft className="size-4" />
      </Button>
    </div>
  );
}
