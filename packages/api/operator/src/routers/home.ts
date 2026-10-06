import {
  comingUp,
  lateFeeSuggestions,
  monthCells,
  toSortCount,
} from "@moonship/billing";

import type { RentDataDeps } from "../rent-data";
import { toAccountTerms } from "../accounts";
import { loadRentData } from "../rent-data";
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
            suggestions: lateFeeSuggestions(
              data.ledgerOf(view),
              data.today,
              data.newestBankDate,
            ),
          };
        })
        .filter((item) => item.suggestions.length > 0)
        .sort((a, b) =>
          a.unit.label.localeCompare(b.unit.label, undefined, {
            numeric: true,
          }),
        );
      const cells = data.views.map((view) =>
        monthCells(
          data.ledgerOf(view),
          data.today,
          data.newestBankDate,
          data.pendingMonths.get(view.id) ?? new Set(),
        ),
      );
      const rentMonths = Array.from({ length: 12 }, (_, index) => {
        const month = cells
          .map((row) => row[index])
          .filter((cell) => cell !== undefined);
        return {
          month: index + 1,
          expectedCents: month.reduce(
            (sum, cell) => sum + cell.expectedCents,
            0,
          ),
          paidCents: month.reduce((sum, cell) => sum + cell.paidCents, 0),
          nodata: month.some((cell) => cell.state === "nodata"),
        };
      });
      return {
        today: data.today,
        timeZone: data.property.timeZone,
        trackingStart: data.property.trackingStartDate,
        lateFees,
        accountCount: data.views.length,
        rentMonths,
        toSortCount: toSortCount(data.transactions),
        rentChanges: named(lists.rentChanges),
        insurance: named(lists.insurance),
        leasesEnding: named(lists.leasesEnding),
        pastEndDate: named(lists.pastEndDate),
      };
    }),
  });
}
