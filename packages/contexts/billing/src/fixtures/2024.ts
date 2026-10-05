import type { IsoDate } from "@moonship/shared";

import type { AccountTerms, LeaseTerms, Txn } from "../types";

export const PROPERTY_ID = "property-2024";
export const TRACKING_START: IsoDate = "2024-01-01";
export const LETTER_DATE: IsoDate = "2025-01-01";
export const TODAY: IsoDate = "2025-01-08";

export const POOLS = {
  cam: "pool-cam",
  taxes: "pool-taxes",
  insurance: "pool-insurance",
  water: "pool-water",
} as const;

export const UNITS = [
  { id: "unit-a", label: "A", sqft: 2500 },
  { id: "unit-b", label: "B", sqft: 2000 },
  { id: "unit-c", label: "C", sqft: 2350 },
  { id: "unit-d", label: "D", sqft: 1250 },
  { id: "unit-e", label: "E", sqft: 1250 },
] as const;

type PoolKey = keyof typeof POOLS;

function lease(props: {
  leaseId: string;
  startDate: IsoDate;
  endDate: IsoDate;
  moveOutDate?: IsoDate;
  insuranceExpiresOn?: IsoDate;
  rent: [IsoDate, number][];
  estimates: Partial<Record<PoolKey, number>>;
}): LeaseTerms {
  return {
    leaseId: props.leaseId,
    startDate: props.startDate,
    endDate: props.endDate,
    moveOutDate: props.moveOutDate ?? null,
    lateFee: null,
    insuranceExpiresOn: props.insuranceExpiresOn ?? null,
    rentSteps: props.rent.map(([startsOn, amountCents], index) => ({
      id: `${props.leaseId}-rent-${index}`,
      startsOn,
      amountCents,
      tenantNotifiedAt: null,
    })),
    estimateSteps: Object.entries(props.estimates).map(
      ([pool, amountCents]) => ({
        id: `${props.leaseId}-${pool}`,
        poolId: POOLS[pool as PoolKey],
        startsOn: props.startDate,
        amountCents,
      }),
    ),
  };
}

export const superLucky: AccountTerms = {
  accountId: "account-super-lucky",
  tenantId: "tenant-super-lucky",
  unitId: "unit-a",
  openingBalanceCents: 0,
  leases: [
    lease({
      leaseId: "lease-super-lucky",
      startDate: "2023-01-01",
      endDate: "2027-12-31",
      insuranceExpiresOn: "2024-11-30",
      rent: [["2023-01-01", 250_000]],
      estimates: { cam: 26_861, taxes: 77_761, insurance: 10_860 },
    }),
  ],
};

export const tenantD: AccountTerms = {
  accountId: "account-tenant-d",
  tenantId: "tenant-d",
  unitId: "unit-d",
  openingBalanceCents: 0,
  leases: [
    lease({
      leaseId: "lease-tenant-d",
      startDate: "2022-09-01",
      endDate: "2025-08-31",
      moveOutDate: "2024-08-15",
      rent: [["2022-09-01", 160_000]],
      estimates: { cam: 13_000, taxes: 37_500, insurance: 5_500 },
    }),
  ],
};

export const tenantB: AccountTerms = {
  accountId: "account-tenant-b",
  tenantId: "tenant-b",
  unitId: "unit-b",
  openingBalanceCents: 25_000,
  leases: [
    lease({
      leaseId: "lease-b1",
      startDate: "2021-06-01",
      endDate: "2024-05-31",
      rent: [["2021-06-01", 300_000]],
      estimates: {
        cam: 22_000,
        taxes: 61_000,
        insurance: 9_000,
        water: 15_000,
      },
    }),
    lease({
      leaseId: "lease-b2",
      startDate: "2024-06-01",
      endDate: "2029-05-31",
      insuranceExpiresOn: "2025-06-30",
      rent: [
        ["2024-06-01", 315_000],
        ["2025-06-01", 324_450],
      ],
      estimates: {
        cam: 23_000,
        taxes: 64_000,
        insurance: 9_500,
        water: 16_000,
      },
    }),
  ],
};

export const ACCOUNTS: AccountTerms[] = [superLucky, tenantB, tenantD];

function payment(
  accountId: string,
  postedOn: IsoDate,
  amountCents: number,
  description: string,
): Txn {
  return {
    id: `txn-${accountId}-${postedOn}`,
    propertyId: PROPERTY_ID,
    source: "bank",
    importBatchId: "batch-2024",
    postedOn,
    description,
    descriptionKey: description.toLowerCase(),
    amountCents,
    externalId: null,
    lines: [{ accountId, categoryId: null, amountCents }],
  };
}

function monthly(
  accountId: string,
  months: number,
  amountFor: (month: number) => number,
  description: string,
): Txn[] {
  return Array.from({ length: months }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return payment(
      accountId,
      `2024-${month}-01`,
      amountFor(index + 1),
      description,
    );
  });
}

export const TRANSACTIONS: Txn[] = [
  ...monthly(
    superLucky.accountId,
    12,
    (month) => (month === 12 ? 324_108 : 365_482),
    "ACH DEP SUPER-LUCKY LLC",
  ),
  ...monthly(tenantD.accountId, 8, () => 216_000, "WIRE IN TENANT D"),
  ...monthly(
    tenantB.accountId,
    12,
    (month) => (month <= 5 ? 407_000 : 427_500),
    "CHECK TENANT B",
  ),
];
