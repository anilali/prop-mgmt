"use client";

import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import { PageTopBar } from "../../../_components/page-top-bar";
import { ImportFlow } from "./import-flow";

export function ImportPageContent() {
  const trpc = useTRPC();
  const { data: property } = useSuspenseQuery(trpc.property.get.queryOptions());

  return (
    <>
      <PageTopBar
        crumbs={[
          { label: "Transactions", href: "/transactions" },
          { label: "Import bank file" },
        ]}
      />
      <div className="nav:px-6 nav:pt-[22px] nav:pb-12 max-w-[1180px] px-4 pt-[18px] pb-10">
        {property.trackingStartDate === null ? (
          <p className="border-line-2 text-fg-2 rounded-[10px] border border-dashed p-6 text-[12.5px]">
            Set the tracking start date in{" "}
            <Link
              className="text-primary font-medium hover:underline"
              href="/setup"
            >
              Setup
            </Link>{" "}
            before importing.
          </p>
        ) : (
          <ImportFlow />
        )}
      </div>
    </>
  );
}
