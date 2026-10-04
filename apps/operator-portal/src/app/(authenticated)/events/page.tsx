import { requireOperatorContext } from "../_lib/require-operator-context";
import { EventsEmptyState } from "./_components/events-empty-state";
import { EventsHeader } from "./_components/events-header";
import { EventsToolbar } from "./_components/events-toolbar";

export default async function EventsPage() {
  await requireOperatorContext();

  return (
    <div className="flex flex-col gap-6 p-6">
      <EventsHeader />
      <EventsToolbar />
      <EventsEmptyState />
    </div>
  );
}
