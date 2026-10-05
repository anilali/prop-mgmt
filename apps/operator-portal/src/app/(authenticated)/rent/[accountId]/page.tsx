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
import { HistoryPageContent } from "./_components/history-page-content";

export default async function RentHistoryPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  await requirePropertyContext();
  const { accountId } = await params;
  if (!z.string().uuid().safeParse(accountId).success) notFound();
  await orNotFound(
    getQueryClient().fetchQuery(trpc.rent.history.queryOptions({ accountId })),
  );
  prefetch(trpc.account.list.queryOptions());
  prefetch(trpc.category.list.queryOptions({ includeArchived: true }));

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <HistoryPageContent accountId={accountId} />
      </div>
    </HydrateClient>
  );
}
