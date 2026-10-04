"use client";

import type {
  OperableProperty,
  OperatorContext,
} from "@moonship/api-operator/server";

import { OperatorContextSwitcher } from "./operator-context-switcher";
import { SidebarBrand } from "./sidebar-brand";
import { SidebarFooter } from "./sidebar-footer";
import { SidebarNav } from "./sidebar-nav";

export function Sidebar({
  context,
  operableProperties,
  isPlatformAdmin,
  userName,
}: {
  context: OperatorContext;
  operableProperties: OperableProperty[];
  isPlatformAdmin: boolean;
  userName: string;
}) {
  return (
    <aside className="bg-muted text-foreground flex h-full w-60 shrink-0 flex-col gap-4 p-4">
      <SidebarBrand />
      <OperatorContextSwitcher
        context={context}
        operableProperties={operableProperties}
        isPlatformAdmin={isPlatformAdmin}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav
          mode={context.mode === "platform" ? "platform" : "property"}
          role={context.mode === "property" ? context.role : undefined}
        />
      </div>
      <div className="mt-auto">
        <SidebarFooter userName={userName} />
      </div>
    </aside>
  );
}
