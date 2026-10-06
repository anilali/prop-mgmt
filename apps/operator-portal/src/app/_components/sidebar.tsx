"use client";

import { Search } from "lucide-react";

import type {
  OperableProperty,
  OperatorContext,
} from "@moonship/api-operator/server";
import { Kbd } from "@moonship/ui/kbd";

import { PropertySwitcher } from "./property-switcher";
import { useShell } from "./shell-context";
import { SidebarFooter } from "./sidebar-footer";
import { SidebarNav } from "./sidebar-nav";

export interface SidebarProps {
  context: OperatorContext;
  operableProperties: OperableProperty[];
  isPlatformAdmin: boolean;
  userName: string;
}

export function Sidebar({
  context,
  operableProperties,
  isPlatformAdmin,
  userName,
  onNavigate,
}: SidebarProps & { onNavigate?: () => void }) {
  const { openCommandMenu } = useShell();

  return (
    <>
      <PropertySwitcher
        context={context}
        operableProperties={operableProperties}
        isPlatformAdmin={isPlatformAdmin}
      />
      <button
        type="button"
        onClick={openCommandMenu}
        className="border-line bg-sunk text-fg-3 hover:border-line-3 flex h-[30px] w-full cursor-pointer items-center gap-2 rounded-[7px] border px-[9px] text-left transition-colors"
      >
        <Search className="size-[15px] shrink-0" strokeWidth={1.7} />
        <span className="min-w-0 flex-1 truncate">Search or jump to</span>
        <Kbd>⌘K</Kbd>
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav
          mode={context.mode === "platform" ? "platform" : "property"}
          onNavigate={onNavigate}
        />
      </div>
      <SidebarFooter
        userName={userName}
        role={context.mode === "property" ? context.role : undefined}
      />
    </>
  );
}
