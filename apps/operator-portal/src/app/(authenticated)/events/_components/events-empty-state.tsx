import { CalendarDays } from "lucide-react";

import { EmptyState } from "@moonship/ui/empty-state";

export function EventsEmptyState() {
  return (
    <EmptyState
      icon={<CalendarDays className="size-5" />}
      headline="No Events"
      description="Nothing scheduled yet. New inspections, viewings, and reminders will appear here."
      className="min-h-80 flex-1 rounded-lg border border-dashed py-16"
    />
  );
}
