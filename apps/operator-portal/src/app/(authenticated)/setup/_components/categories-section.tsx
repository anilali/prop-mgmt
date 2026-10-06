"use client";

import type { LucideIcon } from "lucide-react";
import { Fragment, useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import type { CategoryKind } from "@moonship/billing";
import { CATEGORY_KINDS } from "@moonship/billing";
import { cn } from "@moonship/ui";
import { Button } from "@moonship/ui/button";
import { List, ListGroupHeader, ListRow } from "@moonship/ui/list";
import { StatusPill } from "@moonship/ui/status-pill";

import type { CategoryView } from "./category-dialog";
import { useTRPC } from "~/trpc/react";
import { CategoryDialog } from "./category-dialog";
import { CATEGORY_KIND_LABELS } from "./category-kinds";
import { HOVER_ACTION } from "./row-actions";

const KIND_ICONS: Record<CategoryKind, LucideIcon> = {
  shared_cost: Users,
  owner_expense: ArrowUpRight,
  income: ArrowDownLeft,
  not_counted: Ban,
};

function byArchivedThenName(a: CategoryView, b: CategoryView): number {
  const archived =
    Number(a.archivedAt !== null) - Number(b.archivedAt !== null);
  return archived !== 0
    ? archived
    : a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function CategoriesSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: categories } = useSuspenseQuery(
    trpc.category.list.queryOptions({ includeArchived: true }),
  );
  const [dialog, setDialog] = useState<{
    open: boolean;
    category: CategoryView | null;
  }>({ open: false, category: null });

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.category.list.queryFilter());

  const unarchive = useMutation(
    trpc.category.unarchive.mutationOptions({
      onSuccess: async (category) => {
        await invalidate();
        toast.success(`${category.name} restored`);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const archive = useMutation(
    trpc.category.archive.mutationOptions({
      onSuccess: async (category) => {
        await invalidate();
        toast.success(`${category.name} archived`, {
          action: {
            label: "Undo",
            onClick: () => unarchive.mutate({ id: category.id }),
          },
        });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const busy = archive.isPending || unarchive.isPending;

  return (
    <div className="flex max-w-[720px] flex-col gap-3">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => setDialog({ open: true, category: null })}
        >
          <Plus />
          New category
        </Button>
      </div>

      <List className="animate-rise">
        {CATEGORY_KINDS.map((kind) => {
          const rows = categories
            .filter((category) => category.kind === kind)
            .sort(byArchivedThenName);
          const Icon = KIND_ICONS[kind];
          return (
            <Fragment key={kind}>
              <ListGroupHeader>
                {CATEGORY_KIND_LABELS[kind].title}
                <span className="text-fg-3 font-mono text-[11px] font-normal">
                  {rows.length}
                </span>
              </ListGroupHeader>
              {rows.length === 0 ? (
                <div className="text-fg-3 px-3.5 py-2.5 text-[12.5px]">
                  None
                </div>
              ) : null}
              {rows.map((category) => {
                const archived = category.archivedAt !== null;
                const shared = category.kind === "shared_cost";
                return (
                  <ListRow
                    key={category.id}
                    columns="26px minmax(0,1fr) auto"
                    className="group"
                  >
                    <span
                      className={cn(
                        "border-line-2 bg-sunk text-fg-2 grid size-[26px] place-items-center rounded-[7px] border",
                        archived && "opacity-50",
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "truncate font-medium",
                          archived && "text-fg-3",
                        )}
                      >
                        {category.name}
                      </span>
                      {archived ? (
                        <StatusPill variant="plain">Archived</StatusPill>
                      ) : null}
                    </span>
                    {shared ? (
                      <span className="text-fg-3 text-[11.5px]">
                        Follows its pool
                      </span>
                    ) : (
                      <span
                        className={cn("flex justify-end gap-0.5", HOVER_ACTION)}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Rename ${category.name}`}
                          title="Rename"
                          onClick={() => setDialog({ open: true, category })}
                        >
                          <Pencil />
                        </Button>
                        {archived ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Restore ${category.name}`}
                            title="Restore"
                            disabled={busy}
                            onClick={() =>
                              unarchive.mutate({ id: category.id })
                            }
                          >
                            <ArchiveRestore />
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Archive ${category.name}`}
                            title="Archive"
                            disabled={busy}
                            onClick={() => archive.mutate({ id: category.id })}
                          >
                            <Archive />
                          </Button>
                        )}
                      </span>
                    )}
                  </ListRow>
                );
              })}
            </Fragment>
          );
        })}
      </List>

      <CategoryDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog({ ...dialog, open })}
        category={dialog.category}
      />
    </div>
  );
}
