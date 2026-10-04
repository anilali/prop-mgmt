import { Plus } from "lucide-react";

import { Button } from "@moonship/ui/button";
import { PageHeader } from "@moonship/ui/page-header";

export function EventsHeader() {
  return (
    <PageHeader
      title="Events"
      action={
        <Button type="button">
          <Plus className="size-4" />
          Create Event
        </Button>
      }
    />
  );
}
