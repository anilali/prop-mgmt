"use client";

import { useEffect } from "react";
import { skipToken, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { useTRPC } from "~/trpc/react";
import {
  draftLinesFrom,
  SortDialog,
} from "../../../transactions/_components/sort-dialog";

export function PaymentDialog({
  transactionId,
  onClose,
}: {
  transactionId: string | null;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const { data: accountList } = useSuspenseQuery(
    trpc.account.list.queryOptions(),
  );
  const { data: categories } = useSuspenseQuery(
    trpc.category.list.queryOptions({ includeArchived: true }),
  );
  const { data: txn, error } = useQuery(
    trpc.transaction.get.queryOptions(
      transactionId ? { id: transactionId } : skipToken,
    ),
  );
  const current = txn?.id === transactionId ? txn : null;

  useEffect(() => {
    if (!error) return;
    toast.error(error.message);
    onClose();
  }, [error, onClose]);

  return (
    <SortDialog
      txn={current}
      initialLines={
        current ? draftLinesFrom(current.amountCents, current.lines) : []
      }
      accounts={accountList.accounts}
      categories={categories}
      open={current !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    />
  );
}
