import type { Address, IsoDate } from "@moonship/shared";

import type {
  ReconciliationInput,
  ReconciliationLetterDetails,
  ReconciliationTenant,
  ReconciliationUnit,
} from "../reconciliation";
import type { AccountTerms, Category, LeaseTerms, Pool, Txn } from "../types";

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

export const PROPERTY_NAME = "Lucky Plaza";

export const LETTER: ReconciliationLetterDetails = {
  ownerName: "Pat Owner",
  ownerTitle: "Managing Member",
  companyName: "Lucky Plaza LLC",
  ownerPhone: "(555) 010-2000",
  ownerEmail: "owner@example.com",
};

function address(street1: string, street2?: string): Address {
  return {
    street1,
    ...(street2 ? { street2 } : {}),
    city: "Springfield",
    state: "IL",
    postalCode: "62701",
    country: "US",
  };
}

export const RECONCILIATION_UNITS: ReconciliationUnit[] = UNITS.map((unit) => ({
  id: unit.id,
  label: unit.label,
  sqft: unit.sqft,
  sqftChangedOn: null,
  address: address("1200 Main St", `Suite ${unit.label}`),
}));

const ALL_UNIT_IDS = UNITS.map((unit) => unit.id);

export const POOL_LIST: Pool[] = [
  { id: POOLS.cam, name: "CAM", letterName: "CAM", unitIds: ALL_UNIT_IDS },
  { id: POOLS.taxes, name: "Taxes", letterName: "tax", unitIds: ALL_UNIT_IDS },
  {
    id: POOLS.insurance,
    name: "Insurance",
    letterName: "insurance",
    unitIds: ALL_UNIT_IDS,
  },
  {
    id: POOLS.water,
    name: "Water",
    letterName: "water",
    unitIds: ["unit-b", "unit-c"],
  },
].map((pool, index) => ({
  ...pool,
  propertyId: PROPERTY_ID,
  addsNewUnits: pool.id !== POOLS.water,
  sortOrder: index,
  membersChangedOn: null,
}));

export const CATEGORY_IDS = {
  cam: "category-cam",
  taxes: "category-taxes",
  insurance: "category-insurance",
  water: "category-water",
  repairs: "category-repairs",
} as const;

export const CATEGORIES: Category[] = [
  ...(Object.keys(POOLS) as PoolKey[]).map((key) => ({
    id: CATEGORY_IDS[key],
    propertyId: PROPERTY_ID,
    name: POOL_LIST.find((pool) => pool.id === POOLS[key])?.name ?? key,
    kind: "shared_cost" as const,
    poolId: POOLS[key],
    archivedAt: null,
  })),
  {
    id: CATEGORY_IDS.repairs,
    propertyId: PROPERTY_ID,
    name: "Repairs",
    kind: "owner_expense",
    poolId: null,
    archivedAt: null,
  },
];

function expense(
  id: string,
  postedOn: IsoDate,
  amountCents: number,
  categoryId: string,
  description: string,
): Txn {
  return {
    id,
    propertyId: PROPERTY_ID,
    source: "bank",
    importBatchId: "batch-2024",
    postedOn,
    description,
    descriptionKey: description.toLowerCase(),
    amountCents,
    externalId: null,
    lines: [{ accountId: null, categoryId, amountCents }],
  };
}

export const EXPENSES: Txn[] = [
  expense("cam-1", "2024-03-15", -1_000_000, CATEGORY_IDS.cam, "LANDSCAPE CO"),
  expense("cam-2", "2024-09-20", -314_119, CATEGORY_IDS.cam, "PARKING LOT"),
  expense("cam-refund", "2024-10-02", 25_000, CATEGORY_IDS.cam, "REFUND"),
  expense("cam-2025", "2025-01-03", -40_000, CATEGORY_IDS.cam, "SNOW 2025"),
  expense("tax-1", "2024-01-31", -1_677_115, CATEGORY_IDS.taxes, "COUNTY TAX"),
  expense("tax-2", "2024-06-30", -1_677_116, CATEGORY_IDS.taxes, "COUNTY TAX"),
  expense("ins-1", "2024-02-01", -628_400, CATEGORY_IDS.insurance, "INSURER"),
  expense("water-1", "2024-05-05", -100_000, CATEGORY_IDS.water, "WATER"),
  expense("water-2", "2024-11-05", -87_917, CATEGORY_IDS.water, "WATER"),
  expense("repair-1", "2024-07-07", -50_000, CATEGORY_IDS.repairs, "PLUMBER"),
];

export const TENANTS: ReconciliationTenant[] = [
  {
    id: superLucky.tenantId,
    businessName: "Super Lucky LLC",
    mailingAddress: address("PO Box 88"),
  },
  {
    id: tenantB.tenantId,
    businessName: "Tenant B Inc",
    mailingAddress: address("45 Oak Ave", "Floor 2"),
  },
  {
    id: tenantD.tenantId,
    businessName: "Tenant D Co",
    mailingAddress: address("9 Elm St"),
  },
];

export function reconciliationInput(
  overrides: Partial<ReconciliationInput> = {},
): ReconciliationInput {
  return {
    year: 2024,
    today: TODAY,
    trackingStart: TRACKING_START,
    propertyName: PROPERTY_NAME,
    letter: LETTER,
    record: {
      id: "year-2024",
      propertyId: PROPERTY_ID,
      year: 2024,
      status: "draft",
      letterDate: LETTER_DATE,
      finalizedAt: null,
    },
    units: RECONCILIATION_UNITS,
    tenants: TENANTS,
    accounts: ACCOUNTS,
    pools: POOL_LIST,
    categories: CATEGORIES,
    transactions: [...TRANSACTIONS, ...EXPENSES],
    entries: [],
    overrides: [],
    finalizedYears: [],
    ...overrides,
  };
}
