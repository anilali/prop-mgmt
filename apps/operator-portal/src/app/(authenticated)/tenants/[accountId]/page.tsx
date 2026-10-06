import { notFound } from "next/navigation";
import { z } from "zod";

import {
  getQueryClient,
  HydrateClient,
  orNotFound,
  prefetch,
  trpc,
} from "~/trpc/server";
import { requirePropertyContext } from "../../_lib/require-operator-context";
import { AccountPageContent } from "./_components/account-page-content";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  await requirePropertyContext();
  const { accountId } = await params;
  if (!z.string().uuid().safeParse(accountId).success) notFound();
  const queryClient = getQueryClient();
  await orNotFound(
    Promise.all([
      queryClient.fetchQuery(trpc.account.get.queryOptions({ id: accountId })),
      queryClient.fetchQuery(trpc.rent.history.queryOptions({ accountId })),
    ]),
  );
  prefetch(trpc.property.get.queryOptions());
  prefetch(trpc.document.list.queryOptions({ accountId }));
  prefetch(trpc.tenant.list.queryOptions());
  prefetch(trpc.pool.list.queryOptions());
  prefetch(trpc.account.list.queryOptions());
  prefetch(trpc.category.list.queryOptions({ includeArchived: true }));

  return (
    <HydrateClient>
      <AccountPageContent accountId={accountId} />
    </HydrateClient>
  );
}
