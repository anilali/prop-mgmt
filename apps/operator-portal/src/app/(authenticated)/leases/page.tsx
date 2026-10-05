import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requirePropertyContext } from "../_lib/require-operator-context";
import { AccountsPageContent } from "./_components/accounts-page-content";

export default async function LeasesPage() {
  await requirePropertyContext();
  prefetch(trpc.account.list.queryOptions());
  prefetch(trpc.tenant.list.queryOptions());
  prefetch(trpc.unit.list.queryOptions());
  prefetch(trpc.pool.list.queryOptions());
  prefetch(trpc.property.get.queryOptions());

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <AccountsPageContent />
      </div>
    </HydrateClient>
  );
}
