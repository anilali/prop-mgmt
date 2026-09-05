import { getEnrichedSession } from "~/auth/server";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { PropertyPageContent } from "./_components/property-page-content";
import { getPropertySetupStatus } from "./_lib/setup-status";

export default async function PropertyPage() {
  const session = await getEnrichedSession();
  const { isActiveStaff, canClaimAdmin } = await getPropertySetupStatus(
    session?.staff ?? null,
  );

  prefetch(trpc.property.get.queryOptions());
  if (isActiveStaff) {
    prefetch(trpc.unit.list.queryOptions());
  }

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Property</h1>
          <p className="text-muted-foreground text-sm">
            Configure address, units, and utility sharing.
          </p>
        </div>
        <PropertyPageContent
          isActiveStaff={isActiveStaff}
          canClaimAdmin={canClaimAdmin}
        />
      </div>
    </HydrateClient>
  );
}
