import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requirePropertyContext } from "../../_lib/require-operator-context";
import { ImportPageContent } from "./_components/import-page-content";

export default async function TransactionsImportPage() {
  await requirePropertyContext();
  prefetch(trpc.property.get.queryOptions());
  prefetch(trpc.bankImport.getMapping.queryOptions());
  prefetch(trpc.bankImport.listBatches.queryOptions());

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <ImportPageContent />
      </div>
    </HydrateClient>
  );
}
