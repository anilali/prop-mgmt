import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requirePropertyContext } from "../../_lib/require-operator-context";
import { ImportPageContent } from "./_components/import-page-content";

export default async function TransactionsImportPage() {
  await requirePropertyContext();
  prefetch(trpc.property.get.queryOptions());
  prefetch(trpc.bankImport.getMapping.queryOptions());

  return (
    <HydrateClient>
      <ImportPageContent />
    </HydrateClient>
  );
}
