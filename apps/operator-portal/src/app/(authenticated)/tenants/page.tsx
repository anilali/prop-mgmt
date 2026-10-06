import { getQueryClient, HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requirePropertyContext } from "../_lib/require-operator-context";
import { TenantsPageContent } from "./_components/tenants-page-content";
import { accountsNeedingHistory } from "./_lib/tenant-rows";

export default async function TenantsPage() {
  await requirePropertyContext();
  const queryClient = getQueryClient();
  const [status, accounts] = await Promise.all([
    queryClient.fetchQuery(trpc.rent.status.queryOptions()),
    queryClient.fetchQuery(trpc.account.list.queryOptions()),
  ]);
  for (const accountId of accountsNeedingHistory(status, accounts)) {
    prefetch(trpc.rent.history.queryOptions({ accountId }));
  }
  prefetch(trpc.tenant.list.queryOptions());
  prefetch(trpc.pool.list.queryOptions());
  prefetch(trpc.reconciliation.listYears.queryOptions());

  return (
    <HydrateClient>
      <TenantsPageContent />
    </HydrateClient>
  );
}
