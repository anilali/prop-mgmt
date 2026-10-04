import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requirePlatformContext } from "../../_lib/require-operator-context";
import { PropertiesPageContent } from "./_components/properties-page-content";

export default async function PlatformPropertiesPage() {
  await requirePlatformContext();
  prefetch(trpc.property.list.queryOptions());

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <PropertiesPageContent />
      </div>
    </HydrateClient>
  );
}
