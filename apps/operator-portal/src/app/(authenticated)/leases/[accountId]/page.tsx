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
  await orNotFound(
    getQueryClient().fetchQuery(
      trpc.account.get.queryOptions({ id: accountId }),
    ),
  );
  prefetch(trpc.property.get.queryOptions());
  prefetch(trpc.document.list.queryOptions({ accountId }));

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <AccountPageContent accountId={accountId} />
      </div>
    </HydrateClient>
  );
}
