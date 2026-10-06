import { LoaderCircle } from "lucide-react";

import { PageTopBar } from "./_components/page-top-bar";

export default function AuthenticatedLoading() {
  return (
    <div className="flex h-full flex-col">
      <PageTopBar crumbs={[]} />
      <div className="text-fg-3 flex flex-1 items-center justify-center gap-2 p-6 text-[12.5px]">
        <LoaderCircle className="size-3.5 animate-spin" />
        Loading
      </div>
    </div>
  );
}
