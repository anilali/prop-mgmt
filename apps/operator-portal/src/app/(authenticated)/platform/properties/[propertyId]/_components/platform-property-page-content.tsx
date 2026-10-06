"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import { MembersPanel } from "../../../../_components/members-panel";
import { PageTopBar } from "../../../../_components/page-top-bar";
import { formatStreet } from "../../../../setup/_components/address-fields";

export function PlatformPropertyPageContent({
  propertyId,
}: {
  propertyId: string;
}) {
  const trpc = useTRPC();
  const { data: property } = useSuspenseQuery(
    trpc.property.getForPlatform.queryOptions({ propertyId }),
  );

  return (
    <>
      <PageTopBar
        crumbs={[
          { label: "Properties", href: "/platform/properties" },
          { label: property.name },
        ]}
      />
      <div className="nav:px-6 nav:pt-[22px] nav:pb-12 flex max-w-[1180px] flex-col gap-5 px-4 pt-[18px] pb-10">
        <div className="animate-rise">
          <h1 className="text-[20px] font-semibold tracking-[-0.015em]">
            {property.name}
          </h1>
          <p className="text-fg-3 text-[12.5px]">
            {formatStreet(property.address)}, {property.address.city},{" "}
            {property.address.state} {property.address.postalCode}
          </p>
        </div>
        <section className="flex flex-col gap-2.5">
          <h2 className="label-caps text-fg-3">People</h2>
          <MembersPanel propertyId={propertyId} />
        </section>
      </div>
    </>
  );
}
