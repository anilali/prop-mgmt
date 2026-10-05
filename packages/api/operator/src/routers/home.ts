import { comingUp, lateFeeSuggestions, toSortCount } from "@moonship/billing";

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
          return [view.id, { tenant, unit, version: view.version }];
        }),
      );
      function named<T extends { accountId: string }>(items: T[]) {
        return items.map((item) => {
          const account = accounts.get(item.accountId);
          return {
            ...item,
            tenant: account?.tenant ?? { id: "", businessName: "" },
            unit: account?.unit ?? { id: "", label: "" },
            accountVersion: account?.version ?? 0,
          };
        });
      }
      const lists = comingUp(data.views.map(toAccountTerms), data.today);
      const lateFees = data.views
        .map((view) => {
          const { id, tenant, unit } = data.accountOf(view);
          return {
            accountId: id,
            tenant,
            unit,
            suggestions: lateFeeSuggestions(data.ledgerOf(view), data.today),
          };
        })
        .filter((item) => item.suggestions.length > 0)
        .sort((a, b) =>
          a.unit.label.localeCompare(b.unit.label, undefined, {
            numeric: true,
          }),
        );
      return {
        today: data.today,
        timeZone: data.property.timeZone,
        trackingStart: data.property.trackingStartDate,
        behind: rentStatusRows(data).filter((row) => row.status === "behind"),
        lateFees,
        toSortCount: toSortCount(data.transactions),
        rentChanges: named(lists.rentChanges),
        insurance: named(lists.insurance),
        leasesEnding: named(lists.leasesEnding),
        pastEndDate: named(lists.pastEndDate),
      };
    }),
  });
}
