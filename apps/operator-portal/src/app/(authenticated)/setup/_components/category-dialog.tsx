"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { RouterInputs, RouterOutputs } from "@moonship/api-operator";
import { Button } from "@moonship/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@moonship/ui/dialog";
import { Input } from "@moonship/ui/input";
import { Label } from "@moonship/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@moonship/ui/select";

import { useTRPC } from "~/trpc/react";
import { CATEGORY_KIND_LABELS } from "./category-kinds";

export type CategoryView = RouterOutputs["category"]["list"][number];
type OwnKind = RouterInputs["category"]["create"]["kind"];

const OWN_KINDS: OwnKind[] = ["owner_expense", "income", "not_counted"];

function isOwnKind(value: string): value is OwnKind {
  return OWN_KINDS.some((kind) => kind === value);
}

export function CategoryDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryView | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {category ? "Rename category" : "Add category"}
          </DialogTitle>
        </DialogHeader>
        {open ? (
          <CategoryForm
            category={category}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({
  category,
  onDone,
}: {
  category: CategoryView | null;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState(category?.name ?? "");
  const [kind, setKind] = useState<OwnKind>("owner_expense");

  const onSuccess = async (message: string) => {
    await queryClient.invalidateQueries(trpc.category.list.queryFilter());
    toast.success(message);
    onDone();
  };

  const create = useMutation(
    trpc.category.create.mutationOptions({
      onSuccess: () => onSuccess("Category added"),
      onError: (err) => toast.error(err.message),
    }),
  );

  const rename = useMutation(
    trpc.category.rename.mutationOptions({
      onSuccess: () => onSuccess("Category renamed"),
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() === "") {
          toast.error("Enter a category name");
          return;
        }
        if (category) {
          rename.mutate({ id: category.id, name: name.trim() });
        } else {
          create.mutate({ name: name.trim(), kind });
        }
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="category-name">Name</Label>
        <Input
          id="category-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={64}
          required
        />
      </div>
      {category ? null : (
        <div className="space-y-1">
          <Label htmlFor="category-kind">Kind</Label>
          <Select
            value={kind}
            onValueChange={(value) => {
              if (isOwnKind(value)) setKind(value);
            }}
          >
            <SelectTrigger id="category-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OWN_KINDS.map((option) => (
                <SelectItem key={option} value={option}>
                  {CATEGORY_KIND_LABELS[option].title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            The kind can&apos;t change later. Shared-cost categories come from
            pools.
          </p>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending || rename.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
