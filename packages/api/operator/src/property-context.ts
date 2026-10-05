import type { PropertyQueries, PropertyView } from "@moonship/property";
import type { IsoDate } from "@moonship/shared";

import { notFound } from "./errors";
import { today } from "./today";

export async function loadProperty(
  propertyQueries: PropertyQueries,
  propertyId: string,
): Promise<{ property: PropertyView; today: IsoDate }> {
  const property = await propertyQueries.getById(propertyId);
  if (!property) throw notFound("Property not found");
  return { property, today: today(property) };
}
