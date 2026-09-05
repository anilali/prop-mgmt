import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requireActiveStaff } from "../_lib/require-active-staff";
import { LeasesPageContent } from "./_components/leases-page-content";

export default async function LeasesPage() {
  await requireActiveStaff();
  prefetch(trpc.lease.list.queryOptions());
  prefetch(trpc.unit.list.queryOptions());
  prefetch(trpc.tenant.list.queryOptions());

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leases</h1>
          <p className="text-muted-foreground text-sm">
            One document per lease term. Renewals are new terms.
          </p>
        </div>
        <LeasesPageContent />
      </div>
    </HydrateClient>
  );
}
