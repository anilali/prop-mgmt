import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requirePropertyContext } from "../_lib/require-operator-context";
import { TransactionsPageContent } from "./_components/transactions-page-content";

export default async function TransactionsPage() {
  await requirePropertyContext();
  prefetch(trpc.property.get.queryOptions());
  prefetch(trpc.transaction.listToSort.queryOptions());
  prefetch(trpc.transaction.list.queryOptions());
  prefetch(trpc.account.list.queryOptions());
  prefetch(trpc.category.list.queryOptions({ includeArchived: true }));
  prefetch(trpc.rent.status.queryOptions());
  prefetch(trpc.bankImport.listBatches.queryOptions());

  return (
    <HydrateClient>
      <TransactionsPageContent />
    </HydrateClient>
  );
}
