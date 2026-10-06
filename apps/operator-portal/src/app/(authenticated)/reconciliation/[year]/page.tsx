import { notFound } from "next/navigation";

import { getQueryClient, HydrateClient, prefetch, trpc } from "~/trpc/server";
import { PageTopBar } from "../../_components/page-top-bar";
import { requirePropertyContext } from "../../_lib/require-operator-context";
import { YearPageContent } from "./_components/year-page-content";

export default async function ReconciliationYearPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  await requirePropertyContext();
  const { year: yearParam } = await params;
  if (!/^\d{4}$/.test(yearParam)) notFound();
  const year = Number(yearParam);
  const { years } = await getQueryClient().fetchQuery(
    trpc.reconciliation.listYears.queryOptions(),
  );
  if (years.some((row) => row.year === year)) {
    prefetch(trpc.reconciliation.workspace.queryOptions({ year }));
  }

  return (
    <HydrateClient>
      <PageTopBar
        crumbs={[
          { label: "Reconciliation", href: "/reconciliation" },
          { label: String(year) },
        ]}
      />
      <YearPageContent year={year} />
    </HydrateClient>
  );
}
