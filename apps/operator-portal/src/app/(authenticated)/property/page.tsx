import { PageHeader } from "@moonship/ui/page-header";

import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requirePropertyContext } from "../_lib/require-operator-context";
import { PropertyPageContent } from "./_components/property-page-content";

export default async function PropertyPage() {
  await requirePropertyContext();

  prefetch(trpc.property.get.queryOptions());
  prefetch(trpc.unit.list.queryOptions());

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <PageHeader
          title="Property"
          description="Configure address, units, and utility sharing."
        />
        <PropertyPageContent />
      </div>
    </HydrateClient>
  );
}
