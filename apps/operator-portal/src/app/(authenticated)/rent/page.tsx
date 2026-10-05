import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { requirePropertyContext } from "../_lib/require-operator-context";
import { RentPageContent } from "./_components/rent-page-content";

export default async function RentPage() {
  await requirePropertyContext();
  prefetch(trpc.rent.status.queryOptions());

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6 p-6">
        <RentPageContent />
      </div>
    </HydrateClient>
  );
}
