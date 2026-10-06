import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requirePropertyContext } from "../_lib/require-operator-context";
import { HomePageContent } from "./_components/home-page-content";

export default async function HomePage() {
  const { context } = await requirePropertyContext();
  prefetch(trpc.home.comingUp.queryOptions());
  prefetch(trpc.rent.status.queryOptions());
  prefetch(trpc.rent.bankStatus.queryOptions());
  prefetch(trpc.transaction.listToSort.queryOptions());

  return (
    <HydrateClient>
      <HomePageContent propertyName={context.propertyName} />
    </HydrateClient>
  );
}
