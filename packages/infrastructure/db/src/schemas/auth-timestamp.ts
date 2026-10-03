import { sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

function toDriverTimestamp(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

const authTimestampType = customType<{
  data: Date | string;
  driverData: string;
}>({
  dataType() {
    return "timestamp";
  },
  toDriver(value) {
    return toDriverTimestamp(value);
  },
  fromDriver(value) {
    return value;
  },
});

export function authTimestamp(name: string) {
  return authTimestampType(name);
}

export function authTimestampNow(name: string) {
  return authTimestampType(name).default(sql`now()`);
}
