"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { PageHeader } from "@moonship/ui/page-header";

import { useTRPC } from "~/trpc/react";
import { MembersPanel } from "../../../../_components/members-panel";

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
    <div className="flex flex-col gap-6">
      <PageHeader title={property.name} />
      <MembersPanel propertyId={propertyId} />
    </div>
  );
}
