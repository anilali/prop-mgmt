"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Building2, Menu } from "lucide-react";

import type {
  OperableProperty,
  OperatorContext,
} from "@moonship/api-operator/server";
import { Button } from "@moonship/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@moonship/ui/sheet";

import { OperatorContextSwitcher } from "./operator-context-switcher";
import { SidebarBrand } from "./sidebar-brand";
import { SidebarFooter } from "./sidebar-footer";
import { SidebarNav } from "./sidebar-nav";

interface SidebarProps {
  context: OperatorContext;
  operableProperties: OperableProperty[];
  isPlatformAdmin: boolean;
  userName: string;
}

function SidebarContent({
  context,
  operableProperties,
  isPlatformAdmin,
  userName,
  onClose,
}: SidebarProps & { onClose?: () => void }) {
  return (
    <>
      <SidebarBrand onCollapse={onClose} />
      <OperatorContextSwitcher
        context={context}
        operableProperties={operableProperties}
        isPlatformAdmin={isPlatformAdmin}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav
          mode={context.mode === "platform" ? "platform" : "property"}
          role={context.mode === "property" ? context.role : undefined}
          onNavigate={onClose}
        />
      </div>
      <div className="mt-auto">
        <SidebarFooter userName={userName} />
      </div>
    </>
  );
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside className="bg-muted text-foreground hidden h-full w-60 shrink-0 flex-col gap-4 p-4 md:flex">
      <SidebarContent {...props} />
    </aside>
  );
}

export function MobileSidebar(props: SidebarProps) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean) => setOpenOn(value ? pathname : null);

  return (
    <div className="flex items-center gap-2 pb-2 md:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Open menu"
        className="size-8"
        onClick={() => setOpen(true)}
      >
        <Menu className="size-4" />
      </Button>
      <span className="bg-foreground text-background flex size-7 shrink-0 items-center justify-center rounded-lg">
        <Building2 className="size-4" />
      </span>
      <span className="truncate text-sm font-semibold">Operator</span>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          aria-describedby={undefined}
          className="bg-muted text-foreground w-72 gap-4 p-4"
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarContent {...props} onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
