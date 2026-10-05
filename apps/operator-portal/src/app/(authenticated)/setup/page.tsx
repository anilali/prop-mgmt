import { PageHeader } from "@moonship/ui/page-header";

import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requirePropertyContext } from "../_lib/require-operator-context";
import { SetupPageContent } from "./_components/setup-page-content";

export default async function SetupPage() {
  await requirePropertyContext();

  prefetch(trpc.property.get.queryOptions());
  prefetch(trpc.unit.list.queryOptions());
  prefetch(trpc.pool.list.queryOptions());
  prefetch(trpc.category.list.queryOptions({ includeArchived: true }));

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <PageHeader
          title="Setup"
          description="Property and letter details, units, cost pools, and categories."
        />
        <SetupPageContent />
      </div>
    </HydrateClient>
  );
}
