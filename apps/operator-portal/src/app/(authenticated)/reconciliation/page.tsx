import { getQueryClient, HydrateClient, prefetch, trpc } from "~/trpc/server";
import { PageTopBar } from "../_components/page-top-bar";
import { requirePropertyContext } from "../_lib/require-operator-context";
import { YearsPageContent } from "./_components/years-page-content";

export default async function ReconciliationPage() {
  await requirePropertyContext();
  const { years } = await getQueryClient().fetchQuery(
    trpc.reconciliation.listYears.queryOptions(),
  );
  for (const row of years) {
    prefetch(trpc.reconciliation.workspace.queryOptions({ year: row.year }));
  }

  return (
    <HydrateClient>
      <PageTopBar crumbs={[{ label: "Reconciliation" }]} />
      <div className="nav:px-6 nav:pt-[22px] nav:pb-12 max-w-[880px] px-4 pt-[18px] pb-10">
        <YearsPageContent />
      </div>
    </HydrateClient>
  );
}
