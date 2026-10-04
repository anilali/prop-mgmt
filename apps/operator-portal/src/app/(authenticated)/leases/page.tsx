import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requirePropertyContext } from "../_lib/require-operator-context";
import { LeasesPageContent } from "./_components/leases-page-content";

export default async function LeasesPage() {
  await requirePropertyContext();
  prefetch(trpc.lease.list.queryOptions());
  prefetch(trpc.unit.list.queryOptions());
  prefetch(trpc.tenant.list.queryOptions());

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <LeasesPageContent />
      </div>
    </HydrateClient>
  );
}
