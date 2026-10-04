import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requirePlatformContext } from "../../../_lib/require-operator-context";
import { PlatformPropertyPageContent } from "./_components/platform-property-page-content";

export default async function PlatformPropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  await requirePlatformContext();
  const { propertyId } = await params;
  prefetch(trpc.property.getForPlatform.queryOptions({ propertyId }));
  prefetch(trpc.access.list.queryOptions({ propertyId }));

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <PlatformPropertyPageContent propertyId={propertyId} />
      </div>
    </HydrateClient>
  );
}
