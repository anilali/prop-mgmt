export function roundDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new Error("denominator must be above 0");
  }
  const sign = numerator < 0n ? -1n : 1n;
  const abs = numerator * sign;
  return sign * ((2n * abs + denominator) / (2n * denominator));
}

function assertSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${field} must be a safe integer`);
  }
}

export function prorate(
  amountCents: number,
  multipliers: readonly number[],
  divisors: readonly number[],
): number {
  assertSafeInteger(amountCents, "amountCents");
  let numerator = BigInt(amountCents);
  for (const multiplier of multipliers) {
    assertSafeInteger(multiplier, "multiplier");
    numerator *= BigInt(multiplier);
  }
  let denominator = 1n;
  for (const divisor of divisors) {
    assertSafeInteger(divisor, "divisor");
    if (divisor <= 0) {
      throw new Error("divisor must be above 0");
    }
    denominator *= BigInt(divisor);
  }
  const result = Number(roundDiv(numerator, denominator));
  if (!Number.isSafeInteger(result)) {
    throw new Error("prorate result is not a safe integer");
  }
  return result;
}

const AMOUNT_PATTERN =
  /^([-+])?\s*\$?\s*([-+])?\s*(?:(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{0,2}))?|\.(\d{1,2}))\s*(-)?$/;

export function parseCents(text: string): number {
  let rest = text.trim();
  let parenthesized = false;
  if (rest.startsWith("(") && rest.endsWith(")")) {
    parenthesized = true;
    rest = rest.slice(1, -1).trim();
  }
  const match = AMOUNT_PATTERN.exec(rest);
  if (!match) {
    throw new Error(`Not an amount: ${text}`);
  }
  const [
    ,
    leadingSign,
    dollarSign,
    whole,
    fraction,
    fractionOnly,
    trailingMinus,
  ] = match;
  const signs = [
    parenthesized ? "-" : undefined,
    leadingSign,
    dollarSign,
    trailingMinus,
  ].filter((sign) => sign !== undefined);
  if (signs.length > 1) {
    throw new Error(`Not an amount: ${text}`);
  }
  const negative = signs[0] === "-";
  const dollars = BigInt((whole ?? "0").replace(/,/g, ""));
  const cents = BigInt((fraction ?? fractionOnly ?? "").padEnd(2, "0"));
  const total = Number(dollars * 100n + cents);
  if (!Number.isSafeInteger(total)) {
    throw new Error(`Amount is too large: ${text}`);
  }
  if (total === 0) return 0;
  return negative ? -total : total;
}

export function formatCents(cents: number): string {
  assertSafeInteger(cents, "cents");
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const remainder = (abs % 100).toString().padStart(2, "0");
  return `${cents < 0 ? "-" : ""}$${dollars}.${remainder}`;
}
