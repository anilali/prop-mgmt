import { redirect } from "next/navigation";

import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { MembersPanel } from "../_components/members-panel";
import { requirePropertyContext } from "../_lib/require-operator-context";

export default async function AccessPage() {
  const { context, propertyId } = await requirePropertyContext();
  if (context.mode !== "property" || context.role !== "admin") {
    redirect("/setup");
  }
  prefetch(trpc.access.list.queryOptions({ propertyId }));

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <MembersPanel propertyId={propertyId} />
      </div>
    </HydrateClient>
  );
}
