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
import { NativeSelect } from "@moonship/ui/select";

import { useTRPC } from "~/trpc/react";
import { CATEGORY_KIND_LABELS } from "./category-kinds";
import { FormField } from "./form-field";

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
            {category ? "Rename category" : "New category"}
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
      className="grid gap-3"
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
      <FormField label="Name" htmlFor="category-name">
        <Input
          id="category-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={64}
          required
        />
      </FormField>
      {category ? null : (
        <FormField
          label="Kind"
          htmlFor="category-kind"
          hint={`${CATEGORY_KIND_LABELS[kind].description} The kind can't change later.`}
        >
          <NativeSelect
            id="category-kind"
            value={kind}
            onChange={(e) => {
              if (isOwnKind(e.target.value)) setKind(e.target.value);
            }}
          >
            {OWN_KINDS.map((option) => (
              <option key={option} value={option}>
                {CATEGORY_KIND_LABELS[option].title}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={create.isPending || rename.isPending}
        >
          {category ? "Rename" : "Add category"}
        </Button>
      </DialogFooter>
    </form>
  );
}
