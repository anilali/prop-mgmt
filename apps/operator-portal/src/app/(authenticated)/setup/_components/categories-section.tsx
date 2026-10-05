"use client";

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { CATEGORY_KINDS } from "@moonship/billing";
import { Badge } from "@moonship/ui/badge";
import { Button } from "@moonship/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import type { CategoryView } from "./category-dialog";
import { useTRPC } from "~/trpc/react";
import { CategoryDialog } from "./category-dialog";
import { CATEGORY_KIND_LABELS } from "./category-kinds";

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
  const { data: pools } = useSuspenseQuery(trpc.pool.list.queryOptions());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryView | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.category.list.queryFilter());

  const archive = useMutation(
    trpc.category.archive.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Category archived");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const unarchive = useMutation(
    trpc.category.unarchive.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Category restored");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const poolName = (poolId: string | null) =>
    pools.find((pool) => pool.id === poolId)?.name ?? "";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">Categories</h2>
          <p className="text-muted-foreground text-sm">
            Archived categories are hidden from pickers and still count in
            totals.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          Add category
        </Button>
      </div>

      <div className="grid gap-6">
        {CATEGORY_KINDS.map((kind) => {
          const rows = categories
            .filter((category) => category.kind === kind)
            .sort(byArchivedThenName);
          return (
            <div key={kind} className="space-y-2">
              <div className="space-y-1">
                <h3 className="font-medium">
                  {CATEGORY_KIND_LABELS[kind].title}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {CATEGORY_KIND_LABELS[kind].description}
                </p>
              </div>
              {rows.length === 0 ? (
                <p className="text-muted-foreground text-sm">None.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>
                        {kind === "shared_cost" ? "Pool" : "Status"}
                      </TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((category) => (
                      <TableRow key={category.id}>
                        <TableCell
                          className={
                            category.archivedAt
                              ? "text-muted-foreground font-medium"
                              : "font-medium"
                          }
                        >
                          {category.name}
                        </TableCell>
                        <TableCell>
                          {category.kind === "shared_cost" ? (
                            poolName(category.poolId)
                          ) : category.archivedAt ? (
                            <Badge variant="outline">Archived</Badge>
                          ) : (
                            <Badge variant="secondary">Active</Badge>
                          )}
                        </TableCell>
                        <TableCell className="space-x-2 text-right">
                          {category.kind === "shared_cost" ? null : (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditing(category);
                                  setDialogOpen(true);
                                }}
                              >
                                Rename
                              </Button>
                              {category.archivedAt ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={unarchive.isPending}
                                  onClick={() =>
                                    unarchive.mutate({ id: category.id })
                                  }
                                >
                                  Unarchive
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={archive.isPending}
                                  onClick={() =>
                                    archive.mutate({ id: category.id })
                                  }
                                >
                                  Archive
                                </Button>
                              )}
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          );
        })}
      </div>

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editing}
      />
    </section>
  );
}
