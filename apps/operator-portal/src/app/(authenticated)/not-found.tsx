import Link from "next/link";
import { SearchX } from "lucide-react";

import { Button } from "@moonship/ui/button";
import { EmptyState } from "@moonship/ui/empty-state";

import { PageTopBar } from "./_components/page-top-bar";

export default function AuthenticatedNotFound() {
  return (
    <>
      <PageTopBar crumbs={[{ label: "Not found" }]} />
      <div className="nav:px-6 nav:py-[22px] px-4 py-[18px]">
        <EmptyState
          icon={<SearchX className="size-5" />}
          headline="Not found"
          description="This page does not exist, or what it shows was removed."
          action={
            <Button type="button" variant="outline" asChild>
              <Link href="/home">Go to Home</Link>
            </Button>
          }
        />
      </div>
    </>
  );
}
