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

export interface StatementCostLine {
  name: string;
  actual: string;
  perYear: string;
  perMonth: string;
  billNote: string | null;
}

export interface StatementTable {
  columns: string[];
  rows: string[][];
  total: string;
}

export interface StatementRentLine {
  label: string;
  value: string;
  total: boolean;
}

export interface StatementDocument {
  heading: string[];
  areas: string[];
  costLines: StatementCostLine[];
  table: StatementTable;
  rentBlock: { heading: string | null; lines: StatementRentLine[] };
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
    "",
    "SQ.FT LEASED",
    `${data.year} ACTUALS`,
    "TENANT'S PRO-RATA SHARE",
    ...(showMonths ? ["MONTHS"] : []),
    "TENANT'S ANNUAL SHARE",
    `ESTIMATES BILLED IN ${data.year}`,
    "BALANCE DUE",
  ];
}

export function statementDocument(data: StatementData): StatementDocument {
  const showMonths = data.rows.some((row) => row.months < 12);
  const priorBalanceLabel =
    data.priorBalanceAsOf < `${data.year}-12-31`
      ? `Rent Balance as of ${longDate(data.priorBalanceAsOf)}`
      : "Rent Balance";
  const balanceLines: StatementRentLine[] = [
    {
      label: priorBalanceLabel,
      value: formatCents(data.priorBalanceCents),
      total: false,
    },
    {
      label: "Balance on Account",
      value: formatAccounting(data.balanceOnAccountCents),
      total: true,
    },
  ];
  const continuing = data.continuing;

  return {
    heading: [
      data.property.name,
      `${data.year} EXPENSE RECONCILIATION`,
      data.tenant.businessName,
      streetWithSuite(data.unit.address),
      cityLine(data.unit.address),
    ].filter((line) => line.trim() !== ""),
    areas: [
      `BUILDING AREA: ${formatSqft(data.buildingSqft)} Sq. Ft`,
      ...data.otherPoolAreas.map(
        (area) =>
          `${area.name.toUpperCase()} SERVICE AREA: ${formatSqft(area.sqft)} Sq. Ft`,
      ),
      `SQ.FT LEASED: ${formatSqft(data.unit.sqft)}`,
    ],
    costLines: data.rows.map((row) => ({
      name: row.name,
      actual: formatCents(row.actualCents),
      perYear: `${formatCents(costPerSqftYearCents(row.actualCents, row.poolSqft))} psf/year`,
      perMonth: `${formatHundredthsOfCent(costPerSqftMonthHundredths(row.actualCents, row.poolSqft))} psf/month`,
      billNote: row.billOverride
        ? `Bill amount: ${row.billOverride.note}`
        : null,
    })),
    table: {
      columns: statementColumns(data),
      rows: data.rows.map((row) => [
        row.name,
        formatSqft(data.unit.sqft),
        formatCents(row.actualCents),
        formatPercentBps(shareBps(data.unit.sqft, row.poolSqft)),
        ...(showMonths ? [String(row.months)] : []),
        formatCents(row.partCents),
        formatCents(row.estimatesCents),
        formatCents(row.balanceCents),
      ]),
      total: formatCents(data.trueUpCents),
    },
    rentBlock: continuing
      ? {
          heading: `REVISED MONTHLY RENT (Effective ${longDate(continuing.effectiveDate)})`,
          lines: [
            {
              label: "Base Rent",
              value: formatCents(continuing.baseRentCents),
              total: false,
            },
            ...continuing.newEstimates.map((estimate) => ({
              label: estimate.name,
              value: formatCents(estimate.amountCents),
              total: false,
            })),
            {
              label: "Total Monthly Rent",
              value: formatCents(continuing.newMonthlyRentCents),
              total: true,
            },
            ...balanceLines,
          ],
        }
      : { heading: null, lines: balanceLines },
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
