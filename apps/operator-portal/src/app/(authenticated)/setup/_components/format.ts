export function formatSqft(sqft: number): string {
  return sqft.toLocaleString("en-US");
}

export function formatShare(shareBps: number): string {
  const whole = Math.floor(shareBps / 100);
  const fraction = String(shareBps % 100).padStart(2, "0");
  return `${whole}.${fraction}%`;
}
