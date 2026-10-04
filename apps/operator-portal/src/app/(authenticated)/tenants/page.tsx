import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requirePropertyContext } from "../_lib/require-operator-context";
import { TenantsPageContent } from "./_components/tenants-page-content";

export default async function TenantsPage() {
  await requirePropertyContext();
  prefetch(trpc.tenant.list.queryOptions());

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <TenantsPageContent />
      </div>
    </HydrateClient>
  );
}
