import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requirePropertyContext } from "../_lib/require-operator-context";
import { SetupPageContent } from "./_components/setup-page-content";

export default async function SetupPage() {
  const { context, propertyId } = await requirePropertyContext();
  const isAdmin = context.role === "admin";

  prefetch(trpc.property.get.queryOptions());
  prefetch(trpc.unit.list.queryOptions());
  prefetch(trpc.pool.list.queryOptions());
  prefetch(trpc.category.list.queryOptions({ includeArchived: true }));
  prefetch(trpc.rent.bankStatus.queryOptions());
  if (isAdmin) {
    prefetch(trpc.access.list.queryOptions({ propertyId }));
  }

  return (
    <HydrateClient>
      <SetupPageContent isAdmin={isAdmin} propertyId={propertyId} />
    </HydrateClient>
  );
}
