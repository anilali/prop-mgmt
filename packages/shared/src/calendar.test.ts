import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  dateInMonth,
  dayOfMonth,
  firstDay,
  isIsoDate,
  lastDay,
  maxDate,
  monthOf,
  monthsFromTo,
  todayIn,
} from "./calendar";

describe("isIsoDate", () => {
  it("accepts real dates", () => {
    expect(isIsoDate("2026-01-05")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
  });

  it("rejects malformed and impossible dates", () => {
    expect(isIsoDate("2026-1-5")).toBe(false);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2025-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-00-10")).toBe(false);
    expect(isIsoDate("2026-01-05T00:00:00Z")).toBe(false);
  });
});

describe("month ends", () => {
  it("returns the last day of each month", () => {
    expect(lastDay("2026-01")).toBe("2026-01-31");
    expect(lastDay("2026-04")).toBe("2026-04-30");
    expect(lastDay("2026-12")).toBe("2026-12-31");
  });

  it("handles leap years", () => {
    expect(lastDay("2024-02")).toBe("2024-02-29");
    expect(lastDay("2026-02")).toBe("2026-02-28");
    expect(lastDay("2000-02")).toBe("2000-02-29");
    expect(lastDay("1900-02")).toBe("1900-02-28");
  });

  it("returns the first day of a month", () => {
    expect(firstDay("2026-03")).toBe("2026-03-01");
  });
});

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-03-08", 0)).toBe("2026-03-08");
  });
});

describe("months", () => {
  it("gets the month of a date", () => {
    expect(monthOf("2026-07-15")).toBe("2026-07");
  });

  it("adds months across years", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-06", 0)).toBe("2026-06");
    expect(addMonths("2026-06", -18)).toBe("2024-12");
  });

  it("lists months inclusively", () => {
    expect(monthsFromTo("2025-11", "2026-02")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(monthsFromTo("2026-02", "2026-02")).toEqual(["2026-02"]);
    expect(monthsFromTo("2026-03", "2026-02")).toEqual([]);
  });

  it("builds a date in a month", () => {
    expect(dateInMonth("2026-02", 5)).toBe("2026-02-05");
    expect(dateInMonth("2024-02", 29)).toBe("2024-02-29");
    expect(() => dateInMonth("2026-02", 29)).toThrow();
    expect(dayOfMonth("2026-02-15")).toBe(15);
  });
});

describe("maxDate", () => {
  it("returns the later date", () => {
    expect(maxDate("2026-02-01", "2026-02-15")).toBe("2026-02-15");
    expect(maxDate("2026-03-01", "2026-02-15")).toBe("2026-03-01");
  });
});

describe("todayIn", () => {
  it("returns the date in each time zone around midnight", () => {
    const beforeChicagoMidnight = new Date("2026-01-01T05:59:59Z");
    const afterChicagoMidnight = new Date("2026-01-01T06:00:00Z");

    expect(todayIn("America/Chicago", beforeChicagoMidnight)).toBe(
      "2025-12-31",
    );
    expect(todayIn("America/Chicago", afterChicagoMidnight)).toBe("2026-01-01");
    expect(todayIn("America/Los_Angeles", afterChicagoMidnight)).toBe(
      "2025-12-31",
    );
    expect(
      todayIn("America/Los_Angeles", new Date("2026-01-01T08:00:00Z")),
    ).toBe("2026-01-01");
  });

  it("follows daylight saving time", () => {
    expect(todayIn("America/Chicago", new Date("2026-07-01T04:59:59Z"))).toBe(
      "2026-06-30",
    );
    expect(todayIn("America/Chicago", new Date("2026-07-01T05:00:00Z"))).toBe(
      "2026-07-01",
    );
  });
});
