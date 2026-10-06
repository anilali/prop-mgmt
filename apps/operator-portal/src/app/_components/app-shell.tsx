"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { Sheet, SheetContent, SheetTitle } from "@moonship/ui/sheet";

import type { ShellContextValue } from "./shell-context";
import type { SidebarProps } from "./sidebar";
import { BankFooter } from "./bank-footer";
import { CommandMenu } from "./command-menu";
import { ShellContext } from "./shell-context";
import { Sidebar } from "./sidebar";

export function AppShell({
  children,
  ...sidebarProps
}: SidebarProps & { children: ReactNode }) {
  const pathname = usePathname();
  const [navOpenOn, setNavOpenOn] = useState<string | null>(null);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const navOpen = navOpenOn === pathname;
  const propertyMode = sidebarProps.context.mode === "property";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandMenuOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const shell: ShellContextValue = {
    openNav: () => setNavOpenOn(pathname),
    openCommandMenu: () => {
      setNavOpenOn(null);
      setCommandMenuOpen(true);
    },
  };

  return (
    <ShellContext value={shell}>
      <div className="bg-ground bg-dot-grid nav:grid-cols-[232px_minmax(0,1fr)] grid h-dvh grid-cols-[minmax(0,1fr)]">
        <aside className="max-nav:hidden flex min-h-0 flex-col gap-3.5 px-2 pt-2.5 pb-3">
          <Sidebar {...sidebarProps} />
        </aside>
        <main className="nav:p-2 nav:pl-0 h-dvh min-w-0">
          <div className="bg-panel nav:rounded-[10px] nav:border border-line relative flex h-full flex-col overflow-hidden">
            <div
              data-slot="shell-scroll"
              className="min-h-0 flex-1 overflow-auto"
            >
              {children}
            </div>
            {propertyMode ? <BankFooter /> : null}
          </div>
        </main>
      </div>
      <Sheet
        open={navOpen}
        onOpenChange={(open) => setNavOpenOn(open ? pathname : null)}
      >
        <SheetContent
          side="left"
          aria-describedby={undefined}
          className="bg-panel nav:hidden w-[260px] gap-3.5 px-2 pt-[calc(10px+env(safe-area-inset-top))] pb-3 sm:max-w-none"
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Sidebar {...sidebarProps} onNavigate={() => setNavOpenOn(null)} />
        </SheetContent>
      </Sheet>
      <CommandMenu
        open={commandMenuOpen}
        onOpenChange={setCommandMenuOpen}
        propertyMode={propertyMode}
      />
    </ShellContext>
  );
}
