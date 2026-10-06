import type {
  AccountLedger,
  AccountState,
  BillingQueries,
} from "@moonship/billing";
import type { AccountQueries, AccountView } from "@moonship/lease-mgmt";
import type { PropertyQueries, UnitQueries } from "@moonship/property";
import type { IsoDate } from "@moonship/shared";
import type { TenantQueries } from "@moonship/tenant-mgmt";
import {
  accountBalance,
  accountEnd,
  accountEntries,
  accountPayments,
  accountStart,
  accountState,
  compareRentStatus,
  lateFeeSuggestions,
  monthCells,
  newestBankDate,
  pastDueCents,
  rentStatus,
  suggestedPaymentMonths,
} from "@moonship/billing";

import { toAccountTerms } from "./accounts";
import { loadProperty } from "./property-context";

export interface RentDataDeps {
  billingQueries: BillingQueries;
  accountQueries: AccountQueries;
  tenantQueries: TenantQueries;
  unitQueries: UnitQueries;
  propertyQueries: PropertyQueries;
}

export interface RentAccount {
  id: string;
  tenant: { id: string; businessName: string };
  unit: { id: string; label: string };
  state: AccountState;
  openingBalanceCents: number;
  startDate: IsoDate;
  endDate: IsoDate | null;
}

export type RentData = Awaited<ReturnType<typeof loadRentData>>;

export async function loadRentData(deps: RentDataDeps, propertyId: string) {
  const [{ property, today }, views, tenants, units, transactions, entries] =
    await Promise.all([
      loadProperty(deps.propertyQueries, propertyId),
      deps.accountQueries.list(propertyId),
      deps.tenantQueries.list(propertyId),
      deps.unitQueries.list(propertyId),
      deps.billingQueries.listTransactions(propertyId),
      deps.billingQueries.listLedgerEntries(propertyId),
    ]);

  function accountOf(view: AccountView): RentAccount {
    const terms = toAccountTerms(view);
    const tenant = tenants.find((t) => t.id === view.tenantId);
    const unit = units.find((u) => u.id === view.unitId);
    return {
      id: view.id,
      tenant: { id: view.tenantId, businessName: tenant?.businessName ?? "" },
      unit: { id: view.unitId, label: unit?.label ?? "" },
      state: accountState(terms, today),
      openingBalanceCents: view.openingBalanceCents,
      startDate: accountStart(terms),
      endDate: accountEnd(terms),
    };
  }

  function ledgerOf(view: AccountView): AccountLedger {
    return {
      account: toAccountTerms(view),
      trackingStart: property.trackingStartDate,
      payments: accountPayments(transactions, view.id),
      entries: accountEntries(entries, view.id),
    };
  }

  const pendingMonths = suggestedPaymentMonths(
    transactions,
    views.map(toAccountTerms),
    property.trackingStartDate,
  );

  return {
    property,
    today,
    views,
    transactions,
    newestBankDate: newestBankDate(transactions),
    pendingMonths,
    accountOf,
    ledgerOf,
  };
}

export function rentSummary(data: RentData, view: AccountView) {
  const ledger = data.ledgerOf(view);
  return {
    ...accountBalance(ledger, data.today),
    pastDueCents: pastDueCents(ledger, data.today),
    status: rentStatus(ledger, data.today, data.newestBankDate),
    suggestions: lateFeeSuggestions(ledger, data.today, data.newestBankDate),
    months: monthCells(
      ledger,
      data.today,
      data.newestBankDate,
      data.pendingMonths.get(view.id) ?? new Set(),
    ),
  };
}

export function rentStatusRows(data: RentData) {
  return data.views
    .map((view) => {
      const account = data.accountOf(view);
      return {
        accountId: account.id,
        tenant: account.tenant,
        unit: account.unit,
        state: account.state,
        ...rentSummary(data, view),
      };
    })
    .filter(
      (row) =>
        row.state === "open" ||
        row.state === "holdover" ||
        row.balanceCents !== 0 ||
        row.suggestions.length > 0,
    )
    .sort(
      (a, b) =>
        compareRentStatus(a, b) ||
        a.unit.label.localeCompare(b.unit.label, undefined, {
          numeric: true,
        }),
    );
}
