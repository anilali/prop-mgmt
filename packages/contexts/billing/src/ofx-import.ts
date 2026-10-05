import type { IsoDate } from "@moonship/shared";
import { isIsoDate } from "@moonship/shared";

import type { CsvRowOutcome } from "./csv-import";
import type { ImportFormat } from "./types";
import { readAmount } from "./csv-import";
import { descriptionKey } from "./suggestions";

export interface OfxStatement {
  accountLast4: string | null;
  startOn: IsoDate | null;
  endOn: IsoDate | null;
  ledgerBalance: { amountCents: number; asOf: IsoDate | null } | null;
  outcomes: CsvRowOutcome[];
}

const GENERIC_NAMES = new Set([
  "check",
  "credit",
  "debit",
  "deposit",
  "payment",
  "transfer",
  "withdrawal",
]);

const SINGLE_BYTE_CHARSETS = new Set([
  "windows-1252",
  "cp1252",
  "iso-8859-1",
  "latin1",
  "us-ascii",
]);

function withoutBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

export function detectImportFormat(text: string): ImportFormat {
  return /^\s*OFXHEADER\s*:/i.test(withoutBom(text)) || /<OFX>/i.test(text)
    ? "ofx"
    : "csv";
}

export function fileCharset(head: string): "utf-8" | "windows-1252" {
  const text = withoutBom(head).trimStart();
  if (/^OFXHEADER\s*:/i.test(text)) {
    const header = text.split("<")[0] ?? "";
    const encoding = /ENCODING\s*:\s*([A-Z0-9-]+)/i
      .exec(header)?.[1]
      ?.toUpperCase();
    return encoding === "UTF-8" || encoding === "UNICODE"
      ? "utf-8"
      : "windows-1252";
  }
  const declared = /^<\?xml[^>]*\bencoding\s*=\s*["']([^"']+)["']/i
    .exec(text)?.[1]
    ?.toLowerCase();
  return declared && SINGLE_BYTE_CHARSETS.has(declared)
    ? "windows-1252"
    : "utf-8";
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, name: string) => {
      if (name.startsWith("#")) {
        const code =
          name[1] === "x" || name[1] === "X"
            ? Number.parseInt(name.slice(2), 16)
            : Number.parseInt(name.slice(1), 10);
        return code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : entity;
      }
      return ENTITIES[name.toLowerCase()] ?? entity;
    },
  );
}

function sections(text: string, tag: string, endTags: string[] = []): string[] {
  const ends = [`<\\/${tag}>`, ...endTags].join("|");
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)(?=${ends}|$)`, "gi");
  return [...text.matchAll(pattern)].map((match) => match[1] ?? "");
}

function leaf(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(block);
  return match ? decodeEntities(match[1] ?? "").trim() : null;
}

function ofxDate(text: string | null): IsoDate | null {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(text ?? "");
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  return isIsoDate(date) ? date : null;
}

function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim().toUpperCase();
}

function isTruncationOf(name: string, memo: string): boolean {
  const short = squash(name).replace(/[\s*]+$/, "");
  const full = squash(memo);
  if (short === "" || short.length > full.length) return false;
  for (let index = 0; index < short.length; index += 1) {
    if (short[index] !== "*" && short[index] !== full[index]) return false;
  }
  return true;
}

function isGeneric(name: string, type: string): boolean {
  const key = descriptionKey(name);
  return key === "" || key === descriptionKey(type) || GENERIC_NAMES.has(key);
}

function describeTransaction(fields: {
  type: string;
  name: string;
  memo: string;
  checkNumber: string;
}): string {
  const { type, name, memo, checkNumber } = fields;
  const base =
    memo !== "" && (isGeneric(name, type) || isTruncationOf(name, memo))
      ? memo
      : name || memo || type;
  if (checkNumber === "") return base;
  return base.split(/[^0-9A-Za-z]+/).includes(checkNumber)
    ? base
    : `${base} #${checkNumber}`;
}

function readTransaction(block: string, rowNumber: number): CsvRowOutcome {
  const posted = leaf(block, "DTPOSTED") ?? "";
  const type = leaf(block, "TRNTYPE") ?? "";
  const amountText = leaf(block, "TRNAMT") ?? "";
  const fitId = leaf(block, "FITID") ?? "";
  const name = leaf(block, "NAME") ?? "";
  const memo = leaf(block, "MEMO") ?? "";
  const checkNumber = leaf(block, "CHECKNUM") ?? "";
  const cells = [posted, type, amountText, fitId, name, memo, checkNumber];
  const error = (message: string): CsvRowOutcome => ({
    kind: "error",
    rowNumber,
    cells,
    message,
  });

  const postedOn = ofxDate(posted);
  if (postedOn === null) {
    return error(
      posted === "" ? "The date is blank" : `"${posted}" is not an OFX date`,
    );
  }
  const amount = readAmount(amountText);
  if (amount.kind !== "ok") {
    return error(
      amount.kind === "blank" ? "The amount is blank" : amount.message,
    );
  }
  if (fitId === "") return error("The bank's transaction id (FITID) is blank");

  const description = describeTransaction({ type, name, memo, checkNumber });
  return {
    kind: "transaction",
    rowNumber,
    cells,
    postedOn,
    description,
    descriptionKey: descriptionKey(description),
    amountCents: amount.cents,
    externalId: fitId,
  };
}

function accountLast4(statements: string[]): string | null {
  const ids = new Set(
    statements.flatMap((statement) =>
      ["BANKACCTFROM", "CCACCTFROM"]
        .flatMap((tag) => sections(statement, tag))
        .flatMap((from) => {
          const id = leaf(from, "ACCTID");
          return id ? [id] : [];
        }),
    ),
  );
  if (ids.size > 1) {
    throw new Error(
      "The file has more than one bank account. Download one account at a time.",
    );
  }
  const [id] = [...ids];
  const digits = (id ?? "").replace(/\D/g, "");
  return digits === "" ? null : digits.slice(-4);
}

function ledgerBalance(statements: string[]): OfxStatement["ledgerBalance"] {
  const [block] = statements.flatMap((statement) =>
    sections(statement, "LEDGERBAL"),
  );
  if (block === undefined) return null;
  const amount = readAmount(leaf(block, "BALAMT") ?? "");
  if (amount.kind !== "ok") return null;
  return { amountCents: amount.cents, asOf: ofxDate(leaf(block, "DTASOF")) };
}

export function parseOfx(text: string): OfxStatement {
  const start = text.search(/<OFX>/i);
  if (start === -1) {
    throw new Error("The file is not a QuickBooks (QBO) or OFX file");
  }
  const body = text.slice(start);
  const statements = [
    ...sections(body, "STMTRS"),
    ...sections(body, "CCSTMTRS"),
  ];
  if (statements.length === 0) {
    throw new Error("The file has no bank statement");
  }
  const lists = statements.flatMap((statement) =>
    sections(statement, "BANKTRANLIST"),
  );
  const blocks = lists.flatMap((list) =>
    sections(list, "STMTTRN", ["<STMTTRN>"]),
  );
  return {
    accountLast4: accountLast4(statements),
    startOn: ofxDate(lists.map((list) => leaf(list, "DTSTART"))[0] ?? null),
    endOn: ofxDate(lists.map((list) => leaf(list, "DTEND")).at(-1) ?? null),
    ledgerBalance: ledgerBalance(statements),
    outcomes: blocks.map((block, index) => readTransaction(block, index + 1)),
  };
}
