"use client";

import { Separator } from "@moonship/ui/separator";

import { CategoriesSection } from "./categories-section";
import { PoolsSection } from "./pools-section";
import { PropertyDetailsForm } from "./property-details-form";
import { UnitsSection } from "./units-section";

export function SetupPageContent() {
  return (
    <div className="space-y-8">
      <PropertyDetailsForm />
      <Separator />
      <UnitsSection />
      <Separator />
      <PoolsSection />
      <Separator />
      <CategoriesSection />
    </div>
  );
}
