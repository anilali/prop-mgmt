import type { PropertyProps } from "@moonship/property";

import type { properties } from "../../schemas/property/schema";

export function toPropertyProps(
  row: typeof properties.$inferSelect,
): PropertyProps {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    trackingStartDate: row.trackingStartDate,
    timeZone: row.timeZone,
    letter: {
      ownerName: row.ownerName,
      ownerTitle: row.ownerTitle,
      companyName: row.companyName,
      ownerPhone: row.ownerPhone,
      ownerEmail: row.ownerEmail,
    },
  };
}
