import Link from "next/link";
import { SearchX } from "lucide-react";

import { Button } from "@moonship/ui/button";
import { EmptyState } from "@moonship/ui/empty-state";

export default function AuthenticatedNotFound() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <EmptyState
        icon={<SearchX className="size-5" />}
        headline="Not found"
        description="This page does not exist, or what it shows was removed."
        action={
          <Button type="button" asChild>
            <Link href="/home">Go to Home</Link>
          </Button>
        }
        className="rounded-lg border border-dashed py-16"
      />
    </div>
  );
}
