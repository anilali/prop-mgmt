import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requirePropertyContext } from "../_lib/require-operator-context";
import { YearsPageContent } from "./_components/years-page-content";

export default async function ReconciliationPage() {
  await requirePropertyContext();
  prefetch(trpc.reconciliation.listYears.queryOptions());
  prefetch(trpc.property.get.queryOptions());

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <YearsPageContent />
      </div>
    </HydrateClient>
  );
}
