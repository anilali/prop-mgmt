import type { IsoDate } from "@moonship/shared";
import { isIsoDate, todayIn } from "@moonship/shared";

export function today(
  property: { timeZone: string },
  now: Date = new Date(),
): IsoDate {
  const override = process.env.TODAY_OVERRIDE;
  if (override && process.env.VERCEL_ENV !== "production") {
    if (!isIsoDate(override)) {
      throw new Error("TODAY_OVERRIDE must be a YYYY-MM-DD date");
    }
    return override;
  }
  return todayIn(property.timeZone, now);
}
