import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requirePropertyContext } from "../_lib/require-operator-context";
import { TransactionsPageContent } from "./_components/transactions-page-content";
import { EMPTY_FILTERS, toListInput } from "./_lib/transactions";

export default async function TransactionsPage() {
  await requirePropertyContext();
  prefetch(trpc.property.get.queryOptions());
  prefetch(trpc.transaction.listToSort.queryOptions());
  prefetch(trpc.transaction.list.queryOptions(toListInput(EMPTY_FILTERS)));
  prefetch(trpc.account.list.queryOptions());
  prefetch(trpc.category.list.queryOptions({ includeArchived: true }));

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <TransactionsPageContent />
      </div>
    </HydrateClient>
  );
}
