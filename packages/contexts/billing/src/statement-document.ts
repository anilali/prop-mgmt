import type { Address, IsoDate } from "@moonship/shared";
import { formatCents, prorate } from "@moonship/shared";

export interface StatementRowData {
  poolId: string;
  name: string;
  poolSqft: number;
  actualCents: number;
  billOverride: { amountCents: number; note: string } | null;
  months: number;
  partCents: number;
  estimatesCents: number;
  balanceCents: number;
}

export interface RentIncrease {
  effectiveOn: IsoDate;
  fromCents: number;
  toCents: number;
  newMonthlyRentCents: number;
}

export interface StatementData {
  year: number;
  letterDate: IsoDate;
  property: { name: string };
  owner: {
    name: string;
    title: string;
    company: string;
    phone: string;
    email: string;
  };
  tenant: { businessName: string; mailingAddress: Address };
  unit: { label: string; address: Address; sqft: number };
  buildingSqft: number;
  otherPoolAreas: { name: string; sqft: number }[];
  rows: StatementRowData[];
  trueUpCents: number;
  priorBalanceCents: number;
  priorBalanceAsOf: IsoDate;
  balanceOnAccountCents: number;
  continuing: {
    effectiveDate: IsoDate;
    baseRentCents: number;
    fixedCharges: { name: string; amountCents: number }[];
    newEstimates: {
      poolId: string;
      name: string;
      letterName: string;
      amountCents: number;
    }[];
    newMonthlyRentCents: number;
    rentIncreases?: RentIncrease[];
    insuranceRequest: boolean;
  } | null;
}

export interface TextRun {
  text: string;
  bold: boolean;
}

export type Paragraph = TextRun[];

export interface LetterDocument {
  date: string;
  recipient: string[];
  re: string[];
  paragraphs: Paragraph[];
  closing: string;
  signature: string[];
}

export interface StatementArea {
  label: string;
  value: string;
  unit: string;
}

export interface StatementCostLine {
  name: string;
  actual: string;
  perYear: string;
  perMonth: string;
  billNote: string | null;
}

export interface StatementTable {
  columns: string[];
  tenantLines: string[];
  rows: string[][];
  total: string;
}

export type StatementRentLineStyle = "line" | "total" | "boxed";

export interface StatementRentLine {
  label: string;
  value: string;
  style: StatementRentLineStyle;
}

export interface StatementRentBlock {
  heading: string | null;
  effective: string | null;
  lines: StatementRentLine[];
}

export interface StatementDocument {
  title: string;
  areas: StatementArea[];
  actualsHeading: string;
  costLines: StatementCostLine[];
  reconciliationHeading: string;
  table: StatementTable;
  rentBlock: StatementRentBlock;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function longDate(date: IsoDate): string {
  const [year, month, day] = date.split("-").map(Number);
  const name = MONTH_NAMES[(month ?? 1) - 1] ?? "";
  return `${name} ${day}, ${year}`;
}

export function joinNames(names: readonly string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

export function formatSqft(sqft: number): string {
  return String(sqft).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatAccounting(cents: number): string {
  return cents < 0 ? `(${formatCents(-cents)})` : formatCents(cents);
}

export function formatPercentBps(bps: number): string {
  const sign = bps < 0 ? "-" : "";
  const abs = Math.abs(bps);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}%`;
}

export function formatHundredthsOfCent(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}$${Math.floor(abs / 10_000)}.${String(abs % 10_000).padStart(4, "0")}`;
}

export function costPerSqftYearCents(
  actualCents: number,
  poolSqft: number,
): number {
  return prorate(actualCents, [1], [poolSqft]);
}

export function costPerSqftMonthHundredths(
  actualCents: number,
  poolSqft: number,
): number {
  return prorate(actualCents, [100], [poolSqft, 12]);
}

export function shareBps(unitSqft: number, poolSqft: number): number {
  return prorate(unitSqft, [10_000], [poolSqft]);
}

function cityLine(address: Address): string {
  const stateZip = [address.state, address.postalCode]
    .filter((part) => part.trim() !== "")
    .join(" ");
  return [address.city, stateZip]
    .filter((part) => part.trim() !== "")
    .join(", ");
}

const DOMESTIC = new Set(["", "US", "USA", "UNITED STATES"]);

export function mailingLines(address: Address): string[] {
  return [
    address.street1,
    address.street2 ?? "",
    cityLine(address),
    DOMESTIC.has(address.country.trim().toUpperCase()) ? "" : address.country,
  ].filter((line) => line.trim() !== "");
}

export function streetWithSuite(address: Address): string {
  return [address.street1, address.street2 ?? ""]
    .filter((part) => part.trim() !== "")
    .join(", ");
}

export function nonBreaking(text: string): string {
  return text.trim().replace(/\s+/g, "\u00a0");
}

function plain(text: string): TextRun {
  return { text, bold: false };
}

function bold(text: string): TextRun {
  return { text, bold: true };
}

export function letterDocument(data: StatementData): LetterDocument {
  const year = data.year;
  const nextYear = year + 1;
  const paragraphs: Paragraph[] = [
    [
      plain(
        `In accordance with the lease for the above-referenced location, enclosed for your review and reimbursement is the ${year} expense reconciliation. Copies of tax and insurance receipts are also enclosed.`,
      ),
    ],
    data.trueUpCents < 0
      ? [
          plain(
            `Based upon the reconciliation, the balance of your pro rata share of the ${year} expenses for the center results in a credit of `,
          ),
          bold(formatCents(-data.trueUpCents)),
          plain(", which has been applied to your account."),
        ]
      : [
          plain(
            `Based upon the reconciliation, the balance of your pro rata share of the ${year} expenses for the center totals `,
          ),
          bold(formatCents(data.trueUpCents)),
          plain("."),
        ],
  ];
  if (data.continuing) {
    const names = joinNames(
      data.continuing.newEstimates.map((estimate) => estimate.letterName),
    );
    const chargesChange =
      names === ""
        ? ""
        : `The monthly charges for ${names} for the year ${nextYear} will change to reflect the ${year} actual expense. `;
    paragraphs.push([
      plain(
        `${chargesChange}Effective ${longDate(data.continuing.effectiveDate)}, the monthly rent will be changed to `,
      ),
      bold(formatCents(data.continuing.newMonthlyRentCents)),
      plain("."),
    ]);
    const increases = data.continuing.rentIncreases ?? [];
    if (increases.length > 0) {
      paragraphs.push(
        increases.flatMap((increase, index) => [
          plain(
            `${index === 0 ? "" : " "}Per your lease, your base rent will ${increase.toCents > increase.fromCents ? "increase" : "decrease"} from `,
          ),
          bold(formatCents(increase.fromCents)),
          plain(" to "),
          bold(formatCents(increase.toCents)),
          plain(" effective "),
          bold(longDate(increase.effectiveOn)),
          plain(
            `, making your total monthly rent ${formatCents(increase.newMonthlyRentCents)}.`,
          ),
        ]),
      );
    }
    if (data.continuing.insuranceRequest) {
      paragraphs.push([
        plain(
          `We don't have a copy of your insurance on file for the year ${nextYear}. Could you please send us a copy at your earliest convenience. The copy can be emailed to ${data.owner.email}.`,
        ),
      ]);
    }
  }
  paragraphs.push([
    ...(data.balanceOnAccountCents < 0
      ? [
          plain("The current balance on your account is a credit of "),
          bold(formatCents(-data.balanceOnAccountCents)),
        ]
      : [
          plain("The current balance on your account is "),
          bold(formatCents(data.balanceOnAccountCents)),
        ]),
    plain(
      `. If you have any questions, please call me at ${nonBreaking(data.owner.phone)}.`,
    ),
  ]);

  return {
    date: longDate(data.letterDate),
    recipient: [
      data.tenant.businessName,
      ...mailingLines(data.tenant.mailingAddress),
    ],
    re: [
      `${year} Expense Reconciliation`,
      data.tenant.businessName,
      streetWithSuite(data.unit.address),
      cityLine(data.unit.address),
    ].filter((line) => line.trim() !== ""),
    paragraphs,
    closing: "Sincerely,",
    signature: [data.owner.name, data.owner.title, data.owner.company].filter(
      (line) => line.trim() !== "",
    ),
  };
}

export function statementColumns(data: StatementData): string[] {
  const showMonths = data.rows.some((row) => row.months < 12);
  return [
    "SQ.FT LEASED",
    "",
    `${data.year} ACTUALS`,
    "TENANT'S PRO-RATA SHARE",
    ...(showMonths ? ["MONTHS"] : []),
    "TENANT'S ANNUAL SHARE",
    `ESTIMATES BILLED IN ${data.year}`,
    "BALANCE DUE",
  ];
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatNumberCents(cents: number): string {
  return formatCents(cents).replace("$", "");
}

export function statementDocument(data: StatementData): StatementDocument {
  const showMonths = data.rows.some((row) => row.months < 12);
  const unpaidLabel =
    data.priorBalanceAsOf < `${data.year}-12-31`
      ? `Unpaid Balance as of ${longDate(data.priorBalanceAsOf)}`
      : "Unpaid Balance";
  const balanceLines: StatementRentLine[] = [
    {
      label: unpaidLabel,
      value: formatCents(data.priorBalanceCents),
      style: "line",
    },
    {
      label: "Balance on Account",
      value: formatAccounting(data.balanceOnAccountCents),
      style: "boxed",
    },
  ];
  const continuing = data.continuing;

  return {
    title: `${data.year} Expense Reconciliation`,
    areas: [
      {
        label: "BUILDING NET RENTABLE AREA:",
        value: formatSqft(data.buildingSqft),
        unit: "Sq. Ft",
      },
      ...data.otherPoolAreas.map((area) => ({
        label: `${area.name.toUpperCase()} SERVICE AREA:`,
        value: formatSqft(area.sqft),
        unit: "Sq. Ft",
      })),
    ],
    actualsHeading: `${data.year} ACTUAL OPERATING EXPENSE`,
    costLines: data.rows.map((row) => ({
      name: `${row.name.toUpperCase()}:`,
      actual: `$ ${formatNumberCents(row.actualCents)}`,
      perYear: `${formatCents(costPerSqftYearCents(row.actualCents, row.poolSqft))} psf/year`,
      perMonth: `${formatHundredthsOfCent(costPerSqftMonthHundredths(row.actualCents, row.poolSqft))} psf/month`,
      billNote: row.billOverride
        ? `Bill amount: ${row.billOverride.note}`
        : null,
    })),
    reconciliationHeading: `${data.year} EXPENSE RECONCILIATION`,
    table: {
      columns: statementColumns(data),
      tenantLines: [
        data.tenant.businessName,
        streetWithSuite(data.unit.address),
        cityLine(data.unit.address),
      ].filter((line) => line.trim() !== ""),
      rows: data.rows.map((row, index) => [
        index === 0 ? formatSqft(data.unit.sqft) : "",
        row.name.toUpperCase(),
        formatCents(row.actualCents),
        formatPercentBps(shareBps(data.unit.sqft, row.poolSqft)),
        ...(showMonths ? [String(row.months)] : []),
        formatNumberCents(row.partCents),
        formatCents(row.estimatesCents),
        formatCents(row.balanceCents),
      ]),
      total: formatCents(data.trueUpCents),
    },
    rentBlock: continuing
      ? {
          heading: "REVISED MONTHLY RENT",
          effective: `(Effective ${longDate(continuing.effectiveDate)})`,
          lines: [
            {
              label: "Base Rent",
              value: formatCents(continuing.baseRentCents),
              style: "line",
            },
            ...continuing.newEstimates.map(
              (estimate): StatementRentLine => ({
                label: capitalized(estimate.letterName),
                value: formatCents(estimate.amountCents),
                style: "line",
              }),
            ),
            ...continuing.fixedCharges.map(
              (charge): StatementRentLine => ({
                label: charge.name,
                value: formatCents(charge.amountCents),
                style: "line",
              }),
            ),
            {
              label: "Total Monthly Rent",
              value: formatCents(continuing.newMonthlyRentCents),
              style: "total",
            },
            ...balanceLines,
          ],
        }
      : { heading: null, effective: null, lines: balanceLines },
  };
}

const UNSAFE_FILE_CHARACTERS = /[\\/:*?"<>|]+/g;

export function statementFileName(
  year: number,
  businessName: string,
  unitLabel: string,
): string {
  const name = `${year} Reconciliation ${businessName} ${unitLabel}`
    .replace(UNSAFE_FILE_CHARACTERS, "-")
    .replace(/\s+/g, " ")
    .trim();
  return `${name}.pdf`;
}
