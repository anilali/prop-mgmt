"use client";

import type { LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Banknote,
  Building2,
  Calculator,
  House,
  Moon,
  Search,
  SlidersHorizontal,
  Sun,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";

import { cn } from "@moonship/ui";
import { Dialog, DialogContent, DialogTitle } from "@moonship/ui/dialog";
import { Kbd } from "@moonship/ui/kbd";
import { formatMoney } from "@moonship/ui/money";
import { useTheme } from "@moonship/ui/theme";

import { RENT_STATUS_LABELS } from "~/app/(authenticated)/_lib/rent";
import { useTRPC } from "~/trpc/react";

type CommandGroup = "Go to" | "Accounts" | "Actions";

interface Command {
  id: string;
  group: CommandGroup;
  label: string;
  sub?: string;
  icon: LucideIcon;
  run: () => void;
}

function useCommands(propertyMode: boolean): Command[] {
  const router = useRouter();
  const trpc = useTRPC();
  const { resolvedTheme, setTheme } = useTheme();
  const { data: status } = useQuery({
    ...trpc.rent.status.queryOptions(),
    enabled: propertyMode,
  });

  const go = (href: string) => () => router.push(href);
  const switchTheme: Command = {
    id: "action-theme",
    group: "Actions",
    label: "Switch theme",
    icon: resolvedTheme === "dark" ? Sun : Moon,
    run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
  };

  if (!propertyMode) {
    return [
      {
        id: "go-properties",
        group: "Go to",
        label: "Properties",
        icon: Building2,
        run: go("/platform/properties"),
      },
      switchTheme,
    ];
  }

  const year = Number((status?.today ?? new Date().toISOString()).slice(0, 4));

  return [
    {
      id: "go-home",
      group: "Go to",
      label: "Home",
      icon: House,
      run: go("/home"),
    },
    {
      id: "go-sort",
      group: "Go to",
      label: "Transactions to sort",
      icon: ArrowLeftRight,
      run: go("/transactions"),
    },
    {
      id: "go-tenants",
      group: "Go to",
      label: "Tenants",
      icon: Users,
      run: go("/tenants"),
    },
    {
      id: "go-reconciliation",
      group: "Go to",
      label: `Reconciliation ${year}`,
      icon: Calculator,
      run: go(`/reconciliation/${year}`),
    },
    {
      id: "go-setup",
      group: "Go to",
      label: "Setup",
      icon: SlidersHorizontal,
      run: go("/setup"),
    },
    ...(status?.rows ?? []).map(
      (row): Command => ({
        id: `account-${row.accountId}`,
        group: "Accounts",
        label: `${row.tenant.businessName} · ${row.unit.label}`,
        sub: `${RENT_STATUS_LABELS[row.status]} · ${formatMoney(row.balanceCents)}`,
        icon: Users,
        run: go(`/tenants/${row.accountId}`),
      }),
    ),
    {
      id: "action-import",
      group: "Actions",
      label: "Import bank file",
      icon: Upload,
      run: go("/transactions/import"),
    },
    {
      id: "action-cash",
      group: "Actions",
      label: "Add cash expense",
      icon: Banknote,
      run: go("/transactions?add=cash"),
    },
    {
      id: "action-tenant",
      group: "Actions",
      label: "New tenant",
      icon: UserPlus,
      run: go("/tenants?new=1"),
    },
    switchTheme,
  ];
}

function matches(command: Command, query: string) {
  if (!query) return true;
  return `${command.label} ${command.sub ?? ""} ${command.group}`
    .toLowerCase()
    .includes(query);
}

export function CommandMenu({
  open,
  onOpenChange,
  propertyMode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyMode: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-[600px] gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">Command menu</DialogTitle>
        {open ? (
          <CommandMenuBody
            propertyMode={propertyMode}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CommandMenuBody({
  propertyMode,
  onDone,
}: {
  propertyMode: boolean;
  onDone: () => void;
}) {
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const commands = useCommands(propertyMode);
  const normalized = query.trim().toLowerCase();
  const visible = commands.filter((command) => matches(command, normalized));
  const index = Math.min(active, Math.max(0, visible.length - 1));
  const current = visible[index];

  useEffect(() => {
    const node = listRef.current?.querySelector('[aria-selected="true"]');
    node?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    onDone();
    command.run();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(visible.length === 0 ? 0 : (index + 1) % visible.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(
        visible.length === 0
          ? 0
          : (index - 1 + visible.length) % visible.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(current);
    }
  };

  return (
    <>
      <label className="border-line text-fg-3 flex items-center gap-2.5 border-b px-4">
        <Search className="size-4 shrink-0" strokeWidth={1.7} />
        <input
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={
            current ? `${listId}-${current.id}` : undefined
          }
          aria-label="Command"
          autoComplete="off"
          placeholder="Type a command or search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="text-foreground placeholder:text-fg-3 h-[50px] min-w-0 flex-1 bg-transparent text-[15px] outline-none"
        />
        <Kbd>esc</Kbd>
      </label>
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        className="max-h-[52vh] overflow-auto p-1.5"
      >
        {visible.length === 0 ? (
          <div className="text-fg-2 px-2.5 pt-2 pb-1">No matches.</div>
        ) : (
          visible.map((command, position) => {
            const heading =
              visible[position - 1]?.group !== command.group ? (
                <div
                  className="label-caps px-2.5 pt-2 pb-1"
                  role="presentation"
                >
                  {command.group}
                </div>
              ) : null;
            const Icon = command.icon;
            const selected = position === index;
            return (
              <div key={command.id} role="presentation">
                {heading}
                <div
                  id={`${listId}-${command.id}`}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => setActive(position)}
                  onClick={() => run(command)}
                  className={cn(
                    "text-fg-2 flex w-full cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-left",
                    selected && "bg-press text-foreground",
                  )}
                >
                  <Icon className="size-[15px] shrink-0" strokeWidth={1.7} />
                  <span className="min-w-0 flex-1 truncate">
                    <b className="text-foreground font-medium">
                      {command.label}
                    </b>
                    {command.sub ? (
                      <span className="text-fg-3"> {command.sub}</span>
                    ) : null}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
