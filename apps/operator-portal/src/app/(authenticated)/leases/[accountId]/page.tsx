import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requirePropertyContext } from "../../_lib/require-operator-context";
import { AccountPageContent } from "./_components/account-page-content";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  await requirePropertyContext();
  const { accountId } = await params;
  prefetch(trpc.account.get.queryOptions({ id: accountId }));
  prefetch(trpc.property.get.queryOptions());

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <AccountPageContent accountId={accountId} />
      </div>
    </HydrateClient>
  );
}
