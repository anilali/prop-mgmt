import { comingUp, toSortCount } from "@moonship/billing";

import type { RentDataDeps } from "../rent-data";
import { toAccountTerms } from "../accounts";
import { loadRentData, rentStatusRows } from "../rent-data";
import { propertyProcedure, router } from "../trpc";

export type HomeRouterDeps = RentDataDeps;

export function homeRouter(deps: HomeRouterDeps) {
  return router({
    comingUp: propertyProcedure.query(async ({ ctx }) => {
      const data = await loadRentData(deps, ctx.propertyId);
      const accounts = new Map(
        data.views.map((view) => {
          const { tenant, unit } = data.accountOf(view);
          return [view.id, { tenant, unit }];
        }),
      );
      function named<T extends { accountId: string }>(items: T[]) {
        return items.map((item) => {
          const account = accounts.get(item.accountId);
          return {
            ...item,
            tenant: account?.tenant ?? { id: "", businessName: "" },
            unit: account?.unit ?? { id: "", label: "" },
          };
        });
      }
      const lists = comingUp(data.views.map(toAccountTerms), data.today);
      return {
        today: data.today,
        trackingStart: data.property.trackingStartDate,
        behind: rentStatusRows(data).filter((row) => row.status === "behind"),
        toSortCount: toSortCount(data.transactions),
        rentChanges: named(lists.rentChanges),
        insurance: named(lists.insurance),
        leasesEnding: named(lists.leasesEnding),
        pastEndDate: named(lists.pastEndDate),
      };
    }),
  });
}
