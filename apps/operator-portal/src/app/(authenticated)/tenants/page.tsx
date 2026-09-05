import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requireActiveStaff } from "../_lib/require-active-staff";
import { TenantsPageContent } from "./_components/tenants-page-content";

export default async function TenantsPage() {
  await requireActiveStaff();
  prefetch(trpc.tenant.list.queryOptions());

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
          <p className="text-muted-foreground text-sm">
            Operator CRM records (portal invite later).
          </p>
        </div>
        <TenantsPageContent />
      </div>
    </HydrateClient>
  );
}
