import { redirect } from "next/navigation";

import { AppShell } from "~/app/_components/app-shell";
import { getRequestAccess } from "~/request-access";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getRequestAccess();
  if (!access) {
    redirect("/");
  }
  if (access.context.mode === "no-access") {
    redirect("/no-access");
  }

  if (access.context.mode === "property") {
    prefetch(trpc.rent.bankStatus.queryOptions());
    prefetch(trpc.rent.status.queryOptions());
    prefetch(trpc.transaction.listToSort.queryOptions());
    prefetch(trpc.unit.list.queryOptions());
  }

  return (
    <HydrateClient>
      <AppShell
        context={access.context}
        operableProperties={access.operableProperties}
        isPlatformAdmin={access.isPlatformAdmin}
        userName={access.operator.name}
      >
        {children}
      </AppShell>
    </HydrateClient>
  );
}
