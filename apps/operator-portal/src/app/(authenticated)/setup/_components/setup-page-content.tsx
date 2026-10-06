"use client";

import { useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@moonship/ui/tabs";

import { MembersPanel } from "../../_components/members-panel";
import { PageTopBar } from "../../_components/page-top-bar";
import { CategoriesSection } from "./categories-section";
import { PropertyDetailsForm } from "./property-details-form";
import { UnitsSection } from "./units-section";

const SETUP_TABS = [
  { value: "property", label: "Property and letters", adminOnly: false },
  { value: "units", label: "Units and pools", adminOnly: false },
  { value: "categories", label: "Categories", adminOnly: false },
  { value: "people", label: "People", adminOnly: true },
] as const;

type SetupTab = (typeof SETUP_TABS)[number]["value"];

function toSetupTab(value: string | null, isAdmin: boolean): SetupTab {
  const match = SETUP_TABS.find((tab) => tab.value === value);
  if (!match || (match.adminOnly && !isAdmin)) return "property";
  return match.value;
}

export function SetupPageContent({
  isAdmin,
  propertyId,
}: {
  isAdmin: boolean;
  propertyId: string;
}) {
  const searchParams = useSearchParams();
  const tab = toSetupTab(searchParams.get("tab"), isAdmin);
  const tabs = SETUP_TABS.filter((option) => isAdmin || !option.adminOnly);

  return (
    <>
      <PageTopBar crumbs={[{ label: "Setup" }]} />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          window.history.replaceState(
            null,
            "",
            `?tab=${toSetupTab(value, isAdmin)}`,
          );
        }}
        className="gap-0"
      >
        <TabsList className="nav:px-[18px] px-2.5">
          {tabs.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="nav:px-6 nav:pt-[22px] nav:pb-12 max-w-[1180px] px-4 pt-[18px] pb-10">
          <TabsContent value="property">
            <PropertyDetailsForm />
          </TabsContent>
          <TabsContent value="units">
            <UnitsSection />
          </TabsContent>
          <TabsContent value="categories">
            <CategoriesSection />
          </TabsContent>
          {isAdmin ? (
            <TabsContent value="people">
              <MembersPanel propertyId={propertyId} />
            </TabsContent>
          ) : null}
        </div>
      </Tabs>
    </>
  );
}
