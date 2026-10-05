import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requirePropertyContext } from "../_lib/require-operator-context";
import { HomePageContent } from "./_components/home-page-content";

export default async function HomePage() {
  await requirePropertyContext();
  prefetch(trpc.home.comingUp.queryOptions());

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <HomePageContent />
      </div>
    </HydrateClient>
  );
}
